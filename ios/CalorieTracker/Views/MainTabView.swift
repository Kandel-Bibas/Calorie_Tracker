import SwiftUI

struct MainTabView: View {
    @State private var selectedTab: Int = 0
    @State private var showingLogSheet: Bool = false

    var body: some View {
        TabView(selection: $selectedTab) {
            TodayView(onLog: { showingLogSheet = true })
                .tabItem { Label("Today", systemImage: "clock.fill") }
                .tag(0)
            HistoryView()
                .tabItem { Label("History", systemImage: "calendar") }
                .tag(1)
            WeightView()
                .tabItem { Label("Weight", systemImage: "chart.line.uptrend.xyaxis") }
                .tag(2)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "person.fill") }
                .tag(3)
        }
        .tint(.orange)
        .sheet(isPresented: $showingLogSheet) { LogView() }
    }
}

#Preview {
    MainTabView().environment(AppState())
}
