import Foundation

// MARK: - KeyedDecodingContainer Extension for Flexible Doubles
extension KeyedDecodingContainer {
    func decodeFlexibleDouble(forKey key: Key) throws -> Double {
        if let doubleVal = try? decode(Double.self, forKey: key) {
            return doubleVal
        }
        if let stringVal = try? decode(String.self, forKey: key), let doubleVal = Double(stringVal) {
            return doubleVal
        }
        if let intVal = try? decode(Int.self, forKey: key) {
            return Double(intVal)
        }
        return try decode(Double.self, forKey: key)
    }

    func decodeFlexibleDoubleIfPresent(forKey key: Key) throws -> Double? {
        if !contains(key) { return nil }
        do {
            if try decodeNil(forKey: key) { return nil }
        } catch {
            return nil
        }
        if let doubleVal = try? decode(Double.self, forKey: key) {
            return doubleVal
        }
        if let stringVal = try? decode(String.self, forKey: key), let doubleVal = Double(stringVal) {
            return doubleVal
        }
        if let intVal = try? decode(Int.self, forKey: key) {
            return Double(intVal)
        }
        return nil
    }
}

// MARK: - JSONValue enum for JSONB columns
enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let string = try? container.decode(String.self) {
            self = .string(string)
        } else if let number = try? container.decode(Double.self) {
            self = .number(number)
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else if let object = try? container.decode([String: JSONValue].self) {
            self = .object(object)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode JSONValue")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .number(let n): try container.encode(n)
        case .bool(let b): try container.encode(b)
        case .object(let o): try container.encode(o)
        case .array(let a): try container.encode(a)
        case .null: try container.encodeNil()
        }
    }
}

// MARK: - Date Formatter Extensions for Supabase
extension DateFormatter {
    static let iso8601Fractional: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZZZZZ"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()
    
    static let iso8601Standard: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZZZZZ"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter
    }()
}

extension JSONDecoder {
    static var supabaseDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            
            if let date = DateFormatter.iso8601Fractional.date(from: dateStr) {
                return date
            }
            if let date = DateFormatter.iso8601Standard.date(from: dateStr) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode date string \(dateStr)")
        }
        return decoder
    }
}

// MARK: - Profile Model
struct Profile: Codable, Identifiable, Hashable {
    let id: UUID
    var displayName: String?
    var sex: String?
    var birthYear: Int?
    var heightCm: Int?
    var unitsWeight: String?
    var unitsHeight: String?
    var unitsVolume: String?
    var waterGoalMl: Int?
    var activityLevel: String?
    var timezone: String?
    var createdAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case sex
        case birthYear = "birth_year"
        case heightCm = "height_cm"
        case unitsWeight = "units_weight"
        case unitsHeight = "units_height"
        case unitsVolume = "units_volume"
        case waterGoalMl = "water_goal_ml"
        case activityLevel = "activity_level"
        case timezone
        case createdAt = "created_at"
    }
}

// MARK: - Goal Model
struct Goal: Codable, Identifiable, Hashable {
    let id: UUID
    let userId: UUID
    var intent: String?
    var targetWeightKg: Double?
    var pace: String?
    var dailyKcal: Int
    var proteinG: Int?
    var carbG: Int?
    var fatG: Int?
    var activatedAt: Date?
    var supersededAt: Date?
    var activityLevel: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case intent
        case targetWeightKg = "target_weight_kg"
        case pace
        case dailyKcal = "daily_kcal"
        case proteinG = "protein_g"
        case carbG = "carb_g"
        case fatG = "fat_g"
        case activatedAt = "activated_at"
        case supersededAt = "superseded_at"
        case activityLevel = "activity_level"
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        userId = try container.decode(UUID.self, forKey: .userId)
        intent = try container.decodeIfPresent(String.self, forKey: .intent)
        targetWeightKg = try container.decodeFlexibleDoubleIfPresent(forKey: .targetWeightKg)
        pace = try container.decodeIfPresent(String.self, forKey: .pace)
        dailyKcal = try container.decode(Int.self, forKey: .dailyKcal)
        proteinG = try container.decodeIfPresent(Int.self, forKey: .proteinG)
        carbG = try container.decodeIfPresent(Int.self, forKey: .carbG)
        fatG = try container.decodeIfPresent(Int.self, forKey: .fatG)
        activatedAt = try container.decodeIfPresent(Date.self, forKey: .activatedAt)
        supersededAt = try container.decodeIfPresent(Date.self, forKey: .supersededAt)
        activityLevel = try container.decodeIfPresent(String.self, forKey: .activityLevel)
    }
    
    init(
        id: UUID,
        userId: UUID,
        intent: String?,
        targetWeightKg: Double?,
        pace: String?,
        dailyKcal: Int,
        proteinG: Int?,
        carbG: Int?,
        fatG: Int?,
        activatedAt: Date?,
        supersededAt: Date?,
        activityLevel: String?
    ) {
        self.id = id
        self.userId = userId
        self.intent = intent
        self.targetWeightKg = targetWeightKg
        self.pace = pace
        self.dailyKcal = dailyKcal
        self.proteinG = proteinG
        self.carbG = carbG
        self.fatG = fatG
        self.activatedAt = activatedAt
        self.supersededAt = supersededAt
        self.activityLevel = activityLevel
    }
}

