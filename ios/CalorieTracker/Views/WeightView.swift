import SwiftUI
import Charts

struct WeightRecord: Hashable {
    let date: Date
    let value: Double
    let label: String
}

struct AddWeightView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    @State private var weightString: String = ""
    @State private var selectedUnit: String = "lb"
    @State private var date: Date = Date()
    @State private var isSaving: Bool = false
    @State private var errorMessage: String? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section("Log Entry") {
                    HStack {
                        TextField("Weight", text: $weightString)
                            .keyboardType(.decimalPad)

                        Picker("Unit", selection: $selectedUnit) {
                            Text("lb").tag("lb")
                            Text("kg").tag("kg")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 120)
                    }

                    DatePicker("Date", selection: $date, displayedComponents: .date)
                }

                if let errorMessage = errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Add Weight")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveWeight()
                    }
                    .disabled(weightString.isEmpty || isSaving)
                }
            }
            .onAppear {
                // Preset unit from profile settings if available
                if let profileUnit = appState.supabaseManager.currentProfile?.unitsWeight {
                    selectedUnit = profileUnit
                }
            }
        }
    }

    private func saveWeight() {
        guard let userId = appState.supabaseManager.currentUserId,
              let enteredVal = Double(weightString) else { return }

        isSaving = true
        errorMessage = nil

        // Convert to kg if entered in lb
        let weightKg: Double
        if selectedUnit == "lb" {
            weightKg = enteredVal / 2.20462
        } else {
            weightKg = enteredVal
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)

        let record = Weight(
            id: UUID(),
            userId: userId,
            recordedOn: dateString,
            weightKg: weightKg,
            createdAt: Date()
        )

        Task {
            do {
                try await appState.supabaseManager.upsertWeight(record)
                if appState.healthConnected { await appState.healthKit.writeWeight(kg: weightKg, date: date) }
                await MainActor.run {
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = "Failed to save: \(error.localizedDescription)"
                }
            }
        }
    }
}

struct WeightView: View {
    @Environment(AppState.self) private var appState

    @State private var weights: [Weight] = []
    @State private var activeGoal: Goal? = nil
    @State private var isLoading: Bool = true
    @State private var showingAddModal: Bool = false
    @State private var selectedRange: Int = 30 // 30, 90, 365, 0 (all)

    private var chartRecords: [WeightRecord] {
        let filtered = filterWeights()
        return calculateMovingAverage(weights: filtered)
    }

    var body: some View {
        NavigationStack {
            VStack {
                if isLoading {
                    ProgressView()
                        .padding(.top, 40)
                } else {
                    ScrollView {
                        VStack(spacing: 16) {
                            // Time range picker
                            Picker("Time Range", selection: $selectedRange) {
                                Text("30d").tag(30)
                                Text("90d").tag(90)
                                Text("1y").tag(365)
                                Text("All").tag(0)
                            }
                            .pickerStyle(.segmented)
                            .padding(.horizontal)
                            .padding(.top)

                            // Current weight summary card
                            if !weights.isEmpty {
                                HealthCard {
                                    let latest = weights.sorted { $0.recordedOn < $1.recordedOn }.last?.weightKg ?? 0
                                    let latestDisplay = formatWeight(latest)
                                    CategoryTile(
                                        symbol: "scalemass.fill",
                                        tint: AppPalette.weight,
                                        value: latestDisplay,
                                        label: "current weight"
                                    )
                                }
                                .padding(.horizontal)
                            }

                            // Chart card
                            HealthCard {
                                if chartRecords.isEmpty {
                                    Text("No weight records logged in this range.")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                        .frame(maxWidth: .infinity, alignment: .center)
                                        .frame(height: 220)
                                } else {
                                    Chart {
                                        ForEach(chartRecords, id: \.self) { record in
                                            LineMark(
                                                x: .value("Date", record.date),
                                                y: .value("Weight", record.value)
                                            )
                                            .foregroundStyle(by: .value("Series", record.label))
                                            .interpolationMethod(.catmullRom)
                                        }

                                        if let target = activeGoal?.targetWeightKg {
                                            RuleMark(
                                                y: .value("Goal", target)
                                            )
                                            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4]))
                                            .foregroundStyle(.green)
                                            .annotation(position: .top, alignment: .trailing) {
                                                Text("Goal: \(formatWeight(target))")
                                                    .font(.caption)
                                                    .fontWeight(.medium)
                                                    .foregroundStyle(.green)
                                            }
                                        }
                                    }
                                    .chartForegroundStyleScale([
                                        "Actual": Color.orange,
                                        "7-day Avg": Color.blue
                                    ])
                                    .frame(height: 220)
                                }
                            }
                            .padding(.horizontal)

                            // Add Weight button
                            Button {
                                showingAddModal = true
                            } label: {
                                HStack {
                                    Image(systemName: "plus.circle.fill")
                                    Text("Add Weight")
                                }
                                .fontWeight(.semibold)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(AppPalette.calorie)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .padding(.horizontal)
                            }
                            .padding(.bottom, 8)
                        }
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Weight Trends")
            .sheet(isPresented: $showingAddModal, onDismiss: {
                isLoading = true
                Task {
                    await loadWeightData()
                }
            }) {
                AddWeightView()
                    .presentationDetents([.medium])
            }
            .task {
                await loadWeightData()
            }
        }
    }

    private func formatWeight(_ kg: Double) -> String {
        return AppUnits.formatWeight(kg: kg, unit: appState.supabaseManager.currentProfile?.unitsWeight ?? "lb")
    }

    private func filterWeights() -> [Weight] {
        if selectedRange == 0 { return weights }

        let calendar = Calendar.current
        guard let cutoffDate = calendar.date(byAdding: .day, value: -selectedRange, to: Date()) else { return weights }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        return weights.filter { record in
            guard let date = formatter.date(from: record.recordedOn) else { return false }
            return date >= cutoffDate
        }
    }

    private func calculateMovingAverage(weights: [Weight]) -> [WeightRecord] {
        let sorted = weights.sorted { $0.recordedOn < $1.recordedOn }
        var result: [WeightRecord] = []

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"

        for i in 0..<sorted.count {
            guard let currentDate = formatter.date(from: sorted[i].recordedOn) else { continue }
            let currentWeightVal = sorted[i].weightKg

            var sum = 0.0
            var count = 0
            for j in max(0, i-6)...i {
                sum += sorted[j].weightKg
                count += 1
            }
            let avg = sum / Double(count)

            result.append(WeightRecord(date: currentDate, value: currentWeightVal, label: "Actual"))
            result.append(WeightRecord(date: currentDate, value: avg, label: "7-day Avg"))
        }
        return result
    }

    private func loadWeightData() async {
        do {
            // Fetch records from past 3 years to cover history
            let calendar = Calendar.current
            let pastDate = calendar.date(byAdding: .year, value: -3, to: Date()) ?? Date()

            let fetchedWeights = try await appState.supabaseManager.fetchWeights(since: pastDate)
            let fetchedGoal = try await appState.supabaseManager.fetchActiveGoal()

            await MainActor.run {
                self.weights = fetchedWeights
                self.activeGoal = fetchedGoal
                self.isLoading = false
            }
        } catch {
            print("Failed to load weight records: \(error)")
            await MainActor.run {
                self.isLoading = false
            }
        }
    }
}
