import SwiftUI

struct GoalsEditView: View {
    @Environment(AppState.self) private var appState

    @State private var selectedIntent: String = "maintain"
    @State private var targetWeightString: String = ""
    @State private var selectedPace: String = "steady"
    @State private var dailyKcalString: String = "2000"
    @State private var proteinString: String = "150"
    @State private var carbString: String = "200"
    @State private var fatString: String = "67"
    @State private var activityLevel: String = "sedentary"
    @State private var isCalculating: Bool = false
    @State private var calculationMessage: String? = nil

    @State private var goalHistory: [Goal] = []
    @State private var isSaving: Bool = false
    @State private var errorMessage: String? = nil
    @State private var successMessage: String? = nil

    private var weightUnit: String {
        appState.supabaseManager.currentProfile?.unitsWeight ?? "lb"
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    var body: some View {
        Form {
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }
            }

            if let successMessage {
                Section {
                    Text(successMessage)
                        .foregroundStyle(.green)
                }
            }

            Section("Update Goals") {
                Picker("Intent", selection: $selectedIntent) {
                    Text("Lose Weight").tag("lose")
                    Text("Maintain Weight").tag("maintain")
                    Text("Gain Weight").tag("gain")
                    Text("Just Track").tag("track")
                }

                HStack {
                    Text("Target weight")
                    Spacer()
                    TextField("0", text: $targetWeightString)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 120)
                    Text(weightUnit)
                        .foregroundStyle(.secondary)
                }

                Picker("Pace", selection: $selectedPace) {
                    Text("Easy").tag("easy")
                    Text("Steady").tag("steady")
                    Text("Aggressive").tag("aggressive")
                }

                Picker("Activity Level", selection: $activityLevel) {
                    Text("Sedentary").tag("sedentary")
                    Text("Light").tag("light")
                    Text("Moderate").tag("moderate")
                    Text("Active").tag("active")
                    Text("Very Active").tag("very_active")
                }

                HStack {
                    Text("Daily calories")
                    Spacer()
                    TextField("0", text: $dailyKcalString)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 120)
                    Text("kcal")
                        .foregroundStyle(.secondary)
                }

                HStack {
                    Text("Protein")
                    Spacer()
                    TextField("0", text: $proteinString)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 120)
                    Text("g")
                        .foregroundStyle(.secondary)
                }

                HStack {
                    Text("Carbs")
                    Spacer()
                    TextField("0", text: $carbString)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 120)
                    Text("g")
                        .foregroundStyle(.secondary)
                }

                HStack {
                    Text("Fat")
                    Spacer()
                    TextField("0", text: $fatString)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 120)
                    Text("g")
                        .foregroundStyle(.secondary)
                }

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

                Button {
                    updateGoal()
                } label: {
                    HStack {
                        Spacer()
                        if isSaving {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Update Calorie/Macro Goals")
                        }
                        Spacer()
                    }
                }
                .disabled(isSaving)
            }

            if !goalHistory.isEmpty {
                Section {
                    ForEach(goalHistory.sorted {
                        ($0.activatedAt ?? .distantPast) > ($1.activatedAt ?? .distantPast)
                    }) { goal in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(goal.intent?.capitalized ?? "Track")
                                    .fontWeight(.medium)
                                Spacer()
                                if goal.supersededAt == nil {
                                    Text("Active")
                                        .font(.caption2)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 2)
                                        .background(Color.green.opacity(0.2))
                                        .foregroundStyle(.green)
                                        .clipShape(Capsule())
                                }
                                Text("\(goal.dailyKcal) kcal")
                                    .foregroundStyle(.orange)
                                    .fontWeight(.semibold)
                            }

                            if let activatedAt = goal.activatedAt {
                                Text(Self.dateFormatter.string(from: activatedAt))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            if let pace = goal.pace {
                                Text("Pace: \(pace.capitalized)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Text("P: \(goal.proteinG ?? 0)g  C: \(goal.carbG ?? 0)g  F: \(goal.fatG ?? 0)g")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                } header: {
                    Text("Goals History")
                } footer: {
                    Text("Each time you update your goals, your previous targets are saved here.")
                }
            }
        }
        .navigationTitle("Goals & Targets")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            Task {
                await loadHistory()
            }
        }
    }

    private func loadHistory() async {
        do {
            let history = try await appState.supabaseManager.fetchGoalHistory()
            await MainActor.run {
                self.goalHistory = history
                if let active = history.first(where: { $0.supersededAt == nil }) {
                    selectedIntent = active.intent ?? "maintain"
                    targetWeightString = active.targetWeightKg.map {
                        String(format: "%.1f", AppUnits.weightFromKg($0, unit: weightUnit))
                    } ?? ""
                    selectedPace = active.pace ?? "steady"
                    activityLevel = active.activityLevel
                        ?? appState.supabaseManager.currentProfile?.activityLevel
                        ?? "sedentary"
                    dailyKcalString = String(active.dailyKcal)
                    proteinString = active.proteinG.map { String($0) } ?? ""
                    carbString = active.carbG.map { String($0) } ?? ""
                    fatString = active.fatG.map { String($0) } ?? ""
                }
            }
        } catch {
            print("Failed to load goals history: \(error)")
        }
    }

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

    private func updateGoal() {
        guard let userId = appState.supabaseManager.currentUserId else { return }
        isSaving = true
        errorMessage = nil
        successMessage = nil

        let targetWeight = Double(targetWeightString).map {
            AppUnits.weightToKg($0, unit: weightUnit)
        }
        let dailyKcal = Int(dailyKcalString) ?? 2000
        let protein = Int(proteinString)
        let carb = Int(carbString)
        let fat = Int(fatString)

        let goal = Goal(
            id: UUID(),
            userId: userId,
            intent: selectedIntent,
            targetWeightKg: targetWeight,
            pace: selectedPace,
            dailyKcal: dailyKcal,
            proteinG: protein,
            carbG: carb,
            fatG: fat,
            activatedAt: Date(),
            supersededAt: nil,
            activityLevel: activityLevel
        )

        Task {
            do {
                try await appState.supabaseManager.createGoal(goal)
                await loadHistory()
                await MainActor.run {
                    isSaving = false
                    successMessage = "Goals updated successfully!"
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = "Failed to update goals: \(error.localizedDescription)"
                }
            }
        }
    }
}
