// Derived part numbers, ported from CPQ buildPumpPartNumber /
// buildMajorComponentPartCodes. The anchor cases below are taken from a real
// CPQ screenshot so a divergence from the sales side fails here rather than in
// the shop.

import { describe, expect, it } from "vitest";
import {
  assemblyPartNumber,
  closeCoupledAssemblySuffix,
  hydraulicSizeCode,
  majorComponentPartCodes,
  type PumpConfigurationInput
} from "@/domain/partNumbers";
import {
  capabilitiesForFamily,
  closeCoupledAdapterCode,
  familyShape,
  isSimplifiedShape,
  stubShaftBore,
  stubShaftBoreCode
} from "@/domain/familyShapes";

// The exact configuration from the CPQ Line 8 screenshot.
const SCREENSHOT: PumpConfigurationInput = {
  familyCode: "1196",
  pumpSize: "4X6-10H",
  frameSize: "MTR",
  materialBuild: "CS/316SS",
  flangeType: "150#FF",
  sbcType: "STD BORE",
  shaftType: "4140/316SS SLEEVED SHAFT",
  fullImpellerTrim: 10.25
};

function codeFor(config: PumpConfigurationInput, key: string): string {
  return majorComponentPartCodes(config).find((c) => c.key === key)!.result.value;
}

describe("Reproduces the CPQ screenshot exactly", () => {
  it("assembly part number", () => {
    expect(assemblyPartNumber(SCREENSHOT).value).toBe("A-M-532-AP-SB-1F-B42");
  });

  it("casing", () => {
    expect(codeFor(SCREENSHOT, "casing")).toBe("100-AP-M-A-1F-CS");
  });

  it("impeller", () => {
    expect(codeFor(SCREENSHOT, "impeller")).toBe("101-AP-M-A-S6");
  });

  it("stuffing box cover — a CS build takes a ductile-iron cover", () => {
    // materialCodeByFamily overrides CS/316SS -> DI for 1196.
    expect(codeFor(SCREENSHOT, "stuffingBoxCover")).toBe("184-10-SB-M-A-DI");
  });
});

describe("Hydraulic size code", () => {
  it("rounds the full impeller diameter and zero-pads", () => {
    expect(hydraulicSizeCode(10.25)).toBe("10");
    expect(hydraulicSizeCode(8.375)).toBe("08");
    expect(hydraulicSizeCode(13)).toBe("13");
  });

  it("caps at 17 for anything 16 and above", () => {
    expect(hydraulicSizeCode(16.75)).toBe("17");
    expect(hydraulicSizeCode(20)).toBe("17");
  });

  it("returns empty when the diameter is unknown", () => {
    expect(hydraulicSizeCode(undefined)).toBe("");
    expect(hydraulicSizeCode(0)).toBe("");
  });
});

describe("Fails closed rather than emitting a wrong number", () => {
  it("reports what is missing instead of guessing", () => {
    const result = assemblyPartNumber({ ...SCREENSHOT, flangeType: "", sbcType: "" });
    expect(result.status).toBe("code-needed");
    expect(result.value).toBe("Code Needed");
    expect(result.missing.join(" ")).toMatch(/flange code/);
    expect(result.missing.join(" ")).toMatch(/SBC code/);
  });

  it("a customization forces RFQ across every component", () => {
    const custom = { ...SCREENSHOT, isCustom: true };
    expect(assemblyPartNumber(custom).value).toBe("RFQ");
    expect(majorComponentPartCodes(custom).every((c) => c.result.value === "RFQ")).toBe(true);
  });

  it("a custom shaft kit also forces RFQ", () => {
    expect(assemblyPartNumber({ ...SCREENSHOT, shaftType: "CUSTOM" }).value).toBe("RFQ");
  });

  it("returns nothing at all before a size is chosen", () => {
    expect(majorComponentPartCodes({ ...SCREENSHOT, pumpSize: "" })).toEqual([]);
  });
});

