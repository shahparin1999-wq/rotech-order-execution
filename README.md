# Rotech Order Execution and Digital Traveler

This repository contains the planning package for a greenfield, Azure-hybrid manufacturing execution application. The first pilot is deliberately narrow: new ANSI 1196 bare pump-end orders executed in Mississauga while AIMCOR remains the commercial source and Microsoft Teams remains the collaboration channel.

No production application code is included in this phase.

## Planning package

| Document | Contents | Master-prompt deliverables |
| --- | --- | --- |
| [01 - Evidence and recommendation](docs/01-evidence-and-recommendation.md) | Source review, current gaps, option comparison, executive recommendation | 1 |
| [02 - Workflows and PRD](docs/02-workflows-and-prd.md) | Current state, future state, users, requirements, acceptance criteria | 2-4 |
| [03 - Information architecture and states](docs/03-information-architecture-and-states.md) | Entities, relationships, identifiers, state models, audit rules | 5-6 |
| [04 - UX, templates, and QR strategy](docs/04-ux-templates-and-qr.md) | Three UX concepts, template examples, labels, scanning, error handling | 7-8 plus QR deliverables |
| [05 - Document and technical architecture](docs/05-document-and-technical-architecture.md) | PDF strategy, application architecture, security, storage, APIs | 9-10 |
| [06 - Roadmap, backlog, and tests](docs/06-roadmap-backlog-and-tests.md) | Phased gates, implementation tickets, test strategy | 11-13 |
| [07 - Pilot, risks, and metrics](docs/07-pilot-risks-and-metrics.md) | Migration and pilot plan, risk register, success metrics | 14-16 |
| [08 - Agent operating model and prompts](docs/08-agent-operating-model-and-prompts.md) | Git/worktree rules, handoff format, ten reusable prompts | Agent strategy |
| [09 - Phase 0 review checklist](docs/09-phase-0-review-checklist.md) | Workshop agenda, required decisions, evidence, sign-offs, and exit gate | Discovery execution |
| [Decision log](docs/DECISIONS.md) | Accepted architecture/product decisions and pending pilot-owner decisions | Governance |

## Locked decisions

- Build a custom TypeScript modular monolith hosted on Azure, integrated with Microsoft Entra ID, Teams, and selected SharePoint links.
- Use PostgreSQL as the transactional source for execution data and Azure Blob Storage for photos, files, labels, and generated documents.
- Import AIMCOR work-order PDFs into an untrusted draft; a coordinator must verify the draft before units or tasks are created.
- Create one master order across facilities. Location and department views are filters, not duplicate orders.
- Create a permanent Unit ID and stable opaque QR reference before a serial number exists.
- Treat Teams as communication and notification infrastructure, not as the production database.
- Preserve append-only audit history. Corrections supersede prior records rather than overwriting them silently.
- Support safe retry and pending synchronization in the pilot; defer conflict-aware, fully offline execution.

## Pilot acceptance gate

The pilot may begin only after a complete 1196 bare pump-end order can be imported, verified, split into independent units, routed, checked, photographed, inspected, labelled, and released with unit-specific final PDFs. Role restrictions, idempotent retries, audit history, and the Teams parallel process must also pass the scenarios in [the test strategy](docs/06-roadmap-backlog-and-tests.md).

## Immediate milestone

Complete [the Phase 0 review](docs/09-phase-0-review-checklist.md), record every outcome in [the decision log](docs/DECISIONS.md), and obtain Product, Production, Quality, and Technical approval. Backlog ticket A1 may begin after the Phase 0 exit gate passes; no unresolved safety, quality, identifier, template, or document-source-of-truth decision may be deferred to the implementation agent.

## Terminology

- **Order**: master sales/work order, such as `26SO00729`.
- **Line**: one commercial sales-order line.
- **Unit**: one physical pump or serialized assembly generated from a line quantity.
- **Package**: a complete system containing a pump and other tracked components.
- **Operation**: a routed production step generated from a template.
- **Task**: an accountable action, either independent or attached to an operation.
- **Controlled action**: an action that changes manufacturing history, such as allocating material, completing an inspection, or releasing a unit.
- **Activity**: human discussion and system events displayed chronologically.
