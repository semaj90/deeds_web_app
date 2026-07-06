# Feature Tracking Architecture — LAYER 2 End-to-End

**Status**: Phase 2A/2B WIRED, Phase 2C/2D READY  
**Date**: July 5, 2026 (Session 109 Continuation)  
**Canonical Identity**: packet_key, source_ref, feature_id, tree_node_id, title_id  
**Multi-Vector Embeddings**: 768-dim content (search) + 384-dim canonical + 64-dim latent (topology)

---

## LAYER 2 Feature Extraction Pipeline

### Phase 2A: AST Symbol Extraction (ast-grep)
**Script**: `sveltekit-frontend/scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs` (350 lines)  
**Input**: source_ref from atlas_packets (code files only)  
**Output**: ast_symbols TEXT[] → atlas_packet_features.ast_symbols  
**Coverage**: 6,827 code packets (0.9% → 12.6%)

**Key Fix**: Synthetic packet_key problem resolved:
```sql
-- PHASE 1 (WRONG)
packet_key: 'codebase:src/lib/...'  -- NOT IN atlas_packets

-- PHASE 2A (FIXED)
SELECT packet_key FROM atlas_packets WHERE source_ref = $1
-- Write with REAL packet_key from DB
INSERT INTO atlas_packet_features (packet_key, ast_symbols)
VALUES (real_packet_key, [...symbols])
```

**Functions**:
- `extractAstSymbols(filePath)` — calls ast-grep CLI, parses JSON, extracts symbol names
- `resolveSourceRefToPath(sourceRef)` — normalizes Windows paths, handles path.sep
- `getRepoRoot()` — intelligent fallback for path resolution (SvelteKit context or hardcoded)

**npm scripts**:
- `atlas:phase2a:ast-grep-fix:dry` — preview on 100 packets
- `atlas:phase2a:ast-grep-fix:apply` — execute on 10,000 packets
- `atlas:phase2a:ast-grep-fix:test` — verbose test on 50 packets

---

### Phase 2B: Lexical Feature Extraction + K-Means Clustering
**Script**: `sveltekit-frontend/scripts/atlas/phase2b-lexical-extraction-kmeans.mjs` (380 lines)  
**Input**: ast_symbols from Phase 2A  
**Output**: 
- lexical_features TEXT[] → atlas_packet_features.lexical_features
- topolog_cluster INT, topolog_confidence REAL → atlas_packets
- atlas_topology_clusters table (centroids + metadata)

**Coverage**: Expected 12.6% → >80% after Phase 2C/2D

**Key Functions**:

