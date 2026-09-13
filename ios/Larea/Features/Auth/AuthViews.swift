import SwiftUI

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model: AuthViewModel?
    @State private var email = ""
    @State private var password = ""
    @State private var attempted = false
    @FocusState private var focus: FormField?
    let onCreateAccount: () -> Void

    private var emailError: String? { attempted ? Validation.email(email) : nil }
    private var passwordError: String? { attempted && password.isEmpty ? "Enter your password." : nil }

    var body: some View {
        ScreenScaffold(title: "Welcome back", subtitle: "Sign in to see who's around.") {
            VStack(spacing: Spacing.l) {
                LareaField(label: "Email", text: $email, placeholder: "you@example.com", error: emailError, keyboard: .emailAddress, contentType: .emailAddress, focus: $focus, field: .email, identifier: "signin.email") { focus = .password }
                LareaField(label: "Password", text: $password, placeholder: "Your password", isSecure: true, error: passwordError, contentType: .password, submitLabel: .go, focus: $focus, field: .password, identifier: "signin.password") { submit() }
                if let error = model?.error { InlineError(text: error) }
                PrimaryButton(title: "Sign in", isLoading: model?.busy ?? false, identifier: "signin.submit", action: submit)
                LinkButton(title: "New here? Create an account", action: onCreateAccount)
            }
            .padding(.top, Spacing.s)
        }
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if model == nil { model = AuthViewModel(sessions: env.sessions) }
            if focus == nil { focus = .email }
        }
    }

    private func submit() {
        attempted = true
        guard emailError == nil, passwordError == nil else { return }
        focus = nil
        Task { await model?.signIn(email: email, password: password) }
    }
}

struct SignUpView: View {
    @Environment(AppEnvironment.self) private var env
    @State private var model: AuthViewModel?
    @State private var displayName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var attempted = false
    @FocusState private var focus: FormField?
    let onSignIn: () -> Void

    private var nameError: String? { attempted ? Validation.displayName(displayName) : nil }
    private var emailError: String? { attempted ? Validation.email(email) : nil }
    private var passwordError: String? { attempted ? Validation.password(password) : nil }

    var body: some View {
        ScreenScaffold(title: "Create your account", subtitle: "Pick a name people will see in chats. Your email stays private.") {
            VStack(spacing: Spacing.l) {
                LareaField(label: "Display name", text: $displayName, placeholder: "e.g. anna_k", error: nameError, contentType: .nickname, focus: $focus, field: .displayName, identifier: "signup.displayName") { focus = .email }
                LareaField(label: "Email", text: $email, placeholder: "you@example.com", error: emailError, keyboard: .emailAddress, contentType: .emailAddress, focus: $focus, field: .email, identifier: "signup.email") { focus = .password }
                LareaField(label: "Password", text: $password, placeholder: "At least 10 characters", isSecure: true, error: passwordError, contentType: .newPassword, submitLabel: .go, focus: $focus, field: .password, identifier: "signup.password") { submit() }
                if let error = model?.error { InlineError(text: error) }
                PrimaryButton(title: "Create account", isLoading: model?.busy ?? false, identifier: "signup.submit", action: submit)
                Text("You'll verify that you're 18 or older next. We only keep whether you passed.")
                    .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: .infinity)
                LinkButton(title: "Already have an account? Sign in", action: onSignIn)
            }
            .padding(.top, Spacing.s)
        }
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if model == nil { model = AuthViewModel(sessions: env.sessions) }
            if focus == nil { focus = .displayName }
        }
    }

    private func submit() {
        attempted = true
        guard nameError == nil, emailError == nil, passwordError == nil else { return }
        focus = nil
        Task { await model?.signUp(email: email, password: password, displayName: displayName) }
    }
}
