// JSON-file adapter for the Gate A repository — development and tests without
// a database. Same contract, same versioning, same command log; one process,
// serialized writes, atomic rename on save.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppState } from "@/domain/types";
import { assembleState, diffStates, type PersistedRecord } from "../collections";
import { SESSION_DEFAULT_USER, type CommandRecord, type CommitInput, type CommitResult, type PersistedSnapshot, type StateRepository } from "../repository";

interface FileEnvelope {
  storageSchemaVersion: number;
  version: number;
  scalars: Record<string, unknown>;
  records: PersistedRecord[];
  commands: CommandRecord[];
}

export class FileStateRepository implements StateRepository {
  readonly kind = "file" as const;
  private queue: Promise<unknown> = Promise.resolve();
  private cache: FileEnvelope | null = null;

  constructor(private readonly filePath: string) {}

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<FileEnvelope | null> {
    if (this.cache) return this.cache;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      this.cache = JSON.parse(raw) as FileEnvelope;
      return this.cache;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  private async write(envelope: FileEnvelope): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(envelope), "utf8");
    await fs.rename(tmp, this.filePath);
    this.cache = envelope;
  }

  private envelopeFor(state: AppState, version: number, commands: CommandRecord[]): FileEnvelope {
    const diff = diffStates(null, state);
    return {
      storageSchemaVersion: 1,
      version,
      scalars: diff.scalars as Record<string, unknown>,
      records: diff.upserts,
      commands
    };
  }

  init(seed: () => AppState): Promise<void> {
    return this.serialize(async () => {
      const existing = await this.read();
      if (!existing) await this.write(this.envelopeFor(seed(), 1, []));
    });
  }

  load(): Promise<PersistedSnapshot> {
    return this.serialize(async () => {
      const envelope = await this.read();
      if (!envelope) throw new Error("State storage is not initialized");
      return {
        version: envelope.version,
        state: assembleState(envelope.records, envelope.scalars, { currentUserId: SESSION_DEFAULT_USER })
      };
    });
  }

  findCommand(idempotencyKey: string): Promise<CommandRecord | null> {
    return this.serialize(async () => {
      const envelope = await this.read();
      return envelope?.commands.find((c) => c.idempotencyKey === idempotencyKey) ?? null;
    });
  }

  commit(input: CommitInput): Promise<CommitResult> {
    return this.serialize(async () => {
      const envelope = await this.read();
      if (!envelope) throw new Error("State storage is not initialized");
      if (envelope.version !== input.expectedVersion) {
        return { ok: false, reason: "version-conflict", version: envelope.version };
      }
      const nextVersion = envelope.version + 1;
      // The file adapter rewrites the whole envelope, but the diff is still
      // computed so an id collision or a bad record fails here exactly as it
      // would in PostgreSQL.
      diffStates(input.prev, input.next);
      const next = this.envelopeFor(input.next, nextVersion, [
        ...envelope.commands,
        { ...input.command, resultVersion: nextVersion }
      ]);
      await this.write(next);
      return { ok: true, version: nextVersion };
    });
  }

  reset(state: AppState): Promise<PersistedSnapshot> {
    return this.serialize(async () => {
      const existing = await this.read();
      const version = (existing?.version ?? 0) + 1;
      await this.write(this.envelopeFor(state, version, []));
      return { version, state };
    });
  }

  async close(): Promise<void> {
    this.cache = null;
  }
}
