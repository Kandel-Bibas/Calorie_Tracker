import SwiftUI

struct ProfileEditView: View {
    @Environment(AppState.self) private var appState

    @State private var displayName: String = ""
    @State private var selectedSex: String = "prefer_not"
    @State private var activityLevel: String = "sedentary"
    @State private var timezoneString: String = "America/Los_Angeles"

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
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            populateForm()
        }
    }

    private func populateForm() {
        if let profile = appState.supabaseManager.currentProfile {
            displayName = profile.displayName ?? ""
            selectedSex = profile.sex ?? "prefer_not"
            activityLevel = profile.activityLevel ?? "sedentary"
            timezoneString = profile.timezone ?? "America/Los_Angeles"
        }
    }

    private func save() {
        guard let userId = appState.supabaseManager.currentUserId else { return }
        isSaving = true
        errorMessage = nil
        successMessage = nil

        // Carry forward all fields this screen does NOT edit from currentProfile,
        // so a partial upsert never clobbers units/water settings (or vice versa).
        let current = appState.supabaseManager.currentProfile
        let profile = Profile(
            id: userId,
            displayName: displayName.isEmpty ? nil : displayName,
            sex: selectedSex,
            birthYear: current?.birthYear,
            heightCm: current?.heightCm,
            unitsWeight: current?.unitsWeight ?? "lb",
            unitsHeight: current?.unitsHeight ?? "ft",
            unitsVolume: current?.unitsVolume ?? "ml",
            waterGoalMl: current?.waterGoalMl ?? 2000,
            activityLevel: activityLevel,
            timezone: timezoneString,
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
