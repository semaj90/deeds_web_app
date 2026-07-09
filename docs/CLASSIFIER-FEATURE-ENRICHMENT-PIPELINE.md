# Classifier Feature Enrichment Pipeline

**Status**: ✅ WIRED (TypeScript types + feature extraction script + validation tests)  
**Last Updated**: July 8, 2026  
**Phase**: Classifier 11th feature (ast_domain_confidence) integration with XGBoost lane recommendation

---

## Overview

The classifier pipeline bridges XGBoost lane recommendation with semantic domain classification. The 11th feature (`ast_domain_confidence`) enriches the 10-feature vector with keyword-based domain signals, improving lane predictions especially for rare classes (som-topology, neo4j-authority).

---

## Architecture

```
User Query
  ↓
[XGBoost Classifier]
  ├─ Input: 11-feature vector (10 existing + ast_domain_confidence)
  ├─ Output: Lane recommendation (bm25-fallback, qdrant-dense, som-topology, neo4j-authority)
  └─ Advisory Only (NOT final authority)
  ↓
[HMM/Rule Validation Gate]
  ├─ Identity lane check (canonical/recoverable/quarantine)
  ├─ Prerequisite validation (embeddings, pagerank, SOM coords)
  └─ Allow/block decision
  ↓
[Hybrid Search]
  ├─ Qdrant ANN (dense vectors)
  ├─ BM25 sparse search
  └─ Neo4j bounded k-hop
  ↓
[RRF Fusion Ranking]
  └─ 0.6·dense + 0.4·sparse + 0.05·graph
  ↓
[Gemma4 Synthesis]
  └─ Explanation layer only
```

---

## Feature Vector

### FEATURE_NAMES (Canonical Order)
```typescript
[
  'pagerank',                // 0: Centrality in code graph
  'som_row',                 // 1: Self-organizing map row [0-19]
  'som_col',                 // 2: Self-organizing map col [0-19]
  'community_id',            // 3: Louvain community cluster ID
  'days_old',                // 4: Age of packet in days
  'has_content_vec',         // 5: Binary: content embedding exists
  'has_summary_vec',         // 6: Binary: summary embedding exists
  'has_keyword_vec',         // 7: Binary: keyword embedding exists
  'graph_degree',            // 8: Number of in/out edges in Neo4j
  'bm25_score',              // 9: BM25 lexical rank [0,1] normalized
  'ast_domain_confidence'    // 10: Domain classification confidence [0,1]
]
```

### Feature Encoding
```typescript
toXgboostVector(features: ClassifierFeatureVector): number[]
```

Converts TypeScript vector to XGBoost input array in canonical order. Missing values:
- `pagerank`: default 0
- `som_row/col`: default -1 (sentinel for null)
- `community_id`: default -1
- `days_old`: default 9999 (sentinel for missing)
- `graph_degree`: default 0
- `bm25_score`: default 0
- `ast_domain_confidence`: default 0

---

## Domain Classification

### KEYWORD_DOMAINS (Canonical Mapping)

| Domain | Keywords | Example Text |
|--------|----------|---------------|
| **auth** | session, login, token, password, lucia, jwt, oauth | `src/lib/server/auth.ts` |
| **ui** | button, component, render, modal, dialog, svelte | `src/lib/components/Button.svelte` |
| **retrieval** | search, query, rank, embedding, qdrant, rrf, bm25 | `src/lib/server/retrieval/unified.ts` |
| **network** | fetch, http, request, response, api, endpoint | `src/lib/server/api/routes.ts` |
| **database** | sql, postgres, drizzle, schema, migration, transaction | `src/lib/server/db/client.ts` |
| **cache** | redis, valkey, cache, ttl, bifrost | `src/lib/server/cache/redis.ts` |
| **agent** | agent, tool, dispatcher, mcp, workflow | `src/lib/server/agent/dispatcher.ts` |
| **graph** | neo4j, edge, node, pagerank, community, topology | `src/lib/server/graph/neo4j.ts` |
| **ml** | xgboost, classifier, embedding, som, kmeans, tensor | `src/lib/server/ml/classifier.ts` |
| **general** | (catch-all) | Everything else |

### Classification Algorithm
```typescript
classifyDomainFromText(text: string): {
  domain: Domain,
  confidence: number,
  counts: Record<Domain, number>
}
```

1. Normalize text to lowercase
2. Count keyword hits per domain
3. Pick domain with highest count
4. Confidence = (highest_count / total_keyword_matches)
5. Fall back to 'general' if no keywords found

---

## Extraction Pipeline

### Staged Modes

```bash
# Sample mode: Test on 100 packets (dry-run)
npm run atlas:lane-classifier:extract-keywords --sample 100 --dry-run

# Batch mode: Extract 5000 packets
npm run atlas:lane-classifier:extract-keywords:limit

# Full mode: All packets
npm run atlas:lane-classifier:extract-keywords:all --apply

# Apply mode: Write to Postgres
npm run atlas:lane-classifier:extract-keywords:apply --verbose
```

