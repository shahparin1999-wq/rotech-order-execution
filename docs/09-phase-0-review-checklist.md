# 09 - Phase 0 Discovery and Design Review Checklist

## Purpose

Use this checklist to convert the planning package into approved implementation inputs. The review is complete only when the evidence and sign-offs below exist. Discussion notes alone are not approval.

## Required participants

| Role | Responsibility in review |
| --- | --- |
| Product owner | Confirms pilot outcome, scope, priorities, usability, and decision ownership |
| Order coordinator | Confirms AIMCOR intake, verification, order/line fields, and exception handling |
| Production owner | Confirms Unit identity, route, task ownership, handoffs, labels, and floor workflow |
| 1196 technician representative | Performs realistic tablet/scan/checklist tasks and identifies friction |
| Quality owner/inspector | Approves checklist rules, tolerances, evidence, rework, release, and PDFs |
| Shipping representative | Confirms packaging checklist, dimensions, carrier fields, and evidence |
| Technical owner | Confirms architecture, Entra/Azure/Teams prerequisites, security, recovery, and support |
| Executive sponsor | Resolves scope/ownership conflicts and authorizes the pilot gate |

One person may fill more than one role, but Production and Quality approvals must remain explicit.

## Review inputs

- [Planning-package index](../README.md)
- [Evidence and recommendation](01-evidence-and-recommendation.md)
- [Workflows and PRD](02-workflows-and-prd.md)
- [Data model and lifecycle rules](03-information-architecture-and-states.md)
- [UX, templates, and QR strategy](04-ux-templates-and-qr.md)
- [Document and technical architecture](05-document-and-technical-architecture.md)
- Supplied AIMCOR/work-order PDFs, Teams screenshots/training, 1196 checklist, other checklist, and machining form
- Target shop-floor tablet/phone, normal production Wi-Fi, and proposed printers/media

## Workshop 1 - Scope, source of truth, and identifiers

- [ ] Confirm the pilot accepts only new Mississauga 1196 bare pump-end orders.
- [ ] Confirm AIMCOR remains commercial truth and define who corrects mismatches in each system.
- [ ] Confirm the application owns structured execution, QC, evidence, changes, release, and final histories.
- [ ] Confirm Teams remains discussion/notification and cannot serve as the only record of a controlled decision.
- [ ] Approve Order/Line/Unit terminology and `order_line.sequence` Unit ID format.
- [ ] Approve creation of Unit IDs and QR identities before serial assignment.
- [ ] Confirm cancelled Unit sequences and public references are never reused.
- [ ] Confirm one master Order spans facilities and location queues never duplicate an Order.
- [ ] Define pilot eligibility owner and the exception path for ineligible orders.

Required evidence:

- Decision-log entries for source-of-truth boundaries, pilot eligibility, Unit IDs, and QR identity.
- One worked example showing quantity five creates five independent Units.
- One correction example showing AIMCOR source, verified value, and audited application correction.

## Workshop 2 - 1196 route, checklist, and quality controls

Review every operation in the current 1196 form and record an approved rule, not just wording.

| Item to approve | Required decision |
| --- | --- |
| Applicability | Always required, optional, or conditional expression |
| Scope | Order, Line, Unit, component, or packaging |
| Owner | Technician, Production, Quality, Shipping, or another role |
| Sequence/dependency | Prior operation and readiness conditions |
| Response type | Yes/no, pass/fail, text, numeric measurement, selection, or sign-off |
| Measurement | Unit, nominal/range/tolerance, rounding, and boundary behavior |
| Evidence | Required/optional photo, video, file, material marking, or instrument reference |
| Failure | Block, review, rework, retest, override authority, and required reason |
| Completion | What makes the item/operation/Unit complete |

Explicitly resolve:

- [ ] Material grades and traceability evidence for casing, impeller, SBC, shaft, and sleeve.
- [ ] Powerframe leak/free-rotation test and whether video is mandatory.
- [ ] Correct shaft/sleeve type and installed condition.
- [ ] Impeller trim value, unit, tolerance, and evidence.
- [ ] Shaft/sleeve runout values, instruments, units, and limits.
- [ ] Axial play limit, including the current “less than 2 thou” wording.
- [ ] Mechanical-seal type/material fields and approval rules.
- [ ] Plan 11 applicability rule.
- [ ] Pump-travel limits for STR, M/L, and XLR configurations.
- [ ] Impeller-clearance method, unit, target/tolerance, and inspector rule.
- [ ] Fastener material/torque requirements and free-rotation evidence.
- [ ] Hydrotest pressure, duration, pass criteria, evidence, and re-test policy.
- [ ] Seal clips, warning tags, touch-up, oil state, and nameplate requirements.
- [ ] Final Quality inspection, separation of duties, release, override, and reopening.
- [ ] Labour-session capture and whether totals are operational or payroll-excluded.
- [ ] Packaging checklist, shipping photo requirements, weight, and dimensions.

Required evidence:

- Approved 1196 definition worksheet with no unresolved tolerance or evidence placeholders.
- Golden fixtures for standard pass, conditional step, failed/rework, and material-change Units.
- Quality-owner signature and template revision owner.

## Workshop 3 - UX and shop-floor observation

Use clickable prototypes or paper wireframes for all three concepts in Document 04.

