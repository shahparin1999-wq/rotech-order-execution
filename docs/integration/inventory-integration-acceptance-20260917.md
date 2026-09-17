# Rotech OEH Sites + Inventory Integration Acceptance — 2026-09-17

## Scope and lineage

- Implementation worktree: `C:\Users\parin\worktrees\rotech-sites-inventory-20260914`
- Branch: `codex/sites-inventory-20260914`
- Reviewed Gate A source SHA: `82d7c811734355f5df9f63f2a9c243afec12e733`
- Validated implementation source SHA: `66ac736fe293161b880dec9345ce33acdf2db93e`
- Feature remote at validation: `origin/codex/sites-inventory-20260914` at `66ac736fe293161b880dec9345ce33acdf2db93e`
- Integration target: `origin/main` at `8bb960aa7923e4a7699f28d5c4d28107fdba2722`
- Merge base: `a47f66014b4c37b79b3cd2a5845bc33925978e2a`
- Merge simulation: clean; no conflict markers
- No merge, publish, production deployment, or real-data operation was performed

The implementation reuses the Gate A shared persistence, PostgreSQL/file
adapters, command path, idempotency, optimistic concurrency, migrations, and
server-backed tests. No persistence or command architecture was recreated.

## Environment gate

| Check | Result | Evidence |
| --- | --- | --- |
| Worktree create/write/delete | PASS | Exact disposable write probe succeeded |
| Node | PASS | `v24.14.1`; child-process probe passed |
| npm | PASS | `11.11.0` |
| Vitest | PASS | `vitest/2.1.9` |
| Playwright | PASS | `1.50.1` |
| Test-results write | PASS | Exact disposable write probe succeeded |
| Documentation write | PASS | Exact disposable write probe succeeded |
| Git fetch | PASS | `git fetch --all --prune` |
| Remote read | PASS | `git ls-remote --heads origin` |

The PostgreSQL/API checks used a disposable loopback PostgreSQL 18 UAT
cluster. The cluster was stopped and removed after validation.

## Fresh validation

| Layer | Result | Command/result |
| --- | --- | --- |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint` |
| Unit/domain/repository | PASS | `npm test -- --run`: 43 files, 566 tests passed |
| Build | PASS | `NEXT_PUBLIC_OEH_UAT_MODE=1 npm run build` |
| Browser regression | PASS | `npm run test:e2e -- --workers=1`: 104/104 |
| Server-backed browser | PASS | `npm run test:e2e:server -- --workers=1`: 4/4 |
| Focused inventory server flow | PASS | upload/review/edit/confirm/receive/inspect/stock: 1/1 |
| Diff check | PASS | `git diff --check`; merge-tree simulation had no conflict markers |

The first server-suite attempt was invalidated by a local development-server
probe overwriting the production build. The dev server was stopped, the build
was regenerated, and the complete server suite was rerun successfully.

## Fresh server-backed UAT acceptance

The one-shot acceptance probe was executed against PostgreSQL-backed production
mode on a local disposable server, then removed. It passed 1/1 and covered:

- authenticated UAT identity resolution to OEH user, Rotech employee, facility,
  role, and capabilities;
- one sanitized Order read and shared persisted state across reload/session;
- opening-balance confirmation as audited `Adjusted` movements with
  `importBatchId`, source file ID/hash, source row, reason, approver, and
  approval time;
- exact idempotency replay for opening-balance confirmation and receipt;
- shipment upload through the OEH API with retained source file/hash,
  `ParseRun`, `ParsedField`, source row, confidence, and reviewable draft;
- draft edit and confirmation; confirmed shipment edit rejected as immutable;
- expected quantity remaining separate from on-hand quantity;
- partial receipt creating received movement and quarantine state;
- inspection, put-away, and stale optimistic-version rejection;
- capability and facility-scope denials at the server boundary;
- separate Mississauga and Houston stock pools with remote availability visible;
- superseding revision after confirmation rather than in-place mutation.

Additional fresh domain coverage passed in the 566-test run:

- accepted material can issue directly to a same-facility Unit without put-away;
- serialized allocation cannot be duplicated across Units;
- Unit isolation and Qty-5 traceability passed in the server-backed Gate A
  workflow and existing browser suite;
- parser confidence/source-row and unsupported OCR review-result behavior passed.

Return movement was not executed in this fresh browser/API acceptance run; the
return command and capability mapping remain present in the implementation and
must be included in the next explicitly approved workflow acceptance.

## Sites boundary

- Private Site project: registered
- Site published: no
- Hosted Site identity: not proven
- Hosted Site to OEH API: not proven
- Hosted blob storage: not proven
- Hosted parser/worker: not proven
- Real data: not used
- Production: untouched

The Site remains a UI surface. OEH remains authoritative for Orders, Units,
inventory movements, QC, evidence, documents, ParseRuns, parsed fields, audit,
and commands. The hosting migration remains stopped at the Sites feasibility
gate until hosted identity and the full private backend/upload/worker pattern
are independently proven.

## Integration and staging disposition

`origin/main` is the integration target because it is the remote default branch
(`origin/HEAD -> origin/main`) and the repository's reviewed merge history uses
main integration commits. Repository instructions require a dedicated feature
branch and normal review rather than direct work on main.

No approved private OEH staging target was found. `prototype/DEPLOYMENT.md` is
explicitly documentation-only and says that no provider, authentication, shared
state, or deployment has been configured. No CI/deployment configuration or
OEH staging URL is present. The proposed single target is recorded in
`docs/integration/oeh-private-staging-target-20260917.md`; it was not provisioned.

## Current disposition

- Feature validation: complete
- Integration preparation: complete
- Integration merge: pending normal authenticated review/approval
- Private staging deployment: not authorized or available
- Sites publication: no

