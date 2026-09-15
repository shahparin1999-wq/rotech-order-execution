# Sites Feasibility Gate — 2026-09-14

## Decision

**Hosting migration: STOPPED at the Sites feasibility gate.** The smallest
integration was proven locally against a disposable UAT PostgreSQL server and
the OEH server APIs, but the hosted private Site could not be proven to safely
reach the required authenticated OEH API, immutable blob storage, and parser
worker pattern. The OEH architecture is therefore preserved and the UX
overhaul continues in the existing OEH frontend.

No production identity, production inventory, production database, external
staging endpoint, or deployment was used.

## Lineage and Site registration

- Reviewed Gate A baseline: `82d7c811734355f5df9f63f2a9c243afec12e733`
- Implementation branch: `codex/sites-inventory-20260914`
- Implementation worktree: `C:\Users\parin\worktrees\rotech-sites-inventory-20260914`
- Site project: `Rotech Order Hub`
- Site project ID: `appgprj_6aa87fb2f0c48191b8a7e52d254297bb`
- Site visibility: private; no hosted version or live URL was published

The implementation worktree was created directly from the reviewed Gate A
state. Persistence, command handling, idempotency, and optimistic concurrency
were reused rather than recreated.

## Gate evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Private Site registration | PASS | Private Site project created; not published |
| Hosted Site identity → OEH authorization | NOT PROVEN | No supported hosted Site-to-OEH identity bridge was configured; local UAT identity mapping passed |
| Identity chain | PASS (local UAT) | `e-tom` → `UAT-007` → Mississauga → Shipping → `inventory.receive`, `inventory.putAway` |
| Site/API call path | PASS (local UAT) | OEH API responded on the local Next server; hosted staging endpoint was not configured |
| PostgreSQL Order read | PASS (local UAT) | `GET /api/oeh/v1/orders/SAMPLE1001` returned HTTP 200, version 1 |
| Harmless idempotent command | PASS (local UAT) | First probe returned HTTP 200/version 2/replayed false; retry returned HTTP 200/version 2/replayed true |
| Second-session persistence | PASS (local UAT) | A fresh session read version 2 after the probe |
| Upload intent | PASS (local UAT) | Upload intent returned an immutable file contract |
| Immutable file storage | PASS (local UAT) | Content-addressed UAT blob hash: `3c35cffcd2a3c6fc98667dcc23102c09fdce9e101ccd40b2f153460dc9f9aab3` |
| Parser job and review result | PASS (local UAT) | Structured CSV produced a completed ParseRun, 7 ParsedFields, source rows/confidence, and a draft shipment |
| Scanned PDF/JPG/PNG OCR | BLOCKED | OCR adapter is not configured; the parser returns an explicit human-review-required failure |
| Hosted Site runtime/API/blob/worker pattern | BLOCKED / NOT PROVEN | Current OEH app is a Next.js Node server; no compatible hosted Sites backend/worker bridge was available for this proof |

## Implemented boundary

The Site remains a UI surface only. Orders, Units, inventory movements, QC,
evidence, documents, parsing records, and audit commands remain authoritative
in OEH. Client-supplied actor IDs are ignored for inventory commands; the OEH
boundary resolves trusted identity and maps job role/facility scope to
capabilities.

The local UAT proof used a disposable PostgreSQL instance and a content-
addressed filesystem blob adapter. Production Azure Blob, hosted identity,
OCR, and queue/worker adapters remain explicit configuration requirements;
they were not replaced with browser logic or silent fallbacks.

## Follow-up required before hosting migration

1. Provide a supported private Sites authentication and server-to-OEH
   authentication design that resolves to an OEH user, Rotech employee,
   facility scope, role, and capabilities.
2. Provide a supported hosted bridge for OEH API calls, immutable blob storage,
   and asynchronous parser workers.
3. Repeat this gate with sanitized staging data, backup/recovery evidence, and
   explicit owner approval before publishing or loading real data.
