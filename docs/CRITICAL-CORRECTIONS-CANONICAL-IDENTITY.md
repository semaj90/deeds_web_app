# Critical Corrections: Canonical Identity, AST Measurement, and Classifier Path

**Date**: July 11, 2026  
**Context**: Session 136+ continuation — foundational corrections to P2A/P2B/P2C approach

---

## 1. AST Coverage Measurement — CORRECTED

### The Error

```sql
-- WRONG: Counts NULL vs non-NULL, but empty arrays are non-NULL
COUNT(CASE WHEN ast_symbols IS NOT NULL THEN 1 END)
```

This reported "100% AST in atlas_packet_features" because:
- Empty PostgreSQL arrays `{}` are **non-NULL**
- The query cannot distinguish between empty and populated arrays
- Results conflated feature table rows with actual extracted symbols

### The Fix

```sql
-- CORRECT: Count only arrays with actual elements
COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END)
```

### Accurate Coverage (Verified July 11, 2026)

**Global coverage** (all 58,366 packets):
- Packets with non-empty ast_symbols: **6,456** (11.06%)
- Expected — most non-code packets (summaries, docs, logs, protocols) have no AST

**Eligible code packets only** (7,273):
- With non-empty ast_symbols: **5,697** (78.33%)
- Missing: 1,576 (21.67%) — mostly generated files, stubs, test doubles
- Gap to 80% threshold: 121 packets

**Interpretation**:
- ✅ Coverage is expected at 11.06% global (not 100%)
- ✅ Coverage at 78.33% for eligible code is strong baseline
- ✅ Measure AST only against AST-eligible source packets, not all feature rows
- ✅ Do NOT force AST extraction on non-code packets

---

## 2. Gemma4 Role — CORRECTED

### The Error

Treating Gemma4 as a replacement for deterministic AST extraction.

**Wrong** → Use Gemma4 to find function names, class names, exact types
**Correct** → Use deterministic parsers for structure; use Gemma4 for semantics

### The Fix

**Use deterministic extraction for facts that have a single correct answer:**
- Function names (TypeScript compiler API, tree-sitter, ast-grep)
- Class names and interfaces
- Import statements and their paths
- Type declarations
- Line ranges and column positions
- Call relationships and dependencies

**Use Gemma4 for semantic insight that requires reasoning:**
- What capability does this function implement?
- What failure mode or edge case does this handle?
- What legal or business concept does this module represent?
- What tool or consumer would use this module?
- Concise functional summary (1-2 sentences)
- Domain classification (retrieval, cache, database, etc.)

### The Pipeline (Correct Order)

```
Indexed File
  ↓
[Deterministic Parser: TypeScript compiler API / tree-sitter / ast-grep]
  ↓
Deterministic AST Facts
  ├─ functions: exact names, signatures, line ranges
  ├─ classes: exact hierarchy, fields, methods
  ├─ imports: exact module paths, named imports
  ├─ types: exact definitions, generics
  └─ relationships: exact call chains, inheritance
  ↓
[Lexical Analysis: BM25, path terms, regex]
  ↓
Lexical Evidence
  ├─ keywords (function names, package names, error strings, API names)
  ├─ path terms (directory hierarchy, file naming patterns)
  ├─ imports/exports (module boundaries)
  └─ call sites (usage patterns)
  ↓
[EmbeddingGemma 768: Semantic vectors]
  ↓
Multi-Vector Embeddings
  ├─ content_768 (implementation details)
  ├─ summary_768 (intent and capability)
  ├─ signature_768 (API/tool matching)
  └─ lexical BM25 (exact vocabulary)
  ↓
[Gemma4: Grounded Semantic Summary (Deterministic facts only)]
  ↓
Semantic Capability Summary
  ├─ capability: "Retrieves packets matching semantic query via Qdrant"
  ├─ failure_modes: ["out of memory on large result sets", "network timeout"]
  ├─ business_concept: "Legal document retrieval"
  ├─ consumers: ["CLI", "HTTP API", "WebUI", "Test suite"]
  └─ confidence: 0.85 (lower than AST, pending validation)
  ↓
[Feature Envelope V1: Unified packet]
  ↓
[XGBoost Classifier: Uses ALL evidence, not just one vector]
  ↓
Domain Classification + Confidence
  ├─ primary: "retrieval"
  ├─ confidence: 0.93
  └─ alternatives: [{"domain": "database", "confidence": 0.31}]
  ↓
[Ontology Tuple Materializer: Grounded relationships]
  ↓
Canonical Ontology Tuples
  └─ subject_id → predicate → object_id (with source evidence)
```

