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
| `2ea8e2b` | docs: cross-system status summary |
| `c0eb5de` | complete handshake: line types, full ZIP bundle, PO idempotency, real 26CPQ0003 fixture |

Implemented + tested (`npm run verify` green: **153 unit, build, 90 e2e**):

- `ExecutionPackageV1` schema + pure validation; accepts `schemaVersion` `"1.0"` and `"1.1"`.
- **Checksum = canonical SHA-256** (recursive key sort, arrays preserved, compact UTF-8),
  lowercase hex. Parity-verified with Node + Python `hashlib` **on CPQ's real exports**
  (fixture `68f106c7…` and a fresh export `b7d1b02b…`). Tampered packages rejected.
- **Required `lineType`** (`"pump"` / `"pump-package"`); spare/unsupported types rejected
  fail-closed (never turned into Units).
- `versions.configurationRulesVersion` is **optional** (never fabricated).
- **v1.1 per-line classified notes** → seeds `ManufacturingNote`s for the 5 actionable
  classes; `Provenance` stays read-only in the frozen snapshot; notes on a `1.0` package
  are rejected.
- Import creates 1 Order → N first-class `OrderLine`s → `line.quantity` isolated Units,
  one **immutable `ConfigurationSnapshot`** per line (deep-cloned; edits to the source can
  never mutate it). Unit isolation + append-only audit preserved.
- **Full ZIP transfer bundle import:** reads `execution-package.json` +
  `customer-po/<file>` + `transfer-manifest.json`; verifies **both** file SHA-256 hashes and
  byte sizes, cross-checks `manifest.packageId == package.packageId`, verifies the package's
  canonical checksum, and stores the PO as an Order attachment (metadata + hash only, never
  raw bytes).
- **Idempotency** key `(quoteId, revisionId, acceptedPoSubmissionId)`: rejects a 2nd import
  of the same revision fail-closed, even under a different order number.
- Three-layer Lines view (Configuration / Manufacturing notes / Approved changes / BOM /
  Documents / As built); CPQ config read-only with a frozen checksum label.

Fixtures: `cpq-execution-package-v1.json` is fictional scaffolding; `cpq-handshake-bundle.zip`
is CPQ's **real sanitized** inner transfer bundle for `26CPQ0003`.

## 2. CPQ (Codex) — all gates done at the manual-export stop

- **Phase 1 discovery** (`codex/OrderProcessing` @ `6095515`): findings all accurate vs this
  side — no native line quantity; no customer-confirm / PO-accept lifecycle; unsafe generic
  attachments; no configuration-rules provenance; admin-entered PO ≠ customer submission.
- **Baseline gate** (`codex/OrderProcessing-phase2` @ `b111e28`): merge of `6095515` +
  `aaf2e77`, clean, original branch untouched.
- **Lifecycle gate:** dedicated `orderProcessing` state machine, immutable `PoSubmission`
  versions, in-lock re-checks, customer/auditor accept+export denied before quote lookup,
  auditor read-only + download, `SUPERSEDED`-not-deleted, partial-award block, `501`
  publication stop.
- **Publication gate** (finalized, @ `f75e275`; one doc uncommitted): adapter →
  `ExecutionPackageV1`, canonical SHA-256, ZIP envelope + manifest, immutable publication
  records, manual export only. **No auto-export** (publisher reached only from the
  authenticated `POST …/export` "Create Manufacturing ZIP" button + tests; no scheduler /
  hook / queue / Teams / Work Order API / retry).
- Validation: focused lifecycle/publication/award 47, document typecheck, 69 document, 42
  frontend; full Python 377 run / 375 passed (2 pre-existing failures from missing
  `Terms_Conditions.pdf`, unrelated).

## 3. Locked owner decisions (both sides aligned)

1. Baseline: `origin/integration/cpq-current-baseline` (`aaf2e77`). **[done]**
2. Line quantity: first-class **required** positive integer, frozen per revision. **[done]**
3. Admin authority: `rotech_quote_admin` + `rotech_system_admin` for review/accept/export. **[done]**
4. Auditors: read-only history + PO/file **download**; **no** review/accept/export. **[done]**
5. Partial awards: **block** when `awardedQuantity` ≠ frozen quoted quantity. **[done]**
6. PO transfer: **ZIP envelope**; `acceptedPoSubmissionId` in `transfer-manifest`, not the JSON. **[done]**
7. Config-rules version: **optional** on this side; CPQ omits when unavailable. **[done]**
8. Document manifest version: optional for milestone 1.
9. Notes: **ExecutionPackage v1.1** optional classified per-line notes. **[both sides ready]**
10. Checksum: **canonical SHA-256** both sides. **[done]**
11. Already-imported-after-revision: no automation; fail closed; reviewed supersession later.
12. Customer name: frozen header name cross-checked against `company_id`. **[done]**

PO file policy: **PDF only, max 25 MB**; reject executables/scripts/archives/macros/MIME
mismatches/empty/traversal; store SHA-256; no external scanning.

## 4. Idempotency key

`(sourceSystem="CPQ", source.quoteId, source.revisionId, acceptedPoSubmissionId)` —
enforced on this side, fail-closed. A newly accepted PO for the same revision is rejected
pending a reviewed supersession (not automated).

## 5. Fresh-export parity evidence (independent re-verification, 2026-07-21)

A fresh CPQ export (`Q-CPQ-FRESH-FINAL`, package `cfd52daa…`, publication `f5357e41…`, PO
`POSUB-1752B77FA0A54EAAA42ABE2C65851963`) was re-verified on this side:

- `sha256(CPQ's canonical checksum input)` = `b7d1b02b561a8a88a98cb68d585b2a76dcd8f7ecb6c76a0b4c292ab0976418d2` = CPQ's declared package checksum. ✅
- **Our canonicalization reproduces CPQ's canonical string byte-for-byte** — the algorithms
  agree, not just one hash. Confirmed across two different exports.

## 6. Status: milestone complete at the manual-export stop

- **Work Order (this side):** `prototype/cpq-import-contract` @ `c0eb5de`; 153 unit + 90 e2e green.
- **CPQ (Codex):** all gates finalized @ `f75e275`; manual export only, no auto-export.
- Neither side merged to `main`/production. Deferred (both sides, not built): spare lines as
  a non-Unit type; real config-rules / doc-manifest provenance; reviewed supersession of an
  already-imported revision.
