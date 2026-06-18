import XCTest
@testable import CalorieTracker

final class DateUtilsTests: XCTestCase {
    
    // Create a specific UTC Date: 2026-06-18 12:00:00 UTC
    private var testDateUtc: Date {
        var components = DateComponents()
        components.year = 2026
        components.month = 6
        components.day = 18
        components.hour = 12
        components.minute = 0
        components.second = 0
        components.timeZone = TimeZone(secondsFromGMT: 0)
        return Calendar.current.date(from: components)!
    }
    
    func testToUserDate() {
        let utcInstant = testDateUtc // 2026-06-18 12:00:00 UTC
        
        // UTC should be 2026-06-18
        XCTAssertEqual(DateUtils.toUserDate(ts: utcInstant, timezone: "UTC"), "2026-06-18")
        
        // America/Los_Angeles is UTC-7 (PDT) in June: 12:00 UTC is 05:00 PDT -> 2026-06-18
        XCTAssertEqual(DateUtils.toUserDate(ts: utcInstant, timezone: "America/Los_Angeles"), "2026-06-18")
        
        // Asia/Kathmandu is UTC+5:45: 12:00 UTC is 17:45 NPT -> 2026-06-18
        XCTAssertEqual(DateUtils.toUserDate(ts: utcInstant, timezone: "Asia/Kathmandu"), "2026-06-18")
        
        // Boundary case: 2026-06-18 23:00:00 UTC
        var lateComponents = DateComponents()
        lateComponents.year = 2026
        lateComponents.month = 6
        lateComponents.day = 18
        lateComponents.hour = 23
        lateComponents.minute = 0
        lateComponents.second = 0
        lateComponents.timeZone = TimeZone(secondsFromGMT: 0)
        let lateUtcInstant = Calendar.current.date(from: lateComponents)!
        
        // In LA, 23:00 UTC is 16:00 PDT -> 2026-06-18
        XCTAssertEqual(DateUtils.toUserDate(ts: lateUtcInstant, timezone: "America/Los_Angeles"), "2026-06-18")
        
        // In Kathmandu, 23:00 UTC is June 19, 04:45 NPT -> 2026-06-19
        XCTAssertEqual(DateUtils.toUserDate(ts: lateUtcInstant, timezone: "Asia/Kathmandu"), "2026-06-19")
    }
    
    func testIsSameUserDay() {
        var comp1 = DateComponents()
        comp1.year = 2026
        comp1.month = 6
        comp1.day = 18
        comp1.hour = 4
        comp1.minute = 0
        comp1.timeZone = TimeZone(secondsFromGMT: 0)
        let earlyUtc = Calendar.current.date(from: comp1)! // 04:00:00 UTC
        
        var comp2 = DateComponents()
        comp2.year = 2026
        comp2.month = 6
        comp2.day = 18
        comp2.hour = 20
        comp2.minute = 0
        comp2.timeZone = TimeZone(secondsFromGMT: 0)
        let lateUtc = Calendar.current.date(from: comp2)! // 20:00:00 UTC
        
        // In UTC timezone, both fall on 2026-06-18
        XCTAssertTrue(DateUtils.isSameUserDay(a: earlyUtc, b: lateUtc, timezone: "UTC"))
        
        // In America/Los_Angeles:
        // earlyUtc: 04:00 UTC -> June 17, 21:00 PDT
        // lateUtc: 20:00 UTC -> June 18, 13:00 PDT
        // They are NOT the same day in LA timezone
        XCTAssertFalse(DateUtils.isSameUserDay(a: earlyUtc, b: lateUtc, timezone: "America/Los_Angeles"))
    }
    
    func testUserDayRangeUtc() {
        let laRange = DateUtils.userDayRangeUtc(timezone: "America/Los_Angeles", dateIso: "2026-06-18")
        
        // Expected start: 2026-06-18 00:00:00 PDT -> 2026-06-18 07:00:00 UTC
        var startComp = DateComponents()
        startComp.year = 2026
        startComp.month = 6
        startComp.day = 18
        startComp.hour = 7
        startComp.minute = 0
        startComp.second = 0
        startComp.timeZone = TimeZone(secondsFromGMT: 0)
        let expectedLaStart = Calendar.current.date(from: startComp)!
        
        // Expected end: 2026-06-18 23:59:59.999 PDT -> 2026-06-19 06:59:59.999 UTC
        var endComp = DateComponents()
        endComp.year = 2026
        endComp.month = 6
        endComp.day = 19
        endComp.hour = 6
        endComp.minute = 59
        endComp.second = 59
        endComp.nanosecond = 999_000_000
        endComp.timeZone = TimeZone(secondsFromGMT: 0)
        let expectedLaEnd = Calendar.current.date(from: endComp)!
        
        XCTAssertEqual(laRange.start, expectedLaStart)
        XCTAssertEqual(laRange.end.timeIntervalSince1970, expectedLaEnd.timeIntervalSince1970, accuracy: 0.005)
        
        let ktmRange = DateUtils.userDayRangeUtc(timezone: "Asia/Kathmandu", dateIso: "2026-06-18")
        // Expected start: 2026-06-18 00:00:00 NPT -> 2026-06-17 18:15:00 UTC
        var ktmStartComp = DateComponents()
        ktmStartComp.year = 2026
        ktmStartComp.month = 6
        ktmStartComp.day = 17
        ktmStartComp.hour = 18
        ktmStartComp.minute = 15
        ktmStartComp.second = 0
        ktmStartComp.timeZone = TimeZone(secondsFromGMT: 0)
        let expectedKtmStart = Calendar.current.date(from: ktmStartComp)!
        
        XCTAssertEqual(ktmRange.start, expectedKtmStart)
    }
}
