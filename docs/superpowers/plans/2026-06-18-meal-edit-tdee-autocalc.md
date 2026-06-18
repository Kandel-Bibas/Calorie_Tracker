# Meal Edit + TDEE Auto-Calc + Activity Level Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix hardcoded meal names, make saved meals editable, add TDEE auto-calculation to Goals screen, and move activity level from Profile to Goals (storing it on the `goals` table).

**Architecture:** Six independent-but-ordered tasks progressing from DB → pure logic → model update → data layer → UI. TDEECalculator is a pure struct with no dependencies — written TDD first. MealEditView reuses the existing MealReviewView. All changes are client-side iOS except one additive SQL migration.

**Tech Stack:** Swift 5.9+, SwiftUI, Supabase Swift SDK 2.22.0, XcodeGen, iOS 18+, XCTest

## Global Constraints

- iOS deployment target: 18.0
- No new Swift packages — use only what is already in `project.yml`
- All source files live under `ios/CalorieTracker/` (auto-picked up by XcodeGen glob)
- Test files live under `ios/CalorieTrackerTests/`
- After adding any new `.swift` file, run `cd ios && xcodegen generate` before building
- Build command: `cd /Users/bibas/personal/Calorie-Tracker/ios && xcodegen generate && xcodebuild -project CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" build 2>&1 | tail -5`
- Test command: `xcodebuild -project /Users/bibas/personal/Calorie-Tracker/ios/CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" test 2>&1 | grep -E "Test Suite|passed|failed|error:"`
- Never commit without explicit user instruction — propose commit with paths + message and wait
- No Co-Authored-By trailers

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `db/migrations/0001_goals_activity_level.sql` | Create | SQL migration adding `activity_level` to `goals` |
| `ios/CalorieTracker/Models/Models.swift` | Modify | Add `activityLevel` field to `Goal` struct |
| `ios/CalorieTracker/TDEECalculator.swift` | Create | Pure TDEE/BMR/macro calculation engine |
| `ios/CalorieTrackerTests/TDEECalculatorTests.swift` | Create | 8 unit tests for TDEECalculator |
| `ios/CalorieTracker/Services/SupabaseManager.swift` | Modify | Add `updateMeal(meal:items:)` method |
| `ios/CalorieTracker/Views/LogView.swift` | Modify | Fix hardcoded `mealType: "lunch"` |
| `ios/CalorieTracker/Views/MealEditView.swift` | Create | Sheet view for editing a saved meal |
| `ios/CalorieTracker/Views/TodayView.swift` | Modify | Make meal rows tappable, add edit sheet |
| `ios/CalorieTracker/Views/Settings/GoalsEditView.swift` | Modify | Add activity level picker + Calculate button |
| `ios/CalorieTracker/Views/Settings/ProfileEditView.swift` | Modify | Remove activity level picker |

---

## Task 1: DB Migration + Goal Model

**Files:**
- Create: `db/migrations/0001_goals_activity_level.sql`
- Modify: `ios/CalorieTracker/Models/Models.swift`

**Interfaces:**
- Produces: `Goal.activityLevel: String?` (snake_case DB column: `activity_level`)

- [ ] **Step 1: Create the migration file**

Create `db/migrations/0001_goals_activity_level.sql` with this content:
```sql
ALTER TABLE goals
  ADD COLUMN activity_level text DEFAULT 'sedentary';

ALTER TABLE goals
  ADD CONSTRAINT goals_al_chk
  CHECK (activity_level IN ('sedentary','light','moderate','active','very_active'));
```

- [ ] **Step 2: Add `activityLevel` to the `Goal` struct in `Models.swift`**

Open `ios/CalorieTracker/Models/Models.swift`. The `Goal` struct starts at line 149. Make these three additions:

**2a.** Add the property after `var supersededAt: Date?` (around line 161):
```swift
var activityLevel: String?
```

**2b.** Add the CodingKey inside the `CodingKeys` enum after `.supersededAt`:
```swift
case activityLevel = "activity_level"
```

**2c.** Add the decode line inside `init(from decoder:)` after the `supersededAt` decode:
```swift
activityLevel = try container.decodeIfPresent(String.self, forKey: .activityLevel)
```

