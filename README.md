# sera-data

An open-source, deterministic data indexing and analytics platform for the **Sera Protocol** built with TypeScript, Node.js 22, pnpm workspaces, and Turborepo.

---

## Project Structure

This monorepo separates ingestion, databases, and configuration interfaces into logical boundary layers:

```
sera-data/
├── apps/
│   └── indexer/             # Blockchain event listener and normalizer daemon
└── packages/
    ├── contracts/           # Smart contract ABIs and network addresses
    ├── database/            # Kysely client, migrations, and repositories
    └── shared/              # Centralized environment configuration and logger
```

---

## Engineering Guidelines

Please read the [ARCHITECTURE.md](ARCHITECTURE.md) document to understand the vision, core guidelines, replayability strategies, and operational failover mechanics before submitting pull requests.

---

## Developer Quickstart

### Prerequisites
*   Node.js >= 22.0.0
*   pnpm >= 9.0.0
*   Docker (for local Postgres services)

### 1. Installation & Environment
Setup workspace configuration files and install dependencies:
```bash
# Copy example environment configuration
cp .env.example .env

# Install dependencies and link packages
pnpm install
```

### 2. Run Database Stack
You can start a local PostgreSQL container for development:
```bash
docker compose up postgres -d
```
Or start the complete production-grade application stack (database, indexer, and API) in containerized mode:
```bash
docker compose up --build -d
```

### 3. Build & Compile Packages
Compile the typescript code across all workspaces in topological order:
```bash
pnpm run build
```

### 4. Running Services (Locally)
Start the indexer pipeline listener and HTTP API services:
```bash
# Start continuous indexer daemon
pnpm --filter @sera/indexer start

# Start reference HTTP API server
pnpm --filter @sera/api start
```

### 5. Running Lint & Quality Checks
We use **Biome** for fast, integrated linting and formatting:
```bash
# Check rules
pnpm run lint

# Auto-fix formatting and imports
pnpm run lint:fix
```

### 6. Running Tests
Run Vitest suites across the workspaces:
```bash
pnpm run test
```

