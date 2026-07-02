# Architectural Correction: Phase 102 Identity vs Statistics vs Summaries

**Date**: July 1, 2026
**Correction Applied**: Identity tables are immutable; statistics are ephemeral; summaries are explanation only
**Impact**: Reshapes entire retrieval pipeline from confusion to clarity

---

## The Error (Before Correction)

Previously, the architecture was conflating three separate concerns:

1. **Identity** (who is this code? path:symbol:kind)
2. **Statistics** (what's important about it? pagerank, hits, community, som)
3. **Explanation** (why should this rank high? summary text)

This led to:
- ❌ Redundant source_ref columns (identity should be derived, not stored)
- ❌ Treating statistics as ranking source (they're computation output)
- ❌ Using Gemma4 summaries for ranking (they're explanation only)
- ❌ Confusing Qdrant vector search with ranking (vector score is 1 of 6 signals)

---

## The Correction (After)

Three separate, immutable layers:

### Layer 1: Identity (Stable Reference)
```sql
-- Postgres codebase_chunk_index
feature_id       TEXT PRIMARY KEY  -- "src/auth.ts:validateSession:function"
source_ref       TEXT              -- "src/auth.ts" (DERIVED from feature_id)
symbol           TEXT              -- "validateSession" (DERIVED from feature_id)
kind             TEXT              -- "function" (DERIVED from feature_id)
content_embedding VECTOR(384)      -- 384-dim embedding (canonical source)

-- NEVER CHANGE, NEVER DUPLICATE feature_id components
```

**Rule**: Use helpers (getSourceRef, getSymbol, getKind) to derive components. Never store redundantly.

### Layer 2: Statistics (Ephemeral Computation)
```sql
-- Postgres feature_statistics (rebuilt on each pipeline run)
feature_id                  TEXT PRIMARY KEY
pagerank                    REAL    -- Neo4j GDS output
hits_authority              REAL    -- Neo4j HITS output
hits_hub                    REAL    -- Neo4j HITS output
community                   INTEGER -- Neo4j Louvain output
som_cluster                 INTEGER -- SOM cluster assignment
som_cell_x                  INTEGER -- SOM grid X (0-19)
som_cell_y                  INTEGER -- SOM grid Y (0-19)
cluster_degree              INTEGER -- In-degree + out-degree
in_degree                   INTEGER
out_degree                  INTEGER
betweenness                 REAL    -- Betweenness centrality
freshness_days              INTEGER -- Days since last update

-- Qdrant payloads include these as TAGS (for filtering)
-- NOT used directly in ranking (they feed RRF via Neo4j results)
```

**Rule**: These are outputs of Neo4j GDS, not identity. Rebuild them on each run. Use them for:
- Filtering candidates (Qdrant payload filter by community)
- Breaking ties in RRF (authority as one of 6 signals)
- Admin dashboards (show which features are most central)

### Layer 3: Explanation (Bounded Summary)
```
Gemma4 :8090
├─ Input: Top-3 ranked results (already ranked by RRF)
├─ Output: 2-3 sentence summary (max 150 words)
└─ Purpose: Explain to user WHY these rank high

Qdrant summary payload
├─ Stores the 2-3 sentence summary
└─ Used only for display (not ranking, not search)
```

**Rule**: Summaries come AFTER ranking, not before. They're explanation, not signal.

---

## Pipeline Architecture (Corrected)

```
User Query
  ↓
embed(query) → 768-dim vector
  ↓
Parallel Queries (No ordering enforced):
  ├─ Qdrant ANN(vector) → 20 candidates (content_embedding score)
  ├─ Postgres BM25(query) → 15 candidates (lexical score)
  ├─ Neo4j Cypher(query) → 10 candidates (pagerank score from feature_statistics)
  └─ Noun overlap(query, candidates) → Jaccard similarity
  ├─ SOM topology(embedding) → Proximity in 20×20 grid
  └─ Freshness(feature) → Days since last update
  ↓
RRF Merge (6 independent signals):
  ├─ 0.25 · semantic (Qdrant content_embedding score)
  ├─ 0.20 · summary (named vector 'summary', if present)
  ├─ 0.20 · lexical (Postgres BM25 score)
  ├─ 0.15 · noun_overlap (Jaccard on noun_terms)
  ├─ 0.12 · pagerank (from feature_statistics, via Neo4j)
  └─ 0.08 · topology (SOM grid proximity)
  ↓
Ranked Candidates (Top-K with component scores)
  ├─ final_score = weighted sum of 6 signals
  ├─ components = {semantic, summary, lexical, noun, pagerank, topology}
  └─ explanation = "Ranked highly because: noun overlap + high PageRank + semantic similarity"
  ↓
Optional: TurboVec Prefilter (768→64 latent reranking)
  ├─ NOT a search engine (uses existing rankings)
  ├─ Compresses top-K to hot memory
  └─ Optional optimization (skip if latency sensitive)
  ↓
Optional: Gemma4 Summary (Explanation layer)
  ├─ Input: Top-3 ranked results
  ├─ Output: 2-3 sentence summary per result
  └─ Purpose: Explain ranking decision to user
  ↓
Return Ranked Candidates + Explanations
```

---

## Implementation Implications

### DO NOT Store Redundantly
```typescript
// ❌ WRONG
feature_id = "src/auth.ts:validateSession:function"
source_ref = "src/auth.ts"  // Redundant! Can be derived.
symbol = "validateSession"  // Redundant! Can be derived.
kind = "function"           // Redundant! Can be derived.

// ✅ CORRECT
feature_id = "src/auth.ts:validateSession:function"
// Use helpers:
getSourceRef(feature_id)  // → "src/auth.ts"
getSymbol(feature_id)     // → "validateSession"
getKind(feature_id)       // → "function"
```

### DO Use Statistics Correctly
```typescript
// ✅ CORRECT: Statistics inform ranking via RRF
// Neo4j output → feature_statistics → RRF merge component
const authorityScore = reciprocalRank(pagerank_rank_among_candidates);
const topologyScore = reciprocalRank(som_proximity_rank);

// ❌ WRONG: Using statistics as primary keys
// NEVER: WHERE feature_id = pagerank  // NaN risk, statistic changes
```

### DO Understand Summary Role
```typescript
// ✅ CORRECT: Summary is explanation of already-ranked results
const topResults = rrfMergedResults.slice(0, 3);
const summaries = await gemma4Batch(topResults.map(r => r.content));
// Summaries explain WHY they're ranked high, after the fact

// ❌ WRONG: Using summary for ranking
// NEVER: const rankingScore = summary.length + embedding.similarity
```

### DO Use Named Vectors Correctly
```typescript
// ✅ CORRECT: Named vectors are alternate representations
Qdrant collections:
  └─ codebase_chunks_768
     ├─ vector (768-dim content_embedding, primary ANN)
     ├─ named: 'summary' (768-dim summary embedding, alternate search)
     ├─ named: 'error' (768-dim error pattern embedding)
     └─ named: 'signature' (768-dim signature/pattern embedding)

// Each named vector gets its own RRF component score
// Final = 0.25·content + 0.20·summary + ... (if summary vector exists)
```

---

## Validation: Invariants Hold If...

### Identity Immutability
- [ ] `getSourceRef(feature_id)` always returns same result
- [ ] `getSymbol(feature_id)` always returns same result
- [ ] `getKind(feature_id)` always returns same result
- [ ] feature_id never changes (it's the primary key)

### Statistics Ephemeral
- [ ] `feature_statistics` can be dropped and rebuilt
- [ ] Statistics never flow into identity join queries
- [ ] Rebuilding statistics doesn't change feature_id or ranking (only reranks by new stats)

### Summaries Explanations
- [ ] Summaries come AFTER ranking (input is ranked candidates)
- [ ] Summaries are bounded (2-3 sentences, max 150 words)
- [ ] Summary score is 0 if summary doesn't exist (RRF gracefully handles missing components)

---

## Migration Path (Phase 102 Corrected)

### Step 1: Code Features Edges (Identity Foundation)
```bash
npm run atlas:code-features:edges:backfill --apply
# Establishes IMPORTS/CALLS/DEFINES relationships
# Input: AST already extracted
# Output: 10K+ edges in Neo4j
```

### Step 2: Neo4j GDS (Statistics Computation)
```bash
npm run atlas:code-features:pagerank --apply
npm run atlas:code-features:hits --apply
npm run atlas:code-features:louvain --apply
# Computes PageRank, HITS, Louvain, SOM
# Output: feature_statistics table populated
```

### Step 3: Mirror Statistics (Qdrant Enrichment)
```bash
npm run atlas:feature-statistics:sync --apply
# Copies stats from feature_statistics to Qdrant payloads
# Enables payload filtering by community, pagerank, som_cluster
```

### Step 4: Semantic Tags (Multi-Modal Filtering)
```bash
npm run atlas:qdrant:payload-tags:sync --apply
# Adds semantic_tags (kind, language, cluster, community)
# Enables "find all functions in auth cluster"
```

### Step 5: Go Retrieval Smoke (Validation)
```bash
npm run go-retrieval:feature-search:smoke --query="authentication session"
# Tests full pipeline: query → embed → parallel queries → RRF merge → return
# Validates all 6 signals work
```

### Step 6: Batch Summaries (Explanation)
```bash
npm run batch:summaries:test10 --query="authentication session"
# Generates Gemma4 summaries for top-10 results
# Validates explanation layer
```

---

## Success Criteria (Corrected)

| Check | Before | After | Status |
|-------|--------|-------|--------|
| Identity redundancy | ❌ source_ref stored + derived | ✅ derived only via helpers | FIX |
| Statistics role | ❌ used for ranking directly | ✅ used only via RRF component | FIX |
| Summary role | ❌ fed back into search | ✅ explanation after ranking | FIX |
| Vector search | ❌ Qdrant score = final rank | ✅ Qdrant score = 1 of 6 signals | FIX |
| RRF formula | ❌ ad-hoc weights | ✅ 6 equal-weight components | FIX |

---

## Key Takeaway

**Immutability at each layer prevents accidental coupling:**

- Identity is immutable → no feature_id drift
- Statistics are ephemeral → can rebuild without affecting ranking
- Summaries are explanation → can regenerate with new LLM without affecting retrieval
- RRF is modular → swap one signal (e.g., topology) without affecting others

This architecture enables:
- ✅ Independent tuning of each layer
- ✅ Rollback of any layer without affecting others
- ✅ Explainability (component scores show why each result ranked high)
- ✅ Robustness (missing one signal doesn't break ranking)