```typescript
// Extract lexical features from ast_symbols
function extractLexicalFeatures(astSymbols: string[]): string[] {
  const features = new Set<string>();
  
  astSymbols.forEach(symbol => {
    // 1. Symbol itself (if >2 chars)
    if (symbol.length > 2) features.add(symbol);
    
    // 2. camelCase decomposition: validateSession → validate, session
    const camelParts = symbol.match(/[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\d|\W|$)/g) || [];
    camelParts.forEach(part => {
      if (part.length > 1) features.add(part.toLowerCase());
    });
    
    // 3. Pattern classification
    if (/^[A-Z]/.test(symbol)) features.add('PascalCase');      // Classes
    if (/^[a-z].*[A-Z]/.test(symbol)) features.add('camelCase'); // Functions
    if (/^[A-Z_]+$/.test(symbol)) features.add('CONSTANT');      // Constants
    
    // 4. Domain patterns
    if (symbol.includes('Error')) features.add('error_handling');
    if (symbol.match(/^(get|set|is|has|can)/)) features.add('accessor');
    if (symbol.match(/^(use|create|make|build)/)) features.add('factory');
    if (symbol.match(/(Handler|Listener|Callback)/)) features.add('event_driven');
    if (symbol.match(/(Manager|Controller|Service|Factory)/)) features.add('architecture');
  });
  
  return Array.from(features)
    .filter(f => f.length > 1 && f.length < 128)
    .slice(0, 200);  // Max 200 per packet
}

// GPU-accelerated K-means clustering
async function clusterWithGpu(vectors: Float32Array[], k: number) {
  try {
    const addon = require('simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    if (!addon.clusterEmbeddings) return null; // Fallback to CPU
    
    const flatVecs = new Float32Array(vectors.flat());
    const n = vectors.length;
    const d = vectors[0]?.length || 64;
    
    return addon.clusterEmbeddings(flatVecs, n, d, k, {
      max_iterations: 50,
      tolerance: 1e-4,
      random_seed: 42
    });
  } catch (e) {
    return null; // Fallback to CPU
  }
}

// CPU-only K-means fallback
function clusterWithCpu(vectors: number[][], k: number, maxIter = 10) {
  // Lloyd's algorithm: initialize K centroids, assign points, update centroids
  const n = vectors.length;
  const d = vectors[0].length;
  
  // Random centroid initialization
  let centroids = [];
  const indices = new Set<number>();
  while (indices.size < Math.min(k, n)) {
    indices.add(Math.floor(Math.random() * n));
  }
  centroids = Array.from(indices).map(i => vectors[i].slice());
  
  let assignments = new Array(n).fill(0);
  
  // Iterate
  for (let iter = 0; iter < maxIter; iter++) {
    // Assign points to nearest centroid
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let cluster = 0;
      for (let j = 0; j < k; j++) {
        const dist = Math.sqrt(
          vectors[i].reduce((sum, v, idx) => sum + Math.pow(v - centroids[j][idx], 2), 0)
        );
        if (dist < minDist) {
          minDist = dist;
          cluster = j;
        }
      }
      assignments[i] = cluster;
    }
    
    // Update centroids
    const newCentroids = Array(k).fill(null).map(() => new Array(d).fill(0));
    const counts = new Array(k).fill(0);
    
    for (let i = 0; i < n; i++) {
      const cluster = assignments[i];
      counts[cluster]++;
      for (let j = 0; j < d; j++) {
        newCentroids[cluster][j] += vectors[i][j];
      }
    }
    
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        for (let idx = 0; idx < d; idx++) {
          newCentroids[j][idx] /= counts[j];
        }
      }
    }
    
    centroids = newCentroids;
  }
  
  return { cluster_ids: assignments, centroids };
}
```

**Schema Extension** (Phase 2B):
```sql
ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS
  topolog_cluster INT,
  topolog_confidence REAL DEFAULT 0.5,
  topolog_method TEXT DEFAULT 'unassigned',
  topolog_applied_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS atlas_topology_clusters (
  cluster_id INT PRIMARY KEY,
  semantic_center BYTEA,  -- msgpack-encoded centroid
  authority REAL,
  som_row INT, som_col INT, som_cluster TEXT,
  inertia REAL, silhouette REAL, davies_bouldin REAL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**npm scripts**:
- `atlas:phase2b:lexical-kmeans:dry` — preview on 100 packets
- `atlas:phase2b:lexical-kmeans:apply` — execute on 10,000 packets
- `atlas:phase2b:lexical-kmeans:cluster:gpu` — GPU K-means with tensorrt N-API

---

### Phase 2C: Entity Extraction + Naive Bayes Domain Classifier (READY FOR SESSION 110)
**Input**: lexical_features + source context  
**Output**: 
- entities JSONB → atlas_packet_features.entities
- used_concepts TEXT[] → atlas_packet_features.used_concepts
- domain_score → rerank signal

**Implementation Pattern**:
```typescript
// LangExtract: Extract NLP entities
const entities = await langExtractEntities(lexicalFeatures, sourceContext);
// Expected: VERB, SUBJECT, DEPENDENCY, ENTITY_TYPE, ACTION

// Naive Bayes Domain Classifier
const naiveBayesDomainScore = await classifyDomain(astSymbols);
// Expected: P(domain_class | symbols) with confidence > 0.85