describe("Family shapes", () => {
  it("classifies every catalogue family the way CPQ does", () => {
    expect(familyShape("1196")).toBe("StandardAnsi");
    expect(familyShape("1196LF")).toBe("StandardAnsi");
    expect(familyShape("1796")).toBe("StandardAnsi");
    expect(familyShape("1296")).toBe("CloseCoupled");
    expect(familyShape("1296LF")).toBe("CloseCoupled");
    expect(familyShape("1796CC")).toBe("CloseCoupled");
    expect(familyShape("SXT")).toBe("SolidsHandling");
    expect(familyShape("SXU")).toBe("SolidsHandling");
    expect(familyShape("SCP")).toBe("CompactSelfPrimer");
    expect(familyShape("1600")).toBe("CompactSelfPrimer");
    expect(familyShape("RE500CC")).toBe("CompactSelfPrimer");
  });

  it("is case-insensitive and defaults unknown families to standard ANSI", () => {
    expect(familyShape("sxt")).toBe("SolidsHandling");
    expect(familyShape("SOMETHING-NEW")).toBe("StandardAnsi");
  });

  it("simplified shapes drop the seal/docs/template steps", () => {
    expect(isSimplifiedShape("SolidsHandling")).toBe(true);
    expect(isSimplifiedShape("CompactSelfPrimer")).toBe(true);
    expect(isSimplifiedShape("StandardAnsi")).toBe(false);
    expect(isSimplifiedShape("CloseCoupled")).toBe(false);
  });

  it("gives each shape the right capabilities", () => {
    const ansi = capabilitiesForFamily("1196");
    expect(ansi.choosesShaftKit).toBe(true);
    expect(ansi.configuresSeal).toBe(true);
    expect(ansi.closeCoupled).toBe(false);
    expect(ansi.composesPartNumbers).toBe(true);

    const cc = capabilitiesForFamily("1296");
    expect(cc.closeCoupled).toBe(true);
    expect(cc.choosesShaftKit).toBe(false); // stub shaft derives from motor frame

    const solids = capabilitiesForFamily("SXT");
    expect(solids.supportsBeltDrive).toBe(true);
    expect(solids.configuresSeal).toBe(false); // seal is part of the released build
    expect(solids.choosesFrame).toBe(false);
  });
});

describe("Close-coupled stub shaft and adapter", () => {
  it("switches to big bore at 254JM, per the CPQ rule", () => {
    expect(stubShaftBore("215JM")).toBe("Standard");
    expect(stubShaftBore("254JM")).toBe("Big");
    expect(stubShaftBore("256JM")).toBe("Big");
    expect(stubShaftBoreCode("215JM")).toBe("G");
    expect(stubShaftBoreCode("254JM")).toBe("K");
  });

  it("resolves the previously ambiguous frames", () => {
    // 213JM sits between the ranges quoted from memory; CPQ's numeric
    // threshold makes it unambiguously standard bore.
    expect(stubShaftBore("213JM")).toBe("Standard");
    expect(stubShaftBore("326JM")).toBe("Big");
    expect(stubShaftBore("365JM")).toBe("Big");
  });

  it("fails closed on an unknown motor frame", () => {
    expect(stubShaftBore("")).toBeNull();
    expect(stubShaftBoreCode("unknown")).toBeNull();
  });

  it("derives the adapter code from pump frame and bore", () => {
    expect(closeCoupledAdapterCode("MTR", "215JM")).toBe("B");
    expect(closeCoupledAdapterCode("MTR", "254JM")).toBe("C");
    expect(closeCoupledAdapterCode("STR", "143JM")).toBe("A");
    expect(closeCoupledAdapterCode("XLR", "284JM")).toBe("D");
  });

  it("uses the A/B/C adapter bands for the assembly suffix", () => {
    expect(closeCoupledAssemblySuffix("143JM")).toBe("SA"); // std bore, band A
    expect(closeCoupledAssemblySuffix("184JM")).toBe("SA");
    expect(closeCoupledAssemblySuffix("213JM")).toBe("SB"); // std bore, band B
    expect(closeCoupledAssemblySuffix("254JM")).toBe("BB"); // big bore, band B
    expect(closeCoupledAssemblySuffix("256JM")).toBe("BB");
    expect(closeCoupledAssemblySuffix("284JM")).toBe("BC"); // big bore, band C
    expect(closeCoupledAssemblySuffix("365JM")).toBe("BC");
    expect(closeCoupledAssemblySuffix("400JM")).toBe(""); // outside every band
  });

  it("a close-coupled assembly number needs the motor frame", () => {
    const cc: PumpConfigurationInput = {
      familyCode: "1296",
      pumpSize: "3X4-8",
      frameSize: "MTR",
      materialBuild: "DI/316SS",
      flangeType: "150#FF",
      sbcType: "STD BORE",
      fullImpellerTrim: 8.375
    };
    expect(assemblyPartNumber(cc).status).toBe("code-needed");
    expect(assemblyPartNumber({ ...cc, motorFrame: "254JM" }).status).toBe("standard");
  });
});

describe("Families that ship released part numbers", () => {
  it("does not try to compose a number for solids handling", () => {
    const result = assemblyPartNumber({
      familyCode: "SXT",
      pumpSize: "SXT-3",
      frameSize: "SXT",
      materialBuild: "STANDARD CI/DI"
    });
    expect(result.status).toBe("pending");
    expect(result.value).toBe("Released part number");
  });
});
