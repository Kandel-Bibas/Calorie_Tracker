import Foundation

struct Config {
    static let supabaseURL = URL(string: "https://uiioqvqlyjcggzrzekhp.supabase.co")!
    static let supabaseAnonKey = "sb_publishable_6aOqpLVR1bpH-OgmnjXYbA_MRh03TRl"
    /// Resolved per build configuration via `API_BASE_URL` (project.yml -> Info.plist):
    /// Debug -> local dev server, Release -> public Vercel deployment.
    static let apiBaseURL: URL = {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
              !raw.isEmpty,
              let url = URL(string: raw) else {
            fatalError("API_BASE_URL missing or invalid in Info.plist — check the build configuration in project.yml")
        }
        return url
    }()
}