**Critical Rule**: Every Gemma4 result must retain the AST/lexical/embedding evidence that grounded it.

---

## 3. Vector Space Architecture — CORRECTED

### The Error

Assuming a single embedding space (768-dim or otherwise) suffices for all retrieval tasks.

**Wrong** → One universal embedding for content, summary, API matching, topology
**Correct** → Multiple named vectors, each tied to canonical identity, searched independently

### The Fix

**Multi-Vector Qdrant Design** (all vectors tied to canonical `packet_key`):

| Vector Name | Dimension | Purpose | Source |
|-------------|-----------|---------|--------|
| `content_768` | 768 | Implementation detail retrieval | EmbeddingGemma on raw code |
| `summary_768` | 768 | Intent and capability retrieval | EmbeddingGemma on Gemma4 summary |
| `signature_768` | 768 | Function/API/tool matching | EmbeddingGemma on type signature + docstring |
| `topology_128` | 128 | Structurally related modules | SOM/KNN projection of content_768 |
| `latent_routing_64` | 64 | Routing, SOM cell, cache grouping | Autoencoder z-space or learned projection |

**Search Strategy** (NOT averaging vectors):

```
Query "cache invalidation"
  ↓ Embed to 768-dim
  ↓ Search each named vector independently
  ├─ content_768 ANN: top 10 candidates
  ├─ summary_768 ANN: top 10 candidates
  ├─ signature_768 ANN: top 10 candidates (functions named "*cache*")
  ├─ topology_128 ANN: top 10 candidates (neighbors in SOM)
  └─ BM25 "cache" OR "invalidation": top 10 candidates
  ↓
  RRF (Reciprocal Rank Fusion)
  ├─ Normalize each ranking to [0, 1]
  ├─ Weight by lane importance: 0.3·content + 0.25·summary + 0.2·signature + 0.15·topology + 0.1·bm25
  ├─ Rerank fused results
  └─ Optional: classifier/reranker features on top-20
```

**Why not average?**
- Averaging loses lane signal (a high-ranked result in one lane gets buried)
- Independent search preserves diversity (content vs API vs topology candidates)
- RRF allows independent tuning of each lane
- Fusion respects the semantic difference between each vector type

---

## 4. Feature Storage Separation — CORRECTED

### The Error

Mixing extracted facts with classifier outputs in the same table.

**Wrong** → Store domain scores in atlas_packet_features alongside ast_symbols
**Correct** → Separate fact extraction from classifier outputs

### The Fix

