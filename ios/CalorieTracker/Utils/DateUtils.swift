import Foundation

struct DateUtils {
    /// Formats a UTC timestamp as a YYYY-MM-DD string in the target timezone
    static func toUserDate(ts: Date, timezone: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(identifier: timezone) ?? TimeZone(secondsFromGMT: 0)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter.string(from: ts)
    }
    
    /// Determines if two UTC dates fall on the same day in the target timezone
    static func isSameUserDay(a: Date, b: Date, timezone: String) -> Bool {
        return toUserDate(ts: a, timezone: timezone) == toUserDate(ts: b, timezone: timezone)
    }
    
    /// Returns today's date as a YYYY-MM-DD string in the target timezone
    static func userToday(timezone: String) -> String {
        return toUserDate(ts: Date(), timezone: timezone)
    }
    
    /// Computes the start (00:00:00.000) and end (23:59:59.999) of a given YYYY-MM-DD day
    /// in the target timezone, returning them as UTC Swift Date instances.
    static func userDayRangeUtc(timezone: String, dateIso: String?) -> (start: Date, end: Date) {
        let tz = TimeZone(identifier: timezone) ?? TimeZone(secondsFromGMT: 0)
        
        var dateStr = dateIso ?? userToday(timezone: timezone)
        
        // Validate dateStr format (yyyy-MM-dd)
        let validationFormatter = DateFormatter()
        validationFormatter.dateFormat = "yyyy-MM-dd"
        validationFormatter.timeZone = tz
        validationFormatter.locale = Locale(identifier: "en_US_POSIX")
        
        if validationFormatter.date(from: dateStr) == nil {
            dateStr = userToday(timezone: timezone)
        }
        
        let formatter = DateFormatter()
        formatter.timeZone = tz
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        
        let startStr = "\(dateStr) 00:00:00.000"
        let endStr = "\(dateStr) 23:59:59.999"
        
        let startDate = formatter.date(from: startStr) ?? Date()
        let endDate = formatter.date(from: endStr) ?? Date()
        
        return (start: startDate, end: endDate)
    }
}
