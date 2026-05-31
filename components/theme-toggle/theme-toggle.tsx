"use client";

import * as React from "react";
import { Flame } from "lucide-react";

/**
 * Streak chip + theme toggle in one. Renders the streak count with a flame
 * icon; tapping cycles between light and dark mode. Theme is persisted in
 * `localStorage.theme` and applied via `<html class="dark">`.
 *
 * The flame inherits its color from `--color-spark-orange`, which flips to
 * blue in dark mode (defined in `app/globals.css`).
 */
export function ThemeToggle({ streakLength }: { streakLength: number }) {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    // Hydrate from <html class="dark"> applied by the inline pre-paint script
    // (so we don't fight the user's preference).
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    // Keep <meta name="theme-color"> in sync so the iOS status bar + URL bar
    // background match the new theme immediately.
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = next === "dark" ? "#0B0B0D" : "#FFFFFF";
    if (meta) {
      meta.setAttribute("content", color);
    } else {
      const m = document.createElement("meta");
      m.setAttribute("name", "theme-color");
      m.setAttribute("content", color);
      document.head.appendChild(m);
    }
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Toggle ${theme === "dark" ? "light" : "dark"} mode (streak ${streakLength})`}
      className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface-muted)] px-3 py-1.5 transition-colors active:scale-95"
    >
      <Flame
        className="h-4 w-4 text-[var(--color-spark-orange)] transition-colors"
        fill="currentColor"
        fillOpacity={0.15}
      />
      <span className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
        {streakLength}
      </span>
    </button>
  );
}
