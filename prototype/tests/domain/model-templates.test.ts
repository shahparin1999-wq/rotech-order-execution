import { describe, it, expect } from "vitest";
import { buildInitialState } from "@/domain/fixtures";
import { createWorkOrder } from "@/domain/actions";
import { getModelTemplate, listModelTemplates } from "@/domain/modelTemplates";

function baseInput(state: ReturnType<typeof buildInitialState>, orderNumber: string, templateId?: string) {
  return {
    orderNumber,
    customerId: state.customers[0].id,
    customerPo: "PO-1",
    description: "Test order",
    facility: "Mississauga" as const,
    orderType: "Bare pump end",
    priority: "Medium" as const,
    dueDate: "2026-08-01",
    coordinatorId: state.currentUserId,
    quantity: 2,
    model: "1196",
    size: "3x4-13",
    material: "316SS",
    templateId
  };
}

function routeNames(state: ReturnType<typeof buildInitialState>, unitId: string): string[] {
  return state.routeOps
    .filter((o) => o.unitId === unitId)
    .sort((a, b) => a.seq - b.seq)
    .map((o) => o.name);
}

describe("model templates registry", () => {
  it("seeds pump, pump-package, and custom templates, all pilot placeholders", () => {
    const ids = listModelTemplates().map((t) => t.id);
    expect(ids).toContain("1196-pump-end");
    expect(ids).toContain("1196-pump-package");
    expect(ids).toContain("custom");
    expect(listModelTemplates().every((t) => t.pilotPlaceholder)).toBe(true);
  });
});

describe("createWorkOrder with a model template", () => {
  it("applies the 1196 pump-end master routing and records the template + lineType", () => {
    const on = "TMPL-PUMP";
    const state = createWorkOrder(buildInitialState(), "e-alex", baseInput(buildInitialState(), on, "1196-pump-end"));
    const line = state.orders.find((o) => o.orderNumber === on)!.lines[0];
    expect(line.templateId).toBe("1196-pump-end");
    expect(line.lineType).toBe("pump");
    expect(line.templateName).toContain("1196 Pump End");

    const expected = getModelTemplate("1196-pump-end")!.route.map((r) => r.name);
    expect(routeNames(state, `${on}_1.1`)).toEqual(expected);
    expect(routeNames(state, `${on}_1.2`)).toEqual(expected); // both units get the route
  });

  it("the custom template keeps the generic route and records no template/lineType", () => {
    const on = "TMPL-CUSTOM";
    const state = createWorkOrder(buildInitialState(), "e-alex", baseInput(buildInitialState(), on, "custom"));
    const line = state.orders.find((o) => o.orderNumber === on)!.lines[0];
    expect(line.templateId).toBeUndefined();
    expect(line.lineType).toBeUndefined();
    expect(routeNames(state, `${on}_1.1`)).toEqual([
      "Intake review",
      "Production",
      "Quality inspection",
      "Packaging"
    ]);
  });

  it("no templateId (backward compatible) keeps the generic route", () => {
    const on = "TMPL-NONE";
    const state = createWorkOrder(buildInitialState(), "e-alex", baseInput(buildInitialState(), on, undefined));
    expect(routeNames(state, `${on}_1.1`)).toEqual([
      "Intake review",
      "Production",
      "Quality inspection",
      "Packaging"
    ]);
  });
});
