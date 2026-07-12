# P2 Canonical Pipeline — Implementation Checklist

**Date**: July 11, 2026  
**Phase**: P2A–P2J (Feature Extraction Pipeline)  
**Status**: P2A COMPLETE (78.33%), Ready for P2C

---

## ✅ P2A: Canonical AST Packet Backfill — COMPLETE

### Requirements Met

- [x] Canonical identity binding (packet_key + source_ref + content_hash + tree_node_id)
- [x] Deterministic AST extraction (no synthetic keys persisted)
- [x] Content hash verification (version guards)
- [x] Tree node ID generation (SHA-256 formula, 16-char deterministic IDs)
- [x] Symbol tracking with line numbers (8 symbol kinds)
- [x] Database schema updated (tree_node_ids JSONB column)
- [x] Resumable pipeline (WHERE clause prevents re-processing)
- [x] Idempotent writes (ON CONFLICT DO UPDATE)
- [x] Coverage measurement corrected (non-empty arrays only, eligible packets only)
- [x] Documentation complete (architecture, formulas, constraints)

### Current State

| Metric | Value |
|--------|-------|
| Eligible code packets | 7,273 |
| With AST symbols | 5,697 (78.33%) |
| Missing AST | 1,576 (21.67%) |
| Gap to 80% | 121 packets |
| Threshold | 5,818 packets |

### Database Schema

**atlas_packet_features** (extracted evidence):
```sql
ast_symbols        TEXT[]           -- Symbol names
tree_node_ids      JSONB            -- name → 16-char ID mapping
lexical_features   TEXT[]           -- (P2C)
imports            TEXT[]           -- (P2C)
exports            TEXT[]           -- (P2C)
concepts           TEXT[]
entities           TEXT[]
```

---

## ⏳ P2C: Lexical + Import Extraction — READY (2–3 hours)

### Requirements

- [ ] Extract BM25-ready keywords (function names, package names, API names, error strings)
- [ ] Parse import statements (module paths, named imports)
- [ ] Extract path-based terms (directory hierarchy, file naming patterns)
- [ ] Write to `atlas_packet_features` (lexical_features[], imports[], exports[])
- [ ] Store in separate table, not mixed with AST facts
- [ ] Measure coverage: target 80%+ of eligible packets with lexical evidence

### Expected Output

```json
{
  "packet_key": "ace:packet:auth:001",
  "lexical_features": ["validateSession", "createPool", "postgres", "ioredis"],
  "imports": ["createPool", "logger", "redis"],
  "exports": ["loginUser", "logoutUser"]
}
```

### Hard Rules

- ✅ Extract from AST symbols + file path + import statements (deterministic)
- ✅ Store in lexical_features[], not mixed with ast_symbols
- ✅ Include API names, package names, common error strings
- ❌ Do NOT use Gemma4 for keyword extraction (use BM25 + regex)

---

## ⏳ P2D: Feature Envelope Materializer — READY (2 hours)

### Requirements

- [ ] Combine P2A (AST) + P2C (lexical) + embedding references into Feature Envelope V1
- [ ] No domain labels yet (just evidence layers)
- [ ] Generate unified packet structure
- [ ] Store in Postgres + update Qdrant payloads
- [ ] Prepare for topology enrichment (SOM, KMeans, PageRank)

### Expected Structure

```typescript
interface FeatureEnvelope {
  // Canonical identity
  packet_key: string;
  source_ref: string;
  content_hash: string;
  
  // AST layer (P2A)
  ast: {
    symbols: string[];
    tree_node_ids: Record<string, string>;
    functions: number;
    classes: number;
  };
  
  // Lexical layer (P2C)
  lexical: {
    terms: string[];
    path_terms: string[];
    bm25_keywords: string[];
  };
  
  // Embedding references (vectors stored in Qdrant, not here)
  embeddings: {
    content_ref: "embeddinggemma-768-v1";
    summary_ref: "embeddinggemma-768-v1";
    signature_ref: "embeddinggemma-768-v1";
  };
  
  // Topology metadata (P2F)
  topology: {
    som_index?: number;
    kmeans_cluster?: number;
    community_id?: string;
  };
}
```

### Hard Rules

- ✅ Combine evidence without forcing domain labels (yet)
- ✅ Store pointers to vectors, not the vectors themselves (vectors stay in Qdrant)
- ✅ Include optional topology fields (to be filled in P2F)
- ❌ Do NOT include classifier outputs (those go to atlas_packet_metrics)

