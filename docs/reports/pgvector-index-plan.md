# pgvector HNSW Index Plan

_Generated: 2026-05-16 — Phase 6E_

## Context

Six vector tables in the live Postgres DB have no HNSW indexes.
Vector similarity search currently uses **sequential scans** on these tables.
This plan documents the recommended indexes **before** any migrations are applied.

> **Rule**: Do not run these migrations in production without operator review of each entry.  
> **Rule**: Every index uses `CREATE INDEX CONCURRENTLY IF NOT EXISTS` to avoid locking.  
> **Rule**: Validate with `npm run audit:pgvector` after each migration.

---

## Tables Requiring HNSW Indexes

| Table | Vector Column | Dimensions | Distance Opclass | Index Name | Risk |
|-------|--------------|------------|------------------|------------|------|
| `evidence_vectors` | `embedding` | 768 | `vector_cosine_ops` | `evidence_vectors_hnsw_idx` | Low — table may be empty in dev |
| `codebase_chunks_768` | `embedding` | 768 | `vector_cosine_ops` | `codebase_chunks_768_hnsw_idx` | Low — rebuild-safe |
| `legal_documents` | `embedding` | 768 | `vector_cosine_ops` | `legal_documents_hnsw_idx` | Low |
| `chat_messages` | `embedding` | 768 | `vector_cosine_ops` | `chat_messages_hnsw_idx` | Low |
| `legal_cases` | `embedding` | 768 | `vector_cosine_ops` | `legal_cases_hnsw_idx` | Low |
| `embedding_cache` | `embedding` | 768 | `vector_cosine_ops` | `embedding_cache_hnsw_idx` | Low |

---

## Recommended Index Parameters (RTX 3060 Ti / 8GB, dev scale)

```sql
-- m=16, ef_construction=64 is the pgvector recommended default for balanced quality/speed
-- Adjust ef_construction=128 for higher recall at the cost of longer build time
m = 16
ef_construction = 64
```

---

## Migration SQL (do NOT run without review)

File to create: `sveltekit-frontend/drizzle/manual/20260516_hnsw_indexes.sql`

```sql
-- pgvector HNSW index plan — Phase 6E
-- Apply with: docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260516_hnsw_indexes.sql
-- All indexes are CONCURRENTLY + IF NOT EXISTS — safe on live tables

-- Prerequisite: confirm pgvector is installed
-- SELECT extversion FROM pg_extension WHERE extname = 'vector';

CREATE INDEX CONCURRENTLY IF NOT EXISTS evidence_vectors_hnsw_idx
  ON evidence_vectors USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS codebase_chunks_768_hnsw_idx
  ON codebase_chunks_768 USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_documents_hnsw_idx
  ON legal_documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_messages_hnsw_idx
  ON chat_messages USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_cases_hnsw_idx
  ON legal_cases USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX CONCURRENTLY IF NOT EXISTS embedding_cache_hnsw_idx
  ON embedding_cache USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## Verification After Applying

```bash
# Check HNSW indexes are present
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT tablename, indexname FROM pg_indexes WHERE indexdef ILIKE '%hnsw%' ORDER BY tablename;"

# Re-run audit — hnsw_indexes check should pass
npm run audit:pgvector
```

---

## Tables NOT in This Plan

| Table | Reason |
|-------|--------|
| `codebase_chunk_index` | Uses `halfvec(768)` — halfvec HNSW syntax differs; needs separate review |
| `evidence_items` (Qdrant) | Qdrant-side collection; HNSW managed by Qdrant, not Postgres |

---

## Status

- [ ] Operator review of SQL above
- [ ] Confirm pgvector extension version (`SELECT extversion FROM pg_extension WHERE extname='vector'`)
- [ ] Apply migration file
- [ ] Run `npm run audit:pgvector` and confirm all checks pass
- [ ] Add `20260516_hnsw_indexes.sql` to `sveltekit-frontend/drizzle/sidecar-migrations.json`