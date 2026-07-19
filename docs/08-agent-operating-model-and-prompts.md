# 08 - Agent Operating Model, Handoff, and Reusable Prompts

## Operating model

1. Begin every slice from an identified clean integration branch and record its commit hash.
2. Create one `codex/<scope>` or equivalent feature branch/worktree per implementation slice.
3. One agent owns an implementation worktree at a time. Another agent may review committed changes from a separate worktree.
4. Inspect repository instructions, current implementation, migrations, tests, and dirty state before proposing edits.
5. State scope, explicit exclusions, assumptions, acceptance criteria, and files likely to change before implementation.
6. Keep changes coherent and small. Do not mix opportunistic refactors with a feature or bug fix.
7. Treat migrations, API/schema changes, document snapshots/manifests, audit semantics, and identifiers as compatibility-sensitive.
8. Run proportionate validation before committing. A green broad suite never replaces focused tests and direct probes of critical invariants.
9. Commit only a coherent validated slice. Report exact commands/results and unresolved issues.
10. Update the decision log and implementation status with durable decisions, not transient narration.
11. Handoff only committed work unless the receiver explicitly accepts a described dirty diff. Never allow concurrent edits in the same dirty worktree.
12. Rebase/merge only after the prior owner commits and the integration baseline is rechecked.

## Required validation order

For normal changes: type checks -> lint -> focused unit/API/database tests -> affected UI/end-to-end tests -> build -> diff/working-tree checks. For document-generator changes, also generate every approved sample configuration, inspect rendered pages, verify manifests/assets/job isolation, and smoke-test the existing interface.

If a configured command is unavailable, report the exact blocker and use only a documented equivalent; do not silently skip a gate or weaken behavior.

## Agent handoff template

```text
Objective:
Scope and explicit exclusions:
Branch:
Worktree:
Base commit:
Current commit:
Worktree clean (yes/no):
Files changed:
Public API/type changes:
Database migrations and rollback/forward-fix:
Completed work:
Remaining work:
Decisions made and decision-log entries:
Assumptions:
Known issues/risks:
Tests and exact results:
Manual/browser/document verification:
Screenshots or evidence locations:
Exact next task:
Files/areas the next agent must not modify:
```

## Prompt 1 - Claude architecture review

```text
You are reviewing the Rotech Order Execution and Digital Traveler planning/architecture in this repository. This is an internal manufacturing execution system: AIMCOR remains commercial truth; the application owns Unit-level execution/QC; Teams is collaboration/notification. The first pilot is new 1196 bare pump-end orders in Mississauga.

Read AGENTS.md and all planning documents before reviewing. Inspect the repository and Git status; do not edit files. Review domain boundaries, Unit/package identity, template revisions, state machines, authorization, audit/correction, idempotency/concurrency, uploads, QR/deep links, PDF snapshots/manifests, Azure services, failure handling, and pilot scope. Preserve explicit non-goals and the rule that quantity N creates N independent Units.

Report only evidence-backed findings, ranked by severity, with exact file/section references, impact, and a concrete correction. Separate confirmed defects from questions or optional improvements. Identify assumptions. Check for contradictions across documents, unsafe silent fallbacks, missing migrations/compatibility concerns, and tests that would fail to detect cross-Unit leakage. Do not propose unrelated refactors. Finish with approval: YES/NO for build readiness and the minimum blocker list.
```

## Prompt 2 - Codex repository discovery

```text
Perform read-only discovery for the Rotech Order Execution and Digital Traveler repository. The target is an Azure-hybrid TypeScript modular monolith with PostgreSQL, Entra, Blob Storage, Service Bus, a worker, stable QR identities, append-only audit, and manifest-driven PDFs. The pilot is new 1196 bare pump-end orders in Mississauga; no AIMCOR replacement, pricing, accounting, full inventory, or full offline execution.

Read AGENTS.md and planning documents first. Inspect Git branch/commit/status, repository structure, manifests, runtime/tooling, architecture, schemas/migrations, auth, tests, deployment, and current implemented scope. Do not edit, install, migrate, generate tracked files, or change external state. Run only safe read-only checks and non-mutating tests when useful.

Return: baseline evidence; implemented vs planned capability matrix; dependency/runtime constraints; architecture and data-flow map; test commands that actually exist; dirty/untracked files and ownership concerns; security/document-generator constraints; top implementation blockers; recommended smallest next slice with exact acceptance criteria and likely files. State all assumptions and exact commands/results. Do not claim a capability without direct evidence and do not propose unrelated refactoring.
```

## Prompt 3 - Codex MVP foundation implementation

