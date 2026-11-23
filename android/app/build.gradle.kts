plugins {
    id("com.android.application")
}

android {
    namespace = "com.megaanime.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.megaanime.app"
        minSdk = 24
        targetSdk = 34
        versionCode = (project.findProperty("megaVersionCode") as String? ?: "2").toInt()
        versionName = (project.findProperty("megaVersionName") as String? ?: "1.3")
        resourceConfigurations += listOf("pt-rBR", "pt", "en")
    }

    /* Assinatura é feita no diálogo do Android Studio
       (Build > Generate Signed App Bundle / APK), com V1 e V2 marcados. */

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE",
                "META-INF/LICENSE.txt",
                "META-INF/NOTICE",
                "META-INF/NOTICE.txt",
                "META-INF/*.kotlin_module"
            )
        }
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

/* FIX: espelha web/ -> assets/web e copia assets/config.js antes de todo build */
val syncWeb by tasks.registering(Exec::class) {
    workingDir = rootProject.file("..")
    commandLine("node", "scripts/sync-web.mjs")
    isIgnoreExitValue = false
}

tasks.named("preBuild") {
    dependsOn(syncWeb)
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    /* FIX: scraping nativo do HTML do episódio (NativeScraperBridge) */
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}