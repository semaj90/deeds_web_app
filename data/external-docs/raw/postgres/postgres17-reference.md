# PostgreSQL 17 Relational Database Reference Manual

This manual details advanced SQL commands, JSONB query improvements, indexing schemas, and foreign-key constraint validations specifically for PostgreSQL 17.

---

## 1. Table Definitions & Constraint Schemas

PostgreSQL 17 enforces strict relational integrity, utilizing serial primary keys and robust foreign keys with cascade constraints for modern web applications.

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

## 2. PostgreSQL 17 JSONB Improvements & Querying

PostgreSQL 17 includes advanced JSONB document performance improvements and standard relational query layouts.

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

## 3. High-Performance pgvector HNSW Indexing

Utilizing pgvector 0.7+ to create Hierarchical Navigable Small World (HNSW) vector indices with cosine distance operators.

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
