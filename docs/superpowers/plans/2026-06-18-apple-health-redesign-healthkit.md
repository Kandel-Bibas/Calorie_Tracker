# Apple Health–style revamp + HealthKit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the native iOS app to feel like an extension of Apple Health and wire two-way HealthKit sync, plus fix the nav/log button and restructure Settings.

**Architecture:** Add a shared `DesignSystem.swift` (grouped surfaces, cards, tiles, ring) and a protocol-backed `HealthKitManager` service injected via `AppState` (peer to `SupabaseManager`). Refactor existing SwiftUI views onto the design system. HealthKit writes our logs and reads active energy/steps/external weight; weight imports one-way into Supabase, activity is display-only. No backend changes.

**Tech Stack:** SwiftUI (iOS 18), `@Observable`, HealthKit, Supabase-swift 2.22, Swift Charts, xcodegen.

## Global Constraints

- Deployment target iOS 18.0; SwiftUI + `@Observable`; follow existing per-view + `Services/` patterns.
- **No backend changes**: do not touch `db/`, `lib/`, `app/`, `src/`, or any Next.js/Supabase SQL. DB schema, RLS, auth, and the `/api` routes stay exactly as-is.
- Keep orange `#FF9500` as the primary calorie accent. Macros: protein red, carbs blue, fat amber.
- Apple Health feel = **system grouped surfaces**: screens on `Color(.systemGroupedBackground)`, cards on `Color(.secondarySystemGroupedBackground)`, no 1px gray strokes.
- **Commits are deferred (git-guard hook).** Implementer agents must **never** run `git commit`/`git add -A` to commit — leave changes staged-or-unstaged in the working tree. The orchestrator proposes commits to the user at phase checkpoints. The "Commit" steps below are the canonical message to PROPOSE, not to execute.
- After adding/removing any source file or editing `ios/project.yml`, run `cd ios && xcodegen generate`.
- **Builds/tests are run by the orchestrator**, not implementer agents. Canonical commands:
  - Build: `xcodebuild -project ios/CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" build`
  - Test: `xcodebuild -project ios/CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" test`
- Preserve all existing data-loading/networking logic when restyling a view — change presentation only unless a task says otherwise.

---

## File Structure

**New:**
- `ios/CalorieTracker/DesignSystem.swift` — colors, `HealthCard`, `CategoryTile`, `StatTile`, `CalorieRing`, `MacroBar`.
- `ios/CalorieTracker/Services/HealthKitManager.swift` — `HealthKitManaging` protocol, `HealthKitManager` (HKHealthStore impl), `HealthKitFake`, conversion + predicate helpers.
- `ios/CalorieTracker/CalorieTracker.entitlements` — HealthKit entitlement.
- `ios/CalorieTracker/Views/Settings/ProfileEditView.swift`
- `ios/CalorieTracker/Views/Settings/GoalsEditView.swift`
- `ios/CalorieTracker/Views/Settings/UnitsView.swift`
- `ios/CalorieTracker/Views/Settings/HealthSettingsView.swift`
- `ios/CalorieTrackerTests/HealthKitMathTests.swift`

**Modified:**
- `ios/project.yml`, `ios/CalorieTracker/Info.plist`, `ios/CalorieTracker/CalorieTrackerApp.swift`
- `ios/CalorieTracker/Views/MainTabView.swift`, `TodayView.swift`, `HistoryView.swift`, `WeightView.swift`, `SettingsView.swift`
- `ios/CalorieTracker/Views/LogView.swift`, `WeightView.swift` (Health writes)

---

# PHASE 0 — Foundation (no visible UI change)

### Task 0.1: Design system

**Files:**
- Create: `ios/CalorieTracker/DesignSystem.swift`

**Interfaces:**
- Produces: `enum AppPalette { static let calorie/protein/carb/fat/water/weight/activity: Color }`;
  `struct HealthCard<Content: View>: View` (init `HealthCard { content }`);
  `struct CategoryTile: View` (`init(symbol: String, tint: Color, value: String, label: String)`);
  `struct StatTile: View` (`init(symbol: String, tint: Color, value: String, label: String)`) — alias usage same as CategoryTile but laid out vertically for grids;
  `struct CalorieRing: View` (`init(progress: Double, actual: Double, goal: Double)`);
  `struct MacroBar: View` (`init(label: String, actual: Double, goal: Double, color: Color)`).

- [ ] **Step 1: Create the file with the full content below**

