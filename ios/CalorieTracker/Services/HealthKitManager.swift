import Foundation
import HealthKit

/// Pure, unit-testable helpers (no HKHealthStore dependency).
enum HealthKitMath {
    static let originMetadataKey = "app.calorietracker.origin"

    static func lbToKg(_ lb: Double) -> Double { lb / 2.20462 }
    static func kgToLb(_ kg: Double) -> Double { kg * 2.20462 }
    static func mlToLiters(_ ml: Int) -> Double { Double(ml) / 1000.0 }
    static func kcalToKilojoules(_ kcal: Double) -> Double { kcal * 4.184 }

    /// Calories remaining = goal - eaten + active burned (no goal inflation elsewhere).
    static func caloriesRemaining(goal: Double, eaten: Double, active: Double) -> Double {
        goal - eaten + active
    }
    /// Net = eaten - active.
    static func netCalories(eaten: Double, active: Double) -> Double { eaten - active }

    /// Should this external sample-date be imported? Only when not already present locally.
    static func shouldImportWeight(forDate date: String, existingDates: Set<String>) -> Bool {
        !existingDates.contains(date)
    }
}

protocol HealthKitManaging {
    var isAvailable: Bool { get }
    func requestAuthorization() async throws
    func writeMeal(kcal: Double, proteinG: Double?, carbG: Double?, fatG: Double?, date: Date) async
    func writeWater(ml: Int, date: Date) async
    func writeWeight(kg: Double, date: Date) async
    func readActiveEnergyAndSteps(for date: Date) async -> (activeKcal: Double, steps: Int)
    func readExternalWeightSamples(since: Date) async -> [(date: Date, kg: Double)]
}

final class HealthKitManager: HealthKitManaging {
    private let store = HKHealthStore()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private var writeTypes: Set<HKSampleType> {
        [HKQuantityType(.dietaryEnergyConsumed), HKQuantityType(.dietaryProtein),
         HKQuantityType(.dietaryCarbohydrates), HKQuantityType(.dietaryFatTotal),
         HKQuantityType(.dietaryWater), HKQuantityType(.bodyMass)]
    }
    private var readTypes: Set<HKObjectType> {
        [HKQuantityType(.activeEnergyBurned), HKQuantityType(.stepCount), HKQuantityType(.bodyMass)]
    }

    func requestAuthorization() async throws {
        guard isAvailable else { return }
        try await store.requestAuthorization(toShare: writeTypes, read: readTypes)
    }

    private func metadata() -> [String: Any] { [HealthKitMath.originMetadataKey: true] }

    func writeMeal(kcal: Double, proteinG: Double?, carbG: Double?, fatG: Double?, date: Date) async {
        guard isAvailable, kcal > 0 else { return }
        var samples: Set<HKSample> = []
        samples.insert(HKQuantitySample(type: HKQuantityType(.dietaryEnergyConsumed),
            quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
            start: date, end: date, metadata: metadata()))
        func macro(_ type: HKQuantityTypeIdentifier, _ grams: Double?) {
            guard let g = grams, g > 0 else { return }
            samples.insert(HKQuantitySample(type: HKQuantityType(type),
                quantity: HKQuantity(unit: .gram(), doubleValue: g),
                start: date, end: date, metadata: metadata()))
        }
        macro(.dietaryProtein, proteinG); macro(.dietaryCarbohydrates, carbG); macro(.dietaryFatTotal, fatG)
        let food = HKCorrelation(type: HKCorrelationType(.food), start: date, end: date,
                                 objects: samples, metadata: metadata())
        try? await store.save(food)
    }

    func writeWater(ml: Int, date: Date) async {
        guard isAvailable, ml > 0 else { return }
        let s = HKQuantitySample(type: HKQuantityType(.dietaryWater),
            quantity: HKQuantity(unit: .literUnit(with: .milli), doubleValue: Double(ml)),
            start: date, end: date, metadata: metadata())
        try? await store.save(s)
    }

    func writeWeight(kg: Double, date: Date) async {
        guard isAvailable, kg > 0 else { return }
        let s = HKQuantitySample(type: HKQuantityType(.bodyMass),
            quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg),
            start: date, end: date, metadata: metadata())
        try? await store.save(s)
    }

    func readActiveEnergyAndSteps(for date: Date) async -> (activeKcal: Double, steps: Int) {
        guard isAvailable else { return (0, 0) }
        let cal = Calendar.current
        let start = cal.startOfDay(for: date)
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? date
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        async let energy = sum(HKQuantityType(.activeEnergyBurned), unit: .kilocalorie(), predicate: predicate)
        async let steps = sum(HKQuantityType(.stepCount), unit: .count(), predicate: predicate)
        return (await energy, Int(await steps))
    }

    private func sum(_ type: HKQuantityType, unit: HKUnit, predicate: NSPredicate) async -> Double {
        await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate,
                                      options: .cumulativeSum) { _, stats, _ in
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit) ?? 0)
            }
            store.execute(q)
        }
    }

    /// External weight samples only — excludes this app's own writes (no echo loop).
    func readExternalWeightSamples(since: Date) async -> [(date: Date, kg: Double)] {
        guard isAvailable else { return [] }
        let type = HKQuantityType(.bodyMass)
        let datePred = HKQuery.predicateForSamples(withStart: since, end: Date())
        let notOurs = NSCompoundPredicate(notPredicateWithSubpredicate:
            HKQuery.predicateForObjects(from: HKSource.default()))
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePred, notOurs])
        return await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit,
                                  sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]) { _, samples, _ in
                let results = (samples as? [HKQuantitySample] ?? []).map {
                    ($0.startDate, $0.quantity.doubleValue(for: .gramUnit(with: .kilo)))
                }
                cont.resume(returning: results)
            }
            store.execute(q)
        }
    }
}

final class HealthKitFake: HealthKitManaging {
    var isAvailable: Bool = false
    func requestAuthorization() async throws {}
    func writeMeal(kcal: Double, proteinG: Double?, carbG: Double?, fatG: Double?, date: Date) async {}
    func writeWater(ml: Int, date: Date) async {}
    func writeWeight(kg: Double, date: Date) async {}
    func readActiveEnergyAndSteps(for date: Date) async -> (activeKcal: Double, steps: Int) { (0, 0) }
    func readExternalWeightSamples(since: Date) async -> [(date: Date, kg: Double)] { [] }
}
