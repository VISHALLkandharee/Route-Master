import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import QueryProvider from "@/lib/providers/query-provider";
import "./globals.css";

// ─── Font ─────────────────────────────────────────────────────
// next/font automatically subsets, self-hosts, and inlines the
// critical @font-face declaration — no external network request
// and no layout shift. Only the 4 weights we actually use are loaded
// (was: all 9 weights via @fontsource, ~400 KB of unnecessary fonts).
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// ─── Metadata ─────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    default: "Routemaster — Route Optimization for Mobile Service Pros",
    template: "%s | Routemaster",
  },
  description:
    "Route optimization, automated client SMS notifications, and supply tracking for mobile service professionals. Save 45 minutes every day.",
  keywords: [
    "route optimization",
    "mobile grooming route planner",
    "pool cleaning route",
    "auto detailing scheduling",
    "service route planner",
    "mobile service business software",
    "client SMS notifications",
  ],
  authors: [{ name: "Routemaster" }],
  creator: "Routemaster",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://routemaster.app",
    siteName: "Routemaster",
    title: "Routemaster — Route Optimization for Mobile Service Pros",
    description:
      "Automatically optimize your daily driving route, text clients arrival times, and track supplies. Built for mobile groomers, pool cleaners, and detailers.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Routemaster — Route Optimization for Mobile Service Pros",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Routemaster — Route Optimization for Mobile Service Pros",
    description:
      "Automatically optimize your daily driving route, text clients arrival times, and track supplies.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

// ─── Root Layout ──────────────────────────────────────────────

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={`antialiased ${inter.className}`}>
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
