import SwiftUI

struct MainTabView: View {
    @State private var selectedTab: Int = 0
    @State private var showingLogSheet: Bool = false
    
    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $selectedTab) {
                TodayView()
                    .tabItem {
                        Label("Today", systemImage: "clock.fill")
                    }
                    .tag(0)
                
                HistoryView()
                    .tabItem {
                        Label("History", systemImage: "calendar")
                    }
                    .tag(1)
                
                // Placeholder view for the center button
                Color.clear
                    .tabItem {
                        Image(systemName: "plus.circle.fill")
                            .renderingMode(.template)
                        Text("Log")
                    }
                    .tag(2)
                
                WeightView()
                    .tabItem {
                        Label("Weight", systemImage: "chart.line.uptrend.xyaxis")
                    }
                    .tag(3)
                
                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "person.fill")
                    }
                    .tag(4)
            }
            .tint(.orange)
            
            // Custom raised center log button
            Button {
                showingLogSheet = true
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(14)
                    .background(Color.orange)
                    .clipShape(Circle())
                    .shadow(color: Color.black.opacity(0.15), radius: 4, x: 0, y: 3)
            }
            .offset(y: -5)
        }
        .sheet(isPresented: $showingLogSheet) {
            LogView()
        }
        .onChange(of: selectedTab) { oldValue, newValue in
            if newValue == 2 {
                selectedTab = oldValue // Revert tab change
                showingLogSheet = true
            }
        }
    }
}

#Preview {
    MainTabView()
        .environment(AppState())
}
