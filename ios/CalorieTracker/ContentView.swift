import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "flame.fill")
                    .imageScale(.large)
                    .foregroundStyle(.orange)
                    .font(.system(size: 60))
                
                Text("Calorie Tracker")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Welcome to your iOS 18 Calorie Tracker client.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .padding()
            .navigationTitle("Dashboard")
        }
    }
}

#Preview {
    ContentView()
        .environment(AppState())
}
