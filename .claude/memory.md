# Claude Code Memory
<!-- max 30 entries · prune oldest when at cap · merge duplicates -->

## ENTRIES
[id:20260522-1] [mode:PIPELINE] [tags:nextjs16,proxy,build]
outcome:PASS | Phase 7 UI components added (spark, ring, tab-bar, progress-dots, ui primitives); pre-existing proxy.ts uses Next.js 15 `middleware` export and breaks `pnpm build` until renamed to `proxy` | rule:Next.js 16 requires `proxy.ts` to export a function named `proxy` (or default) — `middleware` is no longer recognized

[id:20260522-2] [mode:PIPELINE] [tags:nextjs,api,server-actions,drizzle,streaming]
outcome:PASS | Phase 5+6: /api/analyze NDJSON stream + /api/transcribe Whisper + actions/{meals,weights,goals,recipes}.ts; applied the proxy.ts middleware->proxy rename to unblock build | rule:Drizzle pg numeric round-trips as string — cast with Number() on read, String() on write; for streaming Route Handlers in Next 16 use a ReadableStream with TextEncoder and Content-Type: application/x-ndjson

[id:20260522-3] [mode:PIPELINE] [tags:nextjs16,onboarding,framer-motion,localstorage,supabase-auth,build]
outcome:PASS | Phase 8: /(public)/login magic-link page + /auth/callback route + 7-screen onboarding flow with usePathname-driven AnimatePresence transitions + lib/onboarding-state.ts localStorage helpers + canvas-confetti reveal on plan screen | rule:stale tsconfig.tsbuildinfo can mask AND surface phantom barrel errors — delete it before final typecheck if results look suspicious; Next 16 Turbopack only follows the live import graph so unconsumed broken `index.ts` barrels in components/ won't fail the build even if `tsc` complains

[id:20260522-4] [mode:PIPELINE] [tags:nextjs16,app-router,rsc,recharts,ndjson,server-actions]
outcome:PASS | Phase 9: app/(app)/layout.tsx auth-gate + /today, /log (state-machine + NDJSON stream consumer + camera+voice+text capture), /log/review/[draftId], /weight + /weight/add (Recharts), /history + /history/[date] (month grid mini-ring), /recipes builder & detail, /settings + /settings/goals; MealCard drawer; ItemsTable editor — all routes registered, 63 unit tests still pass, build clean | rule:project hook auto-reverts `components/<dir>/index.ts` to `export {}` stub barrels after every write — import from the underlying file path (`@/components/meal-review/items-table`) instead of relying on barrel exports; for RSCs that read Supabase Storage, await `getSignedPhotoUrl` server-side and pass the signed string to `<Image unoptimized>` since the URL is short-lived (3600s) and not whitelisted via `next.config.images.remotePatterns`