```swift
import SwiftUI

enum AppPalette {
    static let calorie = Color.orange          // #FF9500-ish, system orange
    static let protein = Color(red: 0.89, green: 0.29, blue: 0.29)   // red
    static let carb    = Color(red: 0.22, green: 0.54, blue: 0.87)   // blue
    static let fat     = Color(red: 0.94, green: 0.62, blue: 0.15)   // amber
    static let water   = Color(red: 0.22, green: 0.54, blue: 0.87)   // blue
    static let weight  = Color(red: 0.50, green: 0.46, blue: 0.87)   // indigo
    static let activity = Color(red: 0.89, green: 0.29, blue: 0.29)  // red (move ring tone)
}

/// Grouped card surface matching Apple Health. No 1px stroke; uses secondary grouped bg.
struct HealthCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// SF Symbol in a tinted rounded square + value + label, laid out horizontally.
struct CategoryTile: View {
    let symbol: String
    let tint: Color
    let value: String
    let label: String
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 34, height: 34)
                .background(tint.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(value).font(.system(.headline, design: .rounded)).fontWeight(.semibold)
                Text(label).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// Vertical variant for 2-up metric grids.
struct StatTile: View {
    let symbol: String
    let tint: Color
    let value: String
    let label: String
    var body: some View { CategoryTile(symbol: symbol, tint: tint, value: value, label: label) }
}

struct CalorieRing: View {
    var progress: Double
    var actual: Double
    var goal: Double
    var body: some View {
        ZStack {
            Circle().stroke(Color(.systemGray5), lineWidth: 12)
            Circle()
                .trim(from: 0, to: min(progress, 1.0))
                .stroke(AppPalette.calorie, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.8), value: progress)
            VStack(spacing: 2) {
                Text("\(Int(actual))").font(.system(size: 30, weight: .bold, design: .rounded))
                Text("of \(Int(goal))").font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(width: 120, height: 120)
    }
}

struct MacroBar: View {
    var label: String
    var actual: Double
    var goal: Double
    var color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.caption).foregroundStyle(color)
                Spacer()
                Text("\(Int(actual))g").font(.caption).foregroundStyle(.secondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(.systemGray5)).frame(height: 6)
                    Capsule().fill(color)
                        .frame(width: min(CGFloat(actual / (goal > 0 ? goal : 1)) * geo.size.width, geo.size.width), height: 6)
                        .animation(.easeOut(duration: 0.8), value: actual)
                }
            }
            .frame(height: 6)
        }
    }
}
```

- [ ] **Step 2: Regenerate the project** — `cd ios && xcodegen generate`
- [ ] **Step 3 (orchestrator): build** — Expected: build succeeds.
- [ ] **Step 4: Propose commit** — `feat(ios): add Apple Health-style design system`

---

### Task 0.2: HealthKit capability (entitlement + Info.plist + project.yml)

**Files:**
- Create: `ios/CalorieTracker/CalorieTracker.entitlements`
- Modify: `ios/project.yml`, `ios/CalorieTracker/Info.plist`

- [ ] **Step 1: Create `ios/CalorieTracker/CalorieTracker.entitlements`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.healthkit</key>
	<true/>
	<key>com.apple.developer.healthkit.access</key>
	<array/>
</dict>
</plist>
```

- [ ] **Step 2: Add the entitlements ref to `ios/project.yml`** under `targets.CalorieTracker.settings.base`, after `CODE_SIGN_STYLE: Automatic`:

```yaml
        CODE_SIGN_ENTITLEMENTS: CalorieTracker/CalorieTracker.entitlements
```

- [ ] **Step 3: Add Health usage strings to `ios/CalorieTracker/Info.plist`** before the closing `</dict>` (next to the other `NS*UsageDescription` keys):

```xml
	<key>NSHealthShareUsageDescription</key>
	<string>Calorie Tracker reads your active energy, steps, and weight to show your daily summary and net calories.</string>
	<key>NSHealthUpdateUsageDescription</key>
	<string>Calorie Tracker saves the meals, water, and weight you log into Apple Health.</string>
```

- [ ] **Step 4: Regenerate** — `cd ios && xcodegen generate`
- [ ] **Step 5 (orchestrator): build for SIMULATOR** — Expected: succeeds (simulator builds don't need the provisioning-profile capability). NOTE: on-device requires the HealthKit capability enabled on the Apple Developer profile (Team `LXPCG9K73H`) — flag to user.
- [ ] **Step 6: Propose commit** — `feat(ios): add HealthKit entitlement and usage strings`

---

### Task 0.3: HealthKitManager service + AppState injection

**Files:**
- Create: `ios/CalorieTracker/Services/HealthKitManager.swift`
- Modify: `ios/CalorieTracker/CalorieTrackerApp.swift`

**Interfaces:**
- Produces:
  - `protocol HealthKitManaging` with:
    - `var isAvailable: Bool { get }`
    - `func requestAuthorization() async throws`
    - `func writeMeal(kcal: Double, proteinG: Double?, carbG: Double?, fatG: Double?, date: Date) async`
    - `func writeWater(ml: Int, date: Date) async`
    - `func writeWeight(kg: Double, date: Date) async`
    - `func readActiveEnergyAndSteps(for date: Date) async -> (activeKcal: Double, steps: Int)`
    - `func readExternalWeightSamples(since: Date) async -> [(date: Date, kg: Double)]`
  - `final class HealthKitManager: HealthKitManaging` (real impl)
  - `final class HealthKitFake: HealthKitManaging` (tests/previews)
  - `enum HealthKitMath` with pure helpers (see Task 0.4 for the tested signatures).

- [ ] **Step 1: Create `ios/CalorieTracker/Services/HealthKitManager.swift`**

```swift
import Foundation
import HealthKit

