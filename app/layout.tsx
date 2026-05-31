import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calorie Tracker",
  description:
    "Snap, speak, save — calorie tracking that doesn't lie about precision.",
  applicationName: "Calorie Tracker",
  appleWebApp: {
    capable: true,
    title: "Calories",
    // "black-translucent" lets our themed background extend underneath the
    // status bar (instead of iOS drawing a white/black bar of its own).
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  // Initial theme-color is set by THEME_INIT_SCRIPT below before paint, and
  // kept in sync by the ThemeToggle component at runtime. We omit the static
  // value here so the inline script's writes aren't overridden by SSR.
};

// Inline pre-paint theme script — avoids the light/dark flash by reading
// localStorage before React hydration and setting `html.dark` synchronously.
// Also writes the matching `<meta name="theme-color">` so iOS Safari + PWA
// status bar matches our in-app theme (not the OS-level preference).
const THEME_INIT_SCRIPT = `
  (function() {
    try {
      var t = localStorage.getItem('theme');
      if (!t) {
        t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      if (t === 'dark') document.documentElement.classList.add('dark');
      var color = t === 'dark' ? '#0B0B0D' : '#FFFFFF';
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', color);
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
