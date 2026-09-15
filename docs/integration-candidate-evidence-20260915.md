# Rotech Order Hub Sites + Inventory Integration Candidate Evidence — 2026-09-15

## Candidate identity

- Worktree: `C:\Users\parin\worktrees\rotech-sites-inventory-20260914`
- Branch: `codex/sites-inventory-20260914`
- Gate A base: `82d7c811734355f5df9f63f2a9c243afec12e733`
- Implementation commit: `bd955ce644c2e8dedf9d2e3a5925d0f9d8bd165b`
- Remote: `origin/codex/sites-inventory-20260914`
- Remote SHA verified: `bd955ce644c2e8dedf9d2e3a5925d0f9d8bd165b`
- Worktree status: clean after push
- No force push, merge, publish, or production deployment was performed

Lineage review found no newer reviewed Gate A-containing local branch or remote
ref. The implementation was created from Gate A and reused its shared
repository, PostgreSQL/file adapters, command path, idempotency, optimistic
concurrency, and migrations.

## Validation record

| Layer | Result | Evidence |
| --- | --- | --- |
| Typecheck | PASS | `npm run typecheck` |
| Lint | PASS | `npm run lint` |
| Unit/domain | PASS | 559 passed, 1 intentional skip; 43 files |
| Repository/API | PASS | Repository and persistence tests included; server API/browser suite 4/4 |
| Browser | PASS | 104 passed across desktop and tablet projects |
| Server-backed browser | PASS | 4 passed: identity gate, upload replay, shipment workflow, Gate A Qty-5 workflow |
| Build | PASS | `NEXT_PUBLIC_OEH_UAT_MODE=1 npm run build` |
| Diff check | PASS | `git diff --check` and staged diff check |

## Required workflow gates

- Opening balance: PASS — confirmation creates audited `Adjusted` movements and retains import batch, source file ID/hash, source row, approver, approval time, and reason.
- Shipment parse/review: PASS — immutable upload blob, backend parser, `ParseRun`, `ParsedField`, draft review/edit, confirmation, immutable superseding revision, and same-key upload replay.
- Receive/quarantine: PASS — receipt movement enters quarantine; expected and received quantities remain separate.
- Inspection: PASS — only quarantined material can receive an inspection decision; accepted/rejected state is movement-derived.
- Put-away: PASS — unknown and cross-facility locations are rejected; put-away is a movement.
- Direct issue to Unit: PASS — accepted material can issue directly to a same-facility active Unit without put-away.
- Unit isolation: PASS — the existing Qty-5 vertical slice and focused domain/browser coverage keep material, evidence, serial, QC, and work state on the selected Unit.
- Persistence reload: PASS — server-backed state survives a full reload and a fresh browser context; the upload replay returns the original file and ParseRun IDs.
- Authorization: PASS — trusted Site/UAT identity maps to OEH user, Rotech employee, facility scope, role, and capabilities; anonymous shared-state reads and unauthorized inventory commands fail closed; server derives actor identity and ignores client actor IDs.

## Sites feasibility boundary

- Site registered: YES — private project `Rotech Order Hub`, project ID `appgprj_6aa87fb2f0c48191b8a7e52d254297bb`.
- Site published: NO.
- Hosted Site identity: NOT PROVEN.
- Hosted Site → OEH API: NOT PROVEN.
- Hosted blob storage: NOT PROVEN.
- Hosted parser/worker: NOT PROVEN.
- Local UAT feasibility proof: PASS — disposable PostgreSQL/API path read sanitized Order `SAMPLE1001`, executed an idempotent probe, replayed it safely, and a second session observed the persisted version. Upload produced content-addressed blob hash `3c35cffcd2a3c6fc98667dcc23102c09fdce9e101ccd40b2f153460dc9f9aab3`; the parser produced a completed ParseRun, ParsedFields with source/confidence metadata, and a reviewable draft.
- Scanned PDF/JPG/PNG OCR: BLOCKED — the UAT parser returns an explicit human-review-required result because no OCR adapter is configured.

The Site remains a UI surface. OEH remains authoritative for Orders, Units,
inventory movements, QC, evidence, documents, ParseRuns, parsed fields, audit,
and commands. The hosting migration is stopped at the Sites feasibility gate;
the validated OEH frontend candidate is preserved.

## Data and deployment boundary

- Sanitized/UAT data only.
- Real inventory used: NO.
- Production modified: NO.
- Production identity, production database, production blob storage, external
  staging services, and hosted Site deployment were not used.
