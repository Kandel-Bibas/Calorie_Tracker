import Foundation

class MealAnalysisService {
    private let session: URLSession

    /// NDJSON line of shape {"type":"error","message":"..."} emitted by the server.
    private struct ServerErrorLine: Decodable {
        let type: String
        let message: String?
    }

    init(session: URLSession = .shared) {
        self.session = session
    }
    
    func analyzeMeal(
        image: Data?,
        voice: Data?,
        typedText: String?,
        transcript: String?,
        accessToken: String
    ) async throws -> AsyncThrowingStream<MealAnalysis, Error> {
        let request = makeRequest(
            image: image,
            voice: voice,
            typedText: typedText,
            transcript: transcript,
            accessToken: accessToken
        )

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    let (bytes, response) = try await session.bytes(for: request)
                    
                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: URLError(.badServerResponse))
                        return
                    }
                    
                    guard httpResponse.statusCode == 200 else {
                        continuation.finish(throwing: NSError(
                            domain: "MealAnalysisService",
                            code: httpResponse.statusCode,
                            userInfo: [NSLocalizedDescriptionKey: "Server returned error status \(httpResponse.statusCode)"]
                        ))
                        return
                    }
                    
                    for try await line in bytes.lines {
                        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !trimmed.isEmpty else { continue }
                        guard let data = trimmed.data(using: .utf8) else { continue }

                        // Surface server-sent error lines instead of silently dropping them
                        // (which would otherwise leave the caller waiting forever).
                        if let serverError = try? JSONDecoder().decode(ServerErrorLine.self, from: data),
                           serverError.type == "error" {
                            continuation.finish(throwing: NSError(
                                domain: "MealAnalysisService",
                                code: -2,
                                userInfo: [NSLocalizedDescriptionKey: serverError.message ?? "Analysis failed"]
                            ))
                            return
                        }

                        // Try parsing directly as MealAnalysis (decoding ignores extra keys like type or draftId)
                        if let analysis = try? JSONDecoder.supabaseDecoder.decode(MealAnalysis.self, from: data) {
                            // Verify that it actually has items (to distinguish from status messages)
                            if !analysis.items.isEmpty {
                                continuation.yield(analysis)
                            }
                        } else {
                            // If encoded inside a specific type-wrapped JSON payload
                            struct DraftWrapper: Codable {
                                let type: String
                                let items: [FoodItem]
                                let mealLabel: String
                                let notes: String?
                                
                                enum CodingKeys: String, CodingKey {
                                    case type
                                    case items
                                    case mealLabel = "meal_label"
                                    case notes
                                }
                            }
                            
                            if let wrapper = try? JSONDecoder.supabaseDecoder.decode(DraftWrapper.self, from: data), wrapper.type == "draft" {
                                let analysis = MealAnalysis(items: wrapper.items, mealLabel: wrapper.mealLabel, notes: wrapper.notes)
                                continuation.yield(analysis)
                            }
                        }
                    }
                    
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    /// Builds the multipart `POST /api/analyze` request, attaching the Supabase
    /// access token as a Bearer header so the server can authenticate native
    /// clients (which carry a JWT, not a session cookie). Internal for testing.
    func makeRequest(
        image: Data?,
        voice: Data?,
        typedText: String?,
        transcript: String?,
        accessToken: String
    ) -> URLRequest {
        let url = Config.apiBaseURL.appendingPathComponent("api/analyze")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // Helper to append text fields
        func appendField(name: String, value: String) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }

        // Helper to append file fields
        func appendFile(name: String, filename: String, mimeType: String, data: Data) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
            body.append(data)
            body.append("\r\n".data(using: .utf8)!)
        }

        // Append fields per prompt requirements
        if let image = image {
            // Downscale/recompress so the request body stays under Vercel's
            // ~4.5 MB serverless limit (full-res photos otherwise return 413).
            let compressed = ImageCompressor.compressForUpload(image)
            // Append with "image" (prompt requirement)
            appendFile(name: "image", filename: "photo.jpg", mimeType: "image/jpeg", data: compressed)
            // Append with "photo" (backend route expectation)
            appendFile(name: "photo", filename: "photo.jpg", mimeType: "image/jpeg", data: compressed)
        }

        if let voice = voice {
            // Append with "voice" (prompt requirement)
            appendFile(name: "voice", filename: "voice.m4a", mimeType: "audio/m4a", data: voice)
            // Append with "audio" (backend route expectation)
            appendFile(name: "audio", filename: "voice.m4a", mimeType: "audio/m4a", data: voice)
        }

        if let typedText = typedText {
            appendField(name: "typed_text", value: typedText)
        }

        if let transcript = transcript {
            appendField(name: "transcript", value: transcript)
        }

        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        return request
    }
}