**2d.** Add the parameter to the memberwise `init` — after `supersededAt: Date?`:
```swift
activityLevel: String?,
```
And in the body after `self.supersededAt = supersededAt`:
```swift
self.activityLevel = activityLevel
```

**2e.** Find the call site in `GoalsEditView.swift` (`updateGoal()`) and add `activityLevel: nil` (temporary; Task 6 will use the real value). The memberwise init now requires this parameter.

- [ ] **Step 3: Build to confirm no compile errors**

```bash
cd /Users/bibas/personal/Calorie-Tracker/ios && xcodegen generate && xcodebuild -project CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" build 2>&1 | tail -5
```
Expected last line: `** BUILD SUCCEEDED **`

---

## Task 2: TDEECalculator — TDD

**Files:**
- Create: `ios/CalorieTracker/TDEECalculator.swift`
- Create: `ios/CalorieTrackerTests/TDEECalculatorTests.swift`

**Interfaces:**
- Produces: `TDEECalculator.Input(sex:currentWeightKg:heightCm:age:activityLevel:intent:pace:)` struct
- Produces: `TDEECalculator.Output(dailyKcal:proteinG:carbG:fatG:)` struct
- Produces: `TDEECalculator.calculate(_ input: Input) -> Output?` static method (returns `nil` when `heightCm == 0` or `age <= 0` or `currentWeightKg <= 0`)

- [ ] **Step 1: Write the failing tests**

Create `ios/CalorieTrackerTests/TDEECalculatorTests.swift`:

```swift
import XCTest
@testable import CalorieTracker

final class TDEECalculatorTests: XCTestCase {

    // male, 80 kg, 180 cm, age 36, sedentary, maintain
    // BMR = 10×80 + 6.25×180 − 5×36 + 5 = 1750
    // TDEE = 1750 × 1.2 = 2100
    func testMaleSedentaryMaintain() {
        let input = TDEECalculator.Input(
            sex: "male", currentWeightKg: 80, heightCm: 180, age: 36,
            activityLevel: "sedentary", intent: "maintain", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        XCTAssertEqual(result.dailyKcal, 2100)
    }

    // female, 60 kg, 165 cm, age 31, sedentary, maintain
    // BMR = 10×60 + 6.25×165 − 5×31 − 161 = 1315.25
    // TDEE = 1315.25 × 1.2 = 1578.3 → 1578
    func testFemaleSedentaryMaintain() {
        let input = TDEECalculator.Input(
            sex: "female", currentWeightKg: 60, heightCm: 165, age: 31,
            activityLevel: "sedentary", intent: "maintain", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        XCTAssertEqual(result.dailyKcal, 1578)
    }

    // same female, moderate → TDEE = 1315.25 × 1.55 = 2038.6375 → 2038
    func testFemaleModerate() {
        let input = TDEECalculator.Input(
            sex: "female", currentWeightKg: 60, heightCm: 165, age: 31,
            activityLevel: "moderate", intent: "maintain", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        XCTAssertEqual(result.dailyKcal, 2038)
    }

    // same female, moderate, lose/steady → 2038.6375 − 500 = 1538.6375 → 1538
    func testLoseWeightSteady() {
        let input = TDEECalculator.Input(
            sex: "female", currentWeightKg: 60, heightCm: 165, age: 31,
            activityLevel: "moderate", intent: "lose", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        XCTAssertEqual(result.dailyKcal, 1538)
    }

    // female, 45 kg, 155 cm, age 26, sedentary, lose/aggressive
    // BMR = 10×45 + 6.25×155 − 5×26 − 161 = 1127.75
    // TDEE = 1127.75 × 1.2 = 1353.3 → target = 1353.3 − 750 = 603.3 → floor 1200
    func testKcalFloor() {
        let input = TDEECalculator.Input(
            sex: "female", currentWeightKg: 45, heightCm: 155, age: 26,
            activityLevel: "sedentary", intent: "lose", pace: "aggressive")
        let result = TDEECalculator.calculate(input)!
        XCTAssertGreaterThanOrEqual(result.dailyKcal, 1200)
        XCTAssertEqual(result.dailyKcal, 1200)
    }

    // male, 80 kg, 180 cm, age 36, moderate, maintain
    // TDEE = 1750 × 1.55 = 2712.5 → proteinG=169, fatG=75, carbG=340
    // macroKcal = 169×4 + 340×4 + 75×9 = 2711 (within 10% of 2712)
    func testMacroKcalCloseness() {
        let input = TDEECalculator.Input(
            sex: "male", currentWeightKg: 80, heightCm: 180, age: 36,
            activityLevel: "moderate", intent: "maintain", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        let macroKcal = result.proteinG * 4 + result.carbG * 4 + result.fatG * 9
        let tolerance = Int(Double(result.dailyKcal) * 0.10)
        XCTAssertEqual(macroKcal, result.dailyKcal, accuracy: tolerance)
    }

    func testMissingHeightReturnsNil() {
        let input = TDEECalculator.Input(
            sex: "male", currentWeightKg: 80, heightCm: 0, age: 36,
            activityLevel: "moderate", intent: "lose", pace: "steady")
        XCTAssertNil(TDEECalculator.calculate(input))
    }

    func testMissingAgeReturnsNil() {
        let input = TDEECalculator.Input(
            sex: "male", currentWeightKg: 80, heightCm: 180, age: 0,
            activityLevel: "moderate", intent: "lose", pace: "steady")
        XCTAssertNil(TDEECalculator.calculate(input))
    }
}
```

