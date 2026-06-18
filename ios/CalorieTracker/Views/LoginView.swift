import SwiftUI

struct LoginView: View {
    @Environment(AppState.self) private var appState
    
    @State private var email: String = ""
    @State private var verificationCode: String = ""
    @State private var codeSent: Bool = false
    @State private var isSendingCode: Bool = false
    @State private var isVerifyingCode: Bool = false
    @State private var errorMessage: String?
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                
                Image("AppLogo")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 80, height: 80)
                
                VStack(spacing: 8) {
                    Text("Calorie Tracker")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    Text("Track calories, macros, and water logs")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.bottom, 24)
                
                VStack(alignment: .leading, spacing: 16) {
                    if !codeSent {
                        // Email input stage
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email Address")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(.secondary)
                            
                            TextField("name@example.com", text: $email)
                                .keyboardType(.emailAddress)
                                .textInputAutocapitalization(.never)
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                        }
                        
                        Button {
                            sendCode()
                        } label: {
                            HStack {
                                Spacer()
                                if isSendingCode {
                                    ProgressView()
                                        .controlSize(.small)
                                        .tint(.white)
                                } else {
                                    Text("Send Verification Code")
                                }
                                Spacer()
                            }
                            .padding()
                            .background(email.isEmpty ? Color.gray : Color("BrandOrange"))
                            .foregroundStyle(.white)
                            .fontWeight(.semibold)
                            .cornerRadius(10)
                        }
                        .disabled(email.isEmpty || isSendingCode)
                        
                    } else {
                        // Verification code input stage
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Enter the verification code sent to \(email)")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding(.bottom, 8)
                            
                            Text("Verification Code")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(.secondary)
                            
                            TextField("123456", text: $verificationCode)
                                .keyboardType(.numberPad)
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                        }
                        
                        Button {
                            verifyCode()
                        } label: {
                            HStack {
                                Spacer()
                                if isVerifyingCode {
                                    ProgressView()
                                        .controlSize(.small)
                                        .tint(.white)
                                } else {
                                    Text("Verify & Sign In")
                                }
                                Spacer()
                            }
                            .padding()
                            .background(verificationCode.isEmpty ? Color.gray : Color("BrandOrange"))
                            .foregroundStyle(.white)
                            .fontWeight(.semibold)
                            .cornerRadius(10)
                        }
                        .disabled(verificationCode.isEmpty || isVerifyingCode)
                        
                        Button {
                            withAnimation {
                                codeSent = false
                                verificationCode = ""
                                errorMessage = nil
                            }
                        } label: {
                            Text("Change Email")
                                .font(.subheadline)
                                .foregroundStyle(Color("BrandOrange"))
                        }
                        .padding(.top, 8)
                    }
                    
                    if let errorMessage = errorMessage {
                        Text(errorMessage)
                            .font(.subheadline)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                            .padding(.top, 8)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding()
                .background(Color(.systemBackground))
                .cornerRadius(12)
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(.systemGray5), lineWidth: 1)
                )
                
                Spacer()
            }
            .padding(24)
        }
    }
    
    private func sendCode() {
        guard !email.isEmpty else { return }
        isSendingCode = true
        errorMessage = nil
        
        Task {
            do {
                try await appState.supabaseManager.sendOTP(email: email)
                await MainActor.run {
                    isSendingCode = false
                    codeSent = true
                }
            } catch {
                await MainActor.run {
                    isSendingCode = false
                    errorMessage = "Failed to send code: \(error.localizedDescription)"
                }
            }
        }
    }
    
    private func verifyCode() {
        guard !verificationCode.isEmpty else { return }
        isVerifyingCode = true
        errorMessage = nil
        
        Task {
            do {
                try await appState.supabaseManager.verifyOTP(email: email, code: verificationCode)
                await MainActor.run {
                    isVerifyingCode = false
                    appState.isLoggedIn = true
                }
            } catch {
                await MainActor.run {
                    isVerifyingCode = false
                    errorMessage = "Verification failed: \(error.localizedDescription)"
                }
            }
        }
    }
}
