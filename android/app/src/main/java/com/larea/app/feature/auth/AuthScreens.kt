package com.larea.app.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.larea.app.R
import com.larea.app.ui.components.ErrorText
import com.larea.app.ui.components.ScreenColumn

@Composable
fun SignInScreen(onCreateAccount: () -> Unit, viewModel: AuthViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    ScreenColumn(title = stringResource(R.string.auth_sign_in)) {
        OutlinedTextField(
            value = email, onValueChange = { email = it }, label = { Text(stringResource(R.string.auth_email)) },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password, onValueChange = { password = it }, label = { Text(stringResource(R.string.auth_password)) },
            singleLine = true, visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth(),
        )
        ErrorText(state.error)
        Button(onClick = { viewModel.signIn(email, password) }, enabled = !state.busy && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.auth_sign_in))
        }
        TextButton(onClick = onCreateAccount) { Text(stringResource(R.string.auth_no_account)) }
    }
}

@Composable
fun SignUpScreen(onHaveAccount: () -> Unit, viewModel: AuthViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var displayName by rememberSaveable { mutableStateOf("") }

    ScreenColumn(title = stringResource(R.string.auth_sign_up)) {
        OutlinedTextField(
            value = displayName, onValueChange = { displayName = it }, label = { Text(stringResource(R.string.auth_display_name)) },
            supportingText = { Text(stringResource(R.string.auth_display_name_hint)) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = email, onValueChange = { email = it }, label = { Text(stringResource(R.string.auth_email)) },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password, onValueChange = { password = it }, label = { Text(stringResource(R.string.auth_password)) },
            supportingText = { Text(stringResource(R.string.auth_password_hint)) }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )
        ErrorText(state.error)
        Button(
            onClick = { viewModel.signUp(email, password, displayName) },
            enabled = !state.busy && email.isNotBlank() && password.length >= 10 && displayName.length >= 3,
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.auth_sign_up)) }
        TextButton(onClick = onHaveAccount) { Text(stringResource(R.string.auth_have_account)) }
    }
}