- [ ] **Step 2: Run tests — expect compile failure (type not yet defined)**

```bash
cd /Users/bibas/personal/Calorie-Tracker/ios && xcodegen generate && xcodebuild -project CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" test 2>&1 | grep -E "error:|TDEECalculator"
```
Expected: `error: cannot find type 'TDEECalculator'`

- [ ] **Step 3: Create `TDEECalculator.swift`**

Create `ios/CalorieTracker/TDEECalculator.swift`:

```swift
import Foundation

struct TDEECalculator {

    struct Input {
        let sex: String?
        let currentWeightKg: Double
        let heightCm: Int
        let age: Int
        let activityLevel: String
        let intent: String
        let pace: String
    }

    struct Output {
        let dailyKcal: Int
        let proteinG: Int
        let carbG: Int
        let fatG: Int
    }

    /// Returns nil when required body stats are absent (heightCm == 0, age <= 0, weight <= 0).
    static func calculate(_ input: Input) -> Output? {
        guard input.heightCm > 0, input.age > 0, input.currentWeightKg > 0 else { return nil }

        let W = input.currentWeightKg
        let H = Double(input.heightCm)
        let A = Double(input.age)

        let bmr: Double = input.sex == "male"
            ? 10 * W + 6.25 * H - 5 * A + 5
            : 10 * W + 6.25 * H - 5 * A - 161

        let multiplier: Double
        switch input.activityLevel {
        case "light":       multiplier = 1.375
        case "moderate":    multiplier = 1.55
        case "active":      multiplier = 1.725
        case "very_active": multiplier = 1.9
        default:            multiplier = 1.2
        }

        let tdee = bmr * multiplier

        let delta: Double
        switch (input.intent, input.pace) {
        case ("lose", "easy"):        delta = -250
        case ("lose", "steady"):      delta = -500
        case ("lose", "aggressive"):  delta = -750
        case ("gain", "easy"):        delta = +250
        case ("gain", "steady"):      delta = +500
        case ("gain", "aggressive"):  delta = +750
        default:                      delta = 0
        }

        let targetKcal = max(1200.0, tdee + delta)

        let proteinG = max(Int(1.6 * W), Int(targetKcal * 0.25 / 4))
        let fatG     = Int(targetKcal * 0.25 / 9)
        let carbG    = max(0, Int((targetKcal - Double(proteinG) * 4 - Double(fatG) * 9) / 4))

        return Output(dailyKcal: Int(targetKcal), proteinG: proteinG, carbG: carbG, fatG: fatG)
    }
}
```

- [ ] **Step 4: Run tests — all 8 TDEECalculatorTests must pass**

```bash
cd /Users/bibas/personal/Calorie-Tracker/ios && xcodegen generate && xcodebuild -project CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" test 2>&1 | grep -E "TDEECalculatorTests|passed|failed"
```
Expected: `Test Suite 'TDEECalculatorTests' passed`

