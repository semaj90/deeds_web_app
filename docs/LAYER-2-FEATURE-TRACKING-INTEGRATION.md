# LAYER 2 Feature Tracking Integration into Master Feature Map

**Status**: Architecture blueprint for wiring Phase 2A/2B/2C/2D into canonical feature tracking  
**Date**: July 5, 2026 (Session 109 Continuation)  
**Target**: Unify ast_symbols, lexical_features, entities, used_concepts extraction into master atlas

---

## Canonical Feature Architecture (Master Feature Map Integration)

### Current Master Feature Map State

**File**: `src/lib/server/atlas/master-feature-map.ts` (370+ lines)

**Registered Families** (11 total):
1. hyperrag-fusion (multi-signal retrieval, RRF)
2. ace-envelope (BitFrost context cache)
3. trace-mcp (agentic tool surface)
4. hypergraph-4d (4D manifold routing)
5. karpathy-blend (GPU blend orchestration)
6. gpu-compute-plane (resilient GPU acceleration)
7. feature-atlas (central registry — **LAYER 2 CANDIDATE**)
8. import-atlas (dependency graph)
9. route-map (route feature mapping)
10. legal-product (KAG/DAG synthesis)
11. ingestion-layer (Docling/LangExtract/OCR)

---

## LAYER 2 Feature Tracking Entry (New)

### Master Feature Map Addition

Add to `MASTER_FEATURE_MAP` in `src/lib/server/atlas/master-feature-map.ts`:

```typescript
// Family 12: LAYER 2 Feature Extraction & Materialization
'layer2-feature-extraction': {
  id: 'layer2-feature-extraction',
  name: 'LAYER 2: Compiler Output Feature Extraction (Phase 2A-2D)',
  intent: 'canonical feature materialization pipeline: ast_symbols → lexical_features → entities → used_concepts',
  service: 'Layer2MaterializationPipeline',
  stores: ['Postgres', 'Qdrant', 'Redis', 'Neo4j'],
  modules: [
    'scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs',
    'scripts/atlas/phase2b-lexical-extraction-kmeans.mjs',
    'scripts/atlas/apply-naive-bayes-packet-classifier.mjs',
    'scripts/atlas/materialize-feature-envelopes.mts'
  ],
  imports: [
    'PacketTopologyEnvelopeSchema',
    'CanonicalFeatureEnvelopeSchema',
    'buildCanonicalFeatureEnvelope',
    'validatePacketEnvelope'
  ],
  dependencies: [
    'LAYER 1 (canonical identity)',
    'atlas_packets (truth)',
    'atlas_packet_features (materialization)',
    'PacketTopologyEnvelope (schema)',
    'CanonicalFeatureEnvelope (builder)'
  ],
  languages: ['TypeScript', 'Python', 'JavaScript'],
  networking: ['Postgres', 'Qdrant', 'Redis', 'Neo4j'],
  offlineProcessing: ['ast-grep CLI', 'LangExtract NLP'],
  cache: ['Redis packet cache', 'Bifrost L1/L2'],
  inferenceFallbacks: ['CPU K-means', 'Naive Bayes classifier'],
  clusters: [72, 73, 94, 25],  // Lexical, topology, entity, classification clusters
  status: 'active',  // Phase 2A/2B wired, Phase 2C/2D ready
  params: {
    phases: ['2A: ast-grep', '2B: lexical+kmeans', '2C: entities+domain', '2D: remaining'],
    targetCoverage: 0.80,  // >80% across all 9 fields
    vectorDim: { tier1: 768, tier2: 384, tier3: 64 },
    topologyColumns: ['topolog_cluster', 'topolog_confidence', 'topolog_method'],
    qdrantCollection: 'codebase_chunks_768',
    fields: [
      'ast_symbols',
      'lexical_features',
      'entities',
      'used_concepts',
      'imports',
      'exports',
      'functions',
      'classes',
      'routes',
      'permissions'
    ]
  },
  pathMapping: [
    'src/lib/server/db/packet-topology-envelope.ts',
    'src/lib/server/db/canonical-feature-envelope.ts',
    'src/lib/server/retrieval/hyperrag-packet-rpc.ts',
    'src/lib/server/retrieval/rrf-integration.ts',
    'scripts/atlas'
  ],
  evidence: {
    files: [
      'docs/FEATURE-TRACKING-ARCHITECTURE.md',
      'docs/MULTI-VECTOR-EMBEDDING-STRATEGY.md',
      'src/lib/server/db/packet-topology-envelope.ts',
      'src/lib/server/db/canonical-feature-envelope.ts',
      'scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs',
      'scripts/atlas/phase2b-lexical-extraction-kmeans.mjs'
    ],
    smoke: [
      'scripts/atlas:phase2a:ast-grep-fix:dry',
      'scripts/atlas:phase2b:lexical-kmeans:dry'
    ],
    tests: [
      'tests/unit/packet-topology-envelope.test.ts',
      'tests/unit/canonical-feature-envelope.test.ts'
    ],
    lastValidatedAt: '2026-07-05T00:00:00Z'
  },
  failOpen: true
}
```

