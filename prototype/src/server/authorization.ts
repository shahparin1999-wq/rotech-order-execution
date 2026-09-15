import type { Action } from "@/domain/reducer";
import type { AppState, Employee, Facility } from "@/domain/types";
import { INVENTORY_CAPABILITIES, type InventoryCapability } from "@/domain/inventory/contracts";

export interface OehIdentity {
  authenticatedUserId: string;
  authenticatedEmail: string;
  oehUserId: string;
  rotechEmployeeId: string;
  facilityScope: Facility[];
  jobRole: string;
  capabilities: InventoryCapability[];
}

export class IdentityError extends Error {
  readonly status = 401;
  constructor(message: string) {
    super(message);
    this.name = "IdentityError";
  }
}

export class CapabilityError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "CapabilityError";
  }
}

function roleCapabilities(role: string): InventoryCapability[] {
  const all = [...INVENTORY_CAPABILITIES];
  switch (role) {
    case "Shipping": return ["inventory.receive", "inventory.putAway"];
    case "Quality Inspector": return ["inventory.inspect"];
    case "Production Manager": return ["inventory.adjust", "inventory.confirmOpeningBalance"];
    case "Technician":
    case "Machinist": return ["inventory.issue", "inventory.return"];
    case "Purchasing": return ["inventory.manageExpectedShipment"];
    case "System Admin": return all.filter((x) => x !== "inventory.inspect");
    default: return [];
  }
}

function isFacility(value: unknown): value is Facility {
  return value === "Mississauga" || value === "Houston";
}

function configuredMappings(): Array<{ subject?: string; email?: string; oehUserId: string; rotechEmployeeId: string; facilityScope?: Facility[] }> {
  const raw = process.env.OEH_IDENTITY_MAP_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("must be an array");
    return parsed.filter((x): x is { subject?: string; email?: string; oehUserId: string; rotechEmployeeId: string; facilityScope?: Facility[] } => {
      if (!x || typeof x !== "object") return false;
      const row = x as Record<string, unknown>;
      return typeof row.oehUserId === "string" && row.oehUserId.trim().length > 0 &&
        typeof row.rotechEmployeeId === "string" && row.rotechEmployeeId.trim().length > 0 &&
        (row.subject === undefined || typeof row.subject === "string") &&
        (row.email === undefined || typeof row.email === "string") &&
        (row.facilityScope === undefined || (Array.isArray(row.facilityScope) && row.facilityScope.every(isFacility)));
    });
  } catch {
    throw new IdentityError("OEH_IDENTITY_MAP_JSON is invalid; identity mapping is unavailable");
  }
}

function employeeIdentity(employee: Employee, authenticatedUserId: string, authenticatedEmail: string, facilityScope?: Facility[], mappedRotechEmployeeId?: string): OehIdentity {
  if (!employee.rotechEmployeeId?.trim()) {
    throw new IdentityError("OEH employee is missing a Rotech employee mapping");
  }
  if (mappedRotechEmployeeId && employee.rotechEmployeeId !== mappedRotechEmployeeId) {
    throw new IdentityError("Authenticated identity is mapped to a different Rotech employee");
  }
  const resolvedScope = facilityScope ?? [employee.facility];
  if (resolvedScope.length === 0 || resolvedScope.some((value) => !isFacility(value))) {
    throw new IdentityError("Authenticated identity has no valid facility scope");
  }
  const capabilities = roleCapabilities(employee.role);
  return {
    authenticatedUserId,
    authenticatedEmail,
    oehUserId: employee.id,
    rotechEmployeeId: employee.rotechEmployeeId,
    facilityScope: resolvedScope,
    jobRole: employee.role,
    capabilities
  };
}