---

## Task 3: Fix Meal Name Bug

**Files:**
- Modify: `ios/CalorieTracker/Views/LogView.swift` (line ~350)

**Interfaces:**
- Consumes: `mealLabel: String` (already a `@State` in `LogView`)

- [ ] **Step 1: Find and fix the hardcoded mealType**

In `ios/CalorieTracker/Views/LogView.swift`, inside `saveMeal()`, find the `Meal(...)` constructor call. Change:
```swift
mealType: "lunch",
```
to:
```swift
mealType: mealLabel.isEmpty ? nil : mealLabel,
```

- [ ] **Step 2: Build to confirm no errors**

```bash
xcodebuild -project /Users/bibas/personal/Calorie-Tracker/ios/CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" build 2>&1 | tail -3
```
Expected: `** BUILD SUCCEEDED **`

---

## Task 4: SupabaseManager.updateMeal

**Files:**
- Modify: `ios/CalorieTracker/Services/SupabaseManager.swift`

**Interfaces:**
- Produces: `func updateMeal(meal: Meal, items: [MealItem]) async throws`

- [ ] **Step 1: Add `updateMeal` to SupabaseManager**

In `ios/CalorieTracker/Services/SupabaseManager.swift`, add after the `deleteMeal` method (around line 172):

```swift
func updateMeal(meal: Meal, items: [MealItem]) async throws {
    struct MealPatch: Encodable {
        let meal_type: String?
        let total_kcal: Double
        let total_protein_g: Double
        let total_carb_g: Double
        let total_fat_g: Double
        let edited_at: String
    }
    let patch = MealPatch(
        meal_type: meal.mealType,
        total_kcal: meal.totalKcal,
        total_protein_g: meal.totalProteinG ?? 0,
        total_carb_g: meal.totalCarbG ?? 0,
        total_fat_g: meal.totalFatG ?? 0,
        edited_at: DateFormatter.iso8601Standard.string(from: Date())
    )
    try await supabase.database
        .from("meals")
        .update(patch)
        .eq("id", value: meal.id)
        .execute()
    try await supabase.database
        .from("meal_items")
        .delete()
        .eq("meal_id", value: meal.id)
        .execute()
    for item in items {
        try await supabase.database
            .from("meal_items")
            .insert(item)
            .execute()
    }
}
```

- [ ] **Step 2: Build to confirm no errors**

```bash
xcodebuild -project /Users/bibas/personal/Calorie-Tracker/ios/CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" build 2>&1 | tail -3
```
Expected: `** BUILD SUCCEEDED **`

---

## Task 5: MealEditView + TodayView Tappable Meals

**Files:**
- Create: `ios/CalorieTracker/Views/MealEditView.swift`
- Modify: `ios/CalorieTracker/Views/TodayView.swift`

**Interfaces:**
- Consumes: `SupabaseManager.fetchMealItems(mealId:)` (exists), `SupabaseManager.updateMeal(meal:items:)` (Task 4), `MealReviewView` (exists)
- Produces: `MealEditView(meal: Meal, onDone: () -> Void)` view

- [ ] **Step 1: Create `MealEditView.swift`**

Create `ios/CalorieTracker/Views/MealEditView.swift`:

