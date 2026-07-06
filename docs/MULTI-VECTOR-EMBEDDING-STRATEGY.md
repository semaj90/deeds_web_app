# Multi-Vector Embedding Strategy — Dimension Hierarchy & Storage

**Status**: Architecture documented, Phase 2B K-means ready  
**Date**: July 5, 2026  
**Decision**: EmbeddingGemma (384-dim canonical) not BERT (768-dim domain-generic)

---

## Why NOT BERT + Why EmbeddingGemma

| Criterion | BERT | EmbeddingGemma | Winner |
|-----------|------|---|---|
| Dimensionality | 768-dim | 384-dim | EmbeddingGemma (storage, speed) |
| Domain Tuning | Generic | Legal-optimized | EmbeddingGemma |
| Inference Speed | 40-60ms | 10-15ms | EmbeddingGemma (4-6× faster) |
| In-Project Context | Not available | Native in Ollama :11434 | EmbeddingGemma |
| Re-embedding Cost | High (768d ANN) | Lower (384d ANN) | EmbeddingGemma |
| Compatibility | Requires custom pipeline | Direct Qdrant integration | EmbeddingGemma |

**Decision**: Use EmbeddingGemma (384-dim) as canonical embedding model. BERT is NOT recommended.

---

## Dimension Hierarchy (3 Tiers)

```
Tier 1: 768-dim (Full Output)
  ↓ (source: embeddinggemma:latest native)
  └─ Mean-pool to 384 dims
     ↓
Tier 2: 384-dim (Canonical Storage)
  ↓ (stored in: Postgres pgvector, Qdrant named_vector "content")
  └─ Autoencoder 384→64
     ↓
Tier 3: 64-dim (Topology Only)
  └─ Use ONLY for K-means clustering + SOM, NOT for search
```

### Purpose of Each Tier

**Tier 1 (768-dim)**:
- Native output from EmbeddingGemma model
- Transient (not stored in DB)
- Input to Tier 2 downsampling

**Tier 2 (384-dim — CANONICAL for Search)**:
- Stored in `codebase_chunk_index.content_embedding` (Postgres pgvector)
- Mirrored to Qdrant `named_vector: content` (768-label collection, but holds 384 vectors)
- Used in Stage 1 ANN (cosine distance, HNSW top-20)
- Hard requirement: all search operations use 384-dim vectors

**Tier 3 (64-dim — Topology Only)**:
- Autoencoder latent space
- **NOT for retrieval** — autoencoder is randomly initialized, produces flat outputs
- Use for: K-means cluster centers (topolog_cluster), SOM grid routing (som_row/col)
- Optional: Pre-filter before Qdrant ANN (reduces candidate set from 10K to 1K)

---

## Canonical Storage & Retrieval Flow

### Postgres (Truth Layer)
```sql
-- Table: codebase_chunk_index
CREATE TABLE codebase_chunk_index (
  id UUID PRIMARY KEY,
  source_ref TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  packet_key TEXT NOT NULL,
  
  -- Canonical embedding (384-dim)
  content_embedding vector(384) NOT NULL,
  
  -- Topology labels (from Phase 2B K-means)
  topolog_cluster INT,
  topolog_confidence REAL,
  
  -- Audit
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Indexed for fast lookup
CREATE INDEX idx_codebase_chunk_content_embedding 
  ON codebase_chunk_index USING hnsw (content_embedding vector_cosine_ops);
```

### Qdrant Mirror
```yaml
collection: codebase_chunks_768
  shard_count: 10
  replication_factor: 1
  vector_size: 384  # Despite name "768", we store 384 canonical vectors
  distance: Cosine
  
  named_vectors:
    content:      # 384-dim (primary search vector)
      size: 384
      distance: Cosine
      index_type: HNSW
      
    signature:    # Sparse payload metadata (filtered search)
      size: 32    # Sparse vector for source_ref + feature_id tags
      distance: Cosine
      
  payload_schema:
    source_ref: Keyword
    feature_id: Keyword
    packet_key: Keyword
    domain_class: Keyword
    tree_node_id: UUID
    ast_symbols: Array[String]        # From Phase 2A
    lexical_features: Array[String]   # From Phase 2B
    entities: Object                  # From Phase 2C
    used_concepts: Array[String]      # Derived
```

### Retrieval Pipeline (Stages 1-3)