```text
Implement the first approved foundation slice for the Rotech Order Execution and Digital Traveler. Before editing, read AGENTS.md, README.md, Documents 02, 03, 05 and 06, inspect Git branch/commit/status and current code, and confirm the worktree is dedicated and clean. Stop and report if the baseline or scope conflicts.

Scope: establish only the agreed TypeScript modular-monolith/application-worker boundaries, PostgreSQL development setup, environment validation, health/readiness behavior, test/type/lint/build commands, and documentation needed for a reproducible local foundation. If identity/audit/database schema work is not explicitly included in the assigned ticket, leave it for its own slice. Do not implement UI features, AIMCOR parsing, templates, QR, PDFs, Teams, pricing, inventory, or unrelated refactors.

Use pinned dependencies and no secrets. Preserve future boundaries without speculative abstraction. Add focused automated tests and update setup/status/decision documentation. Run type checks, lint, focused tests and build; report exact results. Inspect the final diff and worktree. Commit only if explicitly requested. Final response: outcome, files changed, interfaces/config introduced, tests/results, assumptions, known issues, and exact next slice. Never silently skip a gate or add fallback behavior that hides configuration errors.
```

## Prompt 4 - Claude post-implementation review

```text
Review the committed implementation slice for the Rotech Order Execution and Digital Traveler against its planning ticket and acceptance criteria. Read AGENTS.md and relevant planning documents. Inspect the base/current commits, committed diff, migrations, tests and current worktree. Do not edit files or change external state.

Check correctness, scope discipline, existing-feature preservation, Unit isolation, authorization, audit, concurrency/idempotency, failure behavior, migration compatibility/rollback, secrets, logging, and test quality as applicable. For PDF work, check registered assets, manifest order, unique job isolation, snapshots/checksums, immutable versions, real generated samples and visual verification. Re-run focused non-mutating checks where possible.

Report actionable findings first, ranked by severity, with exact file/line evidence and impact. Distinguish blockers from optional improvements. Identify assumptions and validation gaps. Confirm whether unrelated files/features changed. End with acceptance YES/NO, exact blocker list, exact commands/results, and whether the worktree is clean. Do not praise, rewrite the plan, or request broad refactoring without evidence.
```

## Prompt 5 - Codex browser verification

```text
Perform browser verification for the implemented Rotech Order Execution slice. Read AGENTS.md, the assigned ticket, UX rules in Document 04, and test expectations in Document 06. Inspect current branch/commit/status. Do not edit code unless the user separately authorizes fixes; this task is verification only.

Use the real local application and supported browser. Verify desktop and target tablet viewport behavior, authentication/return paths where testable, persistent Order/Unit identity, role-visible actions, loading/empty/error/offline-pending states, keyboard/focus/contrast basics, touch target usability, deep links, and no loss of list context. Execute the exact ticket scenario plus negative cases for wrong Unit, stale state, duplicate retry, unauthorized action, camera/upload failure, and recovery where applicable. Capture screenshots/evidence without exposing secrets or customer data beyond approved fixtures.

Report environment, URL/fixture, commit, steps, observed results, console/network errors, screenshots, and PASS/FAIL per acceptance criterion. Identify assumptions and anything not testable. End with release recommendation YES/NO and concise blockers. Do not silently substitute static inspection for real browser behavior and do not modify external production data.
```

## Prompt 6 - Reusable feature implementation

```text
Implement this scoped Rotech Order Execution feature: [OBJECTIVE]. Acceptance criteria: [CRITERIA]. Explicit exclusions: [EXCLUSIONS].

Before editing, read AGENTS.md and relevant planning documents, inspect Git branch/base commit/status, existing implementation, migrations, tests and adjacent features. Confirm a dedicated clean worktree; preserve all existing order/configuration/pricing/BOM/customer/portal/document functionality outside scope. State assumptions and the intended smallest coherent change. Stop if the requested behavior conflicts with identifiers, Unit isolation, template immutability, audit/correction, document rules, or the current baseline.

Implement without unrelated refactoring or silent fallback. Controlled mutations must enforce authorization, explicit target, optimistic concurrency, idempotency, transactional audit/outbox behavior, and friendly failure states as applicable. Add/update focused unit, database, API, UI and end-to-end tests proportional to risk. Document public interfaces, migrations, rollback/forward-fix and operational changes. For document work, follow registered-asset/manifest/job-isolation/render-verification rules.

Run type checks, lint, focused tests, relevant broader tests, build, and required sample/browser validation. Inspect final diff and worktree. Final response must state outcome, exact files/interfaces/migrations, tests and results, manual evidence, assumptions, known risks, excluded areas preserved, and next step. Commit only if explicitly requested.
```