---

## Data Flow Integration

### LAYER 1 → LAYER 2 Pipeline

```
atlas_packets (58,365 rows)
  ├─ packet_key (identity)
  ├─ source_ref (file path)
  ├─ feature_id
  ├─ domain_class (100% coverage)
  └─ tree_node_id

LAYER 2 PHASE 2A
  ↓ (input: source_ref from atlas_packets)
  → phase2a-ast-grep-synthetic-key-fix.mjs
  → Extract AST symbols via ast-grep CLI
  → Write ast_symbols[] to atlas_packet_features.ast_symbols
  ↓
  Coverage: 6,827 packets (12.6%)

LAYER 2 PHASE 2B
  ↓ (input: ast_symbols from Phase 2A)
  → phase2b-lexical-extraction-kmeans.mjs
  → extractLexicalFeatures(ast_symbols)
  → Write lexical_features[] to atlas_packet_features.lexical_features
  → GPU K-means clustering (or CPU fallback)
  → Write topolog_cluster/confidence to atlas_packets
  ↓
  Coverage: ~7,343 packets (12.6%)

LAYER 2 PHASE 2C
  ↓ (input: lexical_features + ast_symbols)
  → apply-naive-bayes-packet-classifier.mjs
  → Train/infer Naive Bayes domain classifier
  → Extract entities via LangExtract
  → Write entities[], used_concepts[], domain_score to atlas_packet_features
  ↓
  Coverage: >80% target

LAYER 2 PHASE 2D
  ↓ (input: full packet context)
  → Remaining extractors (imports, exports, functions, classes, routes, permissions)
  → Write to atlas_packet_features
  ↓
  Coverage: >80% final

Qdrant Sync (all phases)
  ↓
  Upsert payloads with ast_symbols[], lexical_features[], entities, domain_class
  ↓
  codebase_chunks_768 mirror updated
```

---

## Canonical Envelope Lifecycle

### Phase 2A: Synthetic Key Problem Resolution

**Before (Phase 1 — BROKEN)**:
```typescript
// Phase 1 created synthetic keys
packet_key: 'codebase:src/lib/auth.ts'  // NOT IN atlas_packets

// Results in orphaned rows
INSERT INTO atlas_packet_features (packet_key, ast_symbols)
VALUES ('codebase:src/lib/auth.ts', [...])  // NO FK REFERENCE
```

**After (Phase 2A — FIXED)**:
```typescript
// Query real packet_key from atlas_packets
const realPacket = await postgres.query(
  `SELECT packet_key FROM atlas_packets WHERE source_ref = $1`,
  [sourceRef]
);

// Write with canonical packet_key
INSERT INTO atlas_packet_features (packet_key, ast_symbols)
VALUES (realPacket.packet_key, [...])  // LINKED ROW
```

### Phase 2B: Schema Extension

**New columns on atlas_packets**:
```sql
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS
  topolog_cluster INT,
  topolog_confidence REAL DEFAULT 0.5,
  topolog_method TEXT DEFAULT 'unassigned',
  topolog_applied_at TIMESTAMP WITH TIME ZONE;

-- New table for cluster metadata
CREATE TABLE IF NOT EXISTS atlas_topology_clusters (
  cluster_id INT PRIMARY KEY,
  semantic_center BYTEA,  -- msgpack centroid (64-dim)
  authority REAL,
  som_row INT, som_col INT, som_cluster TEXT,
  inertia REAL, silhouette REAL, davies_bouldin REAL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Phase 2C: Domain Classification Wiring

**Envelope enrichment**:
```typescript
// After training Naive Bayes on Phase 1 data
const nbModel = loadModel('naive_bayes_domain_classifier');

// Predict for each packet's ast_symbols
const prediction = nbModel.predictProba(symbolFeatures);

// Add to envelope
envelope.domain_score = prediction.confidence;
envelope.predicted_domain = prediction.class;
envelope.domain_probabilities = prediction.probabilities;
```

### Phase 2D: Complete Materialization

**All 9 fields populated**:
```sql
SELECT
  packet_key,
  ast_symbols,           -- Phase 2A
  lexical_features,      -- Phase 2B
  entities,              -- Phase 2C
  used_concepts,         -- Phase 2C (derived)
  imports,               -- Phase 2D
  exports,               -- Phase 2D
  functions,             -- Phase 2D
  classes,               -- Phase 2D
  routes,                -- Phase 2D
  permissions            -- Phase 2D
