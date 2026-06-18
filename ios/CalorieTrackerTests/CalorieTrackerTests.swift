import XCTest
@testable import CalorieTracker

final class CalorieTrackerTests: XCTestCase {
    func testSupabaseConfiguration() {
        XCTAssertEqual(Config.supabaseURL.absoluteString, "https://uiioqvqlyjcggzrzekhp.supabase.co")
        XCTAssertEqual(Config.supabaseAnonKey, "sb_publishable_6aOqpLVR1bpH-OgmnjXYbA_MRh03TRl")
    }
}
