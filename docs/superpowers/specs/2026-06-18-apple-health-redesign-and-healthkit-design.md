# Design: Apple Health–style revamp + HealthKit integration (iOS)

**Date:** 2026-06-18
**Branch:** `feat/calorie-tracker-v1`
**Scope:** The native iOS SwiftUI app under `ios/` only. No backend (Next.js / Supabase) changes.

---

## 1. Goal

Make the native iOS app look and feel like an extension of Apple Health, and integrate
HealthKit two-way. Concretely:

1. Adopt Apple Health's visual language (grouped summary feed, system grouped surfaces,
   SF Symbol category tiles, refined rings) while keeping orange as the calorie accent.
2. Two-way HealthKit sync: **write** logged calories/macros/water/weight into Health;
   **read** active energy burned + steps + external body-mass samples back.
3. Replace the out-of-place floating center "Log" button with a clean 4-tab bar + a
   toolbar "+" on Today.
4. Restructure the dense one-form Settings screen into a grouped landing that pushes
   into focused sub-screens.

### Done-criteria (measurable)

- Tab bar shows 4 even items (Today · History · Weight · Settings); no floating FAB; the
  `selectedTab == 2` interception is gone. Logging is reachable from a toolbar `+` on Today.
- Today renders as a grouped summary feed on `systemGroupedBackground` with cards on
  `secondarySystemGroupedBackground` and no 1px gray strokes.
- Saving a meal writes a `dietaryEnergyConsumed` + macro `HKCorrelation` to Health; logging
  water writes `dietaryWater`; saving weight writes `bodyMass` — each tagged with origin metadata.
- Today's Activity card shows active energy + steps read live from Health.
- An external body-mass sample (not written by this app) imports into the Supabase `weights`
  table and appears on Today/Weight; our own writes are excluded (no echo loop).
- Settings is a grouped landing pushing into Profile / Goals & Targets / Units & Water /
  Apple Health / Account.
- `xcodebuild ... test` green (existing 13 + new HealthKit/conversion/dedup tests);
  `pnpm test` unaffected (untouched).

### Non-goals

- No DB schema, RLS, auth, or Next.js API changes.
- Active energy / steps are display-only; not persisted.
- No onboarding wizard, recipe/custom-food builder, or macro-editing UI (separate, pre-existing gaps).
- Deleting a meal/water entry in-app does **not** retract the already-written Health sample in
  this pass (would require persisting HK sample UUIDs per row). Documented limitation; writes
  are additive. Revisit if it proves confusing.

---

## 2. Architecture approach (chosen: A)

**A — Shared design system + `HealthKitManager` service, screens refactored in place.**
Add `DesignSystem.swift` (colors, card/tile components, ring) and `HealthKitManager` in
`Services/` (peer to `SupabaseManager`, injected via `AppState`). Refactor existing views
onto the new components. Follows the current per-view + Services pattern; verifiable
screen-by-screen; low regression risk.

Rejected: **B** (view-model-driven "Summary feed" — rewrite of data flow, YAGNI for ~4 screens);
**C** (light restyle only — user chose the full look).

---

## 3. Design system — `ios/CalorieTracker/DesignSystem.swift` (new)

The primary "feels like Health" lever is **surfaces**: drop the custom near-black + 1px
gray-border cards; use system grouped backgrounds.

- Screen background: `Color(.systemGroupedBackground)`.
- Card background: `Color(.secondarySystemGroupedBackground)`, no stroke.
- Both track light/dark automatically and match Health.

Provides:

- `CategoryColor` enum centralizing accents — calories = orange `#FF9500`; protein = red;
  carbs = blue; fat = amber/yellow; water = blue; weight = indigo/purple; activity = red.
- `HealthCard` — container view/modifier (grouped surface, rounded 12–16, padding).
- `CategoryTile` — SF Symbol in a rounded color-tinted square + value + label.
- `CalorieRing` — refined replacement for the current `CircularProgressRing`.
- `MacroBar`, `StatTile`.
- Rounded-design numerals (`.system(..., design: .rounded)`) for large values.

