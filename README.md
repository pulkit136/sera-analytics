# sera-data

The deterministic data layer for the Sera Protocol.

`sera-data` indexes blockchain event logs into a replayable, deterministic PostgreSQL cache while preserving the blockchain as the single source of truth. It abstracts data consumption behind a stateless query layer, providing clean, reorg-safe read access to downstream applications.

---

## 1. Why `sera-data` Exists

Exposing query access directly to raw blockchain RPC nodes is slow, expensive, and fails to handle block reorganizations (reorgs) cleanly. `sera-data` solves this by building a deterministic PostgreSQL cache from raw blockchain events. It handles reorg safety at the block level and exposes a zero-caching, type-safe query layer to build downstream APIs, analytics, SDKs, and explorers.

---

## 2. Architecture

```mermaid
flowchart TD
    BC["Blockchain (EVM RPC)"] -->|Event Logs| Indexer["Continuous Indexer (apps/indexer)"]
    Indexer -->|Decodes & Normalizes| Database["Deterministic PostgreSQL Cache"]
    Database -->|Exposes Read Interfaces| Query["Query Layer (@sera/query)"]
    Query -->|Serves Request| API["HTTP API (apps/api)"]
```

For more details, see the [High-Level Architecture Guide](docs/architecture.md).

---

## 3. Key Features

- **Replay Invariant**: Wiping the database and running the indexer always recreates the identical state from genesis.
- **Reorg Safety**: Canonicality is tracked at the block level (`block_metadata.is_canonical`). Reads join fact tables with block canonicality to filter out orphaned logs.
- **Dependency Isolation**: Strict layers prevent routing/transport modules from coupling to database Kysely context interfaces.

---

## 4. Quick Start

Get the entire backing services, indexer, and API stack running:

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment template
cp .env.example .env

# 3. Boot backing services (and postgres)
docker compose up -d

# 4. Compile packages and start hot-reload development servers
pnpm dev
```

---

## 5. Running Locally (Production Mode)

To run the pipeline and server locally in production mode:

```bash
# 1. Boot Postgres database container
docker compose up postgres -d

# 2. Install dependencies & build topological workspaces
pnpm install
pnpm run build

# 3. Start indexer pipeline listener daemon
pnpm --filter @sera/indexer start

# 4. Start HTTP API server
pnpm --filter @sera/api start
```

---

## 6. Project Structure

```
sera-data/
├── apps/
│   ├── api/                 # Reference HTTP Fastify API app
│   └── indexer/             # Event listener and normalizer loop daemon
├── packages/
│   ├── benchmarks/          # Performance benchmarks and stress testing suites
│   ├── contracts/           # Event decoders, normalizers, and ABIs
│   ├── database/            # Kysely client, migrations, and repositories
│   ├── metadata/            # Asynchronous ERC20 metadata discovery pipeline
│   ├── observability/       # Structured logging and instrumentation libraries
│   ├── query/               # Stateless read query layer interfaces
│   └── shared/              # Centralized configuration and planning helpers
└── docs/                    # Architectural decision records and guides
```

---

## 7. Recommended GitHub Metadata

When publishing this repository, configure the following metadata settings:

- **Description**:
  "Deterministic indexing, replayable storage, and query infrastructure for the Sera Protocol."
- **Suggested GitHub Topics**:
  `typescript`, `blockchain`, `ethereum`, `postgresql`, `indexer`, `data-layer`, `infrastructure`, `kysely`

---

## 8. Documentation Directory

- [High-Level Architecture](docs/architecture.md)
- [Deployment & Runtime Operations](docs/deployment.md)
- [Query Layer Specification](docs/query-layer.md)
- [HTTP API Reference](docs/http-api.md)
- [Architectural Decision Records (ADRs)](docs/adr/)
- [Release Verification Checklist](docs/release-checklist.md)

---

## 9. Roadmap

- **Milestone 1**: Deterministic Query Layer (Completed)
- **Milestone 2**: Reference HTTP API (Completed)
- **Milestone 3**: Production Runtime & Operations (Completed)
- **Milestone 4**: Open Source Release Engineering (Completed)
- **Milestone 5**: Analytics & TVL Accumulator (Future)

---

## 10. Contributing & License

Contributions are welcome! Please read the [Contributing Guidelines](docs/contributing.md) to get started.

Distributed under the Apache 2.0 License.