```swift
import SwiftUI

struct MealEditView: View {
    let meal: Meal
    var onDone: () -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var mealLabel: String = ""
    @State private var mealNotes: String = ""
    @State private var items: [FoodItem] = []
    @State private var isLoading: Bool = true
    @State private var errorMessage: String? = nil

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading meal…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                MealReviewView(
                    mealLabel: $mealLabel,
                    mealNotes: $mealNotes,
                    items: $items,
                    onSave: { saveEdits() },
                    onCancel: { dismiss() },
                    errorMessage: errorMessage
                )
            }
        }
        .task { await loadItems() }
    }

    private func loadItems() async {
        do {
            let fetched = try await appState.supabaseManager.fetchMealItems(mealId: meal.id)
            let foodItems = fetched.map { FoodItem(mealItem: $0) }
            await MainActor.run {
                mealLabel = meal.mealType ?? ""
                mealNotes = meal.voiceTranscript ?? ""
                items = foodItems
                isLoading = false
            }
        } catch {
            await MainActor.run {
                errorMessage = "Failed to load meal: \(error.localizedDescription)"
                isLoading = false
            }
        }
    }

    private func saveEdits() {
        guard let userId = appState.supabaseManager.currentUserId else { return }

        let totalKcal    = items.reduce(0.0) { $0 + ($1.kcalPer100g * $1.grams / 100) }
        let totalProtein = items.reduce(0.0) { $0 + (($1.proteinPer100g ?? 0) * $1.grams / 100) }
        let totalCarb    = items.reduce(0.0) { $0 + (($1.carbPer100g ?? 0) * $1.grams / 100) }
        let totalFat     = items.reduce(0.0) { $0 + (($1.fatPer100g ?? 0) * $1.grams / 100) }

        let updatedMeal = Meal(
            id: meal.id,
            userId: userId,
            consumedAt: meal.consumedAt,
            mealType: mealLabel.isEmpty ? nil : mealLabel,
            photoPath: meal.photoPath,
            voiceTranscript: mealNotes.isEmpty ? nil : mealNotes,
            totalKcal: totalKcal,
            totalProteinG: totalProtein,
            totalCarbG: totalCarb,
            totalFatG: totalFat,
            errorBandLow: totalKcal * 0.9,
            errorBandHigh: totalKcal * 1.1,
            geminiRaw: meal.geminiRaw,
            createdAt: meal.createdAt,
            editedAt: Date()
        )

        let mealItems: [MealItem] = items.map { item in
            MealItem(
                id: UUID(),
                mealId: meal.id,
                userId: userId,
                foodName: item.usdaQuery,
                displayName: item.displayName,
                grams: item.grams,
                kcal: item.kcalPer100g * item.grams / 100,
                proteinG: item.proteinPer100g.map { $0 * item.grams / 100 },
                carbG: item.carbPer100g.map { $0 * item.grams / 100 },
                fatG: item.fatPer100g.map { $0 * item.grams / 100 },
                loggingMode: item.loggingMode,
                userProvidedGrams: item.userProvidedGrams,
                source: "user_edit",
                sourceRef: nil,
                matchConfidence: 1.0,
                userEdited: true
            )
        }

        Task {
            do {
                try await appState.supabaseManager.updateMeal(meal: updatedMeal, items: mealItems)
                await MainActor.run {
                    onDone()
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = "Failed to save: \(error.localizedDescription)"
                }
            }
        }
    }
}

// Converts a persisted MealItem (absolute macros) back to FoodItem (per-100g) for MealReviewView.
extension FoodItem {
    init(mealItem: MealItem) {
        let g = max(mealItem.grams, 0.001)
        usdaQuery          = mealItem.foodName
        displayName        = mealItem.displayName
        grams              = mealItem.grams
        userProvidedGrams  = mealItem.userProvidedGrams
        loggingMode        = mealItem.loggingMode ?? "component"
        compositeComponents = nil
        preparation        = ""
        estimationBasis    = nil
        kcalPer100g        = mealItem.kcal / g * 100
        proteinPer100g     = mealItem.proteinG.map { $0 / g * 100 }
        carbPer100g        = mealItem.carbG.map    { $0 / g * 100 }
        fatPer100g         = mealItem.fatG.map     { $0 / g * 100 }
    }
}
```

- [ ] **Step 2: Update TodayView — add `editingMeal` state and sheet**

In `ios/CalorieTracker/Views/TodayView.swift`:

**2a.** Add one state variable after `@State private var activeKcal`:
```swift
@State private var editingMeal: Meal? = nil
```

