# Project Decision Log

## Usage

- Add one row for each durable product, process, architecture, security, or release decision.
- Use `Proposed`, `Accepted`, `Superseded`, or `Rejected`.
- An accepted decision records its approver and evidence. A changed decision adds a new entry and marks the old entry superseded; do not rewrite history.
- Implementation agents may not decide pending safety, quality, identity, source-of-truth, or final-document policy on behalf of Rotech owners.

## Decisions

| ID | Status | Decision | Rationale | Owner/approver | Evidence or supersedes |
| --- | --- | --- | --- | --- | --- |
| D-001 | Accepted | The first pilot covers only new 1196 bare pump-end orders in Mississauga. | Smallest scope that proves Unit-level execution and QC with supplied evidence. | User/product sponsor, 2026-07-18 | Approved implementation plan; Documents 01 and 07 |
| D-002 | Accepted | AIMCOR remains commercial source of truth; the new application owns structured execution/QC; Teams remains collaboration/notification. | Preserves working commercial workflow while removing Teams as the production database. | User/product sponsor, 2026-07-18 | Documents 01, 02 and 05 |
| D-003 | Accepted | Use an Azure-hybrid custom TypeScript modular monolith with PostgreSQL, Blob Storage, Service Bus, Entra, and an isolated worker. | Required relational depth and testability with familiar Microsoft identity/integration. | User/product sponsor, 2026-07-18 | Document 05 |
| D-004 | Accepted | PDF-assisted AIMCOR intake creates an untrusted draft and requires coordinator verification before generating execution records. | Prevents extraction errors from silently becoming manufacturing facts. | User/product sponsor, 2026-07-18 | Documents 02 and 06 |
| D-005 | Accepted | Quantity N creates N independent Units; Unit ID and opaque QR reference exist before serial assignment. | Provides stable physical identity and independent QC history. | User/product sponsor, 2026-07-18 | Documents 03 and 04 |
| D-006 | Accepted | Corrections append superseding records/events; released histories and PDFs are immutable versions. | Preserves auditability and original-versus-corrected state. | User/product sponsor, 2026-07-18 | Documents 03 and 05 |
| D-007 | Accepted | The pilot is online-first with safe retry, pending state, idempotency, and no false success; fully offline controlled execution is deferred. | Addresses unreliable connectivity without introducing conflict-heavy offline scope. | User/product sponsor, 2026-07-18 | Documents 02, 04 and 05 |
| D-008 | Accepted | Teams integration is bidirectional linking plus configured milestone/exception notifications, not full synchronization. | Retains communication value without duplicating the execution database or flooding channels. | User/product sponsor, 2026-07-18 | Documents 01 and 05 |
| D-009 | Accepted | Technical PDFs use registered assets and a manifest; dynamic HTML uses Puppeteer, fixed overlays use pdfme, and pdf-lib merges isolated jobs. | Preserves approved source PDFs and deterministic final order. | User/product sponsor, 2026-07-18 | Document 05 and AGENTS.md |
| D-010 | Accepted | PostgreSQL full-text/trigram search is the pilot search implementation; a separate search service is deferred. | Sufficient for pilot scale and reduces infrastructure. | User/product sponsor, 2026-07-18 | Document 05 |
| D-011 | Accepted | Start label validation with existing printers; purchase of thermal-transfer hardware is deferred until physical scan tests justify it. | Avoids procurement before actual size/media/placement testing. | User/product sponsor, 2026-07-18 | Document 04 |
| D-012 | Accepted | Planning artifacts remain modular Markdown; no DOCX/PDF planning compilation is required. | Version-control-friendly review and agent handoff. | User/product sponsor, 2026-07-18 | README and implementation request |
| D-013 | Proposed | Approve the detailed 1196 route, checklist conditions, measurements, tolerances, evidence, rework, and release rules. | Supplied form contains incomplete/ambiguous operational rules that coding agents must not invent. | Production and Quality owners | Phase 0 Workshop 2 |
| D-014 | Proposed | Approve the final role/facility/separation-of-duty permission matrix and Entra group mapping. | Server authorization and release controls require named business authority. | Quality, Production, Technical owners | Phase 0 Workshop 6 |
| D-015 | Proposed | Approve Work Order Plan, Unit history, order summary manifests, required assets, photo limits, retention, and correction example. | Final quality documents are first-class controlled records. | Quality owner | Phase 0 Workshop 5 |
| D-016 | Proposed | Approve actual Unit/label layouts, media, attachment locations, scan conditions, and printer profiles. | Physical durability and scanability require shop-floor evidence. | Production owner | Phase 0 Workshop 4 |
| D-017 | Proposed | Replace planning recovery targets with signed production RPO/RTO and a successful restore report. | Cutover requires business-owned recovery expectations and evidence. | Technical owner/executive sponsor | Phase 0 Workshop 6 |
| D-018 | Proposed | Approve pilot roster, support/fallback process, exit sample, and cutover authority. | Production introduction needs named ownership and stop conditions. | Executive sponsor/product owner | Phase 0 Workshop 6 |

## Decision template

Copy this row and assign the next sequential ID:

```text
| D-XXX | Proposed | Decision statement | Why this decision is needed | Owner/approver | Evidence or supersedes |
```

