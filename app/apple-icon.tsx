import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * iOS home-screen icon — Spark flame on warm gradient.
 * Used when user does "Add to Home Screen" on iPhone Safari.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(160deg, #FEF3C7 0%, #FED7AA 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "40px",
        }}
      >
        <svg
          width="130"
          height="130"
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M50 8 C 35 22, 25 38, 32 55 C 22 56, 16 72, 28 84 C 40 96, 60 96, 72 84 C 84 72, 78 56, 68 55 C 75 38, 65 22, 50 8 Z"
            fill="#FF6B35"
          />
          <path
            d="M50 28 C 40 40, 36 52, 42 62 C 35 64, 33 74, 42 82 C 50 88, 50 88, 58 82 C 67 74, 65 64, 58 62 C 64 52, 60 40, 50 28 Z"
            fill="#FFB627"
          />
          <ellipse cx="42" cy="62" rx="5.5" ry="6.5" fill="white" />
          <ellipse cx="58" cy="62" rx="5.5" ry="6.5" fill="white" />
          <circle cx="42" cy="64" r="2.8" fill="#1C1C1E" />
          <circle cx="58" cy="64" r="2.8" fill="#1C1C1E" />
          <path
            d="M 44 75 Q 50 79 56 75"
            stroke="#1C1C1E"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