FROM atlas_packet_features
WHERE ast_symbols IS NOT NULL;
-- Expected coverage: >80% for each field
```

---

## Retrieval Integration Points

### HyperRAG Packet RPC (Stage 2 Join)

**File**: `src/lib/server/retrieval/hyperrag-packet-rpc.ts` (lines 88-200)

```typescript
// Enrich Qdrant ANN results with LAYER 2 features
async function stageTwoJoin(
  qdrantCandidates: HyperRagPacket[]
): Promise<RankedPacket[]> {
  // Query atlas_packet_features for all extracted features
  const fullRows = await postgres.query(`
    SELECT
      codebase_chunk_index.*,
      atlas_packet_features.ast_symbols,
      atlas_packet_features.lexical_features,
      atlas_packet_features.entities,
      atlas_packet_features.used_concepts,
      atlas_packet_features.domain_score,
      atlas_packets.topolog_cluster,
      atlas_packets.topolog_confidence
    FROM codebase_chunk_index
    LEFT JOIN atlas_packet_features USING (packet_key)
    LEFT JOIN atlas_packets USING (packet_key)
    WHERE codebase_chunk_index.id = ANY($1)
  `, [qdrantCandidates.map(c => c.qdrant_point_id)]);
  
  return fullRows.map(row => ({
    ...row,
    retrieval_lanes: {
      dense: qdrant_score,
      lexical: bm25(row.lexical_features, query),
      entity: entityMatch(row.entities, query),
      ast: astSymbolMatch(row.ast_symbols, query),
      domain: domainMatch(row.domain_score, query),
      topology: topologyScore(row.topolog_cluster, query)
    }
  }));
}
```

### RRF Blend Formula (Stage 3)

**File**: `src/lib/server/retrieval/rrf-integration.ts`

```typescript
// Extended blend with LAYER 2 signals
async function stageThreeBlendWithLayer2(
  rankedPackets: RankedPacket[]
): Promise<FinalRankedPacket[]> {
  return rankedPackets.map(p => ({
    ...p,
    fusion_score: (
      0.30 * rrf(p.retrieval_lanes.dense) +
      0.20 * rrf(p.retrieval_lanes.lexical) +
      0.15 * rrf(p.retrieval_lanes.entity) +
      0.12 * rrf(p.retrieval_lanes.ast) +
      0.10 * rrf(p.retrieval_lanes.postgres) +
      0.08 * rrf(p.retrieval_lanes.domain) +  // NEW: Domain confidence
      0.05 * rrf(p.retrieval_lanes.freshness)
    )
  }));
}
```

---

## Qdrant Payload Schema (Phase 2 Final)

### Named Vectors Configuration

```yaml
collection: codebase_chunks_768
  vector_size: 384  # Canonical dimension
  
  named_vectors:
    content:        # 768-orig, downsampled to 384
      size: 384
      distance: Cosine
      index: HNSW
      
    signature:      # Sparse metadata filter
      size: 32
      distance: Cosine

  payload_schema:
    # Identity (LAYER 1)
    source_ref: Keyword
    feature_id: Keyword
    packet_key: Keyword
    directory_path: Keyword
    
    # Features (LAYER 2)
    ast_symbols: Array[String]         # Phase 2A
    lexical_features: Array[String]    # Phase 2B
    entities: Json                     # Phase 2C
    used_concepts: Array[String]       # Phase 2C
    domain_class: Keyword
    domain_score: Float                # Naive Bayes confidence
    
    # Topology (Phase 2B)
    topolog_cluster: Integer
    topolog_confidence: Float
    som_row: Integer
    som_col: Integer
    
    # Audit
    created_at: Integer
    updated_at: Integer
```

---

## Session 110 Execution Checklist

### Pre-Execution Verification

- [ ] Atlas packets table: `SELECT COUNT(*) FROM atlas_packets` → 58,365
- [ ] Domain class coverage: `SELECT COUNT(DISTINCT domain_class) FROM atlas_packets` → 8+
- [ ] Feature envelope schema exists: Zod schema validates
- [ ] Postgres connection: `psql -h 127.0.0.1:5434 -U legal_admin -d legal_ai_db`
- [ ] Qdrant collection ready: `curl localhost:6333/collections` → 58 collections

### Phase 2A Execution

```bash
# Dry-run first
npm run atlas:phase2a:ast-grep-fix:dry --limit=100

