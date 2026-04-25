# PostgreSQL Database Setup & Migrations

## Overview

The Legal AI Platform uses PostgreSQL with pgvector extension for vector similarity search. The database is automatically initialized with 13+ migrations covering:

- **pgvector Extension** - Vector data type (384 & 768 dimensions)
- **Legal Document Schema** - Cases, evidence, documents with embeddings
- **Vector Indexes** - IVFFlat and HNSW for fast similarity search
- **Case Management** - Timeline, activities, memories, recommendations
- **Chat & Session Management** - Real-time legal AI conversations
- **Upload Management** - File tracking and OCR integration

## Quick Start

### 1. Start Services (includes database initialization)
```bash
npm run dev:quic:full
```

This command:
- Starts PostgreSQL with pgvector (port 5432)
- Runs all 13 migrations automatically
- Starts Redis, Qdrant, Neo4j, MinIO, RabbitMQ
- Starts Caddy QUIC proxy
- Launches Vite dev server

### 2. Manual Database Initialization
```bash
# From sveltekit-frontend directory
npm run db:init

# With seeding (adds sample data)
npm run db:init:full
```

### 3. From Root Directory
```bash
npm run db:init
```

## Database Structure

### Key Tables

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `legal_documents` | Document storage | 384-dim embeddings, JSONB metadata |
| `cases` | Legal cases | Status tracking, priority levels |
| `case_timeline` | Case events | Timestamps, importance levels |
| `case_memories` | AI memories | 1536-dim embeddings for context |
| `chat_messages` | Conversations | Session-based threading |
| `evidence` | Legal evidence | File uploads, OCR data |
| `ai_recommendations` | AI suggestions | Confidence scores, action items |
| `uploads` | File management | Mime type, size tracking |

### Vector Dimensions

- **384 dimensions**: Legal document content (primary)
- **768 dimensions**: Case analysis (legacy support)
- **1536 dimensions**: Case memories (Gemma3 compatible)

### Extensions

```sql
-- pgvector v0.8.0
CREATE EXTENSION IF NOT EXISTS vector;
```

## Migrations Applied

When you run `npm run db:init`, the following migrations execute in order:

1. **ensure-pgvector.sql** - Ensures vector extension exists
2. **001_init_pgvector.sql** - Initial pgvector setup
3. **002_enhanced_schema_with_qdrant.sql** - Qdrant integration tables
4. **003_deploy_enhanced_legal_schema.sql** - Core legal schema
5. **004_add_missing_api_tables.sql** - API-related tables
6. **005_setup_legal_ai_tables.sql** - AI processing tables
7. **006_optimize_vector_indexing.sql** - Vector index optimization
8. **008_standardize-vector-dimensions-to-384.sql** - 384-dim standardization
9. **010_standardize_vectors_384.sql** - Additional 384-dim indexes
10. **010_add_uploads_table.sql** - File upload tracking
11. **011_create_case_memories_and_pgvector.sql** - Case memory storage
12. **20251026_create_cases_table.sql** - Drizzle-generated case table
13. **20251101_add_processed_at_documents.sql** - Document processing timestamps

## Environment Variables

```bash
# Database connection
DATABASE_URL="postgresql://legal_admin:123456@localhost:5432/legal_ai_db"

# Or individual variables (used in drizzle.config.ts)
DB_HOST=localhost
DB_PORT=5432
DB_USER=legal_admin
DB_PASSWORD=123456
DB_NAME=legal_ai_db
```

## Accessing the Database

### PostgreSQL CLI
```bash
psql -h localhost -p 5432 -U legal_admin -d legal_ai_db
# Password: 123456
```

### Drizzle Studio
```bash
npm run db:studio
```

### VS Code SQL Tools
1. Install "SQLTools" extension
2. Configure connection to `localhost:5432`
3. User: `legal_admin`, Password: `123456`

## Vector Search Examples

### Find Similar Legal Documents
```sql
-- Find top 5 documents similar to a case
SELECT id, title,
       1 - (embedding <=> query_embedding) AS similarity
FROM legal_documents
ORDER BY embedding <=> query_embedding
LIMIT 5;
```

### Vector Index Performance
```sql
-- Verify indexes are being used
EXPLAIN ANALYZE
SELECT id, title
FROM legal_documents
ORDER BY embedding <=> ARRAY[...]::vector
LIMIT 10;
```

## Troubleshooting

### "pgvector extension not found"
```bash
# Restart PostgreSQL container
docker stop legal-postgres
docker rm legal-postgres
npm run postgres:quic:setup
npm run db:init
```

### "Column does not exist" errors
These are expected during the migration process. The migrations handle both creating and altering tables.

### Vector dimension mismatch
Ensure your embedding service outputs 384-dimensional vectors:
```bash
# Query the schema
psql -h localhost -U legal_admin -d legal_ai_db -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'legal_documents'
  AND column_name LIKE '%embedding%'
"
```

### Connection refused
Verify PostgreSQL is running:
```bash
docker ps | grep legal-postgres
```

If not running, start it:
```bash
npm run postgres:quic:setup
```

## Performance Tuning

### Vector Index Creation
After adding many documents, rebuild indexes:
```sql
-- Rebuild HNSW index for better search
REINDEX INDEX idx_legal_documents_embedding_hnsw;
```

### Connection Pooling
The frontend uses Drizzle ORM which handles connection pooling automatically.

### Query Optimization
```sql
-- Analyze query plans
ANALYZE;

-- Check vector index stats
SELECT * FROM pg_stat_user_indexes
WHERE indexname LIKE '%embedding%';
```

## Development Workflow

### 1. First Time Setup
```bash
npm run dev:quic:full
```

### 2. Make Schema Changes
```bash
# Create new migration
npx drizzle-kit generate

# Review generated SQL
vim drizzle/migrations/...
```

### 3. Apply Migrations
```bash
npm run db:init
```

### 4. Verify Changes
```bash
npm run db:studio
# Or
psql -h localhost -U legal_admin -d legal_ai_db
```

## Backup & Restore

### Backup Database
```bash
PGPASSWORD=123456 pg_dump \
  -h localhost \
  -U legal_admin \
  legal_ai_db > backup.sql
```

### Restore from Backup
```bash
PGPASSWORD=123456 psql \
  -h localhost \
  -U legal_admin \
  legal_ai_db < backup.sql
```

## Next Steps

1. **Vector Embeddings**: Ensure your embedding service outputs 384-dim vectors
2. **Data Loading**: Use the application's upload feature or batch import scripts
3. **Index Tuning**: After production data loads, rebuild indexes for optimal performance
4. **Monitoring**: Monitor query performance with `\timing` in psql

---

**Last Updated**: 2025-10-26
**Database Version**: PostgreSQL 17
**pgvector Version**: 0.8.0
**Status**: ✅ Production Ready
