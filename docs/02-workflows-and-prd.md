# 02 - Current/Future Workflows and Product Requirements

## Current-state workflow

| Step | Current action | Gap or risk |
| --- | --- | --- |
| 1. Receive PO | PO arrives through Sales or Orders email. | Commercial and execution intake depend on manual handoff. |
| 2. Create sales order | Staff locate/confirm a quote or create order details in AIMCOR. | Verification is procedural rather than enforced across systems. |
| 3. Generate work-order PDF | AIMCOR PDF is downloaded and renamed with `-WO`. | File naming and version selection are manual. |
| 4. Create work-order record | Staff create a SharePoint list item, often one per location. | Duplicate entry and fragmented cross-location history. |
| 5. Create Teams post | Automation or staff create a descriptive location-channel post. | The thread is not a structured execution record. |
| 6. Communicate production facts | Notes, mentions, photos, serials, and decisions are posted as replies. | Ownership and Unit applicability are ambiguous. |
| 7. Decide materials/parts | Substitutions and sourcing decisions appear in conversation. | Original, approved, and as-built conditions are not reliably separated. |
| 8. Assemble/machine | Paper forms and verbal coordination guide work. | No dependable current operation, dependency, or handoff status. |
| 9. Inspect | Paper checklists record values and signatures. | Validation, evidence, rework, and electronic audit are incomplete. |
| 10. Capture photos | Photos are uploaded to the thread. | Category and Unit association depend on human wording. |
| 11. Ship | Weight, dimensions, carrier, and references are posted. | Shipping records are not consistently typed or Unit scoped. |
| 12. Complete | The thread and files become the historical record. | Producing a Unit-specific QC package requires manual reconstruction. |

## Future-state workflow

