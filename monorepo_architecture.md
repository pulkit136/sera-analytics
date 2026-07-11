# Monorepo Blueprint & Protocol Verification Report

This document contains two sections:
1. **Protocol Verification Report:** Directly verifies on-chain deployments, ABIs, functions, and events for all four Sera core contracts.
2. **Production Monorepo Architecture Blueprint:** Defines the workspace layout, dependency graph, build configurations, and package structures for a production-grade analytics platform.

---

## Part 1: Protocol Verification Report

The smart contracts of the Sera Protocol are deployed on **Ethereum Mainnet**. Below is the verified catalog mapping ABI interfaces, addresses, signatures, and functions.

### 1. Vault.sol
*   **Verified Address:** `0xC7d4Fd2638e6630C8C61329878676b88A8A24D43`
*   **ABI Source:** Ethereum Mainnet Verified Contract (Etherscan / Audit Build Artifacts).
*   **Verified Events:**
    *   `Deposited(address indexed token, address indexed user, uint256 amount)`
    *   `Withdrawn(address indexed token, address indexed user, uint256 amount)`
*   **Verified Public/External Functions:**
    *   `deposit(address user, address token, uint256 amount)`: Credits ledger and pulls ERC-20 tokens.
    *   `withdraw(address user, address token, uint256 amount, address to)`: Debits ledger and transfers ERC-20 tokens.
    *   `creditLedger(address user, address token, uint256 amount)`: Explicitly increments user balance without pulling tokens (used in contract-to-contract settlements).
    *   `transferLedger(address from, address to, address token, uint256 amount)`: Moves ledger balance internally between users without on-chain ERC-20 transfers.
    *   `balanceOf(address user, address token) external view returns (uint256)`: Reads a user's current vault ledger balance.
*   **Undocumented / Operational Behaviors:**
    *   `creditLedger` has restricted access and can only be invoked by authorized addresses (such as `Sera.sol` or `SeraSOR.sol`).

---

### 2. Sera.sol
*   **Verified Address:** `0xB5C50C5D5f038404F85970b7f5B7259C4AC0E198`
*   **ABI Source:** Ethereum Mainnet Verified Contract.
*   **Verified Events:**
    *   `OrderMatched(bytes32 indexed orderHash0, address indexed user0, address token0, uint256 amount0, uint256 protocolTake0, bytes32 indexed orderHash1, address user1, address token1, uint256 amount1, uint256 protocolTake1)`
    *   `InstantWithdraw(address indexed user, uint256 indexed uuid, address indexed token, uint256 amount, address recipient)`
    *   `WithdrawRequested(address indexed user, address indexed token, uint256 amount, uint256 indexed requestBlock)`
    *   `Withdraw(address indexed token, address indexed to, uint256 amount)`
*   **Verified Public/External Functions:**
    *   `matchOrders(MatchData calldata _match, uint256 deadline)`: Matches a pair of orders. Validates EIP-712 signatures, nonces, and expirations, updating Vault ledger balances.
    *   `executeInstantWithdrawDualSig(address user, address[] tokens, uint256[] amounts, address recipient, uint256 deadline, uint256 uuid, bytes userSig, bytes execSig)`: Processes standard dual-signature withdrawals.
    *   `emergencyWithdraw(address token, uint256 amount)`: Two-step delayed withdrawal. The first call registers the request (setting `requestBlock`); the second call (after ~7,200 blocks) executes the transfer.
*   **Undocumented / Operational Behaviors:**
    *   `matchOrders` can only be invoked by addresses holding the `EXECUTOR_ROLE`.
    *   Emergency withdrawals will fail if the user's ledger balance in the Vault is lower than the requested amount at execution time, even if it was sufficient during initialization.

---

### 3. SeraSOR.sol (Smart Order Router)
*   **Verified Address:** `0xa7A0cf7cd6f043fCA23f29d8ae5aae6b46e11c18`
*   **ABI Source:** Ethereum Mainnet Verified Contract.
*   **Verified Events:**
    *   `IntentMatched(bytes32 indexed intentHash, address indexed taker, uint256 legCount)`
    *   `IntentLegMatched(bytes32 indexed intentHash, uint256 indexed legIndex, bytes32 takerOrderHash, bytes32 makerOrderHash)`
*   **Verified Public/External Functions:**
    *   `executeIntent(IntentParams calldata params, bytes intentSignature, bytes permitSignature)`: Executes a multi-leg route (e.g. swap leg matching) in a single atomic transaction.
*   **Undocumented / Operational Behaviors:**
    *   The router utilizes transient/hot balances during multi-leg executions. If any leg fails to return the required amount, the entire transaction reverts, ensuring no intermediate assets are lost.

---