/** Resolves Site authentication to an OEH employee. Missing mapping fails closed. */
export function resolveRequestIdentity(request: Request, state: AppState): OehIdentity {
  const subject = request.headers.get("oai-authenticated-user-id")?.trim() ?? "";
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  const uatEmployeeId = request.headers.get("x-oeh-uat-employee-id")?.trim() ?? "";
  if (!subject || !email) {
    if (process.env.OEH_UAT_MODE !== "1" || !uatEmployeeId) {
      throw new IdentityError("Authenticated Site identity is required");
    }
    const employee = state.employees.find((x) => x.id === uatEmployeeId);
    if (!employee) throw new IdentityError("UAT identity is not mapped to an OEH employee");
    return employeeIdentity(employee, `uat:${employee.id}`, employee.email ?? `${employee.id}@uat.rotech.example`);
  }

  const mapping = configuredMappings().find((x) => (x.subject && x.subject === subject) || (x.email && x.email.toLowerCase() === email));
  const employee = mapping
    ? state.employees.find((x) => x.id === mapping.oehUserId)
    : state.employees.find((x) => x.authSubject === subject || x.email?.toLowerCase() === email);
  if (!employee) throw new IdentityError("Authenticated identity is not mapped to an OEH employee");
  return employeeIdentity(employee, subject, email, mapping?.facilityScope, mapping?.rotechEmployeeId);
}

function requireCapability(identity: OehIdentity, capability: InventoryCapability): void {
  if (!identity.capabilities.includes(capability)) {
    throw new CapabilityError(`${identity.jobRole} is not authorized for ${capability}`);
  }
}

function requireFacility(identity: OehIdentity, facility: string | undefined): void {
  if (facility && !identity.facilityScope.includes(facility as Facility)) {
    throw new CapabilityError(`Facility ${facility} is outside this user's scope`);
  }
}

function identityFacility(state: AppState, identityId: string): Facility | undefined {
  return state.inventoryIdentities.find((x) => x.id === identityId)?.facility as Facility | undefined;
}

function unitFacility(state: AppState, unitId: string): Facility | undefined {
  const unit = state.units.find((x) => x.unitId === unitId);
  return unit ? state.orders.find((x) => x.orderNumber === unit.orderNumber)?.facility : undefined;
}

/** Capability and facility checks for all inventory command variants. */
export function authorizeInventoryAction(action: Action, identity: OehIdentity, state: AppState): void {
  switch (action.type) {
    case "feasibilityProbe":
      requireCapability(identity, "inventory.receive");
      return;
    case "receiveInventory":
      requireCapability(identity, "inventory.receive");
      requireFacility(identity, action.input.facility);
      return;
    case "inspectInventory":
      requireCapability(identity, "inventory.inspect");
      requireFacility(identity, identityFacility(state, action.identityId));
      return;
    case "putAwayInventory":
      requireCapability(identity, "inventory.putAway");
      requireFacility(identity, state.inventoryLocations.find((x) => x.id === action.locationId)?.facility);
      requireFacility(identity, identityFacility(state, action.identityId));
      return;
    case "createPutAwayJob":
      requireCapability(identity, "inventory.putAway");
      requireFacility(identity, action.facility);
      for (const identityId of action.identityIds) requireFacility(identity, identityFacility(state, identityId));
      return;
    case "reserveInventory":
    case "issueInventoryToUnit":
    case "installInventory":
      requireCapability(identity, "inventory.issue");
      requireFacility(identity, identityFacility(state, action.identityId));
      requireFacility(identity, unitFacility(state, action.unitId));
      return;
    case "returnInventoryToStock":
      requireCapability(identity, "inventory.return");
      requireFacility(identity, identityFacility(state, action.identityId));
      requireFacility(identity, state.inventoryLocations.find((x) => x.id === action.locationId)?.facility);
      requireFacility(identity, unitFacility(state, action.unitId));
      return;
    case "adjustInventory":
      requireCapability(identity, "inventory.adjust");
      requireFacility(identity, identityFacility(state, action.identityId));
      return;
    case "confirmOpeningImport":
      requireCapability(identity, "inventory.confirmOpeningBalance");
      for (const line of action.input.lines) requireFacility(identity, identityFacility(state, line.identityId));
      return;
    case "recordShipmentParse":
      requireCapability(identity, "inventory.manageExpectedShipment");
      requireFacility(identity, action.input.shipment?.facility);
      return;
    case "editExpectedShipmentDraft":
    case "confirmExpectedShipment":
    case "supersedeExpectedShipment": {
      requireCapability(identity, "inventory.manageExpectedShipment");
      const shipmentId = action.type === "editExpectedShipmentDraft" ? action.input.shipmentId : action.shipmentId;
      requireFacility(identity, state.expectedShipments.find((x) => x.id === shipmentId)?.facility);
      return;
    }
    default:
      return;
  }
}