// MARK: - Meal Model
struct Meal: Codable, Identifiable, Hashable {
    let id: UUID
    let userId: UUID
    var consumedAt: Date
    var mealType: String?
    var photoPath: String?
    var voiceTranscript: String?
    var totalKcal: Double
    var totalProteinG: Double?
    var totalCarbG: Double?
    var totalFatG: Double?
    var errorBandLow: Double?
    var errorBandHigh: Double?
    var geminiRaw: JSONValue?
    var createdAt: Date?
    var editedAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case consumedAt = "consumed_at"
        case mealType = "meal_type"
        case photoPath = "photo_path"
        case voiceTranscript = "voice_transcript"
        case totalKcal = "total_kcal"
        case totalProteinG = "total_protein_g"
        case totalCarbG = "total_carb_g"
        case totalFatG = "total_fat_g"
        case errorBandLow = "error_band_low"
        case errorBandHigh = "error_band_high"
        case geminiRaw = "gemini_raw"
        case createdAt = "created_at"
        case editedAt = "edited_at"
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        userId = try container.decode(UUID.self, forKey: .userId)
        consumedAt = try container.decode(Date.self, forKey: .consumedAt)
        mealType = try container.decodeIfPresent(String.self, forKey: .mealType)
        photoPath = try container.decodeIfPresent(String.self, forKey: .photoPath)
        voiceTranscript = try container.decodeIfPresent(String.self, forKey: .voiceTranscript)
        totalKcal = try container.decodeFlexibleDouble(forKey: .totalKcal)
        totalProteinG = try container.decodeFlexibleDoubleIfPresent(forKey: .totalProteinG)
        totalCarbG = try container.decodeFlexibleDoubleIfPresent(forKey: .totalCarbG)
        totalFatG = try container.decodeFlexibleDoubleIfPresent(forKey: .totalFatG)
        errorBandLow = try container.decodeFlexibleDoubleIfPresent(forKey: .errorBandLow)
        errorBandHigh = try container.decodeFlexibleDoubleIfPresent(forKey: .errorBandHigh)
        geminiRaw = try container.decodeIfPresent(JSONValue.self, forKey: .geminiRaw)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        editedAt = try container.decodeIfPresent(Date.self, forKey: .editedAt)
    }
    
    init(
        id: UUID,
        userId: UUID,
        consumedAt: Date,
        mealType: String?,
        photoPath: String?,
        voiceTranscript: String?,
        totalKcal: Double,
        totalProteinG: Double?,
        totalCarbG: Double?,
        totalFatG: Double?,
        errorBandLow: Double?,
        errorBandHigh: Double?,
        geminiRaw: JSONValue?,
        createdAt: Date?,
        editedAt: Date?
    ) {
        self.id = id
        self.userId = userId
        self.consumedAt = consumedAt
        self.mealType = mealType
        self.photoPath = photoPath
        self.voiceTranscript = voiceTranscript
        self.totalKcal = totalKcal
        self.totalProteinG = totalProteinG
        self.totalCarbG = totalCarbG
        self.totalFatG = totalFatG
        self.errorBandLow = errorBandLow
        self.errorBandHigh = errorBandHigh
        self.geminiRaw = geminiRaw
        self.createdAt = createdAt
        self.editedAt = editedAt
    }
}

