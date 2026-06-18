import SwiftUI
import Supabase

@Observable
class AppState {
    let supabaseManager: SupabaseManager
    var isLoggedIn: Bool = false
    var isLoading: Bool = true
    
    init() {
        let client = SupabaseClient(
            supabaseURL: Config.supabaseURL,
            supabaseKey: Config.supabaseAnonKey
        )
        self.supabaseManager = SupabaseManager(supabase: client)
    }
    
    func checkAuth() async {
        let active = await supabaseManager.checkSession()
        await MainActor.run {
            self.isLoggedIn = active
            self.isLoading = false
        }
    }
}

struct RootView: View {
    @Environment(AppState.self) private var appState
    
    var body: some View {
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
