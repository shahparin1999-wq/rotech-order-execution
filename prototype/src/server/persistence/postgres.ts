// PostgreSQL adapter for the Gate A repository.
//
// Every commit runs in one transaction: lock the metadata row, verify the
// expected state version, apply the record diff, bump the version, append the
// command. Two concurrent writers cannot both succeed against the same base.

import { Pool, type PoolClient } from "pg";
import type { AppState } from "@/domain/types";
import { assembleState, diffStates, type PersistedRecord, type CollectionName } from "../collections";
import { SESSION_DEFAULT_USER, type CommandRecord, type CommitInput, type CommitResult, type PersistedSnapshot, type StateRepository } from "../repository";

export const STORAGE_SCHEMA_VERSION = 1;

// Kept in sync with migrations/0001_gate_a_foundation.sql (embedded so the
// bundled server never depends on a file path at runtime).
export const MIGRATION_0001 = `
CREATE TABLE IF NOT EXISTS oeh_meta (
  id              integer PRIMARY KEY CHECK (id = 1),
  state_version   bigint NOT NULL,
  schema_version  integer NOT NULL,
  scalars         jsonb NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oeh_records (
  collection      text NOT NULL,
  id              text NOT NULL,
  seq             integer NOT NULL,
  payload         jsonb NOT NULL,
  state_version   bigint NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS oeh_records_collection_seq_idx ON oeh_records (collection, seq);
CREATE INDEX IF NOT EXISTS oeh_records_order_idx ON oeh_records ((payload ->> 'orderNumber'));
CREATE INDEX IF NOT EXISTS oeh_records_unit_idx ON oeh_records ((payload ->> 'unitId'));
CREATE TABLE IF NOT EXISTS oeh_commands (
  idempotency_key text PRIMARY KEY,
  actor_id        text NOT NULL,
  action_type     text NOT NULL,
  action_hash     text NOT NULL,
  result_version  bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
`;

export class PostgresStateRepository implements StateRepository {
  readonly kind = "postgres" as const;
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 8 });
  }

  async init(seed: () => AppState): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(MIGRATION_0001);
      const meta = await client.query("SELECT state_version FROM oeh_meta WHERE id = 1 FOR UPDATE");
      if (meta.rowCount === 0) {
        await this.writeWhole(client, seed(), 1);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async writeWhole(client: PoolClient, state: AppState, version: number): Promise<void> {
    await client.query("DELETE FROM oeh_records");
    await client.query("DELETE FROM oeh_commands");
    const diff = diffStates(null, state);
    await this.applyUpserts(client, diff.upserts, version);
    await client.query(
      `INSERT INTO oeh_meta (id, state_version, schema_version, scalars, updated_at)
       VALUES (1, $1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE SET state_version = EXCLUDED.state_version, schema_version = EXCLUDED.schema_version,
         scalars = EXCLUDED.scalars, updated_at = now()`,
      [version, STORAGE_SCHEMA_VERSION, JSON.stringify(diff.scalars)]
    );
  }

  private async applyUpserts(client: PoolClient, upserts: PersistedRecord[], version: number): Promise<void> {
    const CHUNK = 200;
    for (let i = 0; i < upserts.length; i += CHUNK) {
      const chunk = upserts.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const rows = chunk.map((r, j) => {
        const base = j * 5;
        values.push(r.collection, r.id, r.seq, JSON.stringify(r.payload), version);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5})`;
      });
      await client.query(
        `INSERT INTO oeh_records (collection, id, seq, payload, state_version)
         VALUES ${rows.join(", ")}
         ON CONFLICT (collection, id) DO UPDATE SET seq = EXCLUDED.seq, payload = EXCLUDED.payload,
           state_version = EXCLUDED.state_version, updated_at = now()`,
        values
      );
    }
  }

  async load(): Promise<PersistedSnapshot> {
    const meta = await this.pool.query("SELECT state_version, scalars FROM oeh_meta WHERE id = 1");
    if (meta.rowCount === 0) throw new Error("State storage is not initialized");
    const rows = await this.pool.query("SELECT collection, id, seq, payload FROM oeh_records ORDER BY collection, seq");
    const records: PersistedRecord[] = rows.rows.map((r) => ({
      collection: r.collection as CollectionName,
      id: r.id as string,
      seq: Number(r.seq),
      payload: r.payload
    }));
    const state = assembleState(records, meta.rows[0].scalars, { currentUserId: SESSION_DEFAULT_USER });
    return { version: Number(meta.rows[0].state_version), state };
  }

  async findCommand(idempotencyKey: string): Promise<CommandRecord | null> {
    const result = await this.pool.query(
      "SELECT idempotency_key, actor_id, action_type, action_hash, result_version, created_at FROM oeh_commands WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    return {
      idempotencyKey: row.idempotency_key,
      actorId: row.actor_id,
      actionType: row.action_type,
      actionHash: row.action_hash,
      resultVersion: Number(row.result_version),
      createdAt: new Date(row.created_at).toISOString()
    };
  }

  async commit(input: CommitInput): Promise<CommitResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const meta = await client.query("SELECT state_version, scalars FROM oeh_meta WHERE id = 1 FOR UPDATE");
      if (meta.rowCount === 0) throw new Error("State storage is not initialized");
      const current = Number(meta.rows[0].state_version);
      if (current !== input.expectedVersion) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "version-conflict", version: current };
      }
      const nextVersion = current + 1;
      const diff = diffStates(input.prev, input.next);
      await this.applyUpserts(client, diff.upserts, nextVersion);
      if (diff.deletes.length > 0) {
        const values: unknown[] = [];
        const tuples = diff.deletes.map((d, j) => {
          values.push(d.collection, d.id);
          return `($${j * 2 + 1}, $${j * 2 + 2})`;
        });
        await client.query(`DELETE FROM oeh_records WHERE (collection, id) IN (${tuples.join(", ")})`, values);
      }
      const scalars = { ...(meta.rows[0].scalars as Record<string, unknown>), ...diff.scalars };
      await client.query("UPDATE oeh_meta SET state_version = $1, scalars = $2, updated_at = now() WHERE id = 1", [
        nextVersion,
        JSON.stringify(scalars)
      ]);
      await client.query(
        "INSERT INTO oeh_commands (idempotency_key, actor_id, action_type, action_hash, result_version, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [input.command.idempotencyKey, input.command.actorId, input.command.actionType, input.command.actionHash, nextVersion, input.command.createdAt]
      );
      await client.query("COMMIT");
      return { ok: true, version: nextVersion };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async reset(state: AppState): Promise<PersistedSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const meta = await client.query("SELECT state_version FROM oeh_meta WHERE id = 1 FOR UPDATE");
      const version = meta.rowCount === 0 ? 1 : Number(meta.rows[0].state_version) + 1;
      await this.writeWhole(client, state, version);
      await client.query("COMMIT");
      return { version, state };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
