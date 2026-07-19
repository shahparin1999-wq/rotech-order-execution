# 04 - UX, Templates, and QR/Tagging Strategy

## UX rules shared by every concept

- Display a persistent identity banner with Order, Unit ID, serial, product, status, and location during controlled Unit actions.
- Keep conversation and execution together but visually distinct: comments use activity cards; accountable work uses task/checklist/change cards with owner and state.
- Use text plus icons, large touch targets, visible timestamps, explicit saved/pending/error states, and no gesture-only actions.
- Keep one level of replies. Convert critical replies into tasks, problems, deviations, or special instructions while preserving a backlink to the source comment.
- The active target cannot change silently after a photo, scan, or checklist flow begins.
- `Continue Last Job` opens the user's most recent resumable work after confirming that it is still assigned/claimable and showing the Unit identity.

## Concept A - Teams-inspired desktop

```text
+----------+------------------+------------------------+---------------------------+
| App nav  | Views/channels   | Orders / units         | Selected record           |
| Home     | Mississauga      | 26SO00729  Due Jul 28  | Header + identity/status  |
| My Work  |  Assembly     4  | 2 units  1 blocked     | Overview Units Tasks ...  |
| Orders   |  Quality      2  | new activity indicator | Activity feed + composer  |
| Quality  | Houston          |                        | Structured action cards   |
+----------+------------------+------------------------+---------------------------+
```

Borrowed patterns: left navigation, grouped views, favourites, unread markers, searchable list, list/detail continuity, posts/replies, attachment cards, and exact deep links. Manufacturing changes: channels are filters over shared records; actionable cards are separate from discussion; Unit badges and unresolved actions are always visible. On tablet landscape, the views column collapses; portrait uses `Navigation -> List -> Record` with breadcrumbs and a persistent back action.

## Concept B - Order execution workspace

```text
+--------------------------------------------------------------------------------+
| 26SO00729 | Knighten | Due Jul 28 | 1/2 QC | Blocked: material | Teams link     |
+--------------------------------------------------------------------------------+
| Overview | Units | Tasks | Activity | Materials | Quality | Files | Shipping     |
+--------------------------------------------------------------------------------+
| Unit progress              | Risks / next decisions                            |
| 1.1  Assembly  70%         | CD4 change awaiting approval                     |
| 1.2  Quality   90%         | Nameplate photo required                         |
+--------------------------------------------------------------------------------+
| Quick actions: Add update | Create task | Report problem | Print plan           |
+--------------------------------------------------------------------------------+
```

This is the coordinator/manager default. Fractions and status summaries are interactive filters, not aggregate dead ends. A right-side panel may show activity or Unit details without losing the order context. Order instructions and safety notices can be pinned, but a pinned comment is not a task or approval.

## Concept C - Shop-floor tablet

```text
+--------------------------------------------------------------+
| 26SO00729_1.2 | SN pending | 1196 3x4-13 | Mississauga       |
| CURRENT: Impeller trim inspection              [Online]      |
+--------------------------------------------------------------+
| Required 12.50 in | [ Enter measurement ] [ Take photo ]     |
| Checklist: 3 of 5 complete                                  |
| [ Start / Resume ] [ Complete ]                              |
| [ Pause / Handoff ] [ Report Problem ]                       |
+--------------------------------------------------------------+
| Next step | Special instructions | Recent activity           |
+--------------------------------------------------------------+
```

The screen opens directly from a Unit QR or My Work. It minimizes navigation and typing, keeps current work and remaining requirements visible, and shows pending synchronization beside each unsent item. Completing, pausing, failing, or changing the target always requires an explicit confirmation summary.

## Screen inventory

