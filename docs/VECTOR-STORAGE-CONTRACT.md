# Vector Storage Contract: pgvector vs JSONB vs Qdrant Payload

**Date**: July 20, 2026  
**Principle**: Searchable vectors live in pgvector/Qdrant vectors. Metadata lives in JSONB/Qdrant payload.

---

## The Hard Boundary

| Storage | Use Case | Example |
|---------|----------|---------|
| **pgvector** | Searchable semantic embeddings (ANN) | `content_embedding_768 vector(768)` |
| **Qdrant vector field** | Searchable semantic embeddings (ANN) | `named_vectors.content_768_dense` |
| **JSONB** | Provenance, manifests, audit trails | `metadata JSONB` with manifest hash, model version, classifier outputs |
| **Qdrant payload** | Filterable metadata, faceting, ranking hints | `payload` JSON with domain_class, title_id, som_cluster, tree_node_id |

**Never do**: Store searchable vectors as JSONB. This kills ANN performance.  
**Never do**: Store metadata as vector dimensions. This wastes storage and computation.

---

## Postgres Schema (Canonical Truth)

### Core Table: `atlas_packets`

```sql
CREATE TABLE atlas_packets (
  packet_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key VARCHAR(255) NOT NULL UNIQUE,
  source_ref VARCHAR(512) NOT NULL,
  
  -- Identity
  domain_class VARCHAR(50),  -- Determined by classifier sidecar
  feature_id VARCHAR(255),
  feature_label VARCHAR(255),
  
  -- Searchable vectors (pgvector, NOT JSONB)
  content_embedding_768 vector(768),     -- Canonical 768-dim L2-normalized
  content_embedding_256 vector(256),     -- Optional MRL (Phase 107+)
  latent_embedding_64 halfvec,           -- Autoencoder routing (SOM/clustering only)
  
  -- Provenance & metadata (JSONB, NOT vectors)
  metadata JSONB,  -- Opaque user metadata (title, labels, tags, etc.)
  
  -- Classifier outputs & audit (JSONB)
  classifier_outputs JSONB,  -- {domain_class_score: 0.92, lexical_score: 0.8, ast_score: 0.75, version: "xgboost-v2"}
  
  -- Manifest & provenance (JSONB)
  embedding_manifest JSONB,  -- {model_id: "embeddinggemma", model_revision: "20260720", dim: 768, norm: "L2", idempotency_key: "sha256...", timestamp: "2026-07-20T..."}
  
  -- Indexing
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes: pgvector + JSONB
CREATE INDEX idx_content_embedding_768_ivfflat ON atlas_packets USING ivfflat (content_embedding_768);
CREATE INDEX idx_domain_class ON atlas_packets (domain_class);
CREATE INDEX idx_classifier_domain ON atlas_packets USING gin (classifier_outputs);
CREATE INDEX idx_embedding_model ON atlas_packets USING gin (embedding_manifest);
```

**Data Flow**:
1. Postgres stores **searchable vectors** in pgvector columns (fast ANN via HNSW/IVF)
2. Postgres stores **metadata** in JSONB columns (audit trail, filtering, faceting)
3. No vector search happens on JSONB columns

---

## Qdrant Schema (Derived Mirror)

### Collection: `codebase_chunks_768`

```python
from qdrant_client.models import Distance, VectorParams, PointStruct

# Collection creation
client.recreate_collection(
    collection_name="codebase_chunks_768",
    vectors_config=VectorParams(
        size=768,
        distance=Distance.COSINE,
        on_disk=False,  # Keep in memory for speed
    ),
    # Payload indexes (created BEFORE ingest for performance)
    payload_schema_disable_infer=False,
    payload_indexing_threshold=100,  # Auto-index after 100 points
)

# Point structure (what gets upserted)
point = PointStruct(
    id=packet_id_as_int,
    vector=embedding_768,  # The searchable vector
    payload={
        # Identity (filterable, NOT searchable)
        "packet_key": "ace:packet:...",
        "source_ref": "src/lib/server/db.ts",
        "domain_class": "code",
        
        # Ranking hints (used by reranker, NOT for ANN)
        "title_id": "db-client",
        "feature_label": "Database Client",
        "som_cluster": 5,
        "tree_node_id": "ast:file:db.ts:class:DbClient:0",
        
        # Audit (metadata only)
        "embedding_model": "embeddinggemma/20260720",
        "created_at": "2026-07-20T...",
        
        # Classifier outputs (for ranking, NOT for ANN)
        "domain_score": 0.92,
        "lexical_score": 0.8,
        "ast_score": 0.75,
    }
)
```

