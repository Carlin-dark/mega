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

    /* FIX: as fontes do módulo ficam em ../src/main (java, assets, res e manifesto) */
    sourceSets["main"].apply {
        manifest.srcFile("../src/main/AndroidManifest.xml")
        java.srcDirs("src/main/java", "../src/main/java")
        res.srcDirs("src/main/res", "../src/main/res")
        assets.srcDirs("src/main/assets", "../src/main/assets")
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

/* FIX: kotlin-stdlib-jdk7/jdk8 antigos duplicam classes com a stdlib 1.8.22 */
configurations.all {
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk7")
    exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk8")
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

/* FIX: lintVital quebra no Gradle 9 com AGP 8.5 (NoSuchMethodError em kotlin.sequences) */
tasks.matching { it.name.startsWith("lintVital") }.configureEach { enabled = false }

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
}