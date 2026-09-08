# Gate A — shared persistence and the Qty-5 vertical slice

Status: **implemented on the frozen baseline; local disposable PostgreSQL verified; not deployed.**

## Freeze

| Item | Value |
| --- | --- |
| Frozen baseline | `a47f66014b4c37b79b3cd2a5845bc33925978e2a` on `prototype/1196-standard-execution` (aligned with `origin`) |
| Work branch / worktree | `codex/oeh-gate-a-vertical-slice-20260907` at `C:\Users\parin\worktrees\oeh-gate-a-vertical-slice-20260907` |
| CPQ counterpart | `8812b0e4d5b38a7440421e378bcdadba0e6cfb22`, work branch `codex/cpq-order-handoff-v2-20260907` |
| Fixture | `prototype/sample-data/cpq-order-handoff-v2-qty5.{zip,json}` — produced by the CPQ repository's real lifecycle (see `docs/integration/CPQ_ORDER_HANDOFF_V2_GATE.md` in the CPQ repo) |

## The milestone this slice proves

One real Qty-5 CPQ order (26CPQ0005 rev 0, 1196 3X4-13 MTR DI/316SS, Rotech
cartridge seal, hydrotest, trimmed impeller) that:

1. imports into the Work Order System as Rotech sales order `26SO01234` with an
   immutable internal order id and the CPQ quote/revision as provenance;
2. creates five isolated Units `26SO01234_1.1 … 1.5`;
3. generates per-Unit material demand from the frozen **configuration**
   (casing, impeller, stuffing-box cover, shaft kit, power frame, seal, plus a
   hydrotest per Unit) — never from CPQ's browser BOM rows;
4. shows a real shortage and holds each Unit's assembly task for material;
5. records a vendor PO **reference** (AIMCOR issues the PO) with an expected
   date, turning the shortage into "on order" and, past the date, "late PO";
6. receives a heat-tracked casing against that PO line, inspects and puts it
   away, issues and installs it into Unit 1.4 only;
7. captures the as-built heat number on 1.4, and once every component is
   installed releases 1.4's assembly task automatically;
