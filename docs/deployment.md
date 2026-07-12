# Production Runtime & Deployment Guide

This document describes the runtime architecture, operational procedures, environment configurations, and deployment strategies for the `sera-data` platform.

---

## 1. Prerequisites

- **Node.js**: `>=22.0.0`
- **pnpm**: `>=9.0.0`
- **Docker & Docker Compose**: (Required for containerized runtime and local database stack setup)

---

## 2. Local Development Setup

To run the application locally without Docker containers, configure your environment file first:

```bash
# 1. Copy the example environment template
cp .env.example .env

# 2. Boot the backing services (PostgreSQL database)
docker compose up postgres -d

# 3. Install workspace dependencies and compile code
pnpm install
pnpm run build

# 4. Start the continuous indexer daemon
pnpm --filter @sera/indexer start

# 5. Run the reference HTTP API server (listens on PORT)
pnpm --filter @sera/api start
```

---

## 3. Containerized Stack (Docker & Docker Compose)

The monorepo provides multi-stage, production-grade Dockerfiles configured for deterministic builds and minimal layer footprint, running as a secure, non-root user (`nodeapp`).

### Docker Compose Quick Start
You can run the complete stack (Database, Indexer, and API) using a single command:

```bash
# Start all services in the background
docker compose up --build -d

# Check status of running containers
docker compose ps

# Follow logs from all services
docker compose logs -f
```

### Startup Ordering & Health Checks
- **Postgres Database**: Exposes a native `pg_isready` check.
- **Indexer & API**: Depend on the `postgres` healthcheck condition (`service_healthy`). Docker Compose ensures that the database is fully ready to accept connections before booting Node.js application containers.
- **Signal Forwarding (`init: true`)**: Containers utilize the `init: true` directive, ensuring that signals like `SIGINT` and `SIGTERM` are forwarded down to the Node.js process instead of being swallowed by Docker's default PID 1 handler.

---

## 4. Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Mode of operation (`development`, `production`, `test`) | `development` |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) | `info` |
| `PORT` | Listening port for the HTTP API service | `3000` |
| `RPC_URL` | EVM JSON-RPC provider node URL | `http://localhost:8545` |
| `DATABASE_URL` | Postgres database connection URL | `postgresql://postgres:postgres@localhost:5432/sera_data` |
| `START_BLOCK` | Default starting block height for the indexer | `20000000` |
| `RECONFIRMATION_DEPTH` | Confirmation block depth for reorg protection | `6` |

---

## 5. Graceful Startup & Shutdown Behavior

### Startup Sequence
At application startup, both `apps/indexer` and `apps/api` invoke `getConfig()`. If any required environment configuration is missing or invalid (e.g. malformed URL or invalid `PORT`), the application throws `ConfigurationError` and exits immediately with status `1` (fail-fast behavior).

### Shutdown Sequence (SIGINT / SIGTERM)
When receiving termination signals (`SIGINT` or `SIGTERM`):
1. **Stop accepting new work**: Fastify stops accepting new HTTP requests, and the continuous indexer loop is commanded to stop.
2. **Finish in-flight work**: The indexer waits for the current batch of block events to finish syncing.
3. **Close connections**: Kysely database client pools are cleanly destroyed.
4. **Clean Exit**: The process exits with status code `0`.

---

## 6. Troubleshooting & Production Guidelines

- **Database Connectivity Failures**: If the API server returns `503 Service Unavailable` on `/health`, verify that PostgreSQL is running and responsive, and confirm that the `DATABASE_URL` contains the correct host credentials.
- **Reorgs & Rollbacks**: During startup, if the indexer detects a block reorganization, it will automatically roll back block checkpoints. Ensure that `RECONFIRMATION_DEPTH` matches the target network's finality requirements.
