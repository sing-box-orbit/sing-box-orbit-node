# sing-box-orbit-node

[![CI](https://github.com/sing-box-orbit/sing-box-orbit-node/actions/workflows/ci.yml/badge.svg)](https://github.com/sing-box-orbit/sing-box-orbit-node/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/lookgoodmeat/5c15334bebb54130f734a69db622379c/raw/coverage.json)](https://github.com/sing-box-orbit/sing-box-orbit-node/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

REST API server for remote management of [sing-box](https://sing-box.sagernet.org/) — universal proxy platform.

**[🇷🇺 Русская версия](README.ru.md)**

## Features

- Start/stop/reload sing-box process
- **Auto-restart on crash** with exponential backoff
- Monitor server status and health
- Real-time log viewing
- Configuration validation before startup
- Automatic OpenAPI documentation
- Optional API-key authentication

## Requirements

- [Bun](https://bun.sh/) >= 1.0
- sing-box binary (downloaded automatically)

## Quick Start

```bash
# Clone repository
git clone <repo-url>
cd sing-box-orbit-node

# Install dependencies
bun install

# Download sing-box binary for your platform
bun run setup

# Copy and configure environment variables
cp .env.example .env

# Create sing-box configuration
mkdir -p data
# Place your config.json in ./data/config.json

# Start in development mode
bun run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start with hot-reload |
| `bun run start` | Start in production mode |
| `bun run build` | Build standalone executable |
| `bun run setup` | Download sing-box binary |
| `bun run lint` | Check code (Biome) |
| `bun run lint:fix` | Auto-fix lint errors |
| `bun run format` | Format code |
| `bun run typecheck` | TypeScript type checking |
| `bun run test` | Run tests |
| `bun run test:watch` | Run tests in watch mode |
| `bun run test:coverage` | Run tests with coverage report |

## Configuration

Environment variables (`.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment mode |
| `HOST` | 0.0.0.0 | Server bind address |
| `PORT` | 3333 | Server port |
| `API_KEY` | — | API key for authentication |
| `SINGBOX_BIN` | ./bin/sing-box | Path to sing-box binary |
| `SINGBOX_CONFIG_PATH` | ./data/config.json | Config file path |
| `SINGBOX_WORKING_DIR` | ./data | Working directory |
| `SINGBOX_AUTO_RESTART` | true | Auto-restart on crash |
| `SINGBOX_RESTART_DELAY` | 1000 | Initial restart delay (ms) |
| `SINGBOX_MAX_RESTARTS` | 5 | Max restarts within window |
| `SINGBOX_RESTART_WINDOW` | 60000 | Time window for restart limit (ms) |
| `LOG_LEVEL` | info | Log level |

## API

Base URL: `http://localhost:3333`

If `API_KEY` is set, requests must include header `Authorization: Bearer <key>` or `X-API-Key: <key>`.

Interactive documentation available at `http://localhost:3333/docs`

## Docker

```bash
# Build image
docker build -t sing-box-orbit-node .

# Run container
docker run -d \
  -p 3333:3333 \
  -v $(pwd)/data:/app/data \
  -e API_KEY=your-secret-key \
  sing-box-orbit-node
```

## Project Structure

```
sing-box-orbit-node/
├── src/
│   ├── index.ts          # Entry point
│   ├── app.ts            # Hono application
│   ├── config.ts         # Configuration
│   ├── api/              # API routes
│   ├── services/         # Business logic
│   ├── middleware/       # Middleware
│   ├── types/            # TypeScript types
│   └── utils/            # Utilities
├── scripts/              # Scripts
├── bin/                  # sing-box binary
├── data/                 # Runtime data
└── dist/                 # Compiled code
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **API Schema**: [fets](https://github.com/ardatan/feTS) + [TypeBox](https://github.com/sinclairzx81/typebox)
- **Docs**: [Scalar](https://scalar.com/)
- **Linter**: [Biome](https://biomejs.dev/)

## License

MIT
