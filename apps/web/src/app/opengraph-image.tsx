import { ImageResponse } from "next/og";

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
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#09090b",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, display: "flex" }}>
          LogiSense
        </div>
        <div
          style={{
            fontSize: 32,
            color: "#a1a1aa",
            marginTop: 24,
            display: "flex",
          }}
        >
          Inteligência logística multi-tenant
        </div>
      </div>
    ),
    { ...size },
  );
}
