import SwiftUI

// MARK: - History Detail Sheet View
struct HistoryDetailView: View {
    var date: Date
    var timezone: String
    var meals: [Meal]
    var waterLogs: [WaterLog]
    var goalKcal: Double

    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Day summary card
                    HealthCard {
                        let actualKcal = meals.reduce(0.0) { $0 + $1.totalKcal }
                        let progress = goalKcal > 0 ? actualKcal / goalKcal : 0.0

                        HStack {
                            Spacer()
                            CalorieRing(progress: progress, actual: actualKcal, goal: goalKcal)
                            Spacer()
                        }
                        .padding(.vertical, 4)

                        let totalWater = waterLogs.reduce(0) { $0 + $1.amountMl }
                        let volumeUnit = appState.supabaseManager.currentProfile?.unitsVolume ?? "ml"
                        CategoryTile(
                            symbol: "drop.fill",
                            tint: AppPalette.water,
                            value: AppUnits.formatVolume(ml: totalWater, unit: volumeUnit),
                            label: "water logged"
                        )
                    }

                    // Meals list
                    HealthCard {
                        Text("Logged Meals")
                            .font(.headline)
                            .fontWeight(.bold)

                        if meals.isEmpty {
                            Text("No meals logged on this day.")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding(.vertical, 20)
                        } else {
                            ForEach(meals) { meal in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Text(meal.mealType?.capitalized ?? "Meal")
                                            .fontWeight(.semibold)
                                        Spacer()
                                        Text("\(Int(meal.totalKcal)) kcal")
                                            .foregroundStyle(.orange)
                                            .fontWeight(.bold)
                                    }

                                    if let notes = meal.voiceTranscript ?? meal.photoPath {
                                        Text(notes)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }

                                    Text("P: \(Int(meal.totalProteinG ?? 0))g  C: \(Int(meal.totalCarbG ?? 0))g  F: \(Int(meal.totalFatG ?? 0))g")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .padding(.vertical, 4)

                                if meal.id != meals.last?.id {
                                    Divider()
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(formattedDate)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeZone = TimeZone(identifier: timezone) ?? TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }
}

// MARK: - History View
struct HistoryView: View {
    @Environment(AppState.self) private var appState

    @State private var selectedDate: Date = Date()
    @State private var showingDetailSheet: Bool = false
    @State private var detailDate: Date = Date()

    @State private var monthlyMeals: [Meal] = []
    @State private var monthlyWater: [WaterLog] = []
    @State private var activeGoal: Goal? = nil
    @State private var isLoading: Bool = true

    private let calendar = Calendar.current
    private let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

    private var timezone: String {
        appState.supabaseManager.currentProfile?.timezone ?? "America/Los_Angeles"
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
                            HealthCard {
                                // Month Selector
                                HStack {
                                    Button {
                                        changeMonth(by: -1)
                                    } label: {
                                        Image(systemName: "chevron.left")
                                            .font(.title3)
                                    }

                                    Spacer()

                                    Text(monthYearString)
                                        .font(.headline)
                                        .fontWeight(.bold)

                                    Spacer()

                                    Button {
                                        changeMonth(by: 1)
                                    } label: {
                                        Image(systemName: "chevron.right")
                                            .font(.title3)
                                    }
                                }

                                // Grid Weekdays Header
                                HStack(spacing: 0) {
                                    ForEach(weekdays, id: \.self) { day in
                                        Text(day)
                                            .font(.caption)
                                            .fontWeight(.bold)
                                            .foregroundStyle(.secondary)
                                            .frame(maxWidth: .infinity)
                                    }
                                }

                                // Month Days Grid
                                let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
                                let days = getDaysInMonth()

                                LazyVGrid(columns: columns, spacing: 12) {
                                    ForEach(0..<days.count, id: \.self) { index in
                                        if let date = days[index] {
                                            let hasMeals = !mealsForDate(date).isEmpty
                                            let hasWater = !waterForDate(date).isEmpty

                                            Button {
                                                detailDate = date
                                                showingDetailSheet = true
                                            } label: {
                                                VStack(spacing: 4) {
                                                    Text("\(calendar.component(.day, from: date))")
                                                        .font(.system(size: 16, weight: .semibold))
                                                        .foregroundStyle(isToday(date) ? Color.white : Color.primary)
                                                        .padding(8)
                                                        .background(isToday(date) ? Color.orange : Color.clear)
                                                        .clipShape(Circle())

                                                    HStack(spacing: 4) {
                                                        if hasMeals {
                                                            Circle()
                                                                .fill(Color.orange)
                                                                .frame(width: 6, height: 6)
                                                        }
                                                        if hasWater {
                                                            Circle()
                                                                .fill(Color.blue)
                                                                .frame(width: 6, height: 6)
                                                        }
                                                    }
                                                    .frame(height: 6)
                                                }
                                                .frame(maxWidth: .infinity)
                                                .frame(height: 55)
                                            }
                                        } else {
                                            Color.clear
                                                .frame(height: 55)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal)
                        .padding(.vertical)
                    }
                }
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("History")
            .task {
                await loadMonthData()
            }
            .sheet(isPresented: $showingDetailSheet) {
                HistoryDetailView(
                    date: detailDate,
                    timezone: timezone,
                    meals: mealsForDate(detailDate),
                    waterLogs: waterForDate(detailDate),
                    goalKcal: Double(activeGoal?.dailyKcal ?? 2000)
                )
            }
        }
    }

    private var monthYearString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        formatter.timeZone = TimeZone(identifier: timezone) ?? TimeZone(secondsFromGMT: 0)
        return formatter.string(from: selectedDate)
    }

    private func changeMonth(by amount: Int) {
        if let newDate = calendar.date(byAdding: .month, value: amount, to: selectedDate) {
            selectedDate = newDate
            isLoading = true
            Task {
                await loadMonthData()
            }
        }
    }

    private func getDaysInMonth() -> [Date?] {
        guard let monthRange = calendar.range(of: .day, in: .month, for: selectedDate),
              let firstOfMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: selectedDate)) else {
            return []
        }

