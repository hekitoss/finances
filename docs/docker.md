# Запуск в Docker

Сервер (сайт на порту 8080 и Telegram-бот) можно запускать не из IDEA, а в контейнере `finances_app`. Он сам поднимается вместе с Docker Desktop (`restart: unless-stopped`). База остаётся прежним контейнером `finances_db` из `docker-compose.yml`: новый compose-файл её не трогает и не пересоздаёт, а подключается к ней через сеть `finances_net`.

Файлы: `Dockerfile` (собирает фронтенд и сервер внутри образа, Node и JDK на ПК не нужны), `docker-compose.app.yml`, `.env.example`.

> **Не запускайте одновременно с сервером из IDEA.** Оба займут порт 8080, а два бота с одним токеном мешают друг другу: Telegram отдаёт каждое сообщение только одному из них, второй получает `409 Conflict`. Перед `up` остановите сервер в IDEA, а для работы в IDEA сначала остановите контейнер (см. ниже).

## Один раз

Все команды в PowerShell из папки проекта.

1. **Сеть до базы.** Если её уже создавали для ShortShares, обе команды ответят ошибкой «already exists» / «already connected» — это нормально.

   ```powershell
   docker network create finances_net
   docker network connect finances_net finances_db
   ```

   Если `finances_db` когда-нибудь пересоздадут (например, после правки `docker-compose.yml`), вторую команду нужно повторить.

2. **Секреты в `.env`.** Скопируйте `.env.example` в `.env` и впишите токен и ключи. Если они уже заданы через `setx`, можно перенести их одной командой (перезапишет `.env`):

   ```powershell
   'TELEGRAM_BOT_TOKEN','GEMINI_API_KEY','ANTHROPIC_API_KEY','AI_PROVIDER','GEMINI_MODEL','CLAUDE_MODEL','OLLAMA_MODEL','OLLAMA_VISION_MODEL','OLLAMA_NUM_CTX','OLLAMA_THINK','OLLAMA_KEEP_ALIVE','DB_PASSWORD','BACKUP_KEEP' |
     % { $v = [Environment]::GetEnvironmentVariable($_, 'User'); if ($v) { "$_=$v" } } |
     Set-Content .env -Encoding ascii
   ```

   Не оставляйте строки вида `GEMINI_MODEL=` без значения: так переменная становится пустой, и сервер не подставит своё значение по умолчанию. `.env` в `.gitignore`.

3. **Файлы бота.** `bot.properties` и `bot-settings.properties` подключаются в контейнер как отдельные файлы, поэтому оба должны существовать. Если `bot-settings.properties` нет, создайте пустой: `New-Item bot-settings.properties`. Иначе Docker создаст на его месте папку.

## Запуск и обновление

```powershell
docker compose -f docker-compose.app.yml up -d --build
```

Та же команда пересобирает образ после изменений в коде или фронтенде; `npm run build` и сборка в IDEA для этого не нужны. Первая сборка занимает несколько минут (скачиваются Node, Gradle и зависимости), следующие быстрее.

Проверка: `docker ps` показывает `finances_app` со статусом `(healthy)`, сайт открывается на http://localhost:8080 и с телефона на http://192.168.0.245:8080.

| Что | Команда |
|---|---|
| Лог в реальном времени | `docker compose -f docker-compose.app.yml logs -f` |
| Остановить (например, чтобы запустить из IDEA) | `docker compose -f docker-compose.app.yml stop` |
| Запустить снова без пересборки | `docker compose -f docker-compose.app.yml start` |
| Удалить контейнер (данные на ПК остаются) | `docker compose -f docker-compose.app.yml down` |

## Где что лежит

Всё, что сервер пишет, остаётся в папке проекта на ПК, как и при запуске из IDEA:

| Папка или файл | Что |
|---|---|
| `logs/` | Лог за день, `logs/ГГГГ-ММ-ДД.log` |
| `receipts/` | Фото и PDF чеков из бота |
| `backup/` | Ежемесячные бэкапы базы |
| `bot.properties` | Кто может писать боту (в контейнере только для чтения) |
| `bot-settings.properties` | Валюта по умолчанию из `/currency` |

## Как устроено

- **База:** `DB_URL=jdbc:postgresql://finances_db:5432/finances` по сети `finances_net`. Порт 5432 на ПК по-прежнему открыт для IDEA и DBeaver.
- **Ollama** работает на Windows, контейнер ходит к ней по `http://host.docker.internal:11434`. Другой адрес задаётся в `.env` как `DOCKER_OLLAMA_URL=...`. Если бот пишет, что Ollama недоступна, проверьте, что она запущена; в крайнем случае задайте в Windows `setx OLLAMA_HOST 0.0.0.0` и перезапустите Ollama.
- **Бэкап** по-прежнему делается через `docker exec finances_db pg_dump`, поэтому в контейнер подключён `/var/run/docker.sock`. Это даёт контейнеру полный доступ к Docker на ПК; если не нужно, задайте `BACKUP_DISABLED=true` в `.env` и уберите этот том.
- **Время:** `TZ=Europe/Berlin`, чтобы «сегодня» и «вчера» в боте и имена файлов логов совпадали с вашим временем.
- **Healthcheck** раз в 30 секунд запрашивает `/api/dictionaries`, то есть проверяет и сервер, и базу.
