#!/usr/bin/env node
// Disposable PostgreSQL 18 cluster for Gate A development and tests.
//
//   node scripts/disposable-postgres.mjs start   → initdb (trust auth, loopback only), start, create db, print DATABASE_URL
//   node scripts/disposable-postgres.mjs stop    → stop and remove the cluster
//   node scripts/disposable-postgres.mjs url     → print the DATABASE_URL of a running cluster
//
// No Windows service, no password, no network exposure beyond 127.0.0.1. The
// cluster lives under .oeh-pg/ (gitignored). Mirrors the CPQ repository's
// scripts/run_disposable_postgres_tests.py discipline.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const ROOT = process.cwd();
const CLUSTER = path.join(ROOT, ".oeh-pg");
const DATA = path.join(CLUSTER, "data");
const INFO = path.join(CLUSTER, "connection.json");
const LOG = path.join(CLUSTER, "postgres.log");
const DB = "oeh";
const USER = "oeh_cluster_admin";

function binDir() {
  const candidates = [
    process.env.PGBIN,
    path.join(process.env.LOCALAPPDATA ?? "", "RotechTools", "PostgreSQL", "18", "bin"),
    "C:\\Program Files\\PostgreSQL\\18\\bin"
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "initdb.exe")) || existsSync(path.join(dir, "initdb"))) return dir;
  }
  throw new Error("PostgreSQL 18 binaries not found (set PGBIN)");
}

function exe(dir, name) {
  const win = path.join(dir, `${name}.exe`);
  return existsSync(win) ? win : path.join(dir, name);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { stdio: "inherit", windowsHide: true, ...opts });
  if (result.status !== 0) throw new Error(`${path.basename(cmd)} ${args.join(" ")} failed (${result.status})`);
}

// pg_ctl hands the server process our stdio; if that is a pipe held by a
// calling tool, the caller never sees EOF. The server logs to LOG anyway.
function runDetached(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "ignore", windowsHide: true });
  if (result.status !== 0) throw new Error(`${path.basename(cmd)} ${args.join(" ")} failed (${result.status}); see ${LOG}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function connectionInfo() {
  if (!existsSync(INFO)) return null;
  return JSON.parse(readFileSync(INFO, "utf8"));
}

async function start() {
  const existing = connectionInfo();
  const dir = binDir();
  if (existing) {
    const status = spawnSync(exe(dir, "pg_ctl"), ["-D", DATA, "status"], { stdio: "pipe" });
    if (status.status === 0) {
      console.log(`DATABASE_URL=${existing.url}`);
      return;
    }
    rmSync(CLUSTER, { recursive: true, force: true });
  }
  mkdirSync(CLUSTER, { recursive: true });
  const port = await freePort();
  run(exe(dir, "initdb"), ["-D", DATA, "--username", USER, "--encoding", "UTF8", "--auth-local", "trust", "--auth-host", "trust", "--no-sync"]);
  runDetached(exe(dir, "pg_ctl"), ["-D", DATA, "-l", LOG, "-o", `-h 127.0.0.1 -p ${port} -c max_connections=30`, "-w", "-t", "30", "start"]);
  run(exe(dir, "createdb"), ["--host", "127.0.0.1", "--port", String(port), "--username", USER, DB]);
  const url = `postgresql://${USER}@127.0.0.1:${port}/${DB}`;
  writeFileSync(INFO, JSON.stringify({ url, port, dataDir: DATA, startedAt: new Date().toISOString() }, null, 2));
  console.log(`DATABASE_URL=${url}`);
}

function stop() {
  const dir = binDir();
  if (existsSync(DATA)) {
    spawnSync(exe(dir, "pg_ctl"), ["-D", DATA, "-m", "fast", "-w", "stop"], { stdio: "inherit" });
  }
  rmSync(CLUSTER, { recursive: true, force: true });
  console.log("disposable cluster removed");
}

function url() {
  const info = connectionInfo();
  if (!info) {
    console.error("no disposable cluster; run: node scripts/disposable-postgres.mjs start");
    process.exit(1);
  }
  console.log(info.url);
}

const command = process.argv[2];
if (command === "start") await start();
else if (command === "stop") stop();
else if (command === "url") url();
else {
  console.error("usage: disposable-postgres.mjs start|stop|url");
  process.exit(2);
}