## Prompt 7 - Reusable bug fix

```text
Diagnose and fix this Rotech Order Execution defect: [DEFECT]. Expected behavior: [EXPECTED]. Reproduction/evidence: [EVIDENCE]. Explicit exclusions: [EXCLUSIONS].

Read AGENTS.md and relevant planning documents. Inspect branch/base/status and reproduce the defect against the real code/runtime before editing. Trace the data path and identify root cause; do not patch only the symptom, weaken validation, suppress errors, or add silent fallback. Check whether the defect affects sibling Units, audit history, retries, permissions, template versions, attachments, documents, or existing functionality.

Implement the narrowest durable fix and a regression test that fails before and passes after. Add direct probes for critical invariants. Run type checks, lint, focused tests, affected integration/UI tests, build, and real runtime/browser/document verification as applicable. Preserve user-owned unrelated changes. Document any migration or data repair separately and do not execute destructive repair without explicit authorization.

Final response: reproduced evidence, root cause, fix, files/interfaces/migrations, exact tests/results, manual verification, assumptions, remaining risk, exclusions preserved, and worktree state. Commit only if requested; never claim resolution without the regression test and runtime evidence.
```

## Prompt 8 - Reusable migration review

```text
Review the proposed Rotech Order Execution database/data migration: [MIGRATION/DIFF]. This is read-only unless explicitly authorized otherwise. Read AGENTS.md, Documents 03/05/06, repository migration conventions, current schema, and dependent code/tests. Inspect branch/base/status and exact migration order.

Evaluate forward compatibility, rollback/forward-fix, locks/downtime, transaction boundaries, constraints/indexes, UUID/business/publicRef preservation, Unit isolation, template/document/audit immutability, backfill determinism, idempotent deployment, partial failure, production data volume, backup/restore, and old/new application coexistence. Ensure no destructive default, identifier reuse, silent data coercion, audit loss, cross-Unit association, or generated-document drift.

Run safe schema/static tests and migration tests only in isolated disposable databases; never alter production or user data. Report findings by severity with exact evidence, required fixes, assumptions, tested commands/results, rollout steps, verification queries, abort conditions, and recovery plan. End with migration approval YES/NO and blockers. Do not approve merely because the migration applies to an empty database.
```

## Prompt 9 - Reusable release readiness

```text
Perform a final read-only release-readiness assessment for Rotech Order Execution release [VERSION/COMMIT]. Read AGENTS.md, planning acceptance gates, release diff, migrations, test reports, runbooks, known issues and environment configuration. Verify branch/commit/tracked cleanliness and compare with the approved baseline. Do not edit, deploy, push, migrate, notify users, or change production state.

Assess scope completeness, regression risk, permissions, audit/idempotency/concurrency, Unit isolation, uploads/storage, queues/dead letters, Teams environment isolation, observability, backup/restore evidence, migration/rollback, browser/tablet UAT, accessibility basics and support/training. For document changes, require type/lint/tests, approved sample packages, asset/manifest validation, unique jobs, immutable versions and visual page inspection.

Return exact evidence: commits/diff scope, commands and test counts/results, sample/runtime probes, unresolved risks, excluded areas unchanged, deployment prerequisites, go/no-go checklist, rollback triggers, and worktree state. End with DEPLOYABLE YES/NO and the minimum blocker list. Do not substitute prior summaries for current verification or make external changes.
```

## Prompt 10 - Reusable agent handoff

```text
Prepare a factual handoff for the current Rotech Order Execution work. Read AGENTS.md, the assigned ticket, planning documents, decision/status logs, Git branch/base/current commits, status, diff, migrations, tests and generated evidence. Do not implement new work, clean/reset user changes, commit, push or modify external state unless explicitly requested.

Use the repository handoff template exactly. Include objective, scope/exclusions, branch/worktree/base/current commit, cleanliness, files and public interfaces changed, database/document changes, completed and remaining work, decisions/assumptions, known issues/risks, exact validation commands/results, manual/browser/PDF evidence, exact next task, and protected files/areas. Distinguish committed changes from dirty/untracked work and identify ownership of every dirty file.

Verify claims from the repository/runtime rather than copying an older summary. If a required test or artifact is missing, say so. If the work is not safe to transfer, state HANDOFF BLOCKED with the minimum corrective steps; otherwise state HANDOFF READY. Do not hide failures or broaden the next agent's authority.
```

## Prompt maintenance

These prompts are controlled project assets. Update them when architecture, validation commands, or release gates change, and record why in the decision log. Do not embed secrets, tenant IDs, production URLs, or mutable branch hashes in reusable prompt text.
