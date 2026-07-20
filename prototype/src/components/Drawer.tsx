"use client";

// Generic right-side sliding drawer used by the New Work Order, New
// Customer, and New Task creation flows.

import { CloseIcon } from "./icons";

export function Drawer({
  title,
  onClose,
  children,
  footer
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div
      className="drawer-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-header">
          <h2>{title}</h2>
          <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        <div className="drawer-footer">{footer}</div>
      </div>
    </div>
  );
}

export function FieldGroup({
  label,
  children,
  required
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="field-group">
      <label>
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}
