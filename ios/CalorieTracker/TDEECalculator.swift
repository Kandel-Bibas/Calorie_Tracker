import Foundation

struct TDEECalculator {

    struct Input {
        let sex: String?
        let currentWeightKg: Double
        let heightCm: Int
        let age: Int
        let activityLevel: String
        let intent: String
        let pace: String
    }

    struct Output {
        let dailyKcal: Int
        let proteinG: Int
        let carbG: Int
        let fatG: Int
    }

    /// Returns nil when required body stats are absent (heightCm == 0, age <= 0, weight <= 0).
    /// All string fields must be lowercase: sex "male"/"female", activityLevel "sedentary"/"light"/"moderate"/"active"/"very_active", intent "lose"/"gain"/"maintain"/"track", pace "easy"/"steady"/"aggressive". Wrong casing silently falls to defaults.
    static func calculate(_ input: Input) -> Output? {
        guard input.heightCm > 0, input.age > 0, input.currentWeightKg > 0 else { return nil }

        let W = input.currentWeightKg
        let H = Double(input.heightCm)
        let A = Double(input.age)

        let bmr: Double = input.sex == "male"
            ? 10 * W + 6.25 * H - 5 * A + 5
            : 10 * W + 6.25 * H - 5 * A - 161

        let multiplier: Double
        switch input.activityLevel {
        case "light":       multiplier = 1.375
        case "moderate":    multiplier = 1.55
        case "active":      multiplier = 1.725
        case "very_active": multiplier = 1.9
        default:            multiplier = 1.2
        }

        let tdee = bmr * multiplier

        let delta: Double
        switch (input.intent, input.pace) {
        case ("lose", "easy"):        delta = -250
        case ("lose", "steady"):      delta = -500
        case ("lose", "aggressive"):  delta = -750
        case ("gain", "easy"):        delta = +250
        case ("gain", "steady"):      delta = +500
        case ("gain", "aggressive"):  delta = +750
        default:                      delta = 0
        }

        let targetKcal = max(1200.0, tdee + delta)

        let proteinG = max(Int(1.6 * W), Int(targetKcal * 0.25 / 4))
        let fatG     = Int(targetKcal * 0.25 / 9)
        let carbG    = max(0, Int((targetKcal - Double(proteinG) * 4 - Double(fatG) * 9) / 4))

        return Output(dailyKcal: Int(targetKcal), proteinG: proteinG, carbG: carbG, fatG: fatG)
    }
}
