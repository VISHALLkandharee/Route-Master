import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "Routemaster — Route optimization for mobile service professionals";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "white",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          background: "#2563eb",
          borderRadius: 24,
          width: 80,
          height: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>
      </div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 800,
          color: "#111827",
          marginBottom: 16,
        }}
      >
        Routemaster
      </div>
      <div
        style={{
          fontSize: 28,
          color: "#6b7280",
          textAlign: "center",
          maxWidth: 700,
        }}
      >
        Route optimization, automated SMS, and supply tracking for mobile
        service professionals
      </div>
    </div>,
    { ...size },
  );
}