// Feature importance via XGradient
const featureImportance = await analyzeXGradient(symbols, domain);
// Use for lexical feature weighting in retrieval
```

---

### Phase 2D: Remaining Extractors (READY FOR SESSION 110)
**Input**: Full packet context  
**Output**:
- imports TEXT[] → atlas_packet_features.imports
- exports TEXT[] → atlas_packet_features.exports
- functions JSONB[] → atlas_packet_features.functions
- classes JSONB[] → atlas_packet_features.classes
- routes TEXT[] → atlas_packet_features.routes
- permissions TEXT[] → atlas_packet_features.permissions

---

## Canonical Envelope Systems

### 1. PacketTopologyEnvelope (Zod Schema)
**File**: `sveltekit-frontend/src/lib/server/db/packet-topology-envelope.ts` (165 lines)

**Purpose**: Single source of truth for packet shape across all stores.

**Key Fields**:
```typescript
export const PacketTopologyEnvelopeSchema = z.object({
  // Identity (immutable)
  packet_id: z.string().uuid(),
  packet_key: z.string().regex(/^sha256:[a-f0-9]{64}$|^[a-f0-9]{64}$/),
  packet_ulid: z.string().optional(),
  
  // Semantic grouping
  title_id: z.string().min(1),
  feature_id: z.string().min(1),
  source_ref: z.string().min(1),
  directory_path: z.string().optional(),
  
  // Topology labels (routing hints, NOT identity)
  community_id: z.number().int().nonnegative().nullable().optional(),
  som_row: z.number().int().min(0).max(19).nullable().optional(),
  som_col: z.number().int().min(0).max(19).nullable().optional(),
  som_cluster: z.string().nullable().optional(),
  kmeans_cluster_id: z.number().int().nonnegative().nullable().optional(),
  
  // Latent representations
  latent_64: z.array(z.number()).length(64).nullable().optional(),
  manifold_4d: z.object({
    x: z.number(),  // SOM column
    y: z.number(),  // SOM row
    z: z.number(),  // K-Means cluster (depth)
    t: z.union([z.number(), z.string()])  // Timestamp
  }).nullable().optional(),
  
  // Mirrors (read-only)
  qdrant_point_id: z.string().nullable().optional(),
  neo4j_neighbors: z.array(z.string()).default([]),
  page_rank_score: z.number().nonnegative().nullable().optional(),
  
  // Lexical enrichment
  summary: z.string().nullable().optional(),
  lexical_nouns: z.array(z.string()).default([]),
  lexical_verbs: z.array(z.string()).default([]),
  lexical_adverbs_ly: z.array(z.string()).default([]),
  used_concepts: z.array(z.string()).default([]),
  
  // Lineage
  supersedes: z.array(z.string()).default([]),
  superseded_by: z.string().nullable().optional(),
  
  // Audit
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
});
```

**Validation Functions**:
- `validatePacketEnvelope(input: unknown): PacketTopologyEnvelope` — throws on failure
- `tryValidatePacketEnvelope(input: unknown): PacketTopologyEnvelope | null` — returns null on failure
- `validatePacketBatch(packets: unknown[])` — returns { valid, invalid, errors }
- `coerceToPacketEnvelope(partial)` — fill in defaults for partial envelopes

---

### 2. CanonicalFeatureEnvelope (Builder Pattern)
**File**: `sveltekit-frontend/src/lib/server/db/canonical-feature-envelope.ts` (263 lines)

**Purpose**: Ensure all writers (feature extraction, summary builders, ACE assembly, cache warmers, Qdrant sync) produce identical shape.

**Hard Requirements** (fail if omitted):
- packet_key, source_ref_key, feature_id, title_id, tree_node_id, used_concepts

**Soft Requirements** (warn if omitted):
- qdrant_point_id, community_id, som_cluster, domain_class

**Builder Function**:
```typescript
function buildCanonicalFeatureEnvelope(packet: {
  packet_key?: string | null;
  source_ref?: string | null;
  source_ref_key?: string | null;
  feature_id?: string | null;
  feature_label?: string | null;
  title_id?: string | null;
  tree_node_id?: string | null;
  domain_class?: string | null;
  used_concepts?: string[] | null;
  qdrant_point_id?: string | number | null;
  community_id?: number | null;
  som_cluster?: string | null;
  // ... other fields
}): { envelope: CanonicalFeatureEnvelope; validation: ValidationResult } {
  // Validate hard requirements
  const validation: ValidationResult = {
    isValid: true,
    hardFailures: [],
    softWarnings: []
  };
  
  // Check each hard requirement
  if (!packet.packet_key) {
    validation.hardFailures.push('packet_key: required but missing');
    validation.isValid = false;
  }
  // ... check other hard requirements
  
  // Check soft requirements
  if (!packet.qdrant_point_id) {
    validation.softWarnings.push('qdrant_point_id: recommended but missing');
  }
  // ... check other soft requirements
  
  // Build envelope (proceed even with soft warnings)
  const envelope: CanonicalFeatureEnvelope = {
    packet_key: packet.packet_key || '',
    source_ref: packet.source_ref || '',
    // ... populate all fields
  };
  
  return { envelope, validation };
}
```

---

## Multi-Vector Embedding Strategy

### Dimension Hierarchy
```
768-dim: Full EmbeddingGemma output
  ↓
