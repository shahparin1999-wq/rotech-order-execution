// The active CPQ catalogue release the prototype resolves product options
// against. Contract: docs/integration/CPQ_CATALOGUE_CONTRACT.md
//
// Today this is the PROVISIONAL fixture, because CPQ has not published a real
// catalogue release yet (contract §7, §8.1). It is validated through exactly
// the same path a published release would take — schema, checksum, monetary
// allowlist — so the import is not a special case that gets bypassed later.
//
// Fail-closed: if the release does not validate, no options resolve at all.
// Nothing falls back to a hardcoded table; a broken catalogue means the family
// cannot be configured, and the blocker is reported rather than papered over.

import provisionalRelease from "../../sample-data/cpq-catalogue-release.provisional.json";
import {
  familyFromRelease,
  isReleasable,
  pinFor,
  validateCatalogueRelease,
  type CatalogueFamily,
  type CataloguePin,
  type CatalogueRelease
} from "./catalogueRelease";

const validation = validateCatalogueRelease(provisionalRelease);

export const ACTIVE_CATALOGUE: CatalogueRelease | null = validation.ok ? validation.release! : null;
export const ACTIVE_CATALOGUE_ERRORS: string[] = validation.errors;

export function activeCataloguePin(): CataloguePin | null {
  return ACTIVE_CATALOGUE ? pinFor(ACTIVE_CATALOGUE) : null;
}

export function catalogueFamily(familyCode: string): CatalogueFamily | null {
  if (!ACTIVE_CATALOGUE) return null;
  return familyFromRelease(ACTIVE_CATALOGUE, familyCode) ?? null;
}

// Why a definition resolved from this catalogue may not be released. Empty
// means the catalogue itself imposes no blocker (it still says nothing about
// the family's own open decisions).
export function catalogueReleaseBlockers(familyCode: string): string[] {
  if (!ACTIVE_CATALOGUE) {
    return [
      "No valid CPQ catalogue release is loaded; product options cannot be resolved.",
      ...ACTIVE_CATALOGUE_ERRORS
    ];
  }
  const blockers: string[] = [];
  if (!isReleasable(ACTIVE_CATALOGUE)) {
    blockers.push(
      `Catalogue release ${ACTIVE_CATALOGUE.catalogueReleaseId} is provisional (not a CPQ publication), ` +
        "so nothing configured from it may be released - owner approval and a published catalogue are required."
    );
  }
  if (!familyFromRelease(ACTIVE_CATALOGUE, familyCode)) {
    blockers.push(`Catalogue release ${ACTIVE_CATALOGUE.catalogueReleaseId} does not carry family ${familyCode}.`);
  }
  return blockers;
}
