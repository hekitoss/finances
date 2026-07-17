plugins {
    kotlin("jvm") version "1.9.0"
    kotlin("plugin.serialization") version "1.9.0"
    application
}

repositories {
    mavenCentral()
}

kotlin {
    jvmToolchain(17)
}

application {
    // main class for running the Ktor server
    mainClass.set("ServerKt")
}

val ktorVersion = "2.3.2"


dependencies {
    implementation("org.postgresql:postgresql:42.6.0") // optional: JDBC driver for Postgres
    implementation("com.zaxxer:HikariCP:5.0.1") // connection pool
    implementation("org.slf4j:slf4j-simple:2.0.7") // simple logging for Hikari
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-server-netty:$ktorVersion")
    implementation("io.ktor:ktor-server-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
    implementation("io.ktor:ktor-server-cors:$ktorVersion")
    implementation("io.ktor:ktor-server-call-logging:$ktorVersion")
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
}

