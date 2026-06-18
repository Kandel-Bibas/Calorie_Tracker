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
                    save()
                } label: {
                    HStack {
                        Spacer()
                        if isSaving {
                            ProgressView().controlSize(.small)
                        } else {
                            Text("Save Profile Details")
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
        if let profile = appState.supabaseManager.currentProfile {
            selectedWeightUnit = profile.unitsWeight ?? "lb"
            selectedHeightUnit = profile.unitsHeight ?? "ft"
            selectedVolumeUnit = profile.unitsVolume ?? "ml"
            waterGoal = String(profile.waterGoalMl ?? 2000)
        }
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
            waterGoalMl: Int(waterGoal) ?? 2000,
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
