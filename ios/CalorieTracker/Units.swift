import Foundation

/// Central display-unit conversions and formatters. All canonical storage stays in
/// metric base units (kg, ml, cm); this type converts to/from the user's chosen unit
/// for display and entry. Weight kg<->lb delegates to HealthKitMath to avoid duplication.
enum AppUnits {
    // MARK: Weight (stored in kg; unit is "lb" or "kg")
    static func weightToKg(_ value: Double, unit: String) -> Double {
        unit == "kg" ? value : HealthKitMath.lbToKg(value)
    }
    static func weightFromKg(_ kg: Double, unit: String) -> Double {
        unit == "kg" ? kg : HealthKitMath.kgToLb(kg)
    }
    /// e.g. "172.4 lb" / "78.2 kg"
    static func formatWeight(kg: Double, unit: String) -> String {
        unit == "kg" ? String(format: "%.1f kg", kg) : String(format: "%.1f lb", HealthKitMath.kgToLb(kg))
    }

    // MARK: Volume (stored in ml; unit is "ml" or "oz")  1 US fl oz = 29.5735 ml
    static let mlPerOz = 29.5735
    static func mlToOz(_ ml: Double) -> Double { ml / mlPerOz }
    static func ozToMl(_ oz: Double) -> Double { oz * mlPerOz }
    /// e.g. "1250 ml" / "42 oz"
    static func formatVolume(ml: Int, unit: String) -> String {
        unit == "oz" ? "\(Int(mlToOz(Double(ml)).rounded())) oz" : "\(ml) ml"
    }
    /// The two quick-add buttons for the unit, with display label and the ml to store.
    static func quickAdds(unit: String) -> [(label: String, ml: Int)] {
        unit == "oz"
            ? [("+8 oz", Int(ozToMl(8).rounded())), ("+16 oz", Int(ozToMl(16).rounded()))]
            : [("+250 ml", 250), ("+500 ml", 500)]
    }
    /// Convert a user-entered volume in `unit` to ml for storage.
    static func volumeToMl(_ value: Double, unit: String) -> Int {
        unit == "oz" ? Int(ozToMl(value).rounded()) : Int(value.rounded())
    }
    /// Convert stored ml to a display number in `unit` (for prefilling an entry field).
    static func volumeFromMl(_ ml: Int, unit: String) -> Int {
        unit == "oz" ? Int(mlToOz(Double(ml)).rounded()) : ml
    }

    // MARK: Height (stored in cm; unit is "ft" or "cm")  1 in = 2.54 cm
    static func cmToFtIn(_ cm: Double) -> (ft: Int, inch: Int) {
        let totalInches = (cm / 2.54).rounded()
        let ft = Int(totalInches) / 12
        let inch = Int(totalInches) % 12
        return (ft, inch)
    }
    static func ftInToCm(ft: Int, inch: Int) -> Double {
        (Double(ft) * 12 + Double(inch)) * 2.54
    }
    /// e.g. "5 ft 9 in" / "175 cm"
    static func formatHeight(cm: Double, unit: String) -> String {
        if unit == "ft" { let h = cmToFtIn(cm); return "\(h.ft) ft \(h.inch) in" }
        return "\(Int(cm.rounded())) cm"
    }
}
