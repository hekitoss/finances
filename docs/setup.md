# Установка и запуск

## Требования

| Что | Версия | Зачем |
|---|---|---|
| JDK | 17+ | Kotlin-сервер (Gradle wrapper скачает Gradle сам) |
| Node.js | 18+ | Сборка фронтенда |
| Docker | любая актуальная | PostgreSQL |

## 1. База данных

```powershell
docker compose up -d
```

Поднимается контейнер `finances_db` (PostgreSQL 16) на порту `5432`. Данные хранятся в томе `finances_pg_data` и переживают перезапуск контейнера.

Создание схемы и стартовых данных (категории, люди, несколько примеров транзакций):

```powershell
Get-Content db-script/init.sql -Raw | docker exec -i finances_db psql -U finances_user -d finances
```

Для уже существующей базы, созданной до появления позиций чека, примените миграцию:

```powershell
Get-Content db-script/migrate_add_transaction_items.sql -Raw | docker exec -i finances_db psql -U finances_user -d finances
```

Подробности схемы — в [database.md](database.md).

## 2. Фронтенд

```powershell
cd frontend
npm install
npm run build
```

Сборка попадает в `frontend/dist`, откуда её раздаёт Kotlin-сервер. Пересобирать нужно после каждого изменения в `frontend/src`.

Для разработки интерфейса с горячей перезагрузкой:

```powershell
cd frontend
npm run dev -- --host
```

Vite запустится на `:5173` и будет проксировать `/api` на `localhost:8080`, поэтому сервер должен работать параллельно.

## 3. Сервер

```powershell
.\gradlew.bat run
```

Сайт: http://localhost:8080. Сервер нужно запускать из корня проекта — он ищет фронтенд по относительному пути `frontend/dist`.

Сборка одного jar со всеми зависимостями:

```powershell
.\gradlew.bat shadowJar
java -jar build\libs\finances-all.jar
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `8080` | Порт веб-сервера |
| `DB_URL` | `jdbc:postgresql://localhost:5432/finances` | Адрес базы |
| `DB_USER` | `finances_user` | Пользователь базы |
| `DB_PASSWORD` | `change_me_please` | Пароль базы (смените вместе с `docker-compose.yml`) |
| `TELEGRAM_BOT_TOKEN` | — | Токен бота от @BotFather. Без него бот не запускается, сайт работает |
| `TELEGRAM_USERS_FILE` | `bot.properties` | Путь к файлу с разрешёнными пользователями |
| `TELEGRAM_USERS` | — | Дополнительные пользователи `id:Имя,id:Имя`; перекрывают файл |
| `AI_PROVIDER` | `gemini`, если задан `GEMINI_API_KEY`, иначе `claude` | Какой ИИ разбирает сообщения и чеки |
| `GEMINI_API_KEY` | — | Ключ Gemini API |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Модель Gemini |
| `ANTHROPIC_API_KEY` | — | Ключ Claude API (при `AI_PROVIDER=claude`) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Модель Claude |

Постоянно задать переменную в Windows (после этого перезапустите терминал):

```powershell
setx GEMINI_API_KEY "AIza..."
```

## Настройка Telegram-бота

1. **Токен бота.** В Telegram откройте @BotFather → `/newbot` → задайте имя и username (должен оканчиваться на `bot`). Сохраните токен в `TELEGRAM_BOT_TOKEN`.
2. **Ключ ИИ.**
   - *Gemini (бесплатный тариф):* https://aistudio.google.com/apikey → **Create API key**. Не включайте billing — тогда списаний не будет. Сохраните в `GEMINI_API_KEY`.
   - *Claude (платно, по факту использования):* https://console.anthropic.com → Billing (пополнить баланс) → API Keys. Сохраните в `ANTHROPIC_API_KEY` и задайте `AI_PROVIDER=claude`. Подписка Claude Pro/Max на API не распространяется.
3. **Разрешённые пользователи.** Узнайте свой Telegram id (напишите @userinfobot или просто напишите боту — он ответит id) и добавьте его в `bot.properties`:

   ```properties
   123456789=Nikita
   987654321=Natasha
   ```

   Имя должно совпадать с записью в таблице `persons`. Файл читается при старте сервера.
4. Перезапустите сервер. В логе должны появиться строки `Expense parser provider: gemini` и `Telegram bot started (...)`. Напишите боту `/start`.

## Доступ с телефона

### В домашней сети

1. Узнайте IP компьютера в локальной сети (`ipconfig`, например `192.168.0.245`).
2. Разрешите входящие подключения на порт 8080 (PowerShell от администратора):

   ```powershell
   New-NetFirewallRule -DisplayName "Finances 8080" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private
   ```

   Сеть в Windows должна быть отмечена как «Частная».
3. Откройте `http://<IP>:8080` в Safari на iPhone → «Поделиться» → «На экран „Домой“». Сайт будет открываться без адресной строки, как приложение.

Закрепите за компьютером постоянный IP в настройках роутера (DHCP reservation), иначе ярлык перестанет работать после смены адреса.

### Вне дома

Установите [Tailscale](https://tailscale.com) на компьютер и телефон и открывайте сайт по Tailscale-адресу компьютера. Порт наружу открывать не нужно.

## Безопасность

- **У сайта и REST API нет авторизации.** Любой, кто может открыть порт 8080, может читать и удалять данные. Не делайте проброс порта на роутере.
- **Секреты** — `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` — только в переменных окружения. При утечке: `/revoke` у @BotFather, удаление ключа в AI Studio или Anthropic Console.
- **Пароль базы** по умолчанию (`change_me_please`) записан в `docker-compose.yml` и `Database.kt`. Если база доступна не только с этого компьютера — смените его.
- **Telegram id** не является секретом: бот проверяет поле `from.id`, которое проставляют серверы Telegram, подделать его нельзя.
- **Данные для ИИ.** В Gemini/Claude уходят текст сообщения или файл чека и список категорий. На бесплатном тарифе Gemini Google может использовать запросы для улучшения моделей.

## Решение проблем

| Симптом | Причина и решение |
|---|---|
| Сайт не открывается с телефона | Брандмауэр Windows или сеть отмечена как «Общедоступная» — см. «Доступ с телефона» |
| Бот молчит | Не задан `TELEGRAM_BOT_TOKEN` или сервер не перезапущен после `setx`; проверьте строку `Telegram bot started` в логе |
| Бот отвечает «Нет доступа» | Ваш id не добавлен в `bot.properties`; бот пишет id в ответе |
| «Превышен лимит бесплатных запросов Gemini» | Исчерпан бесплатный лимит; лимиты видны в AI Studio → Rate limit |
| `Gemini HTTP 4xx` | Неверный ключ или модель; проверьте `GEMINI_API_KEY` и `GEMINI_MODEL` |
| Трата не сохраняется: `Unknown person` | Имя в `bot.properties` не совпадает с таблицей `persons` |
| `gradlew test` падает с `ClassNotFoundException: GradleWorkerMain` | Известная проблема Gradle с кириллицей в пути к проекту; перенесите проект в путь из латинских символов |
| В диаграмме нет части трат | Диаграмма и итоги считают только транзакции в EUR |
