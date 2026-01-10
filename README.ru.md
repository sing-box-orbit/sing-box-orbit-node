# sing-box-orbit-node

[![CI](https://github.com/sing-box-orbit/sing-box-orbit-node/actions/workflows/ci.yml/badge.svg)](https://github.com/sing-box-orbit/sing-box-orbit-node/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/lookgoodmeat/5c15334bebb54130f734a69db622379c/raw/coverage.json)](https://github.com/sing-box-orbit/sing-box-orbit-node/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

REST API сервер для удалённого управления [sing-box](https://sing-box.sagernet.org/) — универсальной прокси-платформой.

**[🇬🇧 English version](README.md)**

## Возможности

- Запуск/остановка/перезагрузка sing-box процесса
- **Авто-рестарт при падении** с экспоненциальной задержкой
- Мониторинг статуса и здоровья сервера
- Просмотр логов в реальном времени
- Валидация конфигурации перед запуском
- Автоматическая OpenAPI документация
- Опциональная API-key аутентификация

## Требования

- [Bun](https://bun.sh/) >= 1.0
- sing-box бинарник (скачивается автоматически)

## Быстрый старт

```bash
# Клонировать репозиторий
git clone <repo-url>
cd sing-box-orbit-node

# Установить зависимости
bun install

# Скачать sing-box бинарник для вашей платформы
bun run setup

# Скопировать и настроить переменные окружения
cp .env.example .env

# Создать конфигурацию sing-box
mkdir -p data
# Поместите ваш config.json в ./data/config.json

# Запустить в режиме разработки
bun run dev
```

## Скрипты

| Команда | Описание |
|---------|----------|
| `bun run dev` | Запуск с hot-reload |
| `bun run start` | Запуск в production режиме |
| `bun run build` | Сборка в standalone executable |
| `bun run setup` | Скачать sing-box бинарник |
| `bun run lint` | Проверка кода (Biome) |
| `bun run lint:fix` | Автоисправление lint ошибок |
| `bun run format` | Форматирование кода |
| `bun run typecheck` | Проверка TypeScript типов |
| `bun run test` | Запуск тестов |
| `bun run test:watch` | Запуск тестов в watch режиме |
| `bun run test:coverage` | Запуск тестов с отчётом покрытия |

## Конфигурация

Переменные окружения (`.env`):

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `NODE_ENV` | development | Режим окружения |
| `HOST` | 0.0.0.0 | Адрес привязки сервера |
| `PORT` | 3333 | Порт сервера |
| `API_KEY` | — | API ключ для аутентификации |
| `SINGBOX_BIN` | ./bin/sing-box | Путь к sing-box бинарнику |
| `SINGBOX_CONFIG_PATH` | ./data/config.json | Путь к конфигурации |
| `SINGBOX_WORKING_DIR` | ./data | Рабочая директория |
| `SINGBOX_AUTO_RESTART` | true | Авто-рестарт при падении |
| `SINGBOX_RESTART_DELAY` | 1000 | Начальная задержка рестарта (мс) |
| `SINGBOX_MAX_RESTARTS` | 5 | Макс. рестартов за окно |
| `SINGBOX_RESTART_WINDOW` | 60000 | Временное окно для лимита (мс) |
| `LOG_LEVEL` | info | Уровень логирования |

## API

Базовый URL: `http://localhost:3333`

Если установлен `API_KEY`, запросы должны содержать заголовок `Authorization: Bearer <key>` или `X-API-Key: <key>`.

Интерактивная документация доступна по адресу `http://localhost:3333/docs`

## Docker

```bash
# Сборка образа
docker build -t sing-box-orbit-node .

# Запуск контейнера
docker run -d \
  -p 3333:3333 \
  -v $(pwd)/data:/app/data \
  -e API_KEY=your-secret-key \
  sing-box-orbit-node
```

## Структура проекта

```
sing-box-orbit-node/
├── src/
│   ├── index.ts          # Точка входа
│   ├── app.ts            # Hono приложение
│   ├── config.ts         # Конфигурация
│   ├── api/              # API роуты
│   ├── services/         # Бизнес-логика
│   ├── middleware/       # Middleware
│   ├── types/            # TypeScript типы
│   └── utils/            # Утилиты
├── scripts/              # Скрипты
├── bin/                  # sing-box бинарник
├── data/                 # Рабочие данные
└── dist/                 # Скомпилированный код
```

## Технологии

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **API Schema**: [fets](https://github.com/ardatan/feTS) + [TypeBox](https://github.com/sinclairzx81/typebox)
- **Docs**: [Scalar](https://scalar.com/)
- **Linter**: [Biome](https://biomejs.dev/)

## Лицензия

MIT
