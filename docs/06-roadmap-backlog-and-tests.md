# 06 - MVP Roadmap, Development Backlog, and Test Strategy

## Roadmap and acceptance gates

Roadmap phases are gated by evidence, not promised calendar dates. Relative effort uses S/M/L/XL for planning only.

| Phase | Objective and deliverables | Dependencies | Gate | Effort |
| --- | --- | --- | --- | --- |
| 0. Discovery/design | Confirm roles, identifiers, 1196 steps/tolerances, document contents, facility practices; test three clickable UX concepts and label samples | Product, production and quality owners | Signed decision log; observed technicians complete prototype tasks; label scans pass | M |
| 1. Foundation | Repo/IaC, Entra auth, roles, PostgreSQL schema, audit/outbox, order import draft, verification and Unit generation | Azure/Entra access, sample fixtures | Quantity/import/idempotency/permission tests pass; no unverified production creation | L |
| 2. Shop-floor execution | Templates, routes, My Work, Unit screen, start/pause/resume/complete, checklists, measurements, photos, blockers | Approved 1196 template | Golden 1196 route completes on target tablets; wrong-Unit and offline-safe tests pass | XL |
| 3. Planning and changes | Progress fractions, shortfalls, assignment, deviations, special instructions, activity conversion | Phase 2 events/projections | One-Unit change and handoff scenarios pass without sibling leakage | L |
| 4. Quality/documents | Inspection/rework/release, shipping, Work Order Plan, labels, Unit and order PDFs | Approved document manifests/assets | Sample packages render/validate; immutable correction flow passes | XL |
| 5. Teams/pilot readiness | Bidirectional links, configured milestone notices, dashboards, training, support/runbooks | Teams approval, production environment | Security/recovery/UAT gates pass; notification volume accepted | M |
| 6. Pilot | New Mississauga 1196 orders in parallel with Teams; daily feedback and metrics | Trained pilot cohort, rollback plan | Exit criteria in Document 07 met for consecutive reviewed orders | L operational |
| 7. Expansion | Transfers, packages, lots, batch scans, additional templates/AIMCOR integration | Pilot decision | Separate approved scope and migration plan | Estimated only after pilot selection |

## Ordered implementation backlog

Each ticket includes the user outcome, scope, acceptance, dependencies, tests, migration, and documentation expectations. Implementation agents must split any ticket that cannot be validated in one coherent change.

### Epic A - Repository and platform foundation

**A1. Establish application and infrastructure baseline**
Story: As maintainers, we need reproducible local/test/prod foundations.
Scope: TypeScript workspace, web/API and worker boundaries, PostgreSQL, Bicep, CI checks, environment configuration and decision/status docs.
Acceptance: clean bootstrap; no secrets; health/readiness endpoints; development dependencies pinned; CI runs type, lint, unit and build checks.
Dependencies: Azure target decisions. Tests: configuration, build, container health, IaC validation. Migration: none. Docs: local setup, environment matrix, release flow.

**A2. Implement Entra identity and authorization skeleton**
Story: As Rotech, only authorized employees may access permitted actions.
Scope: single-tenant OIDC, actor projection, app roles, facility scopes, server policy framework, safe return URLs.
Acceptance: sign-in/out/deep-link return work; role/facility denials fail server-side and are audited.
Dependencies: A1, tenant registration. Tests: token/role matrix, unsafe redirect, expired session. Migration: user/role tables. Docs: app registration and group-role mapping.

**A3. Add transactional audit, idempotency, concurrency and outbox**
Story: As an auditor, every controlled action is attributable and retry-safe.
Acceptance: duplicate key returns original result; altered duplicate rejects; stale version conflicts; state/audit/outbox commit atomically.
Dependencies: A1. Tests: concurrent commands, rollback, dispatcher retry. Migration: audit/idempotency/outbox tables. Docs: command contract and operations.

### Epic B - Order intake and Unit identity

**B1. Store and parse AIMCOR PDF into untrusted draft**
Scope: upload intent/finalization, source checksum, extraction adapter, field source/confidence, draft comparison.
Acceptance: sample source suggests correct order/PO/customer/dates/line/quantity/material; no execution entities exist.
Dependencies: A2-A3. Tests: valid sample, image/invalid PDF, duplicate source, malicious/oversized file. Migration: import/source/attachment tables. Docs: verification SOP and parser limitations.

**B2. Confirm draft and generate Lines/Units exactly once**
Acceptance: confirmed quantity N generates N sequences, Unit IDs and public refs; retry creates none; cancellation never reuses a sequence.
Dependencies: B1. Tests: quantities 1/2/5/10, concurrent confirmation, corrected draft. Migration: Order/Line/Unit/QR tables. Docs: identity rules.

