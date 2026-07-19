# AGENTS.md - Rotech Order Execution Agent Contract

Every agent (implementation, review, verification, or handoff) working in this
repository must read this file first, then follow the referenced documents. This
file is the entry point the reusable prompts in
[docs/08-agent-operating-model-and-prompts.md](docs/08-agent-operating-model-and-prompts.md)
refer to.

## Required reading order

1. This file.
2. [README.md](README.md) - project scope, locked decisions, terminology, and gates.
3. [docs/08-agent-operating-model-and-prompts.md](docs/08-agent-operating-model-and-prompts.md) - operating model, validation order, handoff template, and reusable prompts.
4. [docs/DECISIONS.md](docs/DECISIONS.md) - accepted and pending decisions; agents may not decide pending business decisions.
5. The assigned ticket in [docs/06-roadmap-backlog-and-tests.md](docs/06-roadmap-backlog-and-tests.md) plus any planning documents the ticket names.

## Mandatory working rules

- **Verify a clean baseline before editing.** Record branch, base commit, and
  `git status`. Stop and report if the worktree is dirty with changes you do not
  own or if the baseline conflicts with the assigned ticket.
- **One agent per dirty worktree.** Never edit concurrently in a worktree
  another agent has left dirty. Review happens from a separate worktree against
  committed changes only.
- **Keep changes narrow.** Implement only the assigned slice. No opportunistic
  refactors, no scope growth, no speculative abstraction.
- **Provide tests and evidence.** Run the validation order defined in
  document 08 (type checks, lint, focused tests, affected UI/end-to-end tests,
  build, diff/worktree inspection). Report exact commands and results. A claim
  of completion without evidence is invalid.
- **State assumptions explicitly.** Any assumption made to proceed must appear
  in the final report and, when durable, in the decision log.
- **No silent fallback.** If a configured command, gate, service, or validation
  is unavailable, report the exact blocker. Do not skip a gate, weaken
  behavior, or add fallback logic that hides configuration errors.
- **Commit only when explicitly requested**, and only a coherent validated
  slice. Handoff follows the template in document 08.

## Protected invariants

These may not be weakened by any change without an accepted decision-log entry:

1. **Unit isolation.** Quantity N creates N independent Units. Evidence,
   measurements, changes, inspections, and documents never leak across sibling
   Units.
2. **Append-only audit.** Corrections supersede; nothing silently overwrites or
   deletes manufacturing history.
3. **Stable QR identity.** A `publicRef` is opaque, never recycled, and remains
   valid across serial assignment, status, and template changes.
4. **Immutable released documents.** Released document versions and their
   snapshots are never mutated; correction produces a superseding version.
5. **Planning non-goals.** No pricing, accounting, payroll, full inventory,
   AIMCOR replacement, full Teams synchronization, or conflict-aware offline
   execution. AIMCOR remains commercial truth; Teams remains
   collaboration/notification.

## Branch and delivery rules

- Never work directly on `main`. Each slice uses a dedicated branch/worktree
  with a single owner; the prototype vertical slice lives on
  `prototype/overnight-vertical-slice` under `prototype/`.
- Completion evidence must include automated tests, browser evidence, and the
  exact commands executed with their results.
- No deployment, pushing, merging, or external-system mutation (Azure, AIMCOR,
  Entra, Teams, Graph, Blob Storage) without explicit user approval.
- See [CLAUDE.md](CLAUDE.md) for the condensed instruction set that AI agents
  load by default.

## Implementation gates

Implementation authority is staged; see
[docs/09-phase-0-review-checklist.md](docs/09-phase-0-review-checklist.md):

- **Gate A - Foundation Build Ready** permits ticket A1 only.
- **Gate B - Domain Build Ready** permits manufacturing/domain implementation.
- **Gate C - Pilot Ready** permits real production pilot orders.

An agent may not begin work that a gate has not authorized.
