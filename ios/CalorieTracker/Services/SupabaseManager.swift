import Foundation
import Supabase

@Observable
class SupabaseManager {
    let supabase: SupabaseClient
    var currentProfile: Profile?
    
    var currentUserId: UUID? {
        guard let user = supabase.auth.currentUser else { return nil }
        return user.id
    }
    
    init(supabase: SupabaseClient = SupabaseClient(supabaseURL: Config.supabaseURL, supabaseKey: Config.supabaseAnonKey)) {
        self.supabase = supabase
    }
    
    // MARK: - Authentication
    
    func sendOTP(email: String) async throws {
        try await supabase.auth.signInWithOTP(email: email)
    }
    
    func verifyOTP(email: String, code: String) async throws {
        let _ = try await supabase.auth.verifyOTP(email: email, token: code, type: .email)
        if let profile = try? await fetchProfile() {
            self.currentProfile = profile
        }
    }
    
    func signOut() async throws {
        try await supabase.auth.signOut()
        self.currentProfile = nil
    }
    
    func checkSession() async -> Bool {
        do {
            let _ = try await supabase.auth.session
            if let profile = try? await fetchProfile() {
                self.currentProfile = profile
            }
            return true
        } catch {
            return false
        }
    }
    
    // MARK: - Profiles CRUD
    
    func fetchProfile() async throws -> Profile {
        guard let userId = currentUserId else {
            throw NSError(domain: "SupabaseManager", code: 401, userInfo: [NSLocalizedDescriptionKey: "Unauthorized"])
        }
        let profiles: [Profile] = try await supabase.database
            .from("profiles")
            .select()
            .eq("id", value: userId)
            .execute()
            .value
        
        if let profile = profiles.first {
            return profile
        } else {
            throw NSError(domain: "SupabaseManager", code: 404, userInfo: [NSLocalizedDescriptionKey: "Profile not found"])
        }
    }
    
    func upsertProfile(_ profile: Profile) async throws {
        try await supabase.database
            .from("profiles")
            .upsert(profile)
            .execute()
    }
    
    // MARK: - Goals CRUD
    
    func fetchActiveGoal() async throws -> Goal? {
        guard let userId = currentUserId else { return nil }
        let goals: [Goal] = try await supabase.database
            .from("goals")
            .select()
            .eq("user_id", value: userId)
            .is("superseded_at", value: nil)
            .execute()
            .value
        return goals.first
    }
    
    func fetchGoalHistory() async throws -> [Goal] {
        guard let userId = currentUserId else { return [] }
        return try await supabase.database
            .from("goals")
            .select()
            .eq("user_id", value: userId)
            .order("activated_at", ascending: false)
            .execute()
            .value
    }
    
    func createGoal(_ goal: Goal) async throws {
        guard let userId = currentUserId else {
            throw NSError(domain: "SupabaseManager", code: 401, userInfo: [NSLocalizedDescriptionKey: "Unauthorized"])
        }
        
        // Mark currently active goals as superseded
        struct GoalSupersedeUpdate: Encodable {
            let superseded_at: String
        }
        let nowString = DateFormatter.iso8601Standard.string(from: Date())
        let updateData = GoalSupersedeUpdate(superseded_at: nowString)
        
        try await supabase.database
            .from("goals")
            .update(updateData)
            .eq("user_id", value: userId)
            .is("superseded_at", value: nil)
            .execute()
        
        // Insert new goal
        try await supabase.database
            .from("goals")
            .insert(goal)
            .execute()
    }
    
    // MARK: - Meals & MealItems CRUD
    
    func fetchMeals(start: Date, end: Date) async throws -> [Meal] {
        guard let userId = currentUserId else { return [] }
        let startIso = DateFormatter.iso8601Standard.string(from: start)
        let endIso = DateFormatter.iso8601Standard.string(from: end)
        return try await supabase.database
            .from("meals")
            .select()
            .eq("user_id", value: userId)
            .gte("consumed_at", value: startIso)
            .lte("consumed_at", value: endIso)
            .order("consumed_at", ascending: false)
            .execute()
            .value
    }
    
    func fetchMealItems(mealId: UUID) async throws -> [MealItem] {
        return try await supabase.database
            .from("meal_items")
            .select()
            .eq("meal_id", value: mealId)
            .execute()
            .value
    }
    
    func insertMeal(meal: Meal, items: [MealItem]) async throws {
        try await supabase.database
            .from("meals")
            .insert(meal)
            .execute()
        
        for item in items {
            try await supabase.database
                .from("meal_items")
                .insert(item)
                .execute()
        }
    }
    
    func deleteMeal(mealId: UUID) async throws {
        try await supabase.database
            .from("meals")
            .delete()
            .eq("id", value: mealId)
            .execute()
    }
    
    // MARK: - Weights CRUD
    
    func fetchWeights(since: Date) async throws -> [Weight] {
        guard let userId = currentUserId else { return [] }
        let sinceIso = DateFormatter.iso8601Standard.string(from: since)
        return try await supabase.database
            .from("weights")
            .select()
            .eq("user_id", value: userId)
            .gte("recorded_on", value: sinceIso)
            .order("recorded_on", ascending: false)
            .execute()
            .value
    }
    
    func upsertWeight(_ weight: Weight) async throws {
        try await supabase.database
            .from("weights")
            .upsert(weight)
            .execute()
    }
    
    // MARK: - Water Logs CRUD
    
    func fetchWaterLogs(start: Date, end: Date) async throws -> [WaterLog] {
        guard let userId = currentUserId else { return [] }
        let startIso = DateFormatter.iso8601Standard.string(from: start)
        let endIso = DateFormatter.iso8601Standard.string(from: end)
        return try await supabase.database
            .from("water_logs")
            .select()
            .eq("user_id", value: userId)
            .gte("logged_at", value: startIso)
            .lte("logged_at", value: endIso)
            .order("logged_at", ascending: false)
            .execute()
            .value
    }
    
    func logWater(amountMl: Int, date: Date) async throws {
        guard let userId = currentUserId else {
            throw NSError(domain: "SupabaseManager", code: 401, userInfo: [NSLocalizedDescriptionKey: "Unauthorized"])
        }
        let log = WaterLog(id: UUID(), userId: userId, loggedAt: date, amountMl: amountMl)
        try await supabase.database
            .from("water_logs")
            .insert(log)
            .execute()
    }
    
    func deleteLastWaterLog() async throws {
        guard let userId = currentUserId else {
            throw NSError(domain: "SupabaseManager", code: 401, userInfo: [NSLocalizedDescriptionKey: "Unauthorized"])
        }
        
        let logs: [WaterLog] = try await supabase.database
            .from("water_logs")
            .select()
            .eq("user_id", value: userId)
            .order("logged_at", ascending: false)
            .limit(1)
            .execute()
            .value
        
        if let lastLog = logs.first {
            try await supabase.database
                .from("water_logs")
                .delete()
                .eq("id", value: lastLog.id)
                .execute()
        }
    }
    
    // MARK: - Streaks CRUD
    
    func fetchStreak() async throws -> Streak? {
        guard let userId = currentUserId else { return nil }
        let streaks: [Streak] = try await supabase.database
            .from("streaks")
            .select()
            .eq("user_id", value: userId)
            .execute()
            .value
        return streaks.first
    }
}
