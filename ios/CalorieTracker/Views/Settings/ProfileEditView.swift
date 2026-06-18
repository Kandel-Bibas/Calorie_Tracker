import SwiftUI

struct ProfileEditView: View {
    @Environment(AppState.self) private var appState

    @State private var displayName: String = ""
    @State private var selectedSex: String = "prefer_not"
    @State private var timezoneString: String = "America/Los_Angeles"

    // Height
    @State private var heightUnit: String = "ft"
    @State private var heightCmString: String = ""
    @State private var heightFtString: String = ""
    @State private var heightInString: String = ""

    // Year of birth
    @State private var birthYearString: String = ""

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

                TextField("Timezone", text: $timezoneString)
                    .textInputAutocapitalization(.never)

                // Height entry — switches on the user's chosen height unit
                if heightUnit == "cm" {
                    HStack {
                        Text("Height")
                        Spacer()
                        TextField("0", text: $heightCmString)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 120)
                        Text("cm")
                            .foregroundStyle(.secondary)
                    }
                } else {
                    HStack {
                        Text("Height")
                        Spacer()
                        TextField("0", text: $heightFtString)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 60)
                        Text("ft")
                            .foregroundStyle(.secondary)
                        TextField("0", text: $heightInString)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 60)
                        Text("in")
                            .foregroundStyle(.secondary)
                    }
                }

                HStack {
                    Text("Year of birth")
                    Spacer()
                    TextField("e.g. 1990", text: $birthYearString)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 120)
                }
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
        guard let profile = appState.supabaseManager.currentProfile else { return }

        displayName = profile.displayName ?? ""
        selectedSex = profile.sex ?? "prefer_not"
        timezoneString = profile.timezone ?? "America/Los_Angeles"
        heightUnit = profile.unitsHeight ?? "ft"
        birthYearString = profile.birthYear.map { String($0) } ?? ""

        if let cm = profile.heightCm {
            if heightUnit == "ft" {
                let ftIn = AppUnits.cmToFtIn(Double(cm))
                heightFtString = String(ftIn.ft)
                heightInString = String(ftIn.inch)
            } else {
                heightCmString = String(cm)
            }
        }
    }

    private func save() {
        guard let userId = appState.supabaseManager.currentUserId else { return }
        isSaving = true
        errorMessage = nil
        successMessage = nil

        // Compute height in cm from whichever unit fields are active
        let computedHeightCm: Int?
        if heightUnit == "cm" {
            computedHeightCm = Int(heightCmString)
        } else {
            let ft = Int(heightFtString) ?? 0
            let inch = Int(heightInString) ?? 0
            if ft == 0 && inch == 0 {
                computedHeightCm = nil
            } else {
                computedHeightCm = Int(AppUnits.ftInToCm(ft: ft, inch: inch).rounded())
            }
        }

        let computedBirthYear = Int(birthYearString)

        // Carry forward all fields this screen does NOT edit from currentProfile,
        // so a partial upsert never clobbers units/water settings (or vice versa).
        let current = appState.supabaseManager.currentProfile
        let profile = Profile(
            id: userId,
            displayName: displayName.isEmpty ? nil : displayName,
            sex: selectedSex,
            birthYear: computedBirthYear,
            heightCm: computedHeightCm,
            unitsWeight: current?.unitsWeight ?? "lb",
            unitsHeight: current?.unitsHeight ?? "ft",
            unitsVolume: current?.unitsVolume ?? "ml",
            waterGoalMl: current?.waterGoalMl ?? 2000,
            activityLevel: current?.activityLevel,
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
