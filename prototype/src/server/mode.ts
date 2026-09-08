// Persistence mode resolution with no database imports, so the root layout
// (a server component) can read it without pulling the driver into its graph.

export type PersistenceMode = "postgres" | "file" | "local";

export function resolvePersistenceMode(env: NodeJS.ProcessEnv = process.env): PersistenceMode {
  const explicit = (env.OEH_PERSISTENCE ?? "").trim().toLowerCase();
  if (explicit === "postgres" || explicit === "file" || explicit === "local") return explicit;
  return env.DATABASE_URL ? "postgres" : "file";
}