SF Symbols used: `flame.fill`, `figure.walk`, `drop.fill`, `scalemass.fill`, meal-type icons.

---

## 4. Screens

### 4.1 Today → summary feed (`Views/TodayView.swift`)

- **Title:** stays "Today" (day-focused mental model; Health calls it "Summary" but we keep "Today").
- **Header:** large title + date; streak surfaced as a flame chip (currently fetched but never shown).
- **Calorie card:** `CalorieRing` (eaten / goal) + "Calories remaining" + active-energy/net line
  (see §6) + three `MacroBar`s.
- **Activity card (new):** active energy + steps read live from Health; "Apple Health" caption.
- **Water card:** restyled; same +250 / +500 / custom / undo behavior.
- **Weight card:** latest weight + sparkline; "via Apple Health" tag when latest sample imported.
- **Today's meals:** Health-style rows; same delete behavior.
- **Toolbar `+`** (top-right) presents the existing `LogView` sheet (unchanged).

### 4.2 History (`Views/HistoryView.swift`)

Keep the month calendar; restyle day tiles and `HistoryDetailView` onto the new cards.
Day detail may show that day's net calories (live HK read for the date).

### 4.3 Weight (`Views/WeightView.swift`)

Restyle chart + summary cards onto the design system; "via Apple Health" tag on the latest
value when it was imported. Add-weight flow unchanged (still writes Supabase + now Health).

### 4.4 Settings → grouped landing (`Views/SettingsView.swift` + new sub-screens)

Decompose the ~300-line monolith form into a landing with a profile header row + rows that
push into focused screens:

- `ProfileEditView` — display name, sex, activity level, timezone.
- `GoalsEditView` — intent, target weight, pace, daily kcal + macros, goal history.
- `UnitsView` — weight/height/volume units, water goal.
- `HealthSettingsView` — Apple Health connection status + "Connect"/re-request authorization.
- Account — sign out.

---

## 5. HealthKit integration — `ios/CalorieTracker/Services/HealthKitManager.swift` (new) ⚠ CRITICAL PATH

### 5.1 Capability / entitlement (manual Apple step required)

- `project.yml`: add HealthKit entitlement (`com.apple.developer.healthkit`) and an
  entitlements file; re-run `xcodegen generate`.
- `Info.plist`: add `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription`.
- The HealthKit capability must be enabled on the Apple Developer provisioning profile
  (Team `LXPCG9K73H`). This is the one step that needs the Apple Developer account; it will
  be called out explicitly in the plan.

### 5.2 `HealthKitManager` (protocol-backed for testability)

Define a `HealthKitManaging` protocol; `HealthKitManager` is the `HKHealthStore`-backed impl.
Injected via `AppState` alongside `SupabaseManager`. A no-op/fake conforms for unit tests so
logic runs without entitlements or simulator Health.

- **Read types:** `activeEnergyBurned`, `stepCount`, `bodyMass`.
- **Write types:** `dietaryEnergyConsumed`, `dietaryProtein`, `dietaryCarbohydrates`,
  `dietaryFatTotal`, `dietaryWater`, `bodyMass`.
- **Authorization:** requested from `HealthSettingsView` (and offered opportunistically);
  graceful when denied/unavailable (`HKHealthStore.isHealthDataAvailable()`).
- **Write triggers:**
  - Meal save (`SupabaseManager.insertMeal` path / `MealReviewView`): write a food
    `HKCorrelation` (energy + macros) at `consumedAt`.
  - Water log (`TodayView.logWater`): write `dietaryWater`.
  - Weight save (`AddWeightView.saveWeight`): write `bodyMass`.

### 5.3 Loop / dedup safety

