import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import Script from "next/script";
import QueryProvider from "@/lib/providers/query-provider";
import { getAppUrl } from "@/lib/app-url";
import "./globals.css";

// ─── Font ─────────────────────────────────────────────────────
// Self-host the four weights used by the UI. Builds no longer depend on
// Google Fonts being reachable, and the font is served from this app.
const inter = localFont({
  src: [
    { path: "../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", weight: "400" },
    { path: "../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2", weight: "500" },
    { path: "../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2", weight: "600" },
    { path: "../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-sans",
  display: "swap",
});

// ─── Metadata ─────────────────────────────────────────────────

export const metadata: Metadata = {
  metadataBase: new URL(getAppUrl()),
  title: {
    default: "Routemaster — Route Optimization for Mobile Service Pros",
    template: "%s | Routemaster",
  },
  description:
    "Plan efficient daily routes, send client arrival updates when you’re ready, and track supplies for your mobile service business.",
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
    description:
      "Route optimization, one-tap client arrival updates, and supply tracking for mobile service professionals.",
    url: getAppUrl(),
    siteName: "Routemaster",
    title: "Routemaster — Route Optimization for Mobile Service Pros",
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
      "Route optimization, client arrival updates, and supply tracking for mobile service professionals.",
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
      <head>
        <Script
          data-website-id="dfid_gbh4MDhaT6Q49gmoVP1kA"
          data-domain="routemaster.vishallkumar.com"
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
        />
      </head>

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