**Key Properties**:
- ✅ `vector` = 768-dim L2-normalized embedding (ANN searchable)
- ✅ `payload` = metadata for filtering, faceting, ranking hints
- ✅ Named vectors (future): `content_768_dense`, `content_512_mrl`, `sparse_bm25`
- ✅ Payload indexes on `domain_class`, `feature_label`, `som_cluster` for fast filtering

**Never do**: Put embedding vector inside payload JSON.

---

## Redis / Bitfrost Cache (Ephemeral)

### Cache Keys (L1 exact-match + L2 semantic)

```typescript
// L1: Exact-match cache (Redis strings)
redis.set(
  `embedding:cache:${queryHash}`,
  JSON.stringify(cached_embedding),
  'EX', 3600  // 1-hour TTL
);

// L2: Semantic cache (Qdrant via Bifrost)
// Bifrost handles Qdrant query → similarity check → return cached result
bifrost.search({
  query_vector: query_embedding_768,
  threshold: 0.85,
  fetch_payload: true  // Get metadata for ranking
});

// Routing state (ephemeral, rebuilt from Postgres if lost)
redis.set(
  `routing:hot_centroid:${som_cluster_id}`,
  JSON.stringify(centroid_64_dim),  // Latent embedding for routing
  'EX', 300  // 5-min TTL
);

// HyperLogLog for cardinality (not for identity)
redis.pfadd(
  `hll:unique_source_refs:${date}`,
  source_ref  // Approximate distinct count only
);
```

**Never store vectors as searchable data in Redis.** Use it only for:
- Hot caches (exact-match, semantic via Bifrost)
- Routing state (latent centroids)
- Cardinality approximation (HLL)

---

## Python Sidecar: Classifier Input/Output

### Input: Features (from tree-sitter, ast-grep, token count)

```python
from dataclasses import dataclass
import numpy as np

@dataclass
class ClassifierInput:
    """Input to domain classifier (Python sidecar)."""
    packet_key: str
    source_ref: str
    chunk_text: str
    
    # Sparse lexical features (TF-IDF or token counts)
    lexical_features: np.ndarray  # Shape (vocab_size,), sparse
    
    # Structural features (AST)
    ast_features: np.ndarray  # Shape (n_ast_features,), binary or counts
    
    # Embedding (from embedding sidecar, used as feature input)
    embedding_768: np.ndarray  # Shape (768,), L2-normalized
    
    # Path/file features
    path_rule_score: float  # 0.0-1.0 heuristic from file extension
    
# Classifier processes ALL features → output decision
classifier = LogisticRegression(C=1.0, max_iter=1000)
domain_scores = classifier.predict_proba(X_features)
# Output: {domain_class: "code", confidence: 0.92, lexical: 0.80, ast: 0.75, embedding: 0.95}
```

### Output: Classification Decision

```python
@dataclass
class ClassifierOutput:
    """Output from domain classifier."""
    packet_key: str
    domain_class: str  # "code", "legal", "documentation", etc.
    confidence: float  # 0.0-1.0 from LogisticRegression
    component_scores: dict  # {lexical: 0.80, ast: 0.75, embedding: 0.95, path: 0.60}
    classifier_version: str  # "logistic-v2-20260720"
    timestamp: str  # ISO 8601
    
# Stored in Postgres
atlas_packets.classifier_outputs = {
    'domain_class': 'code',
    'confidence': 0.92,
    'lexical_score': 0.80,
    'ast_score': 0.75,
    'embedding_score': 0.95,
    'path_score': 0.60,
    'version': 'logistic-v2-20260720'
}

# Mirrored to Qdrant payload
qdrant_payload = {
    'domain_class': 'code',
    'domain_score': 0.92,
    'lexical_score': 0.80,
    'ast_score': 0.75
}
```

**Decision Gates**:
```python
def classify_decision_gate(confidence: float) -> str:
    if confidence >= 0.80:
        return 'auto_accept'  # Write to Postgres immediately
    elif confidence >= 0.55:
        return 'provisional_queue'  # Queue for Mastra review
    else:
        return 'manual_review'  # Mastra creates review task
```

---

## Pipeline Lane Ordering (Dependency Graph)

### Phase 106: Stage 4 (Embedding Only)
```
chunk_text
    ↓ [Embedding Sidecar: EmbeddingGemma]
embedding_768 (L2-normalized)
    ↓ [Postgres Write]
atlas_packets.content_embedding_768 (pgvector)
    ↓ [Qdrant Mirror]
codebase_chunks_768.vector (Qdrant)
```

### Phase 107+: Classifier Lane (Domain Classification)

