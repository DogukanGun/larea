import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.larea.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.dogukangundogan.larea"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // play: Google Play and the App Store twin. solana: the Solana dApp Store build with check-in stamps,
    // tips and USDC payments (see ../docs/solana.md). Same app, same name, separate package.
    flavorDimensions += "store"
    productFlavors {
        create("play") {
            dimension = "store"
            buildConfigField("boolean", "SOLANA", "false")
        }
        create("solana") {
            dimension = "store"
            applicationIdSuffix = ".solana"
            buildConfigField("boolean", "SOLANA", "true")
        }
    }

    // Release signing comes from android/keystore.properties (never committed): storeFile, storePassword,
    // keyAlias, keyPassword. Without it, release builds are unsigned.
    val keystore = rootProject.file("keystore.properties").takeIf { it.exists() }?.let { file -> Properties().apply { file.inputStream().use(::load) } }
    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = file(keystore.getProperty("storeFile"))
                storePassword = keystore.getProperty("storePassword")
                keyAlias = keystore.getProperty("keyAlias")
                keyPassword = keystore.getProperty("keyPassword")
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        debug {
            // Android emulator → host machine; override with -Plarea.devHost=10.0.2.2:3001 when 3000 is taken.
            val devHost = providers.gradleProperty("larea.devHost").getOrElse("10.0.2.2:3000")
            buildConfigField("String", "API_BASE_URL", "\"http://$devHost/\"")
            buildConfigField("String", "WS_URL", "\"ws://$devHost/ws\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
            buildConfigField("String", "API_BASE_URL", "\"https://larea.dogukangundogan.com/\"")
            buildConfigField("String", "WS_URL", "\"wss://larea.dogukangundogan.com/ws\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        // Robolectric reaches into FileDescriptor internals on JDK 17+.
        unitTests.all { it.jvmArgs("--add-opens=java.base/java.io=ALL-UNNAMED") }
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.material.icons.extended)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.exifinterface)
    implementation(libs.androidx.core.splashscreen)

    implementation(libs.maplibre)
    implementation(libs.coil.compose)
    implementation(libs.coil.okhttp)
    implementation(libs.play.age.signals)
    "solanaImplementation"(libs.solana.mwa)
    "playImplementation"(libs.play.billing)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.navigation.compose)

    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.kotlin.test)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(libs.androidx.test.espresso)
    androidTestImplementation(libs.androidx.test.core)
    debugImplementation(libs.compose.ui.test.manifest)
}
