import SwiftUI
import Supabase

@Observable
class AppState {
    let supabaseManager: SupabaseManager
    let healthKit: HealthKitManaging
    var isLoggedIn: Bool = false
    var isLoading: Bool = true

    var healthConnected: Bool {
        didSet { UserDefaults.standard.set(healthConnected, forKey: "healthConnected") }
    }
    var lastHealthSync: Date? {
        didSet { UserDefaults.standard.set(lastHealthSync, forKey: "lastHealthSync") }
    }
    var isHealthSyncing: Bool = false

    init() {
        let client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabaseAnonKey
        )
        self.supabaseManager = SupabaseManager(supabase: client)
        self.healthKit = HealthKitManager()
        self.healthConnected = UserDefaults.standard.bool(forKey: "healthConnected")
        self.lastHealthSync = UserDefaults.standard.object(forKey: "lastHealthSync") as? Date
    }

    func checkAuth() async {
        let active = await supabaseManager.checkSession()
        await MainActor.run {
            self.isLoggedIn = active
            self.isLoading = false
        }
        // Sync on app open (cold launch): scenePhase becomes .active before login
        // resolves, so trigger here once we know the session is valid.
        if active { await syncHealth() }
    }

    /// Request Health authorization, mark connected, and run a first sync.
    func connectHealth() async throws {
        try await healthKit.requestAuthorization()
        await MainActor.run { self.healthConnected = true }
        await syncHealth()
    }

    /// Stop the app from reading/writing/syncing Health. Cannot revoke the system grant.
    func disconnectHealth() {
        healthConnected = false
    }

    /// Foreground/periodic sync: import external Health weights and stamp the time.
    /// No-op when not connected or Health is unavailable. Writes happen immediately on save.
    func syncHealth() async {
        guard healthConnected, healthKit.isAvailable else { return }
        await MainActor.run { self.isHealthSyncing = true }
        let since = Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date()
        let existing = (try? await supabaseManager.fetchWeights(since: since)) ?? []
        _ = await importExternalHealthWeights(existing: existing)
        await MainActor.run {
            self.lastHealthSync = Date()
            self.isHealthSyncing = false
        }
    }

    /// Import external (non-app) Health weight samples for dates not already present.
    /// `existing` is the caller's already-fetched weight list (avoids a second round-trip).
    /// Returns true if at least one new sample was imported.
    @discardableResult
    func importExternalHealthWeights(existing: [Weight]) async -> Bool {
        guard healthConnected, let userId = supabaseManager.currentUserId else { return false }
        let since = Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date()
        let samples = await healthKit.readExternalWeightSamples(since: since)
        guard !samples.isEmpty else { return false }
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
        let existingDates = Set(existing.map { $0.recordedOn })
        var imported = false
        for s in samples {
            let dateStr = fmt.string(from: s.date)
            guard HealthKitMath.shouldImportWeight(forDate: dateStr, existingDates: existingDates) else { continue }
            let rec = Weight(id: UUID(), userId: userId, recordedOn: dateStr, weightKg: s.kg, createdAt: Date())
            try? await supabaseManager.upsertWeight(rec)
            imported = true
        }
        return imported
    }
}

struct RootView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if appState.isLoading {
                VStack {
                    ProgressView()
                        .controlSize(.large)
                    Text("Loading Calorie Tracker...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.top, 8)
                }
                .task {
                    await appState.checkAuth()
                }
            } else if appState.isLoggedIn {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, appState.isLoggedIn {
                Task { await appState.syncHealth() }
            }
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3600))
                if appState.isLoggedIn { await appState.syncHealth() }
            }
        }
    }
}

@main
struct CalorieTrackerApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
        }
    }
}
