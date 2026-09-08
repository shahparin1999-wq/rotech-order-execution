import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/store/StoreProvider";
import { Shell } from "@/components/Shell";
import { resolvePersistenceMode } from "@/server/mode";

// Persistence mode is read per request so the same build can run against
// PostgreSQL, the file adapter, or browser-only state.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rotech Order Execution (Prototype)",
  description:
    "Mock-data vertical-slice prototype of the Rotech Order Execution and Digital Traveler."
};

// The shop floor runs this on an iPad. viewportFit: "cover" is what makes
// env(safe-area-inset-*) resolve to real values, so sticky bars clear the
// home indicator instead of sitting under it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = resolvePersistenceMode() === "local" ? "local" : "server";
  return (
    <html lang="en">
      <body>
        <StoreProvider mode={mode}>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
