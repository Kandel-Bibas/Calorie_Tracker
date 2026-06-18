import SwiftUI

struct HealthSettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var connectError: String? = nil
    @State private var isConnecting = false

    private var relativeSync: String {
        guard let date = appState.lastHealthSync else { return "Never" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    var body: some View {
        Form {
            Section {
                Text("Connect Apple Health to save your meals, water, and weight, and to show active energy, steps, and weight from other apps and devices.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if appState.healthConnected {
                Section {
                    HStack {
                        Text("Status")
                        Spacer()
                        if appState.isHealthSyncing {
                            HStack(spacing: 6) {
                                ProgressView()
                                    .controlSize(.small)
                                Text("Syncing…")
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            Text("Connected")
                                .foregroundStyle(.green)
                        }
                    }

                    HStack {
                        Text("Last synced")
                        Spacer()
                        Text(relativeSync)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    Button("Sync Now") {
                        Task { await appState.syncHealth() }
                    }
                    .disabled(appState.isHealthSyncing)
                }

                Section {
                    Button("Disconnect Apple Health", role: .destructive) {
                        appState.disconnectHealth()
                    }
                } footer: {
                    Text("Calorie Tracker syncs when you open the app and about once an hour. To fully revoke access, open the Health app ▸ Sharing ▸ Apps.")
                }
            } else {
                Section {
                    Button {
                        Task {
                            isConnecting = true
                            connectError = nil
                            do {
                                try await appState.connectHealth()
                            } catch {
                                connectError = "Could not connect: \(error.localizedDescription)"
                            }
                            isConnecting = false
                        }
                    } label: {
                        HStack {
                            Label("Connect Apple Health", systemImage: "heart.fill")
                            Spacer()
                            if isConnecting { ProgressView().controlSize(.small) }
                        }
                    }
                    .disabled(isConnecting || !appState.healthKit.isAvailable)

                    if !appState.healthKit.isAvailable {
                        Text("Apple Health is not available on this device.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let error = connectError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Apple Health")
        .navigationBarTitleDisplayMode(.inline)
    }
}
