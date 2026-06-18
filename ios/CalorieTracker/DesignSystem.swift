import SwiftUI

enum AppPalette {
    static let calorie = Color.orange          // #FF9500-ish, system orange
    static let protein = Color(red: 0.89, green: 0.29, blue: 0.29)   // red
    static let carb    = Color(red: 0.22, green: 0.54, blue: 0.87)   // blue
    static let fat     = Color(red: 0.94, green: 0.62, blue: 0.15)   // amber
    static let water   = Color(red: 0.22, green: 0.54, blue: 0.87)   // blue
    static let weight  = Color(red: 0.50, green: 0.46, blue: 0.87)   // indigo
    static let activity = Color(red: 0.89, green: 0.29, blue: 0.29)  // red (move ring tone)
}

/// Grouped card surface matching Apple Health. No 1px stroke; uses secondary grouped bg.
struct HealthCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// SF Symbol in a tinted rounded square + value + label, laid out horizontally.
struct CategoryTile: View {
    let symbol: String
    let tint: Color
    let value: String
    let label: String
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 34, height: 34)
                .background(tint.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(value).font(.system(.headline, design: .rounded)).fontWeight(.semibold)
                Text(label).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// Vertical variant for 2-up metric grids.
struct StatTile: View {
    let symbol: String
    let tint: Color
    let value: String
    let label: String
    var body: some View { CategoryTile(symbol: symbol, tint: tint, value: value, label: label) }
}

struct CalorieRing: View {
    var progress: Double
    var actual: Double
    var goal: Double
    var body: some View {
        ZStack {
            Circle().stroke(Color(.systemGray5), lineWidth: 12)
            Circle()
                .trim(from: 0, to: min(progress, 1.0))
                .stroke(AppPalette.calorie, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.8), value: progress)
            VStack(spacing: 2) {
                Text("\(Int(actual))").font(.system(size: 30, weight: .bold, design: .rounded))
                Text("of \(Int(goal))").font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(width: 120, height: 120)
    }
}

struct MacroBar: View {
    var label: String
    var actual: Double
    var goal: Double
    var color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.caption).foregroundStyle(color)
                Spacer()
                Text("\(Int(actual))g").font(.caption).foregroundStyle(.secondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color(.systemGray5)).frame(height: 6)
                    Capsule().fill(color)
                        .frame(width: min(CGFloat(actual / (goal > 0 ? goal : 1)) * geo.size.width, geo.size.width), height: 6)
                        .animation(.easeOut(duration: 0.8), value: actual)
                }
            }
            .frame(height: 6)
        }
    }
}