#### Stage 1: Vector ANN (Qdrant 384-dim)
```typescript
async function stageOneAnn(queryVector: number[]): Promise<HyperRagPacket[]> {
  // Embed query using EmbeddingGemma (384-dim output)
  const queryEmbedding = await ollama.embeddings({
    model: 'embeddinggemma:latest',
    prompt: userQuery
  }); // shape: [384]
  
  // Qdrant ANN search on canonical "content" vector
  const qdrantResults = await qdrant.search({
    collection: 'codebase_chunks_768',
    vector: queryEmbedding,
    limit: 20,
    with_payload: true
  });
  
  return qdrantResults.map(r => ({
    qdrant_point_id: r.id,
    source_ref: r.payload.source_ref,
    feature_id: r.payload.feature_id,
    packet_key: r.payload.packet_key,
    qdrant_score: r.score
  }));
}
```

#### Stage 1.5: TurboVec Pre-filter (Optional — 768→64 Compression)
```typescript
async function stageOnePointFivePrefilter(
  candidates: HyperRagPacket[]
): Promise<HyperRagPacket[]> {
  // Extract 384-dim vectors from top-20 candidates
  const vectors384 = candidates.map(c => 
    await postgres.query(
      `SELECT content_embedding FROM codebase_chunk_index WHERE id = $1`,
      [c.qdrant_point_id]
    )
  );
  
  // TurboVec: compress 384→64 and pre-cluster
  const compressed = await turboVec.transform({
    vectors: vectors384,
    target_dim: 64
  });
  
  // KMeans filter: keep only top-10 from each cluster
  const kmeansResult = await tensorrt_bridge.clusterEmbeddings(
    compressed,
    k: 10
  );
  
  // Return cluster representatives
  return candidates.filter(c => kmeansResult.members[c.qdrant_point_id]);
}
```

#### Stage 2: Postgres Join & Ranking
```typescript
async function stageTwoJoin(
  qdrantCandidates: HyperRagPacket[]
): Promise<RankedPacket[]> {
  // Get full packet metadata from Postgres
  const fullRows = await postgres.query(`
    SELECT
      codebase_chunk_index.*,
      atlas_packet_features.ast_symbols,
      atlas_packet_features.lexical_features,
      atlas_packet_features.entities
    FROM codebase_chunk_index
    LEFT JOIN atlas_packet_features USING (packet_key)
    WHERE codebase_chunk_index.id = ANY($1)
  `, [qdrantCandidates.map(c => c.qdrant_point_id)]);
  
  return fullRows.map(row => ({
    ...row,
    retrieval_lanes: {
      dense: qdrant_score,
      fts: bm25_score_from_postgres,
      trigram: trigram_similarity(row.source_ref, query),
      jsonb: jsonb_rank(row.ast_symbols, query)
    }
  }));
}
```

#### Stage 3: RRF Blend + Reranking
```typescript
async function stageThreeBlend(rankedPackets: RankedPacket[]): Promise<RerankedPacket[]> {
  // Apply 6-signal blend
  const blended = rankedPackets.map(p => ({
    ...p,
    fusion_score: (
      0.30 * rrf_normalize(p.retrieval_lanes.dense) +
      0.20 * rrf_normalize(p.retrieval_lanes.fts) +
      0.20 * rrf_normalize(p.retrieval_lanes.trigram) +
      0.15 * rrf_normalize(p.retrieval_lanes.jsonb) +
      0.10 * rrf_normalize(p.postgres_rank) +
      0.05 * rrf_normalize(p.freshness_boost)
    )
  }));
  
  // Optional: Gemma4 E2B reranking
  const topK = blended.slice(0, 20);
  const gemma4Scores = await gemma4_encode_batch(topK);
  
  // Final blend (if Gemma4 available)
  const final = blended.map(p => {
    const gemmaBoost = gemma4Scores[p.id] || 0;
    return {
      ...p,
      final_score: 0.90 * p.fusion_score + 0.10 * gemmaBoost
    };
  });
  
  return final.sort((a, b) => b.final_score - a.final_score);
}
```

---

## Autoencoder Training (Phase 3 Preparation — DO NOT USE YET)

### Why Autoencoder?
- Reduce 384-dim → 64-dim for K-means efficiency
- Preserve semantic intent in compressed latent space
- Enable hierarchical clustering (SOM operates in latent space)