| Screen | Primary user/purpose | Main behavior and validation |
| --- | --- | --- |
| Login/return | All; Entra sign-in | Preserve safe relative return URL from QR/deep link; reject external redirects |
| Home | All; role summary | My Work, recent records, mentions, blockers, due work; useful empty state |
| Order list/board | Coordinators/managers | Search/filter/favourite; never duplicate by facility |
| Order creation | Coordinator | Upload PDF, compare source and suggestions, verify every required field |
| Order workspace | Cross-role | Header, progress, tabs, Teams link, risks, recent activity |
| Unit detail | Production/quality | Persistent Unit identity, next operation, requirements, history |
| My Work/location queue | Technician/manager | Ready/assigned/resumable work with due/blocker information |
| Checklist execution | Technician/quality | Typed inputs, tolerances, required evidence, save/pending state |
| Photo capture | Shop floor | Target locked; category required when evidence controlled; preview/retake |
| Pause/report problem | Shop floor | Reason, completed/remaining work, location, safety, blocker, evidence |
| Material/change instruction | Coordinator/engineering/quality | Affected Unit selection, original/proposed/as-built, approval state |
| Quality queue | Inspector | Missing evidence, failed items, rework and release readiness |
| Shipping | Shipping | Package checks, dimensions, carrier, references, photos, release block |
| Template administration | Owners/approvers | Revision diff, validation results, test fixtures, approval/retire |
| PDF preview/history | Quality/auditor | Draft/final/superseded badges, snapshot, manifest, checksum |
| Audit/search | Auditor/all permitted | Typed results, exact deep links, previous/new values, filters |

## Product/process templates

### MVP: 1196 bare pump end

Default route: intake review -> pull/tag parts -> verify material -> visual/fit inspection -> powerframe leak/free-rotation test -> verify shaft/sleeve -> impeller trim -> runout and axial play -> seal verification -> Plan 11 (conditional) -> pump travel -> impeller clearance -> fastener/free rotation -> hydrotest -> seal clips/warning tags -> touch-up (conditional) -> nameplate -> final quality -> packaging -> weight/dimensions/shipping.

Required measurements include impeller diameter, shaft/sleeve runout, axial play, pump travel, impeller clearance, hydrotest pressure/duration/result, weight, and dimensions where applicable. Evidence includes material marks when traceable, free-rotation evidence, measurement evidence, nameplate, final pump, and packaging photos. Free-rotation evidence uses a constrained short-video category (length- and size-limited, defined for this step only and subject to Quality approval in Workshop 2) or configured photo evidence; general video capture remains deferred (Document 05). Quality owns final inspection/release. Checklist owners must confirm exact units, tolerance values, conditional Plan 11 rules, and whether the short video is mandatory before approval.

### Complete pump package example (Phase 2)

Generate a Package with Pump, Motor, Baseplate, Coupling, Guard, and Accessories. Each component has readiness/location; package route adds baseplate preparation, alignment, coupling/guard installation, wiring/accessory checks as applicable, package inspection, and package-level photos. Package cannot become ready while a required component or Unit inspection is incomplete.

### Machining/spare-part example (Phase 2)

Generate only required tracked parts/Units. Route: verify drawing/instruction -> receive/identify material -> machine -> measure -> inspect -> mark/tag -> package -> ship/transfer. Require original condition, work to be done, tolerance/drawing revision, machinist, inspection, and before/after evidence when the instruction calls for it.

## QR identity and deep links

QR content is only `https://<application-host>/r/<publicRef>`, an opaque stable publicRef link. The authenticated web frontend is internet-reachable so a scan resolves from any managed device without VPN dependence; Entra sign-in and server authorization remain mandatory, and data/storage/queue management surfaces stay private where practical (Document 05). The resolver validates the reference, stores no access token, sends unauthenticated users through Entra with a signed same-origin return state, checks permission, and redirects to the most relevant record/action. An unauthorized or failed scan discloses no order or customer details. The QR destination remains stable when serial, description, status, location, template, or document versions change.

Scannable record types: master Order, Line, Unit, Package, tracked Component, MaterialLot, Transfer/container, and Shipment/pallet. Workstation/location codes may be added later but do not identify manufacturing history.

