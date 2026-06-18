import SwiftUI

// MARK: - Today View
struct TodayView: View {
    var onLog: () -> Void

    @Environment(AppState.self) private var appState

    @State private var meals: [Meal] = []
    @State private var waterLogs: [WaterLog] = []
    @State private var streak: Streak? = nil
    @State private var activeGoal: Goal? = nil
    @State private var latestWeight: Weight? = nil

    @State private var isLoading: Bool = true
    @State private var customWaterAmount: String = ""
    @State private var showCustomWaterAlert: Bool = false

    @State private var activeKcal: Double = 0
    @State private var steps: Int = 0

    private var timezone: String {
        appState.supabaseManager.currentProfile?.timezone ?? "America/Los_Angeles"
    }

    private var volumeUnit: String {
        appState.supabaseManager.currentProfile?.unitsVolume ?? "ml"
    }

    private var weightUnit: String {
        appState.supabaseManager.currentProfile?.unitsWeight ?? "lb"
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if isLoading {
                    ProgressView()
                        .padding(.top, 40)
                } else {
                    VStack(spacing: 16) {
                        calorieCard
                        activityCard
                        waterCard
                        weightCard
                        mealsSection
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 24)
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Today")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        onLog()
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Log meal")
                }
                if let streak, streak.currentLength > 0 {
                    ToolbarItem(placement: .topBarLeading) {
                        Label("\(streak.currentLength)", systemImage: "flame.fill")
                            .font(.subheadline)
                            .foregroundStyle(.orange)
                    }
                }
            }
            .refreshable { await loadData() }
            .alert("Log Custom Water", isPresented: $showCustomWaterAlert) {
                TextField("Amount (\(volumeUnit))", text: $customWaterAmount)
                    .keyboardType(.numberPad)
                Button("Add") {
                    let ml = AppUnits.volumeToMl(Double(customWaterAmount) ?? 0, unit: volumeUnit)
                    if ml > 0 {
                        logWater(amount: ml)
                    }
                    customWaterAmount = ""
                }
                Button("Cancel", role: .cancel) {
                    customWaterAmount = ""
                }
            }
            .task { await loadData() }
        }
    }

    // MARK: - Cards

    private var calorieCard: some View {
        let goalKcal = Double(activeGoal?.dailyKcal ?? 2000)
        let actualKcal = meals.reduce(0.0) { $0 + $1.totalKcal }
        let progress = goalKcal > 0 ? actualKcal / goalKcal : 0
        let remaining = HealthKitMath.caloriesRemaining(goal: goalKcal, eaten: actualKcal, active: activeKcal)
        let goalP = Double(activeGoal?.proteinG ?? 150)
        let actualP = meals.reduce(0.0) { $0 + ($1.totalProteinG ?? 0) }
        let goalC = Double(activeGoal?.carbG ?? 200)
        let actualC = meals.reduce(0.0) { $0 + ($1.totalCarbG ?? 0) }
        let goalF = Double(activeGoal?.fatG ?? 67)
        let actualF = meals.reduce(0.0) { $0 + ($1.totalFatG ?? 0) }

        return HealthCard {
            HStack(spacing: 16) {
                CalorieRing(progress: progress, actual: actualKcal, goal: goalKcal)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Calories remaining")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(Int(remaining)) kcal")
                        .font(.system(.title2, design: .rounded))
                        .fontWeight(.semibold)
                    HStack(spacing: 10) {
                        Label("\(Int(activeKcal)) active", systemImage: "flame.fill")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("Net \(Int(HealthKitMath.netCalories(eaten: actualKcal, active: activeKcal)))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            HStack(spacing: 12) {
                MacroBar(label: "Protein", actual: actualP, goal: goalP, color: AppPalette.protein)
                MacroBar(label: "Carbs",   actual: actualC, goal: goalC, color: AppPalette.carb)
                MacroBar(label: "Fat",     actual: actualF, goal: goalF, color: AppPalette.fat)
            }
        }
    }

    private var activityCard: some View {
        HealthCard {
            HStack {
                Text("Activity")
                    .font(.headline)
                Spacer()
                Label("Apple Health", systemImage: "heart.fill")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 16) {
                CategoryTile(
                    symbol: "flame.fill",
                    tint: AppPalette.activity,
                    value: "\(Int(activeKcal))",
                    label: "active kcal"
                )
                CategoryTile(
                    symbol: "figure.walk",
                    tint: AppPalette.carb,
                    value: "\(steps)",
                    label: "steps"
                )
                Spacer()
            }
        }
    }

    private var waterCard: some View {
        let currentWater = waterLogs.reduce(0) { $0 + $1.amountMl }
        let waterGoal = appState.supabaseManager.currentProfile?.waterGoalMl ?? 2000

        return HealthCard {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Water Intake")
                        .font(.headline)
                        .fontWeight(.semibold)
                    Text("\(AppUnits.formatVolume(ml: currentWater, unit: volumeUnit)) / \(AppUnits.formatVolume(ml: waterGoal, unit: volumeUnit))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    undoWater()
                } label: {
                    Image(systemName: "arrow.uturn.backward.circle.fill")
                        .font(.title2)
                        .foregroundStyle(.orange)
                }
                .disabled(waterLogs.isEmpty)
                .accessibilityLabel("Undo last water log")
            }
            HStack(spacing: 12) {
                ForEach(AppUnits.quickAdds(unit: volumeUnit), id: \.label) { add in
                    Button {
                        logWater(amount: add.ml)
                    } label: {
                        Text(add.label)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .padding(.vertical, 8)
                            .frame(maxWidth: .infinity)
                            .background(Color(.systemGray5))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                }
                Button {
                    showCustomWaterAlert = true
                } label: {
                    Text("Custom")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity)
                        .background(Color(.systemGray5))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
        }
    }

    @ViewBuilder
    private var weightCard: some View {
        if let weight = latestWeight {
            let displayValue = AppUnits.formatWeight(kg: weight.weightKg, unit: weightUnit)

            HealthCard {
                HStack {
                    Text("Weight")
                        .font(.headline)
                    Spacer()
                    Text(formattedWeightDate(weight.recordedOn))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                CategoryTile(
                    symbol: "scalemass.fill",
                    tint: AppPalette.weight,
                    value: displayValue,
                    label: "latest weight"
                )
            }
        }
    }

    private var mealsSection: some View {
        HealthCard {
            Text("Today's Meals")
                .font(.headline)
                .fontWeight(.semibold)

            if meals.isEmpty {
                Text("No meals logged today yet.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            } else {
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

                    if meal.id != meals.last?.id {
                        Divider()
                    }
                }
            }
        }
    }

    // MARK: - Data Loading

    private func loadData() async {
        do {
            let range = DateUtils.userDayRangeUtc(timezone: timezone, dateIso: nil)
            let fetchedMeals = try await appState.supabaseManager.fetchMeals(start: range.start, end: range.end)
            let fetchedWater = try await appState.supabaseManager.fetchWaterLogs(start: range.start, end: range.end)
            let fetchedGoal = try await appState.supabaseManager.fetchActiveGoal()
            let fetchedStreak = try await appState.supabaseManager.fetchStreak()

            // Weights: fetch once (descending → first is most recent), reused for both the
            // import dedup and the latest-weight display. Re-fetch only if an import actually
            // added a row, so a freshly synced Health weight appears this cycle.
            let weightSince = Calendar.current.date(byAdding: .year, value: -1, to: Date()) ?? Date()
            var fetchedWeights = (try? await appState.supabaseManager.fetchWeights(since: weightSince)) ?? []
            if await appState.importExternalHealthWeights(existing: fetchedWeights) {
                fetchedWeights = (try? await appState.supabaseManager.fetchWeights(since: weightSince)) ?? fetchedWeights
            }
            let latestFetchedWeight = fetchedWeights.first

            let (active, stepCount): (Double, Int) = appState.healthConnected
                ? await appState.healthKit.readActiveEnergyAndSteps(for: Date())
                : (0, 0)

            await MainActor.run {
                self.meals = fetchedMeals
                self.waterLogs = fetchedWater
                self.activeGoal = fetchedGoal
                self.streak = fetchedStreak
                self.latestWeight = latestFetchedWeight
                self.activeKcal = active
                self.steps = stepCount
                self.isLoading = false
            }
        } catch {
            print("Failed to load today data: \(error.localizedDescription)")
            await MainActor.run {
                self.isLoading = false
            }
        }
    }

    /// Formats a stored "yyyy-MM-dd" weight date as a short, friendly label (e.g. "Jun 18").
    private func formattedWeightDate(_ recordedOn: String) -> String {
        let parser = DateFormatter()
        parser.dateFormat = "yyyy-MM-dd"
        parser.timeZone = TimeZone(identifier: timezone) ?? TimeZone(secondsFromGMT: 0)
        guard let date = parser.date(from: recordedOn) else { return recordedOn }
        let out = DateFormatter()
        out.timeZone = parser.timeZone
        out.setLocalizedDateFormatFromTemplate("MMMd")
        return out.string(from: date)
    }

    // MARK: - Actions

    private func logWater(amount: Int) {
        Task {
            do {
                try await appState.supabaseManager.logWater(amountMl: amount, date: Date())
                if appState.healthConnected { await appState.healthKit.writeWater(ml: amount, date: Date()) }
                await loadData()
            } catch {
                print("Failed to log water: \(error.localizedDescription)")
            }
        }
    }

    private func undoWater() {
        Task {
            do {
                try await appState.supabaseManager.deleteLastWaterLog()
                await loadData()
            } catch {
                print("Failed to undo water: \(error.localizedDescription)")
            }
        }
    }

    private func deleteMeal(mealId: UUID) {
        Task {
            do {
                try await appState.supabaseManager.deleteMeal(mealId: mealId)
                await loadData()
            } catch {
                print("Failed to delete meal: \(error.localizedDescription)")
            }
        }
    }
}
