# 07 - Pilot, Migration, Risks, and Success Metrics

## Pilot objective and boundary

Prove that the application can become the execution and QC source of truth for new 1196 bare pump-end orders in Mississauga without disrupting AIMCOR or losing the communication value of Teams.

Include only orders created after the pilot start, one approved 1196 template revision, selected coordinators/production/quality/shipping users, and application-generated Unit labels/documents. Keep the existing master Teams thread in parallel. Do not migrate active historical orders, launch Houston execution, add packages, or add other product templates during the pilot.

## Introduction sequence

### 1. Prepare

- Name executive sponsor, product owner, production owner, quality owner, technical owner, and on-floor champions.
- Approve roles, Unit identifier policy, 1196 route/checklist/tolerances, evidence rules, PDF manifests, label profiles, and retention.
- Verify target devices, camera permissions, Wi-Fi coverage, sign-in, printer behavior, label attachment, and support contacts.
- Complete security review, backup/restore drill, UAT, training, rollback rehearsal, and known-limitations register.

### 2. Shadow validation

- Use synthetic/test orders derived from the supplied sample; do not treat test records as production.
- Run coordinators, technicians, quality, and shipping through full flows on target devices.
- Compare generated checklists and PDFs against approved expected records.
- Resolve all severity-one/two defects and repeat affected acceptance scenarios.

### 3. Parallel production pilot

- Enrol a small number of new eligible orders, initially one at a time.
- AIMCOR remains commercial truth; Teams remains visible and contains the application link.
- The application captures structured execution. Teams need not duplicate every checklist response; required milestone notifications link back to the application.
- Hold a brief daily review of blocked work, missing data, pending synchronization, wrong-target reports, failed jobs, and user feedback.

### 4. Stabilize and evaluate

- Review every completed pilot order with production and quality.
- Compare application status with the physical floor and Teams thread.
- Audit Unit separation, evidence completeness, changes, release, label history, and documents.
- Prioritize workflow friction and correctness before adding features.

### 5. Source-of-truth cutover

The application becomes the execution/QC source of truth only after the exit criteria below are met and the sponsor, production owner, and quality owner sign the decision. AIMCOR remains commercial truth. Teams remains discussion/notification infrastructure; controlled status, checklist, measurement, change, and release records must be entered in the application.

## Pilot eligibility

An order is eligible when it is a new Mississauga 1196 bare pump-end order, uses supported configuration/checklist rules, has an available AIMCOR PDF, and has no required package/cross-location/external-processing workflow outside the pilot. The coordinator records an explicit reason when declining an order.

## Training and support

- Role-based sessions: coordinator intake; technician scan/execute/handoff; quality/rework/release; shipping; manager/auditor.
- Use task cards with QR practice tags and a sandbox order. Training completion is recorded.
- Put a named floor champion on each pilot shift and one technical escalation channel.
- Severity 1: data loss/security/wrong Unit/release integrity - stop affected workflow and escalate immediately.
- Severity 2: controlled action unavailable or document incorrect - use documented paper/Teams fallback and reconcile before release.
- Severity 3/4: usability/reporting issue - log with reproduction, target role/device, and business impact.

## Fallback and rollback

- Before cutover, Teams/paper remains the official fallback. If the app is unavailable, employees use the approved fallback traveller and do not later backdate or overwrite history.
- On recovery, a coordinator reconciles fallback actions as clearly marked historical entries with actual occurrence time, entry time, actor/source, evidence, and reviewer.
- Stop admitting new pilot orders for unresolved Unit-mixing, audit loss, incorrect release/PDF, widespread synchronization failures, security incident, or inability to restore.
- Rolling back the pilot changes the source-of-truth flag and admission policy; it does not delete application records, QR identities, audit events, or released documents.

## Exit criteria

- At least ten eligible orders and twenty Units, or another sponsor-approved statistically useful sample, complete the full process.
- 100% of Units have unique Unit IDs/QRs, required checklist responses, required evidence, release audit, and retrievable final documents.
- Zero confirmed cross-Unit evidence, measurement, change, inspection, or document leakage.
- Zero duplicate controlled events caused by retry/reconnect.
- All material changes/special instructions are structured and approved; none remain only in Teams.
- Physical floor status and application status agree in each completion audit.
- No open severity-one/two defect; recovery and notification failure procedures have been exercised.
- At least 90% of pilot users can complete their core role flow without assistance in observed UAT, with no unresolved safety/quality usability finding.
- Sponsor, production owner, quality owner, and technical owner sign the decision and documented residual risks.

## Risk register

Likelihood/impact use Low/Medium/High during the pilot.