## Tracking threshold for components

Track individually when a component is serialized, customer supplied, pressure containing, safety/quality critical, heat/lot traceable, specially machined, externally processed, expensive/long-lead, subject to substitution, or needs its own inspection/certificate. Do not individually tag ordinary fasteners and common consumables unless a specific order or quality rule requires lot traceability.

## Sample label layouts

| Label | Human-readable content | QR result | Size / print stage | Attachment |
| --- | --- | --- | --- | --- |
| Master work order | Order, customer, PO, due date, description, coordinator, locations | Order workspace | 8.5x11 first-page plan; order confirmation | Printed traveller in sleeve/clipboard |
| Individual pump | Unit ID, order, customer, model/size, unit count, serial when assigned, due date, destination | Unit next-action screen | 4x6; provisional at order creation, reprint after serial | Laminated/cardstock zip-tie tag on pallet/traveller, not oily pump surface |
| Complete package | Package ID, Order, customer, package number, major components, due/destination | Package workspace | 4x6; package creation and final assembly | Durable tag on base/pallet |
| Component | Component ID, part/description, material, heat/serial, assigned Unit if any | Component record/actions | 2x1 minimum where readable; receipt/allocation | Polyester thermal-transfer label or zip-tie tag appropriate to surface |
| Material lot | Material ID, part, grade, heat/lot, quantity, supplier, inspection | Material lot and allocate action | 4x2 or 4x3; receipt/inspection | Durable label on container, never on a surface that destroys traceability |
| Internal transfer | Transfer ID, origin, destination, contents count, related Units, dispatch state | Transfer dispatch/receipt | 4x6; preparation | Pouch/zip-tie tag on sealed container |
| Pallet/crate | Shipment/package, Order, customer, destination, weight/dimensions, package count | Shipment/pallet record | 4x6; packaging/final dispatch | Weather-resistant label outside shrink wrap plus duplicate protected copy |

Every label prints the readable identifier beside the QR and includes label revision. The master Work Order Plan includes an order QR and Unit summary; a separate tag sheet contains scannable Unit labels so tags can be cut/attached without sacrificing the master traveller.

## Print and reprint policy

Start the pilot with browser-generated PDF profiles and existing laser printers. Validate scan range, lighting, contamination, and attachment practices before procurement. If durable volume justifies it, evaluate a 4-inch, 300-dpi thermal-transfer device and resin ribbon/polyester media. The [Zebra ZD421 specification](https://www.zebra.com/us/en/products/printers/desktop/zd400-series/zd421.html) is a current reference class, not a procurement commitment. Print records store profile/template version, actor, time, reason, and count. `Damaged`, `Lost`, `Replaced`, and `Reprinted` are label events, not new identities.

## Scan actions and confirmation

- Scanning a record to view it does not create a manufacturing event.
- Scanning during a controlled workflow proposes an action based on record type and current context.
- Allocation, replacement, transfer, receipt, inspection, and batch operations show source, destination, quantity, conflicts, and expected effect before confirmation.
- Batch mode shows `n/required`, prevents duplicate reads, and requires explicit Unit allocation. No evidence or material change is applied to all Units implicitly.
- After a Unit scan, photo/checklist actions retain that Unit target until the user deliberately exits or switches with confirmation.

## Friendly errors

Provide specific recovery for unknown/retired QR, permission denial, already allocated component, material mismatch, wrong Unit, duplicate scan, received transfer, dispatched shipment, lost connectivity, camera denial, and failed upload. A controlled mismatch fails closed and names the expected and scanned records without exposing unauthorized details.

## Offline-safe behavior

The pilot is online-first. The client shows connectivity, keeps form/photo drafts locally where device policy permits, assigns a client request ID before submission, and shows `Pending`, `Retrying`, `Saved`, or `Needs attention`. It never advances workflow or shows completion until the server confirms. Retried commands and uploads are idempotent. Conflicts require user review; the client never silently overwrites a newer state.
