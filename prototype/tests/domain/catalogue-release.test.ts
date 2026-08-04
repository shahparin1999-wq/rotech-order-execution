// CPQ catalogue release contract (docs/integration/CPQ_CATALOGUE_CONTRACT.md).
// Covers validation, checksum, the monetary boundary (invariant 5), pinning,
// provisional releasability, and the no-transcription guard that keeps product
// option tables out of the family modules.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CATALOGUE_RELEASE_SCHEMA,
  computeCatalogueChecksum,
  familyFromRelease,
  isReleasable,
  pinFor,
  pinMatches,
  validateCatalogueRelease,
  verifyCatalogueChecksum,
  type CatalogueRelease
} from "@/domain/catalogueRelease";
import {
  ACTIVE_CATALOGUE,
  activeCataloguePin,
  catalogueReleaseBlockers
} from "@/domain/catalogueRegistry";
import { catalogueBlockers1196, powerEndBuildChildren, pumpSizes1196 } from "@/domain/model1196";

const FIXTURE = "sample-data/cpq-catalogue-release.provisional.json";

function loadFixture(): CatalogueRelease {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as CatalogueRelease;
}

// Re-hash after mutating, so a test that changes content is testing the rule
// it means to test rather than incidentally tripping the checksum.
function reseal(release: CatalogueRelease): CatalogueRelease {
  return { ...release, checksum: computeCatalogueChecksum({ ...release, checksum: "" }) };
}

describe("Provisional catalogue fixture", () => {
  it("validates against the contract", () => {
    const result = validateCatalogueRelease(loadFixture());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("carries a self-consistent checksum", () => {
    expect(verifyCatalogueChecksum(loadFixture())).toBe(true);
  });

  it("is loaded as the active catalogue and pinned by id + checksum", () => {
    expect(ACTIVE_CATALOGUE).not.toBeNull();
    const pin = activeCataloguePin()!;
    expect(pin.catalogueReleaseId).toBe(ACTIVE_CATALOGUE!.catalogueReleaseId);
    expect(pin.checksum).toBe(ACTIVE_CATALOGUE!.checksum);
  });

  it("carries the 1196 family with frame spacing for every frame its sizes offer", () => {
    const family = familyFromRelease(loadFixture(), "1196")!;
    expect(family.pumpSizes).toHaveLength(31);
    const referenced = new Set(family.pumpSizes.flatMap((s) => s.frameOptions));
    for (const frame of referenced) {
      expect(family.frameSpacing![frame]).toBeDefined();
    }
    // The value D-1196-008 was open on now arrives through the contract.
    expect(family.frameSpacing!["XLR-17"]!.dbse).toBe(5.25);
  });
});

describe("Checksum and tampering", () => {
  it("rejects a release whose content was altered after publishing", () => {
    const tampered = loadFixture();
    tampered.families[0].pumpSizes[0].fullImpellerTrim = 99;
    const result = validateCatalogueRelease(tampered);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /checksum mismatch/i.test(e))).toBe(true);
  });

  it("rejects an unknown schema before trusting any other field", () => {
    const result = validateCatalogueRelease({ ...loadFixture(), schema: "something-else/9.9" });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/Unsupported schema/);
  });

  it("the canonical hash is key-order independent", () => {
    const release = loadFixture();
    const family = release.families[0];
    const reordered = {
      ...release,
      families: [
        Object.fromEntries(Object.entries(family).reverse()) as typeof family,
        ...release.families.slice(1)
      ]
    };
    expect(computeCatalogueChecksum(reordered)).toBe(computeCatalogueChecksum(release));
  });
});

describe("Monetary boundary (invariant 5)", () => {
  it("rejects a release carrying a price anywhere, however deeply nested", () => {
    const leaky = loadFixture();
    (leaky.families[0].pumpSizes[0] as unknown as Record<string, unknown>).listPrice = 3500;
    const result = validateCatalogueRelease(reseal(leaky));
    expect(result.ok).toBe(false);
    expect(result.monetaryLeaks).toContain("families[0].pumpSizes[0].listPrice");
  });

  it("the shipped fixture leaks no monetary field", () => {
    expect(validateCatalogueRelease(loadFixture()).monetaryLeaks).toEqual([]);
  });
});

describe("Structural fail-closed rules", () => {
  it("rejects a size whose default frame is not among its own options", () => {
    const bad = loadFixture();
    bad.families[0].pumpSizes[0].defaultFrame = "XLR";
    const result = validateCatalogueRelease(reseal(bad));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /not listed in its own frameOptions/.test(e))).toBe(true);
  });

  it("rejects a size referencing a frame with no frameSpacing entry", () => {
    const bad = loadFixture();
    bad.families[0].pumpSizes[0].frameOptions = ["STR", "NOPE"];
    const result = validateCatalogueRelease(reseal(bad));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /no frameSpacing entry/.test(e))).toBe(true);
  });

  it("rejects a part-code table missing a declared shaft type", () => {
    const bad = loadFixture();
    delete bad.families[0].partCodeRules!.shaftKitByShaftType["316SS SOLID SHAFT"];
    const result = validateCatalogueRelease(reseal(bad));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /has no entry for shaft type/.test(e))).toBe(true);
  });

  it("rejects duplicate family blocks", () => {
    const bad = loadFixture();
    bad.families = [bad.families[0], bad.families[0]];
    const result = validateCatalogueRelease(reseal(bad));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /more than one entry for familyCode/.test(e))).toBe(true);
  });
});

