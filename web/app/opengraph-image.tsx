import { ImageResponse } from "next/og";

export const alt = "Larea: talk to the people right where you are.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          color: "#fbf8f1",
          background: "radial-gradient(circle at 20% 10%, #4b2fd0 0%, #140f33 55%, #0b0920 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#7fe0d6" }}>LAREA · LOCATION-BASED GROUP CHAT</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 92, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
          <span>Talk to the people</span>
          <span style={{ color: "#ffc84a" }}>right here.</span>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#cfc7f5" }}>200 m radius · 18+ verified · Moderated · On Solana Mobile</div>
      </div>
    ),
    size,
  );
}