8. captures a nameplate serial, a photo and a QC response on 1.4;
9. leaves 1.1, 1.2, 1.3 and 1.5 untouched (no parts, no serial, no photo, no
   response, still held for material; 1.5's casing still on order);
10. does all of it against shared server state (PostgreSQL or the JSON file
    adapter) that survives a page reload and a second browser.

## What was built

### Domain (pure, unchanged discipline)

| Module | Purpose |
| --- | --- |
| `src/domain/reducer.ts` | The one pure reducer (`applyAction`) shared by the browser and the server. |
| `src/domain/ledger/fromHandoff.ts` | CPQ v2 line → `ExecutionRequirement`s from configuration blocks; selection modes decide purchase / customer-supplied receipt / nothing. |
| `src/domain/ledger/requirementFlow.ts` | Forward-only requirement advance (Unplanned → Planned → InProgress → Satisfied), fulfilment helpers, the material gate. |
| `src/domain/purchasing/poReference.ts`, `src/domain/purchasingActions.ts` | Vendor PO **reference** with append-only expected-date history; received/pending derived from receipts; `OnOrder` availability; late-PO attention. |
| `src/domain/unitActions.ts` | Serial assignment (globally unique, never reused, audited correction). |
| `src/domain/inventoryActions.ts` | Receipt → open Receipt fulfilment; inspection → Complete/Rejected; install → as-built `ComponentUsage` (heat/lot/serial), requirement Satisfied, material gate release. |
| `src/domain/inventory/availability.ts`, `issue.ts`, `ledger/attention.ts` | Items booked to another open requirement or already consumed are not candidates; issue matches component **role** before specification and refuses a known role with no open requirement; `LatePurchase` attention. |
| `Order.id` | Immutable internal identity; `orderNumber` is the visible Rotech SO; `cpqReference` is provenance. |

### Persistence (Gate A)

| Piece | Purpose |
| --- | --- |
| `src/server/collections.ts` | Every AppState array is a keyed collection; diff/assemble with positions; session-only fields never stored. |
| `src/server/persistence/postgres.ts` + `migrations/0001_gate_a_foundation.sql` | `oeh_meta` (optimistic state version, scalars), `oeh_records` (collection, id, seq, JSONB payload), `oeh_commands` (idempotency key, actor, action hash, result version). Commit = one transaction with `FOR UPDATE` on the meta row. |
| `src/server/persistence/file.ts` | Same contract on a JSON file (development without a database). |
| `src/server/commands.ts` | `executeCommand`: idempotent replay / conflicting payload rejection (D-021), stale version → 409 with current state, domain rejection → 422 with nothing persisted, session-local actions refused. |
| `src/app/api/{state,commands,admin/reset,health}/route.ts` | The command API. |
| `src/store/StoreProvider.tsx` | `server` mode (optimistic apply → POST command → adopt authoritative state; 409 refreshes) and the original `local` mode. Mode is resolved per request in `layout.tsx`. |
| `scripts/disposable-postgres.mjs` | `npm run db:up / db:url / db:down`: PostgreSQL 18 cluster on loopback, trust auth, no service, under `.oeh-pg/`. |

### UI (minimum for the scenario)

* Import drawer: accepts v1 or v2 (JSON or ZIP), previews per-Unit demand by
  disposition, asks for the Rotech SO number and committed date.
* Order workspace: **Material and purchasing** section (derived rows: required /
  in stock / on order with expected date / short), "Reference vendor PO" modal,
  open PO lines with received/pending and audited expected-date changes,
  `Late PO` attention, CPQ provenance in the header.
* Inventory intake: receive against a referenced PO line (pre-fills part, role,
  tracking policy and the demand to confirm).
* Unit workspace: serial assignment when pending; parts sheet shows the as-built
  match with heat/lot; assembly task released automatically.
* Home: open vendor PO lines and late count. Shell banner shows shared-state
  mode, repository and version.

## Running it

```
cd prototype
npm run db:up                      # prints DATABASE_URL (disposable PostgreSQL 18, loopback, no password)
set DATABASE_URL=postgresql://oeh_cluster_admin@127.0.0.1:<port>/oeh
npm run build && npm run start     # or: npm run dev
```

Open http://localhost:3100 → Orders → New work order → Import CPQ package →
`sample-data/cpq-order-handoff-v2-qty5.zip` → enter the Rotech SO number →
Confirm import → follow the scenario above. `POST /api/admin/reset` reloads the
sample data (development only). Without `DATABASE_URL` the file adapter keeps
state in `.oeh-data/state.json`; `OEH_PERSISTENCE=local` restores the
browser-only mode used by the isolated e2e suite.

## Verification

| Suite | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | clean |
| `npm test` (vitest) | all domain, store and server suites, including `tests/domain/vertical-slice-qty5.test.ts` (the milestone on the real fixture), `tests/domain/ledger/from-handoff.test.ts`, `tests/domain/purchasing.test.ts`, `tests/server/repository.test.ts` |
| `OEH_TEST_DATABASE_URL=<disposable> vitest tests/server/repository.test.ts` | repository contract on real PostgreSQL 18: seed, commit, replay, idempotency conflict, version conflict, domain rejection, reset |
| `npm run test:e2e` | the pre-existing 104 browser tests, unchanged, in browser-only mode |
| `npm run test:e2e:server` | the milestone scenario through the UI against server persistence (file adapter; PostgreSQL when `DATABASE_URL` is set) |

Run that closed this gate (2026-09-08, this worktree): typecheck, lint and
build clean; vitest 42 files, 549 passed / 1 skipped; repository contract
16 passed on PostgreSQL 18.4 (disposable cluster); `test:e2e:server` 1 passed
on the file adapter and 1 passed on PostgreSQL (database afterwards: state
version 14, 535 records, 10 commands); legacy `test:e2e` 104 passed.

## Decisions recorded

See `docs/DECISIONS.md` D-029 – D-033 (Gate A storage shape, Rotech SO as the
visible number with an immutable internal id, browser BOM non-authoritative,
vendor PO reference boundary, pre-cutover ordering: supersession → partial
shipment → Internal Jobs → AI inquiry).

## Known gaps, in the order they should be closed

1. **Reviewed supersession** of an imported revision (a changed payload for the
   same revision is refused fail-closed today).
2. **Partial shipment / fulfilment content** (loose line-level scope still
   creates no requirements; `PalletRecord` is not a `Shipment`).
3. **Internal Jobs** (module exists, unwired).
4. Typed per-collection tables and real identity (Entra) before any
   multi-facility rollout; the generic record table is a foundation, not the
   final schema.
5. Only after the above: AI inquiry over `orderFacts`.
