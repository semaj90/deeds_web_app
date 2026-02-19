# Phase 5: Database & Storage Setup

## Overview

Phase 5 establishes the foundation for the evidence processing pipeline by setting up:
- PostgreSQL database schema with pgvector support
- MinIO bucket structure and organization
- Database migrations and tracking
- Infrastructure verification

## Prerequisites

- PostgreSQL 14+ with pgvector extension
- MinIO instance running
- Python 3.11+
- pip package manager

## Quick Start

### 1. Install Dependencies

```bash
cd backend/evidence-pipeline
pip install -r requirements.txt
```

### 2. Set Environment Variables

```bash
# PostgreSQL
export DATABASE_URL="postgresql://legal_admin:123456@localhost:5432/legal_ai_db"

# MinIO
export MINIO_ENDPOINT="localhost:9000"
export MINIO_ACCESS_KEY="minioadmin"
export MINIO_SECRET_KEY="minioadmin"

# RabbitMQ (optional for verification)
export RABBITMQ_URL="amqp://guest:guest@localhost:5672/"
```

### 3. Run Bootstrap

```bash
python bootstrap.py
```

This will:
- ✅ Install Python dependencies
- ✅ Run database migrations
- ✅ Set up MinIO buckets
- ✅ Verify infrastructure connectivity

## Manual Setup (if bootstrap fails)

### Step 1: Enable pgvector Extension

```bash
psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Step 2: Run Database Migrations

```bash
python run_migrations.py
```

This will:
- Create `schema_migrations` table to track applied migrations
- Apply `001_initial_schema.sql` (if not already applied)
- Apply `002_enhance_schema_with_embeddings.sql` (if not already applied)

### Step 3: Set Up MinIO Buckets

```bash
python setup_minio_buckets.py
```

This will create:
- `evidence-documents` bucket with directory structure
- `evidence-processed` bucket with directory structure
- `evidence-temp` bucket for temporary files

## Database Schema

### Tables Created

#### evidence_files
Stores metadata about uploaded evidence documents.

```sql
- id (UUID, PK)
- case_id (VARCHAR)
- filename (VARCHAR)
- file_type (VARCHAR)
- minio_path (VARCHAR)
- uploaded_by (UUID)
- uploaded_at (TIMESTAMP)
- processing_status (VARCHAR) -- pending, processing, completed, failed
- processing_error (TEXT)
- chunk_count (INTEGER)
- metadata (JSONB)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### evidence_chunks_v2
Stores semantic chunks extracted from evidence documents.

```sql
- id (UUID, PK)
- evidence_id (UUID, FK)
- chunk_index (INTEGER)
- content (TEXT)
- page_number (INTEGER)
- section_title (VARCHAR)
- legal_entities (TEXT[])
- legal_references (TEXT[])
- legal_concepts (TEXT[])
- legal_tags (TEXT[])
- metadata (JSONB)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### evidence_embeddings
Stores vector embeddings for semantic search.

```sql
- id (UUID, PK)
- chunk_id (UUID, FK)
- embedding (vector(768)) -- 768-dimensional vector
- embedding_model (VARCHAR)
- confidence (FLOAT)
- metadata (JSONB)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### evidence_processing_jobs
Tracks processing pipeline stages and status.