# If successful, apply
npm run atlas:phase2a:ast-grep-fix:apply --limit=10000

# Verify
psql -c "SELECT COUNT(*) WHERE ast_symbols IS NOT NULL FROM atlas_packet_features;"
# Expected: ~7,343
```

### Phase 2B Execution

```bash
npm run atlas:phase2b:lexical-kmeans:dry --limit=100
npm run atlas:phase2b:lexical-kmeans:apply --limit=10000

# Verify topology columns
psql -c "SELECT COUNT(*) WHERE topolog_cluster IS NOT NULL FROM atlas_packets;"
# Expected: ~7,343
```

### Phase 2C Execution

```bash
# Train Naive Bayes on Phase 1 data
npm run atlas:phase2c:domain-classifier:train

# Apply classifier
npm run atlas:phase2c:domain-classifier:apply --limit=10000

# Extract entities
npm run atlas:phase2c:entity-extraction:apply --limit=10000

# Verify
psql -c "SELECT COUNT(*) WHERE domain_score IS NOT NULL FROM atlas_packet_features;"
# Expected: >7,343
```

### Phase 2D Execution

```bash
npm run atlas:phase2d:remaining-extractors:apply --limit=10000
```

### Final Qdrant Sync

```bash
npm run atlas:qdrant:payload:sync --full

# Verify
curl localhost:6333/collections/codebase_chunks_768 | jq '.result.points_count'
# Expected: ~40,568 (all embeddings synced)
```

### Coverage Verification

```bash
npm run atlas:layer2:verify:coverage

# Expected output:
# ast_symbols:       7,343 / 58,366 (12.6%)
# lexical_features:  7,343 / 58,366 (12.6%)
# entities:          7,343+ / 58,366 (12.6%+)
# used_concepts:     7,343+ / 58,366 (12.6%+)
# domain_score:      7,343+ / 58,366 (12.6%+)
# imports:           40,754 / 58,366 (70%+)
# exports:           40,754 / 58,366 (70%+)
# functions:         40,754 / 58,366 (70%+)
# classes:           40,754 / 58,366 (70%+)
# routes:            40,754 / 58,366 (70%+)
# Target: >80% across all fields
```

---

## Key Integration Points

### 1. Envelope Validation at Every Store Handoff
- Postgres → Qdrant: `validatePacketEnvelope()` before upsert
- Qdrant → Redis: `tryValidatePacketEnvelope()` (graceful degradation)
- Redis → ACE/RPC: `validatePacketEnvelope()` (hard fail)

### 2. Feature Tracking via Master Feature Map
- New entry: `layer2-feature-extraction` (Family 12)
- Clusters: [72, 73, 94, 25] (lexical, topology, entity, classification)
- Status: `active` (Phase 2A/2B wired, Phase 2C/2D ready)

### 3. Multi-Vector Embedding Hierarchy
- Tier 1: 768-dim (transient)
- Tier 2: 384-dim (canonical search vector, Postgres pgvector, Qdrant named_vector)
- Tier 3: 64-dim (K-means clustering, SOM routing — NOT for search)

### 4. RRF Blend Extension
- Original: 6 signals (0.30·qdrant + 0.20·turbovec + ...)
- Extended: 8 signals (+ 0.08·domain + 0.05·freshness)

### 5. Naive Bayes Domain Classification
- Training: Phase 1 data (58,365 packets with domain_class)
- Features: camelCase tokens, keywords, symbol patterns
- Output: P(domain | symbols) confidence score
- Reranking: +0.05 boost if confidence > 0.85 and query matches domain

---

## Success Criteria (Session 110)

✅ Phase 2A apply: 6,827 packets with ast_symbols  
✅ Phase 2B apply: 6,827 packets with lexical_features + topolog_cluster  
✅ Phase 2C apply: Naive Bayes trained + entities extracted  
✅ Phase 2D apply: imports, exports, functions, classes, routes, permissions populated  
✅ Qdrant sync: All payloads updated with LAYER 2 features  
✅ Coverage: >80% across all 9 fields  
✅ Master Feature Map: layer2-feature-extraction entry active  
✅ Retrieval integration: HyperRAG RPC using LAYER 2 signals in RRF blend  

---

## Reference Documents

- **FEATURE-TRACKING-ARCHITECTURE.md** — Complete Phase 2A/2B/2C/2D implementation
- **MULTI-VECTOR-EMBEDDING-STRATEGY.md** — Dimension hierarchy, embedding strategy, Naive Bayes
- **master-feature-map.ts** — Canonical feature registry (add new entry)
- **packet-topology-envelope.ts** — Zod schema + validators
- **canonical-feature-envelope.ts** — Builder pattern for consistent envelope shape

