"use client";

// Application shell.
//
// Four primary destinations, and no more — that is a hard UI rule, not a
// preference. The previous shell had a ten-item icon rail PLUS a second
// "views" column of locations, departments, favourites and followed orders:
// two columns of navigation before you reached any content, and on an iPad
// that is most of the screen.
//
// Locations and departments are now FILTERS on Orders and Work. A facility is
// a fact about a row, not a place to navigate to.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAppDispatch, useAppState } from "@/store/StoreProvider";
import { unreadCountForOrder } from "@/domain/selectors";
import {
  GridIcon,
  HomeIcon,
  MyWorkIcon,
  OrdersIcon,
  ScanIcon,
  SearchIcon
} from "./icons";

const NAV = [
  { href: "/", icon: HomeIcon, label: "Home" },
  { href: "/orders", icon: OrdersIcon, label: "Orders" },
  { href: "/work", icon: MyWorkIcon, label: "Work" },
  { href: "/inventory", icon: GridIcon, label: "Inventory" }
] as const;

function ProfileMenu({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const me = state.employees.find((e) => e.id === state.currentUserId);

  return (
    <div className="profile-menu" data-testid="profile-menu">
      <div className="profile-menu-head">
        <b>{me?.name}</b>
        <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>{me?.role}</div>
      </div>

      <label className="profile-field">
        Acting as (mock identity)
        <select
          value={state.currentUserId}
          onChange={(e) => {
            dispatch({ type: "switchUser", employeeId: e.target.value });
            // Close on switch: the menu sits over a full-screen scrim, so
            // leaving it open blocks every control on the page behind it.
            onClose();
          }}
          data-testid="user-switcher"
          aria-label="Acting employee"
        >
          {state.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} — {e.role}
            </option>
          ))}
        </select>
        <span className="profile-note">
          Demo switcher only. Real sign-in uses Entra; this prototype has no
          authentication or authorization.
        </span>
      </label>

      <div className="profile-links">
        <Link href="/customers" onClick={onClose}>Customers</Link>
        <Link href="/views/quality" onClick={onClose}>Quality queue</Link>
        <Link href="/reports" onClick={onClose}>Reports</Link>
        <Link href="/config/model-templates" onClick={onClose}>Product data</Link>
        <Link href="/labels" onClick={onClose}>Labels</Link>
      </div>

      <button
        type="button"
        className="btn"
        style={{ width: "100%" }}
        data-testid="reset-to-fixtures"
        onClick={() => {
          if (window.confirm("Reset to sample data? This clears everything you've clicked through on this device.")) {
            dispatch({ type: "resetToFixtures" });
            onClose();
          }
        }}
      >
        Reset to sample data
      </button>
      <span className="profile-note">
        Clears what you&apos;ve clicked through <b>on this device</b> and reloads
        the sample data. Progress is saved only in this browser — it is never
        shared with anyone else.
      </span>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const state = useAppState();
  const [profileOpen, setProfileOpen] = useState(false);

  const totalUnread = state.orders.reduce(
    (n, o) => n + unreadCountForOrder(state, o.orderNumber),
    0
  );

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="shell">
      <nav className="rail" aria-label="Primary">
        <div className="rail-brand">ROTECH</div>

        {NAV.map((it) => {
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`rail-item ${isActive(it.href) ? "active" : ""}`}
              data-testid={`nav-${it.label.toLowerCase()}`}
              aria-label={it.label}
            >
              {it.label === "Orders" && totalUnread > 0 && (
                <span className="rail-badge" aria-label={`${totalUnread} unread`}>
                  {totalUnread}
                </span>
              )}
              <span className="rail-icon">
                <Icon size={22} />
              </span>
              {it.label}
            </Link>
          );
        })}

        <div className="rail-spacer" />

        <Link href="/views/search" className={`rail-item ${isActive("/views/search") ? "active" : ""}`}>
          <span className="rail-icon"><SearchIcon size={22} /></span>
          Search
        </Link>
        <Link href="/scan" className={`rail-item ${isActive("/scan") ? "active" : ""}`}>
          <span className="rail-icon"><ScanIcon size={22} /></span>
          Scan
        </Link>
        <button
          type="button"
          className={`rail-item ${profileOpen ? "active" : ""}`}
          aria-expanded={profileOpen}
          data-testid="profile-toggle"
          onClick={() => setProfileOpen((v) => !v)}
        >
          <span className="rail-icon" aria-hidden>
            <svg width={22} height={22} viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="5" r="3" />
              <path d="M2 14c0-3 2.7-4.5 6-4.5S14 11 14 14z" />
            </svg>
          </span>
          Profile
        </button>
      </nav>

      {profileOpen && (
        <>
          <button
            type="button"
            className="profile-scrim"
            aria-label="Close profile menu"
            onClick={() => setProfileOpen(false)}
          />
          <ProfileMenu onClose={() => setProfileOpen(false)} />
        </>
      )}

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
