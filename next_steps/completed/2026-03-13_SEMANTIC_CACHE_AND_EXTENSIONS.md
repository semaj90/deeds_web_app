# Semantic Cache + PostgreSQL Extensions — Complete

**Date**: March 13, 2026

---

## What Was Done

### 1. Redis Stack Upgrade (redis:7-alpine → redis/redis-stack-server:7.4.0-v3)
- Added RediSearch, RedisJSON, RedisBloom, RedisTimeSeries, RedisGears modules
- RediSearch enables vector similarity search for semantic caching
- Same data volume, drop-in replacement
- Memory limit bumped 512M → 768M

### 2. LiteLLM Proxy (new service, port 4000)
- OpenAI-compatible gateway routing to Ollama (and future TRT-LLM)
- Semantic caching via Redis Stack + embeddinggemma (768-dim)
- Similarity threshold: 0.85 (high precision for legal domain)
- Cache TTL: 1 hour
- Verified: exact-match cache hit returns instantly, paraphrased queries get fresh responses
- Config: `litellm_config.yaml`

### 3. pgvectorscale 0.5.1 (new extension)
- StreamingDiskANN index type (inspired by Microsoft DiskANN)
- Statistical Binary Quantization (SBQ) — 75% memory savings
- 28x lower p95 latency vs Pinecone at 99% recall (50M vectors)
- Created `idx_evidence_embedding_diskann` on `evidence.embedding`
- Installed from prebuilt Ubuntu .deb (works on Debian bookworm base)

### 4. pg_cron 1.6 (new extension)
- Scheduled SQL maintenance jobs inside PostgreSQL
- Requires `shared_preload_libraries = 'pg_cron'` (configured via ALTER SYSTEM)
- Two jobs scheduled:
  - `reindex-evidence-hnsw`: Sundays 3 AM
  - `vacuum-evidence`: Daily 2 AM

### 5. HNSW Index on evidence.embedding
- `idx_evidence_embedding_hnsw` (m=16, ef_construction=200)
- Cosine similarity operator class
- Previously had zero vector indexes

---

## Current Extension Stack (8 total)

| Extension | Version | Purpose |
|-----------|---------|---------|
| vector (pgvector) | 0.8.1 | HNSW/IVFFlat, halfvec, binary quantization |
| vectorscale | 0.5.1 | StreamingDiskANN + SBQ compression |
| pg_cron | 1.6 | Scheduled maintenance jobs |
| plpython3u | 1.0 | pgai Python functions |
| pg_trgm | 1.6 | Trigram text similarity |
| pgcrypto | 1.3 | Cryptographic functions |
| uuid-ossp | 1.1 | UUID generation |
| plpgsql | 1.0 | PL/pgSQL |

---

## Files Changed

| File | Change |
|------|--------|
| `docker/postgres/Dockerfile` | Added pgvectorscale (.deb), pg_cron, shared_preload_libraries |
| `docker/init/02-pgai.sql` | Added CREATE EXTENSION vectorscale, pg_cron, cron.schedule() jobs |
| `docker-compose.sveltekit-prod.yml` | Redis Stack image, LiteLLM proxy service, REDIS_PASSWORD env |
| `litellm_config.yaml` | Semantic cache enabled, Triton placeholder, model routing cleanup |

---

## Running Services

| Service | Container | Port | Status |
|---------|-----------|------|--------|
| PostgreSQL 17 (8 extensions) | deeds-postgres-prod | 5432 | UP |
| Redis Stack 7.4.2 (6 modules) | deeds-redis-prod | 6379 | UP |
| LiteLLM Proxy | deeds-litellm-proxy | 4000 | UP |
| Qdrant (72 collections, INT8) | deeds-qdrant-prod | 6333 | UP |
| MinIO | phase66-minio | 9000 | UP |
| RabbitMQ | phase66-rabbitmq | 5672 | UP |
| CouchDB | phase66-couchdb | 5984 | UP |
| Ollama (GPU) | native | 11434 | UP |

---

## Known Issues

- `embeddinggemma` shows as "unhealthy" in LiteLLM health check — embedding-only model, health check tries `/api/generate`. Embedding calls work fine.
- `gemma-270m-context` model not loaded in Ollama — non-critical
- Evidence embedding tables (`evidence_vectors`, `case_embeddings`, etc.) store vectors as TEXT not `vector(768)` — need ALTER COLUMN for vector indexing

---

## Next Steps

### Immediate
1. **Fix TEXT → vector(768)** on 6 embedding tables — enables HNSW/DiskANN indexing
2. **Wire SvelteKit to LiteLLM** — route inference through `localhost:4000` for automatic semantic caching
3. **Commit all changes** — Dockerfile, docker-compose, litellm_config, init SQL

### Short-term
4. **pgai LiteLLM functions** — install `ai.litellm_embed()`, `ai.litellm_generate()` for in-database calls through LiteLLM proxy
5. **Langfuse wiring** — connect LiteLLM to Langfuse for LLM observability
6. **halfvec indexes** — test pgvector 0.8.1 half-precision for 50% storage reduction

### Medium-term
7. **TRT-LLM engine build** — Phase 1 of plan — build Gemma3 12B INT4 engine inside Linux container
8. **Uncomment Triton entry** in `litellm_config.yaml` once TRT engine is built
9. **pgvectorscale at scale** — when evidence data grows past 1M rows, StreamingDiskANN outperforms HNSW
10. **Redis semantic cache monitoring** — track hit ratios via `FT.INFO litellm_semantic_cache_index`
