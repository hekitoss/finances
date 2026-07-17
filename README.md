# Finances — Kotlin project

This is a minimal Kotlin/JVM project scaffold for the `finances` workspace.

Quick start:
```cmd
npm run dev
```

Quick start (PowerShell):

1) (Optional) Add Gradle wrapper (recommended):

```powershell
gradle wrapper --gradle-version 8.6
```

2) Build:

```powershell
# with wrapper
.\gradlew.bat build

# or with system gradle
gradle build
```

3) Run:

```powershell
# with wrapper
.\gradlew.bat run

# or with system gradle
gradle run
```

If you run with `java -jar`, build a fat jar first:

```powershell
.\gradlew.bat shadowJar
java -jar .\build\libs\finances-all.jar
```

4) Tests:

```powershell
.\gradlew.bat test
```

Notes
- Project uses Kotlin 1.9.0 and JVM target 17.
- The repository already contains `db-script/init.sql` and a `docker-compose.yml` — you can run Postgres with `docker compose up -d` and apply the SQL script using a DB client or `psql`.
- If you want the Gradle wrapper included now, run the wrapper command above; otherwise use your system Gradle.