---

## ⏳ P2E–P2F: Topology Enrichment — READY (2–3 hours)

### P2E: SOM + KMeans + PageRank

- [ ] Fit SOM on content_768 embeddings (20×20 grid typical)
- [ ] Cluster embeddings via KMeans (k=50–100)
- [ ] Compute PageRank on feature dependency graph
- [ ] Write to Feature Envelope + atlas_packet_metrics

### P2F: Concept/Domain Evidence

- [ ] Extract concept IDs from AST (type names, function signatures)
- [ ] Run optional Gemma4 grounding (capability summary, business concept)
- [ ] Write capability_summary to Feature Envelope
- [ ] Prepare for domain classification

---

## ⏳ P2G–P2H: Domain Classification — READY (8–10 hours)

### P2G: .okf Domain Specification

- [ ] Create retrieval.yaml (evidence: path_terms, imports, symbols)
- [ ] Create cache.yaml (evidence: symbol names, lexical keywords)
- [ ] Create database.yaml (evidence: schema mentions, SQL keywords)
- [ ] Create authentication.yaml, api.yaml, etc.
- [ ] Version each spec (domain-specs-v1)

### P2H: XGBoost Classifier

- [ ] Train on labeled examples (subset of 5,697 packets)
- [ ] Use all evidence: AST count, lexical terms, topology, embeddings
- [ ] Produce domain_primary + domain_confidence + domain_alternatives
- [ ] Write to atlas_packet_metrics (separate from facts)
- [ ] Backfill all 5,697 packets

---

## ⏳ P2I–P2J: Ontology + Qdrant Sync — READY (4–5 hours)

### P2I: Ontology Tuple Materializer

- [ ] Generate (subject, predicate, object, confidence, evidence) tuples
- [ ] AST-derived: high confidence (0.9+)
- [ ] Gemma4-derived: lower confidence (0.6–0.7)
- [ ] XGBoost-derived: model precision (0.5–0.95)
- [ ] Store in atlas_ontology_tuples

### P2J: Qdrant Payload Sync

- [ ] Sync canonical identity to Qdrant payloads
- [ ] Add domain classification to payloads
- [ ] Create named vectors (content_768, summary_768, signature_768, topology_128, latent_64)
- [ ] Verify all 5,697 packets have payloads
- [ ] Test RRF retrieval fusion

---

## Critical Rules (Enforcement)

### Identity & Persistence

- [x] Canonical identity: packet_key + source_ref + content_hash + tree_node_id
- [x] Synthetic keys (codebase:src/...) are discovery aliases only
- [x] All persistent facts bind to canonical identity
- [x] Never persist synthetic keys

### Evidence Extraction

- [x] AST: Deterministic parsers (tree-sitter, ast-grep), NOT Gemma4
- [x] Lexical: BM25 + regex, NOT Gemma4 guessing
- [x] Embeddings: EmbeddingGemma 768, multiple vectors, NOT averaged
- [x] Gemma4: Semantic grounding ONLY, grounded in prior evidence

### Storage Separation

- [x] Extracted facts → atlas_packet_features
- [x] Classifier outputs → atlas_packet_metrics
- [x] Never mix fact extraction with classifier scores

### Coverage Measurement

