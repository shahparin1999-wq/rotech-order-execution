# Rotech Order Execution — Vertical-Slice Prototype

A self-contained, locally runnable prototype of the Rotech Order Execution and
Digital Traveler. It demonstrates the intended workflow with deterministic
**mock data** based on work order `26SO00729` (five independent Units in five
different states).

**This is not the production system.** There is no AIMCOR, Azure, PostgreSQL,
Entra, Teams, Graph, Blob Storage, camera, or PDF-pipeline integration. All
state lives in an in-memory client store seeded from fixtures; refreshing the
browser resets it. Numeric tolerances are labelled
"Pilot placeholder - owner approval required" and are **not** approved
engineering values.

## Requirements

- Node.js 20+ (developed on Node 24)
- npm

## Commands

Run everything from this `prototype/` directory:

```bash
npm install          # install pinned dependencies
npm run dev          # start the app at http://localhost:3100
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run test         # Vitest domain/unit tests
npm run build        # production build
npm run test:e2e     # Playwright browser tests (builds+serves automatically)
npm run screenshots  # regenerate screenshots into ../artifacts/preview/
npm run verify       # typecheck + lint + test + build + e2e
```

First-time Playwright setup downloads a browser:

```bash
npx playwright install chromium
```

## What to look at

| Area | Route |
| --- | --- |
| Teams-inspired shell + Home | `/` |
| Orders list | `/orders` |
| Order workspace (tabs, drill-downs) | `/orders/26SO00729` |
| Unit detail (identity banner) | `/units/26SO00729_1.2` |
| Shop-floor tablet | `/tablet/26SO00729_1.2` |
| Simulate QR scan | `/scan` |
| QR resolver landing | `/r/<publicRef>` (via Scan page) |
| Label print previews (7 profiles) | `/labels` |
| Unit QC history PDF preview | `/documents/26SO00729_1.1` |
| Order completion summary preview | `/documents/order-summary/26SO00729` |
| Location/department/blocked views | `/views/mississauga`, `/views/quality`, … |

## Guardrails demonstrated

- Quantity 5 ⇒ exactly five independent Units `26SO00729_1.1 … _1.5`.
- Unit 1.1 carries an approved 316SS→CD4MCu change; siblings stay 316SS.
- Checklist responses, photos, and documents are Unit-scoped; cross-Unit
  targeting is rejected by the mock repository.
- Pause requires the full handoff record; another employee can resume it.
- Comment → Task/Problem/MaterialChange/SpecialInstruction conversion keeps
  the original comment.
- QR identities are stable across serial assignment; reprints add print
  events, never new identities.
- Audit is append-only; the impeller-trim correction on Unit 1.1 shows
  supersession.