```sql
- id (UUID, PK)
- evidence_id (UUID, FK)
- stage (VARCHAR) -- classification, ocr, parsing, chunking, analysis, embedding, indexing
- status (VARCHAR) -- pending, processing, completed, failed
- percentage (INTEGER)
- eta_seconds (INTEGER)
- error_message (TEXT)
- error_recoverable (BOOLEAN)
- started_at (TIMESTAMP)
- completed_at (TIMESTAMP)
- metadata (JSONB)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### evidence_entities
Stores extracted legal entities from evidence chunks.

```sql
- id (UUID, PK)
- chunk_id (UUID, FK)
- entity_type (VARCHAR) -- person, organization, statute, case, etc.
- entity_value (TEXT)
- confidence (FLOAT)
- position_in_text (INTEGER)
- metadata (JSONB)
- created_at (TIMESTAMP)
```

#### evidence_references
Stores statute and case references from evidence chunks.

```sql
- id (UUID, PK)
- chunk_id (UUID, FK)
- reference_type (VARCHAR) -- statute, case, regulation, etc.
- reference_value (TEXT)
- confidence (FLOAT)
- position_in_text (INTEGER)
- metadata (JSONB)
- created_at (TIMESTAMP)
```

#### evidence_audit_trail
Audit trail for evidence processing actions.

```sql
- id (UUID, PK)
- evidence_id (UUID, FK)
- action (VARCHAR)
- actor_id (UUID)
- details (JSONB)
- created_at (TIMESTAMP)
```

### Indexes Created

- `idx_evidence_files_case_id` - Fast lookup by case
- `idx_evidence_files_processing_status` - Fast lookup by status
- `idx_evidence_chunks_v2_evidence_id` - Fast lookup by evidence
- `idx_evidence_chunks_v2_page_number` - Fast lookup by page
- `idx_evidence_chunks_v2_legal_tags` - GIN index for tag filtering
- `idx_evidence_embeddings_vector` - HNSW index for vector similarity
- `idx_evidence_entities_chunk_id` - Fast lookup by chunk
- `idx_evidence_entities_entity_type` - Fast lookup by entity type
- `idx_evidence_chunks_fts_content` - GIN index for full-text search

### Full-Text Search

A trigger automatically maintains a full-text search index (`evidence_chunks_fts`) for keyword search:

```sql
-- Search for documents containing "statute"
SELECT chunk_id FROM evidence_chunks_fts
WHERE content_tsvector @@ to_tsquery('english', 'statute');
```

## MinIO Bucket Structure

### evidence-documents
```
evidence-documents/
├── cases/
│   ├── pending/          -- Awaiting processing
│   ├── processing/       -- Currently being processed
│   ├── completed/        -- Successfully processed
│   └── failed/           -- Processing failed
├── uploads/
│   ├── temp/             -- Temporary upload files
│   └── verified/         -- Verified uploads
```

### evidence-processed
```
evidence-processed/
├── chunks/               -- Extracted chunks
├── embeddings/           -- Vector embeddings
├── metadata/             -- Processing metadata
├── analysis/             -- Analysis results
└── exports/              -- Exported results
```

## Verification

### Check Database Connection

```bash
psql -U legal_admin -d legal_ai_db -c "SELECT version();"
```

### Check pgvector Extension

```bash
psql -U legal_admin -d legal_ai_db -c "CREATE TABLE test_vector (id SERIAL, vec vector(768)); DROP TABLE test_vector;"
```

### Check MinIO Buckets

```bash
# Using MinIO CLI
mc ls minio/evidence-documents
mc ls minio/evidence-processed
```

### Check Applied Migrations

```bash
psql -U legal_admin -d legal_ai_db -c "SELECT * FROM schema_migrations;"
```

## Troubleshooting

### PostgreSQL Connection Failed

```bash
# Check if PostgreSQL is running
psql -U legal_admin -d legal_ai_db -c "SELECT 1;"

# If connection refused, start PostgreSQL
# On macOS: brew services start postgresql
# On Linux: sudo systemctl start postgresql
# On Windows: net start PostgreSQL
```

### pgvector Extension Not Found

```bash
# Install pgvector extension
psql -U legal_admin -d legal_ai_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

# If extension not available, install it:
# On macOS: brew install pgvector
# On Linux: sudo apt-get install postgresql-14-pgvector
```

### MinIO Connection Failed

```bash
# Check if MinIO is running
curl http://localhost:9000/minio/health/live

# If not running, start MinIO
# minio server /data
```

### Migration Already Applied

If you see "duplicate key value violates unique constraint" error:
- This is normal if migrations have already been applied
- The migration runner is idempotent and will skip already-applied migrations

## Next Steps

After Phase 5 is complete:

1. **Phase 1**: Implement backend core pipeline (OCR, parsing, chunking, analysis, embedding)
2. **Phase 3**: Implement API endpoints
3. **Phase 2**: Implement frontend components
4. **Phase 4**: Implement Go microservices (optional optimization)
5. **Phase 6**: Integration and testing

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://legal_admin:123456@localhost:5432/legal_ai_db

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_DOCUMENTS=evidence-documents
MINIO_BUCKET_PROCESSED=evidence-processed

# Qdrant (for later phases)
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=evidence-embeddings
QDRANT_VECTOR_SIZE=768

# Ollama (for later phases)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=embeddinggemma:latest

# Processing
MAX_FILE_SIZE_MB=50
CHUNK_SIZE=512
CHUNK_OVERLAP=50
```

## Performance Considerations

### Vector Search Performance

The HNSW index on `evidence_embeddings.embedding` provides fast similarity search:
- Typical query time: <100ms for 1M vectors
- Memory overhead: ~10% of vector data size

### Full-Text Search Performance

The GIN index on `evidence_chunks_fts.content_tsvector` provides fast keyword search:
- Typical query time: <50ms for 1M documents
- Supports complex queries: `'statute & (contract | agreement)'`

### Scaling Considerations

For large deployments:
- Use connection pooling (PgBouncer)
- Enable table partitioning by date
- Archive old data to separate storage
- Use read replicas for search queries

## Maintenance

### Backup Database

```bash
pg_dump -U legal_admin legal_ai_db > backup.sql
```

### Restore Database

```bash
psql -U legal_admin legal_ai_db < backup.sql
```

### Vacuum and Analyze

```bash
psql -U legal_admin -d legal_ai_db -c "VACUUM ANALYZE;"
```

### Monitor Disk Usage

```bash
psql -U legal_admin -d legal_ai_db -c "
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"
```

## References

- PostgreSQL Documentation: https://www.postgresql.org/docs/
- pgvector Documentation: https://github.com/pgvector/pgvector
- MinIO Documentation: https://min.io/docs/
- Qdrant Documentation: https://qdrant.tech/documentation/

---

**Phase 5 Status**: ✅ Complete
**Next Phase**: Phase 1 - Backend Core Pipeline
