// Unit release manifest — the controlled record.
//
// The PDF is an OUTPUT, not the record. Release freezes a manifest naming every
// satisfied and waived requirement, every evidence reference, the source
// revisions and procedure versions in force, and the checksums. The PDF is
// regenerated only from that frozen manifest, so reprinting a released version
// after the family template later changes still produces identical content.
//
// A correction never overwrites: it creates release version N+1 and preserves N.
//
// PURE DOMAIN — no React, no localStorage, no browser globals. Reuses the same
// canonical-JSON + SHA-256 rule already proven against a real CPQ bundle, so
// checksums agree byte-for-byte across systems.

import { sha256Hex } from "../sha256";
import { blocksRelease, isInert, type ExecutionRequirement, type Ledger } from "./requirement";
import { isAccepted, type EvidenceRecord } from "./evidence";

export interface UnitReleaseManifest {
  id: string;
  unitId: string;
  releaseVersion: number;

  // What the Unit was built against — pinned so the record is reproducible.
  operationalRevisionId: string;
  familyDefinitionReleaseId: string;
  catalogueReleaseId: string;
  qualityProcedureVersions: string[];

  satisfiedRequirementIds: string[];
  waivedRequirementIds: string[];

  evidenceRefs: string[];
  attachmentChecksums: string[];

  pdfDocumentVersionId: string;
  pdfChecksum: string;

  releasedBy: string;
  releasedAt: string;

  /** Checksum over the manifest itself, excluding this field. */
  checksum: string;

  /** Set on a correction: the manifest this one supersedes. */
  supersedesId?: string;
}

// Identical canonicalization to the catalogue release and order handoff.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = canonicalize(obj[key]);
    return out;
  }
  return value;
}

export function computeManifestChecksum(manifest: UnitReleaseManifest): string {
  const { checksum: _omit, ...rest } = manifest;
  void _omit;
  return sha256Hex(JSON.stringify(canonicalize(rest)));
}

export function verifyManifestChecksum(manifest: UnitReleaseManifest): boolean {
  return manifest.checksum === computeManifestChecksum(manifest);
}

// ---------------------------------------------------------------------------
// Release eligibility
// ---------------------------------------------------------------------------

export interface ReleaseEligibility {
  eligible: boolean;
  blockers: string[];
  blockingRequirementIds: string[];
}

// A Unit may not be released while any mandatory release-gating requirement is
// still open. Waived requirements do not block — that is what a waiver is for —
// but they are named on the manifest so the decision stays visible.
export function evaluateReleaseEligibility(
  requirements: ExecutionRequirement[],
  evidence: EvidenceRecord[]
): ReleaseEligibility {
  const blockers: string[] = [];
  const blocking = requirements.filter(blocksRelease);
  if (blocking.length > 0) {
    blockers.push(`${blocking.length} release-gating requirement(s) still open`);
  }

  const mandatoryOpen = requirements.filter(
    (r) => !isInert(r) && r.mandatory && r.status !== "Satisfied" && r.status !== "Waived"
  );
  if (mandatoryOpen.length > 0) {
    blockers.push(`${mandatoryOpen.length} mandatory requirement(s) not satisfied or waived`);
  }

  const unaccepted = evidence.filter((e) => e.validationStatus === "Pending");
  if (unaccepted.length > 0) {
    blockers.push(`${unaccepted.length} evidence record(s) awaiting Quality acceptance`);
  }
  const rejected = evidence.filter((e) => e.validationStatus === "Rejected");
  if (rejected.length > 0) {
    blockers.push(`${rejected.length} evidence record(s) rejected`);
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    blockingRequirementIds: [...new Set([...blocking, ...mandatoryOpen].map((r) => r.id))]
  };
}

// ---------------------------------------------------------------------------
// Freeze
// ---------------------------------------------------------------------------

export interface FreezeInput {
  id: string;
  unitId: string;
  releaseVersion: number;
  operationalRevisionId: string;
  familyDefinitionReleaseId: string;
  catalogueReleaseId: string;
  qualityProcedureVersions: string[];
  pdfDocumentVersionId: string;
  pdfChecksum: string;
  releasedBy: string;
  releasedAt: string;
  supersedesId?: string;
}

export interface FreezeResult {
  ok: boolean;
  manifest?: UnitReleaseManifest;
  error?: string;
  eligibility: ReleaseEligibility;
}

// Freezes the manifest for one Unit. Fails closed: an ineligible Unit produces
// no manifest at all rather than a manifest with caveats.
export function freezeUnitRelease(
  input: FreezeInput,
  requirements: ExecutionRequirement[],
  evidence: EvidenceRecord[]
): FreezeResult {
  const eligibility = evaluateReleaseEligibility(requirements, evidence);
  if (!eligibility.eligible) {
    return { ok: false, error: eligibility.blockers.join("; "), eligibility };
  }

  const live = requirements.filter((r) => !isInert(r));
  const accepted = evidence.filter(isAccepted);

  const manifest: UnitReleaseManifest = {
    ...input,
    satisfiedRequirementIds: live.filter((r) => r.status === "Satisfied").map((r) => r.id).sort(),
    waivedRequirementIds: live.filter((r) => r.status === "Waived").map((r) => r.id).sort(),
    evidenceRefs: accepted.map((e) => e.id).sort(),
    attachmentChecksums: accepted.map((e) => e.checksum).sort(),
    checksum: ""
  };
  manifest.checksum = computeManifestChecksum(manifest);
  return { ok: true, manifest, eligibility };
}

// A correction produces the next version and records what it supersedes. The
// prior manifest is returned untouched by construction — callers append.
export function supersedeRelease(
  prior: UnitReleaseManifest,
  input: Omit<FreezeInput, "unitId" | "releaseVersion" | "supersedesId">,
  requirements: ExecutionRequirement[],
  evidence: EvidenceRecord[]
): FreezeResult {
  return freezeUnitRelease(
    {
      ...input,
      unitId: prior.unitId,
      releaseVersion: prior.releaseVersion + 1,
      supersedesId: prior.id
    },
    requirements,
    evidence
  );
}

// Requirements a released manifest accounted for. Used to prove a reprint
// reproduces the original content rather than today's ledger.
export function manifestCoversRequirement(manifest: UnitReleaseManifest, requirementId: string): boolean {
  return (
    manifest.satisfiedRequirementIds.includes(requirementId) ||
    manifest.waivedRequirementIds.includes(requirementId)
  );
}

export function latestManifestForUnit(
  manifests: UnitReleaseManifest[],
  unitId: string
): UnitReleaseManifest | undefined {
  return manifests
    .filter((m) => m.unitId === unitId)
    .sort((a, b) => a.releaseVersion - b.releaseVersion)
    .at(-1);
}

// Convenience for the Unit-scoped slice of a whole ledger.
export function requirementsForRelease(
  ledger: Ledger,
  unitId: string,
  unitLineId: string,
  executionOrderId: string
): ExecutionRequirement[] {
  return ledger.requirements.filter((r) => {
    if (isInert(r)) return false;
    if (r.unitId) return r.unitId === unitId;
    if (r.lineId) return r.lineId === unitLineId;
    return r.executionOrderId === executionOrderId;
  });
}