- [ ] Coordinator imports the sample PDF, compares suggestions with source, corrects a field, and confirms two Units.
- [ ] Technician finds assigned work through My Work and through a Unit QR.
- [ ] Technician identifies the correct Unit without relying on screen memory or browser history.
- [ ] Technician starts, measures, photographs, pauses, hands off, resumes, and completes an operation.
- [ ] Technician encounters lost connectivity and can distinguish pending from saved work.
- [ ] Technician attempts a wrong-Unit photo/material scan and understands the prevention message.
- [ ] Quality reviews missing evidence, fails an item, routes rework, reinspects, and releases.
- [ ] Shipping records packaging, weight/dimensions, carrier/PRO, and dispatch.
- [ ] Coordinator opens a `2/5` progress count and sees the exact two Units.
- [ ] User converts a Teams-style comment into a structured task/change/instruction.
- [ ] Desktop, tablet landscape, and tablet portrait navigation remain understandable.
- [ ] Keyboard/focus, contrast, text labels, font size, and touch targets are acceptable.

Capture for each observed task: participant role, device/browser, elapsed time, errors, help requested, backtracking, wrong-target concern, and recommendation. Resolve every safety/quality usability finding before Phase 0 approval.

## Workshop 4 - QR labels and physical handling

- [ ] Print master, Unit, component/material, transfer, and pallet samples at actual size.
- [ ] Confirm readable identifiers remain useful when the QR cannot scan.
- [ ] Scan before and after serial assignment and confirm the same Unit opens.
- [ ] Test normal floor lighting, distance, camera types, dirt/oil exposure, shrink wrap, abrasion, and protected placement.
- [ ] Confirm Unit tag placement on pallet/traveller rather than an unsuitable pump surface.
- [ ] Confirm label contents expose no sensitive data beyond approved human-readable fields.
- [ ] Test lost/damaged/reprint flow and ensure no duplicate Unit is created.
- [ ] Select pilot print profiles and existing printers; record whether thermal-transfer procurement is deferred.
- [ ] Assign ownership for label stock, printer setup, reprints, and damaged tags.

Required evidence: photos of each attached sample, scan matrix by device/condition, selected profile/media, placement SOP, and decision-log entries.

## Workshop 5 - Final PDFs and document governance

- [ ] Approve Work Order Plan sections and handwritten-note space.
- [ ] Approve Unit QC/manufacturing-history sections and exact required evidence categories.
- [ ] Approve order completion summary fields and Unit-document references.
- [ ] Identify every approved technical PDF asset needed by the 1196 pilot and register owner/source/checksum/page expectations.
- [ ] Confirm no runtime filename inference and approve normalization rules.
- [ ] Confirm dynamic HTML, fixed-overlay, registered-asset, manifest-merge, and isolated-job boundaries.
- [ ] Approve draft watermark, final release, immutability, correction/supersession, retention, and access.
- [ ] Approve photo selection/size limits and original-versus-PDF-derivative retention.
- [ ] Review rendered golden samples for standard, material change, special instruction, and rework.

Required evidence: approved manifests, asset inventory, rendered-page review record, version/correction example, and Quality sign-off.

## Workshop 6 - Security, operations, and pilot readiness

- [ ] Confirm Entra tenant/application owner and role-to-group assignments.
- [ ] Approve facility scope and the permission/separation-of-duty matrix.
- [ ] Confirm Azure subscription/resource ownership, environments, region/data residency, networking, and budget owner.
- [ ] Confirm Teams workflow/bot method, destination, permissions, notification matrix, and non-production isolation.
- [ ] Approve file types/sizes, retention, malware scanning decision, and privacy treatment.
- [ ] Approve logs/metrics/alerts without using pilot metrics as employee performance scoring.
- [ ] Approve backup configuration and measured restore drill; replace planning RPO/RTO with signed targets.
- [ ] Confirm support roles, severity definitions, floor champions, fallback traveller, reconciliation, and stop conditions.
- [ ] Confirm pilot cohort, eligible-order admission, daily review, exit metrics, and source-of-truth cutover authority.

Required evidence: permission matrix, environment/prerequisite register, notification matrix, restore report, support/fallback runbook, pilot roster, and signed cutover criteria.

## Phase 0 exit gate

Backlog ticket A1 is authorized only when:

- [ ] All six workshops are complete and linked evidence is retained.
- [ ] Every required decision is `Accepted` in the decision log; no safety/quality/identity/source-of-truth/document blocker remains `Proposed`.
- [ ] The 1196 definition and golden fixtures are approved by Production and Quality.
- [ ] UX observation and physical label tests have no unresolved severity-one/two issue.
- [ ] Entra/Azure/Teams owners and environment prerequisites are confirmed.
- [ ] PDF manifests/assets and immutable correction behavior are approved.
- [ ] Pilot scope, users, support, fallback, exit metrics, and cutover authority are named.
- [ ] Product owner, Production owner, Quality owner, and Technical owner sign below.

## Approval record

| Approval | Name | Decision | Date | Evidence/notes |
| --- | --- | --- | --- | --- |
| Product owner |  | Pending |  |  |
| Production owner |  | Pending |  |  |
| Quality owner |  | Pending |  |  |
| Technical owner |  | Pending |  |  |
| Executive sponsor |  | Pending |  | Required for pilot authorization |