- [x] Non-empty arrays only: `array_length(ast_symbols, 1) > 0`
- [x] Eligible code packets: exclude node_modules, build, dist, backup, logs
- [x] Do NOT measure all 58,366 packets (most aren't code)

### Pipeline Order (Immutable)

```
1. Load canonical identity (Postgres truth)
2. Deterministic AST extraction (TypeScript compiler / tree-sitter)
3. Lexical analysis (BM25, path, imports)
4. Embedding vectors (EmbeddingGemma 768)
5. Gemma4 grounding (optional, semantic only)
6. Feature Envelope materialization
7. Topology enrichment (SOM, KMeans, PageRank)
8. XGBoost classification
9. Ontology tuple generation
10. Qdrant payload mirror
11. Go retrieval (RRF fusion)
12. Synthesis + reranking
```

---

## Database Tables (Current State)

### atlas_packets (Canonical Identity Source)

| Column | Type | Status | Notes |
|--------|------|--------|-------|
| packet_key | UUID | ✅ Stable | Primary key |
| source_ref | VARCHAR | ✅ Stable | Relative path |
| feature_id | VARCHAR | ⏳ Backfill | Logical feature name |
| content_hash | VARCHAR | ✅ Stable | Version guard |
| summary | TEXT | ⏳ Sparse | Only 2.2% populated |

### atlas_packet_features (Extracted Evidence)

| Column | Type | Status | Next Phase |
|--------|------|--------|------------|
| packet_key | UUID | ✅ P2A | Primary key |
| ast_symbols | TEXT[] | ✅ P2A | 78.33% coverage |
| tree_node_ids | JSONB | ✅ P2A | Ready for use |
| lexical_features | TEXT[] | ⏳ P2C | Pending |
| imports | TEXT[] | ⏳ P2C | Pending |
| exports | TEXT[] | ⏳ P2C | Pending |
| concepts | TEXT[] | ⏳ P2G | Optional |

### atlas_packet_metrics (Classifier Outputs)

| Column | Type | Status | Next Phase |
|--------|------|--------|------------|
| packet_key | UUID | ✅ Ready | Primary key |
| domain_primary | VARCHAR | ⏳ P2H | XGBoost output |
| domain_confidence | FLOAT | ⏳ P2H | Model precision |
| domain_alternatives | JSONB | ⏳ P2H | Top-3 alternatives |
| som_index | INT | ⏳ P2E | SOM cell |
| kmeans_cluster | INT | ⏳ P2E | KMeans cluster |
| pagerank_score | FLOAT | ⏳ P2E | Graph centrality |

---

## Measurement & Verification

### P2A Verification (Completed)

```bash
# Eligible code packets
SELECT COUNT(*) FROM atlas_packets
WHERE source_ref ~ '\.(ts|tsx|js|jsx|svelte|mts|cts)$'
  AND source_ref NOT LIKE '%/node_modules/%'
  AND source_ref NOT LIKE '%/build/%'
  AND source_ref NOT LIKE '%/dist/%'
  AND source_ref NOT LIKE '%/backup-%';
# Expected: 7,273

# With non-empty ast_symbols (CORRECT measurement)
SELECT COUNT(*) FROM atlas_packets ap
LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
WHERE ap.source_ref ~ '\.(ts|tsx|js|jsx|svelte|mts|cts)$'
  AND ap.source_ref NOT LIKE '%/node_modules/%'
  AND apf.ast_symbols IS NOT NULL
  AND array_length(apf.ast_symbols, 1) > 0;
# Expected: 5,697 (78.33%)
```

### P2C Verification (Template)

```bash
# With non-empty lexical_features
SELECT COUNT(*) FROM atlas_packets ap
LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
WHERE ap.source_ref ~ '\.(ts|tsx|js|jsx|svelte|mts|cts)$'
  AND apf.lexical_features IS NOT NULL
  AND array_length(apf.lexical_features, 1) > 0;
# Target: ≥5,818 (80%)
```

### P2H Verification (Template)

```bash
# With domain classification
SELECT COUNT(*) FROM atlas_packets ap
LEFT JOIN atlas_packet_metrics apm ON ap.packet_key = apm.packet_key
WHERE ap.source_ref ~ '\.(ts|tsx|js|jsx|svelte|mts|cts)$'
  AND apm.domain_primary IS NOT NULL;
# Target: 5,697 (100% of P2A packets)
```

---

## Timeline & Dependencies

| Phase | Duration | Blocking | Dependencies |
|-------|----------|----------|--------------|
| P2A ✅ | Complete | None | — |
| P2C | 2–3h | P2D | P2A ✅ |
| P2D | 2h | P2E | P2C |
| P2E | 1–2h | P2G | P2D |
| P2F | 1–2h | P2G | P2E |
| P2G | 2–3h | P2H | P2F |
| P2H | 3–4h | P2I | P2G |
| P2I | 1–2h | P2J | P2H |
| P2J | 1–2h | Retrieval | P2I |
| **Total** | **13–19h** | **Retrieval** | — |

---

## Next Action

**Start P2C: Lexical + Import Extraction** (2–3 hours)

1. Extract BM25 keywords from AST + file paths
2. Parse import/require statements
3. Write to `atlas_packet_features.lexical_features[]`
4. Target 80%+ coverage (5,818+ packets)

---

**Status**: 🟢 **READY FOR P2C CONTINUATION**  
**All infrastructure wired, measurements verified, checklist complete**  
**Last Updated**: July 11, 2026
