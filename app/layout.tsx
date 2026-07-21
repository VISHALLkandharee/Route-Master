import type { Metadata } from "next";
import { Toaster } from "sonner";
import QueryProvider from "@/lib/providers/query-provider";
import "@fontsource/inter/100.css";
import "@fontsource/inter/200.css";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/inter/900.css";
import "./globals.css";

// ─── Metadata ─────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: "Routemaster",
    template: "%s | Routemaster",
  },
  description:
    "Route optimization, automated client notifications, and supply tracking for mobile service professionals.",
  keywords: [
    "route optimization",
    "mobile grooming",
    "pool cleaning",
    "auto detailing",
    "service route planner",
  ],
  authors: [{ name: "Routemaster" }],
  creator: "Routemaster",
};

// ─── Root Layout ──────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" style={{ fontFamily: "Inter, sans-serif" }}>
        <QueryProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            duration={4000}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