```
chunk_text + embedding_768
    ↓ [Tree-sitter / ast-grep]
lexical_features, ast_features
    ↓ [Python Sidecar: Classifier]
domain_class, confidence, component_scores
    ↓ [Postgres Write]
atlas_packets.classifier_outputs (JSONB)
    ↓ [Qdrant Mirror]
codebase_chunks_768.payload.domain_class (Qdrant payload)
```

### Phase 107+: Topology Lane (PageRank + SOM)

```
content_embedding_768
    ↓ [Autoencoder Sidecar]
latent_embedding_64 (routing only, NOT retrieval)
    ↓ [cuGraph PageRank]
pagerank_score
    ↓ [SOM Clustering]
som_cluster_id, bmu_x, bmu_y
    ↓ [Postgres Write]
atlas_packets.latent_embedding_64, som_cluster
    ↓ [Qdrant Mirror]
codebase_chunks_768.payload.som_cluster
```

### Phase 107+: Optional POS Tagging (Token-Level Enrichment)

```
chunk_text
    ↓ [PyTorch POS Tagger] (optional, after classifier is stable)
pos_tags, token_boundaries
    ↓ [Postgres Write]
atlas_packets.metadata JSONB (NOT searchable)
    ↓ [Qdrant Mirror]
codebase_chunks_768.payload.pos_tags
```

---

## Qdrant Payload Schema (Complete)

```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "domain_class": "code",
  "title_id": "auth-sessions",
  "feature_label": "Authentication Sessions",
  "som_cluster": 5,
  "tree_node_id": "ast:file:auth.ts:function:validateSession:0",
  "embedding_model": "embeddinggemma/20260720",
  "domain_score": 0.92,
  "lexical_score": 0.80,
  "ast_score": 0.75,
  "created_at": "2026-07-20T22:30:45Z"
}
```

**Indexed Fields** (for fast filtering):
- `domain_class` (string index)
- `som_cluster` (numeric index)
- `feature_label` (text index)

**Non-Indexed Fields** (metadata only):
- `packet_key` (exact lookup in Postgres instead)
- `embedding_model` (audit only)
- `created_at` (timestamp)

---

## Storage Decision Tree

**Is it searchable via ANN?**
- YES → Use pgvector column or Qdrant vector field
- NO → Use JSONB or Qdrant payload

**Is it used for filtering/faceting?**
- YES → Use Qdrant payload with index, or Postgres JSONB with GIN
- NO → Use JSONB for audit/provenance only

**Is it required for retrieval ranking?**
- YES → Include in Qdrant payload (lexical score, ast score, domain score)
- NO → Store in Postgres JSONB only (model version, manifest, idempotency key)

**Is it temporary routing state?**
- YES → Use Redis (L1 cache) or Bitfrost semantic cache
- NO → Use Postgres for durable storage

---

## Implementation Checklist

### Phase 106 (Embedding Only)
- [x] Postgres: `content_embedding_768 vector(768)` column (pgvector)
- [x] Qdrant: named vector `content_768_dense` (COSINE distance)
- [x] Qdrant payload: `embedding_model`, `created_at` (metadata only)
- [x] No JSONB vectors: metadata in JSONB, vectors in pgvector

### Phase 107+ (Classifier)
- [ ] Postgres: `classifier_outputs JSONB` column
- [ ] Qdrant payload: `domain_class`, `domain_score`, `lexical_score`, `ast_score` (ranking hints)
- [ ] Python sidecar: scikit-learn LogisticRegression (not neural)
- [ ] Decision gate: 0.80 auto-accept, 0.55-0.80 provisional, <0.55 review

### Phase 107+ (Topology)
- [ ] Postgres: `latent_embedding_64 halfvec` column (routing only)
- [ ] Qdrant payload: `som_cluster`, `tree_node_id`
- [ ] cuGraph: PageRank from Neo4j topology (not from vectors)
- [ ] SOM: 20×20 grid from latent embeddings

### Phase 107+ (Optional POS Tagging)
- [ ] Postgres: `metadata JSONB` with pos_tags (non-searchable)
- [ ] Qdrant payload: `pos_tags` (ranking hints only)
- [ ] PyTorch POS tagger (only after classifier is stable)

---

## References

- [Qdrant Payload Docs](https://qdrant.tech/documentation/concepts/payload/)
- [Qdrant Named Vectors](https://qdrant.tech/documentation/concepts/vectors/#named-vectors)
- [Qdrant Indexing](https://qdrant.tech/documentation/concepts/indexing/)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [cuGraph PageRank](https://docs.rapids.ai/api/cugraph/stable/api_docs/algorithms.html#pagerank)
- [scikit-learn LogisticRegression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html)

