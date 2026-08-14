# CPQ → Work Order Catalogue Release Contract (v1.0)

Status: **Prototype / proposed.** This document defines how CPQ publishes
**product master data** (option tables) to the Work Order Execution tool.

It is the second of two CPQ→Work Order contracts and covers a different concern
from the first:

| Contract | Carries | Cardinality |
| --- | --- | --- |
| [Order handoff](CPQ_INTERNAL_ORDER_HANDOFF_BLUEPRINT.md) (`rotech-cpq-order-handoff/2.0`) | What **this order** configured | One per accepted order revision |
| **This document** (`rotech-cpq-catalogue-release/1.0`) | What is **configurable at all** — sizes, frames, materials, part-code rules | One per catalogue publication, shared by all orders |

> **Core rule.** Work Order **never authors or transcribes product option
> tables.** Every option a family definition offers must resolve through a
> pinned, checksummed catalogue release. A hand-copied table is a defect, not a
> shortcut.

Related: [AGENTS.md](../../AGENTS.md) invariant 5, [DECISIONS.md](../DECISIONS.md)
(D-1196-000/001, D-1196-004/005/008), [CPQ_EXECUTION_CONTRACT.md](CPQ_EXECUTION_CONTRACT.md).

## 1. Why this contract exists

Work Order previously obtained 1196 option data by an agent reading CPQ's
working directory (`data/ansi-family.seed.json`, `data/cpq-catalog.json`) and
transcribing 31 pump sizes and several part-code tables into TypeScript. Those
values were verified correct at the time, but the **method** is unsound:

- CPQ's working files are mutable and unversioned; a change there silently
  diverges from Work Order with nothing to detect it.
- There is no checksum, so drift is invisible.
- There is no monetary boundary — the working files are full of pricing, and
  the separation depended entirely on the transcriber's care (invariant 5).
- A built Unit could not prove which catalogue state it was configured against.

A published release fixes all four: versioned, checksummed, money-free by
construction, and pinnable.

## 2. Ownership boundaries

| Concern | Owner |
| --- | --- |
| What sizes/frames/materials exist and their part-code rules | **CPQ** |
| Publishing a catalogue release and assigning its version | **CPQ** |
| Which release a family definition is pinned to | **Work Order** |
| Manufacturing routing, quality procedures, documents | **Work Order** |

CPQ remains the only configurator. Work Order consumes and pins; it never
edits catalogue content, and it never invents an option that a release omits.

## 3. Release identity and immutability

Each release carries:

- `catalogueReleaseId` — stable, unique (e.g. `cat-2026-07-A`).
- `schema` — `rotech-cpq-catalogue-release/1.0`.
- `publishedAt`, `publishedBy`.
- `status` — `published` or `provisional` (§7).
- `checksum` — lowercase-hex SHA-256 over the canonical JSON of the whole
  release **excluding `checksum` itself**.
- `sourceEdition` — CPQ's own catalogue/price-list edition label, for traceability.

**Canonicalization is identical to the order handoff** so both sides agree
byte-for-byte: recursively sort object keys, preserve array order, compact
UTF-8 JSON. This reuses `canonicalize` / `sha256Hex` already proven against a
real CPQ bundle.

A published release is **immutable**. Corrections publish a new release; they
never edit an existing one.

## 4. Money is excluded by construction

Invariant 5 applies unchanged. The release is scanned with the same
`findMonetaryLeaks` allowlist used by the order handoff, and **any** monetary
key anywhere rejects the whole release.

This is a real constraint on the CPQ side: `cpq-catalog.json` today interleaves
option data with `baseplatePrice`, `priceByFrameAndShaftType`, `sbcAdders`,
`barePumpPrices` and similar. The publisher must project out the non-monetary
option data rather than exporting those structures wholesale.

## 5. Content

Per family, a release carries only what is needed to *configure and build*:

| Block | Contents |
| --- | --- |
| `pumpSizes[]` | `pumpSize`, `defaultFrame`, `frameOptions[]`, `defaultMoc`, `fullImpellerTrim`, `defaultMotorHp?`, `defaultFlange?`, `flangeOptions[]?` |
| `materialOptions[]` | Family-level upgrade materials |
| `frameSpacing` | Per frame: `dbse`, `pumpShaftDiameter` |
| `shaftTypes[]` | Allowed shaft-kit types |
| `partCodeRules` | Power-frame and shaft-kit part codes by shaft type; component prefixes/material codes |
| `couplingSelection` | Size by HP × RPM × DBSE, plus `maxBoreBySize` |
| `sealSizeByFrame` | Seal size per frame *(see §8 — not currently in CPQ)* |
| `capabilities` | `supportsCompletePackage`, `supportsBaseframe`, `supportsMotor`, `buildType` |

A family block is **self-contained**: a definition pinned to a release must be
resolvable from that release alone, with no lookup into any other source.

## 6. Pinning and validation

Work Order pins a family definition to `{ catalogueReleaseId, checksum }`,
recorded in the definition's **provenance module**. On import Work Order:

1. rejects an unknown `schema`;
2. rejects a `checksum` mismatch (tampering or truncation);
3. rejects any monetary leak, listing every offending path;
4. rejects a family block missing a required table;
5. records the pin so every Unit built under it is traceable to exact
   catalogue state.

Per-order values arriving via the order handoff are **validated against the
pinned release** — an order naming a size the catalogue does not contain is
rejected rather than accepted blind.

Failures are **fail-closed and itemized**: no partial import, no defaulting, no
"nearest match".

## 7. Provisional releases

CPQ has **not yet published a catalogue release**. To let Work Order proceed,
this contract defines a `provisional` status:

- A provisional release is a Work-Order-authored fixture, clearly labelled,
  used only for development.
- It validates identically (schema, checksum, money) so the import path is the
  real one.
- **A family definition pinned to a provisional release is not releasable.**
  Its provenance module carries that blocker and every document rendered from
  it is marked accordingly.

This mirrors how the order handoff was sequenced: contract → sample → real
bundle. Provisional status is removed only by pinning to a genuine CPQ
publication.

## 8. Open items for CPQ

1. **Who publishes, and when** — a catalogue release needs an owner and a
   trigger (price-list edition? schedule? on change?). Worth its own decision
   row alongside the existing Publication gate.
2. **Monetary projection** — CPQ must emit option data separated from pricing
   (§4), which is new work on the CPQ side.
3. **`sealSizeByFrame` is not in CPQ today.** Owner-supplied values are
   STR 1.375 / MTR 1.75 / LTR 2.125 / XLR 2.5. Decide whether CPQ becomes the
   source (preferred, so it stays with the rest of the option data) or whether
   this stays Rotech-side engineering master data outside this contract.
4. **XLR-17 completeness** — `rules.pumpFrameSpacing` in CPQ's working file has
   `XLR-17: { dbse: 5.25, pumpShaftDiameter: 2.375 }`, which would resolve
   D-1196-008. It may only be relied on once carried in a published release.
5. **Coverage** — the first release must cover 1196; subsequent families
   (1196LF, 1796, 1796CC, 1296, 1296LF, SXT/SXU, SCP, 1600, RE500CC) are added
   per the family rollout.
