"use client";

// Persistent Unit identity banner shown during every controlled Unit action
// (doc 04 shared UX rule).

import type { Unit } from "@/domain/types";
import { UnitStatusBadge } from "./bits";

export function IdentityBanner({ unit }: { unit: Unit }) {
  return (
    <div className="identity-banner" data-testid="identity-banner">
      <span className="unit-id">{unit.unitId}</span>
      <span className="field">
        Order <b>{unit.orderNumber}</b>
      </span>
      <span className="field">
        Serial <b>{unit.serial ?? "Serial pending"}</b>
      </span>
      <span className="field">
        Model <b>{unit.model} {unit.size}</b>
      </span>
      <span className="field">
        Material <b>{unit.asBuiltMaterial}</b>
        {unit.asBuiltMaterial !== unit.orderedMaterial && (
          <> (ordered {unit.orderedMaterial})</>
        )}
      </span>
      <UnitStatusBadge status={unit.status} />
      <span className="field">
        Location <b>{unit.location}</b>
      </span>
      <span className="field">
        Operation <b>{unit.currentOperation}</b>
      </span>
    </div>
  );
}
