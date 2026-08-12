// Demo stock.
//
// Until this existed, `inventoryIdentities`, `inventoryMovements` and
// `inventoryReceipts` were all seeded `[]` while the rest of the app was
// richly populated — so every Inventory screen read "Nothing received yet."
// and the only way to put anything on it was hand-typing receipts one at a
// time. That is why inventory looked like a ticket queue rather than a
// stockroom: there was no stock.
//
// Everything here is built by REPLAYING the real actions
// (receive → inspect → put away → reserve), so the append-only movement
// ledger is genuine and every derived quantity — on hand, reserved,
// available, quality state, location, allocation — is computed the same way
// it is for a live receipt. No hand-written movement rows, no stored
// quantities.
//
// The spread is deliberate: free stock, stock reserved to a Unit, stock still
// in quarantine, and roles with nothing at all. A demo where everything is
// available proves nothing.

import type { AppState } from "./types";
import {
  inspectInventory,
  putAwayInventory,
  receiveInventory,
  reserveInventory,
  type ReceiveInput
} from "./inventoryActions";

const MIS = "Mississauga";
const HOU = "Houston";

type SeedItem = ReceiveInput & {
  /** Leave in quarantine when false. Defaults to accepted. */
  accept?: boolean;
  /** Put-away destination once accepted. */
  location?: string;
  /** Reserve the whole quantity to this Unit after put-away. */
  reserveTo?: string;
};

// Dates are fixed rather than relative so screenshots and tests stay stable.
const T = (day: number, hour = 9) =>
  `2026-07-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00Z`;

