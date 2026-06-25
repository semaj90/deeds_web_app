---
name: parent-atlas-packet-retrieval
description: Query Parent Atlas canonical packets via PostgreSQL + TurboVec ANN/HNSW without reading raw files
type: skill
tags: [retrieval, postgres, turbovec, hnsw, simdjson, acp-trace, packet-first]
---

# Parent Atlas Packet Retrieval Skill

**Purpose**: Fetch compact packet summaries from PostgreSQL via Docker exec, with optional TurboVec ANN/HNSW semantic search and simdjson bridge tracing.

**Why packets, not files**: Packets are pre-summarized (1-3 sentences), scored, and topologically located. Raw files bloat context 100×.

---

## Command Pattern

```bash
atlas:packet <query> [--ann] [--hnsw] [--trace] [--limit N]
```

### Arguments
- `<query>` — Semantic query (e.g., "persons of interest API", "auth middleware")
- `--ann` — Use TurboVec/Qdrant ANN search (vector similarity)
- `--hnsw` — Use HNSW index (hierarchical navigable small worlds, faster ANN)
- `--trace` — Enable simdjson bridge tracing + ACP telemetry
- `--limit N` — Max packets returned (default: 10)

---

## Execution Paths

### Path 1: Exact Lexical Search (Fast, No GPU)
```bash
# Query: find "middleware" in packet_key, source_ref, feature_id
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT packet_key, source_ref, feature_id, summary, som_row, som_col, cluster_id
   FROM atlas_packets
   WHERE packet_key ILIKE '%middleware%'
      OR source_ref ILIKE '%middleware%'
      OR feature_id ILIKE '%middleware%'
   LIMIT 10;"
```

**When**: Quick lookups, known file paths, exact names
**Speed**: < 50ms (Postgres full-text index)

---

### Path 2: TurboVec ANN Search (Vector Similarity, GPU-accelerated)
```bash
# 1. Embed query via EmbeddingGemma (768-dim)
QUERY_VEC=$(curl -s http://127.0.0.1:5173/api/embed \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"text":"persons of interest retrieval"}' | jq -r '.embedding | @json')

# 2. TurboVec ANN search (Postgres pgvector + HNSW)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT 
     packet_key, 
     source_ref, 
     feature_id, 
     summary,
     (embedding <-> '$QUERY_VEC'::vector) AS distance,
     som_row, som_col, cluster_id
   FROM atlas_packets
   WHERE embedding IS NOT NULL
   ORDER BY embedding <-> '$QUERY_VEC'::vector
   LIMIT 10;"
```

**When**: Semantic search, "find similar code", "what's related to auth"
**Speed**: 5-50ms (HNSW index pre-computed)
**Index**: `atlas_packets_embedding_hnsw_idx` (created via migration)

---

### Path 3: SOM Topology Expansion (Graph-Aware)
```bash
# After ANN hit on som_row=5, som_col=14, expand to neighbors
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT 
     packet_key, 
     source_ref, 
     feature_id, 
     summary,
     som_row, som_col,
     SQRT(POWER(som_row - 5, 2) + POWER(som_col - 14, 2)) AS som_distance
   FROM atlas_packets
   WHERE som_row BETWEEN 3 AND 7
     AND som_col BETWEEN 12 AND 16
   ORDER BY som_distance ASC
   LIMIT 20;"
```

**When**: "Find code near auth middleware", topological browsing
**Speed**: < 10ms (Postgres 2D index)

---

### Path 4: Full Retrieval Ladder (Production ACE)
```bash
# 1. Query → embedding (EmbeddingGemma)
# 2. Check Valkey cache (centroid:som_cell, bitfrost:packet)
# 3. TurboVec ANN top-50
# 4. Postgres materialize summaries
# 5. Neo4j KAG/DAG 1-hop expansion
# 6. GPU rerank (batchCosineSimilarity)
# 7. Gemma4 synthesis

# Simplified Postgres retrieval (rest is in ACE context-assembler.ts):
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "WITH ranked AS (
    SELECT 
      packet_key, source_ref, feature_id, summary, 
      embedding, som_row, som_col, cluster_id,
      (embedding <-> '[0.1, -0.2, 0.3...]'::vector) AS sim_score
    FROM atlas_packets
    WHERE embedding IS NOT NULL
    ORDER BY embedding <-> '[0.1, -0.2, 0.3...]'::vector
    LIMIT 50
  )
  SELECT 
    packet_key, source_ref, feature_id, summary,
    som_row, som_col, cluster_id,
    RANK() OVER (ORDER BY sim_score ASC) AS rank
  FROM ranked;"
```

---

## Simdjson Bridge Tracing

Enable to see parse performance + ACP trace telemetry:

```bash
# Set env var before querying
export TRACE_SIMDJSON=1
export TRACE_ACP=1

# Then run retrieval (e.g., via npm script)
npm run atlas:packet "auth middleware" --trace
```

**What's traced**:
1. **simdjson parse**: JSON payload deserialization speed (should be < 1ms for 10 packets)
2. **ACP transport**: Packet RPC latency (should be < 50ms)
3. **Vectore embedding**: EmbeddingGemma latency (should be < 500ms)
4. **TurboVec ANN**: Postgres pgvector index lookup (should be < 30ms)

