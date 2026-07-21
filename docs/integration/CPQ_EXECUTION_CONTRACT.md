# CPQ → Order Execution Contract (v1)

Status: **Prototype / proposed.** This document defines the manual JSON import
contract between the CPQ tool (quote configuration + pricing) and this Order
Execution tool (manufacturing). It is contract-first: a **manual JSON package**,
not a live API. Proving the package carries everything Production needs de-risks
any future integration.

> **Core rule.** A CPQ execution package represents one explicitly approved
> quote revision. Once imported, its configuration is frozen and may only be
> replaced through a reviewed superseding snapshot.

Related: [AGENTS.md](../../AGENTS.md) invariants, [DECISIONS.md](../DECISIONS.md)
(D-004, D-005, D-022, D-026), [03 data model](../03-information-architecture-and-states.md).

## 1. Ownership boundaries

| Concern | Owner | Notes |
| --- | --- | --- |
| Quote, revision, pricing, configuration rules | **CPQ** | System of record for commercial configuration. |
| Approving which revision may be built | **CPQ** (commercial) | Only an approved revision may export a package. |
| Order/Line/Unit execution records | **Order Execution** | Created only on confirmed import. |
| Manufacturing notes, adjustments, as-built, evidence, QR identity | **Order Execution** | Layered on top; never written back to CPQ in v1. |
| Frozen configuration snapshot | **Order Execution (custody), CPQ (authorship)** | Immutable copy of the approved CPQ line. |

Order Execution **never edits** the CPQ configuration. Manufacturing intent is
captured as separate `ManufacturingNote` and `ConfigurationAdjustment` records.

## 2. Which revision may be exported

Only a CPQ revision that is **explicitly approved ("won")** may be exported. The
package records `source.quoteId`, `source.quoteNumber`, `source.revisionId`, and
`source.revisionNumber` so the built configuration is always traceable to one
immutable revision.

## 3. Package identity, checksum, and immutability

- Each package has a `packageId`, `publishedAt`, `publishedBy`, and a
  `checksum`.
- **Checksum = lowercase-hex SHA-256** over the canonical JSON of the whole
  payload excluding the checksum field. Canonical = recursively sort object
  keys, preserve array order, compact (no whitespace) UTF-8 JSON. Both sides use
  this exact rule, so `hashlib.sha256(canonical.encode())` (Python) and our
  importer agree byte-for-byte.
- On import the checksum is **recomputed and verified**; a mismatch rejects the
  package (it may have been altered after publishing).
- Each imported line is stored as an **immutable `ConfigurationSnapshot`**
  (deep-cloned payload). Editing the source file after import does not change a
  stored snapshot. This mirrors the released-document immutability invariant.

### Schema versions

- **1.0** — the base contract.
- **1.1** — adds an optional per-line `notes` array of classified manufacturing
  notes: `{ classification, text, source }`, where `classification` is one of
  `ShopInstruction | EngineeringNote | MachiningInstruction | QualityRequirement
  | PackagingInstruction | Provenance`. A package carrying any note MUST declare
  `"1.1"`. On import, the five actionable classifications seed `ManufacturingNote`
  records; `Provenance` notes stay read-only in the frozen snapshot. Only
  explicitly classified notes are exported — never free-form internal/costing/
  diagnostic text, and never hidden in `selectedOptions` or BOM.

### Transfer envelope (PO bytes)

The execution package JSON stays frozen and does **not** carry the PO. A won
order is transferred as a **ZIP bundle**: `execution-package.json` +
`customer-po/<file>` + `transfer-manifest.json`. The manifest
(`envelopeSchemaVersion` `"1.0"`) carries `packageId`, `acceptedPoSubmissionId`,
and a SHA-256 + size for both files. The importer verifies both hashes, stores
the PO as an Order attachment (metadata + hash only; raw bytes are never
persisted), and uses `acceptedPoSubmissionId` for idempotency.

## 4. Quantity → Unit rules

- Only **manufacturing line types** cross the contract: `lineType` must be
  `"pump"` or `"pump-package"`. Spare and any other CPQ line types are excluded
  by the CPQ export and **rejected fail-closed** on import — a non-pump line
  never becomes Units.
- A line's `quantity` creates exactly that many **independent Units** under that
  line (D-005): `Line lineNumber, quantity N → {orderNumber}_{lineNumber}.1 …
  .N`. No shared/aggregate Unit is ever created.
- Units are isolated: evidence, measurements, changes, inspections, and
  documents never leak across siblings.
- Each Unit references exactly one Work Order Line (via `lineNumber`; the line
  carries the `configurationSnapshotId`).

## 5. Order identity on import

