// Evidence records with explicit applicability.
//
// The problem this solves: a material certificate for heat H316-8821 can
// legitimately cover the casings of Units 1.1, 1.2 and 1.3. The protected
// invariant says no cross-Unit leakage of evidence. Both are true, and the
// resolution is that shared evidence is stored ONCE and REFERENCED by each
// Unit — never copied into a Unit's history, and never presented as though it
// belonged exclusively to one Unit.
//
// Applicability is therefore EXPLICIT (applicableUnitIds / applicableComponentIds)
// rather than implied by scope. A line-scoped certificate that does not name
// the Units it covers is not traceable, and a Unit report that shows it without
// saying why it applies is not a quality record.
//
// PURE DOMAIN — no React, no localStorage, no browser globals.

export const EVIDENCE_SCOPE_TYPES = ["Order", "Line", "Unit", "ComponentSet"] as const;
export type EvidenceScopeType = (typeof EVIDENCE_SCOPE_TYPES)[number];

export const EVIDENCE_VALIDATION_STATUSES = ["Pending", "Accepted", "Rejected"] as const;
export type EvidenceValidationStatus = (typeof EVIDENCE_VALIDATION_STATUSES)[number];

export interface EvidenceRecord {
  id: string;
  evidenceType: string; // "MaterialCertificate" | "NameplatePhoto" | "TestReport" | …
  attachmentId: string;
  checksum: string;

  scopeType: EvidenceScopeType;
  scopeId: string;

  // Explicit applicability. Empty applicableUnitIds on a shared scope is a
  // defect the coverage rules report — see untraceableSharedEvidence().
  applicableUnitIds: string[];
  applicableComponentIds: string[];

  createdBy: string;
  createdAt: string;
  validationStatus: EvidenceValidationStatus;
}

// Evidence only counts once Quality has accepted it. Pending or rejected
// evidence must never make a requirement look satisfied.
export function isAccepted(evidence: EvidenceRecord): boolean {
  return evidence.validationStatus === "Accepted";
}

// True when this evidence is shared across more than one Unit — the case that
// needs referencing rather than copying.
export function isShared(evidence: EvidenceRecord): boolean {
  return evidence.scopeType !== "Unit" || evidence.applicableUnitIds.length > 1;
}

export function appliesToUnit(evidence: EvidenceRecord, unitId: string): boolean {
  return evidence.applicableUnitIds.includes(unitId);
}

export function appliesToComponent(evidence: EvidenceRecord, componentId: string): boolean {
  return evidence.applicableComponentIds.includes(componentId);
}

// All evidence a Unit's report may reference — its own and any shared record
// that explicitly names it.
export function evidenceForUnit(records: EvidenceRecord[], unitId: string): EvidenceRecord[] {
  return records.filter((e) => appliesToUnit(e, unitId));
}

// Why a shared record applies to this Unit, for the report. A Unit report must
// explain the linkage rather than printing a bare line-level certificate.
export interface EvidenceApplicability {
  evidence: EvidenceRecord;
  shared: boolean;
  reason: string;
}

export function applicabilityForUnit(
  records: EvidenceRecord[],
  unitId: string,
  componentIdsForUnit: string[] = []
): EvidenceApplicability[] {
  return evidenceForUnit(records, unitId).map((evidence) => {
    const shared = isShared(evidence);
    const matchedComponents = evidence.applicableComponentIds.filter((c) =>
      componentIdsForUnit.includes(c)
    );
    let reason: string;
    if (!shared) {
      reason = `Recorded against ${unitId}.`;
    } else if (matchedComponents.length > 0) {
      reason =
        `Shared ${evidence.scopeType.toLowerCase()}-scope evidence covering ` +
        `${evidence.applicableUnitIds.length} Units; applies to this Unit via ` +
        `${matchedComponents.join(", ")}.`;
    } else {
      reason =
        `Shared ${evidence.scopeType.toLowerCase()}-scope evidence explicitly covering ` +
        `${evidence.applicableUnitIds.join(", ")}.`;
    }
    return { evidence, shared, reason };
  });
}

// A shared record that names no Units is untraceable — it cannot be shown on
// any Unit report with a defensible reason. Reported by the coverage rules.
export function untraceableSharedEvidence(records: EvidenceRecord[]): EvidenceRecord[] {
  return records.filter((e) => e.scopeType !== "Unit" && e.applicableUnitIds.length === 0);
}

// Evidence claiming a Unit outside the set it is supposed to cover would be a
// leak in the other direction. Callers pass the Units that legitimately exist
// under the evidence's scope.
export function evidenceOutsideScope(
  records: EvidenceRecord[],
  unitIdsByScope: (evidence: EvidenceRecord) => string[]
): Array<{ evidence: EvidenceRecord; strayUnitIds: string[] }> {
  const out: Array<{ evidence: EvidenceRecord; strayUnitIds: string[] }> = [];
  for (const evidence of records) {
    const permitted = unitIdsByScope(evidence);
    const stray = evidence.applicableUnitIds.filter((u) => !permitted.includes(u));
    if (stray.length > 0) out.push({ evidence, strayUnitIds: stray });
  }
  return out;
}