**Output** (goes to `docs/reports/retrieval-trace-<timestamp>.json`):
```json
{
  "query": "auth middleware",
  "steps": [
    {
      "step": "simdjson_parse",
      "packets_count": 10,
      "latency_ms": 0.8,
      "status": "OK"
    },
    {
      "step": "acp_transport",
      "roundtrips": 2,
      "latency_ms": 45,
      "trace_id": "ace:packet:auth:001"
    },
    {
      "step": "turbovec_ann",
      "index": "atlas_packets_embedding_hnsw_idx",
      "latency_ms": 22,
      "results": 10
    }
  ],
  "total_ms": 68
}
```

---

## Why TurboVec + HNSW Over BM25?

| Search Type | Speed | Accuracy | When |
|---|---|---|---|
| **BM25** (lexical) | < 1ms | Good for exact terms | "find middleware" |
| **TurboVec ANN** (vector) | 5-50ms | Great for semantic intent | "code related to auth" |
| **HNSW** (hierarchical graph) | 5-30ms | Fastest ANN, pre-indexed | Production queries |
| **SOM topology** (grid) | < 10ms | Finds neighbors, not duplicates | "nearby cluster" |
| **Combined** (ACE ladder) | 50-100ms | Best results, all signals | Final answer |

**TurboVec HNSW is the default** because:
- Pre-computed index (no runtime tree build)
- GPU-free (CPU search, no CUDA overhead)
- Scales to millions of packets
- Works with partial matches (SOM neighbors)

---

## Missing Summaries in Parent Atlas

**Why summaries are missing:**

Ingestion pipeline skipped Step 4 (embed) → Step 5 (store embedding_768):
```
1. ✅ Find changed files (graphify)
2. ✅ Chunk/materialize packets
3. ❌ Summarize (skipped — Gemma4 summary generation)
4. ❌ Embed with EmbeddingGemma (skipped)
5. ❌ Store embedding_768 (skipped)
6. ❌ Autoencoder 768 → 64 (skipped)
7. ❌ SOM assign row/col (skipped)
8. ❌ Cache centroids in Valkey (skipped)
```

**Fix: Run the backfill pipeline**

```bash
# Step 3: Summarize packets with Gemma4
npm run atlas:backfill:summaries --apply

# Step 4-5: Embed via EmbeddingGemma + store
npm run atlas:backfill:embeddings --apply

# Step 6-7: SOM/KMeans clustering
npm run atlas:backfill:som-topology --apply

# Step 8: Warm Valkey centroids
npm run atlas:backfill:valkey-centroids --apply

# Verify
npm run atlas:packet "auth middleware" --ann
```

**Timeline**: ~15-30 min for 3,251 packets (depending on Gemma4 throughput)

---

## PostgreSQL Schema (For Reference)

```sql
-- Canonical packet table
CREATE TABLE atlas_packets (
  packet_key        TEXT PRIMARY KEY,
  source_ref        TEXT NOT NULL,
  file_path         TEXT,
  feature_id        TEXT,
  feature_label     TEXT,
  summary           TEXT,                    -- 1-3 sentence summary
  embedding         vector(768),             -- 768-dim EmbeddingGemma
  som_row          INTEGER,                  -- Topological grid row
  som_col          INTEGER,                  -- Topological grid col
  cluster_id       TEXT,                     -- KMeans cluster
  created_at       TIMESTAMP DEFAULT NOW()
);

-- HNSW index for ANN search
CREATE INDEX atlas_packets_embedding_hnsw_idx 
  ON atlas_packets USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search
CREATE INDEX atlas_packets_fts_idx 
  ON atlas_packets USING gin (to_tsvector('english', summary));
```

---

## OpenCode Integration

**Permission needed**: `docker exec` on PostgreSQL container

**Add to OpenCode config** (`opencode.jsonc`):

```json
{
  "permissions": {
    "docker_exec": {
      "allowed": true,
      "containers": ["legal-ai-postgres"],
      "commands": ["psql"]
    },
    "curl_http": {
      "allowed": true,
      "endpoints": [
        "http://127.0.0.1:5173/api/embed",
        "http://127.0.0.1:5173/api/codebase-index"
      ]
    },
    "file_write": {
      "allowed": true,
      "paths": ["docs/reports/"]
    }
  }
}
```

**Invoke from Gemma4**:

```
User: "What's the auth middleware doing?"

Gemma4 thinks:
  1. Query: "auth middleware" 
  2. Call skill: atlas:packet --ann --trace --limit 5
  3. Get 5 compact packets (summaries, not raw files)
  4. Synthesize answer from summaries
  
Output: "The auth middleware (packet:auth:001) validates Lucia sessions and redirects to /login on 401."
```

---

## Quick Commands

```bash
# Exact lexical search
atlas:packet "middleware" --limit 5

# Semantic search (TurboVec ANN)
atlas:packet "how does authentication work" --ann --limit 10

# Topology neighbors (SOM grid)
atlas:packet "find code near auth" --topology --limit 15

# Full trace (for debugging)
atlas:packet "retrieval test" --ann --hnsw --trace --limit 5

# Backfill missing summaries
atlas:packet:backfill-summaries --apply

# Backfill embeddings (enables ANN)
atlas:packet:backfill-embeddings --apply
```

---

## Next Steps

1. ✅ Create OpenCode skill (this file)
2. ⏳ Run backfill pipeline (summaries → embeddings → SOM → Valkey)
3. ⏳ Add npm scripts (atlas:packet, atlas:packet:backfill-*)
4. ⏳ Wire `docker exec` permission in OpenCode config
5. ⏳ Test retrieval via Gemma4 + ACE context-assembler
6. ⏳ Monitor TurboVec ANN latency (target < 30ms)

---

**Reference**: Parent Atlas Frozen Identity Contract + Retrieval E2E Benchmark (3206ms, under 5s SLA)