const SEED: Array<{ at: string; by: string; item: SeedItem }> = [
  // --- Castings: the roles the real spreadsheet tracks as a size × material
  // grid. Heat-tracked, so each carries a heat number.
  {
    at: T(6), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "casing",
      partNumber: "100-34-M-A-1F-S6", description: "Casing 3X4-13 MTR 150# FF",
      material: "316SS", quantity: 1, heatNumber: "H38102",
      attributes: { family: "1196", size: "3X4-13", frame: "MTR" },
      location: "LOC-MIS-B04-03"
    }
  },
  {
    at: T(6, 10), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "casing",
      partNumber: "100-68-X-A-1F-S6", description: "Casing 6X8-13 XLR 150# FF",
      material: "316SS", quantity: 1, heatNumber: "H38291",
      attributes: { family: "1196", size: "6X8-13", frame: "XLR" },
      location: "LOC-MIS-B04-03",
      // Held by another order — this is the "can't build 6X8-13, holding
      // Knighten orders" case, computed instead of typed in a remark.
      reserveTo: "SAMPLE1001_1.1"
    }
  },
  {
    at: T(7), by: "e-tom",
    item: {
      kind: "Stock", facility: HOU, componentKey: "casing",
      partNumber: "100-68-X-A-1F-S6", description: "Casing 6X8-13 XLR 150# FF",
      material: "316SS", quantity: 1, heatNumber: "H38412",
      attributes: { family: "1196", size: "6X8-13", frame: "XLR" },
      location: "LOC-HOU-A1"
    }
  },
  {
    at: T(7, 11), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "casing",
      partNumber: "100-15-S-A-1F-DI", description: "Casing 1.5X3-8 STR 150# FF",
      material: "Ductile Iron", quantity: 2, heatNumber: "H37744",
      attributes: { family: "1196", size: "1.5X3-8", frame: "STR" },
      location: "LOC-MIS-B04-04"
    }
  },
  {
    at: T(8), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "stuffingBoxCover",
      partNumber: "184-34-M-S6", description: "Stuffing box cover 3X4-13 MTR",
      material: "316SS", quantity: 2, heatNumber: "H38150",
      attributes: { family: "1196", size: "3X4-13", frame: "MTR" },
      location: "LOC-MIS-B04-04"
    }
  },
  {
    at: T(8, 14), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "powerFrame",
      partNumber: "228-M-DI", description: "Power frame MTR",
      material: "Ductile Iron", quantity: 3, heatNumber: "H38077",
      attributes: { family: "1196", frame: "MTR" },
      location: "LOC-MIS-C02"
    }
  },

  // --- Rotating
  {
    at: T(9), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "impeller",
      partNumber: "101-34-M-A-S6", description: "Impeller 3X4-13 MTR max diameter",
      material: "316SS", quantity: 2, heatNumber: "H41002",
      attributes: { family: "1196", size: "3X4-13", frame: "MTR" },
      location: "LOC-MIS-B04-03"
    }
  },
  {
    at: T(9, 13), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "impeller",
      partNumber: "101-34-M-A-C4", description: "Impeller 3X4-13 MTR max diameter",
      material: "CD4MCU", quantity: 1, heatNumber: "H41007",
      attributes: { family: "1196", size: "3X4-13", frame: "MTR" },
      location: "LOC-MIS-B04-03"
    }
  },
  {
    at: T(10), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "shaftKit",
      partNumber: "SK-MTR-4140-S6", description: "Shaft kit MTR 4140 with 316SS sleeve",
      material: "4140/316SS", quantity: 4, lotNumber: "L-SK-2231",
      attributes: { family: "1196", frame: "MTR" },
      location: "LOC-MIS-C02"
    }
  },

  // --- Seals and bearings: lot-tracked, no size/frame at all. These are the
  // items that prove inventory identity is not pump-shaped.
  {
    at: T(10, 15), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "seal",
      partNumber: "CHE-155-2125", description: "Mechanical seal Chesterton 155, 2.125 in",
      quantity: 4, lotNumber: "L-SEAL-8841",
      attributes: { manufacturer: "Chesterton", size: "2.125 in", plan: "Plan 11" },
      location: "LOC-MIS-C02"
    }
  },
  {
    at: T(11), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "bearings",
      partNumber: "SKF-6309-C3", description: "Bearing SKF 6309 C3",
      quantity: 12, lotNumber: "L-BRG-5510",
      attributes: { manufacturer: "SKF", type: "Deep groove ball" },
      location: "LOC-MIS-C02"
    }
  },

  // --- Motor: serialized, and nothing about it is pump-size shaped.
  {
    at: T(11, 12), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "motor",
      partNumber: "WEG-20-256T-TEFC", description: "Motor 20 HP 256T TEFC 1800 RPM 460/3/60",
      quantity: 1, serialNumber: "WEG-2025-88431",
      attributes: { manufacturer: "WEG", hp: "20", frame: "256T", enclosure: "TEFC", rpm: "1800" },
      location: "LOC-MIS-C02"
    }
  },

  // --- Coupling: arrived, still awaiting incoming inspection. Real
  // "Expected/awaiting inspection" state, not a fabricated one.
  {
    at: T(12), by: "e-tom",
    item: {
      kind: "AgainstPo", facility: MIS, componentKey: "coupling",
      poNumber: "426137", poLine: "3", vendor: "TB Woods",
      partNumber: "TBW-SF-SPACER-EPDM", description: "Coupling TB Woods Sure-Flex EPDM spacer",
      quantity: 2,
      attributes: { manufacturer: "TB Woods", type: "Sure-Flex spacer", element: "EPDM" },
      accept: false
    }
  },

  // --- Baseplate: serialized, no material grid.
  {
    at: T(12, 14), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "baseplate",
      partNumber: "BP-BENT-CH-MS-2214", description: "Baseplate bent channel, mild steel",
      material: "Mild Steel", quantity: 1, serialNumber: "BP-2214-0007",
      attributes: { style: "Bent channel", drawing: "BP-2214" },
      location: "LOC-MIS-B04-04"
    }
  },

  // --- Guard, hardware, accessory: quantity-tracked consumables.
  {
    at: T(13), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "couplingGuard",
      partNumber: "GRD-ALU-BARREL", description: "Coupling guard, aluminium non-spark barrel",
      material: "Aluminium", quantity: 3,
      attributes: { style: "Barrel", nonSpark: "Yes" },
      location: "LOC-MIS-B04-04"
    }
  },
  {
    at: T(13, 11), by: "e-tom",
    item: {
      kind: "Stock", facility: MIS, componentKey: "gasket",
      partNumber: "GSK-CASE-34-13", description: "Casing gasket 3X4-13",
      quantity: 8, lotNumber: "L-GSK-1180",
      attributes: { size: "3X4-13" },
      location: "LOC-MIS-C02"
    }
  },
  {
    at: T(13, 12), by: "e-tom",
    item: {
      kind: "Stock", facility: HOU, componentKey: "fasteners",
      partNumber: "HDW-B7-STUD-KIT", description: "Stud kit ASTM A193 B7 with 2H nuts",
      quantity: 20,
      attributes: { grade: "B7" },
      location: "LOC-HOU-A1"
    }
  }
];

/**
 * Applies the demo stock to a freshly built state. Runs the real actions in
 * order, so anything that would be rejected live (a heat-tracked casting with
 * no heat number, reserving unaccepted stock) is rejected here too.
 */
export function seedInventory(state: AppState): AppState {
  let s = state;

  for (const { at, by, item } of SEED) {
    const { accept = true, location, reserveTo, ...receive } = item;

    s = receiveInventory(s, by, receive, at);
    const identityId = s.inventoryIdentities.at(-1)!.id;

    if (!accept) continue; // stays in quarantine, awaiting inspection

    s = inspectInventory(s, "e-priya", identityId, "Accept", "Incoming inspection passed", at);
    if (location) s = putAwayInventory(s, by, identityId, location, at);
    if (reserveTo) {
      s = reserveInventory(s, "e-dave", identityId, reserveTo, receive.quantity, undefined, at);
    }
  }

  return s;
}