### Architecture
```
Encoder: 384 → 256 → 128 → 64
Decoder: 64 → 128 → 256 → 384

Loss: MSE(input, reconstruction) + 0.1 * KL_divergence (VAE variant)
```

### Current Status
- **Autoencoder weights**: Randomly initialized (Xavier uniform)
- **Latent output**: Flat, uninformative (all values ~0.5)
- **Current use**: K-means only (tolerates poor embeddings)
- **DO NOT use for search** — use Tier 2 (384-dim) instead

### When to Train (Post-Phase 2D)
```bash
# After Phase 2D (all features extracted)
npm run autoencoder:train:start --epoch=50 --batch=128 --learning-rate=0.001

# Verify convergence
npm run autoencoder:validate:test-set

# Export trained weights
npm run autoencoder:export:weights --format=pt
```

---

## Logistic Regression vs Naive Bayes (Classification)

### Decision: Use Naive Bayes for domain classification

| Criterion | Logistic Regression | Naive Bayes | Winner |
|-----------|---|---|---|
| Training Data | Needs ~1000 labeled examples | Works with <500 examples | Naive Bayes |
| Interpretability | Weights per feature | P(feature \| class) | Naive Bayes |
| Speed | O(K*D) inference | O(K*D) inference | Tie |
| Assumption | Linear decision boundary | Feature independence | Depends on data |
| Library Support | sklearn.linear_model | sklearn.naive_bayes | Tie |
| For ast_symbols → domain_class | Overkill | Perfect fit | Naive Bayes |

**Why Naive Bayes for ast_symbols → domain_class**:
1. Training data already exists (Phase 1: 100% domain_class coverage across 58K packets)
2. Feature independence assumption holds (ast symbols are mostly independent)
3. Fast inference (no matrix multiplication)
4. Interpretable (can explain "why this symbol predicts 'error_handling' domain")

### Implementation
```python
from sklearn.naive_bayes import GaussianNB
import pandas as pd

# Load training data from Phase 1
training_data = pd.read_sql("""
  SELECT
    unnest(ast_symbols) AS symbol,
    domain_class
  FROM atlas_packet_features
  JOIN atlas_packets USING (packet_key)
  WHERE ast_symbols IS NOT NULL
""", db)

# Feature engineering
features = extract_symbol_features(training_data['symbol'])
# Expected: camelCase tokens, keyword presence, symbol length, nesting depth

# Train
nb_model = GaussianNB()
nb_model.fit(features, training_data['domain_class'])

# Predict
test_symbols = ['validateSession', 'user', 'expiry']
test_features = extract_symbol_features(test_symbols)
probabilities = nb_model.predict_proba(test_features)
# Returns: P(domain_class | symbols) for each class
```

---

## Decision Trees & Hierarchical Cartesian Modeling (Out of Scope)

### Why NOT decision trees for feature ranking

Decision trees are useful for:
- Non-linear classification (but we have Naive Bayes)
- Feature importance analysis (but we have XGradient)
- Small datasets with complex boundaries (we have 58K rows)

