# Semantic Vector Reranker — Multi-Vector Composite Ranking

**Status**: ✅ WIRED | Implementation complete, integrated into orchestrator Stage 3.7

**Purpose**: Apply multi-dimensional scoring to Qdrant top-K results before ACE context packing.

## Architecture

### Input
- Qdrant ANN results (40.5K codebase_chunks_768, 768-dim vectors)
- Packet metadata from Postgres atlas_packets table

### Scoring Lanes (all normalized 0-1)

| Lane | Weight | Data Source | Coverage | Fall back |
|------|--------|-------------|----------|-----------|
| **Vector Similarity** | 0.40 | Qdrant cosine distance | 100% | N/A |
| **SOM Authority** | 0.25 | Postgres + Redis som:cluster:authority | 7.17% | neutral 0.5 |
| **Domain Match** | 0.20 | Postgres domain_class | 100% | 0.8 |
| **Recency** | 0.10 | Postgres updated_at | 100% | 0.5 |
| **Tree Depth** | 0.05 | Postgres tree_node_id | 100% | 0.5 |

**Composite Score Formula**:
```
score = 0.40·vector + 0.25·som + 0.20·domain + 0.10·recency + 0.05·depth
```

### Output
Ranked candidates with:
- `compositeScore` (0-1)
- Individual lane scores
- Diagnostics (SOM cluster, domain class, tree depth)
- Full packet metadata for context packing

## Data Coverage (Today)

| Field | Coverage | Impact |
|-------|----------|--------|
| source_ref | 100% ✅ | Identity anchor |
| feature_id | 100% ✅ | Feature grouping |
| tree_node_id | 100% ✅ | Structural authority |
| domain_class | 100% ✅ | Domain filtering |
| updated_at | 100% ✅ | Recency scoring |
| embedding | 0.017% ⚠️ | Pre-indexed by Qdrant (vector is already embedded) |
| som_cluster | 7.17% ⏳ | Needs SOM expansion (Phase 4A) |

**Note**: `embedding` coverage is low because Qdrant payload doesn't include the full vector; only packet_key + metadata. The 40.5K points in Qdrant already have the 768-dim embeddings indexed.

## Integration Points

### 1. Orchestrator (Stage 3.7)
File: `src/lib/server/retrieval/orchestrator.ts`

Runs after TurboVec rerank (Stage 3.5), before Corrective RAG (Stage 4).

```typescript
// Input: chunks from Qdrant + TurboVec
const rerankCandidates = await semanticRerank(qdrantForSemantic, {
  topK: 50,
  verbose: false
});

// Output: ranked candidates with composite scores
chunks = rerankCandidates.map(c => ({
  ...original,
  similarity: c.compositeScore
}));
```

### 2. API Endpoint
File: `src/routes/api/retrieval/semantic-rerank/+server.ts`

**GET** `/api/retrieval/semantic-rerank?q=<query>&topK=50&verbose=true`
- Full pipeline: Ollama embed → Qdrant ANN → Semantic rerank
- Returns: top-10 candidates with composite scores + diagnostics

**POST** `/api/retrieval/semantic-rerank`
- Manual input: pass qdrantResults array
- Returns: reranked candidates with latency + metadata

### 3. Health Check
Validates operational status of all components:
- Postgres: can read atlas_packets
- Redis: can fetch som:cluster:authority cache
- Qdrant: codebase_chunks_768 collection exists

```typescript
import { healthCheckReranker } from '$lib/server/retrieval/semantic-vector-reranker';
const health = await healthCheckReranker();
// Returns: {operational, components, diagnostics}
```

## Next Phases

### Phase 4A: SOM Expansion (7.17% → 100% coverage)
- Cluster all 58K packets via cuVS k-means on WSL2 GPU
- Write som_cluster to Postgres + Redis cache
- Update som:cluster:authority weights via PageRank

### Phase 4B: Autoencoder Training
- Train 768→64 latent compression on query + candidate pairs
- Use contrastive loss (not MSE) to optimize for ranking, not reconstruction
- Deploy to Valkey + Qdrant named vector

### Phase 5: XGBoost Ranking Model
- Unified ranking model on (vector + SOM + domain + recency + depth) features
- Train on human relevance feedback + test retrieval metrics
- Replace fixed blend weights with learned weights

## Testing

### Smoke Test
```bash
npm test tests/semantic-vector-reranker.spec.ts
```

### Manual API Test
```bash
# Simple query
curl "http://localhost:5173/api/retrieval/semantic-rerank?q=authentication&topK=10&verbose=true"

# POST with mock results
curl -X POST "http://localhost:5173/api/retrieval/semantic-rerank" \
  -H "Content-Type: application/json" \
  -d '{
    "qdrantResults": [
      {"id": "1", "score": 0.8, "payload": {"packet_key": "auth:001"}}
    ]
  }'
```

### Production Monitoring
- Semantic rerank latency: target <500ms for top-50
- SOM cache hit rate: target >80% (once backfilled to 100%)
- Composite score distribution: should be bimodal (relevant vs irrelevant)

## Configuration

**Blend weights** (in code):
```typescript
const DEFAULT_BLEND = {
  vector: 0.40,       // Semantic similarity
  som_authority: 0.25, // Graph clustering authority
  domain_match: 0.20, // Feature domain alignment
  recency: 0.10,      // Code age decay
  tree_depth: 0.05,   // Structural depth
};
```

**Fallback scores** (when data is missing):
- SOM authority: 0.5 (neutral, no cluster info)
- Domain match: 0.8 (assume reasonable relevance)
- Recency: 0.5 (unknown age = neutral)
- Tree depth: 0.5 (unknown depth = neutral)

## Performance Targets

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Latency (50 candidates) | <500ms | TBD | ⏳ |
| SOM cache hit rate | >80% | N/A | ⏳ (Phase 4A) |
| Composite score spread | 0.3+ (top vs median) | TBD | ⏳ |
| Postgres read latency | <50ms | TBD | ⏳ |
| Redis lookup latency | <5ms | TBD | ⏳ |

## References

- Orchestrator integration: `src/lib/server/retrieval/orchestrator.ts:495`
- Module: `src/lib/server/retrieval/semantic-vector-reranker.ts`
- API: `src/routes/api/retrieval/semantic-rerank/+server.ts`
- Tests: `tests/semantic-vector-reranker.spec.ts`
- Karpathy blend reference: `memory/parent-atlas-frozen-identity-contract.md`
