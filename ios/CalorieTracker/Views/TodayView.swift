import SwiftUI

// MARK: - Circular Progress Ring Component
struct CircularProgressRing: View {
    var progress: Double // 0.0 to 1.0+
    var actual: Double
    var goal: Double
    
    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemGray5), lineWidth: 14)
            
            Circle()
                .trim(from: 0.0, to: min(progress, 1.0))
                .stroke(Color.orange, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                .rotationEffect(Angle(degrees: -90))
                .animation(.easeOut(duration: 1.0), value: progress)
            
            VStack(spacing: 4) {
                Text("\(Int(actual))")
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                Text("of \(Int(goal)) kcal")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 170, height: 170)
    }
}

// MARK: - Macro Progress Bar Component
struct MacroProgressBar: View {
    var label: String
    var actual: Double
    var goal: Double
    var color: Color
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Spacer()
                Text("\(Int(actual))g / \(Int(goal))g")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color(.systemGray5))
                        .frame(height: 8)
                    
                    RoundedRectangle(cornerRadius: 4)
                        .fill(color)
                        .frame(width: min(CGFloat(actual / (goal > 0 ? goal : 1.0)) * geometry.size.width, geometry.size.width), height: 8)
                        .animation(.easeOut(duration: 1.0), value: actual)
                }
            }
            .frame(height: 8)
        }
    }
}

// MARK: - Today View
struct TodayView: View {
    @Environment(AppState.self) private var appState
    
    @State private var meals: [Meal] = []
    @State private var waterLogs: [WaterLog] = []
    @State private var streak: Streak? = nil
    @State private var activeGoal: Goal? = nil
    
    @State private var isLoading: Bool = true
    @State private var customWaterAmount: String = ""
    @State private var showCustomWaterAlert: Bool = false
    
    private var timezone: String {
        appState.supabaseManager.currentProfile?.timezone ?? "America/Los_Angeles"
    }
    
    var body: some View {
        NavigationStack {
            ScrollView {
                if isLoading {
                    ProgressView()
                        .padding(.top, 40)
                } else {
                    VStack(spacing: 24) {
                        // Calorie Progress Ring Card
                        VStack(spacing: 20) {
                            let goalKcal = Double(activeGoal?.dailyKcal ?? 2000)
                            let actualKcal = meals.reduce(0.0) { $0 + $1.totalKcal }
                            let progress = goalKcal > 0 ? actualKcal / goalKcal : 0.0
                            
                            CircularProgressRing(progress: progress, actual: actualKcal, goal: goalKcal)
                                .padding(.top, 8)
                            
                            // Macros Progress
                            let goalProtein = Double(activeGoal?.proteinG ?? 150)
                            let actualProtein = meals.reduce(0.0) { $0 + ($1.totalProteinG ?? 0) }
                            
                            let goalCarb = Double(activeGoal?.carbG ?? 200)
                            let actualCarb = meals.reduce(0.0) { $0 + ($1.totalCarbG ?? 0) }
                            
                            let goalFat = Double(activeGoal?.fatG ?? 67)
                            let actualFat = meals.reduce(0.0) { $0 + ($1.totalFatG ?? 0) }
                            
                            VStack(spacing: 12) {
                                MacroProgressBar(label: "Protein", actual: actualProtein, goal: goalProtein, color: .red)
                                MacroProgressBar(label: "Carbohydrates", actual: actualCarb, goal: goalCarb, color: .blue)
                                MacroProgressBar(label: "Fat", actual: actualFat, goal: goalFat, color: .yellow)
                            }
                        }
                        .padding()
                        .background(Color(.systemBackground))
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color(.systemGray5), lineWidth: 1)
                        )
                        .padding(.horizontal)
                        
                        // Water Intake Card
                        VStack(alignment: .leading, spacing: 16) {
                            let currentWater = waterLogs.reduce(0) { $0 + $1.amountMl }
                            let waterGoal = appState.supabaseManager.currentProfile?.waterGoalMl ?? 2000
                            
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Water Intake")
                                        .font(.headline)
                                        .fontWeight(.semibold)
                                    Text("\(currentWater) ml / \(waterGoal) ml")
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
                            }
                            
                            HStack(spacing: 12) {
                                Button {
                                    logWater(amount: 250)
                                } label: {
                                    Text("+250ml")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .padding(.vertical, 8)
                                        .frame(maxWidth: .infinity)
                                        .background(Color(.systemGray6))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(Color(.systemGray4), lineWidth: 1)
                                        )
                                }
                                
                                Button {
                                    logWater(amount: 500)
                                } label: {
                                    Text("+500ml")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .padding(.vertical, 8)
                                        .frame(maxWidth: .infinity)
                                        .background(Color(.systemGray6))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(Color(.systemGray4), lineWidth: 1)
                                        )
                                }
                                
                                Button {
                                    showCustomWaterAlert = true
                                } label: {
                                    Text("Custom")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .padding(.vertical, 8)
                                        .frame(maxWidth: .infinity)
                                        .background(Color(.systemGray6))
                                        .cornerRadius(8)
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 8)
                                                .stroke(Color(.systemGray4), lineWidth: 1)
                                        )
                                }
                            }
                        }
                        .padding()
                        .background(Color(.systemBackground))
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color(.systemGray5), lineWidth: 1)
                        )
                        .padding(.horizontal)
                        
                        // Today's Meals Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Today's Meals")
                                .font(.title3)
                                .fontWeight(.bold)
                                .padding(.horizontal)
                            
                            if meals.isEmpty {
                                Text("No meals logged today yet.")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 24)
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
                                        }
                                    }
                                    .padding()
                                    .background(Color(.systemBackground))
                                    .cornerRadius(12)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color(.systemGray5), lineWidth: 1)
                                    )
                                    .padding(.horizontal)
                                }
                            }
                        }
                    }
                    .padding(.bottom, 80)
                }
            }
            .navigationTitle("Today")
            .refreshable {
                await loadData()
            }
            .alert("Log Custom Water", isPresented: $showCustomWaterAlert) {
                TextField("Amount (ml)", text: $customWaterAmount)
                    .keyboardType(.numberPad)
                Button("Add") {
                    if let amount = Int(customWaterAmount) {
                        logWater(amount: amount)
                    }
                    customWaterAmount = ""
                }
                Button("Cancel", role: .cancel) {
                    customWaterAmount = ""
                }
            }
            .task {
                await loadData()
            }
        }
    }
    
    private func loadData() async {
        do {
            let range = DateUtils.userDayRangeUtc(timezone: timezone, dateIso: nil)
            let fetchedMeals = try await appState.supabaseManager.fetchMeals(start: range.start, end: range.end)
            let fetchedWater = try await appState.supabaseManager.fetchWaterLogs(start: range.start, end: range.end)
            let fetchedGoal = try await appState.supabaseManager.fetchActiveGoal()
            let fetchedStreak = try await appState.supabaseManager.fetchStreak()
            
            await MainActor.run {
                self.meals = fetchedMeals
                self.waterLogs = fetchedWater
                self.activeGoal = fetchedGoal
                self.streak = fetchedStreak
                self.isLoading = false
            }
        } catch {
            print("Failed to load today data: \(error.localizedDescription)")
            await MainActor.run {
                self.isLoading = false
            }
        }
    }
    
    private func logWater(amount: Int) {
        Task {
            do {
                try await appState.supabaseManager.logWater(amountMl: amount, date: Date())
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