**2b.** In `mealsSection`, replace the existing `ForEach` block (the entire `ForEach(meals) { meal in ... }` closure) with:
```swift
ForEach(meals) { meal in
    VStack(alignment: .leading, spacing: 10) {
        HStack {
            Text(meal.mealType?.capitalized ?? "Meal")
                .font(.headline)
                .fontWeight(.semibold)
            Spacer()
            Text("\(Int(meal.totalKcal)) kcal")
                .font(.headline)
                .foregroundStyle(.orange)
        }

        if let note = meal.voiceTranscript ?? meal.photoPath {
            Text(note)
                .font(.caption)
                .foregroundStyle(.secondary)
        }

        HStack {
            Text("P: \(Int(meal.totalProteinG ?? 0))g  C: \(Int(meal.totalCarbG ?? 0))g  F: \(Int(meal.totalFatG ?? 0))g")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Button(role: .destructive) {
                deleteMeal(mealId: meal.id)
            } label: {
                Image(systemName: "trash")
                    .font(.footnote)
            }
            .accessibilityLabel("Delete meal")
        }
    }
    .padding(.vertical, 4)
    .contentShape(Rectangle())
    .onTapGesture { editingMeal = meal }

    if meal.id != meals.last?.id {
        Divider()
    }
}
```

**2c.** Add the sheet modifier to the `NavigationStack` (after `.task { await loadData() }`):
```swift
.sheet(item: $editingMeal) { meal in
    MealEditView(meal: meal) {
        Task { await loadData() }
    }
}
```

- [ ] **Step 3: Build — confirm no errors**

```bash
cd /Users/bibas/personal/Calorie-Tracker/ios && xcodegen generate && xcodebuild -project CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" build 2>&1 | tail -3
```
Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Run full test suite**

```bash
xcodebuild -project /Users/bibas/personal/Calorie-Tracker/ios/CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" test 2>&1 | grep -E "Test Suite 'All|passed|failed"
```
Expected: all tests pass (≥ 32 tests including the 8 new TDEE tests)

---

## Task 6: GoalsEditView + ProfileEditView

**Files:**
- Modify: `ios/CalorieTracker/Views/Settings/GoalsEditView.swift`
- Modify: `ios/CalorieTracker/Views/Settings/ProfileEditView.swift`

**Interfaces:**
- Consumes: `TDEECalculator.Input` / `TDEECalculator.calculate` (Task 2), `Goal.activityLevel` (Task 1), `SupabaseManager.fetchWeights(since:)` (existing)

- [ ] **Step 1: Update `GoalsEditView` — add state variables**

In `ios/CalorieTracker/Views/Settings/GoalsEditView.swift`, add these three state variables after `@State private var fatString`:
```swift
@State private var activityLevel: String = "sedentary"
@State private var isCalculating: Bool = false
@State private var calculationMessage: String? = nil
```

- [ ] **Step 2: Add Activity Level Picker to the form**

Inside the `Section("Update Goals")` block, add the Picker after the `Picker("Pace", ...)` picker:
```swift
Picker("Activity Level", selection: $activityLevel) {
    Text("Sedentary").tag("sedentary")
    Text("Light").tag("light")
    Text("Moderate").tag("moderate")
    Text("Active").tag("active")
    Text("Very Active").tag("very_active")
}
```

- [ ] **Step 3: Add Calculate button and its message**

Inside `Section("Update Goals")`, add the following block immediately after the Fat `HStack` (before the `Button { updateGoal() }` button):
```swift
if let calculationMessage {
    Text(calculationMessage)
        .font(.caption)
        .foregroundStyle(.secondary)
}

Button {
    Task { await calculateTDEE() }
} label: {
    HStack {
        Spacer()
        if isCalculating {
            ProgressView().controlSize(.small)
        } else {
            Label("Calculate from Stats", systemImage: "function")
        }
        Spacer()
    }
}
.disabled(isCalculating)
```

- [ ] **Step 4: Add the `calculateTDEE()` method**

Add this private method to `GoalsEditView` after `loadHistory()`:
```swift
private func calculateTDEE() async {
    isCalculating = true
    defer { Task { @MainActor in isCalculating = false } }

    guard let profile = appState.supabaseManager.currentProfile,
          let heightCm = profile.heightCm, heightCm > 0,
          let birthYear = profile.birthYear, birthYear > 0 else {
        await MainActor.run {
            calculationMessage = "Complete your profile (height, birth year) first."
        }
        return
    }

    let since = Calendar.current.date(byAdding: .year, value: -1, to: Date()) ?? Date()
    let weights = (try? await appState.supabaseManager.fetchWeights(since: since)) ?? []

    guard let latestWeight = weights.first else {
        await MainActor.run {
            calculationMessage = "Log a weight first to use auto-calc."
        }
        return
    }

    let currentYear = Calendar.current.component(.year, from: Date())
    let age = currentYear - birthYear

    let input = TDEECalculator.Input(
        sex: profile.sex,
        currentWeightKg: latestWeight.weightKg,
        heightCm: heightCm,
        age: age,
        activityLevel: activityLevel,
        intent: selectedIntent,
        pace: selectedPace
    )

    guard let result = TDEECalculator.calculate(input) else {
        await MainActor.run {
            calculationMessage = "Could not calculate — check your profile data."
        }
        return
    }

    await MainActor.run {
        dailyKcalString = String(result.dailyKcal)
        proteinString   = String(result.proteinG)
        carbString      = String(result.carbG)
        fatString       = String(result.fatG)
        calculationMessage = "Suggested values filled in. Adjust if needed."
    }
}
```