The imported Work Order's `orderNumber` is **derived from the quote number**
(e.g. `Q-DEMO-1001` rev 3 → `Q-DEMO-1001-R3`). The revision suffix keeps it
unique and makes a re-import of the same revision collide (rejected as
duplicate). The customer PO is attached alongside; it is not the key. Import
requires explicit confirmation before any execution record is created (D-004).

> **Open decision.** D-026 currently makes orders unique on
> `sourceSystem + orderNumber` with **AIMCOR the only pilot source**. Treating
> **CPQ as a new `sourceSystem`** needs an accepted decision before pilot. In
> this prototype, imported lines carry `sourceSystem: "CPQ"` on the line record.

## 6. Handling future CPQ revisions

A revised CPQ quote does **not** mutate an imported snapshot. It produces a new,
**superseding snapshot** through a reviewed re-import. Bidirectional sync and
automatic revision updates are explicitly out of scope for v1.

## 7. Which manufacturing changes require commercial review

`ConfigurationAdjustment`s whose `configurationPath` touches **material, seal,
motor, or testing** scope default to `commercialReviewRequired: true`. Ordinary
shop/engineering notes (`ManufacturingNote`) never require commercial review and
never modify the CPQ configuration.

## 8. What must never be edited after import

- The `ConfigurationSnapshot.payload` (the frozen CPQ line).
- `source.*` provenance (quote/revision/line ids), `checksum`, `schemaVersion`.
- The Unit set generated from the line's quantity (cancellation is a separate,
  audited action; sequences are never reused).

Audit is append-only; corrections supersede, nothing is overwritten.

## 9. Field mapping (execution field → CPQ source)

| Execution field | CPQ source | Required? | Notes |
| --- | --- | ---: | --- |
| `packageId` | CPQ export | Yes | Stable package identity. |
| `checksum` | CPQ export | Yes | Verified on import. |
| `source.quoteNumber` | Quote header | Yes | Human-readable reference; drives order number. |
| `source.revisionId` / `revisionNumber` | Quote revision | Yes | Immutable source. |
| `customer.customerName` | Quote customer | Yes | CPQ owns commercial customer. |
| `customer.customerPo` | Quote / order | Optional | May be attached at import instead. |
| `lines[].cpqLineId` | Quote line | Yes | Stable line identity. |
| `lines[].lineNumber` | Quote line | Yes | Immutable within order. |
| `lines[].lineType` | Quote line type | Yes | `"pump"` or `"pump-package"` only. Spare/other types are excluded on the CPQ side and **rejected fail-closed** on import (never turned into Units). |
| `lines[].quantity` | Quote line quantity | Yes | Positive integer; creates that many Units. |
| `product.family` / `model` / `pumpSize` / `description` | Configured product | Yes | Template selection / display. |
| `configuration.materialBuild` + casing/impeller/shaft | Configuration selection | Yes (build) | Manufacturing material. |
| `configuration.seal` | Seal configuration | Preferred | Free-form object in v1. |
| `configuration.motor` | Motor configuration | Conditional | May be customer-supplied. |
| `configuration.baseplate` / `coupling` | Configuration | Optional | Free-form object. |
| `configuration.testingRequirements` | Testing selections | Yes (array) | e.g. hydrotest, witness. |
| `configuration.customerSuppliedItems` | Configuration | Yes (array) | May be empty. |
| `configuration.selectedOptions` | Configuration | Yes (array) | Code/description/value. |
| `bom[]` | Configured BOM | Preferred | Descriptive in v1; may lack part numbers. |
| `documents[]` | Document manifest | Optional (V1) | Add once reliable. |
| `versions.configurationRulesVersion` | CPQ rules release | Optional | CPQ has no config-rules provenance today (pricing-rules version is not equivalent); omit when absent, never fabricate. |
| `lines[].notes` (v1.1) | Classified CPQ notes | Optional | Actionable classes seed ManufacturingNotes; Provenance stays read-only. |
| `versions.pricingReleaseId` | Pricing release | Excluded from build use | Present for trace only; **no pricing sync**. |

## 10. Fields the CPQ cannot currently provide (marked, not invented)

- **Manufacturing due date** — not in CPQ; left blank on import and set later in
  the order workspace.
- **Rotech order number / `sourceSystem`** — derived here (§5); CPQ has none.
- **As-built values** — produced during manufacturing; not a CPQ concept.
- **Route / checklist / tolerance instances** — governed by template decisions
  (D-013, still Proposed); not populated from the package.
- **Reliable part numbers on every BOM line** — BOM is descriptive in v1.
- **Pricing** — excluded from the production-facing package by invariant 5
  (`versions.pricingReleaseId` is a trace pointer only).
