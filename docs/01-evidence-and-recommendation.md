# 01 - Evidence and Executive Recommendation

## Executive recommendation

Build the Rotech Order Execution and Digital Traveler as a custom, Azure-hosted web application with Microsoft integration at its edges. Use a TypeScript modular monolith, PostgreSQL, Azure Blob Storage, Microsoft Entra ID, a background worker, and milestone-level Teams notifications. This gives Rotech the relational structure and unit-level traceability that Lists and Teams cannot reliably provide while retaining familiar Microsoft sign-in, collaboration, and document links.

The MVP should prove one complete workflow: new 1196 bare pump-end orders in Mississauga. AIMCOR remains authoritative for commercial order facts. The new application becomes authoritative for units, routes, tasks, checklists, measurements, materials used, changes, inspections, photos, transfers, shipping evidence, and final manufacturing-history documents.

The central design rule is that a line quantity is never a single QC object. A quantity of five creates five Units, each with independent progress and history.

## Evidence table

| Source | Observed evidence | Planning implication |
| --- | --- | --- |
| `26SO00729-WO.pdf` | One AIMCOR work-order page contains order, PO, customer, dates, a product line, quantity two, and the ordered 316SS configuration. It contains no per-unit route or QC history. | Import the commercial facts, preserve the source PDF and checksum, and generate two independent Units only after verification. |
| `Training Manual.pdf` | Customer POs are received by email; employees find or create a quote in AIMCOR, confirm it, create a sales order, and verify amounts, quantities, part numbers, descriptions, and addresses. | AIMCOR remains the source for commercial data. The execution app begins after sales-order creation and must not silently alter commercial facts. |
| `microsoftteams_WO_adding.pdf` | Employees download and rename a work-order PDF, choose a location channel, upload the file, and create a descriptive Teams post. | Automate or assist repetitive intake, but preserve descriptive titles and a master Teams link. Do not create separate order records by location. |
| `microsoftteams_WO_setup.pdf` | Users rely on channels, pinned/favourite views, notifications, and a separated Chat/Teams navigation model. | Use familiar navigation, unread indicators, favourites, activity threads, and list/detail layouts without copying Teams as a chat product. |
| `microsoftteams_WO_samplesetup.pdf` | A SharePoint list creates a Teams post and document folder. Staff manually copy the message link into `qr.io`, paste the QR into a Word template, and print it. Duplicate folders can block attachment saving. | Replace fragile folder and third-party QR steps with stable application deep links, generated labels, idempotent storage paths, and reprint history. |
| `1196 checklist Pump-End.docx` | The form records order, size, serial, materials, 18 assembly/QC operations, measurements, hydrotest, labour time, final inspection, and packaging checks. Photos/video are requested in prose. | Convert the checklist into a versioned 1196 template with typed responses, evidence rules, tolerances, sign-offs, labour sessions, and packaging sub-checklist. |
| `Assembly checklist TRASH - Copy.docx` | A separate SXT/SXU checklist has model-specific steps, oil tests, hydrotest, nameplate, quality, and shipping sign-off. | Checklist definitions must be product/template specific; a single universal checklist is inappropriate. This file is evidence, not an MVP template. |
| `Machining Work Order - Copy.docx` | Four repeated paper forms record order, item/quantity, work required, machinist, and notes. | Support machining-only tasks and printable fallback travellers, but keep the pilot focused on 1196 operations. |
| `codex-clipboard-c40d9720-b551-4064-8572-3f7437bbb690.png` | One descriptive order subject contains the work-order PDF and order context. | Keep a master order activity thread and bidirectional Teams/application links. |
| `codex-clipboard-fdadb469-4087-480f-afb7-3b922586d785.png` | Full-diameter requirement, CD4 material change, payment receipt, serial number, and nameplate photo appear as ordinary messages. | Convert manufacturing decisions into structured changes, approvals, serial assignments, and categorized evidence. Reactions are acknowledgements, not approvals. |
| `codex-clipboard-cda491d6-5873-4262-b3b8-3ab6073e1c87.png` | Completed-pump photo, weight, dimensions, and XPO reference are posted without a unit-scoped shipping record. | Require the active Unit target and capture shipping facts as typed fields linked to evidence. |
| `codex-clipboard-d43c3f32-c83f-4925-a218-1b54f83cdc9d.png` | This duplicate capture confirms the same completion/shipping facts and the practical use of Teams as the final status record. | Treat duplicate screenshots/messages as repeated evidence, not distinct production events; use idempotent structured updates. |

## Confirmed current-state problems