- [ ] **Step 5: Load `activityLevel` in `loadHistory()`**

Inside `loadHistory()`, after the line `selectedPace = active.pace ?? "steady"`, add:
```swift
activityLevel = active.activityLevel
    ?? appState.supabaseManager.currentProfile?.activityLevel
    ?? "sedentary"
```

- [ ] **Step 6: Pass `activityLevel` when creating a new goal in `updateGoal()`**

In `updateGoal()`, find the `Goal(...)` constructor and replace `activityLevel: nil` (added in Task 1 Step 2e) with:
```swift
activityLevel: activityLevel,
```

- [ ] **Step 7: Remove activity level from `ProfileEditView`**

In `ios/CalorieTracker/Views/Settings/ProfileEditView.swift`:

**7a.** Remove the state variable:
```swift
@State private var activityLevel: String = "sedentary"
```

**7b.** Remove the Picker in the form body:
```swift
Picker("Activity Level", selection: $activityLevel) {
    Text("Sedentary").tag("sedentary")
    Text("Light").tag("light")
    Text("Moderate").tag("moderate")
    Text("Active").tag("active")
    Text("Very Active").tag("very_active")
}
```

**7c.** In `populateForm()`, remove:
```swift
activityLevel = profile.activityLevel ?? "sedentary"
```

**7d.** In `save()`, the `Profile(...)` constructor already carries `activityLevel: activityLevel` through from `current?.activityLevel`. Now that the state variable is gone, change that line to use the passthrough value directly. Find:
```swift
activityLevel: activityLevel,
```
and replace with:
```swift
activityLevel: current?.activityLevel,
```

- [ ] **Step 8: Build and run full test suite**

```bash
cd /Users/bibas/personal/Calorie-Tracker/ios && xcodegen generate && xcodebuild -project CalorieTracker.xcodeproj -scheme CalorieTracker -destination "platform=iOS Simulator,name=iPhone 17 Pro" test 2>&1 | grep -E "Test Suite 'All|passed|failed|error:"
```
Expected: `Test Suite 'All tests' passed` with ≥ 32 tests (24 original + 8 TDEE)

---

## Self-Review Checklist (completed inline)

**Spec coverage:**
- [x] Meal name bug → Task 3
- [x] Splash screen cache → documented in spec (no code task needed)
- [x] Meal edit → Tasks 4 + 5
- [x] DB migration for `activity_level` on goals → Task 1
- [x] `Goal.activityLevel` model field → Task 1
- [x] TDEECalculator pure struct → Task 2
- [x] 8 unit tests (spec says 7+; plan has 8) → Task 2
- [x] Activity level picker in Goals, removed from Profile → Task 6
- [x] Calculate button + error messages → Task 6
- [x] Goals save includes `activityLevel` → Task 6 Step 6

**Type consistency check:**
- `TDEECalculator.Input` uses `age: Int` (not `birthYear`) — GoalsEditView computes age from birthYear ✓
- `Goal.activityLevel: String?` matches CodingKey `"activity_level"` ✓
- `MealEditView` calls `SupabaseManager.updateMeal(meal:items:)` — signature defined in Task 4 ✓
- `FoodItem.init(mealItem:)` extension defined in `MealEditView.swift` — used in `loadItems()` ✓
- `TDEECalculator.Output.dailyKcal` is `Int` — assigned to `dailyKcalString` via `String(result.dailyKcal)` ✓