// MARK: - MealItem Model
struct MealItem: Codable, Identifiable, Hashable {
    let id: UUID
    var mealId: UUID
    var userId: UUID
    var foodName: String
    var displayName: String
    var grams: Double
    var kcal: Double
    var proteinG: Double?
    var carbG: Double?
    var fatG: Double?
    var loggingMode: String?
    var userProvidedGrams: Bool
    var source: String?
    var sourceRef: String?
    var matchConfidence: Double?
    var userEdited: Bool?
    
    enum CodingKeys: String, CodingKey {
        case id
        case mealId = "meal_id"
        case userId = "user_id"
        case foodName = "food_name"
        case displayName = "display_name"
        case grams
        case kcal
        case proteinG = "protein_g"
        case carbG = "carb_g"
        case fatG = "fat_g"
        case loggingMode = "logging_mode"
        case userProvidedGrams = "user_provided_grams"
        case source
        case sourceRef = "source_ref"
        case matchConfidence = "match_confidence"
        case userEdited = "user_edited"
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        mealId = try container.decode(UUID.self, forKey: .mealId)
        userId = try container.decode(UUID.self, forKey: .userId)
        foodName = try container.decode(String.self, forKey: .foodName)
        displayName = try container.decode(String.self, forKey: .displayName)
        grams = try container.decodeFlexibleDouble(forKey: .grams)
        kcal = try container.decodeFlexibleDouble(forKey: .kcal)
        proteinG = try container.decodeFlexibleDoubleIfPresent(forKey: .proteinG)
        carbG = try container.decodeFlexibleDoubleIfPresent(forKey: .carbG)
        fatG = try container.decodeFlexibleDoubleIfPresent(forKey: .fatG)
        loggingMode = try container.decodeIfPresent(String.self, forKey: .loggingMode)
        userProvidedGrams = try container.decode(Bool.self, forKey: .userProvidedGrams)
        source = try container.decodeIfPresent(String.self, forKey: .source)
        sourceRef = try container.decodeIfPresent(String.self, forKey: .sourceRef)
        matchConfidence = try container.decodeFlexibleDoubleIfPresent(forKey: .matchConfidence)
        userEdited = try container.decodeIfPresent(Bool.self, forKey: .userEdited)
    }
    
    init(
        id: UUID,
        mealId: UUID,
        userId: UUID,
        foodName: String,
        displayName: String,
        grams: Double,
        kcal: Double,
        proteinG: Double?,
        carbG: Double?,
        fatG: Double?,
        loggingMode: String?,
        userProvidedGrams: Bool,
        source: String?,
        sourceRef: String?,
        matchConfidence: Double?,
        userEdited: Bool?
    ) {
        self.id = id
        self.mealId = mealId
        self.userId = userId
        self.foodName = foodName
        self.displayName = displayName
        self.grams = grams
        self.kcal = kcal
        self.proteinG = proteinG
        self.carbG = carbG
        self.fatG = fatG
        self.loggingMode = loggingMode
        self.userProvidedGrams = userProvidedGrams
        self.source = source
        self.sourceRef = sourceRef
        self.matchConfidence = matchConfidence
        self.userEdited = userEdited
    }
}

// MARK: - Weight Model
struct Weight: Codable, Identifiable, Hashable {
    let id: UUID
    let userId: UUID
    var recordedOn: String // YYYY-MM-DD
    var weightKg: Double
    var createdAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case recordedOn = "recorded_on"
        case weightKg = "weight_kg"
        case createdAt = "created_at"
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        userId = try container.decode(UUID.self, forKey: .userId)
        recordedOn = try container.decode(String.self, forKey: .recordedOn)
        weightKg = try container.decodeFlexibleDouble(forKey: .weightKg)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
    }
    
    init(
        id: UUID,
        userId: UUID,
        recordedOn: String,
        weightKg: Double,
        createdAt: Date?
    ) {
        self.id = id
        self.userId = userId
        self.recordedOn = recordedOn
        self.weightKg = weightKg
        self.createdAt = createdAt
    }
}

