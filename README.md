# sing-box-orbit-node

REST API server for remote management of [sing-box](https://sing-box.sagernet.org/) — universal proxy platform.

**[🇷🇺 Русская версия](README.ru.md)**

## Features

- Start/stop/reload sing-box process
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
| `LOG_LEVEL` | info | Log level |

## API Endpoints

Base URL: `http://localhost:3333`

### Authentication

If `API_KEY` is set, requests must include header:
- `Authorization: Bearer <key>` or
- `X-API-Key: <key>`

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/server/status` | sing-box process status |
| `POST` | `/server/reload` | Reload configuration |
| `GET` | `/server/logs?limit=100` | Get logs |

### Response Format

```json
{
  "success": true,
  "data": { ... }
}
```

On error:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Request Examples

```bash
# Health check
curl http://localhost:3333/health

# sing-box status (with auth)
curl -H "X-API-Key: your-api-key" http://localhost:3333/server/status

# Reload configuration
curl -X POST -H "X-API-Key: your-api-key" http://localhost:3333/server/reload

# Get last 50 log lines
curl -H "X-API-Key: your-api-key" "http://localhost:3333/server/logs?limit=50"
```

## API Documentation

In development mode, interactive documentation is available:
- Scalar UI: `http://localhost:3333/docs`
- OpenAPI JSON: `http://localhost:3333/openapi.json`

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
