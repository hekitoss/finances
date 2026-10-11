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

Allowed users live in `bot.properties`, one `telegramId=PersonName` per line (the name must match the
`persons` table). Unknown users get their id in the bot's reply. Restart the server after editing the file.

Environment variables:

| Variable | Description |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `ANTHROPIC_API_KEY` | Claude API key |
| `CLAUDE_MODEL` | Optional, defaults to `claude-opus-5-5` |
| `TELEGRAM_USERS_FILE` | Optional path to the users file, defaults to `bot.properties` |
| `TELEGRAM_USERS` | Optional extra users, `telegramId:PersonName,...`; overrides `bot.properties` |

```powershell
$env:TELEGRAM_BOT_TOKEN="..."; $env:ANTHROPIC_API_KEY="..."
.\gradlew.bat run
```