| Risk | L | I | Mitigation and detection | Owner |
| --- | --- | --- | --- | --- |
| Shop-floor UI is overcomplicated | M | H | Observe real tasks; large role-focused actions; measure completion/help/backtracking | Product owner |
| Employees avoid or duplicate the system | M | H | Champions, narrow pilot, visible source-of-truth rule, adoption dashboard, daily reconciliation | Production owner |
| Excessive typing slows work | M | M | Context defaults, QR entry, typed controls, short notes; measure time/keystrokes | Product owner |
| Poor Wi-Fi loses/duplicates actions | H | H | Pending state, request IDs, idempotent commands, no false success; monitor retry/conflict rates | Technical owner |
| Photo/change attaches to wrong Unit | M | H | Persistent identity banner, target lock, confirmation, server ancestor validation; audit anomalies | Quality owner |
| Incorrect PDF extraction creates Units | M | H | Untrusted draft, source comparison, required verification; sample/production audits | Order coordinator |
| Incorrect quantity/Unit generation | L | H | Transactional exactly-once generation and constraints; quantity fixture tests and alert | Technical owner |
| Template error affects many Units | M | H | Immutable approvals, golden fixtures, owner sign-off, revision diff and rollback by new revision | Template/quality owners |
| Uncontrolled template change | L | H | Role separation, approved states, audit, active-order isolation | Template approver |
| AIMCOR data mismatch after confirmation | M | H | Preserve source/checksum, structured commercial correction, reconciliation report | Order coordinator |
| Duplicate records/files | M | M | UUID/random paths, uniqueness constraints, checksum/idempotency, orphan cleanup | Technical owner |
| Material decision remains only in Teams | M | H | Convert-to-change, release completeness rule, audit of relevant comments | Production/quality owners |
| Teams notifications become noise | M | M | Milestone matrix, dedup/update, follow/mute controls, volume review | Product owner |
| Teams integration permission/availability fails | M | M | Links remain functional; outbox retries/dead letter; manufacturing transaction never rolls back | Technical owner |
| Oversized or unreadable PDFs | M | M | Photo budgets/derivatives, async generation, render QA, size/page metrics | Quality/technical owners |
| Final PDF contains sibling Unit data | L | H | Snapshot target constraints, isolated queries/jobs, negative fixture tests, release review | Quality owner |
| Weak auditability or silent correction | L | H | Append-only events, supersession, restricted correction, periodic audit export review | Quality/auditor |
| Permission mistake allows unsafe action | M | H | Server policy matrix, group-role review, least privilege, denial/audit tests | Security/system admin |
| QR/tag damaged or detached | H | M | Human-readable ID, protected placement, durable media test, reprint/history | Production owner |
| QR old/superseded record misleads user | L | H | Stable resolver, status banner, redirect notice and current-record link | Technical/product owners |
| Scope expands during pilot | H | M | Eligibility rule, decision log, separate Phase 2 backlog, sponsor gate | Product owner |
| Custom system lacks maintainers | M | H | Modular design, runbooks, tests, handoffs, named internal/external support | Sponsor/technical owner |
| Two agents edit overlapping work | M | M | One implementation worktree owner, committed handoff, review worktree, clean-state checks | Technical owner |
| Database/blob recovery unproven | L | H | Backup policies and restore drills before cutover; record measured RPO/RTO | Technical owner |

## Success metrics

Metric definitions use production-eligible Units only and exclude documented cancelled/test records.

| Metric | Definition | Pilot target / interpretation |
| --- | --- | --- |
| Digital checklist completeness | Released Units with every required response/evidence / released Units | 100% |
| Required photo completeness | Captured required categories / required categories due | 100% at release |
| Unit-level status coverage | Active Units with calculable current status/operation / active Units | 100% |
| Serial linkage gap | Released serialized Units missing serial association | 0 |
| Undocumented substitutions | Audited substitutions lacking structured approved change | 0 |
| Unowned blockers | Blocked Units without responsible owner/next review | 0 after one shift |
| Wrong-target incidents | Confirmed cross-Unit evidence/data associations | 0; any incident stops affected release |
| Duplicate controlled events | Duplicates caused by retry/scan/reconnect | 0 |
| Status lookup time | Median observed time to answer current Unit status/location/blocker | Baseline then >=50% reduction |
| QC package lead time | Completion-to-released-document elapsed time | Median <15 minutes excluding failed prerequisites |
| On-time production completion | Units completed by internal required date / due Units | Trend; do not attribute causality during small pilot |
| Rework rate | Units with rework / inspected Units, by reason/template revision | Establish baseline and detect clusters |
| Adoption | Eligible controlled actions recorded in app / all such actions from reconciliation | >=95% before cutover |
| Handoff completeness | Pauses containing every required handoff field / pauses | 100% |
| Pending-sync age | 95th percentile time from local pending to confirmed save | Set after Wi-Fi test; no item unresolved at shift end |
| User independence | Users completing core observed flow without assistance | >=90% |
| Notification usefulness | Actioned/acknowledged milestone notices and user feedback vs volume | Review weekly; remove low-value notices |
| Document accuracy | Released PDFs passing Unit/source/manifest audit | 100% |

Metrics must include numerator, denominator, exclusions, reporting time zone, and data freshness. Management dashboards show operational truth, not employee performance scoring without a separate approved policy.

## Expansion decision

After pilot exit, choose only one next complexity: Houston/Mississauga transfers, complete packages, or a second product family. Base the choice on observed volume/risk and reopen discovery for the selected workflow. Do not combine all three in one expansion release.