384-dim: Canonical project dimension (mean-pool first 384 dims)
  ↓
64-dim: Autoencoder latent (training only, NOT for search)
```

### Qdrant Multi-Vector Setup
```
collection: codebase_chunks_768
  named_vectors:
    content:      768-dim HNSW (cosine distance) → Stage 1 ANN
    signature:    384-dim (sparse filters by source_ref, feature_id)
    topology:     64-dim (optional, SOM pre-filtering)
```

### Storage Contract
```sql
-- Postgres truth
CREATE TABLE codebase_chunk_index (
  id UUID PRIMARY KEY,
  content_embedding vector(384),  -- CANONICAL
  source_ref TEXT,
  feature_id TEXT,
  packet_key TEXT,
  -- ... other fields
);

-- Qdrant mirror
collection: codebase_chunks_768
  point_id: <UUID>,
  vector: [768-dim content],
  payload: {
    source_ref,
    feature_id,
    packet_key,
    ast_symbols: [...],
    lexical_features: [...],
    entities: {...},
    domain_class,
    tree_node_id
  }
```

---

## RRF (Reciprocal Rank Fusion) Integration

### Stage 3 Reranking Formula
```
final_score = 0.30·qdrant + 0.20·turbovec + 0.20·lexical + 0.15·ast + 0.10·postgres + 0.05·freshness

Where:
- qdrant = cosine distance of 768-dim vectors (Stage 1 ANN, top-20)
- turbovec = 768→64 compression + KMeans filter (Stage 2, top-10)
- lexical = BM25 / trigram similarity from Postgres FTS
- ast = ast-grep symbol graph match
- postgres = Postgres join relevance (JSONB matching)
- freshness = recency boost (updated_at timestamp)
```

### Implementation
**File**: `sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts` (REFERENCE)

```typescript
function fuseBatchRRF(
  qdrantScores: [string, number][],
  turboVecScores: [string, number][],
  lexicalScores: [string, number][],
  astScores: [string, number][],
  postgresScores: [string, number][],
  freshnessScores: [string, number][]
): { id: string; blendScore: number }[] {
  // Convert each lane to reciprocal ranks (1/(rank+1))
  const qdrantRRF = qdrantScores.map((id, i) => [id, 1 / (i + 1)]);
  const turboVecRRF = turboVecScores.map((id, i) => [id, 1 / (i + 1)]);
  // ... repeat for other lanes
  
  // Accumulate scores across all lanes
  const accumulated = new Map<string, number>();
  for (const [id, score] of [
    ...qdrantRRF.map(([id, s]) => [id, s * 0.30]),
    ...turboVecRRF.map(([id, s]) => [id, s * 0.20]),
    ...lexicalRRF.map(([id, s]) => [id, s * 0.20]),
    ...astRRF.map(([id, s]) => [id, s * 0.15]),
    ...postgresRRF.map(([id, s]) => [id, s * 0.10]),
    ...freshnessRRF.map(([id, s]) => [id, s * 0.05])
  ]) {
    accumulated.set(id, (accumulated.get(id) || 0) + score);
  }
  
  // Return sorted by blend score
  return Array.from(accumulated.entries())
    .map(([id, blendScore]) => ({ id, blendScore }))
    .sort((a, b) => b.blendScore - a.blendScore);
}
```

---

## Feature Tracking Files Reference

### Schemas & Envelopes
- `src/lib/server/db/packet-topology-envelope.ts` — Zod schema + validators
- `src/lib/server/db/canonical-feature-envelope.ts` — Builder + validation
- `src/lib/server/db/schema-postgres.ts` — atlas_packets + atlas_packet_features tables

### Extraction Scripts
- `scripts/atlas/phase2a-ast-grep-synthetic-key-fix.mjs` — AST symbol extraction
- `scripts/atlas/phase2b-lexical-extraction-kmeans.mjs` — Lexical + K-means
- `scripts/atlas/apply-naive-bayes-packet-classifier.mjs` — Domain classification
- `scripts/atlas/materialize-feature-envelopes.mts` — Feature materialization

### Retrieval Integration
- `src/lib/server/retrieval/hyperrag-packet-rpc.ts` — HyperRAG packet RPC (lines 1-100)
- `src/lib/server/retrieval/rrf-integration.ts` — RRF fusion formula
- `src/lib/server/retrieval/query-profile-router.ts` — Route queries to lanes

### Validation & Cache
- `src/lib/server/cache/ace-context-pack-cache.ts` — ACE packet cache
- `src/lib/server/ace/ace-packet-store.ts` — ACE storage
- `src/lib/server/hyperrag/hyperrag-packet-pipeline.ts` — Pipeline orchestration

---

## Session 110 Execution Plan

### Step 1: Apply Phase 2A (1-2 hours)
```bash
npm run atlas:phase2a:ast-grep-fix:apply
```
**Verification**:
```sql
SELECT COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END)
FROM atlas_packet_features;
-- Expected: ~7,343
```

### Step 2: Apply Phase 2B (2-3 hours)
```bash
npm run atlas:phase2b:lexical-kmeans:apply
```
**Verification**:
```sql
SELECT COUNT(CASE WHEN lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0 THEN 1 END)
FROM atlas_packet_features;
-- Expected: ~7,343
```

### Step 3: Wire Phase 2C (entity extraction + domain classifier)
- Input: lexical_features from Phase 2B
- Output: entities, used_concepts, domain_score
- Effort: 2 hours

### Step 4: Qdrant Sync (after each phase)
```bash
npm run atlas:qdrant:payload:sync
```
Upsert payloads with ast_symbols, lexical_features, entities, used_concepts, domain_class

### Target: >80% coverage across all 9 LAYER 2 fields by end of Session 110

---

## Naive Bayes + XGradient Integration (Optional, Phase 3)

### Naive Bayes Setup
```typescript
// Train on: (ast_symbols → domain_class) pairs from Phase 1
// Features: camelCase tokens, keywords, symbol length, nesting depth
// Output: P(domain_class | symbols) confidence score

