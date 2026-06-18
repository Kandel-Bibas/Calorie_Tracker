import XCTest
@testable import CalorieTracker

final class UnitsTests: XCTestCase {
    func testWeightRoundTripLb() {
        let kg = AppUnits.weightToKg(180, unit: "lb")
        XCTAssertEqual(AppUnits.weightFromKg(kg, unit: "lb"), 180, accuracy: 0.01)
    }
    func testWeightKgPassthrough() {
        XCTAssertEqual(AppUnits.weightToKg(80, unit: "kg"), 80, accuracy: 0.001)
        XCTAssertEqual(AppUnits.formatWeight(kg: 78.2, unit: "kg"), "78.2 kg")
    }
    func testVolumeOzRoundTrip() {
        XCTAssertEqual(AppUnits.ozToMl(8), 236.588, accuracy: 0.01)
        XCTAssertEqual(AppUnits.volumeToMl(16, unit: "oz"), 473)        // 16 oz -> 473 ml
        XCTAssertEqual(AppUnits.formatVolume(ml: 473, unit: "oz"), "16 oz")
        XCTAssertEqual(AppUnits.formatVolume(ml: 1250, unit: "ml"), "1250 ml")
    }
    func testQuickAdds() {
        XCTAssertEqual(AppUnits.quickAdds(unit: "ml").map { $0.ml }, [250, 500])
        let oz = AppUnits.quickAdds(unit: "oz")
        XCTAssertEqual(oz.map { $0.label }, ["+8 oz", "+16 oz"])
        XCTAssertEqual(oz.map { $0.ml }, [237, 473])
    }
    func testHeightFtIn() {
        let h = AppUnits.cmToFtIn(175)            // ~5 ft 9 in
        XCTAssertEqual(h.ft, 5); XCTAssertEqual(h.inch, 9)
        XCTAssertEqual(AppUnits.ftInToCm(ft: 5, inch: 9), 175.26, accuracy: 0.01)
        XCTAssertEqual(AppUnits.formatHeight(cm: 175, unit: "ft"), "5 ft 9 in")
        XCTAssertEqual(AppUnits.formatHeight(cm: 175, unit: "cm"), "175 cm")
    }
}
