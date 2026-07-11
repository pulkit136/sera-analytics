# Event Normalization Design

The `EventNormalizer` is responsible for translating parsed, EVM-specific events (`SeraEvent`) into database-agnostic, relational-friendly records (`NormalizedRecord`). It represents the intermediate data translation layer of the indexer.

---

## 1. Why Normalization is Separated from Persistence

By separating normalizer logic from database persistence, we create a strict boundary between **data shape translation** (business rules) and **IO execution** (infrastructure):

```
+------------------+       +-------------------+       +-----------------------+
|    SeraEvent     |  -->  |  EventNormalizer  |  -->  | Database Repository   |
| (ABI Decoded Log)|       |  (Pure Mapping)   |       |  (Kysely/SQL Write)   |
+------------------+       +-------------------+       +-----------------------+
```

### Architectural Benefits:
1.  **Pure Mapping Logic:** The normalizer contains only pure functions. It does not perform database connections, handle transactions, or make network queries. This makes unit testing incredibly fast and 100% deterministic.
2.  **No SQL Leakage:** The normalizer doesn't understand SQL dialects, connection pool configurations, or migration status. It only generates clean data structures.
3.  **Flexible Writing/Batching:** The persistence layer can receive a collection of normalized records and decide how to batch them, execute upserts, or apply conflict resolutions (e.g. `ON CONFLICT DO NOTHING`). The normalizer is free of these implementation details.

---

## 2. Why Normalized Records Should Not Know About Kysely

*   **Zero Infrastructure Linkage:** Kysely is a TypeScript SQL builder tailored for PostgreSQL. If normalized records leak Kysely-specific types (like `Insertable` or `Updateable`), then swapping the database driver or changing backend engines becomes incredibly difficult.
*   **Decoupled Typings:** The records use native TypeScript primitives (`string`, `number`, `boolean`, `null`) instead of library-specific abstractions. This ensures they can be serialized easily (e.g. to JSON) or passed through messaging queues (like Kafka or RabbitMQ) without type marshalling friction.

---

## 3. Replayability & Multiple Storage Backends

Because normalized records are plain, simple, and serializable objects, we can direct them to multiple destinations concurrently or replay them at will:

```
                                  +-----------------------+
                                  |    EventNormalizer    |
                                  +-----------------------+
                                              |
                     +------------------------+------------------------+
                     |                        |                        |
                     v                        v                        v
         +-----------------------+  +-----------------------+  +-----------------------+
         | PostgreSQL Repository |  |  ClickHouse Database  |  | Parquet File Exporter |
         | (Operational Queries) |  | (OLAP/Long-Term Anal.)|  | (Cold Storage/Replays)|
         +-----------------------+  +-----------------------+  +-----------------------+
```

### Storage Adaptability:
1.  **PostgreSQL (OLTP):** Operational tables for fast lookups, user balances, and active trading queues.
2.  **ClickHouse (OLAP):** Long-term append-only analytics, trade volumes, daily active user trends, and historical metrics.
3.  **Parquet/S3 (Cold Storage):** Exporting normalized logs directly to Parquet files. This allows data scientists to run Spark/Athena queries over the dataset at negligible cost.
4.  **Replaying Data:** In the event of a database corruption or a change in metric definitions, we can reload historical Parquet files, run the normalizer over the events, and reconstruct database tables without querying live EVM nodes.
