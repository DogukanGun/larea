package com.larea.app.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.larea.app.core.format.Validation
import com.larea.app.ui.components.InlineError
import com.larea.app.ui.components.LareaField
import com.larea.app.ui.components.LareaTopBar
import com.larea.app.ui.components.LinkButton
import com.larea.app.ui.components.LogoMark
import com.larea.app.ui.components.PrimaryButton
import com.larea.app.ui.components.ScreenScaffold
import com.larea.app.ui.components.SecondaryButton
import com.larea.app.ui.theme.Larea
import com.larea.app.ui.theme.LareaType
import com.larea.app.ui.theme.Rounded
import com.larea.app.ui.theme.Spacing
import kotlinx.serialization.Serializable

@Serializable private data object Welcome
@Serializable private data object SignIn
@Serializable private data object SignUp

/** Welcome, then sign in or sign up (iOS `AuthFlowView`). */
@Composable
fun AuthFlow() {
    val nav = rememberNavController()
    NavHost(nav, startDestination = Welcome) {
        composable<Welcome> {
            WelcomeScreen(onCreateAccount = { nav.navigate(SignUp) }, onSignIn = { nav.navigate(SignIn) })
        }
        composable<SignIn> {
            SignInScreen(onBack = { nav.popBackStack() }, onCreateAccount = { nav.navigate(SignUp) { popUpTo(Welcome) } })
        }
        composable<SignUp> {
            SignUpScreen(onBack = { nav.popBackStack() }, onSignIn = { nav.navigate(SignIn) { popUpTo(Welcome) } })
        }
    }
}

@Composable
fun WelcomeScreen(onCreateAccount: () -> Unit, onSignIn: () -> Unit) {
    val c = Larea.colors
    Column(
        Modifier
            .fillMaxSize()
            .background(c.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = Spacing.screen)
            .padding(bottom = Spacing.xl),
    ) {
        Spacer(Modifier.weight(1f))
        Box(Modifier.fillMaxWidth().height(240.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.offset(x = (-40).dp, y = (-10).dp).size(220.dp).background(c.brandTint, CircleShape))
            Box(Modifier.offset(x = 110.dp, y = 60.dp).size(90.dp).background(c.sunny.copy(alpha = 0.35f), CircleShape))
            LogoMark(size = 120.dp)
        }
        Spacer(Modifier.height(Spacing.xxl))
        Text("Larea", fontFamily = Rounded, fontWeight = FontWeight.Black, fontSize = 44.sp, color = c.text)
        Text("Talk to the people around you.", style = LareaType.title2, color = c.text, modifier = Modifier.padding(top = Spacing.s))
        Text(
            "Every chat belongs to a real place, and everyone in it is standing there right now.",
            style = LareaType.body,
            color = c.secondaryText,
            modifier = Modifier.padding(top = Spacing.s),
        )
        Spacer(Modifier.weight(1f))
        Column(verticalArrangement = Arrangement.spacedBy(Spacing.m)) {
            PrimaryButton("Create account", onClick = onCreateAccount, tag = "welcome.create")
            SecondaryButton("Sign in", onClick = onSignIn, tag = "welcome.signin")
        }
    }
}

@Composable
fun SignInScreen(onBack: () -> Unit, onCreateAccount: () -> Unit, model: AuthViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var attempted by rememberSaveable { mutableStateOf(false) }
    val emailFocus = remember { FocusRequester() }
    val passwordFocus = remember { FocusRequester() }
    val focus = LocalFocusManager.current

    val emailError = if (attempted) Validation.email(email) else null
    val passwordError = if (attempted && password.isEmpty()) "Enter your password." else null

    fun submit() {
        attempted = true
        if (Validation.email(email) != null || password.isEmpty()) return
        focus.clearFocus()
        model.signIn(email, password)
    }

    LaunchedEffect(Unit) { emailFocus.requestFocus() }
    ScreenScaffold(
        title = "Welcome back",
        subtitle = "Sign in to see who's around.",
        topBar = { LareaTopBar("", onBack = onBack, background = Larea.colors.background) },
    ) {
        LareaField(
            "Email", email, { email = it }, placeholder = "you@example.com", error = emailError,
            keyboardType = KeyboardType.Email, focusRequester = emailFocus, tag = "signin.email",
            onSubmit = { passwordFocus.requestFocus() },
        )
        LareaField(
            "Password", password, { password = it }, placeholder = "Your password", secure = true, error = passwordError,
            imeAction = ImeAction.Go, focusRequester = passwordFocus, tag = "signin.password", onSubmit = ::submit,
        )
        state.error?.let { InlineError(it) }
        PrimaryButton("Sign in", onClick = ::submit, loading = state.busy, tag = "signin.submit")
        LinkButton("New here? Create an account", onClick = onCreateAccount)
    }
}

@Composable
fun SignUpScreen(onBack: () -> Unit, onSignIn: () -> Unit, model: AuthViewModel = hiltViewModel()) {
    val state by model.state.collectAsStateWithLifecycle()
    var displayName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var attempted by rememberSaveable { mutableStateOf(false) }
    val nameFocus = remember { FocusRequester() }
    val emailFocus = remember { FocusRequester() }
    val passwordFocus = remember { FocusRequester() }
    val focus = LocalFocusManager.current

    val nameError = if (attempted) Validation.displayName(displayName) else null
    val emailError = if (attempted) Validation.email(email) else null
    val passwordError = if (attempted) Validation.password(password) else null

    fun submit() {
        attempted = true
        if (Validation.displayName(displayName) != null || Validation.email(email) != null || Validation.password(password) != null) return
        focus.clearFocus()
        model.signUp(email, password, displayName)
    }

    LaunchedEffect(Unit) { nameFocus.requestFocus() }
    ScreenScaffold(
        title = "Create your account",
        subtitle = "Pick a name people will see in chats. Your email stays private.",
        topBar = { LareaTopBar("", onBack = onBack, background = Larea.colors.background) },
    ) {
        LareaField(
            "Display name", displayName, { displayName = it }, placeholder = "e.g. anna_k", error = nameError,
            focusRequester = nameFocus, tag = "signup.displayName", onSubmit = { emailFocus.requestFocus() },
        )
        LareaField(
            "Email", email, { email = it }, placeholder = "you@example.com", error = emailError,
            keyboardType = KeyboardType.Email, focusRequester = emailFocus, tag = "signup.email",
            onSubmit = { passwordFocus.requestFocus() },
        )
        LareaField(
            "Password", password, { password = it }, placeholder = "At least 10 characters", secure = true, error = passwordError,
            imeAction = ImeAction.Go, focusRequester = passwordFocus, tag = "signup.password", onSubmit = ::submit,
        )
        state.error?.let { InlineError(it) }
        PrimaryButton("Create account", onClick = ::submit, loading = state.busy, tag = "signup.submit")
        Text(
            "You'll verify that you're 18 or older next. We only keep whether you passed.",
            style = LareaType.footnote,
            color = Larea.colors.secondaryText,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        LinkButton("Already have an account? Sign in", onClick = onSignIn)
    }
}