        let firstWeekday = calendar.component(.weekday, from: firstOfMonth)
        var days: [Date?] = Array(repeating: nil, count: firstWeekday - 1)

        for day in 1...monthRange.count {
            if let date = calendar.date(byAdding: .day, value: day - 1, to: firstOfMonth) {
                days.append(date)
            }
        }
        return days
    }

    private func isToday(_ date: Date) -> Bool {
        return calendar.isDateInToday(date)
    }

    private func mealsForDate(_ date: Date) -> [Meal] {
        let dateStr = DateUtils.toUserDate(ts: date, timezone: timezone)
        return monthlyMeals.filter { DateUtils.toUserDate(ts: $0.consumedAt, timezone: timezone) == dateStr }
    }

    private func waterForDate(_ date: Date) -> [WaterLog] {
        let dateStr = DateUtils.toUserDate(ts: date, timezone: timezone)
        return monthlyWater.filter { DateUtils.toUserDate(ts: $0.loggedAt, timezone: timezone) == dateStr }
    }

    private func loadMonthData() async {
        let days = getDaysInMonth().compactMap { $0 }
        guard let start = days.first, let end = days.last else {
            await MainActor.run {
                self.isLoading = false
            }
            return
        }

        let startRange = DateUtils.userDayRangeUtc(timezone: timezone, dateIso: DateUtils.toUserDate(ts: start, timezone: timezone))
        let endRange = DateUtils.userDayRangeUtc(timezone: timezone, dateIso: DateUtils.toUserDate(ts: end, timezone: timezone))

        do {
            let fetchedMeals = try await appState.supabaseManager.fetchMeals(start: startRange.start, end: endRange.end)
            let fetchedWater = try await appState.supabaseManager.fetchWaterLogs(start: startRange.start, end: endRange.end)
            let fetchedGoal = try await appState.supabaseManager.fetchActiveGoal()

            await MainActor.run {
                self.monthlyMeals = fetchedMeals
                self.monthlyWater = fetchedWater
                self.activeGoal = fetchedGoal
                self.isLoading = false
            }
        } catch {
            print("Failed to load history data: \(error)")
            await MainActor.run {
                self.isLoading = false
            }
        }
    }
}
