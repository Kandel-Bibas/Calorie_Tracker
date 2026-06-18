# Handoff: Native iOS Client — End-to-End Enablement

**Date:** 2026-06-18
**Branch:** `feat/calorie-tracker-v1`
**Status:** Meal-logging flow works end-to-end on a physical device (auth → analyze → review → save). Verified by automated tests + live production checks.

---

## 1. Context

The native iOS SwiftUI app (under `ios/`) was migrated from the web app in a prior pass (commit `e9e9037 "Add native iOS (SwiftUI) app"`). This session made it actually **work against the deployed backend on a physical iPhone**. We fixed a chain of bugs, each found by reproducing against the live server and verified with falsifiable criteria before/after.

The app talks to two backends:
- **Supabase** directly (PostgREST) for CRUD, under Row-Level Security.
- The **Next.js API** (`/api/analyze`) for AI meal analysis — deployed on Vercel at the custom domain `https://calorie-tracker.bibas.dev`.

---

## 2. What was fixed this session (in order)

### a. API base URL is build-driven (not hardcoded localhost)
- `ios/project.yml` now injects `API_BASE_URL` per build config into `Info.plist`; `Config.swift` reads it at runtime (fatalErrors if missing).
- **Both Debug and Release point to `https://calorie-tracker.bibas.dev`** so the default Debug build works on a physical device with no local server and no Release-scheme switching.
- There is no longer a local-server path. To iterate on the API from the app before deploying, add a local config/scheme back.

### b. Native-client authentication (Bearer token)
- **Problem:** `/api/analyze` and `/api/transcribe` authenticated *only* via session cookies (web). The native app sends a Supabase JWT, not a cookie → `401 unauthorized`.
- **Fix:** `getRequestUser(request)` in `lib/supabase/server.ts` — tries cookie auth first (web unchanged), then validates an `Authorization: Bearer <jwt>` header via `supabase.auth.getUser(token)`. Both routes use it. iOS `MealAnalysisService` attaches the token; `LogView` pulls a fresh one from the Supabase session.
- ⚠ This touched the auth layer of a public API. Additive (web cookie flow untouched), JWT validated server-side (not just decoded). **Deployed to Vercel production.**

### c. Draft parsing (absolute → per-100g)
- **Problem:** the server streams **absolute** nutrition (`kcal`/`protein_g`/`carb_g`/`fat_g`, nullable); iOS `FoodItem` required per-100g keys → decode failed silently → app hung on "Analyzing ingredients…" forever.
- **Fix:** `FoodItem.init` (`Models.swift`) decodes the server's actual shape and derives per-100g (`abs/grams*100`) so the review UI's live gram-edit recalc and `saveMeal` keep working. Null → 0/nil (Tier-4 fallback). `MealAnalysisService` now throws on `{"type":"error"}` lines; `LogView` surfaces a "no result" error instead of hanging.

### d. Image payload size (HTTP 413)
- **Problem:** full-res photos exceeded Vercel's ~4.5 MB serverless body limit → `413`.
- **Fix:** `ImageCompressor.swift` downscales the longest edge to ≤1536 px and recompresses JPEG (targets <3 MB), wired into `MealAnalysisService.makeRequest` (covers camera + picker).

### e. Database table grants (Save Log / all direct-DB features)
- **Problem:** the Postgres `authenticated` role had **zero privileges on every table** (Drizzle `db:push` never issued Supabase's usual grants). Every PostgREST call from the app `403`'d (`42501 permission denied`) — silently breaking Save, history, weights, water, goals, profile. RLS policies existed but are useless without table grants.
- **Fix:** `db/policies.sql` now grants `SELECT/INSERT/UPDATE/DELETE` to `authenticated` on the user tables (+ `SELECT` on `food_cache`, + `ALTER DEFAULT PRIVILEGES` for future tables). **Applied to the production DB** and verified: insert as a user → `201`; another user reading that row → `0` (RLS isolation intact).

### f. Error UX + signing + arm64
- `MealReviewView` now displays `errorMessage` (a failed Save no longer looks like nothing happened).
- `ios/project.yml` bakes in `DEVELOPMENT_TEAM: LXPCG9K73H` + `CODE_SIGN_STYLE: Automatic`, so `xcodegen generate` no longer resets the signing Team to "None."
- `Info.plist` `UIRequiredDeviceCapabilities` changed `armv7` → `arm64` (done via a spinoff task).

### g. Vercel deployment protection
- Set to **previews-only** then **reverted** to the original `all_except_custom_domains`. The app uses the always-public custom domain; raw `*.vercel.app` deployment URLs stay protected. Net Vercel-account change this session: **zero**.

---

## 3. Verification

- **Web:** `pnpm test` → 65/65; `pnpm typecheck` → clean.
- **iOS:** `xcodebuild ... test` → 13/13 (added tests for Bearer header, abs→per-100g conversion, null-nutrition fallback, server-error throw, image downscale, request-body size).
- **Live production:** Bearer auth (200 with token / 401 without), DB insert + RLS isolation, image flow.
- Tests run on iPhone 17 Pro simulator; Xcode 26.5.

---

## 4. Known gaps / next steps

1. **Estimate accuracy is database-limited, not a client bug.** The iOS conversion is verified exact (Chicken/Cheddar matched the server to the digit). Bad numbers (e.g. "Hash Browns P:38 C:1") come from the server resolver matching a junk FatSecret entry. Mitigations: improve resolver matching/ranking, or add a **macro-editing UI** (the review screen currently edits only name + grams, so users can't correct a bad match).
2. **`pnpm lint` is broken** — `next lint` was removed in Next 16. Migrate to the ESLint CLI: `npx @next/codemod@canary next-lint-to-eslint-cli`.
3. **Photos upload through the serverless function** (bounded by the 4.5 MB cap even after compression). For larger images/lower latency, upload directly to Supabase Storage and send the API only a URL.
4. From the prior handoff, still open: native onboarding wizard; recipe/custom-food builder.

---

## 5. Build & run

```bash
cd ios && xcodegen generate            # regenerate after adding files (signing + URL persist via project.yml)
open ios/CalorieTracker.xcodeproj      # run on device or simulator with Cmd+R (Debug is fine on device now)
# tests:
xcodebuild -project ios/CalorieTracker.xcodeproj -scheme CalorieTracker \
  -destination "platform=iOS Simulator,name=iPhone 17 Pro" test
```

Server: deploy with `vercel --prod`. `db/policies.sql` must be applied after any schema reset (it carries the RLS policies **and** the role grants).
