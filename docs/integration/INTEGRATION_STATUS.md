# CPQ ↔ Work Order Integration — Status

As of 2026-07-21. Two repos, manual file handoff (no live API yet).

> **End-to-end handshake proven.** CPQ's Publication-gate ZIP bundle for
> `26CPQ0003` was imported by the Work Order System: transfer envelope verified
> (both file hashes + sizes), canonical SHA-256 checksum reproduced byte-for-byte
> (`68f106c7…`), `lineType` pump/pump-package accepted, quantities 2 + 1 → **3
> isolated Units**, accepted PO stored as provenance, and idempotency enforced.

- **Work Order System** (this repo): `C:\...\Rotech Work Order System`
- **CPQ** (Codex): `C:\...\New project` (+ a sibling worktree for Phase 2)

Companion docs: [CPQ_EXECUTION_CONTRACT.md](CPQ_EXECUTION_CONTRACT.md),
[CPQ_EXPORT_ONBOARDING.md](CPQ_EXPORT_ONBOARDING.md),
[CPQ_OUTPUT_QUESTIONNAIRE.md](CPQ_OUTPUT_QUESTIONNAIRE.md).

## 1. Work Order System (this side) — done, pushed, `main` untouched

Branch `prototype/cpq-import-contract` (off `prototype/fluent-work-management`).

| Commit | Summary |
| --- | --- |
| `bb8fa4b` | CPQ execution-package import (contract + manual JSON, first slice) |
| `83f289b` | docs: CPQ export onboarding plan + output questionnaire |
| `1c763b7` | align CPQ import to handshake decisions (SHA-256, v1.1, ZIP, notes) |
| _(next)_ | line types (pump/pump-package, fail-closed), full-bundle import, packageId + hashes verification, acceptedPoSubmissionId idempotency, real 26CPQ0003 handshake fixture |

Implemented + tested (`npm run verify` green: **145 unit, build, 89 e2e**):

- `ExecutionPackageV1` schema + pure validation; accepts `schemaVersion` `"1.0"` and `"1.1"`.
- **Checksum = canonical SHA-256** (recursive key sort, arrays preserved, compact UTF-8),
  lowercase hex. Parity-verified with Node + Python `hashlib`. Tampered packages rejected.
- `versions.configurationRulesVersion` is **optional** (never fabricated).
- **v1.1 per-line classified notes** → seeds `ManufacturingNote`s for the 5 actionable
  classes; `Provenance` stays read-only in the frozen snapshot; notes on a `1.0` package
  are rejected.
- Import creates 1 Order → N first-class `OrderLine`s → `line.quantity` isolated Units,
  one **immutable `ConfigurationSnapshot`** per line (deep-cloned; edits to the source can
  never mutate it). Unit isolation + append-only audit preserved.
- **Transfer envelope (ZIP):** reads `execution-package.json` + `customer-po/<file>` +
  `transfer-manifest.json`; verifies SHA-256 of package **and** PO against the manifest;
  stores the PO as an Order attachment (metadata + hash only, never raw bytes).
- **Source-tuple idempotency:** rejects a 2nd import of the same `(quoteId, revisionId)`,
  fail-closed, even under a different order number.
- Three-layer Lines view (Configuration / Manufacturing notes / Approved changes / BOM /
  Documents / As built); CPQ config read-only with a frozen checksum label.

`prototype/sample-data/cpq-execution-package-v1.json` is **fictional test scaffolding
only** — not evidence that CPQ fields exist.

## 2. CPQ (Codex) — Phase 1 done; Baseline gate done; Lifecycle gate next

- **Phase 1 discovery:** branch `codex/OrderProcessing` @ `6095515` (report only; worktree
  dirty). Key findings (all accurate vs this side): no native line quantity; no
  customer-confirm / PO-accept lifecycle; generic attachments unsafe for POs; no
  configuration-rules provenance; `award.customerPoNumber` is admin-entered, not a customer
  submission.
- **Baseline gate** (decision #1): branch `codex/OrderProcessing-phase2` @ `b111e28`, merge
  of approved `6095515` + `aaf2e77`, clean worktree, original branch untouched. Green:
  79 Python + 9 ANSI-1196 + `node --check` + document typecheck + 69 document tests.
- **Next:** Lifecycle gate (state machine, immutable `PoSubmission`, customer/admin
  boundary), then Publication gate (adapter → `ExecutionPackage`, canonical SHA-256, ZIP
  publication, idempotency).

## 3. Locked owner decisions (both sides aligned)

1. Baseline: `origin/integration/cpq-current-baseline` (`aaf2e77`). **[done]**
2. Line quantity: first-class **required** positive integer, frozen per revision. **[CPQ todo]**
3. Admin authority: `rotech_quote_admin` + `rotech_system_admin` for review/accept/export.
4. Auditors: read-only history + PO/file **download**; **no** review/accept/export.
5. Partial awards: **block** when `awardedQuantity` ≠ frozen quoted quantity.
6. PO transfer: **ZIP envelope**; `acceptedPoSubmissionId` in `transfer-manifest`, not the JSON.
7. Config-rules version: **optional** on this side; CPQ omits when unavailable.
8. Document manifest version: optional for milestone 1.
9. Notes: **ExecutionPackage v1.1** optional classified per-line notes.
10. Checksum: **canonical SHA-256** both sides. **[done this side]**
11. Already-imported-after-revision: no automation; fail closed; reviewed supersession later.
12. Customer name: frozen header name cross-checked against `company_id`.

PO file policy: **PDF only, max 25 MB**; reject executables/scripts/archives/macros/MIME
mismatches/empty/traversal; store SHA-256; no external scanning.

## 4. Idempotency key

- Target: `(sourceSystem="CPQ", source.quoteId, source.revisionId, acceptedPoSubmissionId)`.
- Temporary (until the envelope carries the submission id end-to-end):
  `(CPQ, quoteId, revisionId)` — already enforced on this side, fail-closed.

## 5. Open / next

- **CPQ:** proceed to Lifecycle gate; add first-class line quantity; hand over the
  **partial native sample now** (frozen `26CPQ0003` / `QVER-210D3107FB6D` snapshot, minus
  quantity/PO) so this side can validate config/BOM/product mapping in parallel.
- The **full two-line handshake fixture** waits until CPQ has quantity + PO lifecycle.
- Neither side has merged to its `main`/production branch.