/// Pure, unit-testable helpers (no HKHealthStore dependency).
enum HealthKitMath {
    static let originMetadataKey = "app.calorietracker.origin"

    static func lbToKg(_ lb: Double) -> Double { lb / 2.20462 }
    static func kgToLb(_ kg: Double) -> Double { kg * 2.20462 }
    static func mlToLiters(_ ml: Int) -> Double { Double(ml) / 1000.0 }
    static func kcalToKilojoules(_ kcal: Double) -> Double { kcal * 4.184 }

    /// Calories remaining = goal - eaten + active burned (no goal inflation elsewhere).
    static func caloriesRemaining(goal: Double, eaten: Double, active: Double) -> Double {
        goal - eaten + active
    }
    /// Net = eaten - active.
    static func netCalories(eaten: Double, active: Double) -> Double { eaten - active }

    /// Should this external sample-date be imported? Only when not already present locally.
    static func shouldImportWeight(forDate date: String, existingDates: Set<String>) -> Bool {
        !existingDates.contains(date)
    }
}

protocol HealthKitManaging {
    var isAvailable: Bool { get }
    func requestAuthorization() async throws
    func writeMeal(kcal: Double, proteinG: Double?, carbG: Double?, fatG: Double?, date: Date) async
    func writeWater(ml: Int, date: Date) async
    func writeWeight(kg: Double, date: Date) async
    func readActiveEnergyAndSteps(for date: Date) async -> (activeKcal: Double, steps: Int)
    func readExternalWeightSamples(since: Date) async -> [(date: Date, kg: Double)]
}

final class HealthKitManager: HealthKitManaging {
    private let store = HKHealthStore()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private var writeTypes: Set<HKSampleType> {
        [HKQuantityType(.dietaryEnergyConsumed), HKQuantityType(.dietaryProtein),
         HKQuantityType(.dietaryCarbohydrates), HKQuantityType(.dietaryFatTotal),
         HKQuantityType(.dietaryWater), HKQuantityType(.bodyMass)]
    }
    private var readTypes: Set<HKObjectType> {
        [HKQuantityType(.activeEnergyBurned), HKQuantityType(.stepCount), HKQuantityType(.bodyMass)]
    }

    func requestAuthorization() async throws {
        guard isAvailable else { return }
        try await store.requestAuthorization(toShare: writeTypes, read: readTypes)
    }

    private func metadata() -> [String: Any] { [HealthKitMath.originMetadataKey: true] }

    func writeMeal(kcal: Double, proteinG: Double?, carbG: Double?, fatG: Double?, date: Date) async {
        guard isAvailable, kcal > 0 else { return }
        var samples: Set<HKSample> = []
        samples.insert(HKQuantitySample(type: HKQuantityType(.dietaryEnergyConsumed),
            quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
            start: date, end: date, metadata: metadata()))
        func macro(_ type: HKQuantityTypeIdentifier, _ grams: Double?) {
            guard let g = grams, g > 0 else { return }
            samples.insert(HKQuantitySample(type: HKQuantityType(type),
                quantity: HKQuantity(unit: .gram(), doubleValue: g),
                start: date, end: date, metadata: metadata()))
        }
        macro(.dietaryProtein, proteinG); macro(.dietaryCarbohydrates, carbG); macro(.dietaryFatTotal, fatG)
        let food = HKCorrelation(type: HKCorrelationType(.food), start: date, end: date,
                                 objects: samples, metadata: metadata())
        try? await store.save(food)
    }

    func writeWater(ml: Int, date: Date) async {
        guard isAvailable, ml > 0 else { return }
        let s = HKQuantitySample(type: HKQuantityType(.dietaryWater),
            quantity: HKQuantity(unit: .literUnit(with: .milli), doubleValue: Double(ml)),
            start: date, end: date, metadata: metadata())
        try? await store.save(s)
    }

