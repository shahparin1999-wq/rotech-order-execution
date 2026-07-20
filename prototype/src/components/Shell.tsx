"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { unreadCountForOrder } from "@/domain/selectors";

const railItems = [
  { href: "/", icon: "🏠", label: "Home" },
  { href: "/views/my-work", icon: "🗂️", label: "My Work" },
  { href: "/orders", icon: "📋", label: "Orders" },
  { href: "/scan", icon: "🔳", label: "Scan" },
  { href: "/labels", icon: "🏷️", label: "Labels" },
  { href: "/views/search", icon: "🔍", label: "Search" }
];

const locationViews = [
  { href: "/views/mississauga", label: "Mississauga" },
  { href: "/views/houston", label: "Houston" }
];

const departmentViews = [
  { href: "/views/machining", label: "Machining" },
  { href: "/views/assembly", label: "Assembly" },
  { href: "/views/quality", label: "Quality" },
  { href: "/views/shipping", label: "Shipping" },
  { href: "/views/blocked", label: "Blocked Work" }
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const state = useAppState();
  const dispatch = useAppDispatch();
  const me = state.employees.find((e) => e.id === state.currentUserId);
  const totalUnread = state.orders.reduce(
    (n, o) => n + unreadCountForOrder(state, o.orderNumber),
    0
  );

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // On tablet landscape and narrower the views column collapses so the
  // shop-floor screen keeps its width (Document 04). It stays available
  // behind an explicit toggle.
  const [showViews, setShowViews] = useState(false);

  return (
    <div className={`shell ${showViews ? "show-views" : ""}`}>
      <nav className="rail" aria-label="Primary">
        <div className="rail-brand">ROTECH</div>
        <button
          className="rail-item rail-views-toggle"
          aria-expanded={showViews}
          onClick={() => setShowViews((v) => !v)}
        >
          <span className="rail-icon" aria-hidden>
            ☰
          </span>
          Views
        </button>
        {railItems.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`rail-item ${isActive(it.href) ? "active" : ""}`}
          >
            {it.label === "Orders" && totalUnread > 0 && (
              <span className="rail-badge" aria-label={`${totalUnread} unread`}>
                {totalUnread}
              </span>
            )}
            <span className="rail-icon" aria-hidden>
              {it.icon}
            </span>
            {it.label}
          </Link>
        ))}
        <div style={{ marginTop: "auto", padding: "10px 4px", fontSize: 10.5, color: "#8fa1b8", textAlign: "center" }}>
          {me?.name}
          <br />({me?.role})
        </div>
      </nav>

      <aside className="views-col" aria-label="Views">
        <div className="views-title">Work views</div>

        <div className="views-group">
          <div className="views-group-label">Acting as (mock identity)</div>
          <select
            value={state.currentUserId}
            onChange={(e) => dispatch({ type: "switchUser", employeeId: e.target.value })}
            data-testid="user-switcher"
            aria-label="Acting employee"
            style={{ fontSize: 13 }}
          >
            {state.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.role}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: "var(--text-subtle)", padding: "4px 2px" }}>
            Demo switcher only. Real sign-in uses Entra; this prototype has no
            authentication or authorization.
          </div>
          <button
            type="button"
            className="btn"
            style={{ minHeight: 32, fontSize: 12, marginTop: 4, width: "100%" }}
            data-testid="reset-to-fixtures"
            onClick={() => {
              if (window.confirm("Reset to sample data? This clears everything you've clicked through on this device.")) {
                dispatch({ type: "resetToFixtures" });
              }
            }}
          >
            Reset to sample data
          </button>
          <div style={{ fontSize: 11, color: "var(--text-subtle)", padding: "4px 2px" }}>
            Clears what you&apos;ve clicked through <b>on this device</b> and
            reloads the sample data. Progress is saved only in this browser —
            it is never shared with anyone else.
          </div>
        </div>

        <div className="views-group">
          <div className="views-group-label">Favourites</div>
          {state.favourites.includes("view:orders") && (
            <Link href="/orders" className={`view-link ${isActive("/orders") ? "active" : ""}`}>
              <span className="star" aria-hidden>★</span> Orders
              {totalUnread > 0 && <span className="unread-dot" aria-label="Unread activity" />}
            </Link>
          )}
          {state.favourites.includes("view:quality") && (
            <Link href="/views/quality" className={`view-link ${isActive("/views/quality") ? "active" : ""}`}>
              <span className="star" aria-hidden>★</span> Quality
            </Link>
          )}
        </div>

        <div className="views-group">
          <div className="views-group-label">Locations</div>
          {locationViews.map((v) => (
            <Link key={v.href} href={v.href} className={`view-link ${isActive(v.href) ? "active" : ""}`}>
              {v.label}
            </Link>
          ))}
        </div>

        <div className="views-group">
          <div className="views-group-label">Departments</div>
          {departmentViews.map((v) => (
            <Link key={v.href} href={v.href} className={`view-link ${isActive(v.href) ? "active" : ""}`}>
              {v.label}
              {v.label === "Blocked Work" &&
                state.units.some((u) => u.status === "Blocked") && (
                  <span className="count-pill">
                    {state.units.filter((u) => u.status === "Blocked").length}
                  </span>
                )}
            </Link>
          ))}
        </div>

        <div className="views-group">
          <div className="views-group-label">Followed orders</div>
          {state.followedOrders.map((o) => (
            <Link key={o} href={`/orders/${o}`} className={`view-link ${pathname.startsWith(`/orders/${o}`) ? "active" : ""}`}>
              {o}
              {unreadCountForOrder(state, o) > 0 && (
                <span className="unread-dot" aria-label="Unread activity" />
              )}
            </Link>
          ))}
        </div>
      </aside>

      <main className="main-col">
        <div className="mock-banner">
          PROTOTYPE - mock data only. No AIMCOR, Azure, Entra, Teams, or database
          integration.
        </div>
        {children}
      </main>
    </div>
  );
}
