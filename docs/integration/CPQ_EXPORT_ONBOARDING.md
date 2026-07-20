# CPQ Export Onboarding Plan

How to get a **won CPQ order** exported and imported into the Work Order System,
starting from the CPQ's own structure rather than forcing it onto ours.

Companion documents:
- [CPQ_EXECUTION_CONTRACT.md](CPQ_EXECUTION_CONTRACT.md) — the target schema
  (`ExecutionPackageV1`), ownership boundaries, and field-mapping table.
- [CPQ_OUTPUT_QUESTIONNAIRE.md](CPQ_OUTPUT_QUESTIONNAIRE.md) — the one-page
  intake to hand directly to the CPQ tool/owner.

## Guiding principle

**Discover the CPQ's native output first, then adapt.** We do not ask the CPQ
to blindly emit our schema. We collect one real export, map it, and put a thin
**adapter** between the CPQ's native shape and our frozen `ExecutionPackageV1`,
so the two evolve independently.

## Track A — Discovery (how the CPQ is actually structured)

Collect these five artifacts. This is the "let the CPQ tell us" step; the
questionnaire drives it.

1. **One raw export of a real "won" order**, in the CPQ's native format
   (JSON/XML/CSV/API response) — unreshaped. Ideally a 2-line, mixed-quantity
   1196 order.
2. **A field dictionary** — for every field: name, type, always-present?,
   meaning. Include the backend/internal/admin notes that should become
   visible on the commercial side.
3. **The CPQ's own object model / schema** — OpenAPI, JSON schema, export
   template, or DB diagram — however it models Quote → Revision → Line →
   Configuration → BOM → Documents.
4. **Emission mechanism** — the realistic way it can hand us data. Milestone 1
   needs only a **file it can produce** (manual "export won order" download is
   fine); a live API comes later.
5. **Stable identifiers** — quote id, revision id, per-line id, and whether a
   customer PO field exists.

**Deliverable:** a "CPQ output profile" = the raw sample + the field
dictionary. That single sample drives everything downstream.

## Track B — Mapping (CPQ native → our contract)

6. Place the raw CPQ sample next to the contract's field-mapping table
   (CPQ_EXECUTION_CONTRACT.md §9) and mark each row: **direct match / rename /
   transform / missing**.
7. For each **missing** field decide with the CPQ owner: (a) present under
   another name, (b) addable to the export, or (c) genuinely not in the CPQ →
   stays Production-owned (e.g. manufacturing due date, as-built). Never invent
   a meaning; label unknowns explicitly.
8. Choose the **integration seam**:

   | Approach | CPQ sends | Mapping lives | Trade-off |
   | --- | --- | --- | --- |
   | **Adapter (recommended)** | Native JSON, unchanged | A `cpqAdapters/native→ExecutionPackageV1` transform we own | CPQ team does almost nothing; we absorb their shape; versionable per CPQ release |
   | CPQ conforms | Exactly `ExecutionPackageV1` | In the CPQ exporter | More CPQ work; brittle when their model differs |

   The adapter keeps the CPQ's internal structure and our frozen contract
   decoupled.

## Track C — Produce & verify (the handshake loop)

9. CPQ emits **one sample file**; we run it (via the adapter) through the
   existing `validateExecutionPackage` (schema + checksum). Failures come back
   as a concrete field-level list — the feedback the CPQ iterates against.
10. Add a **checksum** on the CPQ/adapter side so tampering or partial exports
    are caught; the importer already verifies it.
11. Iterate until the sample imports cleanly into a Work Order with the correct
    Lines/Units, then lock it as the reference sample (replacing the fictional
    `prototype/sample-data/cpq-execution-package-v1.json`).

## Track D — Expose CPQ backend/internal notes commercially

12. Map CPQ admin/internal notes to either the frozen snapshot (read-only
    provenance) or, when actionable on the shop floor, seed them as
    `ManufacturingNote`s at import. Decide per note category in Track B step 7.

## What unblocks the next step

- The **one raw CPQ export sample + its field list** (Track A #1–2).
- A pointer to the CPQ tool's schema/docs, if any (Track A #3).

With a real sample in hand, the next deliverable is the adapter + an updated
mapping table, proven to import end-to-end under the same `npm run verify` gate.

## Explicitly not in this onboarding

Live CPQ API, bidirectional sync, automatic revision updates, direct CPQ DB
access, pricing/AIMCOR sync. Those follow only after the manual file import is
proven correct.
