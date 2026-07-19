# Overnight Report — Rotech Order Execution vertical-slice prototype

**Date:** 2026-07-19
**Outcome:** Complete. A working, locally runnable, visually reviewable
vertical-slice prototype exists under `prototype/`. All required acceptance
criteria pass. No stop condition was reached.

---

## 1. Repository state

| Item | Value |
| --- | --- |
| Branch | `prototype/overnight-vertical-slice` |
| Base commit | `3e130de` (Merge pull request #1 — architecture-review corrections) |
| Final commit | `8a8a572` |
| Worktree clean | Yes (verified after the final commit) |
| Pushed / merged | **No.** Nothing was pushed, merged, or deployed. `main` is untouched. |
| Planning documents | Unmodified except the additive branch/delivery section in `AGENTS.md` |

### Commits made (local only)

| Commit | Message |
| --- | --- |
| `f67566c` | `chore: add repository agent instructions` |
| `813d4e9` | `prototype: establish interactive application foundation` *(scaffold + domain layer + 26 unit tests)* |
| `df0b4fd` | `prototype: add order and unit execution workspace` *(all screens + 39 browser tests)* |
| `3123506` | `prototype: add shop floor checklist and activity flows` *(tablet/responsive fixes + screenshots)* |
| `a133ef7` | `prototype: add QR labels and quality history preview` *(employee switcher, label polish)* |
| `8152f63` | `docs: add overnight prototype report` |

The six suggested checkpoints were delivered as five coherent, individually
verified slices plus this report; each was committed only after its tests
passed.

---

## 2. Pre-flight checks

All mandatory first steps completed before any edit:

- Read `README.md`, `AGENTS.md`, and all ten documents under `docs/`
  (01–09 plus `DECISIONS.md`). No separate architecture-review report file
  exists; its corrections are already folded into `docs/DECISIONS.md`
  (D-019 – D-026) and the staged gates in document 09.
- Confirmed branch `prototype/overnight-vertical-slice` (not `main`), clean
  worktree, no pre-existing application code, no secrets or production
  credentials required.
- Runtimes: Node **v24.14.1**, npm **11.11.0**, Windows 11, PowerShell.

No blocker was encountered, so work proceeded past the stop-condition gate.

---

## 3. Files and directories created

```
AGENTS.md                    (modified — added branch/delivery rules section)
CLAUDE.md                    (new — concise agent instructions, links to docs/)
OVERNIGHT_REPORT.md          (this file)
artifacts/preview/           17 PNG screenshots
prototype/
  README.md                  exact local commands
  package.json  tsconfig.json  next.config.mjs  eslint.config.mjs
  vitest.config.ts  playwright.config.ts  .gitignore
  src/domain/                types.ts  ids.ts  fixtures.ts  actions.ts
                             selectors.ts  documents.ts
  src/store/StoreProvider.tsx
  src/components/            Shell.tsx  IdentityBanner.tsx  bits.tsx
                             ActivityFeed.tsx  TaskControls.tsx
                             Checklist.tsx  PhotoCapture.tsx
  src/app/                   layout.tsx  page.tsx  globals.css
                             orders/  orders/[orderNo]/  units/[unitId]/
                             tablet/[unitId]/  scan/  r/[publicRef]/
                             labels/  views/[view]/
                             documents/[unitId]/
                             documents/order-summary/[orderNo]/
  tests/domain/              7 Vitest files (32 tests)
  e2e/                       7 Playwright files (60 tests)
```

`node_modules/`, `.next/`, `test-results/`, and `playwright-report/` are
git-ignored. No dependency directory or secret was staged.

---

## 4. Features completed

### Application layout (A)
Teams-inspired shell with a left icon rail, grouped views column, favourites,
unread indicators and counts, searchable order/Unit lists, list→detail
continuity, and posts/replies with authors, timestamps, and attachment cards.
All eleven required views exist: Home, My Work, Orders, Mississauga, Houston,
Machining, Assembly, Quality, Shipping, Blocked Work, Search. **Every view is a
filter over one master order set** — verified by test, including that the same
order object is reused rather than duplicated per facility.

### Order execution workspace (B)
Header carries order number, customer, PO, due date, facility, product family,
order type, overall progress, blocked count, Teams-link placeholder, and a
Print Work Order Plan action. All nine tabs are present: Overview, Units,
Tasks, Activity, Materials, Quality, Documents, Shipping, Audit. **Fractions
such as 1/5 are clickable** and drill through to the exact Unit set.

### Unit view (C)
Persistent identity banner (Order, Unit ID, serial or "Serial pending", model
and size, material, status, location, current operation) plus route
operations, actionable tasks, checklist progress, measurements, required
evidence, special instructions, material changes, blockers, photos, recent
activity, audit timeline, and final-document status.

### Shop-floor tablet (D)
Large labelled controls — Start Work, Resume Work, Complete Step,
Pause/Handoff, Take Photo, Attach File, Enter Measurement, Report Problem,
Continue Last Job — with Pass / Needs Review offered inside the checklist
panel opened by "Complete Checklist". The identity banner stays visible
throughout every controlled action. The views column collapses at tablet
widths so the work screen keeps its width.

### Task and handoff (E)
Start, pause, resume, complete, block, and resolve-blocker all implemented.
Pausing requires reason, completed work, remaining work, current physical
location, and storage/safety state (blocker item and note optional); the
confirm button stays disabled until every required field is filled. Blocking
records the pre-block state and resolving restores it. An employee switcher
lets a reviewer pause as one employee and resume as another and see the full
handoff — covered end to end by `e2e/handoff.spec.ts`.

### Digital checklist (F)
Thirteen representative 1196 steps with checkbox, pass/fail, and measurement
responses; units, expected range, required-note and required-photo indicators;
mocked photo attachment; technician and timestamp; and Saved, Pending, Error,
and Needs Review states — all four visible in the fixture. Corrections
supersede rather than overwrite, and the superseded entry stays visible.

### Activity and conversion (G)
Composer, one level of replies, author and exact timestamps, mentions,
attachment cards, unread indicator, and follow control. A comment converts to
Task, Problem, Material Change, or Special Work Instruction; the original
comment is preserved with a link to the created record. Both required examples
are seeded: "Use CD4 for Unit 1.1" and "Machine stub shaft by 0.150 inch for
Unit 1.2". A reaction is never treated as approval — approvals are separate
records with a named approver.

### Material change and special instruction (H)
Unit-only material change on `26SO00729_1.1`: ordered 316SS, as-built CD4MCu,
Approved, with reason, requester, approver, and evidence placeholder. Units
1.2–1.5 remain 316SS — asserted visually and in tests at three levels (order
Materials tab, Unit view, and the generated document snapshot). Special work
instruction on `26SO00729_1.2`: stub shaft, machine by 0.150 in, before-photo
placeholder present, after-photo outstanding, completion measurement, and
Awaiting Verification status.

### QR simulation and labels (I)
"Simulate QR Scan" covers all six scannable types: Master Order, Unit,
Component, Material lot, Transfer, Pallet. The Unit 1.2 QR opens Unit 1.2
directly with scanned-identity confirmation, next available operation, and
Take Photo / Add Component / Complete Checklist / Report Problem actions. An
unknown reference fails closed and discloses no order or customer detail.
All seven print previews render (Work Order Plan, Unit tag, package tag,
component tag, material-lot tag, transfer tag, pallet tag), each with a
deterministic mock QR **and** a human-readable identifier plus label revision.

### Photo and attachment (J)
Take Photo, Attach Existing Photo, and Attach File are mocked. Before saving,
the dialog shows target Order, target Unit, target task/checklist step,
category, employee, and timestamp. Once capture starts the target is locked
and the category control disables — changing target requires an explicit
cancel. Images are generated placeholder SVGs labelled "MOCK PHOTO".

### Quality and document preview (K)
`26SO00729_1.1_Unit_QC_and_Manufacturing_History.pdf` renders as a browser
preview with all fourteen required sections plus an audit appendix, built from
a frozen snapshot that queries only that Unit. The order completion summary
covers all five Units.

---

## 5. Mocked behaviour

- **All state is in-memory** (React `useReducer` seeded from fixtures).
  A browser refresh resets to the fixture baseline. There is no server,
  database, or persistence.
- **Identity** is a demo employee switcher, not authentication. No Entra, no
  sign-in, no authorization checks.
- **QR codes** are deterministic generated SVG patterns, visually QR-like but
  not scannable. `publicRef` values are deterministic mock strings, not random
  128-bit values.
- **Photos** are generated placeholder SVGs. No camera access is requested.
- **PDFs** are HTML previews styled as pages. No PDF is generated.
- **Teams link** is a text placeholder. Nothing is posted anywhere.
- **Label printing** appends a print event to the in-memory identity; no
  printer is contacted.
- **Houston order `26SO00735`** is fabricated purely so the location and
  department view filters have a second order to filter against.

## 6. Deliberately excluded

Azure resources, PostgreSQL, Prisma or migrations, Entra authentication,
AIMCOR integration, Microsoft Graph, real Teams posting, Blob Storage, camera
permissions, real QR scanning, production PDF generation, external analytics,
customer data beyond the approved mock fixture, and secrets. No deployment,
push, pull request, or external-system mutation occurred.

---

## 7. Tests and exact results

Run from `prototype/`. Final results:

| Command | Result |
| --- | --- |
| `npm run typecheck` (`tsc --noEmit`) | **Pass**, no errors |
| `npm run lint` (`eslint src tests e2e`) | **Pass**, no errors or warnings |
| `npm run test` (Vitest) | **Pass — 32 tests in 7 files** |
| `npm run build` (`next build`) | **Pass**, 12 routes compiled |
| `npm run test:e2e` (Playwright) | **Pass — 60 tests** (55 desktop @1440×900, 5 tablet @1024×768) |
| `npm run verify` (all of the above in sequence) | **Pass** |

### Required acceptance criteria — all twelve pass

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | Quantity 5 produces exactly 5 independent Units | `tests/domain/units.test.ts` |
| 2 | The five Unit IDs are correct and unique | `tests/domain/units.test.ts` |
| 3 | Material change on 1.1 does not alter 1.2–1.5 | `tests/domain/isolation.test.ts`, `e2e/workspace.spec.ts` |
| 4 | A photo/checklist response belongs only to its Unit | `tests/domain/isolation.test.ts`, `e2e/unit-and-flows.spec.ts` |
| 5 | Progress fraction drill-down returns the exact Unit set | `tests/domain/units.test.ts`, `e2e/workspace.spec.ts` |
| 6 | Paused work retains handoff fields and can be resumed | `tests/domain/tasks.test.ts`, `e2e/handoff.spec.ts` |
| 7 | Comment conversion retains the original comment | `tests/domain/activity.test.ts`, `e2e/unit-and-flows.spec.ts` |
| 8 | Simulated Unit QR opens the correct Unit | `tests/domain/qr.test.ts`, `e2e/qr-and-documents.spec.ts` |
| 9 | Reprinting a label does not create a new Unit | `tests/domain/qr.test.ts`, `e2e/qr-and-documents.spec.ts` |
| 10 | Unit-history preview contains only that Unit's records | `tests/domain/documents.test.ts`, `e2e/qr-and-documents.spec.ts` |
| 11 | Tablet controls remain visible at the target viewport | `e2e/tablet.spec.ts`, `e2e/responsive.spec.ts` |
| 12 | The build completes successfully | `npm run build` |

### Defect found and fixed during verification

The first browser isolation tests navigated between sibling Units with
`page.goto()`, which hard-reloads the page and **resets the in-memory store**.
Those assertions would have passed even if cross-Unit leakage existed. They
were rewritten to navigate client-side through links so the store stays live,
and now include a return trip proving the original Unit kept its own data.
Criteria 4 and 10 are genuinely exercised as a result. No acceptance criterion
was weakened to make a test pass, and no failure was suppressed.

Four further browser-test failures were fixed at root cause rather than by
loosening assertions: an ambiguous positional selector (replaced with test
IDs), two strict-mode selector collisions (scoped to their containers), a
missing Playwright project exclusion, and one genuine UX gap — the tablet's
large "Take Photo" button required a second tap to reach capture, which is now
a direct open.

---

## 8. Screenshots

Seventeen PNGs in `artifacts/preview/`, regenerated by `npm run screenshots`:

`01-teams-inspired-desktop` · `02-order-workspace` · `03-five-unit-progress` ·
`04-progress-drilldown` · `05-unit-detail` · `06-material-change-isolation` ·
`07-checklist` · `08-activity-comment-conversion` · `09-qr-scan-simulation` ·
`10-qr-landing` · `11-label-previews` · `12-qc-document-preview` ·
`13-order-summary-preview` · `14-blocked-work-view` · `15-shop-floor-tablet` ·
`16-tablet-pause-handoff` · `17-tablet-photo-target-lock`

Several were inspected directly during the run, which is how the tablet
navigation-width problem and the raw `InAssembly`/`NotStarted` enum leakage
into printed previews were caught and fixed.

Note: `17-tablet-photo-target-lock.png` embeds the live capture timestamp, so
it differs on every regeneration. The other sixteen are deterministic.

---

## 9. How to run it

```bash
cd prototype
npm install
npx playwright install chromium   # first time only, for browser tests
npm run dev                       # http://localhost:3100
```

Suggested review path: Home → Orders → `26SO00729` → click the `1/5` fractions
→ Units tab → Unit `26SO00729_1.2` → Open shop-floor tablet view → Scan →
Simulate Unit 1.2 QR → Labels → Documents.

---

## 10. Unresolved UX questions

1. **Views column on tablet portrait.** It now collapses behind a toggle. Real
   technicians should confirm whether the toggle is discoverable enough, or
   whether the shop-floor route should hide navigation entirely.
2. **Checklist length.** Thirteen items in one scroll is long on a tablet.
   Grouping by operation, or showing only the current operation's items, needs
   observation with real users (document 09, Workshop 3).
3. **Pause dialog friction.** Five required fields is deliberate but slow with
   gloves. Whether structured pick-lists should replace free text is a
   usability decision for the workshop.
4. **Fraction affordance.** Fractions are underlined links; whether that reads
   as clickable on a tablet needs observation.
5. **Needs Review placement.** It currently sits per checklist item. Whether
   quality wants a Unit-level "flag for review" instead is unresolved.

## 11. Unresolved business decisions (not invented here)

Every item below is still `Proposed` in `docs/DECISIONS.md`. The prototype
shows placeholder behaviour and labels it rather than inventing a rule.

- **D-013 — 1196 route, tolerances, and evidence rules.** Every numeric limit
  in the checklist (impeller trim 12.45–12.55 in, runout ≤2 thou, axial play
  ≤2 thou, impeller clearance 10–20 thou, hydrotest) is a **fabricated
  placeholder** rendered with the label "Pilot placeholder - owner approval
  required". These are not engineering values and must be replaced by
  Production and Quality before any real use.
- **D-014 — permission matrix.** No authorization exists. The employee
  switcher grants everyone everything; it is a demo device only.
- **D-015 — document manifests.** The QC history outline is a reasonable
  reading of document 05, not an approved manifest. Photo limits, retention,
  and the correction example are unresolved.
- **D-016 — label layouts and media.** Sizes shown (4×6, 2×1, 4×2) come from
  document 04's table; actual layouts, media, and placement are unapproved.
- **D-017, D-018** — recovery targets and pilot roster are untouched.

Additionally, the free-rotation short-video evidence category (D-023) is
represented as a photo requirement only; whether video is mandatory is a
Workshop 2 decision.

## 12. Known defects and limitations

1. **State resets on browser refresh.** Inherent to the in-memory store. Any
   reviewer walkthrough must avoid refreshing mid-demo. Documented in
   `prototype/README.md`.
2. **Domain rejections surface via `window.alert`.** Adequate for a prototype,
   not production error handling.
3. **Operation status is fixture data, not a live projection.** Document 03
   defines operation status as a calculated projection over tasks and
   checklist runs. The prototype stores route statuses directly, so completing
   a task does not recompute the route badge. Unit status is likewise static.
4. **Unit status does not react to checklist completion.** Recording responses
   updates checklist progress but not the Unit's high-level state.
5. **No nonconformance or rework flow.** Section 8 of the QC document is a
   placeholder. Inspection failure, nonconformance creation, and rework
   appended to the single route (D-022) are not implemented.
6. **No idempotency, concurrency, or optimistic-locking behaviour.** These are
   central production invariants (D-021) with no prototype representation.
7. **Search is a simple substring scan**, not the trigram/full-text projection
   of D-010, and has no permission filtering.
8. **Accessibility is basic.** Semantic HTML, visible focus rings, labelled
   controls, and ≥44px touch targets are in place, but no screen-reader or
   contrast audit was performed.
9. **QR graphics are not scannable.** They are decorative patterns.

## 13. Next recommended task

**Make calculated state actually calculated.** Replace the stored route,
operation, and Unit statuses with projections derived from tasks, checklist
runs, and inspection attempts, following the precedence rules in document 03.
This is the highest-value next slice because it is the one place where the
prototype currently *contradicts* the approved information architecture rather
than merely omitting it — and it makes the demo behave correctly when a
reviewer completes a step, which is the first thing anyone will try.

Suggested follow-ups after that, in order: inspection failure → nonconformance
→ rework appended to the single RouteInstance (D-022); then a Unit release
flow that fails closed on missing evidence.

**Before any of this becomes real code:** Gate B in `docs/09-phase-0-review-checklist.md`
is not signed, and D-013 through D-018 remain `Proposed`. This prototype is a
Workshop 3 discussion aid — it is explicitly not authorized domain
implementation, and the placeholder tolerances in it must not be treated as
approved.