**B3. Build order list/workspace and Unit detail queries**
Acceptance: permission-filtered search/list/detail, progress drill-down, persistent Unit banner, useful empty/error states.
Dependencies: B2. Tests: query authorization, pagination, aggregation accuracy. Migration: indexes/projections. Docs: screen behavior.

### Epic C - Versioned templates and execution

**C1. Implement template/checklist revision lifecycle**
Acceptance: approved revisions immutable; order instance freezes selected definition; revision diff and test fixtures available.
Dependencies: A3. Tests: invalid cycles/conditions, approval/retirement, active-order isolation. Migration: template definition tables. Docs: governance/runbook.

**C2. Encode and approve the 1196 pilot template**
Acceptance: route/checklist/evidence/tolerance rules match owner-approved specification and golden fixtures.
Dependencies: C1 and discovery sign-off. Tests: configuration variants/conditional steps. Migration: seed data as versioned migration. Docs: owner, revision notes, source mapping.

**C3. Instantiate routes and calculate readiness/progress**
Acceptance: dependencies produce correct Ready set; Unit/Line fractions drill to exact Units; projections rebuild deterministically.
Dependencies: B2, C2. Tests: five Units at different stages, holds, cancellations, recalculation. Migration: instances/projections.

**C4. Implement My Work, queues and controlled task commands**
Acceptance: assignment/claim/start/pause/resume/block/complete/reopen enforce policy and prerequisites; handoff fields required.
Dependencies: A3, C3. Tests: lifecycle, separation, concurrency, facility scope. Docs: technician/manager SOP.

**C5. Implement checklist, measurement and labour capture**
Acceptance: typed validation, units/tolerances, required remarks/evidence, attempts/corrections and electronic sign-off.
Dependencies: C4. Tests: boundary values, unit mismatch, failed/reinspection/correction. Migration: run/response/measurement tables.

### Epic D - Evidence, activity and controlled changes

**D1. Implement direct upload and categorized evidence**
Acceptance: create-only scoped grant, finalized verified blob, thumbnails, target locking, orphan expiry, no storage URL in domain/QR.
Dependencies: A2-A3. Tests: size/type/checksum, interrupted/retried upload, wrong target, permission. Docs: retention and upload operations.

**D2. Implement activity posts, replies and unread/follow state**
Acceptance: one reply level, exact timestamps/deep links, filters, mentions, unread controls, categorized attachments.
Dependencies: B3, D1. Tests: target visibility, editing/supersession, permission-filtered search. Migration: activity/read/follow tables.

**D3. Convert posts into accountable records**
Acceptance: conversion creates linked task/problem/deviation/instruction with selected Units and preserves source comment.
Dependencies: D2, task/change models. Tests: `Use CD4 for Unit 1.1`, measured machining instruction, multi-Unit confirmation.

**D4. Implement deviations, special instructions and approvals**
Acceptance: original/proposed/as-built, affected Units, approval policy, evidence and verification remain auditable; reaction cannot approve.
Dependencies: C4, D1. Tests: one/many Unit targeting, denied approver, corrected/superseded change. Docs: approval matrix.

### Epic E - QR, quality, shipping and documents

**E1. Implement QR resolver and label profiles**
Acceptance: stable auth-return link, friendly retired/denied states, seven sample profiles, print history/reprint without new identity.
Dependencies: A2, B2. Tests: pre/post serial, damaged reprint, malicious return, duplicate scan. Docs: placement/media pilot.

**E2. Implement final inspection and rework**
Acceptance: missing/failed evidence blocks release; failed attempt remains; rework and reinspection close explicitly; override policy enforced.
Dependencies: C5, D4. Tests: pass/fail/rework/override/reopen. Migration: inspection/nonconformance tables.

**E3. Implement packaging and shipment record**
Acceptance: checks, dimensions, carrier/PRO and photos are Unit/package scoped; dispatch blocks incomplete release.
Dependencies: E2, D1. Tests: multi-package, missing values, duplicate dispatch. Migration: shipment tables.

**E4. Generate Work Order Plan and labels**
Acceptance: manifest-driven, unique job, QR/readable IDs, source snapshot/checksums, sample render passes.
Dependencies: E1, document worker. Tests: quantity 1/5, long descriptions, retry/isolation. Docs: print profiles.

**E5. Generate/release Unit and order-summary PDFs**
Acceptance: registered assets only, correct manifest order, one Unit's data only, immutable final, superseding correction, order totals accurate.
Dependencies: E2-E3 and approved assets/templates. Tests: all critical PDF scenarios below. Docs: manifest/asset registration, failure recovery.

### Epic F - Integration, search and operations