    func writeWeight(kg: Double, date: Date) async {
        guard isAvailable, kg > 0 else { return }
        let s = HKQuantitySample(type: HKQuantityType(.bodyMass),
            quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
            start: date, end: date, metadata: metadata())
        try? await store.save(s)
    }

    func readActiveEnergyAndSteps(for date: Date) async -> (activeKcal: Double, steps: Int) {
        guard isAvailable else { return (0, 0) }
        let cal = Calendar.current
        let start = cal.startOfDay(for: date)
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? date
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        async let energy = sum(HKQuantityType(.activeEnergyBurned), unit: .kilocalorie(), predicate: predicate)
        async let steps = sum(HKQuantityType(.stepCount), unit: .count(), predicate: predicate)
        return (await energy, Int(await steps))
    }

    private func sum(_ type: HKQuantityType, unit: HKUnit, predicate: NSPredicate) async -> Double {
        await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate,
                                      options: .cumulativeSum) { _, stats, _ in
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit) ?? 0)
            }
            store.execute(q)
        }
    }

    /// External weight samples only — excludes this app's own writes (no echo loop).
    func readExternalWeightSamples(since: Date) async -> [(date: Date, kg: Double)] {
        guard isAvailable else { return [] }
        let type = HKQuantityType(.bodyMass)
        let datePred = HKQuery.predicateForSamples(withStart: since, end: Date())
        let notOurs = NSCompoundPredicate(notPredicateWithSubpredicate:
            HKQuery.predicateForObjects(from: HKSource.default()))
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePred, notOurs])
        return await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, _ in
                let results = (samples as? [HKQuantitySample] ?? []).map {
                    ($0.startDate, $0.quantity.doubleValue(for: .gramUnit(with: .kilo)))
                }
                cont.resume(returning: results)
            }
            store.execute(q)
        }
    }
}

final class HealthKitFake: HealthKitManaging {
    var isAvailable: Bool = false
    func requestAuthorization() async throws {}
    func writeMeal(kcal: Double, proteinG: Double?, carbG: Double?, fatG: Double?, date: Date) async {}
    func writeWater(ml: Int, date: Date) async {}
    func writeWeight(kg: Double, date: Date) async {}
    func readActiveEnergyAndSteps(for date: Date) async -> (activeKcal: Double, steps: Int) { (0, 0) }
    func readExternalWeightSamples(since: Date) async -> [(date: Date, kg: Double)] { [] }
}
```

- [ ] **Step 2: Inject into `AppState` in `ios/CalorieTracker/CalorieTrackerApp.swift`** — add a stored property and initialize it. After `let supabaseManager: SupabaseManager` add `let healthKit: HealthKitManaging`, and in `init()` after creating `supabaseManager` add `self.healthKit = HealthKitManager()`.

```swift
@Observable
class AppState {
    let supabaseManager: SupabaseManager
    let healthKit: HealthKitManaging
    var isLoggedIn: Bool = false
    var isLoading: Bool = true

    init() {
        let client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabaseAnonKey
        )
        self.supabaseManager = SupabaseManager(supabase: client)
        self.healthKit = HealthKitManager()
    }
    // checkAuth() unchanged
}
```

- [ ] **Step 3: Regenerate** — `cd ios && xcodegen generate`
- [ ] **Step 4 (orchestrator): build** — Expected: succeeds.
- [ ] **Step 5: Propose commit** — `feat(ios): add HealthKitManager service and inject into AppState`

---

### Task 0.4: Unit tests for HealthKit math + dedup

**Files:**
- Create: `ios/CalorieTrackerTests/HealthKitMathTests.swift`

- [ ] **Step 1: Write the tests**

```swift
import XCTest
@testable import CalorieTracker

