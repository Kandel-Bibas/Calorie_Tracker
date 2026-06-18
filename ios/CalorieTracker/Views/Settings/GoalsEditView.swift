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

    @State private var goalHistory: [Goal] = []
    @State private var isSaving: Bool = false
    @State private var errorMessage: String? = nil
    @State private var successMessage: String? = nil

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

                TextField("Target Weight (kg)", text: $targetWeightString)
                    .keyboardType(.decimalPad)

                Picker("Pace", selection: $selectedPace) {
                    Text("Easy").tag("easy")
                    Text("Steady").tag("steady")
                    Text("Aggressive").tag("aggressive")
                }

                TextField("Daily Calories Goal (kcal)", text: $dailyKcalString)
                    .keyboardType(.numberPad)

                TextField("Protein Goal (g)", text: $proteinString)
                    .keyboardType(.numberPad)

                TextField("Carbs Goal (g)", text: $carbString)
                    .keyboardType(.numberPad)

                TextField("Fat Goal (g)", text: $fatString)
                    .keyboardType(.numberPad)

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
                Section("Goals History") {
                    ForEach(goalHistory) { goal in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(goal.intent?.capitalized ?? "Track")
                                    .fontWeight(.medium)
                                Spacer()
                                Text("\(goal.dailyKcal) kcal")
                                    .foregroundStyle(.orange)
                                    .fontWeight(.semibold)
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
                    targetWeightString = active.targetWeightKg.map { String($0) } ?? ""
                    selectedPace = active.pace ?? "steady"
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

    private func updateGoal() {
        guard let userId = appState.supabaseManager.currentUserId else { return }
        isSaving = true
        errorMessage = nil
        successMessage = nil

        let targetWeight = Double(targetWeightString)
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
            supersededAt: nil
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
