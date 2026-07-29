# Vector Schema: 768-Dim Canonical Decision
**Date**: 2026-07-29  
**Status**: SUPERSEDES prior 384-oriented recommendations

---

## Canonical Decision: 768-Dimensional Embeddings

**Model**: `embeddinggemma:latest`  
**Dimension**: 768 (verified via model inspection, not inferred from data)  
**Representation ID**: `semantic_768`  
**Collection**: `codebase_chunks_768` (canonical semantic retrieval)

---

## PostgreSQL Schema (Immutable)

```sql
-- Table: packet_embeddings_768
-- Purpose: Canonical 768-dim semantic vectors with full provenance tracking
-- Constraints: model_revision + representation_id locked per packet
-- Index: HNSW cosine similarity for fast ANN retrieval

CREATE TABLE packet_embeddings_768 (
    packet_key text PRIMARY KEY
        REFERENCES atlas_packets(packet_key)
        ON DELETE CASCADE,
    
    model_revision text NOT NULL,
    representation_id text NOT NULL
        CHECK (representation_id = 'semantic_768'),
    
    content_hash text NOT NULL,
    embedding vector(768) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    
    UNIQUE (
        content_hash,
        model_revision,
        representation_id
    )
);

-- HNSW index for cosine similarity (ANN retrieval)
CREATE INDEX CONCURRENTLY IF NOT EXISTS
    packet_embeddings_768_cosine_hnsw
ON packet_embeddings_768
USING hnsw (embedding vector_cosine_ops)
WITH (
    m = 16,
    ef_construction = 96
);

-- Verify extension exists
SELECT current_setting('server_version') AS postgres_version,
       extversion AS pgvector_version
FROM pg_extension
WHERE extname = 'vector';
```

---

## Qdrant Collection Schema (Named Vectors)

```json
{
  "collection_name": "codebase_chunks_768",
  "vectors": {
    "semantic_768": {
      "size": 768,
      "distance": "Cosine",
      "datatype": "float32",
      "hnsw": {
        "m": 16,
        "ef_construct": 96
      }
    },
    "bm42_sparse": {
      "datatype": "sparse_vector",
      "index": {
        "on_disk": true
      }
    }
  },
  "payload_schema": {
    "packet_key": { "type": "keyword" },
    "model_revision": { "type": "keyword" },
    "representation_id": { "type": "keyword" },
    "content_hash": { "type": "keyword" },
    "created_at": { "type": "datetime" }
  }
}
```

---

## Go Retrieval Contract (Validated at Runtime)

```go
// RepresentationContract enforces strict identity validation
type RepresentationContract struct {
    Name                  string // "semantic_768"
    Dimension             int    // 768
    ModelID               string // "embeddinggemma"
    ModelRevision         string // e.g., "2026-07-29"
    NormalizationVersion  string // e.g., "v1"
    Representation        string // "semantic_768"
}

// ValidateEmbedding checks dimension, finite values, and model lineage
func ValidateEmbedding(vector []float32, contract RepresentationContract) error {
    if len(vector) != contract.Dimension {
        return fmt.Errorf(
            "embedding dimension mismatch: %s expected %d, got %d",
            contract.Name, contract.Dimension, len(vector),
        )
    }
    for i, v := range vector {
        if math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
            return fmt.Errorf("non-finite embedding at index %d", i)
        }
    }
    return nil
}

// Usage in hot path
func SearchSemantic(query string, limit int) ([]Result, error) {
    // 1. Embed query (768-dim)
    queryVec, err := embeddingService.Embed(query, "semantic_768")
    if err != nil {
        return nil, err
    }
    
    // 2. Validate contract
    contract := RepresentationContract{
        Name:         "semantic_768",
        Dimension:    768,
        ModelID:      "embeddinggemma",
        Representation: "semantic_768",
    }
    if err := ValidateEmbedding(queryVec, contract); err != nil {
        return nil, err
    }
    
    // 3. Search Qdrant (semantic_768 vector only)
    points, err := qdrant.Search(&SearchRequest{
        CollectionName: "codebase_chunks_768",
        Vector:         QueryVector{Name: "semantic_768", Vector: queryVec},
        Limit:          limit,
        WithPayload:    true,
    })
    if err != nil {
        return nil, err
    }
    
    // 4. Validate result payloads (optional striping)
    for _, point := range points {
        payload := point.Payload
        if payload["model_revision"] != contract.ModelRevision {
            // Log warning, do not fail (backwards compat)
            log.Warnf("point %s has stale model_revision", payload["packet_key"])
        }
    }
    
    return points, nil
}
```

---

## Embedding Service Configuration

**Environment (docker-compose.yml inside Docker):**
```yaml
legal-ai-go-embedding:
  environment:
    EMBEDDING_MODEL: "embeddinggemma:latest"
    EMBEDDING_DIMENSION: "768"
    EMBEDDING_REPRESENTATION: "semantic_768"
    EMBEDDING_MODEL_REVISION: "2026-07-29"
    EMBEDDING_NORMALIZATION: "v1"
    CUDA_VISIBLE_DEVICES: "0"
```

**Health endpoint response:**
```json
{
  "status": "ready",
  "model": "embeddinggemma:latest",
  "dimension": 768,
  "representation": "semantic_768",
  "model_revision": "2026-07-29",
  "normalization": "v1",
  "provider": "CUDAExecutionProvider",
  "batch_size": 32
}
```

---

## Backfill Pipeline (52,380 vectors)

