import SwiftUI

struct UnitsView: View {
    @Environment(AppState.self) private var appState

    @State private var selectedWeightUnit: String = "lb"
    @State private var selectedHeightUnit: String = "ft"
    @State private var selectedVolumeUnit: String = "ml"
    @State private var waterGoal: String = "2000"

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

            Section {
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
                .onChange(of: selectedVolumeUnit) { oldUnit, newUnit in
                    // Recompute displayed value from the stored profile ml so we
                    // don't accumulate rounding errors across multiple toggles.
                    let storedMl = appState.supabaseManager.currentProfile?.waterGoalMl ?? 2000
                    waterGoal = String(AppUnits.volumeFromMl(storedMl, unit: newUnit))
                }

                HStack {
                    Text("Water goal")
                    Spacer()
                    TextField("0", text: $waterGoal)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 120)
                    Text(selectedVolumeUnit)
                        .foregroundStyle(.secondary)
                }
            } header: {
                Text("Units & Water Goal")
            } footer: {
                Text("These set how weights, heights, and volumes are shown throughout the app.")
            }

            Section {
                Button {
                    save()
                } label: {
                    HStack {
                        Spacer()
                        if isSaving {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Save Units & Water")
                        }
                        Spacer()
                    }
                }
                .disabled(isSaving)
            }
        }
        .navigationTitle("Units & Water")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            populateForm()
        }
    }

    private func populateForm() {
        guard let profile = appState.supabaseManager.currentProfile else { return }
        selectedWeightUnit = profile.unitsWeight ?? "lb"
        selectedHeightUnit = profile.unitsHeight ?? "ft"
        selectedVolumeUnit = profile.unitsVolume ?? "ml"
        waterGoal = String(AppUnits.volumeFromMl(profile.waterGoalMl ?? 2000, unit: selectedVolumeUnit))
    }

    private func save() {
        guard let userId = appState.supabaseManager.currentUserId else { return }
        isSaving = true
        errorMessage = nil
        successMessage = nil

        // Carry forward all fields this screen does NOT edit from currentProfile,
        // so a partial upsert never clobbers displayName/sex/activity/timezone.
        let current = appState.supabaseManager.currentProfile
        let profile = Profile(
            id: userId,
            displayName: current?.displayName,
            sex: current?.sex ?? "prefer_not",
            birthYear: current?.birthYear,
            heightCm: current?.heightCm,
            unitsWeight: selectedWeightUnit,
            unitsHeight: selectedHeightUnit,
            unitsVolume: selectedVolumeUnit,
            waterGoalMl: AppUnits.volumeToMl(Double(waterGoal) ?? 2000, unit: selectedVolumeUnit),
            activityLevel: current?.activityLevel ?? "sedentary",
            timezone: current?.timezone ?? "America/Los_Angeles",
            createdAt: current?.createdAt
        )

        Task {
            do {
                try await appState.supabaseManager.upsertProfile(profile)
                let _ = try? await appState.supabaseManager.checkSession()
                await MainActor.run {
                    isSaving = false
                    successMessage = "Profile updated successfully!"
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = "Failed to update profile: \(error.localizedDescription)"
                }
            }
        }
    }
}