// MARK: - WaterLog Model
struct WaterLog: Codable, Identifiable, Hashable {
    let id: UUID
    let userId: UUID
    var loggedAt: Date
    var amountMl: Int
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case loggedAt = "logged_at"
        case amountMl = "amount_ml"
    }
}

// MARK: - Streak Model
struct Streak: Codable, Identifiable, Hashable {
    var id: UUID { userId }
    let userId: UUID
    var currentLength: Int
    var longestLength: Int
    var lastLoggedDate: String? // YYYY-MM-DD
    var freezeCount: Int
    
    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case currentLength = "current_length"
        case longestLength = "longest_length"
        case lastLoggedDate = "last_logged_date"
        case freezeCount = "freeze_count"
    }
}

// MARK: - FoodCache Model
struct FoodCache: Codable, Identifiable, Hashable {
    let id: UUID
    var queryNormalized: String
    var source: String
    var sourceRef: String
    var kcalPer100g: Double
    var proteinPer100g: Double?
    var carbPer100g: Double?
    var fatPer100g: Double?
    var lastUsedAt: Date?
    var useCount: Int?
    
    enum CodingKeys: String, CodingKey {
        case id
        case queryNormalized = "query_normalized"
        case source
        case sourceRef = "source_ref"
        case kcalPer100g = "kcal_per_100g"
        case proteinPer100g = "protein_per_100g"
        case carbPer100g = "carb_per_100g"
        case fatPer100g = "fat_per_100g"
        case lastUsedAt = "last_used_at"
        case useCount = "use_count"
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        queryNormalized = try container.decode(String.self, forKey: .queryNormalized)
        source = try container.decode(String.self, forKey: .source)
        sourceRef = try container.decode(String.self, forKey: .sourceRef)
        kcalPer100g = try container.decodeFlexibleDouble(forKey: .kcalPer100g)
        proteinPer100g = try container.decodeFlexibleDoubleIfPresent(forKey: .proteinPer100g)
        carbPer100g = try container.decodeFlexibleDoubleIfPresent(forKey: .carbPer100g)
        fatPer100g = try container.decodeFlexibleDoubleIfPresent(forKey: .fatPer100g)
        lastUsedAt = try container.decodeIfPresent(Date.self, forKey: .lastUsedAt)
        useCount = try container.decodeIfPresent(Int.self, forKey: .useCount)
    }
}

// MARK: - UserFoodOverride Model
struct UserFoodOverride: Codable, Identifiable, Hashable {
    let id: UUID
    let userId: UUID
    var queryNormalized: String
    var displayName: String
    var kcalPer100g: Double
    var proteinPer100g: Double?
    var carbPer100g: Double?
    var fatPer100g: Double?
    var source: String?
    var sourceRef: String?
    var recipeIngredients: JSONValue?
    var createdAt: Date?
    var useCount: Int?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case queryNormalized = "query_normalized"
        case displayName = "display_name"
        case kcalPer100g = "kcal_per_100g"
        case proteinPer100g = "protein_per_100g"
        case carbPer100g = "carb_per_100g"
        case fatPer100g = "fat_per_100g"
        case source
        case sourceRef = "source_ref"
        case recipeIngredients = "recipe_ingredients"
        case createdAt = "created_at"
        case useCount = "use_count"
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        userId = try container.decode(UUID.self, forKey: .userId)
        queryNormalized = try container.decode(String.self, forKey: .queryNormalized)
        displayName = try container.decode(String.self, forKey: .displayName)
        kcalPer100g = try container.decodeFlexibleDouble(forKey: .kcalPer100g)
        proteinPer100g = try container.decodeFlexibleDoubleIfPresent(forKey: .proteinPer100g)
        carbPer100g = try container.decodeFlexibleDoubleIfPresent(forKey: .carbPer100g)
        fatPer100g = try container.decodeFlexibleDoubleIfPresent(forKey: .fatPer100g)
        source = try container.decodeIfPresent(String.self, forKey: .source)
        sourceRef = try container.decodeIfPresent(String.self, forKey: .sourceRef)
        recipeIngredients = try container.decodeIfPresent(JSONValue.self, forKey: .recipeIngredients)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        useCount = try container.decodeIfPresent(Int.self, forKey: .useCount)
    }
}

