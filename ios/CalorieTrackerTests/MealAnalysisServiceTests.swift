import XCTest
import UIKit
@testable import CalorieTracker

private func makeImage(width: CGFloat, height: CGFloat) -> Data {
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1 // points == pixels, so dimensions are predictable in assertions
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
    let image = renderer.image { ctx in
        // A simple gradient so the JPEG isn't trivially compressible.
        let colors = [UIColor.red.cgColor, UIColor.blue.cgColor] as CFArray
        let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1])!
        ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: width, y: height), options: [])
    }
    return image.jpegData(compressionQuality: 1.0)!
}

class MockURLProtocol: URLProtocol {
    static var mockData: Data?
    static var mockResponse: URLResponse?
    static var mockError: Error?
    
    override class func canInit(with request: URLRequest) -> Bool {
        return true
    }
    
    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }
    
    override func startLoading() {
        if let error = MockURLProtocol.mockError {
            client?.urlProtocol(self, didFailWithError: error)
            return
        }
        if let response = MockURLProtocol.mockResponse {
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        }
        if let data = MockURLProtocol.mockData {
            client?.urlProtocol(self, didLoad: data)
        }
        client?.urlProtocolDidFinishLoading(self)
    }
    
    override func stopLoading() {}
}

final class MealAnalysisServiceTests: XCTestCase {
    
    func testStreamingNDJSONParsing() async throws {
        // Setup configuration with MockURLProtocol
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: config)
        
        let service = MealAnalysisService(session: session)
        
        // NDJSON payload mock: status line followed by the draft line
        let ndjsonPayload = """
        {"type":"status","message":"Identifying foods..."}
        {"type":"draft","draftId":"draft-123","meal_label":"Grilled Chicken Salad","notes":"Healthy option","items":[{"usda_query":"chicken breast, grilled","display_name":"Grilled Chicken Breast","grams":150.0,"user_provided_grams":true,"logging_mode":"component","preparation":"grilled","source":"usda","source_ref":"123","kcal":247.5,"protein_g":46.5,"carb_g":0.0,"fat_g":5.4,"match_confidence":0.9,"fell_back":false}]}
        """
        
        MockURLProtocol.mockData = ndjsonPayload.data(using: .utf8)
        MockURLProtocol.mockResponse = HTTPURLResponse(
            url: URL(string: "http://localhost:3000/api/analyze")!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/x-ndjson"]
        )
        MockURLProtocol.mockError = nil
        
        var receivedAnalyses: [MealAnalysis] = []
        let stream = try await service.analyzeMeal(image: nil, voice: nil, typedText: "salad", transcript: nil, accessToken: "test-token")
        
        for try await analysis in stream {
            receivedAnalyses.append(analysis)
        }
        
        // Assertions
        XCTAssertEqual(receivedAnalyses.count, 1)
        let analysis = receivedAnalyses[0]
        XCTAssertEqual(analysis.mealLabel, "Grilled Chicken Salad")
        XCTAssertEqual(analysis.notes, "Healthy option")
        XCTAssertEqual(analysis.items.count, 1)
        