**atlas_packet_features** (extracted evidence only — deterministic, reproducible):
```sql
CREATE TABLE atlas_packet_features (
  packet_key UUID PRIMARY KEY,
  
  -- Structural facts (AST)
  ast_symbols TEXT[] NOT NULL DEFAULT '{}',
  tree_node_ids JSONB NOT NULL DEFAULT '{}',
  
  -- Lexical facts (BM25, path, imports)
  lexical_features TEXT[],
  imports TEXT[],
  exports TEXT[],
  
  -- Concept/entity facts
  concepts TEXT[],
  entities TEXT[],
  
  -- Embeddings (pointers to vectors, not stored here)
  content_embedding_ref VARCHAR,      -- "embeddinggemma-768-v1"
  summary_embedding_ref VARCHAR,      -- "embeddinggemma-768-v1"
  signature_embedding_ref VARCHAR,    -- "embeddinggemma-768-v1"
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**atlas_packet_metrics** (derived scores only — classifier outputs):
```sql
CREATE TABLE atlas_packet_metrics (
  packet_key UUID PRIMARY KEY,
  
  -- Domain classification (XGBoost output)
  domain_primary VARCHAR,
  domain_confidence FLOAT,
  domain_alternatives JSONB,
  
  -- Topology metadata (SOM, KMeans, PageRank)
  som_index INT,
  kmeans_cluster INT,
  community_id VARCHAR,
  pagerank_score FLOAT,
  
  -- Routing hints
  routing_tier VARCHAR,           -- "canonical" | "recoverable" | "quarantine"
  
  -- Classifier version
  classifier_version VARCHAR,     -- "domain-xgb-v1"
  
  updated_at TIMESTAMP
);
```

**Hard Rule**: 
- ✅ Facts extracted from source code → `atlas_packet_features`
- ✅ Derived classifier scores → `atlas_packet_metrics`
- ❌ Never mix (no domain probabilities in features, no raw AST in metrics)

**Why?**
- Facts are reproducible and version-controlled (same source → same facts)
- Scores are model-dependent and versioned separately (v1 vs v2 classifier)
- Separation allows retraining classifier without re-extracting facts
- Clear audit trail: source → facts → scores → ontology

---

## 5. Canonical vs Synthetic Identity — REINFORCED

### Synthetic Identity (Discovery Alias)

**Example**: `codebase:src/lib/server/auth.ts`

**Properties**:
- Generated by workspace scanner
- Convenient for discovery UI and temporary lookups
- **Cannot be resolved to atlas_packets.packet_key**
- Lost on re-scan
- **NEVER stored as canonical fact**

**Use case**: Temporary cache key during scanner discovery phase only.

### Canonical Identity (Persistent, Database-Backed)

**Components**:
1. `packet_key` (UUID) — primary key from atlas_packets
2. `source_ref` (VARCHAR) — relative file path, immutable
3. `content_hash` (VARCHAR) — SHA-256 of file content, version guard
4. `tree_node_id` (VARCHAR) — deterministic symbol identity

**Example**:
```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "content_hash": "a1b2c3d4e5f6...",
  "tree_node_id": {
    "validateSession": "a1b2c3d4e5f6g7h8",
    "createToken": "i9j0k1l2m3n4o5p6"
  }
}
```

**Properties**:
- Stable across time (file doesn't move, name doesn't change)
- Immutable except version tracking (content_hash changes only if file edits)
- Deterministic (same source always produces same IDs)
- Fully resolved to Postgres truth

**Hard Rule**: Synthetic discovery keys are aliases only. All persistent facts bind to canonical identity.

---

## 6. Ontology Tuple Construction — GROUNDED

### The Error

Generating ontology tuples without source evidence or confidence tracking.

### The Fix

**Every tuple must include source evidence and confidence**:

```json
{
  "subject_id": "function:searchPackets",
  "predicate": "IMPLEMENTS",
  "object_id": "capability:semantic-retrieval",
  "source_ref": "src/lib/server/retrieval/go-retrieval-facade.ts",
  "source_line_range": [42, 67],
  "content_hash": "a1b2c3d4e5f6...",
  "confidence": 0.95,
  "extractor": "canonical-ast-backfill-v1",
  "extractor_version": "1.0",
  "derivation": "ast"     -- vs "gemma4" vs "xgboost"
}
```

**Confidence Levels**:
- AST-derived (deterministic): 0.9–1.0
- Lexical-derived (BM25 + path): 0.75–0.9
- Gemma4-derived (semantic): 0.3–0.7 (until validated)
- XGBoost-derived (classifier): 0.5–0.95 (depends on model precision)

**Tuple Types**:

| Subject | Predicate | Object | Confidence | Example |
|---------|-----------|--------|------------|---------|
| function | IMPLEMENTS | capability | 0.95 (AST) | `validateSession` IMPLEMENTS `session-auth` |
| function | USES | service | 0.90 (AST) | `searchPackets` USES `qdrant-service` |
| module | BELONGS_TO_DOMAIN | domain | 0.90 (XGBoost) | `go-retrieval-facade.ts` BELONGS_TO `retrieval` |
| test | VALIDATES | function | 0.95 (AST) | `test-auth-smoke.ts` VALIDATES `loginUser` |
| function | HAS_PRECONDITION | concept | 0.70 (Gemma4) | `checkPermission` HAS_PRECONDITION `authenticated-session` |

---

## 7. Complete Classifier Path (Canonical Order)

```
1. LOAD CANONICAL IDENTITY
   source: atlas_packets (packet_key + source_ref + content_hash)
   
2. DETERMINISTIC AST EXTRACTION
   source: File on disk, verified by content_hash
   output: ast_symbols[], tree_node_ids JSONB
   confidence: 0.95–1.0
   
3. LEXICAL ANALYSIS
   source: AST + file path + import statements
   output: bm25_keywords[], path_terms[], concept_ids[]
   confidence: 0.85–0.95
   
4. EMBEDDING VECTORS (Independent Lanes)
   source: EmbeddingGemma on content, summary, signature
   output: content_768, summary_768, signature_768 (pointers only)
   confidence: N/A (vectors are projections, not scores)
   
5. OPTIONAL GEMMA4 GROUNDING
   source: AST + lexical + embedding evidence only
   output: capability_summary, failure_modes[], business_concept
   confidence: 0.6–0.8 (semantic reasoning, not deterministic)
   
