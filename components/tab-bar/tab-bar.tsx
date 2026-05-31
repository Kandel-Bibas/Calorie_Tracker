"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale, Calendar, Camera, Home, User } from "lucide-react";

import { cn } from "@/lib/cn";

type TabItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** When true the tab is rendered as a raised "Log" button. */
  raised?: boolean;
};

const TABS: readonly TabItem[] = [
  { href: "/today", label: "Today", icon: Home },
  { href: "/history", label: "History", icon: Calendar },
  { href: "/log", label: "Log", icon: Camera, raised: true },
  { href: "/weight", label: "Weight", icon: Scale },
  { href: "/settings", label: "Me", icon: User },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export interface TabBarProps {
  className?: string;
}

export function TabBar({ className }: TabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        // Mobile: fixed bottom bar — safe-area lives on the nav so the
        // bar's coloured surface extends to the home indicator, with
        // icons centered in the visible 64px row above it.
        "fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]",
        // Desktop: morph into a left sidebar
        "lg:bottom-0 lg:right-auto lg:top-0 lg:h-screen lg:w-20 lg:border-r lg:border-t-0 lg:pb-0",
        className
      )}
    >
      <ul
        className={cn(
          "mx-auto flex h-16 max-w-md items-center justify-around px-2",
          "lg:h-full lg:max-w-none lg:flex-col lg:justify-start lg:gap-2 lg:py-6"
        )}
      >
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;

          if (tab.raised) {
            return (
              <li
                key={tab.href}
                className={cn(
                  // Raised on mobile, normal stacking on desktop
                  "relative flex flex-1 flex-col items-center -mt-7 lg:mt-0 lg:flex-none lg:w-full"
                )}
              >
                <Link
                  href={tab.href}
                  aria-label={tab.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full shadow-lg ring-4 ring-[var(--color-surface)] transition-transform active:scale-95",
                    "bg-[var(--color-spark-orange)] text-white",
                    "lg:h-12 lg:w-12 lg:ring-0 lg:shadow-md"
                  )}
                >
                  <Icon className="h-6 w-6" />
                </Link>
                <span
                  className={cn(
                    "mt-1 text-[11px] font-medium transition-colors lg:text-xs",
                    active
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)]"
                  )}
                >
                  {tab.label}
                </span>
              </li>
            );
          }

          return (
            <li key={tab.href} className="flex-1 lg:flex-none lg:w-full">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
                  "lg:gap-1 lg:text-xs"
                )}
              >
                <Icon className={cn("h-6 w-6", active ? "opacity-100" : "opacity-90")} />
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default TabBar;
