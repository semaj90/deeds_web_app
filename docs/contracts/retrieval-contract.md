# Retrieval Contract: XGBoost as Advisory, RRF as Authority

**Last Updated: July 9, 2026**

## The Contract

```
XGBoost = recommends lanes (advisory)
Rules/HMM = allow/block lanes (validation gate)
Evidence sources = produce candidates (parallel)
RRF = ranks candidates (FINAL AUTHORITY)
Gemma4 = explains ranked evidence (synthesis only)
```

### Hard Rule

**Do not trust 99.9% classifier accuracy.**
Trust golden replay + RRF NDCG/Recall + identity validation.

---

## Minimal Retrieval Flow

```
user query
  ↓
[Stage 1] rg lexical search → top 200 candidates
  ↓
[Stage 2] ast-grep structural signals → top 100 candidates
  ↓
[Stage 3] XGBoost lane recommendation (ADVISORY ONLY)
  ↓
[Stage 4] HMM/rule gate → allow/block by state validation
  ↓
[Stage 5] Hybrid parallel search
  ├─ Qdrant dense ANN (768-dim, top 50)
  ├─ BM25 sparse search (top 50)
  └─ Neo4j bounded k-hop (top 20 neighbors)
  ↓
[Stage 6] RRF fusion → ranks candidates (0.6·dense + 0.4·sparse, +0.05·graph)
  ↓
[Stage 7] Read top 5 spans from ranked packets
  ↓
[Stage 8] Gemma4 answer synthesis from top 3–5 packets
  ↓
answer + provenance trace
```

---

## Endpoint Contract: 5 Dedicated Routes

### 1. POST /predict-lane
**Purpose:** XGBoost lane recommendation (ADVISORY)

**Request:**
```json
{
  "packet_key": "ace:packet:auth:001",
  "features": [0.5, 10, 15, 5, 3.2, 1, 1, 0, 2, 0.75, 0.82],
  "include_trace": true
}
```

**Response:**
```json
{
  "lane": "qdrant-dense",
  "confidence": 0.92,
  "reason": "features indicate vector-first search",
  "execution_time_ms": 2
}
```

**Rules:**
- ✅ Confidence < 0.70 → fallback to bm25-fallback
- ✅ Rare class (som-topology) requires confidence 0.85+
- ✅ Ultra-rare (neo4j-authority) requires confidence 0.95+
- ❌ Do NOT use lane directly for routing; pass to HMM validation

---

### 2. POST /search-hybrid
**Purpose:** Execute hybrid search with lane + candidates

**Request:**
```json
{
  "query_text": "validate session tokens",
  "lane": "qdrant-dense",
  "top_k": 50,
  "include_trace": true
}
```

**Response:**
```json
{
  "candidates": [
    {
      "packet_key": "ace:packet:042",
      "source_ref": "src/lib/server/auth.ts",
      "score": 0.95,
      "source": "qdrant"
    },
    {
      "packet_key": "ace:packet:101",
      "source_ref": "src/lib/server/session.ts",
      "score": 0.87,
      "source": "qdrant"
    }
  ],
  "latency_ms": {
    "qdrant": 45,
    "bm25": 25,
    "neo4j": 12
  }
}
```

**Execution:**
- Parallel: Qdrant ANN + BM25 + Neo4j (not sequential)
- Returns ALL candidates with source attribution
- No ranking yet (RRF happens in stage 3)

---

### 3. POST /search-rerank
**Purpose:** RRF fusion ranking (PRODUCTION AUTHORITY)

**Request:**
```json
{
  "candidates": [
    {"id": "ace:packet:042", "rank_dense": 1, "rank_sparse": 1, "rank_graph": 5},
    {"id": "ace:packet:101", "rank_dense": 2, "rank_sparse": 12, "rank_graph": null},
    {"id": "ace:packet:156", "rank_dense": 3, "rank_sparse": 2, "rank_graph": 8}
  ],
  "weights": {
    "dense": 0.60,
    "sparse": 0.40,
    "graph": 0.05
  }
}
```

**Response:**
```json
{
  "ranked": [
    {"id": "ace:packet:042", "rrf_score": 0.0164, "rank": 1},
    {"id": "ace:packet:156", "rrf_score": 0.0098, "rank": 2},
    {"id": "ace:packet:101", "rrf_score": 0.0062, "rank": 3}
  ],
  "top_k": 5
}
```

