import SwiftUI
import PhotosUI

struct LogView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState
    
    // Services
    private let analysisService = MealAnalysisService()
    
    // Input state
    @State private var typedText: String = ""
    @State private var selectedPhotoItem: PhotosPickerItem? = nil
    @State private var photoData: Data? = nil
    @State private var voiceData: Data? = nil
    @State private var showingCamera: Bool = false
    @State private var audioRecorder = AudioRecorder()
    @State private var isPulsing: Bool = false
    
    // Process state
    enum LogStage {
        case input, analyzing, review
    }
    @State private var stage: LogStage = .input
    @State private var statusMessage: String = "Starting analysis..."
    @State private var errorMessage: String? = nil
    
    // Result state
    @State private var mealLabel: String = ""
    @State private var mealNotes: String = ""
    @State private var items: [FoodItem] = []
    
    var body: some View {
        NavigationStack {
            VStack {
                switch stage {
                case .input:
                    inputStageView
                case .analyzing:
                    analyzingStageView
                case .review:
                    reviewStageView
                }
            }
            .navigationTitle("Log Meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                if stage == .input {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Analyze") {
                            startAnalysis()
                        }
                        .disabled(typedText.isEmpty && photoData == nil)
                    }
                }
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                Task {
                    if let data = try? await newItem?.loadTransferable(type: Data.self) {
                        photoData = data
                    }
                }
            }
            .sheet(isPresented: $showingCamera) {
                CameraPicker(imageData: $photoData)
            }
        }
    }
    
    private var inputStageView: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Image capture & select card
                VStack(spacing: 12) {
                    if let photoData = photoData, let uiImage = UIImage(data: photoData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .scaledToFill()
                            .frame(height: 200)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .overlay(
                                Button {
                                    self.photoData = nil
                                    self.selectedPhotoItem = nil
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.white)
                                        .font(.title)
                                        .shadow(radius: 2)
                                },
                                alignment: .topTrailing
                            )
                    } else {
                        HStack(spacing: 16) {
                            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                                Button {
                                    showingCamera = true
                                } label: {
                                    VStack(spacing: 12) {
                                        Image(systemName: "camera.fill")
                                            .font(.system(size: 32))
                                            .foregroundStyle(.orange)
                                        Text("Take Photo")
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                            .foregroundStyle(.primary)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 120)
                                    .background(Color(.systemGray6))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color(.systemGray4), style: StrokeStyle(lineWidth: 1, dash: [4]))
                                    )
                                }
                            }
                            
                            PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                                VStack(spacing: 12) {
                                    Image(systemName: "photo.on.rectangle")
                                        .font(.system(size: 32))
                                        .foregroundStyle(.orange)
                                    Text("Choose Photo")
                                        .font(.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundStyle(.primary)
                                }
                                .frame(maxWidth: .infinity)
                                .frame(height: 120)
                                .background(Color(.systemGray6))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(Color(.systemGray4), style: StrokeStyle(lineWidth: 1, dash: [4]))
                                )
                            }
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.top)
                
                // Description text editor card
                VStack(alignment: .leading, spacing: 8) {
                    Text("Describe what you ate")
                        .font(.headline)
                        .fontWeight(.semibold)
                    
                    TextEditor(text: $typedText)
                        .frame(height: 100)
                        .padding(8)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color(.systemGray5), lineWidth: 1)
                        )
                }
                .padding(.horizontal)
                
                // Voice note capture controls
                VStack(alignment: .leading, spacing: 12) {
                    Text("Voice Note (Optional)")
                        .font(.headline)
                        .fontWeight(.semibold)
                    
                    if audioRecorder.isRecording {
                        Button {
                            audioRecorder.stopRecording()
                            if let data = audioRecorder.audioData {
                                self.voiceData = data
                            }
                        } label: {
                            HStack {
                                Image(systemName: "stop.circle.fill")
                                    .foregroundStyle(.red)
                                Text("Recording... Tap to stop")
                                    .fontWeight(.medium)
                                Spacer()
                                
                                Circle()
                                    .fill(Color.red)
                                    .frame(width: 8, height: 8)
                                    .opacity(isPulsing ? 1.0 : 0.3)
                                    .animation(.easeInOut(duration: 0.6).repeatForever(), value: isPulsing)
                            }
                            .padding()
                            .background(Color.red.opacity(0.1))
                            .foregroundStyle(.red)
                            .cornerRadius(10)
                        }
                        .onAppear {
                            isPulsing = true
                        }
                    } else if let voiceData = voiceData {
                        HStack {
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                Text("Voice description recorded")
                                Spacer()
                            }
                            .padding()
                            .background(Color.green.opacity(0.1))
                            .foregroundStyle(.green)
                            .cornerRadius(10)
                            
                            Button(role: .destructive) {
                                self.voiceData = nil
                                audioRecorder.audioData = nil
                            } label: {
                                Image(systemName: "trash")
                                    .font(.title3)
                                    .foregroundStyle(.red)
                                    .padding()
                                    .background(Color(.systemGray6))
                                    .cornerRadius(10)
                            }
                        }
                    } else {
                        Button {
                            audioRecorder.startRecording()
                        } label: {
                            HStack {
                                Image(systemName: "mic.fill")
                                    .foregroundStyle(.orange)
                                Text("Tap to record voice description")
                                Spacer()
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .foregroundStyle(.primary)
                            .cornerRadius(10)
                        }
                    }
                    
                    if let audioError = audioRecorder.errorMessage {
                        Text(audioError)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding(.horizontal)
                
                if let errorMessage = errorMessage {
                    Text(errorMessage)
                        .font(.subheadline)
                        .foregroundStyle(.red)
                        .padding()
                }
            }
        }
    }
    
    private var analyzingStageView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .controlSize(.large)
                .tint(.orange)
            
            Text(statusMessage)
                .font(.headline)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
    
    private var reviewStageView: some View {
        MealReviewView(
            mealLabel: $mealLabel,
            mealNotes: $mealNotes,
            items: $items,
            onSave: {
                saveMeal()
            },
            onCancel: {
                withAnimation {
                    stage = .input
                }
            },
            errorMessage: errorMessage
        )
    }
    
    private func startAnalysis() {
        stage = .analyzing
        errorMessage = nil
        statusMessage = "Analyzing ingredients..."
        
        Task {
            do {
                // Fresh, auto-refreshed Supabase access token for the API's
                // Bearer-auth path (native clients have no session cookie).
                let accessToken = try await appState.supabaseManager.supabase.auth.session.accessToken
                let stream = try await analysisService.analyzeMeal(
                    image: photoData,
                    voice: voiceData,
                    typedText: typedText.isEmpty ? nil : typedText,
                    transcript: nil,
                    accessToken: accessToken
                )
                
                var receivedResult = false
                for try await analysis in stream {
                    receivedResult = true
                    await MainActor.run {
                        self.mealLabel = analysis.mealLabel
                        self.mealNotes = analysis.notes ?? ""
                        self.items = analysis.items
                        self.stage = .review
                    }
                }

                // Stream completed without any parseable result — surface a failure
                // instead of leaving the user stuck on "Analyzing ingredients...".
                if !receivedResult {
                    await MainActor.run {
                        self.errorMessage = "No ingredients could be identified. Please try again."
                        self.stage = .input
                    }
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = "Analysis failed: \(error.localizedDescription)"
                    self.stage = .input
                }
            }
        }
    }
    
    private func saveMeal() {
        guard let userId = appState.supabaseManager.currentUserId else { return }
        
        let totalKcal = items.reduce(0.0) { $0 + ($1.kcalPer100g * $1.grams / 100) }
        let totalProtein = items.reduce(0.0) { $0 + (($1.proteinPer100g ?? 0) * $1.grams / 100) }
        let totalCarb = items.reduce(0.0) { $0 + (($1.carbPer100g ?? 0) * $1.grams / 100) }
        let totalFat = items.reduce(0.0) { $0 + (($1.fatPer100g ?? 0) * $1.grams / 100) }
        
        let mealId = UUID()
        let meal = Meal(
            id: mealId,
            userId: userId,
            consumedAt: Date(),
            mealType: "lunch",
            photoPath: nil,
            voiceTranscript: nil,
            totalKcal: totalKcal,
            totalProteinG: totalProtein,
            totalCarbG: totalCarb,
            totalFatG: totalFat,
            errorBandLow: totalKcal * 0.9,
            errorBandHigh: totalKcal * 1.1,
            geminiRaw: nil,
            createdAt: Date(),
            editedAt: nil
        )
        
        var mealItems: [MealItem] = []
        for item in items {
            let mealItem = MealItem(
                id: UUID(),
                mealId: mealId,
                userId: userId,
                foodName: item.usdaQuery,
                displayName: item.displayName,
                grams: item.grams,
                kcal: item.kcalPer100g * item.grams / 100,
                proteinG: item.proteinPer100g.map { $0 * item.grams / 100 },
                carbG: item.carbPer100g.map { $0 * item.grams / 100 },
                fatG: item.fatPer100g.map { $0 * item.grams / 100 },
                loggingMode: item.loggingMode,
                userProvidedGrams: item.userProvidedGrams,
                source: "gemini_estimate",
                sourceRef: nil,
                matchConfidence: 1.0,
                userEdited: false
            )
            mealItems.append(mealItem)
        }
        
        Task {
            do {
                try await appState.supabaseManager.insertMeal(meal: meal, items: mealItems)
                await MainActor.run {
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = "Failed to save: \(error.localizedDescription)"
                }
            }
        }
    }
}
