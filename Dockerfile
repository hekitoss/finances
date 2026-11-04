# Образ сервера finances: Ktor-сервер + Telegram-бот + собранный фронтенд.
# Собирается из docker-compose.app.yml; база остаётся в контейнере finances_db.

# 1. Фронтенд -> /frontend/dist
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Сервер -> build/libs/finances-all.jar (shadowJar со всеми зависимостями)
FROM gradle:8.10-jdk17 AS backend
WORKDIR /src
COPY settings.gradle.kts build.gradle.kts gradle.properties ./
COPY src ./src
RUN --mount=type=cache,target=/home/gradle/.gradle \
    gradle shadowJar --no-daemon -x test

# 3. Запуск
FROM eclipse-temurin:17-jre-alpine
# docker-cli: ежемесячный бэкап делает `docker exec finances_db pg_dump` через docker.sock;
# fontconfig + шрифт: Apache POI подгоняет ширину колонок при экспорте в Excel;
# tzdata: чтобы TZ=Europe/Berlin работал и для системных утилит.
RUN apk add --no-cache docker-cli fontconfig ttf-dejavu tzdata
WORKDIR /app
COPY --from=backend /src/build/libs/finances-all.jar app.jar
# Server.kt ищет фронтенд в frontend/dist относительно рабочей папки
COPY --from=frontend /frontend/dist ./frontend/dist
ENV TZ=Europe/Berlin \
    PORT=8080
EXPOSE 8080
ENTRYPOINT ["java", "-Djava.awt.headless=true", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
