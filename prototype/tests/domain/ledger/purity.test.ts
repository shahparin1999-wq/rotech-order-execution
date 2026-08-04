// Purity guard for the ledger domain modules.
//
// The whole point of building the ledger as pure domain code is that the same
// modules and the same tests run unchanged against PostgreSQL-backed
// repositories after Gate A (D-025). That only holds if nothing quietly
// reaches for React, localStorage or a browser global.
//
// This test fails the build if it does — the guarantee is enforced, not
// documented.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Both pure-domain trees. Inventory carries the same guarantee: movements and
// their derivations must run unchanged against a real database after Gate A.
const PURE_DIRS = ["src/domain/ledger", "src/domain/inventory"];

function ledgerFiles(): string[] {
  return PURE_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => join(dir, f))
  );
}

// Bare-identifier match so a word inside a comment or a longer name (e.g.
// "windowSize") does not produce a false positive.
function usesIdentifier(source: string, identifier: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_$.])${identifier}\\s*[.[(]`, "m").test(stripComments(source));
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("Ledger and inventory domain modules are pure", () => {
  const files = ledgerFiles();

  it("finds the ledger modules", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("imports no React or Next", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not import React/Next`).not.toMatch(
        /from\s+["'](react|react-dom|next(\/.*)?)["']/
      );
      expect(source, `${file} must not be a client component`).not.toMatch(/^\s*["']use client["']/m);
    }
  });

  it("touches no browser globals", () => {
    const forbidden = ["window", "document", "localStorage", "sessionStorage", "navigator", "fetch"];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const identifier of forbidden) {
        expect(usesIdentifier(source, identifier), `${file} must not use ${identifier}`).toBe(false);
      }
    }
  });

  it("imports nothing from the store or app layers", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not depend on the store`).not.toMatch(
        /from\s+["'].*(store\/|app\/|components\/)/
      );
    }
  });

  it("reads no ambient clock — time is injected", () => {
    // Date.now()/new Date() inside the domain makes coverage results
    // non-deterministic and untestable; callers pass `asOf` instead.
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, `${file} must not call Date.now()`).not.toMatch(/Date\.now\s*\(/);
      expect(source, `${file} must not construct an ambient date`).not.toMatch(/new\s+Date\s*\(\s*\)/);
    }
  });
});