const naiveBayesDomainScore = await classifyDomain(astSymbols);

// Add to blend if confidence > 0.85
if (naiveBayesDomainScore.confidence > 0.85) {
  blendScore += 0.05 * naiveBayesDomainScore.confidence;
}
```

### XGradient Feature Importance
```typescript
// Analyze which symbols matter most for each domain
const featureImportance = await analyzeXGradient(symbols, domain);

// Use to weight lexical features in retrieval
lexicalFeatures.forEach(f => {
  if (featureImportance[f] > threshold) {
    boostLexicalSignal(f, 1.5);
  }
});
```

---

## Gemma4 MTP + E2B Reranking (Optional, Phase 3)

### Multi-Token Prediction
```typescript
// Given ast_symbols + entities, predict next-token type
const prompt = `
Given validator [${astSymbols[0]}] and [${entityType}],
predict: most likely next token type is [error_handler | return_type | parameter]
`;

const response = await gemma4.generate(prompt);
// Rerank candidates by predicted token type
```

### E2B (Encoder-to-Batch) Reranking
```typescript
// Rank 20 candidates in ONE Gemma4 call (not 20 individual calls)
const topK = 20;
const prompt = `Rate relevance of these code chunks to: "${userQuery}"\n\n`;
const candidates_text = topK.map(c => `[${c.packet_id}] ${c.summary}`).join('\n');

const response = await gemma4_encode_batch(prompt + candidates_text);
// Returns: array of (candidate_id, relevance_score) tuples

// Final blend
final_blend = 0.30·qdrant + 0.20·turbovec + 0.20·lexical + 0.10·ast + 0.10·gemma4_e2b + 0.10·postgres
```

---

## Key Rules

✅ **DO**:
- Query ast_symbols first (Phase 2A output)
- Extract lexical_features second (Phase 2B output)
- Link all features to canonical packet_key (no synthetic keys)
- Validate envelope shape at every store handoff (Postgres → Qdrant → Redis → Neo4j)
- Use Naive Bayes for domain classification (trained on Phase 1 data)
- Use Qdrant multi-vectors for different retrieval stages (dense + signature + topology)
- Apply Karpathy blend (0.4·PR + 0.3·attn + 0.3·authority) for final reranking

❌ **DON'T**:
- Use synthetic packet_key values (always query from atlas_packets first)
- Skip validation between stores (envelopes diverge quickly)
- Use BERT (domain-generic, 768-dim, slow) instead of EmbeddingGemma (384-dim, legal-tuned)
- Join on feature_id alone (always include source_ref + directory_path)
- Run Naive Bayes for every candidate (do domain classification once, cache result)
- Bypass the Karpathy blend (don't roll custom ordering per lane)