### Extraction Script
**Location**: `scripts/atlas/extract-ast-keywords.mjs`

**Input**:
- All packets from `atlas_packets` where `source_ref IS NOT NULL`
- Optional: limit by `--sample`, `--limit`, or `--all` flags

**Processing**:
1. Query packets from Postgres
2. For each packet:
   - Extract text: `source_ref + domain_class`
   - Classify domain using keyword matching
   - Compute confidence
   - Validate vector (no range violations)
3. Write to `packet_ast_keyword_features` (if not --dry-run)
4. Generate extraction report (JSONL)

**Output**:
- Table: `packet_ast_keyword_features` (54 columns)
- Report: `extraction-report-{timestamp}.json` (summary + domain distribution)

### Database Schema
**Table**: `packet_ast_keyword_features`

```sql
CREATE TABLE packet_ast_keyword_features (
  id SERIAL PRIMARY KEY,
  packet_key VARCHAR(255) NOT NULL UNIQUE,
  source_ref VARCHAR(2048),
  
  predicted_domain VARCHAR(50),
  domain_confidence REAL,
  domain_detection_method VARCHAR(50),  -- 'keyword', 'ast_grep', 'hybrid'
  
  keywords TEXT[],
  keyword_count INTEGER,
  keyword_coverage REAL,
  
  symbols TEXT[],
  imports TEXT[],
  exports TEXT[],
  functions TEXT[],
  classes TEXT[],
  interfaces TEXT[],
  
  keyword_counts JSONB,  -- { auth: N, ui: N, retrieval: N, ... }
  
  validation_errors TEXT[],
  is_valid BOOLEAN DEFAULT TRUE,
  status VARCHAR(50) DEFAULT 'pending',
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_packet_key FOREIGN KEY (packet_key) REFERENCES atlas_packets(packet_key)
);
```

---

## Validation Gates

**Function**: `validateClassifierFeatureVector(v: ClassifierFeatureVector): string[]`

Returns array of validation errors (empty = valid):

| Check | Rule | Error Message |
|-------|------|---------------|
| packet_key | Required, non-empty | `missing packet_key` |
| source_ref | Required, non-empty | `missing source_ref` |
| som_row | Nullable OR in [0,19] | `som_row {value} out of 20x20 bounds [0,19]` |
| som_col | Nullable OR in [0,19] | `som_col {value} out of 20x20 bounds [0,19]` |
| bm25_score | Nullable OR in [0,1] | `bm25_score {value} must be normalized [0,1]` |
| ast_domain_confidence | Nullable OR in [0,1] | `ast_domain_confidence {value} must be [0,1]` |
| pagerank | Nullable OR >= 0 | `pagerank {value} must be >= 0` |
| days_old | Nullable OR >= 0 | `days_old {value} must be >= 0` |

---

## Test Suite

**Location**: `tests/classifier/`

### Domain Classifier Tests
**File**: `domain-classifier.spec.ts`

- ✅ Classify auth domain from keywords
- ✅ Classify retrieval domain from keywords
- ✅ Classify database domain from keywords
- ✅ Fall back to general domain when no keywords
- ✅ Case-insensitive matching
- ✅ Return keyword counts for all domains
- ✅ Export KEYWORD_DOMAINS with all required domains

### Feature Vector Tests
**File**: `classifier-feature-vector.spec.ts`

- ✅ Encode vector with all features present
- ✅ Fill missing values with defaults
- ✅ Handle null SOM coordinates
- ✅ Maintain feature order consistency
- ✅ Produce valid XGBoost input ranges

### Feature Validator Tests
**File**: `packet-feature-validator.spec.ts`

- ✅ Pass validation for complete valid vector
- ✅ Reject missing packet_key and source_ref
- ✅ Reject SOM coordinates out of bounds
- ✅ Accept SOM coordinates at boundaries
- ✅ Reject BM25 score out of range [0,1]
- ✅ Reject ast_domain_confidence out of range
- ✅ Reject negative pagerank and days_old
- ✅ Allow null/undefined optional fields
- ✅ Report multiple errors at once

**Run tests**:
```bash
npm run atlas:lane-classifier:test
# or: npm run test tests/classifier/
```

---

## Integration Points

### 1. Go Sidecar Classification
**Endpoint**: `POST /predict-lane`

**Input**:
```json
{
  "packet_key": "ace:packet:auth:001",
  "features": [0.5, 10, 15, 5, 3.2, 1, 1, 0, 2, 0.75, 0.82],
  "include_trace": true
}
```

**Output**:
```json
{
  "lane": "qdrant-dense",
  "confidence": 0.92,
  "reason": "features indicate vector-first search",
  "execution_time_ms": 2
}
```

### 2. HMM Validation Gate
**Endpoint**: `POST /packet/validate`

