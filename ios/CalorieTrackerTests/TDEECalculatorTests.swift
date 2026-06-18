import XCTest
@testable import CalorieTracker

final class TDEECalculatorTests: XCTestCase {

    // male, 80 kg, 180 cm, age 36, sedentary, maintain
    // BMR = 10×80 + 6.25×180 − 5×36 + 5 = 1750
    // TDEE = 1750 × 1.2 = 2100
    func testMaleSedentaryMaintain() {
        let input = TDEECalculator.Input(
            sex: "male", currentWeightKg: 80, heightCm: 180, age: 36,
            activityLevel: "sedentary", intent: "maintain", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        XCTAssertEqual(result.dailyKcal, 2100)
    }

    // female, 60 kg, 165 cm, age 31, sedentary, maintain
    // BMR = 10×60 + 6.25×165 − 5×31 − 161 = 1315.25
    // TDEE = 1315.25 × 1.2 = 1578.3 → 1578
    func testFemaleSedentaryMaintain() {
        let input = TDEECalculator.Input(
            sex: "female", currentWeightKg: 60, heightCm: 165, age: 31,
            activityLevel: "sedentary", intent: "maintain", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        XCTAssertEqual(result.dailyKcal, 1578)
    }

    // same female, moderate → TDEE = 1315.25 × 1.55 = 2038.6375 → 2038
    func testFemaleModerate() {
        let input = TDEECalculator.Input(
            sex: "female", currentWeightKg: 60, heightCm: 165, age: 31,
            activityLevel: "moderate", intent: "maintain", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        XCTAssertEqual(result.dailyKcal, 2038)
    }

    // same female, moderate, lose/steady → 2038.6375 − 500 = 1538.6375 → 1538
    func testLoseWeightSteady() {
        let input = TDEECalculator.Input(
            sex: "female", currentWeightKg: 60, heightCm: 165, age: 31,
            activityLevel: "moderate", intent: "lose", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        XCTAssertEqual(result.dailyKcal, 1538)
    }

    // female, 45 kg, 155 cm, age 26, sedentary, lose/aggressive
    // BMR = 10×45 + 6.25×155 − 5×26 − 161 = 1127.75
    // TDEE = 1127.75 × 1.2 = 1353.3 → target = 1353.3 − 750 = 603.3 → floor 1200
    func testKcalFloor() {
        let input = TDEECalculator.Input(
            sex: "female", currentWeightKg: 45, heightCm: 155, age: 26,
            activityLevel: "sedentary", intent: "lose", pace: "aggressive")
        let result = TDEECalculator.calculate(input)!
        XCTAssertGreaterThanOrEqual(result.dailyKcal, 1200)
        XCTAssertEqual(result.dailyKcal, 1200)
    }

    // male, 80 kg, 180 cm, age 36, moderate, maintain
    // TDEE = 1750 × 1.55 = 2712.5 → proteinG=169, fatG=75, carbG=340
    // macroKcal = 169×4 + 340×4 + 75×9 = 2711 (within 10% of 2712)
    func testMacroKcalCloseness() {
        let input = TDEECalculator.Input(
            sex: "male", currentWeightKg: 80, heightCm: 180, age: 36,
            activityLevel: "moderate", intent: "maintain", pace: "steady")
        let result = TDEECalculator.calculate(input)!
        let macroKcal = result.proteinG * 4 + result.carbG * 4 + result.fatG * 9
        let tolerance = Int(Double(result.dailyKcal) * 0.10)
        XCTAssertEqual(macroKcal, result.dailyKcal, accuracy: tolerance)
    }

    func testMissingHeightReturnsNil() {
        let input = TDEECalculator.Input(
            sex: "male", currentWeightKg: 80, heightCm: 0, age: 36,
            activityLevel: "moderate", intent: "lose", pace: "steady")
        XCTAssertNil(TDEECalculator.calculate(input))
    }

    func testMissingAgeReturnsNil() {
        let input = TDEECalculator.Input(
            sex: "male", currentWeightKg: 80, heightCm: 180, age: 0,
            activityLevel: "moderate", intent: "lose", pace: "steady")
        XCTAssertNil(TDEECalculator.calculate(input))
    }
}
