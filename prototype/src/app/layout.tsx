import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/store/StoreProvider";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Rotech Order Execution (Prototype)",
  description:
    "Mock-data vertical-slice prototype of the Rotech Order Execution and Digital Traveler."
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
