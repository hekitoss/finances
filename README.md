# Finances — Kotlin project

This is a minimal Kotlin/JVM project scaffold for the `finances` workspace.

Quick start:
```cmd
npm run dev -- --host
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


## Telegram bot (AI)

The server starts a Telegram bot when `TELEGRAM_BOT_TOKEN` is set. Send it an amount and what it was for
(`12.50 кофе`, `вчера 30 аптека`, `зарплата 4200`) — Claude picks the category/subcategory and the bot
inserts a transaction. Each reply has an "↩️ Отменить" button that deletes the row.

Environment variables:

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_USERS` | Allowed users, `telegramId:PersonName,...` (e.g. `123456:Nikita,789012:Natasha`). Unknown users get their id in the reply. |
| `ANTHROPIC_API_KEY` | Claude API key |
| `CLAUDE_MODEL` | Optional, defaults to `claude-opus-5-5` |

```powershell
$env:TELEGRAM_BOT_TOKEN="..."; $env:TELEGRAM_USERS="123456:Nikita"; $env:ANTHROPIC_API_KEY="..."
.\gradlew.bat run
```
