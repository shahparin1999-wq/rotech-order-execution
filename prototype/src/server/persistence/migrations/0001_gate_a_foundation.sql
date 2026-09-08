-- Gate A foundation (D-025 / D-019): durable, shared execution state.
--
-- One record table keyed by (collection, id) with a JSONB payload and a
-- position, one metadata row carrying the optimistic state version and the
-- id counter, and an append-only command log keyed by idempotency key.
-- Typed columns per collection are a later migration; this one makes the
-- state durable, shared and concurrency-safe without changing the domain.

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