**Formula:**
```
RRF_score = 0.6 × (1 / (60 + rank_dense))
          + 0.4 × (1 / (60 + rank_sparse))
          + 0.05 × (1 / (60 + rank_graph))  [if available]
```

**Hard Rule:**
- ✅ RRF is the FINAL ranking authority
- ❌ Do NOT modify candidate order after RRF without documented reason
- ✅ Track NDCG@5, Recall@10 per lane for golden replay audit

---

### 4. POST /packet/materialize
**Purpose:** Build ACE packet envelope from top-5 ranked results

**Request:**
```json
{
  "packet_keys": ["ace:packet:042", "ace:packet:156", "ace:packet:101"],
  "include_embeddings": false,
  "include_topology": true
}
```

**Response:**
```json
{
  "packets": [
    {
      "packet_key": "ace:packet:042",
      "source_ref": "src/lib/server/auth.ts",
      "summary": "Handles Lucia session validation.",
      "embedding": null,
      "topology": {"community_id": 5, "pagerank": 0.555},
      "identity_lane": "canonical",
      "confidence": 1.0
    }
  ]
}
```

**Contract:**
- ✅ Materialize from Postgres (canonical truth)
- ✅ Validate identity_lane (canonical/recoverable/quarantine)
- ✓ Include Neo4j topology if requested
- ❌ Do NOT reconstruct from Qdrant payloads alone

---

### 5. POST /packet/validate
**Purpose:** HMM state validation gate (allow/block lanes)

**Request:**
```json
{
  "packet_key": "ace:packet:042",
  "predicted_lane": "qdrant-dense",
  "check_identity": true,
  "check_prerequisites": true
}
```

**Response:**
```json
{
  "valid": true,
  "lane": "qdrant-dense",
  "identity_state": "canonical",
  "identity_confidence": 1.0,
  "prerequisite_checks": {
    "has_embeddings": true,
    "has_pagerank": true,
    "has_som_coords": false
  },
  "reason": "packet canonical, lane validated"
}
```

**Validation Gates:**
- ✅ Identity: canonical → allow lane
- ✅ Identity: recoverable → allow with confidence penalty
- ✅ Identity: quarantine → block lane (fallback to bm25)
- ✅ Prerequisites: qdrant-dense requires embeddings
- ✅ Prerequisites: neo4j-authority requires pagerank
- ✅ Prerequisites: som-topology requires SOM coordinates

---

## Smoke Tests

```bash
# 1. XGBoost lane recommendation (advisory only)
npm run atlas:lane-classifier:smoke

# 2. Hybrid search execution (parallel Qdrant + BM25 + Neo4j)
npm run atlas:retrieval:hybrid:smoke

# 3. RRF blend tuning (verify weights 0.6/0.4/0.05)
npm run atlas:rrf:blend:dry

# 4. Multi-vector validation (verify all sources agree on top-K)
npm run atlas:retrieval:validate:multi-vector
```

---

## Golden Replay Audit

Track per-lane metrics for production confidence:

| Metric | Target | Frequency |
|--------|--------|-----------|
| NDCG@5 per lane | >0.80 | Hourly |
| Recall@10 per lane | >0.90 | Hourly |
| Identity validation pass rate | >99.5% | Real-time |
| HMM fallback rate | <2% | Hourly |
| RRF rerank consistency | >0.95 Spearman vs manual | Weekly |

---

## Forbidden Patterns

- ❌ Trust XGBoost 99.9% accuracy for final ranking
- ❌ Skip HMM state validation before lane execution
- ❌ Use Qdrant payloads as canonical truth (mirrors only)
- ❌ Rank candidates before RRF fusion
- ❌ Materialize packets from Neo4j (read from Postgres first)
- ❌ Bypass identity validation for "fast path" queries

---

## Files

- **Go sidecar**: `go-retrieval-classifier/cmd/classifier-sidecar/main.go` (implements all 5 endpoints)
- **Fallback rules**: `go-retrieval-classifier/internal/classifier/fallback_rules.go`
- **TypeScript types**: `src/lib/server/classifier/*` (feature vectors, domain classification, validation)
- **Contracts**: This file + `.okf.json` for feature vector schema
- **Tests**: `tests/classifier/`, `tests/retrieval/` (smoke tests for each stage)
