import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState
    
    // Profile form state
    @State private var displayName: String = ""
    @State private var selectedSex: String = "prefer_not"
    @State private var selectedWeightUnit: String = "lb"
    @State private var selectedHeightUnit: String = "ft"
    @State private var selectedVolumeUnit: String = "ml"
    @State private var waterGoal: String = "2000"
    @State private var activityLevel: String = "sedentary"
    @State private var timezoneString: String = "America/Los_Angeles"
    
    // New Goal form state
    @State private var selectedIntent: String = "maintain"
    @State private var targetWeightString: String = ""
    @State private var selectedPace: String = "steady"
    @State private var dailyKcalString: String = "2000"
    @State private var proteinString: String = "150"
    @State private var carbString: String = "200"
    @State private var fatString: String = "67"
    
    @State private var goalHistory: [Goal] = []
    @State private var isSavingProfile: Bool = false
    @State private var isSavingGoal: Bool = false
    @State private var errorMessage: String? = nil
    @State private var successMessage: String? = nil
    
    var body: some View {
        NavigationStack {
            Form {
                if let errorMessage = errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }
                
                if let successMessage = successMessage {
                    Section {
                        Text(successMessage)
                            .foregroundStyle(.green)
                    }
                }
                
                Section("Profile Details") {
                    TextField("Display Name", text: $displayName)
                    
                    Picker("Sex", selection: $selectedSex) {
                        Text("Male").tag("male")
                        Text("Female").tag("female")
                        Text("Prefer Not").tag("prefer_not")
                    }
                    
                    Picker("Activity Level", selection: $activityLevel) {
                        Text("Sedentary").tag("sedentary")
                        Text("Light").tag("light")
                        Text("Moderate").tag("moderate")
                        Text("Active").tag("active")
                        Text("Very Active").tag("very_active")
                    }
                    
                    TextField("Timezone", text: $timezoneString)
                        .textInputAutocapitalization(.never)
                }
                
                Section("Units & Water Goal") {
                    Picker("Weight Unit", selection: $selectedWeightUnit) {
                        Text("lb").tag("lb")
                        Text("kg").tag("kg")
                    }
                    
                    Picker("Height Unit", selection: $selectedHeightUnit) {
                        Text("ft").tag("ft")
                        Text("cm").tag("cm")
                    }
                    
                    Picker("Volume Unit", selection: $selectedVolumeUnit) {
                        Text("ml").tag("ml")
                        Text("oz").tag("oz")
                    }
                    
                    TextField("Water Goal (ml)", text: $waterGoal)
                        .keyboardType(.numberPad)
                }
                
                Section {
                    Button {
                        saveProfile()
                    } label: {
                        HStack {
                            Spacer()
                            if isSavingProfile {
                                ProgressView().controlSize(.small)
                            } else {
                                Text("Save Profile Details")
                            }
                            Spacer()
                        }
                    }
                    .disabled(isSavingProfile)
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
                            if isSavingGoal {
                                ProgressView().controlSize(.small)
                            } else {
                                Text("Update Calorie/Macro Goals")
                            }
                            Spacer()
                        }
                    }
                    .disabled(isSavingGoal)
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
                
                Section {
                    Button(role: .destructive) {
                        signOut()
                    } label: {
                        HStack {
                            Spacer()
                            Text("Sign Out")
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .onAppear {
                populateForm()
                Task {
                    await loadHistory()
                }
            }
        }
    }
    
    private func populateForm() {
        if let profile = appState.supabaseManager.currentProfile {
            displayName = profile.displayName ?? ""
            selectedSex = profile.sex ?? "prefer_not"
            selectedWeightUnit = profile.unitsWeight ?? "lb"
            selectedHeightUnit = profile.unitsHeight ?? "ft"
            selectedVolumeUnit = profile.unitsVolume ?? "ml"
            waterGoal = String(profile.waterGoalMl ?? 2000)
            activityLevel = profile.activityLevel ?? "sedentary"
            timezoneString = profile.timezone ?? "America/Los_Angeles"
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
    
    private func saveProfile() {
        guard let userId = appState.supabaseManager.currentUserId else { return }
        isSavingProfile = true
        errorMessage = nil
        successMessage = nil
        
        let profile = Profile(
            id: userId,
            displayName: displayName.isEmpty ? nil : displayName,
            sex: selectedSex,
            birthYear: appState.supabaseManager.currentProfile?.birthYear,
            heightCm: appState.supabaseManager.currentProfile?.heightCm,
            unitsWeight: selectedWeightUnit,
            unitsHeight: selectedHeightUnit,
            unitsVolume: selectedVolumeUnit,
            waterGoalMl: Int(waterGoal) ?? 2000,
            activityLevel: activityLevel,
            timezone: timezoneString,
            createdAt: appState.supabaseManager.currentProfile?.createdAt
        )
        
        Task {
            do {
                try await appState.supabaseManager.upsertProfile(profile)
                let _ = try? await appState.supabaseManager.checkSession()
                await MainActor.run {
                    isSavingProfile = false
                    successMessage = "Profile updated successfully!"
                }
            } catch {
                await MainActor.run {
                    isSavingProfile = false
                    errorMessage = "Failed to update profile: \(error.localizedDescription)"
                }
            }
        }
    }
    
    private func updateGoal() {
        guard let userId = appState.supabaseManager.currentUserId else { return }
        isSavingGoal = true
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
                    isSavingGoal = false
                    successMessage = "Goals updated successfully!"
                }
            } catch {
                await MainActor.run {
                    isSavingGoal = false
                    errorMessage = "Failed to update goals: \(error.localizedDescription)"
                }
            }
        }
    }
    
    private func signOut() {
        Task {
            do {
                try await appState.supabaseManager.signOut()
                await MainActor.run {
                    appState.isLoggedIn = false
                }
            } catch {
                print("Sign out failed: \(error.localizedDescription)")
            }
        }
    }
}
