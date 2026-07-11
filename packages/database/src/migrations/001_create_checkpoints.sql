-- Migration: Create Checkpoints Table
CREATE TABLE IF NOT EXISTS checkpoints (
    indexer_name VARCHAR(255) PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    latest_indexed_block BIGINT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