- Every sample we write carries custom metadata `app.calorietracker.origin = true`.
- When **reading** `bodyMass` we exclude `HKSource.default()` (our own writes) via a
  `NOT predicateForObjects(from:)` compound predicate, so only **external** samples
  (e.g., a smart scale) are imported. No echo loop, no double-count.
- The source-exclusion predicate gets a dedicated unit test.

---

## 6. Net-calorie model

The ring stays **eaten / goal** (primary, honest). A secondary line shows:

- "Calories remaining = goal − eaten + active energy"
- an "active" readout and a "Net = eaten − active" figure.

We do **not** silently inflate the goal by exercise (the main source of confusion in
calorie apps). Displayed exactly as in the approved mockup.

---

## 7. Navigation / log button (`Views/MainTabView.swift`)

- Remove the floating center button and the `Color.clear` placeholder tab.
- Remove the `onChange(of: selectedTab)` interception that reverted to tab 2.
- 4-tab bar: Today · History · Weight · Settings, tinted orange.
- Logging is presented from Today's toolbar `+` (sheet → existing `LogView`).

---

## 8. Data flow & persistence (no schema change)

- **Weight:** external Health `bodyMass` samples import one-way into the existing Supabase
  `weights` table (so charts/history are unchanged). Import on Today/Weight load.
- **Active energy + steps:** read live for display only (Today; per-day in History). Not persisted.
- Net effect: everything below the HealthKit layer is client-only; DB schema, RLS, auth, and
  the Next.js API are untouched.

---

## 9. Phasing (each phase gated by `xcodebuild test`)

1. Design system + HealthKit scaffolding (entitlement, manager, auth flow) — no visible change.
2. Today/Summary redesign + nav/log-button change.
3. HealthKit write + read wired into Today/Weight.
4. Settings restructure into sub-screens.
5. History + Weight restyle.

---

## 10. Testing & verification

- `HealthKitManager` behind `HealthKitManaging`; logic testable without entitlements/Health.
- New unit tests: unit conversions (kcal/kJ, kg/lb, ml/L), source-exclusion dedup predicate,
  net-calorie math.
- Existing 13 iOS tests + 65 web tests stay green.
- Manual on-device: authorization flow; our write appears in the Health app; an external
  weight appears in-app; deny-permission path degrades gracefully.

---

## 11. Risks

- HealthKit needs a real device for end-to-end (simulator Health is limited) and the
  entitlement enabled on the provisioning profile — a manual Xcode/Apple step.
- Bidirectional weight is the only loop hazard; mitigated by the source-exclusion predicate,
  which has a dedicated test.
- No DB / RLS / auth / API surface is touched.

---

## 12. Files

**New:**
- `ios/CalorieTracker/DesignSystem.swift`
- `ios/CalorieTracker/Services/HealthKitManager.swift`
- `ios/CalorieTracker/Views/Settings/ProfileEditView.swift`
- `ios/CalorieTracker/Views/Settings/GoalsEditView.swift`
- `ios/CalorieTracker/Views/Settings/UnitsView.swift`
- `ios/CalorieTracker/Views/Settings/HealthSettingsView.swift`
- `ios/CalorieTracker/CalorieTracker.entitlements`
- iOS test files for conversions / dedup / net-calorie math.

**Modified:**
- `ios/project.yml` (entitlement, entitlements file ref)
- `ios/CalorieTracker/Info.plist` (Health usage strings)
- `ios/CalorieTracker/CalorieTrackerApp.swift` (inject `HealthKitManager` into `AppState`)
- `ios/CalorieTracker/Views/MainTabView.swift` (4-tab bar, toolbar `+`)
- `ios/CalorieTracker/Views/TodayView.swift` (summary feed, activity card)
- `ios/CalorieTracker/Views/HistoryView.swift`, `WeightView.swift` (restyle)
- `ios/CalorieTracker/Views/SettingsView.swift` (grouped landing)
- `ios/CalorieTracker/Views/MealReviewView.swift` / `LogView.swift` (Health write on save)
