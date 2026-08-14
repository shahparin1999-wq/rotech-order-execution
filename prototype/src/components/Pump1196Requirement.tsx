"use client";

// One 1196 component requirement as an actionable row. Used by both the
// coordinator's Order > line > Parts & subassemblies rollup and the
// mechanic's Unit page (the QR-scan landing view) so the shop floor can
// record what was actually used without going back through the order.

import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import type { ComponentRequirement1196 } from "@/domain/types";

export function Pump1196RequirementRow({ requirement }: { requirement: ComponentRequirement1196 }) {
  const dispatch = useAppDispatch();
  const [partNumber, setPartNumber] = useState("");
  const canRecordUsage =
    requirement.availabilityState !== "Complete" &&
    requirement.availabilityState !== "NotInScope" &&
    requirement.availabilityState !== "CustomerSupplied";
  return (
    <tr data-testid={`req1196-${requirement.id}`} style={requirement.parentRequirementId ? { fontSize: 13 } : undefined}>
      <td>
        {requirement.parentRequirementId ? `↳ ${requirement.label}` : requirement.label}
        {requirement.catalogPartNumber && (
          <>
            {" "}
            <code style={{ fontSize: 12 }}>{requirement.catalogPartNumber}</code>
          </>
        )}
      </td>
      <td>{requirement.availabilityState}</td>
      <td>
        {requirement.key === "powerEndAssembly" && requirement.availabilityState === "Required" && (
          <>
            <button
              type="button"
              className="btn"
              data-testid={`powerend-available-${requirement.scopeId}`}
              onClick={() => dispatch({ type: "decidePowerEndAvailability", unitId: requirement.scopeId, decision: "Available" })}
            >
              Available
            </button>{" "}
            <button
              type="button"
              className="btn"
              data-testid={`powerend-build-${requirement.scopeId}`}
              onClick={() => dispatch({ type: "decidePowerEndAvailability", unitId: requirement.scopeId, decision: "BuildRequired" })}
            >
              Build required
            </button>
          </>
        )}
        {canRecordUsage && requirement.key !== "powerEndAssembly" && (
          <>
            <input
              style={{ width: 120 }}
              placeholder={requirement.catalogPartNumber ?? "Part number"}
              value={partNumber}
              onChange={(e) => setPartNumber(e.target.value)}
              data-testid={`usage-partnumber-${requirement.id}`}
            />{" "}
            <button
              type="button"
              className="btn"
              data-testid={`usage-record-${requirement.id}`}
              onClick={() =>
                dispatch({
                  type: "recordComponentUsage1196",
                  requirementId: requirement.id,
                  input: { partNumber: partNumber || requirement.catalogPartNumber }
                })
              }
            >
              Record usage
            </button>
          </>
        )}
      </td>
    </tr>
  );
}

// The full requirement table for one Unit, grouped so power-end children sit
// under their parent in the order the domain generated them.
export function Pump1196RequirementTable({ unitId }: { unitId: string }) {
  const state = useAppState();
  const requirements = state.componentRequirements1196.filter(
    (r) => r.scopeType === "Unit" && r.scopeId === unitId
  );
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Requirement</th>
          <th>Availability</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {requirements.map((r) => (
          <Pump1196RequirementRow key={r.id} requirement={r} />
        ))}
      </tbody>
    </table>
  );
}
