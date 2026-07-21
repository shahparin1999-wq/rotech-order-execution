// Master data: per-model "templates" that carry a default master routing, a BOM
// skeleton, allowed order types, and default materials. Selecting a template on
// the New Work Order (Create manually) tab pre-fills the order and gives its
// Units the model's real route instead of the flat generic one.
//
// This is static seed master data for the prototype (read-only admin view). The
// route/checklist/tolerance content is NOT the governed manufacturing standard
// (D-013 is still Proposed), so every template is labelled a pilot placeholder.
// A "Custom / other" template preserves the previous generic behaviour and
// free-text model entry.

import type { Department } from "./types";

export interface ModelRouteStep {
  name: string;
  department: Department;
}

export interface ModelBomRow {
  description: string;
  material?: string;
  quantity: number;
  partNumber?: string;
}

export interface ModelTemplate {
  id: string;
  model: string; // "1196"; empty for the free-text custom template
  variant: string; // "pump-end" | "pump-package" | "custom"
  displayName: string;
  lineType?: "pump" | "pump-package"; // aligns with the CPQ contract line types
  isCustom: boolean; // true => user types the model/route freely (generic route)
  allowedOrderTypes: string[];
  defaultMaterial: string;
  route: ModelRouteStep[];
  bomSkeleton: ModelBomRow[];
  // Every seeded route/BOM is a pilot placeholder pending owner approval.
  pilotPlaceholder: true;
}

const PUMP_END_ROUTE: ModelRouteStep[] = [
  { name: "Intake review", department: "Coordination" },
  { name: "Machining", department: "Machining" },
  { name: "Assembly", department: "Assembly" },
  { name: "Hydrotest", department: "Quality" },
  { name: "Final QC", department: "Quality" },
  { name: "Packaging", department: "Shipping" }
];

const PUMP_PACKAGE_ROUTE: ModelRouteStep[] = [
  { name: "Intake review", department: "Coordination" },
  { name: "Machining", department: "Machining" },
  { name: "Assembly", department: "Assembly" },
  { name: "Baseplate mounting", department: "Assembly" },
  { name: "Motor mounting & alignment", department: "Assembly" },
  { name: "Hydrotest", department: "Quality" },
  { name: "String test", department: "Quality" },
  { name: "Final QC", department: "Quality" },
  { name: "Packaging", department: "Shipping" }
];

const GENERIC_ROUTE: ModelRouteStep[] = [
  { name: "Intake review", department: "Coordination" },
  { name: "Production", department: "Assembly" },
  { name: "Quality inspection", department: "Quality" },
  { name: "Packaging", department: "Shipping" }
];

const PUMP_END_BOM: ModelBomRow[] = [
  { description: "Casing", quantity: 1, material: "316SS" },
  { description: "Impeller", quantity: 1, material: "316SS" },
  { description: "Shaft", quantity: 1, material: "316SS" },
  { description: "Mechanical seal", quantity: 1 },
  { description: "Bearing frame", quantity: 1 }
];

export const MODEL_TEMPLATES: ModelTemplate[] = [
  {
    id: "1196-pump-end",
    model: "1196",
    variant: "pump-end",
    displayName: "1196 Pump End",
    lineType: "pump",
    isCustom: false,
    allowedOrderTypes: ["Bare pump end", "Repair", "Spare parts"],
    defaultMaterial: "316SS",
    route: PUMP_END_ROUTE,
    bomSkeleton: PUMP_END_BOM,
    pilotPlaceholder: true
  },
  {
    id: "1196-pump-package",
    model: "1196",
    variant: "pump-package",
    displayName: "1196 Pump Package",
    lineType: "pump-package",
    isCustom: false,
    allowedOrderTypes: ["Pump package", "Bare pump end"],
    defaultMaterial: "316SS",
    route: PUMP_PACKAGE_ROUTE,
    bomSkeleton: [
      ...PUMP_END_BOM,
      { description: "Baseplate", quantity: 1, material: "Fabricated steel" },
      { description: "Motor", quantity: 1 },
      { description: "Coupling", quantity: 1 },
      { description: "Coupling guard", quantity: 1 }
    ],
    pilotPlaceholder: true
  },
  {
    id: "custom",
    model: "",
    variant: "custom",
    displayName: "Custom / other (type model)",
    isCustom: true,
    allowedOrderTypes: ["Custom", "Repair"],
    defaultMaterial: "",
    route: GENERIC_ROUTE,
    bomSkeleton: [],
    pilotPlaceholder: true
  }
];

export function listModelTemplates(): ModelTemplate[] {
  return MODEL_TEMPLATES;
}

export function getModelTemplate(id: string): ModelTemplate | undefined {
  return MODEL_TEMPLATES.find((t) => t.id === id);
}
