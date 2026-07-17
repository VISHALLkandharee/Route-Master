import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import QueryProvider from "@/lib/providers/query-provider";
import "./globals.css";

// ─── Fonts ────────────────────────────────────────────────────

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

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
      <body className={`${inter.variable} antialiased`}>
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
