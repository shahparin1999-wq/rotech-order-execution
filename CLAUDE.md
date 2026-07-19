# CLAUDE.md - Rotech Order Execution Repository Instructions

Concise instructions for AI coding agents. Read [AGENTS.md](AGENTS.md) first,
then [README.md](README.md). Detailed planning lives in `docs/` — link to it,
do not restate it.

## Required reading before any change

1. [AGENTS.md](AGENTS.md) — agent contract and protected invariants.
2. [README.md](README.md) — scope, locked decisions, terminology, gates.
3. [docs/DECISIONS.md](docs/DECISIONS.md) — accepted/pending decisions.
4. The planning document relevant to your slice
   ([02 PRD](docs/02-workflows-and-prd.md),
   [03 data model](docs/03-information-architecture-and-states.md),
   [04 UX/QR](docs/04-ux-templates-and-qr.md),
   [05 architecture](docs/05-document-and-technical-architecture.md),
   [06 backlog/tests](docs/06-roadmap-backlog-and-tests.md)).

## Working rules

- One implementation branch/worktree owner at a time. **Never work directly on
  `main`.**
- No silent fallback behavior; report exact blockers instead of skipping gates.
- No unrelated refactoring; keep every change a narrow, coherent slice.
- Every mutation targets an explicit Order, Line, and Unit; the server-side
  (or mock repository) rejects inconsistent ancestors.
- Quantity N creates N independent Units. No cross-Unit data leakage of
  evidence, measurements, changes, inspections, or documents — ever.
- Audit is append-only; corrections supersede, nothing is overwritten.
- QR identity (`publicRef`) is stable and exists before serial assignment;
  reprints never create new identities.
- Released document versions are immutable; correction produces a superseding
  version.
- Completion claims require tests, browser evidence, and exact commands/results.
- No deployment, pushing, merging to `main`, or external-system mutation
  (Azure, AIMCOR, Entra, Teams, Graph, Blob) without explicit user approval.

## Prototype (`prototype/`)

The `prototype/` directory is a self-contained, mock-data vertical slice.
It must run locally with `npm install` / `npm run dev` / `npm run test` /
`npm run build` / `npm run verify` (see `prototype/README.md`). It must not
add real integrations, secrets, customer data, production PDF generation, or
camera access. Unapproved engineering values are labelled
"Pilot placeholder - owner approval required."