Validates predicted lane against packet identity state and prerequisites:
- ✅ canonical → allow lane
- ✅ recoverable → allow with penalty
- ✅ quarantine → block (fallback to bm25)

### 3. RRF Ranking Authority
**Endpoint**: `POST /search-rerank`

Final ranking formula:
```
RRF_score = 0.6 × (1 / (60 + rank_dense))
          + 0.4 × (1 / (60 + rank_sparse))
          + 0.05 × (1 / (60 + rank_graph))
```

---

## Retrieval Contract

### Hard Rules
- ❌ **Do NOT trust 99.9% classifier accuracy**
- ❌ **Do NOT skip HMM state validation**
- ❌ **Do NOT rank candidates before RRF fusion**
- ✅ **Track NDCG@5, Recall@10 per lane** (golden replay audit)
- ✅ **Use RRF as final ranking authority**
- ✅ **Implement identity validation gates**

### Forbidden Patterns
- ❌ Trust XGBoost confidence for final ranking
- ❌ Bypass HMM state validation for "fast path"
- ❌ Use Qdrant payloads as canonical truth
- ❌ Materialize packets from Neo4j (use Postgres)
- ❌ Bypass identity validation

### Golden Replay Metrics
| Metric | Target | Frequency |
|--------|--------|-----------|
| NDCG@5 per lane | >0.80 | Hourly |
| Recall@10 per lane | >0.90 | Hourly |
| Identity validation pass rate | >99.5% | Real-time |
| HMM fallback rate | <2% | Hourly |
| RRF rerank consistency | >0.95 Spearman | Weekly |

---

## Workflow Example

```
1. User query: "validate session tokens"
   ↓
2. XGBoost classifier predicts lane:
   - Input: [0.75 pagerank, 10 som_row, 15 som_col, ...]
   - Output: lane=qdrant-dense, confidence=0.92
   ↓
3. HMM validation gate:
   - Check packet identity: canonical ✓
   - Check prerequisites: has_embeddings ✓
   - Result: lane allowed
   ↓
4. Hybrid parallel search:
   - Qdrant ANN: 50 candidates
   - BM25 sparse: 50 candidates
   - Neo4j k-hop: 20 candidates
   ↓
5. RRF fusion ranking:
   - Blend dense/sparse/graph scores
   - Top 5 candidates ranked
   ↓
6. Gemma4 synthesis:
   - Read top 3 spans
   - Generate answer + provenance
```

---

## Quick Reference

### Commands
```bash
# Sample extraction (100 packets, dry-run)
npm run atlas:lane-classifier:extract-keywords

# Batch extraction (5000 packets, dry-run)
npm run atlas:lane-classifier:extract-keywords:limit

# Full extraction (all packets, dry-run)
npm run atlas:lane-classifier:extract-keywords:all

# Apply extraction (write to Postgres)
npm run atlas:lane-classifier:extract-keywords:apply

# Run tests
npm run atlas:lane-classifier:test

# Smoke test (XGBoost accuracy + fallback rules)
npm run atlas:lane-classifier:smoke
```

### Files
| File | Purpose |
|------|---------|
| `src/lib/server/classifier/ast-keyword-types.ts` | Type definitions (Domain, AstFeatureSignals, ClassifierFeatureVector) |
| `src/lib/server/classifier/domain-classifier.ts` | Keyword-based domain classification |
| `src/lib/server/classifier/classifier-feature-vector.ts` | Feature vector encoding (toXgboostVector) |
| `src/lib/server/classifier/packet-feature-validator.ts` | Validation gates |
| `scripts/atlas/extract-ast-keywords.mjs` | Feature extraction script (staged modes) |
| `tests/classifier/*.spec.ts` | Test suite (domain, vector, validator) |
| `docs/contracts/retrieval-contract.md` | Retrieval architecture contract |

---

## Status

- ✅ TypeScript types (ast-keyword-types.ts)
- ✅ Domain classifier (domain-classifier.ts)
- ✅ Feature vector encoder (classifier-feature-vector.ts)
- ✅ Feature validator (packet-feature-validator.ts)
- ✅ Extraction script (extract-ast-keywords.mjs) with staged modes
- ✅ Test suite (3 spec files, 30+ tests)
- ✅ npm scripts (5 commands)
- ⏳ Execution: awaiting `npm run atlas:lane-classifier:extract-keywords --sample 100 --apply`

---

## Next Steps

1. **Test extraction** (sample 100): `npm run atlas:lane-classifier:extract-keywords --sample 100 --apply`
2. **Verify Postgres write**: Check `packet_ast_keyword_features` table rowcount
3. **Rerun XGBoost classifier**: `npm run atlas:lane-classifier:train` (use enriched 11-feature vector)
4. **Validate golden replay**: Compare NDCG@5/Recall@10 per lane before/after enrichment
5. **Monitor production**: Track HMM fallback rate and identity validation rate