Decision trees are NOT useful for:
- Real-time retrieval ranking (inference too slow)
- Multi-signal fusion (can't combine 6 different signal types)
- Continuous score output (trees are categorical)

### Why NOT hierarchical Cartesian modeling

Hierarchical Cartesian is useful for:
- 3D/4D spatial indexing (we have SOM for this)
- Recursive grid partitioning (we have K-means for this)

Hierarchical Cartesian is NOT useful for:
- Text similarity (we have Qdrant ANN for this)
- Signal fusion (RRF is simpler and proven)

**Verdict**: Use existing tools (Naive Bayes for classification, RRF for fusion) instead of building new ones.

---

## Histogram Cosine Similarity Inverse (Mathematical Note)

### Cosine Similarity ∈ [−1, 1]
```
similarity(a, b) = (a·b) / (||a|| * ||b||)

For normalized vectors: similarity ∈ [0, 1] (always positive)
For retrieval: higher similarity = better match
```

### Histogram Representation (optional pre-processing)
```
Convert 384-dim vector → 64-bin histogram (bin each value into 0-63 range)
Result: 64 integer counts

Pros: Dimensionality reduction, fast cosine (integer arithmetic)
Cons: Loss of magnitude information, slower training

Use case: Approximate ANN for pre-filtering (like TurboVec)
```

### Cosine Similarity Inverse (Distance)
```
distance = 1 - similarity

Used by Qdrant for ranking (return vectors with LOWEST distance first)
```

**For this project**: Use direct cosine similarity (not histogram) because:
1. Qdrant handles cosine distance natively
2. 384-dim vectors are manageable (not too large)
3. HNSW index is optimized for full vectors
4. Histogram approximation adds complexity without clear benefit

---

## XGradient Feature Importance (Integrated into Phase 2C)

### What XGradient Does
```
Computes gradient of loss w.r.t. each feature input
High gradient = feature strongly influences the model's decision
```

### Use in Feature Weighting
```typescript
// After training Naive Bayes domain classifier
const featureImportance = analyzeXGradient(nb_model);

// featureImportance['validateSession'] = 0.85 (high)
// featureImportance['error'] = 0.92 (highest)
// featureImportance['user'] = 0.45 (moderate)

// In retrieval ranking, boost features with high importance
lexical_signals.forEach(f => {
  if (featureImportance[f] > 0.7) {
    signal_boost(f, 1.5);
  }
});
```

### Implementation
```python
from xgradient import GradientAnalyzer

# Load trained Naive Bayes model
nb_model = load_model('naive_bayes_domain_classifier.pkl')

# Compute gradient
analyzer = GradientAnalyzer(nb_model)
feature_importance = analyzer.analyze(
  input_features=training_features,
  target_labels=training_labels
)

# Export
export_feature_importance(feature_importance, 'feature_importance.json')
```

---

## Reinforcement Learning + HMM (Deferred to Phase 4)

### Why HMM?
- Sequential state modeling (packet → next packet in workflow)
- Probabilistic transitions (P(next_state | current_state))
- Useful for predicting "what tool to call next" in agentic loops

### Current Status
- Phase 2B: K-means (deterministic clustering, no RL)
- Phase 3: SOM + topology (deterministic grid)
- **Phase 4 (Deferred)**: HMM state transitions for agentic tool selection

### Placeholder for Phase 4
```typescript
// NOT YET IMPLEMENTED
interface HMMState {
  state: string;  // 'retrieval', 'ranking', 'summarization', 'action'
  transition_probs: Record<string, number>;  // P(next_state | current)
  emission_probs: Record<string, number>;    // P(observation | state)
}

async function selectNextTool(currentState: HMMState): Promise<string> {
  // Use HMM to predict most likely next tool
  // Based on past tool sequences and current retrieval state
  return hmm.viterbi_predict(currentState);
}
```

---

## Quick Reference: When to Use Each Signal

| Signal | Type | When | Cost |
|--------|------|------|------|
| **Qdrant dense (384-dim)** | Vector | Every retrieval | Fast (HNSW) |
| **TurboVec prefilter** | Compression | High cardinality (>10K) | Medium (GPU) |
| **BM25 lexical** | Sparse | Keyword-heavy queries | Fast (FTS index) |
| **ast-grep symbols** | Graph | Code-specific | Instant (cached) |
| **Naive Bayes domain** | Classification | Domain filtering | Fast (inference) |
| **XGradient weights** | Importance | Feature boosting | None (precomputed) |
| **Gemma4 E2B** | LLM rerank | Top-20 final ranking | Expensive (inference) |

**Default pipeline**: Qdrant (dense) → BM25 (fallback) → Naive Bayes (filter) → Karpathy blend (fusion) → optional Gemma4 (E2B rerank)

---

## Phase 2C Implementation: Naive Bayes Domain Classifier

### Training Data Source (Phase 1 Complete)
```sql
-- 58,365 packets with 100% domain_class coverage
SELECT
  packet_key,
  domain_class,
  ast_symbols,
  feature_id,
  source_ref
FROM atlas_packets
JOIN atlas_packet_features USING (packet_key)
WHERE ast_symbols IS NOT NULL
ORDER BY packet_key;
```

### Feature Engineering Pipeline

```typescript
// Extract features from ast_symbols for Naive Bayes training
function extractSymbolFeatures(symbols: string[]): SymbolFeatures {
  const features = {
    // Lexical features
    has_error: symbols.some(s => s.toLowerCase().includes('error')),
    has_handler: symbols.some(s => s.includes('Handler')),
    has_validator: symbols.some(s => s.includes('validate') || s.includes('Validate')),
    
    // Pattern features
    camel_case_count: symbols.filter(s => /^[a-z].*[A-Z]/.test(s)).length,
    pascal_case_count: symbols.filter(s => /^[A-Z]/.test(s)).length,
    constant_count: symbols.filter(s => /^[A-Z_]+$/.test(s)).length,
    
    // Statistical features
    avg_symbol_length: symbols.reduce((sum, s) => sum + s.length, 0) / symbols.length,
    symbol_count: symbols.length,
    unique_symbols: new Set(symbols).size,
    
    // Domain patterns
    has_accessor: symbols.some(s => /^(get|set|is|has|can)/.test(s)),
    has_factory: symbols.some(s => /^(use|create|make|build)/.test(s)),
    has_event: symbols.some(s => /Handler|Listener|Callback/.test(s)),
    has_architecture: symbols.some(s => /Manager|Controller|Service/.test(s))
  };
  
  return features;
}

// Batch training pipeline (Phase 2C)
async function trainNaiveBayesDomainClassifier() {
  // Step 1: Load training data from Postgres
  const trainingData = await postgres.query(`
    SELECT
      packet_key,
      domain_class,
      ast_symbols
    FROM atlas_packets
    JOIN atlas_packet_features USING (packet_key)
    WHERE ast_symbols IS NOT NULL AND domain_class IS NOT NULL
  `);
  
  // Step 2: Feature extraction
  const featureVectors = trainingData.map(row => ({
    features: extractSymbolFeatures(row.ast_symbols),
    label: row.domain_class,
    packet_key: row.packet_key
  }));
  
  // Step 3: Train Naive Bayes model (in Python subprocess or sklearn.js)
  const model = await trainNaiveBayesModel(featureVectors);
  
  // Step 4: Export model weights to Postgres
  await postgres.query(`
    INSERT INTO model_artifacts (name, model_type, weights, accuracy, created_at)
    VALUES ('naive_bayes_domain_classifier', 'naive_bayes', $1, $2, NOW())
  `, [JSON.stringify(model.weights), model.accuracy]);
  
  return model;
}
```

### Inference in Retrieval Pipeline

```typescript
// Phase 2C: Apply domain classifier during feature materialization
async function materializeFeatureEnvelopeWithDomainClassification(
  packet: AtlasPacket,
  features: FeatureExtraction
) {
  // Load trained Naive Bayes model
  const nbModel = await loadTrainedModel('naive_bayes_domain_classifier');
  
  // Extract features from ast_symbols
  const symbolFeatures = extractSymbolFeatures(packet.ast_symbols);
  
  // Predict domain class and confidence
  const prediction = nbModel.predictProba(symbolFeatures);
  // Returns: { domain_class: string, confidence: number, probabilities: Record<string, number> }
  
  // If confidence is high (>0.85), use prediction to boost domain-specific signals
  if (prediction.confidence > 0.85) {
    features.domain_score = prediction.confidence;
    features.predicted_domain = prediction.domain_class;
  }
  
  // Write to database
  await postgres.query(`
    UPDATE atlas_packet_features
    SET
      domain_score = $1,
      predicted_domain = $2,
      domain_confidence = $3,
      updated_at = NOW()
    WHERE packet_key = $4
  `, [
    prediction.confidence,
    prediction.domain_class,
    prediction.probabilities,
    packet.packet_key
  ]);
}
```

### Reranking Integration (Phase 2C)

```typescript
// Boost RRF blend score if domain classifier is confident
async function boostBlendScoreWithDomainClassification(
  rankedPackets: RankedPacket[],
  userQuery: string
): Promise<RerankedPacket[]> {
  return rankedPackets.map(packet => {
    let blendBoost = 0;
    
    // If domain classifier predicted a domain and confidence is high
    if (packet.domain_score && packet.domain_score > 0.85) {
      // Check if query contains domain keywords
      const domainKeywords = getDomainKeywords(packet.predicted_domain);
      const queryMatchCount = domainKeywords.filter(k => 
        userQuery.toLowerCase().includes(k.toLowerCase())
      ).length;
      
      if (queryMatchCount > 0) {
        blendBoost = 0.05 * (packet.domain_score * queryMatchCount / domainKeywords.length);
      }
    }
    
    return {
      ...packet,
      domain_boost: blendBoost,
      final_blend_score: packet.fusion_score + blendBoost
    };
  });
}
```

---

## Phase 2C Extension: LangExtract Entity Extraction

### Entity Types Extracted
```typescript
enum EntityType {
  VERB = 'VERB',
  SUBJECT = 'SUBJECT',
  OBJECT = 'OBJECT',
  DEPENDENCY = 'DEPENDENCY',
  ACTION = 'ACTION',
  AGENT = 'AGENT',
  PATIENT = 'PATIENT'
}

interface ExtractedEntity {
  type: EntityType;
  value: string;
  confidence: number;
  source: 'lexical_features' | 'ast_symbols' | 'domain_pattern';
}
```

### LangExtract Integration

```typescript
// Phase 2C: Extract NLP entities from lexical features
async function extractEntitiesWithLangExtract(
  packet: AtlasPacket,
  lexicalFeatures: string[]
): Promise<ExtractedEntity[]> {
  // Reconstruct source context from lexical features
  const context = reconstructContext(lexicalFeatures, packet.source_ref);
  
  // Call LangExtract for NLP analysis
  const entities = await langExtract.extractEntities(context, {
    includeVerbPatterns: true,
    includeDependencies: true,
    includeActions: true
  });
  
  // Enrich with lexical feature mapping
  const enrichedEntities = entities.map(e => ({
    ...e,
    // Cross-reference with lexical features (higher confidence if found)
    lexical_match: lexicalFeatures.some(f => 
      f.toLowerCase().includes(e.value.toLowerCase())
    ) ? 1.0 : 0.7
  }));
  
  // Write to database
  await postgres.query(`
    UPDATE atlas_packet_features
    SET
      entities = $1,
      updated_at = NOW()
    WHERE packet_key = $2
  `, [JSON.stringify(enrichedEntities), packet.packet_key]);
  
  return enrichedEntities;
}

// Reconstruct context from lexical features for LangExtract
function reconstructContext(lexicalFeatures: string[], sourceRef: string): string {
  const nouns = lexicalFeatures.filter(f => isNoun(f));
  const verbs = lexicalFeatures.filter(f => isVerb(f));
  const actions = lexicalFeatures.filter(f => isAction(f));
  
  return `
    Function/Class: ${sourceRef.split('/').pop()}
    Concepts: ${nouns.join(', ')}
    Actions: ${verbs.join(', ')}
    Patterns: ${actions.join(', ')}
  `;
}

// Helper functions
function isNoun(token: string): boolean {
  return /^[A-Z]/.test(token) || ['user', 'data', 'handler', 'session'].includes(token);
}

function isVerb(token: string): boolean {
  return /^(get|set|validate|fetch|create|build)/.test(token);
}

function isAction(token: string): boolean {
  return ['factory', 'accessor', 'error_handling', 'event_driven'].includes(token);
}
```

---

## Phase 2D: Complete Feature Materialization

### All Extraction Outputs

```sql
-- Final schema after all phases complete
ALTER TABLE atlas_packet_features ADD COLUMN IF NOT EXISTS
  -- Phase 2A
  ast_symbols TEXT[],
  
  -- Phase 2B
  lexical_features TEXT[],
  
  -- Phase 2C
  entities JSONB,                    -- { VERB, SUBJECT, DEPENDENCY, ACTION }
  used_concepts TEXT[],              -- Derived from ast + lexical
  domain_score REAL,                 -- Naive Bayes confidence
  predicted_domain TEXT,             -- Predicted domain_class
  domain_confidence JSONB,           -- P(domain | symbols) for all classes
  
  -- Phase 2D
  imports TEXT[],                    -- External imports
  exports TEXT[],                    -- Exported symbols
  functions JSONB[],                 -- { name, params, return_type }
  classes JSONB[],                   -- { name, methods, properties }
  routes TEXT[],                     -- API routes
  permissions TEXT[];                -- Required permissions
```

### Materialization Job

```bash
# Session 110 execution sequence

# Phase 2A: Extract AST symbols
npm run atlas:phase2a:ast-grep-fix:apply --limit=10000
# Wait 1-2h

# Phase 2B: Extract lexical features + K-means
npm run atlas:phase2b:lexical-kmeans:apply --limit=10000
# Wait 2-3h

# Phase 2C: Domain classification + Entity extraction
npm run atlas:phase2c:domain-classifier:train
npm run atlas:phase2c:domain-classifier:apply --limit=10000
npm run atlas:phase2c:entity-extraction:apply --limit=10000
# Wait 2h

# Phase 2D: Remaining extractors
npm run atlas:phase2d:remaining-extractors:apply --limit=10000
# Wait 6-8h

# Qdrant sync (final)
npm run atlas:qdrant:payload:sync --full

# Verify coverage
npm run atlas:layer2:verify:coverage
# Expected: >80% across all 9 fields
```

---

## Karpathy Authority Blend Integration (Phase 3)

### Blend Score Composition

```typescript
interface KarpathyBlend {
  page_rank: number;           // 0.40 — Neo4j PageRank score
  attention_score: number;     // 0.30 — GPU attention(query, embeddings)
  authority_score: number;     // 0.30 — Graph centrality measure
  combined_score: number;      // 0.40*PR + 0.30*attn + 0.30*auth
}

// Compute Karpathy blend for top-K candidates
async function computeKarpathyBlend(
  candidates: RankedPacket[],
  queryVector: number[]
): Promise<{ packet_key: string; blend_score: number }[]> {
  // Fetch PageRank from Neo4j / CouchDB cache
  const pageRankScores = await fetchPageRankScores(
    candidates.map(c => c.packet_key)
  );
  
  // Compute GPU attention scores
  const embeddings = candidates.map(c => c.content_embedding);
  const attentionScores = await tensorrt_bridge.batchCosineSimilarity(
    queryVector,
    embeddings
  );
  
  // Compute authority scores (eigenvector centrality)
  const authorityScores = await fetchAuthorityScores(
    candidates.map(c => c.packet_key)
  );
  
  // Blend
  return candidates.map((c, i) => ({
    packet_key: c.packet_key,
    blend_score: (
      0.40 * pageRankScores[c.packet_key] +
      0.30 * attentionScores[i] +
      0.30 * authorityScores[c.packet_key]
    )
  })).sort((a, b) => b.blend_score - a.blend_score);
}

// Cache in Redis for 24h
async function cacheKarpathyBlend(blendScores: KarpathyBlend[]) {
  const key = `gpu:karpathy:scores`;
  const hash = blendScores.reduce((acc, score) => {
    acc[score.packet_key] = JSON.stringify(score);
    return acc;
  }, {});
  
  await redis.hmset(key, hash);
  await redis.expire(key, 86400); // 24h TTL
}
```

---

## Production Safety Gates (Phase 3+)

### Validation Before Qdrant Sync

```typescript
async function validatePayloadBeforeQdrantSync(payload: QdrantPayload): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Hard requirements
  if (!payload.source_ref) errors.push('source_ref required');
  if (!payload.feature_id) errors.push('feature_id required');
  if (!payload.packet_key) errors.push('packet_key required');
  
  // Vector validation
  if (payload.content_embedding) {
    if (payload.content_embedding.length !== 384) {
      errors.push(`content_embedding must be 384-dim, got ${payload.content_embedding.length}`);
    }
    if (payload.content_embedding.some(v => isNaN(v))) {
      errors.push('content_embedding contains NaN');
    }
  } else {
    warnings.push('content_embedding missing (will use sparse search only)');
  }
  
  // Feature array validation
  if (payload.ast_symbols && !Array.isArray(payload.ast_symbols)) {
    errors.push('ast_symbols must be array');
  }
  if (payload.lexical_features && !Array.isArray(payload.lexical_features)) {
    errors.push('lexical_features must be array');
  }
  
  // Metadata validation
  if (payload.domain_class && !VALID_DOMAIN_CLASSES.includes(payload.domain_class)) {
    warnings.push(`unknown domain_class: ${payload.domain_class}`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
```

### Coverage Verification

```sql
-- After each phase, verify coverage improvement
SELECT
  'Total packets' AS metric,
  COUNT(*) AS count,
  0 AS coverage_pct
FROM atlas_packet_features

UNION ALL

SELECT 'ast_symbols', 
  COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END),
  ROUND(100.0 * COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) / COUNT(*), 1)
FROM atlas_packet_features

UNION ALL

SELECT 'lexical_features',
  COUNT(CASE WHEN lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0 THEN 1 END),
  ROUND(100.0 * COUNT(CASE WHEN lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0 THEN 1 END) / COUNT(*), 1)
FROM atlas_packet_features

-- ... repeat for entities, used_concepts, imports, exports, functions, classes, routes, permissions
```

