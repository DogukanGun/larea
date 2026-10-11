import SwiftUI

/// Two steps on one screen: ask for a code by email, then enter it with a new password.
/// A successful reset saves the session, so the app leaves the auth flow like after signing in.
struct ForgotPasswordView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model: AuthViewModel?
    @State private var email: String
    @State private var sentTo: String?
    @State private var code = ""
    @State private var password = ""
    @State private var attempted = false
    @State private var resent = false
    @FocusState private var focus: FormField?

    init(initialEmail: String) {
        _email = State(initialValue: initialEmail)
    }

    private var emailError: String? { attempted && sentTo == nil ? Validation.email(email) : nil }
    private var codeError: String? { attempted && sentTo != nil ? Validation.resetCode(code) : nil }
    private var passwordError: String? { attempted && sentTo != nil ? Validation.password(password) : nil }

    var body: some View {
        Group {
            if let sentTo {
                ScreenScaffold(title: "Check your email", subtitle: "If an account exists for \(sentTo), we sent a 6-digit code. It expires in 15 minutes.") {
                    VStack(spacing: Spacing.l) {
                        LareaField(label: "Code", text: $code, placeholder: "123456", error: codeError, keyboard: .numberPad, contentType: .oneTimeCode, focus: $focus, field: .code, identifier: "reset.code") { focus = .password }
                            .onChange(of: code) { _, new in
                                let digits = String(new.filter(\.isNumber).prefix(6))
                                if digits != new { code = digits }
                            }
                        LareaField(label: "New password", text: $password, placeholder: "At least 10 characters", isSecure: true, error: passwordError, contentType: .newPassword, submitLabel: .go, focus: $focus, field: .password, identifier: "reset.password") { reset() }
                        if let error = model?.error { InlineError(text: error) }
                        PrimaryButton(title: "Reset password", isLoading: model?.busy ?? false, identifier: "reset.submit", action: reset)
                        if resent {
                            Label("New code sent", systemImage: "checkmark.circle.fill")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Color.brandPrimary)
                                .frame(maxWidth: .infinity)
                        } else {
                            LinkButton(title: "Send a new code", action: resend)
                        }
                    }
                    .padding(.top, Spacing.s)
                }
            } else {
                ScreenScaffold(title: "Forgot your password?", subtitle: "No worries. We'll email you a code to set a new one.") {
                    VStack(spacing: Spacing.l) {
                        LareaField(label: "Email", text: $email, placeholder: "you@example.com", error: emailError, keyboard: .emailAddress, contentType: .emailAddress, submitLabel: .send, focus: $focus, field: .email, identifier: "reset.email") { send() }
                        if let error = model?.error { InlineError(text: error) }
                        PrimaryButton(title: "Send code", isLoading: model?.busy ?? false, identifier: "reset.send", action: send)
                    }
                    .padding(.top, Spacing.s)
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .animation(.easeOut(duration: 0.2), value: sentTo)
        .onAppear {
            if model == nil { model = AuthViewModel(sessions: env.sessions) }
            if focus == nil { focus = sentTo == nil ? .email : .code }
        }
    }

    private func send() {
        attempted = true
        guard emailError == nil else { return }
        focus = nil
        let address = email.trimmingCharacters(in: .whitespaces)
        Task {
            guard await model?.sendResetCode(email: address) == true else { return }
            attempted = false
            sentTo = address
            focus = .code
        }
    }

    private func resend() {
        guard let sentTo else { return }
        Task {
            guard await model?.sendResetCode(email: sentTo) == true else { return }
            resent = true
            try? await Task.sleep(for: .seconds(30))
            resent = false
        }
    }

    private func reset() {
        attempted = true
        guard let sentTo, codeError == nil, passwordError == nil else { return }
        focus = nil
        Task { await model?.resetPassword(email: sentTo, code: code, password: password) }
    }
}
