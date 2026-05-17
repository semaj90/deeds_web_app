# PostgreSQL 16 Relational Database Reference Manual

This manual details advanced SQL commands, JSONB storage operations, indexing schemes, and foreign-key constraint validations in PostgreSQL 16.

---

## 1. Table Definitions & Constraint Schemas

PostgreSQL 16 enforces strict relational constraints and supports native auto-incrementing serial primary keys and standard foreign-key cascading rules.

```sql
-- Create users master table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create linked session table with cascading foreign keys
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);
```

---

## 2. Advanced JSONB Document Storage & Querying

JSONB columns enable highly efficient semi-structured document store query profiles alongside relational tables.

```sql
CREATE TABLE IF NOT EXISTS system_metadata (
    id SERIAL PRIMARY KEY,
    scope VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL
);

-- Index JSONB keys for high-performance key-value lookups
CREATE INDEX IF NOT EXISTS idx_metadata_payload ON system_metadata USING GIN (payload);

-- Select records where nested JSON value matches criteria
SELECT * FROM system_metadata 
WHERE payload @> '{"status": "active", "metrics": {"VRAM": 0}}';
```

---

## 3. High-Performance HNSW Vector Indexing

Utilizing pgvector to support high-dimensional similarity searches with fast approximate nearest neighbors (ANN) index pipelines.

```sql
-- Enable the vector database extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table to store document chunk embeddings
CREATE TABLE IF NOT EXISTS codebase_chunks (
    id SERIAL PRIMARY KEY,
    chunk_id VARCHAR(255) NOT NULL,
    embedding VECTOR(768) NOT NULL
);

-- Create high-performance Hierarchical Navigable Small World (HNSW) index
CREATE INDEX IF NOT EXISTS idx_chunks_hnsw 
ON codebase_chunks USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```
