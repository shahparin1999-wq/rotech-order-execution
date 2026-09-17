# OEH Private Staging Target Decision Record — 2026-09-17

## Decision status

**Owner approval required.** This is a target record only. No Azure resources,
identity application, database, storage account, queue, secret, deployment, or
external system was created or changed.

## One proposed target

Use the documented Azure-hybrid OEH target as the private staging environment:

- Azure Container Apps environment with one authenticated Next.js web/API
  service and one isolated TypeScript parser/worker service;
- Azure Database for PostgreSQL Flexible Server for authoritative OEH state;
- Azure Blob Storage for immutable uploaded shipment files and evidence;
- Azure Service Bus for durable parser/worker delivery;
- single-tenant Microsoft Entra ID for Site/web identity;
- Azure Key Vault with managed identity for secrets;
- private networking for PostgreSQL, Blob control/data access, Service Bus,
  Key Vault, and management surfaces where practical;
- authenticated web/API ingress only, with capability and facility authorization
  enforced by OEH at the API boundary.

This is the smallest target compatible with the already-proven OEH architecture
and the required upload → immutable file → parser worker → ParseRun/ParsedField
workflow. It is based on `docs/05-document-and-technical-architecture.md` and
the accepted Azure-hybrid decision in `docs/DECISIONS.md`.

## Required staging checks before any deployment

1. Prove hosted Site identity → OEH user → Rotech employee → facility scope →
   job role/capabilities.
2. Prove one sanitized Order read from PostgreSQL and one harmless idempotent
   command through the existing OEH API.
3. Prove upload intent, immutable Blob retention/hash, parser worker execution,
   and ParseRun/ParsedField review results.
4. Apply `prototype/src/server/persistence/migrations/0001_gate_a_foundation.sql`
   through the approved migration process against the private staging database.
5. Verify backups/point-in-time recovery, audit retention, capability denials,
   facility isolation, idempotency replay, optimistic concurrency, and two-
   session reload before any real data consideration.

## Rollback and data boundary

Rollback starts from the last accepted integration SHA and the prior container
image digest. Database changes use a tested forward-fix or reversible migration
plan plus PostgreSQL restore/PITR evidence; no destructive reset is permitted.
Only sanitized/UAT data may be used until the identity, authorization,
recovery, audit, inventory invariant, opening-balance, and Sites feasibility
gates have explicit owner approval.

## Required owner action

Approve this specific private staging target for the OEH staging gate:

> Approve Azure Container Apps + PostgreSQL Flexible Server + Blob Storage +
> Service Bus + Entra ID + Key Vault as the private OEH staging environment.