// MARK: - MealDraft Model
struct MealDraft: Codable, Identifiable, Hashable {
    let id: UUID
    let userId: UUID
    var draftData: JSONValue
    var createdAt: Date?
    var expiresAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case draftData = "draft_data"
        case createdAt = "created_at"
        case expiresAt = "expires_at"
    }
}

// MARK: - AiCall Model
struct AiCall: Codable, Identifiable, Hashable {
    let id: UUID
    let userId: UUID?
    let mealId: UUID?
    var model: String
    var callKind: String
    var inputTokens: Int?
    var outputTokens: Int?
    var latencyMs: Int?
    var error: String?
    var createdAt: Date?
    
    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case mealId = "meal_id"
        case model
        case callKind = "call_kind"
        case inputTokens = "input_tokens"
        case outputTokens = "output_tokens"
        case latencyMs = "latency_ms"
        case error
        case createdAt = "created_at"
    }
}

// MARK: - FoodItem Model
struct FoodItem: Codable, Hashable {
    var usdaQuery: String
    var displayName: String
    var grams: Double
    var userProvidedGrams: Bool
    var loggingMode: String
    var compositeComponents: [String]?
    var preparation: String
    var estimationBasis: String?
    var kcalPer100g: Double
    var proteinPer100g: Double?
    var carbPer100g: Double?
    var fatPer100g: Double?

    enum CodingKeys: String, CodingKey {
        case usdaQuery = "usda_query"
        case displayName = "display_name"
        case grams
        case userProvidedGrams = "user_provided_grams"
        case loggingMode = "logging_mode"
        case compositeComponents = "composite_components"
        case preparation
        case estimationBasis = "estimation_basis"
        case kcalPer100g = "kcal_per_100g"
        case proteinPer100g = "protein_per_100g"
        case carbPer100g = "carb_per_100g"
        case fatPer100g = "fat_per_100g"
    }
    
    /// Keys as actually streamed by `POST /api/analyze` draft items. Nutrition
    /// arrives as ABSOLUTE values for the item's `grams` (nullable when the
    /// resolver found no match), NOT per-100g.
    private enum DraftKeys: String, CodingKey {
        case usdaQuery = "usda_query"
        case displayName = "display_name"
        case grams
        case userProvidedGrams = "user_provided_grams"
        case loggingMode = "logging_mode"
        case compositeComponents = "composite_components"
        case preparation
        case estimationBasis = "estimation_basis"
        case kcal
        case proteinG = "protein_g"
        case carbG = "carb_g"
        case fatG = "fat_g"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DraftKeys.self)
        usdaQuery = try container.decode(String.self, forKey: .usdaQuery)
        displayName = try container.decode(String.self, forKey: .displayName)
        grams = try container.decodeFlexibleDouble(forKey: .grams)
        userProvidedGrams = (try? container.decode(Bool.self, forKey: .userProvidedGrams)) ?? false
        loggingMode = (try? container.decode(String.self, forKey: .loggingMode)) ?? "component"
        compositeComponents = try container.decodeIfPresent([String].self, forKey: .compositeComponents)
        preparation = (try? container.decode(String.self, forKey: .preparation)) ?? ""
        estimationBasis = try container.decodeIfPresent(String.self, forKey: .estimationBasis)

        // Server sends absolute nutrition for `grams`; convert to per-100g so the
        // review UI can rescale live when the user edits grams. Null/absent → 0/nil
        // (Tier-4 fallback for unresolved items).
        let basis = grams
        func per100(_ key: DraftKeys) -> Double? {
            guard basis > 0, let absolute = (try? container.decodeFlexibleDoubleIfPresent(forKey: key)) ?? nil else { return nil }
            return absolute / basis * 100
        }
        kcalPer100g = per100(.kcal) ?? 0
        proteinPer100g = per100(.proteinG)
        carbPer100g = per100(.carbG)
        fatPer100g = per100(.fatG)
    }
}

// MARK: - MealAnalysis Model
struct MealAnalysis: Codable, Hashable {
    var items: [FoodItem]
    var mealLabel: String
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case items
        case mealLabel = "meal_label"
        case notes
    }
}

