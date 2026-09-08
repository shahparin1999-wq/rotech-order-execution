// Process-wide repository selection.
//
//   OEH_PERSISTENCE=postgres  + DATABASE_URL   → PostgreSQL (Gate A target)
//   OEH_PERSISTENCE=file      [+ OEH_STATE_FILE]→ JSON file (dev without a DB)
//   OEH_PERSISTENCE=local                       → browser-only; API routes 503
//
// When unset: PostgreSQL if DATABASE_URL is present, otherwise file.

import path from "node:path";
import { buildInitialState } from "@/domain/fixtures";
import { resolvePersistenceMode } from "./mode";
import { FileStateRepository } from "./persistence/file";
import { PostgresStateRepository } from "./persistence/postgres";
import type { StateRepository } from "./repository";

export { resolvePersistenceMode, type PersistenceMode } from "./mode";

type Holder = { repo: StateRepository | null; ready: Promise<StateRepository> | null };
const globalHolder = globalThis as unknown as { __oehRepository?: Holder };
const holder: Holder = globalHolder.__oehRepository ?? { repo: null, ready: null };
globalHolder.__oehRepository = holder;

export function createRepository(env: NodeJS.ProcessEnv = process.env): StateRepository {
  const mode = resolvePersistenceMode(env);
  if (mode === "local") throw new Error("Server persistence is disabled (OEH_PERSISTENCE=local)");
  if (mode === "postgres") {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required for OEH_PERSISTENCE=postgres");
    return new PostgresStateRepository(env.DATABASE_URL);
  }
  const file = env.OEH_STATE_FILE ?? path.join(process.cwd(), ".oeh-data", "state.json");
  return new FileStateRepository(file);
}

/** Lazily initialised singleton (survives Next.js dev hot reloads). */
export function getRepository(): Promise<StateRepository> {
  if (!holder.ready) {
    holder.ready = (async () => {
      const repo = createRepository();
      await repo.init(buildInitialState);
      holder.repo = repo;
      return repo;
    })();
    holder.ready.catch(() => {
      holder.ready = null;
    });
  }
  return holder.ready;
}

export function resetAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.OEH_ALLOW_RESET === "1" || env.NODE_ENV !== "production";
}
