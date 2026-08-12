import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/store/StoreProvider";
import { Shell } from "@/components/Shell";

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
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