**F1. Add PostgreSQL search projection**
Acceptance: supported identifiers/text find exact typed results with permission filtering and anchors.
Dependencies: B-D. Tests: typo/trigram, unauthorized target, indexing replay. Migration: extensions/indexes/projection.

**F2. Add Teams links and milestone notifications**
Acceptance: approved events only, environment destination isolation, deduplication, deep links, failures visible without rolling back manufacturing action.
Dependencies: D2, Teams approval, outbox. Tests: thresholds/retry/dedup/non-production destinations. Docs: notification matrix.

**F3. Add dashboards, observability, backup and recovery runbooks**
Acceptance: operational metrics/alerts and successful database/blob/document restore drill.
Dependencies: all foundation services. Tests: alert injection, dead-letter replay, restore evidence. Docs: on-call/support and recovery.

**F4. Prepare pilot training and UAT**
Acceptance: role-based guides, support escalation, feedback log, signed UAT and rollback rehearsal.
Dependencies: all MVP tickets. Tests: scripted UAT on target devices. Docs: training and pilot runbook.

## Test strategy

### Automated layers

- **Unit:** ID formatting, state transitions, progress calculations, tolerance evaluation, condition expressions, policy decisions, filename/manifest construction.
- **Database:** constraints, migrations, transactions, outbox, idempotency, optimistic concurrency, append-only protections, projection rebuild.
- **API/contract:** schemas, authentication, role/facility policy, friendly errors, retries, pagination, target consistency.
- **Component/UI:** identity banner, large controls, pending/saved states, validation, keyboard/touch behavior, list-detail retention.
- **End-to-end:** real browser, database, object emulator/test storage, queue worker, rendered documents, and target tablet browsers.
- **Security:** unsafe redirects, ID enumeration, cross-Unit attachment, malicious file/type mismatch, SAS scope/expiry, privilege escalation, injection, audit tampering.
- **Recovery:** queue retry/dead letter, worker crash, orphan uploads, partial document job, backup restore, projection replay.

### Critical end-to-end scenarios

1. Confirming a quantity-five line creates exactly five independent Units and stable QR identities.
2. The five Units occupy different route states; every progress fraction returns the exact matching set.
3. One Unit receives CD4 while siblings remain at ordered 316SS; original, approval and as-built records appear correctly.
4. One Unit receives a measured custom machining instruction with before/after evidence and verification.
5. One Unit fails inspection, enters rework, passes reinspection, and retains the failed attempt.
6. One employee pauses with a full handoff; another resumes at the same location/state.
7. A Unit-targeted photo, checklist response, measurement and PDF never appear on a sibling Unit.
8. A safe-retry after lost connectivity creates one completion event; a stale conflicting edit requires review.
9. A Unit moves Houston -> Mississauga -> Houston with dispatch/receipt, custody, contents and discrepancy evidence preserved (Phase 2 gate).
10. Reprinting a pre-serial QR after serial assignment opens the same Unit and records a print event only.
11. A user without access signs in from QR and receives a friendly denial without record details.
12. Final Unit PDFs include correct ordered/as-built/changes/checklists/evidence/shipping; order summary reflects all five Units.

### PDF validation matrix

- Type checks, lint, unit/API tests and document tests run before sample generation.
- Generate samples for one Unit, quantity five with mixed states, material substitution, special instruction, rework, long content, and maximum selected-photo budget.
- Validate manifest schema, registered asset ID/checksum/page count, job UUID/temp isolation, output uniqueness, PDF parseability, page order/count, expected text anchors, Unit ID isolation, checksum and immutable release metadata.
- Render every page to images and inspect for clipping, overlap, missing fonts/glyphs, broken tables, image orientation/resolution, QR readability, headers/footers, and accidental blank pages.
- Confirm the existing application interface and non-document workflows still pass smoke tests after document changes.

### UAT scripts

Coordinator imports/verifies/releases; technician scans/executes/pauses/resumes; quality fails/reworks/releases; shipping packages/dispatches; manager reviews fractions/blockers; auditor traces correction; administrator reprints/retire-resolves a label. Record task time, errors, help requests, mis-target attempts, and user feedback.

## Definition of done for every implementation ticket

- Scope/exclusions and acceptance criteria are satisfied without unrelated refactoring.
- Migrations and rollback/forward-fix behavior are documented and tested.
- Type check, lint, relevant unit/API/UI tests, and build pass; document tickets also pass sample-generation/visual gates.
- Permission, audit, concurrency, idempotency, failure, empty and tablet states are covered in proportion to risk.
- Documentation, decision log, implementation status, and handoff are current.
- Git diff is focused, working tree state is reported, and completion claims include exact evidence.
