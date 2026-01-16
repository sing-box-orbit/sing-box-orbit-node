# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**sing-box-orbit-node** is a REST API server for managing [sing-box](https://sing-box.sagernet.org/) proxy platform. It provides endpoints for process control, configuration management, and monitoring.

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Web Framework**: Hono + feTS (OpenAPI-first with TypeBox schemas)
- **API Documentation**: Scalar (dev only)
- **Linting/Formatting**: Biome
- **Testing**: Bun test runner

## Commands

```bash
bun run dev          # Development server with hot reload
bun run start        # Production server
bun run build        # Compile to standalone binary
bun run lint         # Check linting
bun run lint:fix     # Fix linting issues
bun run typecheck    # TypeScript type checking
bun run test         # Run all tests
bun run test:unit    # Run unit tests only
bun run test:integration  # Run integration tests only
```

## Project Structure

```
src/
├── api/
│   ├── fets-router.ts    # Router composition entry point
│   ├── schemas.ts        # Shared TypeBox schemas
│   ├── utils.ts          # API utilities (handleError)
│   └── routes/
│       ├── index.ts      # Re-exports all route modules
│       ├── types.ts      # RouterType definition
│       ├── health.ts     # Health check
│       ├── server.ts     # Server status/reload/logs
│       ├── singbox.ts    # sing-box binary info
│       ├── diff.ts       # Config diff endpoints
│       └── config/       # Config domain routes
│           ├── index.ts  # Re-exports config routes
│           ├── core.ts   # GET/PUT/PATCH/validate
│           ├── backups.ts
│           ├── inbounds.ts
│           ├── outbounds.ts
│           ├── route.ts
│           ├── rule-sets.ts
│           ├── dns.ts
│           ├── log.ts
│           ├── ntp.ts
│           ├── experimental.ts
│           ├── endpoints.ts
│           ├── services.ts
│           ├── certificate.ts
│           └── export-import.ts
├── middleware/
│   ├── auth.ts           # Bearer/API key authentication
│   ├── rate-limiter.ts   # Request rate limiting
│   ├── request-logger.ts # HTTP request logging
│   └── error-handler.ts  # Global error handling
├── services/
│   ├── process.ts        # sing-box process management
│   ├── config.ts         # Configuration CRUD operations
│   ├── backup.ts         # Config backup management
│   └── log-storage.ts    # Log ring buffer storage
├── types/
│   ├── singbox-config.ts # sing-box configuration types
│   └── api.ts            # API types
├── utils/
│   ├── errors.ts         # Custom error classes
│   └── logger.ts         # Structured logging
├── __tests__/
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── app.ts                # Hono app setup
├── config.ts             # Environment configuration
└── index.ts              # Entry point
```

## Architecture

### API Layer
- Routes are modular: each domain has its own file in `src/api/routes/`
- Each route module exports a `registerXxxRoutes(router)` function
- `fets-router.ts` composes all routes using nested function calls
- OpenAPI spec auto-generated from route definitions
- Hono handles middleware and wraps feTS router

### Services
- **ProcessService**: Manages sing-box lifecycle (start/stop/reload via SIGHUP)
- **ConfigService**: CRUD operations for sing-box configuration with validation
- **BackupService**: Automatic config backups with rotation and hash deduplication
- **LogStorageService**: Ring buffer for process logs

### Configuration Validation
Config changes are validated using `sing-box check -c <temp-file>` before applying.

### Atomic Writes
Configuration updates use atomic write pattern: write to temp file, then rename.

### Concurrency
ConfigService uses mutex lock to prevent concurrent config modifications.

## Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Authentication
API_KEY=your-api-key
AUTH_DISABLED=false

# sing-box
SINGBOX_BINARY=sing-box
SINGBOX_CONFIG_PATH=./config/sing-box.json
SINGBOX_WORKING_DIR=./

# Config API
CONFIG_BACKUP_ENABLED=true
CONFIG_BACKUP_MAX_COUNT=10
CONFIG_BACKUP_DIR=./data/backups
CONFIG_AUTO_RELOAD=true

# Process management
AUTO_START=false
AUTO_RESTART=true
MAX_RESTARTS=5
RESTART_DELAY=1000
RESTART_WINDOW=60000
```

## API Endpoints

### Health
- `GET /health` - Health check

### Server
- `GET /server/status` - Process status
- `POST /server/reload` - Reload config (SIGHUP)
- `GET /server/logs` - Process logs
- `POST /server/restart-stats/reset` - Reset restart counter

### Config
- `GET /config` - Get full configuration
- `PUT /config` - Replace configuration
- `PATCH /config` - Partial update (deep merge)
- `POST /config/validate` - Validate without applying

### Backups
- `GET /config/backups` - List backups
- `POST /config/backups` - Create backup
- `POST /config/backups/:id/restore` - Restore backup
- `DELETE /config/backups/:id` - Delete backup

## Code Style

### Imports
Use `@` alias for all internal imports. Never use relative paths like `../` or `../../`:
- `@/services` — services
- `@/types/singbox-config` — types
- `@/utils/errors` — utilities
- `@/api/schemas` — API schemas
- `@/api/utils` — API utilities

Exception: Relative imports within the same directory (e.g., `./types` from `routes/index.ts`) are allowed.

### No Comments
Do not add comments to the code:
- No JSDoc comments (`/** */`)
- No inline comments (`//`)
- No block comments (`/* */`)
- Code should be self-documenting through clear naming

### Adding New Endpoints
1. Create or edit route file in `src/api/routes/` (or `src/api/routes/config/` for config-related)
2. Define TypeBox schemas inline or import from `@/api/schemas`
3. Export a `registerXxxRoutes(router: RouterType)` function
4. Register the function in `fets-router.ts` composition chain
5. Include all possible response statuses in schema

### Testing
- Mock services in tests using `mock.module()`
- Integration tests use real Hono app with mocked services
- Run `bun run test:coverage` for coverage report

### Error Handling
Use custom error classes from `utils/errors.ts`:
- `NotFoundError` (404)
- `BadRequestError` (400)
- `ConfigValidationError` (400)
- `ProcessError` (500)

## Current Implementation Status

### Completed
- Phase 1: Infrastructure (ConfigService, BackupService, atomic writes, mutex)
- Phase 2: Core Config API (GET/PUT/PATCH/validate, backups endpoints)

### Planned (see docs/plans/config-crud-api.md)
- Phase 3: Inbounds CRUD API
- Phase 4: Outbounds CRUD API
- Phase 5: Route Rules API
- Phase 6: DNS API
- Phase 7-10: Additional features
