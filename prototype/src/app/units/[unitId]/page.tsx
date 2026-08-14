"use client";

// Unit route.
//
// The landing view is the Unit workspace: identity, do-now, waiting on,
// blocking completion, summaries with counts, recent activity. It replaced
// seven tabs (overview / parts / checklist / evidence / activity / audit /
// 1196 build) and the separate /tablet route.
//
// Two order-wide logs survive as `?tab=` destinations, reached from the
// workspace rather than from a permanent tab strip.

import Link from "next/link";
import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import { useAppState } from "@/store/StoreProvider";
import { employeeName, unitById } from "@/domain/selectors";
import { Exact } from "@/components/bits";
import { UnitActivity, UnitWorkspace } from "@/components/unit/UnitWorkspace";

function BackToUnit({ unitId, label }: { unitId: string; label: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Link className="btn" href={`/units/${unitId}`}>
        ← Unit {unitId}
      </Link>
      <h1 style={{ marginTop: 12, marginBottom: 0 }}>{label}</h1>
    </div>
  );
}

function UnitAudit({ unitId }: { unitId: string }) {
  const state = useAppState();
  const audit = state.auditEvents
    .filter((e) => e.unitId === unitId)
    .sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((e) => (
              <tr key={e.id}>
                <td>
                  <Exact at={e.at} />
                </td>
                <td>{employeeName(state, e.actorId)}</td>
                <td>
                  <code style={{ fontSize: 12.5 }}>{e.action}</code>
                  {e.supersedesEventId && (
                    <div className="badge save-needsreview" style={{ marginTop: 3 }}>
                      supersedes {e.supersedesEventId}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 13.5 }}>{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnitRoute({ unitId }: { unitId: string }) {
  const state = useAppState();
  const params = useSearchParams();
  const tab = params.get("tab");
  const unit = unitById(state, unitId);

  if (!unit) {
    return (
      <div className="page">
        <h1>Unit not found</h1>
        <p>
          No Unit “{unitId}” exists in the mock data. <Link href="/orders">Back to orders</Link>
        </p>
      </div>
    );
  }

  if (tab === "activity") {
    return (
      <div className="page">
        <BackToUnit unitId={unitId} label="Activity" />
        <UnitActivity unitId={unitId} />
      </div>
    );
  }

  if (tab === "audit") {
    return (
      <div className="page">
        <BackToUnit unitId={unitId} label="Audit" />
        <UnitAudit unitId={unitId} />
      </div>
    );
  }

  // `asOf` is injected: the pure domain keeps no ambient clock.
  return <UnitWorkspace unitId={unitId} asOf={new Date().toISOString()} />;
}

export default function UnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = use(params);
  return (
    <Suspense>
      <UnitRoute unitId={decodeURIComponent(unitId)} />
    </Suspense>
  );
}