final class HealthKitMathTests: XCTestCase {
    func testLbKgRoundTrip() {
        XCTAssertEqual(HealthKitMath.lbToKg(220.462), 100, accuracy: 0.01)
        XCTAssertEqual(HealthKitMath.kgToLb(100), 220.462, accuracy: 0.01)
    }
    func testMlToLiters() { XCTAssertEqual(HealthKitMath.mlToLiters(250), 0.25, accuracy: 0.0001) }
    func testKcalToKilojoules() { XCTAssertEqual(HealthKitMath.kcalToKilojoules(100), 418.4, accuracy: 0.01) }
    func testCaloriesRemainingAddsActive() {
        XCTAssertEqual(HealthKitMath.caloriesRemaining(goal: 2000, eaten: 1420, active: 380), 960, accuracy: 0.001)
    }
    func testNetCalories() {
        XCTAssertEqual(HealthKitMath.netCalories(eaten: 1420, active: 380), 1040, accuracy: 0.001)
    }
    func testShouldImportWeightSkipsExistingDate() {
        let existing: Set<String> = ["2026-06-18"]
        XCTAssertFalse(HealthKitMath.shouldImportWeight(forDate: "2026-06-18", existingDates: existing))
        XCTAssertTrue(HealthKitMath.shouldImportWeight(forDate: "2026-06-17", existingDates: existing))
    }
}
```

- [ ] **Step 2 (orchestrator): run tests** — `xcodebuild ... test`. Expected: PASS (new + existing 13).
- [ ] **Step 3: Propose commit** — `test(ios): cover HealthKit conversions, net-calorie math, weight dedup`

---

# PHASE 1 — Navigation + Today summary feed

### Task 1.1: 4-tab bar + toolbar "+" (remove the FAB)

**Files:**
- Modify: `ios/CalorieTracker/Views/MainTabView.swift`

**Interfaces:**
- Produces: `MainTabView` with a 4-tab `TabView` and a `showingLogSheet` binding presented from Today's toolbar (Today owns the `+`; see Task 1.2 which adds the toolbar button and a `logRequested` mechanism). For decoupling, `MainTabView` keeps owning the sheet and passes a closure into `TodayView`.

- [ ] **Step 1: Replace the whole file**

```swift
import SwiftUI

struct MainTabView: View {
    @State private var selectedTab: Int = 0
    @State private var showingLogSheet: Bool = false

    var body: some View {
        TabView(selection: $selectedTab) {
            TodayView(onLog: { showingLogSheet = true })
                .tabItem { Label("Today", systemImage: "clock.fill") }
                .tag(0)
            HistoryView()
                .tabItem { Label("History", systemImage: "calendar") }
                .tag(1)
            WeightView()
                .tabItem { Label("Weight", systemImage: "chart.line.uptrend.xyaxis") }
                .tag(2)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "person.fill") }
                .tag(3)
        }
        .tint(.orange)
        .sheet(isPresented: $showingLogSheet) { LogView() }
    }
}

