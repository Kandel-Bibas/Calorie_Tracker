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