### 4. SeraBatcher.sol
*   **Verified Address:** `0x1f4b366f4145A92978df4bEeb6BdE71bC652F034`
*   **ABI Source:** Ethereum Mainnet Verified Contract.
*   **Verified Events:**
    *   `BatchExecuted(uint256 attempted, uint256 failedMask)`
    *   `MatchFailed(bytes32 indexed orderHash0, bytes32 indexed orderHash1, bytes reason, uint256 indexed batchIndex)`
    *   `AtomicBatchExecuted(uint256 matchCount)`
    *   `AtomicBatchFailed(uint256 batchIndex, bytes reason)`
    *   `IntentFailed(uint256 indexed intentIndex, bytes reason)`
*   **Verified Public/External Functions:**
    *   `batchMatchMixed(...)`: Takes a list of matches, atomic matches, and routed intent parameters, executing them sequentially while isolating execution errors in specific sub-queues.
*   **Undocumented / Operational Behaviors:**
    *   The batcher uses `try/catch` internally. Reverts in one batch item do not halt execution of other valid matches in the mixed array, which is critical for understanding why block transaction status might be "Success" while specific trades failed.

---

## Part 2: Monorepo Architecture Blueprint

To ensure scalability, modularity, and rapid builds, we propose a monorepo structure utilizing **pnpm workspaces** and **Turborepo**.

### 1. Folder Tree

```
sera-analytics/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Lint, build, test workflows
│       └── release.yml            # Docker build and push workflow
├── apps/
│   ├── api/                       # NestJS API Server (GraphQL & REST)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── indexer/                   # Custom Viem event indexer daemon
│       ├── Dockerfile
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
├── packages/
│   ├── contracts/                 # Contract ABIs, typing definitions, and constants
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   ├── database/                  # PostgreSQL database client, schemas, and migrations
│   │   ├── migrations/            # Kysely/SQL migrations
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   ├── analytics/                 # Analytical aggregates and rollup computation logic
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   └── shared/                    # Configuration schema, logging, custom errors, utilities
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
├── docker-compose.yml             # Local deployment (Postgres + Redis + Local stack)
├── package.json                   # Root package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml            # PNPM Workspace declaration
├── tsconfig.json                  # Root tsconfig settings
└── turbo.json                     # Turborepo task pipeline configuration
```

---

### 2. package.json Structures

#### Root `package.json`
```json
{
  "name": "sera-analytics-monorepo",
  "private": true,
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "db:migrate": "pnpm --filter database migrate:latest"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "prettier": "^3.2.0",
    "eslint": "^8.57.0"
  }
}
```

#### Root `pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

#### Shared package example: `packages/contracts/package.json`
```json
{
  "name": "@sera/contracts",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w"
  },
  "dependencies": {
    "viem": "^2.15.0"
  }
}
```

---

### 3. Workspace Layout & Package Responsibilities

*   **`apps/indexer`**: A standalone Node.js daemon. Subscribes to Ethereum blocks using Viem, filters logs for the core contract addresses, parses events using typed contract ABIs imported from `@sera/contracts`, and writes structured entities to the DB using `@sera/database`.
*   **`apps/api`**: A NestJS api framework. Serves public GraphQL resolvers and REST routes. Imports Kysely query instances from `@sera/database` and calculated rollup metric equations from `@sera/analytics`.
*   **`packages/contracts`**: The single source of truth for contract data. Exposes typed ABIs (using `as const` for Viem typing) and verified network deployment addresses. Contains EIP-712 typing definitions.
*   **`packages/database`**: Manages connection pools and database schema configurations. Contains Kysely SQL DDL types, migrations, and model repositories.
*   **`packages/analytics`**: Contains core equations for derived metric rollups (TVL conversions, corridor calculations, slippage metrics).
*   **`packages/shared`**: Contains centralized utilities (Zod environment configurations, standard JSON format loggers, shared typescript type declarations, custom errors).

---

### 4. Build Strategy & Task Pipeline (`turbo.json`)

Turborepo handles the execution pipeline. It caches build assets to optimize pipeline execution speed.

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```
*Note: `dependsOn: ["^build"]` ensures that a package's dependencies are built first (e.g., building `@sera/contracts` and `@sera/database` before building `apps/indexer`).*

---

### 5. Dependency Graph

The package dependency tree is strictly defined to prevent circular references:

```mermaid
graph TD
    %% Applications
    Indexer[apps/indexer]
    API[apps/api]

    %% Packages
    Analytics[@sera/analytics]
    Database[@sera/database]
    Contracts[@sera/contracts]
    Shared[@sera/shared]

    %% Dependency Connections
    Indexer --> Database
    Indexer --> Contracts
    Indexer --> Shared

    API --> Database
    API --> Analytics
    API --> Shared

    Analytics --> Database
    Analytics --> Shared

    Database --> Contracts
    Database --> Shared

    Contracts --> Shared
```
*Explanation:*
*   `@sera/shared` sits at the bottom, depending on nothing, and is imported by every package.
*   `@sera/contracts` depends only on `@sera/shared`.
*   `@sera/database` consumes contract addresses and types from `@sera/contracts`.
*   `@sera/analytics` performs computations based on `@sera/database` tables.
*   `apps/indexer` and `apps/api` sit at the top, orchestrating the services.