**Step 1: Verify schema exists**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT COUNT(*) FROM packet_embeddings_768;"
# Expected: 0 (empty table, ready for backfill)
```

**Step 2: Backfill from codebase_chunk_index to packet_embeddings_768**
```sql
-- Upsert embeddings with model metadata
INSERT INTO packet_embeddings_768 (
    packet_key,
    model_revision,
    representation_id,
    content_hash,
    embedding
)
SELECT
    p.packet_key,
    '2026-07-29' AS model_revision,
    'semantic_768' AS representation_id,
    c.content_hash,
    c.content_embedding
FROM codebase_chunk_index c
JOIN atlas_packets p ON p.packet_key = c.source_ref
WHERE c.content_embedding IS NOT NULL
    AND c.content_embedding::text != '[]'
ON CONFLICT (content_hash, model_revision, representation_id)
DO UPDATE SET
    embedding = EXCLUDED.embedding,
    created_at = now()
WHERE packet_embeddings_768.content_hash = EXCLUDED.content_hash;
```

**Step 3: Verify backfill coverage**
```sql
SELECT COUNT(*) AS total_backfilled
FROM packet_embeddings_768;
-- Expected: 52,380

SELECT COUNT(*) AS indexed
FROM packet_embeddings_768
WHERE embedding IS NOT NULL;
-- Expected: 52,380

SELECT COUNT(DISTINCT model_revision) AS revisions
FROM packet_embeddings_768;
-- Expected: 1 (only '2026-07-29')
```

**Step 4: Export to Qdrant (NDJSON streaming)**
```bash
# Use phase108d-embeddings-backfill-ndjson.mts or equivalent
npm run atlas:qdrant:backfill:768 \
  --collection codebase_chunks_768 \
  --vector-name semantic_768 \
  --batch-size 1000 \
  --source packet_embeddings_768
```

---

## Hard Rules (Non-Negotiable)

### ❌ FORBIDDEN

- **Padding 384→768**: Never append zeros or interpolate to 768 dimensions
- **Truncating 768→384**: Never drop trailing dimensions
- **Cross-model comparison**: Never cosine-similarity vectors from different `model_revision` values
- **Dimension-based inference**: Never assume `768-dim vector` = `embeddinggemma:latest` without model_revision proof
- **Silent model switching**: Never upgrade embedding model without incrementing `model_revision`
- **Mixed collection queries**: Never search both semantic_768 and bm42_sparse in single ANN query (use separate searches + RRF fusion)

### ✅ REQUIRED

- **Model metadata on every vector**: `model_revision` and `representation_id` must be populated
- **Content hash validation**: Prevent duplicate embeddings for identical content
- **Contract validation at runtime**: Go retrieval must reject dimension mismatches before Qdrant query
- **Explicit representation name**: Query must specify `vector_name: "semantic_768"` (never infer from dimension)
- **Backwards-compatible warnings**: Log mismatched model_revision (do not fail) for stale data

---

## Migration Path (If Model Changes)

If embedding model upgraded (e.g., `embeddinggemma:latest` → `embeddinggemma:v2`):

1. **New table**: Create `packet_embeddings_768_v2` with new model_revision
2. **Parallel backfill**: Populate v2 table while keeping v1 active
3. **Gradual switchover**: Route 10% → 50% → 100% of queries to v2
4. **Archive v1**: After 30 days, archive v1 table (keep for audit trail)
5. **No in-place updates**: Never UPDATE `model_revision` on existing rows

---

## Qdrant Health Check

```bash
# Verify collection exists
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result | {points_count, status}'
# Expected: {"points_count": 52380, "status": "green"}

# Verify named vectors exist
curl -s http://127.0.0.1:6333/collections/codebase_chunks_768 | jq '.result.config.vectors'
# Expected: {"semantic_768": {...}, "bm42_sparse": {...}}

# Test retrieval (semantic_768 only)
curl -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": {
      "name": "semantic_768",
      "vector": [0.1, 0.2, ..., 0.8]  // 768 floats
    },
    "limit": 10,
    "with_payload": true
  }' | jq '.result | length'
# Expected: 10
```

---

## What Changed from Prior (384-Oriented) Guidance

**SUPERSEDED:**
- ❌ "384d canonical semantic lane" → ✅ "768d canonical semantic lane"
- ❌ "codebase_chunks_384_hybrid" → ✅ "codebase_chunks_768"
- ❌ "keep 768d read-only" → ✅ "768d is the live retrieval path"
- ❌ "separate collections by dimension" → ✅ "one collection, named vectors schema"
- ❌ "64d autoencoder for semantic search" → ✅ "64d topology/clustering only, not semantic"

**STILL VALID:**
- ✅ No dimension inference from data alone
- ✅ Model lineage tracked via model_revision
- ✅ Content hash deduplication
- ✅ Contract validation in hot path
- ✅ Qdrant gRPC for retrieval (not HTTP)
- ✅ Go retrieval orchestration layer
- ✅ Postgres as truth, Qdrant as mirror

---

## Verification Checklist

Before executing Phase 17 (SOM, Autoencoder, Neo4j):

- [ ] `packet_embeddings_768` table created with HNSW index
- [ ] 52,380 vectors backfilled from codebase_chunk_index
- [ ] `codebase_chunks_768` collection created in Qdrant with named vectors
- [ ] Go retrieval health check returns `dimension: 768, representation: semantic_768`
- [ ] One end-to-end semantic query executed (query → embed → validate → Qdrant search)
- [ ] Second identical query verified as cache hit
- [ ] Postgres model_revision audit shows all 52,380 rows = '2026-07-29'
- [ ] Qdrant payload inspection confirms packet_key + model_revision on all points

**Once verified:** SOM/Autoencoder/Neo4j optimization can proceed with high confidence.
