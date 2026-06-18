import Foundation
import AVFoundation

@Observable
class AudioRecorder: NSObject, AVAudioRecorderDelegate {
    var isRecording = false
    var audioData: Data? = nil
    var errorMessage: String? = nil
    
    private var audioRecorder: AVAudioRecorder?
    private var fileURL: URL?
    
    func startRecording() {
        let session = AVAudioSession.sharedInstance()
        errorMessage = nil
        
        // Request microphone permission first
        session.requestRecordPermission { [weak self] granted in
            guard let self = self else { return }
            
            guard granted else {
                DispatchQueue.main.async {
                    self.errorMessage = "Microphone access denied."
                }
                return
            }
            
            do {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
                try session.setActive(true)
                
                let documentsPath = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                let audioFilename = documentsPath.appendingPathComponent("voice_log.m4a")
                self.fileURL = audioFilename
                
                let settings: [String: Any] = [
                    AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                    AVSampleRateKey: 12000,
                    AVNumberOfChannelsKey: 1,
                    AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
                ]
                
                DispatchQueue.main.async {
                    do {
                        self.audioRecorder = try AVAudioRecorder(url: audioFilename, settings: settings)
                        self.audioRecorder?.delegate = self
                        self.audioRecorder?.record()
                        self.isRecording = true
                    } catch {
                        self.errorMessage = "Failed to create audio recorder: \(error.localizedDescription)"
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    self.errorMessage = "Failed to configure audio session: \(error.localizedDescription)"
                }
            }
        }
    }
    
    func stopRecording() {
        audioRecorder?.stop()
        isRecording = false
        
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false)
        
        if let fileURL = fileURL {
            do {
                let data = try Data(contentsOf: fileURL)
                self.audioData = data
            } catch {
                self.errorMessage = "Failed to read recorded audio data: \(error.localizedDescription)"
            }
        }
    }
}
