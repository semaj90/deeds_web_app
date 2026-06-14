# Phase 2 Part 4: Multi-Vector Search + JSONB Metadata Enrichment

**Status**: ✅ PLANNED | ⏳ IMPLEMENTATION READY
**Target Average Coverage**: ≥85% (up from Phase 2 Part 3's 98.2%)
**Deadline**: Post Phase 2 Part 3 gate pass (2026-06-14)

---

## Overview

Phase 2 Part 4 extends the canonical packet identity layer with:

1. **Multi-Vector Search** — Leverage Qdrant's 4 native named vectors
2. **JSONB Metadata Enrichment** — Version and structure the metadata envelope
3. **Qdrant Tag-Based Filtering** — Add semantic tags for efficient retrieval
4. **Gemma4 Summarization** — Enrich chunks with AI-generated summaries

---

## Part 1: Multi-Vector Search Architecture

### Current State
Qdrant `codebase_chunks_768` collection has **4 named vectors** (already present):

| Vector Name | Dimensions | Distance | Purpose |
|---|---|---|---|
| `content` | 768 | Cosine | Semantic content embedding (embeddinggemma) |
| `signature` | 768 | Cosine | Function signature / AST structure |
| `encoded_64` | 64 | Cosine | Autoencoder compressed latent space |
| `error` | 768 | Cosine | Reconstruction error from AE |

### Multi-Vector Search API

Qdrant supports **named vector search** (v1.15+):

```bash
# REST API
POST /collections/codebase_chunks_768/points/search
{
  "vector": {
    "name": "content",  # or "signature", "encoded_64", "error"
    "vector": [0.1, 0.2, ..., 0.3]  # float array matching dimension
  },
  "limit": 10,
  "with_payload": true
}

# Search with RRF fusion (future enhancement)
POST /collections/codebase_chunks_768/points/search_batch
[
  { "vector": { "name": "content", "vector": [...] }, "limit": 20 },
  { "vector": { "name": "signature", "vector": [...] }, "limit": 20 }
]
# Client-side RRF combiner: score = 1/(k1 + rank_content) + 1/(k2 + rank_signature)
```

### Implementation Tasks

**Task 1.1: Dual-vector search endpoint** (`/api/codebase/search/multi-vector`)
- Input: query string + optional vector type selector
- Lane A: Embed query in `content` space → search `content` vector
- Lane B: Extract AST signature → search `signature` vector
- Lane C: Hybrid — fetch top-K from both, RRF combine
- Output: merged ranked results with source vector metadata

**Task 1.2: AST signature extraction** (`src/lib/server/ast/signature-vector.ts`)
- Use existing TypeScript AST parser
- Extract function/class/export structure → canonical string
- Hash + embed via embeddinggemma
- Cache in `encoded_sigs` Redis key (24h TTL)
- Fallback: use function name alone if AST extraction fails

**Task 1.3: Error-vector reranking** (`src/lib/server/retrieval/error-vector-rerank.ts`)
- After primary content search, fetch top-K `error` vectors
- High reconstruction error → less certain autoencoder → deprioritize
- Coefficient: `final_score = content_score * (1 - 0.3 * error_normalized)`
- Optional: use `encoded_64` for memory-efficient top-K pre-filter

**Task 1.4: Measurement and ablation**
- Baseline: content-only search (current state)
- A/B test: content + signature RRF (expected +5-10% NDCG@10)
- A/B test: content + error-rerank (expected +3-5% NDCG@10)
- C test: content + signature + encoded_64 (3-way fusion, expected +8-15%)

---

## Part 2: JSONB Metadata Schema Versioning

### Current Metadata Structure

```json
{
  "metadata": {
    "packet_identity_source": "qdrant-payload-complete-backfill",
    "qdrant_payload_version": "phase-d-e-v1",
    "payload_backfilled_at": "2026-06-14T23:10:54.515Z"
  }
}
```

### Enhanced Metadata Envelope (v2)

```json
{
  "metadata": {
    "version": 2,
    "created_at": "2026-06-14T12:00:00Z",
    "updated_at": "2026-06-14T23:10:54Z",
    
    "identity": {
      "source": "atlas_feature_packets",        // or "atlas_packets", "legacy_qdrant_only"
      "packet_key": "src/lib/server/db.ts:abc123",
      "source_ref_canonical": "sveltekit-frontend/src/lib/server/db.ts",
      "directory_path": "src/lib/server",
      "lineage_version": "packet-identity-v1"
    },
    
    "enrichment": {
      "som_cluster": 42,
      "som_bmu_col": 5,
      "som_bmu_row": 8,
      "gpu_kmeans_cluster": 127,
      "centroid_distance": 0.432,
      "glyph_id": "glyph-a1b2c3d4",
      "glyph_type": "api_endpoint"
    },
    
    "retrieval": {
      "vector_source": "embeddinggemma:300m",
      "vector_dim": 768,
      "signature_vector": true,
      "error_vector": true,
      "encoded_64_vector": true,
      "last_vector_update": "2026-06-14T20:30:00Z"
    },
    
    "ai_summary": {
      "summary": "Handles database connection pooling with retry logic...",
      "summary_model": "gemma4-rotorquant:latest",
      "summary_generated_at": "2026-06-14T22:15:00Z",
      "summary_confidence": 0.87,
      "keywords": ["database", "connection", "pooling", "retry"]
    },
    
    "quality": {
      "canonical": true,
      "payload_version": "phase-d-e-v2",
      "payload_matched_at": "2026-06-14T23:10:54Z",
      "ambiguity_score": 0.0,
      "needs_review": false
    }
  }
}
```

### Implementation Tasks

**Task 2.1: Metadata schema migration** (`scripts/atlas/migrate-metadata-v1-to-v2.mjs`)
- Read all 52,606 points from Qdrant
- Transform flat metadata → nested envelope (v1 → v2)
- Add enrichment/retrieval/ai_summary sections as stubs
- Write v2 metadata with `version: 2` flag
- Dry-run: 100 points, apply: full collection
- Report: migration_status.json

**Task 2.2: JSONB metadata validation** (`src/lib/server/db/metadata-schema.ts`)
- Zod schema for metadata envelope v2
- Validator: `validateQdrantMetadata(payload) → {valid, errors[], version}`
- Used on read: flag mismatched versions for repair
- Used on write: reject invalid envelopes (hard gate)

**Task 2.3: Metadata-driven tagging** (Qdrant tags, Phase 2 Part 4 optional)
- Qdrant supports `tags` payload field (already exists as array)
- Tags generated from metadata: `["api_endpoint", "database", "som:42", "glyph:a1b2c3d4", "gpu:127"]`
- Enable tag-based filtering: `filter: { has_tag: ["api_endpoint"] }`
- See Part 3 below

---

## Part 3: Qdrant Tag-Based Filtering Optimization

### Tagging Strategy

Each point gets semantic tags derived from metadata:

```
Feature tags:      feature_id values + canonical labels
Cluster tags:      som_{cluster_id}, gpu_{kmeans_id}
Glyph tags:        glyph_{id}, glyph_type_{type}
Kind tags:         kind_{typescript,python,json,etc}
Domain tags:       domain_{ui,backend,storage,etc}
Quality tags:      canonical, legacy, needs_review
Lane tags:         phase_lane values
Complexity tags:   complexity_{high,medium,low}
```

### Tag-Based Pre-Filter Pattern

```typescript
// Efficient retrieval: tag pre-filter → ANN → payload inspection
async function searchWithTags(query, tags, options) {
  // 1. Filter by tags (fast, Qdrant native)
  const tagged = await qdrant.search('codebase_chunks_768', {
    vector: embeddingQuery,
    filter: {
      all: [
        { has_tag: ["canonical"] },
        { has_tag: tags || [] }  // e.g. ["api_endpoint", "feature:auth"]
      ]
    },
    limit: options.preFfilterLimit || 100,
    with_payload: true
  });

  // 2. Post-filter by metadata constraints
  const filtered = tagged.filter(p => 
    !p.payload.metadata?.quality?.needs_review &&
    p.payload.som_cluster !== null
  );

  // 3. Re-score with Karpathy blend if needed
  const scored = rerank(filtered, query);
  return scored.slice(0, options.limit || 10);
}
```

### Implementation Tasks

**Task 3.1: Tag generation during backfill** (`scripts/atlas/backfill-qdrant-tags.mjs`)
- Iterate all 52,606 points
- Generate tags from metadata + payload fields
- Upsert points with `tags` array updated
- Dry-run: 100 points
- Report: tags_generated_count, sample_tags[]

**Task 3.2: Tag-based search endpoint** (`/api/codebase/search/tagged`)
- Input: `query, tags: ["api_endpoint", "feature:auth"], limit: 10`
- Output: search results with tag matching metadata
- Use case: "Find all API endpoints in auth feature"

---

## Part 4: Gemma4 Summarization Enrichment

### Summarization Pipeline

For each chunk, generate a 1-2 sentence AI summary:

```
Input:  Code chunk (content, file_path, feature_id)
Model:  gemma4-rotorquant:latest (local, GPU-accelerated)
Prompt: "Summarize what this code does in 1-2 sentences. Be concise."
Output: summary (string, 50-150 words) + confidence (0.0-1.0)
```

### Implementation Tasks

**Task 4.1: Batch summarization script** (`scripts/atlas/enrich-chunks-with-gemma4-summary.mjs`)
- Read all 52,606 points from Qdrant
- Batch by 50 chunks (GPU throughput optimization)
- Summarize each chunk via `/api/ai/gemma4-chat`
- Store summary + metadata in `metadata.ai_summary`
- Dry-run: 100 chunks (5 batches)
- Apply: full collection (1,052 batches)
- Graceful degradation: if Gemma4 times out, mark `needs_summary: true`

**Task 4.2: Summary cache** (`src/lib/server/cache/summary-cache.ts`)
- Redis L1: `summary:{packet_key} → {summary, confidence, model, timestamp}` (7d TTL)
- Postgres: `codebase_chunks.ai_summary TEXT` (persist on demand)
- Reuse existing summaries if `summary_model` matches current model version

**Task 4.3: Summary quality gate** (`scripts/atlas/audit-summary-quality.mjs`)
- Sample 100 points with summaries
- Manual review scoring: relevance (1-5), conciseness (1-5), correctness (1-5)
- Gate: average relevance ≥ 4.0 → proceed to full apply
- Report: quality_scores.json

**Task 4.4: Search with summary reranking** (optional enhancement)
- Search query → embed query → find top-K chunks
- Embed summary from metadata → compute similarity to query
- Rerank: `final_score = 0.7 * chunk_score + 0.3 * summary_score`
- Use case: "Find docs about database pooling" (summary helps)

---

## Part 5: Validation Gates (6 gates → 8 gates)

### Gate Definitions

| # | Gate | Metric | Threshold | Status |
|---|---|---|---|---|
| 1 | somCluster | coverage | 80% | ✅ Phase 2.3 |
| 2 | glyphRecord | coverage | 60% | ✅ Phase 2.3 |
| 3 | qdrantHit | coverage | 90% | ✅ Phase 2.3 |
| 4 | redisHotKey | coverage | 50% | ✅ Phase 2.3 |
| 5 | neo4jNode | coverage | 70% | ✅ Phase 2.3 |
| **6** | **Metadata v2** | **coverage** | **85%** | **NEW** |
| **7** | **AI Summary** | **coverage** | **80%** | **NEW** |
| **8** | **Average** | **mean %** | **≥85%** | **NEW** |

### Audit Script

```bash
npm run atlas:phase-2-part-4:audit
# Checks: metadata.version=2, ai_summary.summary present, tags generated
# Output: phase-2-part-4-audit.json
```

### Verification Script

```bash
npm run atlas:phase-2-part-4:verify
# Gates: metadata (85%), summary (80%), tags (75%), average (≥85%)
# Status: PASS (all gates green) or WARN/FAIL
# Output: phase-2-part-4-verify.json
```

---

## Implementation Roadmap

### Phase 2.4 Week 1
- [ ] Task 1.1: Dual-vector search endpoint (6h)
- [ ] Task 1.2: AST signature extraction (4h)
- [ ] Task 2.1: Metadata v1 → v2 migration (3h)
- [ ] Task 2.2: JSONB validation schema (2h)

### Phase 2.4 Week 2
- [ ] Task 1.3: Error-vector reranking (3h)
- [ ] Task 3.1: Tag generation (2h)
- [ ] Task 4.1: Batch Gemma4 summarization (8h)
- [ ] Task 4.2: Summary caching (2h)

### Phase 2.4 Week 3
- [ ] Task 1.4: A/B testing (4h)
- [ ] Task 4.3: Summary quality audit (2h)
- [ ] Task 3.2: Tag-based search endpoint (2h)
- [ ] Validation gates audit + verify (3h)

**Total estimated effort**: 41 hours (5 days full-time)

---

## Key Decision Points

### Multi-Vector Search Fusion
- **Option A**: RRF (Reciprocal Rank Fusion) — equal weight all vectors
- **Option B**: Weighted blend — content 0.6, signature 0.3, encoded_64 0.1
- **Option C**: Learned ranking — train lightweight XGBoost on vectors
- **Recommendation**: Start with Option B (0.6/0.3/0.1), move to Option C if NDCG@10 < 0.75

### Summarization Model
- **Option A**: gemma4-rotorquant (local, TurboQuant, ~25s per batch of 50)
- **Option B**: llama2:13b (faster, less legal domain knowledge)
- **Option C**: Custom QLoRA adapter (requires 500+ training examples first)
- **Recommendation**: Option A (gemma4 is legal-tuned + local)

### Metadata Version Scope
- **Option A**: Backfill all 52,606 points immediately (full v2)
- **Option B**: Lazy migration — new points written as v2, old points stay v1 until accessed
- **Option C**: Dual-reader — accept both v1 and v2, coerce v1 → v2 on read
- **Recommendation**: Option B (Lazy migration, less I/O pressure)

---

## Success Criteria

✅ **Phase 2 Part 4 PASS** when:
1. Multi-vector search endpoint live, A/B tested (NDCG@10 ≥ 0.75)
2. Metadata v2 on ≥85% of points
3. AI summaries on ≥80% of points
4. Tags generated on ≥75% of points
5. All 8 gates green
6. Zero Qdrant data loss / corruption
7. No new Python/Go dependencies (use existing Gemma4 service)

---

## Artifacts & Outputs

```
scripts/atlas/
├── enrich-qdrant-tags.mjs               (Tag generation)
├── enrich-chunks-with-gemma4-summary.mjs (Summarization)
├── migrate-metadata-v1-to-v2.mjs        (Metadata migration)
├── audit-phase-2-part-4.mjs             (Audit gates 6-8)
└── verify-phase-2-part-4.mjs            (Verify gates 6-8)

src/lib/server/
├── ast/signature-vector.ts              (AST → vector)
├── retrieval/multi-vector-search.ts     (Dual-vector endpoint)
├── retrieval/error-vector-rerank.ts     (Error-based reranking)
├── db/metadata-schema.ts                (JSONB Zod schema)
└── cache/summary-cache.ts               (Summary L1/L2 cache)

src/routes/api/
├── codebase/search/multi-vector/        (+server.ts)
├── codebase/search/tagged/              (+server.ts)
└── ai/gemma4-chat/                      (reuse existing)

docs/reports/
├── phase-2-part-4-audit.json
├── phase-2-part-4-verify.json
├── multi-vector-ablation.json           (A/B test results)
└── summary-quality-audit.json           (manual review scores)
```

---

## Notes

- **Redis warm path**: After apply, populate `summary:{packet_key}` cache for L1 hits
- **Postgres backfill**: Optional — store summaries in `codebase_chunks.ai_summary` column for offline analytics
- **GpJSON deferred**: Do NOT use Gemma4 output to create new fields; only populate existing `metadata.ai_summary`
- **No new dependencies**: Leverage existing Gemma4 service on port 11434 via Ollama API