#Preview {
    MainTabView().environment(AppState())
}
```

- [ ] **Step 2:** `TodayView` must accept `var onLog: () -> Void` (added in Task 1.2). Until then the build breaks — Tasks 1.1 and 1.2 are committed together; the orchestrator builds after 1.2.
- [ ] **Step 3: Propose commit (with 1.2)** — `feat(ios): 4-tab bar with toolbar add button, remove floating FAB`

---

### Task 1.2: Today summary feed restyle

**Files:**
- Modify: `ios/CalorieTracker/Views/TodayView.swift`

**Interfaces:**
- Consumes: `HealthCard`, `CalorieRing`, `MacroBar`, `CategoryTile`, `AppPalette` (Task 0.1); `appState.healthKit` (Task 0.3).
- Produces: `TodayView` with new stored property `var onLog: () -> Void`. Adds `@State private var activeKcal: Double = 0`, `@State private var steps: Int = 0`.

- [ ] **Step 1:** Add `var onLog: () -> Void` as the first stored property of `TodayView` and keep all existing `@State`/`loadData()` logic. Add `activeKcal`/`steps` state.

- [ ] **Step 2:** Wrap the body in the grouped background and move the title to a large nav title with a toolbar `+`. Replace the `ScrollView` content with design-system cards. Target structure (preserve all existing data math from the current file — `goalKcal`, `actualKcal`, macro totals, water totals, meals list, delete/undo/log handlers):

```swift
var body: some View {
    NavigationStack {
        ScrollView {
            if isLoading {
                ProgressView().padding(.top, 40)
            } else {
                VStack(spacing: 16) {
                    calorieCard          // HealthCard: CalorieRing + remaining/active/net + 3 MacroBars
                    activityCard         // HealthCard: 2-up CategoryTiles (active kcal, steps) + "Apple Health" caption
                    waterCard            // HealthCard: existing water buttons restyled
                    weightCardLink       // optional: latest weight summary (reuse from WeightView fetch) — may defer to Phase 3
                    mealsSection         // "Today's meals" rows in a HealthCard
                }
                .padding(.horizontal)
                .padding(.bottom, 24)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Today")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { onLog() } label: { Image(systemName: "plus") }
            }
            if let streak, streak.currentLength > 0 {
                ToolbarItem(placement: .topBarLeading) {
                    Label("\(streak.currentLength)", systemImage: "flame.fill")
                        .font(.subheadline).foregroundStyle(.orange)
                }
            }
        }
        .refreshable { await loadData() }
        .alert("Log Custom Water", isPresented: $showCustomWaterAlert) { /* unchanged */ }
        .task { await loadData() }
    }
}
```

- [ ] **Step 3:** Implement the card subviews as computed properties using the design system. Calorie card body:

```swift
private var calorieCard: some View {
    let goalKcal = Double(activeGoal?.dailyKcal ?? 2000)
    let actualKcal = meals.reduce(0.0) { $0 + $1.totalKcal }
    let progress = goalKcal > 0 ? actualKcal / goalKcal : 0
    let remaining = HealthKitMath.caloriesRemaining(goal: goalKcal, eaten: actualKcal, active: activeKcal)
    return HealthCard {
        HStack(spacing: 16) {
            CalorieRing(progress: progress, actual: actualKcal, goal: goalKcal)
            VStack(alignment: .leading, spacing: 6) {
                Text("Calories remaining").font(.caption).foregroundStyle(.secondary)
                Text("\(Int(remaining)) kcal").font(.system(.title2, design: .rounded)).fontWeight(.semibold)
                HStack(spacing: 10) {
                    Label("\(Int(activeKcal)) active", systemImage: "flame.fill")
                        .font(.caption).foregroundStyle(.secondary)
                    Text("Net \(Int(HealthKitMath.netCalories(eaten: actualKcal, active: activeKcal)))")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        let goalP = Double(activeGoal?.proteinG ?? 150), actualP = meals.reduce(0.0) { $0 + ($1.totalProteinG ?? 0) }
        let goalC = Double(activeGoal?.carbG ?? 200),  actualC = meals.reduce(0.0) { $0 + ($1.totalCarbG ?? 0) }
        let goalF = Double(activeGoal?.fatG ?? 67),    actualF = meals.reduce(0.0) { $0 + ($1.totalFatG ?? 0) }
        HStack(spacing: 12) {
            MacroBar(label: "Protein", actual: actualP, goal: goalP, color: AppPalette.protein)
            MacroBar(label: "Carbs",   actual: actualC, goal: goalC, color: AppPalette.carb)
            MacroBar(label: "Fat",     actual: actualF, goal: goalF, color: AppPalette.fat)
        }
    }
}
```

Activity card:

```swift
private var activityCard: some View {
    HealthCard {
        HStack {
            Text("Activity").font(.headline)
            Spacer()
            Label("Apple Health", systemImage: "heart.fill").font(.caption2).foregroundStyle(.secondary)
        }
        HStack(spacing: 16) {
            CategoryTile(symbol: "flame.fill", tint: AppPalette.activity, value: "\(Int(activeKcal))", label: "active kcal")
            CategoryTile(symbol: "figure.walk", tint: AppPalette.carb, value: "\(steps)", label: "steps")
            Spacer()
        }
    }
}
```

Water and meals cards: port the existing water buttons and meals `ForEach` into `HealthCard`s, swapping `Color(.systemBackground)` + stroke overlays for the card. Keep `logWater`, `undoWater`, `deleteMeal`.

- [ ] **Step 4:** In `loadData()`, after loading meals, fetch Health activity for today and (best-effort) import external weights:

```swift
let (active, stepCount) = await appState.healthKit.readActiveEnergyAndSteps(for: Date())
await importExternalWeights()      // see Task 2.3; in Phase 1 this method may be a no-op stub
await MainActor.run { self.activeKcal = active; self.steps = stepCount }
```

(In Phase 1, `appState.healthKit` is the real manager but unauthorized → returns 0/empty, so the cards render cleanly with zeros. Authorization is wired in Phase 2.)

- [ ] **Step 5: Regenerate + build (orchestrator).** Expected: builds; Today renders as grouped cards; tab bar has 4 items; `+` opens the log sheet.
- [ ] **Step 6: Propose commit** — `feat(ios): redesign Today as an Apple Health-style summary feed`

---

# PHASE 2 — HealthKit wiring (writes + reads)

### Task 2.1: Authorization flow + HealthSettingsView

**Files:**
- Create: `ios/CalorieTracker/Views/Settings/HealthSettingsView.swift`

**Interfaces:**
- Consumes: `appState.healthKit`.
- Produces: `HealthSettingsView` (pushed from Settings in Phase 3; standalone-testable now).

- [ ] **Step 1: Create the view**

```swift
import SwiftUI

struct HealthSettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var status: String = ""
    @State private var working = false

    var body: some View {
        Form {
            Section {
                Text("Connect Apple Health to save your meals, water, and weight, and to show active energy, steps, and weight from other apps and devices.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section {
                Button {
                    Task {
                        working = true
                        do { try await appState.healthKit.requestAuthorization(); status = "Apple Health connected." }
                        catch { status = "Could not connect: \(error.localizedDescription)" }
                        working = false
                    }
                } label: {
                    HStack {
                        Label("Connect Apple Health", systemImage: "heart.fill")
                        Spacer()
                        if working { ProgressView().controlSize(.small) }
                    }
                }
                .disabled(working || !appState.healthKit.isAvailable)
                if !appState.healthKit.isAvailable {
                    Text("Apple Health is not available on this device.").font(.caption).foregroundStyle(.secondary)
                }
                if !status.isEmpty { Text(status).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Apple Health")
        .navigationBarTitleDisplayMode(.inline)
    }
}
```

- [ ] **Step 2: Regenerate + build (orchestrator).** Expected: succeeds.
- [ ] **Step 3: Propose commit** — `feat(ios): Apple Health connect/authorization screen`

---

### Task 2.2: Write to Health on meal/water/weight save

**Files:**
- Modify: `ios/CalorieTracker/Views/LogView.swift` (meal), `ios/CalorieTracker/Views/TodayView.swift` (water), `ios/CalorieTracker/Views/WeightView.swift` (weight)

- [ ] **Step 1: Meal write** — in `LogView.saveMeal()`, inside the `Task` after `insertMeal` succeeds and before `dismiss()`:

```swift
try await appState.supabaseManager.insertMeal(meal: meal, items: mealItems)
await appState.healthKit.writeMeal(kcal: totalKcal, proteinG: totalProtein,
                                   carbG: totalCarb, fatG: totalFat, date: meal.consumedAt)
await MainActor.run { dismiss() }
```

- [ ] **Step 2: Water write** — in `TodayView.logWater(amount:)`, after `logWater` succeeds:

```swift
try await appState.supabaseManager.logWater(amountMl: amount, date: Date())
await appState.healthKit.writeWater(ml: amount, date: Date())
await loadData()
```

- [ ] **Step 3: Weight write** — in `AddWeightView.saveWeight()` (`WeightView.swift`), after `upsertWeight` succeeds and before `dismiss()`:

```swift
try await appState.supabaseManager.upsertWeight(record)
await appState.healthKit.writeWeight(kg: weightKg, date: date)
await MainActor.run { dismiss() }
```

- [ ] **Step 4: Regenerate + build (orchestrator).** Expected: succeeds.
- [ ] **Step 5: Propose commit** — `feat(ios): write logged meals, water, and weight to Apple Health`

---

### Task 2.3: Import external weight; surface activity

**Files:**
- Modify: `ios/CalorieTracker/Views/TodayView.swift`

**Interfaces:**
- Consumes: `appState.healthKit.readExternalWeightSamples`, `appState.supabaseManager.fetchWeights/upsertWeight`, `HealthKitMath.shouldImportWeight`, `DateUtils`.

- [ ] **Step 1:** Implement `importExternalWeights()` in `TodayView` (called from `loadData()`):

```swift
private func importExternalWeights() async {
    guard let userId = appState.supabaseManager.currentUserId else { return }
    let since = Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date()
    let samples = await appState.healthKit.readExternalWeightSamples(since: since)
    guard !samples.isEmpty else { return }
    let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
    do {
        let existing = try await appState.supabaseManager.fetchWeights(since: since)
        let existingDates = Set(existing.map { $0.recordedOn })
        for s in samples {
            let dateStr = fmt.string(from: s.date)
            guard HealthKitMath.shouldImportWeight(forDate: dateStr, existingDates: existingDates) else { continue }
            let rec = Weight(id: UUID(), userId: userId, recordedOn: dateStr, weightKg: s.kg, createdAt: Date())
            try? await appState.supabaseManager.upsertWeight(rec)
        }
    } catch { print("weight import skipped: \(error.localizedDescription)") }
}
```

- [ ] **Step 2: Regenerate + build (orchestrator).** Expected: succeeds. (Behavior verified on-device in the final manual pass.)
- [ ] **Step 3: Propose commit** — `feat(ios): import external Apple Health weight, exclude our own writes`

---

# PHASE 3 — Settings restructure

### Task 3.1: Extract Profile, Goals, Units sub-screens

**Files:**
- Create: `ios/CalorieTracker/Views/Settings/ProfileEditView.swift`, `GoalsEditView.swift`, `UnitsView.swift`

- [ ] **Step 1:** Move the profile fields (display name, sex, activity level, timezone) and `saveProfile()` from the current `SettingsView` into `ProfileEditView` (its own `Form` + `@State` + `populateForm()` + save button; `navigationTitle("Profile")`). Keep the exact `Profile(...)` construction and `upsertProfile` call.
- [ ] **Step 2:** Move the goal fields (intent, target weight, pace, daily kcal, P/C/F) + `updateGoal()` + the Goals History section into `GoalsEditView` (`navigationTitle("Goals & Targets")`). Keep the exact `Goal(...)` construction, `createGoal`, and `fetchGoalHistory`/`loadHistory()` logic.
- [ ] **Step 3:** Move the units fields (weight/height/volume unit, water goal) into `UnitsView` (`navigationTitle("Units & Water")`). These persist via the same `saveProfile`-style upsert; reuse the `Profile` upsert (the view writes units + water goal alongside the existing profile values).
- [ ] **Step 4: Regenerate + build (orchestrator).** Expected: succeeds (these compile standalone before the landing wires them in Task 3.2).
- [ ] **Step 5: Propose commit** — `refactor(ios): split Settings form into Profile, Goals, Units screens`

---

### Task 3.2: Settings landing

**Files:**
- Modify: `ios/CalorieTracker/Views/SettingsView.swift`

- [ ] **Step 1: Replace `SettingsView` body** with a grouped landing of `NavigationLink` rows + a profile header + sign-out. Keep `signOut()`.

```swift
struct SettingsView: View {
    @Environment(AppState.self) private var appState
    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 44)).foregroundStyle(.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(appState.supabaseManager.currentProfile?.displayName ?? "Your profile")
                                .font(.headline)
                            Text("Profile & details").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                Section {
                    NavigationLink { ProfileEditView() } label: { Label("Profile", systemImage: "person.fill") }
                    NavigationLink { GoalsEditView() } label: { Label("Goals & Targets", systemImage: "target") }
                    NavigationLink { UnitsView() } label: { Label("Units & Water", systemImage: "ruler") }
                    NavigationLink { HealthSettingsView() } label: { Label("Apple Health", systemImage: "heart.fill") }
                }
                Section {
                    Button(role: .destructive) { signOut() } label: {
                        HStack { Spacer(); Text("Sign Out"); Spacer() }
                    }
                }
            }
            .navigationTitle("Settings")
        }
    }
    private func signOut() {
        Task {
            do { try await appState.supabaseManager.signOut(); await MainActor.run { appState.isLoggedIn = false } }
            catch { print("Sign out failed: \(error.localizedDescription)") }
        }
    }
}
```

- [ ] **Step 2: Regenerate + build (orchestrator).** Expected: succeeds; Settings is a grouped landing pushing into each sub-screen.
- [ ] **Step 3: Propose commit** — `feat(ios): grouped Settings landing with focused sub-screens`

---

# PHASE 4 — History + Weight restyle

### Task 4.1: History restyle

**Files:**
- Modify: `ios/CalorieTracker/Views/HistoryView.swift`

- [ ] **Step 1:** Set the screen background to `Color(.systemGroupedBackground)`; wrap the calendar in a `HealthCard`; restyle `HistoryDetailView`'s day-summary and meal rows using `HealthCard` + `CalorieRing` (replace the `Color(.systemBackground)` + stroke pattern). Keep all calendar/data logic (`loadMonthData`, `mealsForDate`, etc.) unchanged.
- [ ] **Step 2: Regenerate + build (orchestrator).** Expected: succeeds.
- [ ] **Step 3: Propose commit** — `feat(ios): restyle History onto the design system`

---

### Task 4.2: Weight restyle

**Files:**
- Modify: `ios/CalorieTracker/Views/WeightView.swift`

- [ ] **Step 1:** Screen background `systemGroupedBackground`; wrap the current-weight summary and chart in `HealthCard`s; restyle the "Add Weight" button to use `AppPalette.calorie`. Keep the Swift Charts config, moving-average math, and range picker unchanged.
- [ ] **Step 2: Regenerate + build + full test (orchestrator).** Expected: builds; full `xcodebuild test` green.
- [ ] **Step 3: Propose commit** — `feat(ios): restyle Weight onto the design system`

---

## Self-Review (completed)

- **Spec coverage:** §3 design system → 0.1; §4.1 Today → 1.1/1.2; §4.2 History → 4.1; §4.3 Weight → 4.2/2.2; §4.4 Settings → 3.1/3.2; §5 HealthKit cap/manager/dedup → 0.2/0.3/2.x; §6 net-calorie → 0.4 + 1.2; §7 nav → 1.1; §8 persistence → 2.3; §10 testing → 0.4 + orchestrator gates. Covered.
- **Placeholder scan:** the only deliberate forward-reference is `importExternalWeights()` stubbed in Phase 1 and implemented in 2.3 (called out in 1.2 Step 4); `weightCardLink` on Today is marked optional/deferrable. No silent TODOs.
- **Type consistency:** `HealthKitManaging` method names match across 0.3, 1.2, 2.2, 2.3; `HealthKitMath` helper names match 0.3/0.4/1.2; `onLog` matches 1.1/1.2.