- Order facts are re-entered across AIMCOR, downloaded PDFs, SharePoint, Teams posts, QR tools, and Word templates.
- Teams discussions are easy to use but do not enforce order-line, Unit, task, material-change, or inspection associations.
- Location-specific records can fragment one order that moves between facilities.
- Serial numbers are assigned after work starts, leaving no stable early physical identifier.
- Paper checklists mix instructions, measurements, evidence requirements, labour records, and sign-offs without validation.
- Duplicate folder names can break attachment workflows.
- Photos, dimensions, carrier references, and decisions may exist but cannot be reliably assembled into one Unit's final QC history.

## Options considered

| Criterion | Microsoft low-code | Custom web application | Recommended hybrid |
| --- | --- | --- | --- |
| Prototype speed | High for simple lists/forms | Moderate | Moderate |
| Relational Unit/package/component model | Awkward at required depth | Strong | Strong |
| Shop-floor tablet UX | Constrained by platform patterns | Fully controllable | Fully controllable |
| Versioned routes/checklists | Complex | Natural | Natural |
| Photos and large documents | Possible but governance-heavy | Strong with object storage | Strong with Blob; SharePoint linked selectively |
| Immutable audit and controlled commands | Difficult to make rigorous | Strong | Strong |
| Teams/Entra familiarity | Native | Integration required | Preserved |
| Offline-safe retry | Limited/custom | Controllable | Controllable |
| Long-term maintainability | License and flow complexity | Requires engineering ownership | Balanced |
| AI-assisted development/testability | Flow definitions are harder to review | Strong | Strong |

Low-code is suitable for temporary intake or notification bridges, not as the long-term execution database. A completely Microsoft-independent custom system would give portability but discard useful identity and collaboration infrastructure. The hybrid keeps the core portable at the application/data layer while using Entra, Teams, and Azure services where they provide concrete value.

## MVP boundary

### Included

- Verified PDF-assisted order intake.
- Order lines and independent Unit generation.
- 1196 bare pump-end route and checklist revision.
- My Work, location queue, start/pause/complete, handoff, blocker, and inspection flows.
- Measurements, photos, files, serial numbers, material changes, and special instructions.
- Order and Unit activity feeds with structured conversion of important comments.
- Stable QR labels, master Work Order Plan, Unit labels, and reprints.
- Unit final manufacturing-history PDF and order completion summary.
- Entra roles, append-only audit events, search, and milestone Teams notifications.

### Designed now, built after pilot

- Cross-location transfers, packages and package components, material-lot scanning, batch operations, and purchasing shortfall queues.
- Additional product/checklist templates and more label sizes.
- Approved-drawing and technical-document assembly beyond the pilot's required assets.

### Explicitly deferred

- Pricing, quoting, accounting, payroll, full inventory, purchasing replacement, customer portal, finite-capacity scheduling, and AIMCOR replacement.
- Full Teams message synchronization and bulk migration of historical posts.
- True offline completion with conflict-aware synchronization.

## Design principles

1. The active order, line, Unit, task, employee, facility, and time are supplied by context wherever possible.
2. Fast conversation and structured execution coexist; critical decisions cannot remain only in comments.
3. Every controlled action is explicit, authorized, idempotent, and audited.
4. Original ordered specification, approved changes, and final as-built condition remain distinguishable.
5. Templates are versioned; existing orders stay on their assigned revision unless deliberately migrated.
6. Labels use stable opaque links and readable identifiers; serial numbers are attributes, not identity.
7. Final PDFs are generated from frozen snapshots, not mutable live records.
8. The simplest shop-floor path is scan, confirm identity, perform the next action, and save evidence.

## Principal risks

- A feature-rich interface could become slower than Teams; mitigate with role-focused screens and observed usability tests.
- Extraction errors could create incorrect units; mitigate with an untrusted draft and mandatory confirmation.
- Weak Wi-Fi could produce duplicate or missing actions; mitigate with client request IDs, explicit pending state, and idempotent server commands.
- Template errors could affect many units; mitigate with draft/approved/retired revisions and golden-order tests.
- Photos could attach to the wrong pump; mitigate with persistent Unit context, identity banners, QR entry, and a final target confirmation.
- Teams automation could flood users; limit it to configured milestones and exceptions.

## Assumptions requiring pilot confirmation

- Mississauga has adequate authenticated tablet access for safe-retry operation.
- Rotech can register a single-tenant Entra application and approve required roles/integrations.
- The supplied 1196 checklist is the best available starting point but needs owner review for tolerances, conditional steps, and evidence rules.
- Existing office printers are sufficient for initial scan testing; durable thermal-transfer media is a post-validation purchase.
