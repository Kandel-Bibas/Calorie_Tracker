import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(appState.supabaseManager.currentProfile?.displayName ?? "Your profile")
                                .font(.headline)
                            Text("Profile & details")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    NavigationLink { ProfileEditView() } label: {
                        Label("Profile", systemImage: "person.fill")
                    }
                    NavigationLink { GoalsEditView() } label: {
                        Label("Goals & Targets", systemImage: "target")
                    }
                    NavigationLink { UnitsView() } label: {
                        Label("Units & Water", systemImage: "ruler")
                    }
                    NavigationLink { HealthSettingsView() } label: {
                        Label("Apple Health", systemImage: "heart.fill")
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
