import SwiftUI

struct HealthSettingsView: View {
    @Environment(AppState.self) private var appState
    @State private var status: String = ""
    @State private var working = false

    var body: some View {
        Form {
            Section {
                Text("Connect Apple Health to save your meals, water, and weight, and to show active energy, steps, and weight from other apps and devices.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Section {
                Button {
                    Task {
                        working = true
                        do { try await appState.healthKit.requestAuthorization(); status = "Apple Health connected." }
                        catch { status = "Could not connect: \(error.localizedDescription)" }
                        working = false
                    }
                } label: {
                    HStack {
                        Label("Connect Apple Health", systemImage: "heart.fill")
                        Spacer()
                        if working { ProgressView().controlSize(.small) }
                    }
                }
                .disabled(working || !appState.healthKit.isAvailable)
                if !appState.healthKit.isAvailable {
                    Text("Apple Health is not available on this device.").font(.caption).foregroundStyle(.secondary)
                }
                if !status.isEmpty { Text(status).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Apple Health")
        .navigationBarTitleDisplayMode(.inline)
    }
}