        let food = analysis.items[0]
        XCTAssertEqual(food.displayName, "Grilled Chicken Breast")
        XCTAssertEqual(food.grams, 150.0)
        XCTAssertTrue(food.userProvidedGrams)
        XCTAssertEqual(food.loggingMode, "component")
        XCTAssertEqual(food.preparation, "grilled")
        // Per-100g is derived from absolute nutrition (kcal/grams*100), so allow
        // for floating-point drift from the division.
        XCTAssertEqual(food.kcalPer100g, 165.0, accuracy: 0.001)        // 247.5/150*100
        XCTAssertEqual(food.proteinPer100g ?? -1, 31.0, accuracy: 0.001) // 46.5/150*100
        XCTAssertEqual(food.carbPer100g ?? -1, 0.0, accuracy: 0.001)
        XCTAssertEqual(food.fatPer100g ?? -1, 3.6, accuracy: 0.001)      // 5.4/150*100
    }

    func testFoodItemConvertsAbsoluteNutritionToPer100g() throws {
        // Real server draft item: ABSOLUTE nutrition for `grams`.
        let json = """
        {"usda_query":"x","display_name":"Pasta","grams":200,"user_provided_grams":true,"logging_mode":"composite","preparation":"cooked","kcal":156,"protein_g":4.8,"carb_g":29.2,"fat_g":2.4}
        """.data(using: .utf8)!
        let item = try JSONDecoder().decode(FoodItem.self, from: json)
        XCTAssertEqual(item.kcalPer100g, 78.0, accuracy: 0.001)        // 156/200*100
        XCTAssertEqual(item.proteinPer100g ?? -1, 2.4, accuracy: 0.001) // 4.8/200*100
        // Round-trip: review/save recompute back to the absolute serving value.
        XCTAssertEqual(item.kcalPer100g * item.grams / 100, 156, accuracy: 0.001)
    }

    func testFoodItemNullNutritionFallsBackToZero() throws {
        // Unresolved item (fell_back): nutrition is null.
        let json = """
        {"usda_query":"x","display_name":"Mystery","grams":120,"user_provided_grams":false,"logging_mode":"component","preparation":"raw","kcal":null,"protein_g":null,"carb_g":null,"fat_g":null,"fell_back":true}
        """.data(using: .utf8)!
        let item = try JSONDecoder().decode(FoodItem.self, from: json)
        XCTAssertEqual(item.kcalPer100g, 0)
        XCTAssertNil(item.proteinPer100g)
    }

    func testServerErrorLineThrows() async {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        let session = URLSession(configuration: config)
        let service = MealAnalysisService(session: session)

        MockURLProtocol.mockData = #"{"type":"error","message":"analysis failed"}"#.data(using: .utf8)
        MockURLProtocol.mockResponse = HTTPURLResponse(url: URL(string: "http://localhost:3000/api/analyze")!, statusCode: 200, httpVersion: nil, headerFields: nil)
        MockURLProtocol.mockError = nil

        do {
            let stream = try await service.analyzeMeal(image: nil, voice: nil, typedText: "x", transcript: nil, accessToken: "t")
            for try await _ in stream {}
            XCTFail("Expected an error to be thrown for a server error line")
        } catch {
            XCTAssertTrue(error.localizedDescription.contains("analysis failed"))
        }
    }

    func testLargeImageIsDownscaled() {
        let big = makeImage(width: 4000, height: 3000)
        let compressed = ImageCompressor.compressForUpload(big)
        let decoded = UIImage(data: compressed)
        XCTAssertNotNil(decoded)
        let longest = max(decoded!.size.width, decoded!.size.height)
        XCTAssertLessThanOrEqual(longest, 1536)
    }

    func testMakeRequestBodyStaysUnderVercelLimit() {
        let big = makeImage(width: 4000, height: 3000)
        let service = MealAnalysisService()
        let request = service.makeRequest(image: big, voice: nil, typedText: "pasta", transcript: nil, accessToken: "t")
        XCTAssertNotNil(request.httpBody)
        XCTAssertLessThan(request.httpBody!.count, 4_000_000)
    }

    func testCompressNonImageDataIsPassthrough() {
        let junk = Data("not an image".utf8)
        XCTAssertEqual(ImageCompressor.compressForUpload(junk), junk)
    }

    func testSmallImageIsNotUpscaled() {
        let small = makeImage(width: 100, height: 100)
        let compressed = ImageCompressor.compressForUpload(small)
        let decoded = UIImage(data: compressed)
        XCTAssertNotNil(decoded)
        XCTAssertLessThanOrEqual(max(decoded!.size.width, decoded!.size.height), 100)
    }

    func testRequestAttachesBearerToken() {
        let service = MealAnalysisService()
        let request = service.makeRequest(
            image: nil,
            voice: nil,
            typedText: "test apple",
            transcript: nil,
            accessToken: "TESTTOKEN"
        )

        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer TESTTOKEN")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertTrue(
            request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data") ?? false
        )
    }
}