6. FEATURE ENVELOPE V1 MATERIALIZATION
   source: All 5 prior layers + topology metadata
   output: Unified FeatureEnvelope with all evidence
   confidence: Composite (inherited from source layers)
   
7. TOPOLOGY ENRICHMENT
   source: SOM fit, KMeans clustering, PageRank
   output: som_index, kmeans_cluster, community_id, pagerank_score
   confidence: N/A (topology is structural, not scored)
   
8. XGBOOST DOMAIN CLASSIFIER
   source: FeatureEnvelope (all evidence layers)
   input: [ast_count, lexical_count, content_vec, som_cell, kmeans_cluster, ...]
   output: domain_primary, domain_confidence, domain_alternatives[]
   confidence: model_precision (0.5–0.95 range, depends on training data)
   
9. ONTOLOGY TUPLE MATERIALIZER
   source: AST + XGBoost + Gemma4 outputs
   output: (subject, predicate, object, confidence, source_evidence)
   confidence: Inherited from source extractor
   
10. QDRANT PAYLOAD MIRROR
    source: Canonical identity + all evidence layers
    output: Named vectors (content_768, summary_768, ...) 
            Payloads (packet_key, source_ref, domain, confidence, ...)
    confidence: Metadata only (confidence tracked separately)
    
11. GO RETRIEVAL CANDIDATE OUTPUT
    source: Qdrant search (multiple lanes) + RRF fusion
    output: Top-K candidates with fusion scores
    confidence: RRF normalization (0–1)
    
12. OPTIONAL RERANKING + SYNTHESIS
    source: Top-K candidates + original query
    output: Gemma4 synthesis with citations
    confidence: Inherited from candidate scores
```

**Critical Properties**:
- ✅ Each layer builds on prior deterministic facts
- ✅ No layer skips Postgres truth (canonical identity is always checked)
- ✅ Confidence degrades gracefully as certainty decreases (AST → Gemma4 → XGBoost)
- ✅ Every output retains source evidence
- ✅ Classifier uses ALL evidence, not just one vector

---

## 8. What Changed This Session

### Updated Files

**sveltekit-frontend/scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs**:
- ✅ Corrected docstring to clarify canonical vs synthetic identity
- ✅ Updated verification query to count non-empty arrays only
- ✅ Measure coverage against eligible code packets, not all rows
- ✅ Report gap to 80% threshold correctly (121 packets)

### Updated Measurements

**Coverage Verification**:
```sql
-- WRONG (reported 100%)
COUNT(CASE WHEN ast_symbols IS NOT NULL THEN 1 END)

-- CORRECT (reports 78.33% for eligible code)
COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END)
```

**Expected State** (July 11, 2026):
- Eligible code packets: 7,273
- With non-empty ast_symbols: 5,697 (78.33%)
- Missing AST: 1,576 (21.67%)
- Gap to 80%: 121 packets

---

## 9. Hard Rules (Enforcement Checklist)

Before writing any classifier, materializer, or retrieval code:

- [ ] Canonical identity is packet_key + source_ref + content_hash (never synthetic key)
- [ ] AST facts are extracted deterministically (not Gemma4 guessing)
- [ ] Gemma4 is used only for semantic reasoning grounded in AST facts
- [ ] Feature extraction lives in atlas_packet_features
- [ ] Classifier outputs live in atlas_packet_metrics (separate table)
- [ ] Vector search uses multiple named vectors, RRF fusion (no averaging)
- [ ] Coverage is measured as non-empty arrays, not NULL vs non-NULL
- [ ] Coverage is measured for eligible code packets, not all feature rows
- [ ] Ontology tuples carry source evidence and confidence
- [ ] Every output retains deterministic facts that grounded it

---

## Next Steps

1. **P2C: Lexical + Import Extraction** (2–3 hours)
   - Extract BM25-ready keywords from AST + file paths
   - Parse import/require statements
   - Write to atlas_packet_features (lexical_features[], imports[], exports[])

2. **P2D: Feature Envelope Materializer** (2 hours)
   - Combine P2A (AST) + P2C (lexical) into Feature Envelope V1
   - No domain labels yet (just evidence layers)
   - Prepare for topology enrichment

3. **P2E+: Domain Classification** (8–10 hours)
   - Create .okf domain specs
   - Implement XGBoost classifier with all evidence
   - Backfill domain_primary, domain_confidence to atlas_packet_metrics

---

**Date**: July 11, 2026  
**Session**: Session 136+ Continuation  
**Status**: 🟢 **CORRECTED, DOCUMENTED, READY FOR P2C**