describe("Pinning and releasability", () => {
  it("a pin matches only when both id and checksum agree", () => {
    const release = loadFixture();
    const pin = pinFor(release);
    expect(pinMatches(pin, release)).toBe(true);
    // Same id, republished with different content — must not match.
    expect(pinMatches(pin, { ...release, checksum: "0".repeat(64) })).toBe(false);
    expect(pinMatches(pin, { ...release, catalogueReleaseId: "cat-other" })).toBe(false);
  });

  it("a provisional release is not releasable and says why", () => {
    const release = loadFixture();
    expect(release.status).toBe("provisional");
    expect(isReleasable(release)).toBe(false);

    const blockers = catalogueReleaseBlockers("1196");
    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.some((b) => /provisional/i.test(b))).toBe(true);
    expect(catalogueBlockers1196()).toEqual(blockers);
  });

  it("a published release imposes no catalogue blocker", () => {
    expect(isReleasable({ ...loadFixture(), status: "published" })).toBe(true);
  });

  it("reports a family the release does not carry", () => {
    // RVM (vertical multistage) is a real family CPQ has not published here.
    expect(catalogueReleaseBlockers("RVM").some((b) => /does not carry family RVM/.test(b))).toBe(true);
  });

  it("now carries the families needed to prove more than one shape", () => {
    const codes = loadFixture().families.map((f) => f.familyCode);
    expect(codes).toContain("1196");   // StandardAnsi
    expect(codes).toContain("1296");   // CloseCoupled
    expect(codes).toContain("SXT");    // SolidsHandling
    expect(codes).toContain("SCP");    // CompactSelfPrimer
  });
});

describe("Family options resolve through the catalogue", () => {
  it("power-end part codes come from the catalogue, not the module", () => {
    const children = powerEndBuildChildren("MTR", "316SS/316SS SLEEVED SHAFT")!;
    const family = familyFromRelease(loadFixture(), "1196")!;
    expect(children.find((c) => c.key === "shaftKit")!.partNumber).toBe(
      family.partCodeRules!.shaftKitByShaftType["316SS/316SS SLEEVED SHAFT"]
    );
    expect(children.find((c) => c.key === "bearingFrame")!.partNumber).toBe(
      family.partCodeRules!.powerFrameByShaftType["316SS/316SS SLEEVED SHAFT"]
    );
  });

  it("fails closed for a combination the catalogue declares unsupported", () => {
    expect(powerEndBuildChildren("XLR-17", "316SS SOLID SHAFT")).toBeNull();
    expect(powerEndBuildChildren("XLR-17", "4140/316SS SLEEVED SHAFT")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The guard that keeps this contract honest: option data must live in the
// catalogue release, never inline in a family module. Without this, a future
// change can quietly reintroduce a hand-copied table and nothing would notice.
// ---------------------------------------------------------------------------
describe("No-transcription guard", () => {
  const FAMILY_MODULES = ["src/domain/model1196.ts"];

  it("family modules contain no inline pump-size table", () => {
    for (const path of FAMILY_MODULES) {
      const source = readFileSync(path, "utf8");
      // Real pump sizes look like 3X4-13 / 1.5X3-10 / 8X10-15G. A literal in a
      // family module means someone transcribed the catalogue again.
      const sizeLiterals = source.match(/"\d+(\.\d+)?X\d+(\.\d+)?-\d+[A-Z]*"/g) ?? [];
      expect(sizeLiterals, `${path} must not hardcode pump sizes: ${sizeLiterals.join(", ")}`).toEqual([]);
    }
  });

  it("family modules contain no inline part-code table", () => {
    for (const path of FAMILY_MODULES) {
      const source = readFileSync(path, "utf8");
      // Composed CPQ part codes: A530L-P412, A529O-S20, …
      const partCodes = source.match(/"A\d{3}[A-Z]-[A-Z]\d+"/g) ?? [];
      expect(partCodes, `${path} must not hardcode part codes: ${partCodes.join(", ")}`).toEqual([]);
    }
  });

  it("every option the module offers is traceable to the pinned release", () => {
    const family = familyFromRelease(loadFixture(), "1196")!;
    expect(pumpSizes1196()).toEqual(family.pumpSizes);
  });

  it("the schema constant is the one the contract names", () => {
    expect(CATALOGUE_RELEASE_SCHEMA).toBe("rotech-cpq-catalogue-release/1.0");
  });
});