1. **Create import draft.** Coordinator uploads the original AIMCOR work-order PDF. The application stores the file and checksum, extracts suggested values, and marks every extracted field unverified.
2. **Verify commercial facts.** Coordinator compares the draft with the PDF, corrects suggestions, selects the facility and a template per order line (the pilot's single line uses `1196 bare pump end`), and confirms the order. Confirmation is idempotent and audited.
3. **Generate structure.** The system creates one Order, its lines, one Unit per quantity, stable Unit IDs/public QR references, and, per line, a reference to the selected template revision with its checksum plus a compiled frozen snapshot of that revision.
4. **Review/release.** Coordinator reviews route, line-wide instructions, Unit-specific exceptions, required materials, and due date. Production release makes ready operations visible.
5. **Plan work.** Production manager assigns work or allows role/location queues to claim it. Dependencies determine `Ready`; holds show owner, reason, and expected resolution.
6. **Execute.** Technician opens My Work or scans a Unit, confirms the identity banner, starts the next operation, completes checklist items, records measurements, and captures categorized evidence.
7. **Pause/handoff.** Pausing requires reason, completed work, remaining work, location, storage/safety state, blockers, and optional photo. Another authorized user resumes the same operation.
8. **Control changes.** Material substitutions and special instructions are structured records with affected Units, approvals, evidence, and final verification. Activity comments may be converted to these records.
9. **Inspect/rework.** Quality reviews required responses and evidence. Failures create a nonconformance and append approved rework operations to the Unit's existing route; release is blocked until disposition and reinspection are complete.
10. **Package/ship.** Shipping completes packaging checks, weight, dimensions, package count, carrier/PRO, and required photos.
11. **Generate documents.** Release freezes a Unit snapshot and queues final PDF generation. Each Unit gets an independent history; the order summary links all released Unit documents.
12. **Close order.** Order closes only when every non-cancelled Unit is released/shipped as required and no blocking change, inspection, or document job remains.

## Product definition

The application is an internal digital traveler and order-execution system. It organizes work after commercial order creation and gives each physical pump an auditable production identity. It is not an ERP replacement.

## Users and roles

| Role | Primary needs | Key permissions |
| --- | --- | --- |
| System administrator | Tenant/configuration health | Manage roles and system settings; no implicit quality override |
| Order administrator/coordinator | Accurate intake and release | Create/verify orders, generate Units, manage order instructions |
| Production manager | Work sequencing and blockers | Assign/resequence tasks, set operational holds, reopen work with reason |
| Technician | Execute work quickly | Start/pause/complete assigned or claimable work; add evidence |
| Quality inspector | Independent verification | Inspect, fail, approve rework, release Units |
| Engineering | Controlled instructions | Create/approve technical instructions and deviations |
| Purchasing | Shortfalls and expected dates | Update sourcing/ETA; cannot alter as-built records |
| Shipping | Packaging and shipment | Complete packing, weight/dimensions, carrier and dispatch records |
| Template administrator | Govern standards | Draft/test/submit template revisions |
| Template approver | Release standards | Approve/retire revisions; cannot rewrite assigned history |
| Read-only management | Progress and risk | View reporting without controlled actions |
| Auditor | Traceability | Read audit, superseded values, documents, and evidence |

Users may hold multiple roles. Server authorization evaluates role, facility scope, target state, and record ownership; hiding a button is never the sole control.

## Representative user stories

- As a coordinator, I can verify extracted order data before Units are created so extraction errors do not become production facts.
- As a technician, I can scan a physical pump and see its next ready operation without searching through an order thread.
- As a manager, I can select `2/5 assembled` and see exactly which Units are complete and which are blocked.
- As quality, I can reject one Unit without changing the status or history of its siblings.
- As engineering, I can issue a measured special instruction to selected Units and require before/after evidence and verification.
- As shipping, I can capture dimensions and a PRO number once and have them appear in that Unit's final record.
- As an auditor, I can see a correction, the original value, who corrected it, why, and which released PDF version reflects it.

## Functional requirements

### MVP

- `FR-MVP-001` Upload an AIMCOR PDF and create an untrusted import draft with field-level source/confidence metadata.
- `FR-MVP-002` Require human confirmation before Order, Line, Unit, route, or checklist instances are created.
- `FR-MVP-003` Generate readable Unit IDs in `{orderNumber}_{lineNumber}.{unitSequence}` form and independent UUID/public references.
- `FR-MVP-004` Instantiate the approved 1196 route/checklist revision without later template edits changing the instance.
- `FR-MVP-005` Provide order list, order workspace, My Work, location queue, Unit detail, checklist execution, quality queue, shipping, search, and audit screens.
- `FR-MVP-006` Support explicit task start, pause, resume, block, complete, fail, reopen, and cancel commands with required reasons/evidence.
- `FR-MVP-007` Record typed measurements with units, expected values/tolerances, result, actor, and timestamp.
- `FR-MVP-008` Capture categorized photos/files against an explicit target and operation/checklist step.
- `FR-MVP-009` Record serial assignments, material changes, special instructions, approvals, rework, and final as-built verification.
- `FR-MVP-010` Show Unit and order activity combining comments, replies, and structured system events; allow comment-to-action conversion.
- `FR-MVP-011` Generate master and Unit QR labels, record print/reprint events, and authenticate before opening the resolved record.
- `FR-MVP-012` Generate immutable versioned Unit and order-summary PDFs from frozen snapshots and manifests.
- `FR-MVP-013` Search order number, Unit ID, serial, customer, PO, product, task, comment, material, shipment reference, and file name.
- `FR-MVP-014` Send only configured Teams milestone/exception notifications and retain bidirectional deep links.
- `FR-MVP-015` Enforce Entra roles, facility scope, optimistic concurrency, idempotency, and append-only audit events.
- `FR-MVP-016` Clearly distinguish saved, pending, failed, and retrying operations when connectivity changes.

### Phase 2

- Cross-location transfer requests, dispatch, containers, receipt, shortages, and evidence.
- Package/component hierarchy, material-lot records, allocations, certificates, and scan-to-allocate.
- Purchasing/shortfall queues, batch scanning, label print profiles, and expanded dashboards.
- Additional product templates after controlled authoring and pilot validation.

### Phase 3

- Structured AIMCOR CSV/API integration, richer Teams application/bot experience, advanced reporting, and approved external-processing workflows.
- Optional dedicated search service and more capable offline drafts if evidence shows a need.

## Non-functional requirements

- **Usability:** primary shop-floor actions are reachable with large labelled controls; normal execution does not require retyping known context.
- **Integrity:** controlled commands are transactional, idempotent, concurrency checked, and audited.
- **Isolation:** every attachment, response, change, and document snapshot carries explicit Order/Line/Unit targeting.
- **Performance:** common authenticated screens should become usable within three seconds on pilot Wi-Fi; command feedback should appear within two seconds excluding uploads/background jobs.
- **Accessibility:** keyboard operation, visible focus, high contrast, text labels, semantic headings, and tablet touch targets of at least 44 CSS pixels.
- **Security:** single-tenant authentication, least-privilege roles, short-lived upload grants, malware/type validation, encrypted storage, and no secrets in QR codes or clients.
- **Recovery:** database point-in-time recovery, object versioning/soft delete, documented restore drills, and reproducible infrastructure.
- **Observability:** correlated logs, metrics, audit events, queue depth, failed jobs, upload failures, notification failures, and document-generation duration.
- **Compatibility:** current supported Edge/Chrome on Windows and managed iOS/Android tablets; camera fallback to file picker/manual search.

## Acceptance criteria

- Importing `26SO00729-WO.pdf` creates a draft showing quantity two and ordered 316SS values, but creates no Units until confirmation.
- Confirming the sample creates two Units with separate routes, checklists, activity, attachments, and final document targets.
- A change to CD4 can target one or both Units and requires the configured approval; original 316SS remains visible.
- A technician cannot complete a step lacking a required measurement/photo, and a sibling Unit remains unchanged.
- Paused work records a complete handoff and can be resumed by another authorized user without verbal context.
- Quality release fails closed when required evidence, approval, rework disposition, or final checklist response is missing.
- Repeating a confirmed command with the same actor, command type, idempotency key, and payload returns the original result and creates no duplicate event; reusing that key with a changed payload is rejected, and a different actor's use of the same textual key is treated as an unrelated command.
- Scanning a QR while signed out returns to the correct record after Entra sign-in; insufficient permission shows a friendly denial.
- Released Unit PDF content is derived only from that Unit's frozen snapshot and registered document manifest.

## Constraints, dependencies, and non-goals

- AIMCOR API availability is unconfirmed; PDF-assisted entry is the pilot default.
- Entra application registration, Teams installation/workflow approval, Azure subscription, facility/department lists, and pilot-role assignments are external dependencies.
- Checklist owners must approve tolerances, conditional steps, and evidence requirements before the 1196 template is released.
- The application will not calculate price, post accounting entries, promise inventory availability, or replace formal engineering drawing control.
- Existing Teams messages and SharePoint folders are linked as historical context rather than bulk-normalized into manufacturing records.
