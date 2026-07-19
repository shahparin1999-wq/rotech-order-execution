"use client";

// Simulate QR Scan. No real camera is used; each button resolves a stored
// mock publicRef through the same resolver a real scan would use.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppState } from "@/store/StoreProvider";
import { QrSvg } from "@/components/bits";
import type { QrRecordType } from "@/domain/types";

const ORDER_OF_TYPES: QrRecordType[] = [
  "Order",
  "Unit",
  "Component",
  "MaterialLot",
  "Transfer",
  "Pallet"
];

export default function ScanPage() {
  const state = useAppState();
  const router = useRouter();

  const grouped = ORDER_OF_TYPES.map((t) => ({
    type: t,
    items: state.qrIdentities.filter((q) => q.recordType === t)
  }));

  return (
    <div className="page">
      <h1>Simulate QR Scan</h1>
      <p style={{ color: "var(--text-subtle)" }}>
        No camera is used. Each button resolves a stored mock <code>publicRef</code>{" "}
        through the same resolver that a real scan would use. QR values contain
        only an opaque reference — never business or customer data.
      </p>

      {grouped.map((g) => (
        <div className="card" key={g.type}>
          <h3 style={{ marginTop: 0 }}>{g.type} QR</h3>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {g.items.map((q) => (
              <div key={q.publicRef} style={{ textAlign: "center" }}>
                <QrSvg value={q.publicRef} size={88} />
                <div style={{ fontSize: 12.5, marginTop: 4 }}>{q.label}</div>
                <code style={{ fontSize: 10.5 }}>{q.publicRef}</code>
                <div>
                  <button
                    className="btn"
                    style={{ minHeight: 40, marginTop: 6 }}
                    data-testid={`scan-${q.recordType}-${q.targetId}`}
                    onClick={() => router.push(`/r/${q.publicRef}`)}
                  >
                    Simulate scan
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Unknown / retired reference</h3>
        <p style={{ fontSize: 13.5 }}>
          Demonstrates the friendly failure path for a damaged or retired label.
        </p>
        <Link className="btn" href="/r/UNKNOWNREF99">
          Simulate unknown QR
        </Link>
      </div>
    </div>
  );
}
