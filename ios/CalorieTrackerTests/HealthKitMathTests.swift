import XCTest
@testable import CalorieTracker

final class HealthKitMathTests: XCTestCase {
    func testLbKgRoundTrip() {
        XCTAssertEqual(HealthKitMath.lbToKg(220.462), 100, accuracy: 0.01)
        XCTAssertEqual(HealthKitMath.kgToLb(100), 220.462, accuracy: 0.01)
    }
    func testMlToLiters() { XCTAssertEqual(HealthKitMath.mlToLiters(250), 0.25, accuracy: 0.0001) }
    func testKcalToKilojoules() { XCTAssertEqual(HealthKitMath.kcalToKilojoules(100), 418.4, accuracy: 0.01) }
    func testCaloriesRemainingAddsActive() {
        XCTAssertEqual(HealthKitMath.caloriesRemaining(goal: 2000, eaten: 1420, active: 380), 960, accuracy: 0.001)
    }
    func testNetCalories() {
        XCTAssertEqual(HealthKitMath.netCalories(eaten: 1420, active: 380), 1040, accuracy: 0.001)
    }
    func testShouldImportWeightSkipsExistingDate() {
        let existing: Set<String> = ["2026-06-18"]
        XCTAssertFalse(HealthKitMath.shouldImportWeight(forDate: "2026-06-18", existingDates: existing))
        XCTAssertTrue(HealthKitMath.shouldImportWeight(forDate: "2026-06-17", existingDates: existing))
    }
}
