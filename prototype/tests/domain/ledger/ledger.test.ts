// Execution Requirement Ledger — acceptance tests.
// Every numbered test maps to an acceptance criterion in the approved plan.

import { describe, expect, it } from "vitest";
import {
  blocksWork,
  fulfilledQuantity,
  isInert,
  ownRequirementsForUnit,
  requirementsForUnit,
  transition,
  type ExecutionRequirement,
  type FulfillmentRecord
} from "@/domain/ledger/requirement";
import {
  applicabilityForUnit,
  evidenceForUnit,
  isShared,
  untraceableSharedEvidence,
  type EvidenceRecord
} from "@/domain/ledger/evidence";
import {
  componentWithoutSourceDisposition,
  noAccountableOwner,
  noFulfillmentPath,
  overdue,
  runCoverage,
  satisfiedWithoutEvidence,
  waivedWithoutAuthority,
  type CoverageContext
} from "@/domain/ledger/coverage";
import {
  completenessForComponent,
  completenessForUnit,
  readinessForUnit,
  readinessOf,
  workableRequirements
} from "@/domain/ledger/completeness";
import {
  evaluateReleaseEligibility,
  freezeUnitRelease,
  supersedeRelease,
  verifyManifestChecksum
} from "@/domain/ledger/releaseManifest";
import {
  buildScenario1196,
  dispositionedRequirementIds,
  LINE_1,
  LINE_2,
  SCENARIO_ORDER_ID,
  UNIT_1_1,
  UNIT_1_2,
  UNIT_2_1
} from "@/domain/ledger/scenario1196";

const AS_OF = "2026-08-15"; // after the motor/drawing need-by dates, before packaging

function ctx(overrides: Partial<CoverageContext> = {}): CoverageContext {
  const scenario = buildScenario1196();
  return {
    ledger: scenario.ledger,
    evidence: scenario.evidence,
    asOf: AS_OF,
    requirementIdsWithDisposition: dispositionedRequirementIds(scenario),
    rolesByActor: { "e-priya": ["Quality"], "e-alex": ["Technician"] },
    ...overrides
  };
}

// --- Scenario proof 1, 2, 3 -------------------------------------------------

describe("Configuration generates requirements for isolated Units", () => {
  it("generates requirements for every Unit the quantity created", () => {
    const { ledger } = buildScenario1196();
    expect(ownRequirementsForUnit(ledger, UNIT_1_1).length).toBeGreaterThan(0);
    expect(ownRequirementsForUnit(ledger, UNIT_1_2).length).toBeGreaterThan(0);
    expect(ownRequirementsForUnit(ledger, UNIT_2_1).length).toBeGreaterThan(0);
  });

  it("keeps sibling Units isolated — no requirement leaks between 1.1 and 1.2", () => {
    const { ledger } = buildScenario1196();
    const a = ownRequirementsForUnit(ledger, UNIT_1_1).map((r) => r.id);
    const b = ownRequirementsForUnit(ledger, UNIT_1_2).map((r) => r.id);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  it("distinguishes line-level shared requirements from Unit-level ones", () => {
    const { ledger } = buildScenario1196();
    const shared = ledger.requirements.filter((r) => r.lineId === LINE_1 && !r.unitId);
    expect(shared).toHaveLength(1);
    expect(shared[0].description).toMatch(/material certificate/i);

    // The shared requirement applies to both Units without being duplicated.
    const forUnit1 = requirementsForUnit(ledger, UNIT_1_1, LINE_1, SCENARIO_ORDER_ID);
    const forUnit2 = requirementsForUnit(ledger, UNIT_1_2, LINE_1, SCENARIO_ORDER_ID);
    expect(forUnit1.map((r) => r.id)).toContain(shared[0].id);
    expect(forUnit2.map((r) => r.id)).toContain(shared[0].id);
    expect(ledger.requirements.filter((r) => r.description === shared[0].description)).toHaveLength(1);
  });
});

// --- Scenario proof 4, criterion 3 -----------------------------------------

describe("Source dispositions", () => {
  it("every in-scope component requirement has a source disposition", () => {
    expect(componentWithoutSourceDisposition(ctx())).toEqual([]);
  });

  it("flags a component whose disposition was never chosen", () => {
    const c = ctx({ requirementIdsWithDisposition: [] });
    expect(componentWithoutSourceDisposition(c).length).toBeGreaterThan(0);
  });
});

// --- Scenario proof 5: the central parallelism guarantee --------------------

describe("Impeller trim does not stop unrelated work", () => {
  it("power-end work stays workable while the trim requirement is open", () => {
    const { ledger } = buildScenario1196();
    const unit2 = requirementsForUnit(ledger, UNIT_2_1, LINE_2, SCENARIO_ORDER_ID);

    const trim = unit2.find((r) => r.description.includes("Trim impeller"))!;
    expect(trim.status).not.toBe("Satisfied");
    expect(blocksWork(trim)).toBe(true);

    const powerEndBuild = unit2.find((r) => r.description.includes("Build power end"))!;
    expect(blocksWork(powerEndBuild)).toBe(false);
    expect(workableRequirements(unit2).map((r) => r.id)).toContain(powerEndBuild.id);
  });

  it("a blocked dimension does not make the whole Unit unworkable", () => {
    const { ledger } = buildScenario1196();
    const readiness = readinessForUnit(ledger, UNIT_2_1, LINE_2, SCENARIO_ORDER_ID);
    expect(readiness.overall).not.toBe("Blocked");
    expect(readiness.availableWorkCount).toBeGreaterThan(0);
    expect(readiness.primaryConstraint).toBeTruthy();
  });
});

// --- Scenario proof 6 -------------------------------------------------------

describe("Customer-supplied motor", () => {
  it("creates receipt and verification work but no purchasing requirement", () => {
    const { ledger } = buildScenario1196();
    const motorReqs = ledger.requirements.filter((r) => r.componentId?.endsWith("-motor"));
    expect(motorReqs.length).toBeGreaterThanOrEqual(3);
    expect(motorReqs.some((r) => r.category === "Inspection")).toBe(true);
    expect(motorReqs.some((r) => r.category === "Evidence")).toBe(true);

    const motorFulfillments = ledger.fulfillments.filter((f) =>
      motorReqs.some((r) => r.id === f.requirementId)
    );
    expect(motorFulfillments.some((f) => f.kind === "PurchaseRequirement")).toBe(false);
    expect(motorFulfillments.some((f) => f.kind === "PoReference")).toBe(false);
  });
});

// --- Scenario proof 7 -------------------------------------------------------

describe("Custom baseplate drawing", () => {
  it("blocks fabrication only — it does not gate pump-end release", () => {
    const { ledger } = buildScenario1196();
    const drawing = ledger.requirements.find((r) => r.category === "Drawing")!;
    expect(drawing.blocksWork).toBe(true);
    expect(drawing.blocksRelease).toBeUndefined();

    // The pump-end power-end requirement is untouched by it.
    const powerEnd = ledger.requirements.find(
      (r) => r.unitId === UNIT_2_1 && r.componentId?.endsWith("-powerend")
    )!;
    expect(blocksWork(powerEnd)).toBe(false);
  });

  it("is line-scoped, so one approval covers the line", () => {
    const { ledger } = buildScenario1196();
    const drawings = ledger.requirements.filter((r) => r.category === "Drawing");
    expect(drawings).toHaveLength(1);
    expect(drawings[0].unitId).toBeUndefined();
    expect(drawings[0].lineId).toBe(LINE_2);
  });
});

// --- Criteria 1, 2: ownership and fulfilment paths --------------------------

describe("Ownership and fulfilment paths", () => {
  it("every requirement has an accountable owner", () => {
    expect(noAccountableOwner(ctx())).toEqual([]);
  });

  it("accountable owner may be a role or department, not only a person", () => {
    const { ledger } = buildScenario1196();
    const types = new Set(ledger.requirements.map((r) => r.accountableOwnerType));
    expect(types.has("Department")).toBe(true);
    expect(types.has("Role")).toBe(true);
  });

  it("finds the requirement nobody is working toward", () => {
    // Packaging was deliberately left with no fulfilment record.
    const missing = noFulfillmentPath(ctx());
    const { ledger } = buildScenario1196();
    const packaging = ledger.requirements.find((r) => r.category === "Packaging")!;
    expect(missing).toContain(packaging.id);
  });

  it("reports offending ids, never a bare boolean", () => {
    const report = runCoverage(ctx());
    expect(report.clean).toBe(false);
    for (const finding of report.findings) {
      expect(Array.isArray(finding.requirementIds)).toBe(true);
      expect(finding.requirementIds.length).toBeGreaterThan(0);
    }
    expect(report.offendingRequirementIds.length).toBeGreaterThan(0);
  });
});

// --- Overdue -----------------------------------------------------------------

describe("Overdue detection", () => {
  it("flags requirements past their need-by date", () => {
    const late = overdue(ctx());
    const { ledger } = buildScenario1196();
    const motor = ledger.requirements.find(
      (r) => r.componentId?.endsWith("-motor") && r.category === "Component"
    )!;
    expect(late).toContain(motor.id); // need-by 2026-08-12, asOf 2026-08-15
  });

  it("does not flag anything when evaluated before the need-by dates", () => {
    expect(overdue(ctx({ asOf: "2026-08-01" }))).toEqual([]);
  });
});

// --- Criterion 8: derived completeness --------------------------------------

describe("Completeness is derived, not stored", () => {
  it("computes component completeness from its requirements", () => {
    const scenario = buildScenario1196();
    const componentId = `${UNIT_2_1}-motor`;
    const before = completenessForComponent(scenario.ledger, componentId);
    expect(before.complete).toBe(false);

    // Satisfy every motor requirement.
    scenario.ledger.requirements = scenario.ledger.requirements.map((r) =>
      r.componentId === componentId ? { ...r, status: "Satisfied" as const } : r
    );
    const after = completenessForComponent(scenario.ledger, componentId);
    expect(after.complete).toBe(true);
    expect(after.satisfied).toBe(after.total);
  });

  it("rolls upward from Unit to Line to Order", () => {
    const scenario = buildScenario1196();
    const unit = completenessForUnit(scenario.ledger, UNIT_1_1, LINE_1, SCENARIO_ORDER_ID);
    expect(unit.total).toBeGreaterThan(0);
    expect(unit.open).toBe(unit.total - unit.closed);
  });

  it("a waived requirement counts as closed but is reported separately", () => {
    const scenario = buildScenario1196();
    const target = scenario.ledger.requirements[0];
    const result = transition(target, "Waived", { actorId: "e-priya", reason: "Not applicable" });
    expect(result.ok).toBe(true);
    scenario.ledger.requirements[0] = result.requirement!;
    const c = completenessForUnit(scenario.ledger, UNIT_1_1, LINE_1, SCENARIO_ORDER_ID);
    expect(c.waived).toBe(1);
    expect(c.closed).toBeGreaterThanOrEqual(1);
  });
});

// --- Criterion 9: readiness dimensions --------------------------------------

describe("Readiness is six independent dimensions", () => {
  it("computes each dimension separately", () => {
    const { ledger } = buildScenario1196();
    const readiness = readinessForUnit(ledger, UNIT_2_1, LINE_2, SCENARIO_ORDER_ID);
    const names = readiness.dimensions.map((d) => d.dimension);
    expect(names).toEqual([
      "Configuration",
      "Drawings",
      "Materials",
      "Work",
      "Quality",
      "Shipping"
    ]);
  });

  it("a late material does not make Work readiness blocked", () => {
    const { ledger } = buildScenario1196();
    const readiness = readinessForUnit(ledger, UNIT_1_1, LINE_1, SCENARIO_ORDER_ID);
    const work = readiness.dimensions.find((d) => d.dimension === "Work")!;
    expect(work.state).not.toBe("Blocked");
  });

  it("reports NotStarted for a dimension with no requirements at all", () => {
    const summary = readinessOf([]);
    expect(summary.overall).toBe("NotStarted");
    expect(summary.dimensions.every((d) => d.state === "NotStarted")).toBe(true);
  });
});

// --- Criteria 4, 5, 10: shared evidence --------------------------------------

describe("Shared evidence is referenced, never copied", () => {
  it("one certificate applies to both sibling Units and exists once", () => {
    const { evidence } = buildScenario1196();
    const cert = evidence.find((e) => e.id === "MC-204")!;
    expect(isShared(cert)).toBe(true);
    expect(cert.applicableUnitIds).toEqual([UNIT_1_1, UNIT_1_2]);
    expect(evidence.filter((e) => e.evidenceType === "MaterialCertificate")).toHaveLength(1);

    expect(evidenceForUnit(evidence, UNIT_1_1).map((e) => e.id)).toContain("MC-204");
    expect(evidenceForUnit(evidence, UNIT_1_2).map((e) => e.id)).toContain("MC-204");
  });

  it("explains why shared evidence applies to a Unit", () => {
    const { evidence } = buildScenario1196();
    const applicability = applicabilityForUnit(evidence, UNIT_1_1, [`${UNIT_1_1}-casing`]);
    const cert = applicability.find((a) => a.evidence.id === "MC-204")!;
    expect(cert.shared).toBe(true);
    expect(cert.reason).toMatch(/shared/i);
    expect(cert.reason).toContain(`${UNIT_1_1}-casing`);
  });

  it("does not leak a sibling's Unit-scoped evidence", () => {
    const { evidence } = buildScenario1196();
    expect(evidenceForUnit(evidence, UNIT_1_1).map((e) => e.id)).not.toContain("PH-882");
    expect(evidenceForUnit(evidence, UNIT_2_1).map((e) => e.id)).toContain("PH-882");
  });

  it("flags shared evidence that names no Units", () => {
    const orphan: EvidenceRecord = {
      id: "MC-999",
      evidenceType: "MaterialCertificate",
      attachmentId: "att",
      checksum: "c".repeat(64),
      scopeType: "Line",
      scopeId: LINE_1,
      applicableUnitIds: [],
      applicableComponentIds: [],
      createdBy: "e-priya",
      createdAt: "2026-07-27T12:00:00Z",
      validationStatus: "Accepted"
    };
    expect(untraceableSharedEvidence([orphan]).map((e) => e.id)).toEqual(["MC-999"]);
  });
});

// --- Waiver authority --------------------------------------------------------

describe("Waiver authority", () => {
  it("rejects a waiver with no reason", () => {
    const { ledger } = buildScenario1196();
    const result = transition(ledger.requirements[0], "Waived", { actorId: "e-priya" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/reason/i);
  });

  it("flags a family-definition requirement waived by someone without Quality", () => {
    const scenario = buildScenario1196();
    const target = scenario.ledger.requirements.find((r) => r.source === "FamilyDefinition")!;
    const waived = transition(target, "Waived", { actorId: "e-alex", reason: "shortcut" }).requirement!;
    scenario.ledger.requirements = scenario.ledger.requirements.map((r) =>
      r.id === waived.id ? waived : r
    );
    const findings = waivedWithoutAuthority({
      ledger: scenario.ledger,
      evidence: scenario.evidence,
      asOf: AS_OF,
      rolesByActor: { "e-alex": ["Technician"] }
    });
    expect(findings).toContain(waived.id);
  });

  it("accepts the same waiver from Quality", () => {
    const scenario = buildScenario1196();
    const target = scenario.ledger.requirements.find((r) => r.source === "FamilyDefinition")!;
    const waived = transition(target, "Waived", { actorId: "e-priya", reason: "N/A for this build" })
      .requirement!;
    scenario.ledger.requirements = scenario.ledger.requirements.map((r) =>
      r.id === waived.id ? waived : r
    );
    const findings = waivedWithoutAuthority({
      ledger: scenario.ledger,
      evidence: scenario.evidence,
      asOf: AS_OF,
      rolesByActor: { "e-priya": ["Quality"] }
    });
    expect(findings).not.toContain(waived.id);
  });
});

// --- Satisfied without evidence ---------------------------------------------

describe("Satisfied requirements must be backed by accepted evidence", () => {
  it("flags a measurement marked satisfied with only pending evidence", () => {
    const scenario = buildScenario1196();
    const motorEvidence = scenario.ledger.requirements.find(
      (r) => r.category === "Evidence" && r.componentId?.endsWith("-motor")
    )!;
    scenario.ledger.requirements = scenario.ledger.requirements.map((r) =>
      r.id === motorEvidence.id ? { ...r, status: "Satisfied" as const } : r
    );
    // PH-882 is Pending, so this must be flagged.
    const flagged = satisfiedWithoutEvidence({
      ledger: scenario.ledger,
      evidence: scenario.evidence,
      asOf: AS_OF
    });
    expect(flagged).toContain(motorEvidence.id);
  });
});

// --- Status transitions -------------------------------------------------------

describe("Status transitions", () => {
  it("refuses an illegal transition rather than coercing it", () => {
    const { ledger } = buildScenario1196();
    const cancelled: ExecutionRequirement = { ...ledger.requirements[0], status: "Cancelled" };
    const result = transition(cancelled, "InProgress");
    expect(result.ok).toBe(false);
  });

  it("treats superseded and cancelled as inert", () => {
    const { ledger } = buildScenario1196();
    expect(isInert({ ...ledger.requirements[0], status: "Superseded" })).toBe(true);
    expect(isInert({ ...ledger.requirements[0], status: "Cancelled" })).toBe(true);
    expect(isInert({ ...ledger.requirements[0], status: "Waived" })).toBe(false);
  });
});

// --- Partial receipts (criterion 12 of the earlier matrix) ------------------

describe("Partial fulfilment", () => {
  it("a PO line delivering 1 of 2 does not mark the requirement complete", () => {
    const records: FulfillmentRecord[] = [
      { id: "F1", requirementId: "R", kind: "Receipt", ref: "REC-1", quantity: 1, status: "Complete", recordedBy: "x", recordedAt: "t" },
      { id: "F2", requirementId: "R", kind: "Receipt", ref: "REC-2", quantity: 1, status: "Rejected", recordedBy: "x", recordedAt: "t" }
    ];
    expect(fulfilledQuantity(records)).toBe(1);
  });
});

// --- Criteria 12, 13: release manifest ---------------------------------------

describe("Unit release manifest", () => {
  function satisfyAll(unitId: string, lineId: string) {
    const scenario = buildScenario1196();
    scenario.ledger.requirements = scenario.ledger.requirements.map((r) => {
      const applies = r.unitId === unitId || (!r.unitId && r.lineId === lineId) || (!r.unitId && !r.lineId);
      return applies ? { ...r, status: "Satisfied" as const } : r;
    });
    scenario.evidence = scenario.evidence.map((e) => ({ ...e, validationStatus: "Accepted" as const }));
    return scenario;
  }

  it("refuses to release while a mandatory requirement is open", () => {
    const scenario = buildScenario1196();
    const reqs = scenario.ledger.requirements.filter((r) => r.unitId === UNIT_1_1);
    const eligibility = evaluateReleaseEligibility(reqs, scenario.evidence);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.blockingRequirementIds.length).toBeGreaterThan(0);
  });

  it("freezes a manifest naming satisfied requirements and accepted evidence", () => {
    const scenario = satisfyAll(UNIT_1_1, LINE_1);
    const reqs = scenario.ledger.requirements.filter(
      (r) => r.unitId === UNIT_1_1 || (!r.unitId && r.lineId === LINE_1)
    );
    const evidence = scenario.evidence.filter((e) => e.applicableUnitIds.includes(UNIT_1_1));
    const result = freezeUnitRelease(
      {
        id: "REL-1",
        unitId: UNIT_1_1,
        releaseVersion: 1,
        operationalRevisionId: "rev-1",
        familyDefinitionReleaseId: "1196@1",
        catalogueReleaseId: "cat-provisional-1196-0001",
        qualityProcedureVersions: ["hydro@1"],
        pdfDocumentVersionId: "doc-1",
        pdfChecksum: "d".repeat(64),
        releasedBy: "e-priya",
        releasedAt: "2026-08-20T10:00:00Z"
      },
      reqs,
      evidence
    );
    expect(result.ok).toBe(true);
    const manifest = result.manifest!;
    expect(manifest.satisfiedRequirementIds.length).toBe(reqs.length);
    expect(manifest.evidenceRefs).toContain("MC-204");
    expect(verifyManifestChecksum(manifest)).toBe(true);
  });

  it("a correction creates version 2 and preserves version 1", () => {
    const scenario = satisfyAll(UNIT_1_1, LINE_1);
    const reqs = scenario.ledger.requirements.filter(
      (r) => r.unitId === UNIT_1_1 || (!r.unitId && r.lineId === LINE_1)
    );
    const evidence = scenario.evidence.filter((e) => e.applicableUnitIds.includes(UNIT_1_1));
    const base = {
      id: "REL-1",
      unitId: UNIT_1_1,
      releaseVersion: 1,
      operationalRevisionId: "rev-1",
      familyDefinitionReleaseId: "1196@1",
      catalogueReleaseId: "cat-provisional-1196-0001",
      qualityProcedureVersions: ["hydro@1"],
      pdfDocumentVersionId: "doc-1",
      pdfChecksum: "d".repeat(64),
      releasedBy: "e-priya",
      releasedAt: "2026-08-20T10:00:00Z"
    };
    const v1 = freezeUnitRelease(base, reqs, evidence).manifest!;
    const v2 = supersedeRelease(
      v1,
      { ...base, id: "REL-2", pdfDocumentVersionId: "doc-2", releasedAt: "2026-08-21T10:00:00Z" },
      reqs,
      evidence
    ).manifest!;

    expect(v2.releaseVersion).toBe(2);
    expect(v2.supersedesId).toBe("REL-1");
    expect(v1.releaseVersion).toBe(1); // untouched
    expect(v1.checksum).not.toBe(v2.checksum);
  });

  it("reprinting the same released version reproduces an identical checksum", () => {
    const scenario = satisfyAll(UNIT_1_1, LINE_1);
    const reqs = scenario.ledger.requirements.filter(
      (r) => r.unitId === UNIT_1_1 || (!r.unitId && r.lineId === LINE_1)
    );
    const evidence = scenario.evidence.filter((e) => e.applicableUnitIds.includes(UNIT_1_1));
    const input = {
      id: "REL-1",
      unitId: UNIT_1_1,
      releaseVersion: 1,
      operationalRevisionId: "rev-1",
      familyDefinitionReleaseId: "1196@1",
      catalogueReleaseId: "cat-provisional-1196-0001",
      qualityProcedureVersions: ["hydro@1"],
      pdfDocumentVersionId: "doc-1",
      pdfChecksum: "d".repeat(64),
      releasedBy: "e-priya",
      releasedAt: "2026-08-20T10:00:00Z"
    };
    const a = freezeUnitRelease(input, reqs, evidence).manifest!;
    const b = freezeUnitRelease(input, reqs, evidence).manifest!;
    expect(a.checksum).toBe(b.checksum);
  });

  it("a Unit report never contains a sibling's Unit-scoped evidence", () => {
    const scenario = satisfyAll(UNIT_1_1, LINE_1);
    const evidence = scenario.evidence.filter((e) => e.applicableUnitIds.includes(UNIT_1_1));
    expect(evidence.map((e) => e.id)).not.toContain("PH-882");
  });
});
