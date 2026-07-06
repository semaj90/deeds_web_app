# Packet Compiler Stages — Progressive Semantic Extraction

**Architecture**: Each stage outputs one semantic layer. No stage overwrites. All writes are **append-only** to `atlas_packet_features`.

---

## Dependency Chain (Sequential)

```
Repository (Code Files)
        │
        ▼
Stage 1: AST-Grep (Structural Extraction)
        │
        ├─→ ast_symbols[] (deterministic symbols)
        │   Example: [grpc_service, HealthCheck, Request, Response]
        │
        ▼
Stage 2: Lexical Pass (n-grams & identifiers)
        │
        ├─→ lexical_features[] (keywords, unigrams, bigrams, trigrams)
        │   Example: [grpc, proto, service, health, check]
        │
        ▼
Stage 3: LangExtract (Semantic Concepts)
        │
        ├─→ used_concepts[] (meaning, not syntax)
        │   Example: [rpc, streaming, distributed-system, authentication]
        │
        ▼
Stage 4: EmbeddingGemma (Dense Semantics)
        │
        ├─→ embedding768 (384-dim projected to 768)
        │   Built from: title + summary + concepts + symbols + keywords
        │
        ▼
Stage 5: PyTorch Autoencoder (Compression)
        │
        ├─→ latent64 (768 → 64 dimensions, MSE reconstruction)
        │
        ▼
Stage 6: KMeans (Global Clustering)
        │
        ├─→ kmeans_cluster (global cluster ID, 0-1000 range)
        │
        ▼
Stage 7: SOM 20×20 (Local Topology)
        │
        ├─→ som_row, som_col, som_cluster (400 centroids)
        │
        ▼
Stage 8: Neo4j GDS (Graph Authority)
        │
        ├─→ page_rank (PageRank score)
        ├─→ community_id (Louvain communities)
        ├─→ k_core_score (K-core decomposition)
        ├─→ betweenness (Betweenness centrality)
        ├─→ closeness (Closeness centrality)
        │
        ▼
Stage 9: cuVS / TurboVec (GPU ANN Prefilter)
        │
        ├─→ Top-K candidates by latent64 similarity
        │
        ▼
Stage 10: RRF (Multi-Signal Fusion)
        │
        ├─→ Unified candidate ranking
        │   0.35 Dense (Qdrant/cuVS)
        │   0.25 Lexical (BM25)
        │   0.20 Graph (PageRank + community)
        │   0.20 SOM locality
        │
        ▼
Stage 11: PyTorch Reranker (Learned Ranking)
        │
        ├─→ repair_probability (Top 50 → Top 10)
        │   Features: dense_sim, bm25, concept_overlap, ast_overlap, 
        │             domain_match, page_rank, community_match, som_distance
        │
        ▼
Stage 12: HMM Recommendation Engine (Pure Consumer)
        │
        ├─→ error_state (IDENTITY, STRUCTURE, LEXICAL, SEMANTIC, TOPOLOGY, VECTOR, QDRANT_BRIDGE)
        ├─→ repair_lane (ast_grep_extraction, langextract_concepts, etc.)
        ├─→ tool_call (atlas:phase1:tree-node:apply, etc.)
        │
        ▼
Stage 13: ACP (Action Control Plane)
        │
        ├─→ Emit repair jobs
        ├─→ Validate results
        ├─→ Update metrics
```

---

## `atlas_packet_features` Schema (Append-Only)

Each column populated exactly once by its responsible stage. Never overwritten.

```sql
CREATE TABLE atlas_packet_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key text NOT NULL UNIQUE,
  
  -- Stage 1: AST-Grep
  ast_symbols text[] DEFAULT '{}',
  
  -- Stage 2: Lexical
  lexical_features text[] DEFAULT '{}',
  
  -- Stage 3: LangExtract
  used_concepts text[] DEFAULT '{}',
  
  -- Stage 3+: Entity extraction (semantic frontends)
  entities text[] DEFAULT '{}',
  verbs text[] DEFAULT '{}',
  nouns text[] DEFAULT '{}',
  identifiers text[] DEFAULT '{}',
  imports text[] DEFAULT '{}',
  exports text[] DEFAULT '{}',
  functions text[] DEFAULT '{}',
  classes text[] DEFAULT '{}',
  routes text[] DEFAULT '{}',
  permissions text[] DEFAULT '{}',
  
  -- Stage 4: Embedding
  summary_keywords text[] DEFAULT '{}',
  embedding_version text,
  
  -- Metadata
  langextract_version text,
  astgrep_version text,
  
  concept_coverage real DEFAULT 0.0,
  
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes for retrieval
CREATE INDEX idx_atlas_packet_features_used_concepts_gin 
  ON atlas_packet_features USING gin (used_concepts);
CREATE INDEX idx_atlas_packet_features_ast_symbols_gin 
  ON atlas_packet_features USING gin (ast_symbols);
CREATE INDEX idx_atlas_packet_features_lexical_gin 
  ON atlas_packet_features USING gin (lexical_features);
```

---

## `atlas_packet_metrics` Schema (Derived)

Neo4j GDS + topology metrics. Separate table to avoid bloating `atlas_packet_features`.

```sql
CREATE TABLE atlas_packet_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_key text NOT NULL UNIQUE,
  
  -- Stage 6: KMeans
  kmeans_cluster int,
  
  -- Stage 7: SOM
  som_row int,
  som_col int,
  som_cluster text,
  
  -- Stage 8: Neo4j GDS
  page_rank real,
  community_id int,
  k_core_score real,
  betweenness real,
  closeness real,
  eigenvector real,
  cheirank real,
  
  -- Stage 11: Reranker
  repair_probability real,
  
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_atlas_packet_metrics_packet_key ON atlas_packet_metrics(packet_key);
CREATE INDEX idx_atlas_packet_metrics_pagerank ON atlas_packet_metrics(page_rank DESC);
CREATE INDEX idx_atlas_packet_metrics_som_cluster ON atlas_packet_metrics(som_cluster);
```

---

## Stage 1: AST-Grep (Structural Extraction)

**Input**: Code files  
**Output**: `ast_symbols[]` in `atlas_packet_features`  
**Script**: `scripts/atlas/phase1.5-ast-grep-extraction.mjs`  
**Example**:

```
Input: grpc.proto
  ├─ Service HealthCheck
  ├─ RPC: Check(HealthCheckRequest) → HealthCheckResponse
  ├─ Message HealthCheckRequest
  ├─ Enum ServingStatus
  └─ Comment: "Health check service for gRPC"

Output ast_symbols:
  [grpc_service, HealthCheck, Check, HealthCheckRequest, HealthCheckResponse, 
   ServingStatus, health_check_request, health_check_response]
```

---

## Stage 2: Lexical Pass (n-grams & Identifiers)

**Input**: Code files + ast_symbols  
**Output**: `lexical_features[]` in `atlas_packet_features`  
**Script**: `scripts/atlas/phase1.5-lexical-extraction.mjs`  
**Example**:

```
Input: grpc.proto + ast_symbols
Output lexical_features:
  [grpc, proto, service, health, check, rpc, request, response, 
   enum, message, distributed_system, communication]
```

---

## Stage 3: LangExtract (Semantic Concepts)

**Input**: Code summary + title + comments  
**Output**: `used_concepts[]` in `atlas_packet_features`  
**Script**: `scripts/atlas/phase3-langextract-concepts.mjs`  
**Example**:

```
Input: "Health check service for gRPC"
Output used_concepts:
  [rpc, streaming, distributed-system, fault-detection, 
   load-balancing, health-monitoring, service-mesh, authentication]
```

---

## Stage 4: EmbeddingGemma (Dense Semantics)

**Input**: `title + summary + concepts + symbols + keywords`  
**Output**: `embedding768` in `atlas_packets`  
**Script**: `scripts/atlas/phase5-embedding-generation.mjs`  
**Example**:

```
Input text:
  "Health Check Service for gRPC. Used for distributed fault detection.
   Concepts: [rpc, streaming, fault-detection, load-balancing]
   Symbols: [grpc_service, HealthCheck, Check]
   Keywords: [grpc, proto, service, health]"

Output:
  embedding768: Float32Array(768) via EmbeddingGemma
```

---

## Stage 5: PyTorch Autoencoder (Compression)

**Input**: `embedding768`  
**Output**: `latent64` in `atlas_packet_metrics`  
**Script**: `scripts/atlas/phase16-ae-compression.mjs`  
**Architecture**: 768 → 256 → 128 → 64 (MSE reconstruction, AdamW)  
**Why latent64**: Removes redundant dimensions, improves KMeans clustering

---

## Stage 6: KMeans (Global Clustering)

**Input**: `latent64` vectors  
**Output**: `kmeans_cluster` in `atlas_packet_metrics`  
**Script**: `scripts/atlas/phase16-kmeans-clustering.mjs`  
**Clusters**: 0-1000 global clusters

---

## Stage 7: SOM 20×20 (Local Topology)

**Input**: `latent64` vectors  
**Output**: `som_row, som_col, som_cluster` in `atlas_packet_metrics`  
**Script**: `scripts/atlas/phase16-som-topology.mjs`  
**Grid**: 400 centroids (20×20), Kohonen self-organizing map

---

## Stage 8: Neo4j GDS (Graph Authority)

**Input**: Code dependency graph + packet identity  
**Output**: `page_rank, community_id, k_core, betweenness, closeness, eigenvector` in `atlas_packet_metrics`  
**Script**: `scripts/atlas/phase4-neo4j-gds-metrics.mjs`  
**Algorithms**: PageRank, Louvain, K-Core, Betweenness, Closeness, Eigenvector

---

## Stage 9: cuVS / TurboVec (GPU ANN Prefilter)

**Input**: `latent64` vectors + query  
**Output**: Top-K candidates  
**Purpose**: Fast approximate nearest neighbors on GPU (RTX 3060 Ti)  
**Config**: IVF, HNSW, RaBitQ

---

## Stage 10: RRF (Multi-Signal Fusion)

**Input**: All previous stages' outputs  
**Output**: Unified candidate ranking  
**Weights**:
- 0.35 Dense similarity (Qdrant/cuVS on latent64)
- 0.25 Lexical (BM25 on lexical_features)
- 0.20 Graph (PageRank + Louvain on neo4j metrics)
- 0.20 SOM locality (som_distance)

---

## Stage 11: PyTorch Reranker (Learned Ranking)

**Input**: Top 50 candidates + their features  
**Output**: `repair_probability` (Top 50 → Top 10)  
**Features**:
- dense_sim (Qdrant similarity)
- bm25_score (Lexical ranking)
- concept_overlap (Jaccard on used_concepts)
- ast_overlap (Jaccard on ast_symbols)
- domain_match (Exact match on domain_class)
- page_rank (Neo4j authority)
- community_match (Same community ID)
- som_distance (Grid proximity)

---

## Stage 12: HMM (Pure Consumer)

**Input**: All packet features + metrics  
**Output**: `error_state + repair_lane + tool_call`  
**Script**: `scripts/atlas/phase8.8-hmm-semantic-compiler.mjs`  
**Never writes to**: `atlas_packet_features` or `atlas_packet_metrics`

**Error States**:
- IDENTITY_ERROR: missing packet_key / feature_id
- STRUCTURE_ERROR: missing ast_symbols
- LEXICAL_ERROR: missing lexical_features
- SEMANTIC_ERROR: missing used_concepts
- TOPOLOGY_ERROR: missing page_rank / som_cluster / community
- VECTOR_ERROR: missing embedding
- QDRANT_BRIDGE_ERROR: embedding exists, but not indexed

**Decision Logic** (Priority 1-7):
1. If no semantic evidence → SemanticError
2. Else if no ast_symbols → StructureError
3. Else if no embedding → VectorError
4. Else if embedding not indexed → QdrantBridgeError
5. Else if no topology → TopologyError
6. Else if no lexical → LexicalError
7. Else → COMPLETE (no repair needed)

---

## Stage 13: ACP (Action Control Plane)

**Input**: HMM recommendations  
**Output**: Execution of repair workflows  
**Workflow Example** (StructureError):
1. Queue: `atlas:phase1.5:ast-grep:apply` with packet list
2. Wait for completion (ast_symbols populated)
3. Update: `atlas_packet_features.astgrep_version`
4. Emit: NATS event `packet.ast-symbols.populated`
5. Next job: Re-run HMM to detect next layer of errors

---

## Validation Gates (per Stage)

| Stage | Gate | Metric | Target | Check |
|-------|------|--------|--------|-------|
| 1 (AST) | ast_symbols coverage | % non-empty | ≥95% | `COUNT(*) FILTER (WHERE array_length(ast_symbols, 1) > 0)` |
| 2 (Lex) | lexical_features coverage | % non-empty | ≥95% | Same |
| 3 (SE) | used_concepts coverage | % non-empty | ≥80% | Same |
| 4 (Emb) | embedding768 coverage | % non-null | ≥99% | `COUNT(*) WHERE embedding IS NOT NULL` |
| 5 (AE) | latent64 coverage | % non-null | ≥95% | Same |
| 6 (KM) | kmeans_cluster coverage | % assigned | ≥99% | Same |
| 7 (SOM) | som_cluster coverage | % assigned | ≥99% | Same |
| 8 (GDS) | page_rank coverage | % non-null | ≥95% | Same |
| HMM | error_state distribution | Entropy | < 2.0 bits | Multiple states represented |

---

## Canonical Execution Order (Sessions 106+)

```bash
# Session 106: Structural Layer
npm run atlas:phase1.5:ast-grep:apply          # Stage 1
npm run atlas:phase1.5:lexical:apply          # Stage 2

# Session 107: Semantic Layer
npm run atlas:phase3:langextract:apply        # Stage 3
npm run atlas:phase5:embedding:apply          # Stage 4

# Session 108: Compression & Topology
npm run atlas:phase16:ae:apply                # Stage 5
npm run atlas:phase16:kmeans:apply            # Stage 6
npm run atlas:phase16:som:apply               # Stage 7
npm run atlas:phase4:gds:apply                # Stage 8

# Session 109: Retrieval & Ranking
npm run atlas:phase16:turbovec:apply          # Stage 9
# (RRF, reranker in production ACE, not batch)

# Ongoing: HMM Monitoring
npm run atlas:phase8.8:hmm:dry                # Diagnostic
npm run atlas:phase8.8:hmm:apply              # Emit recommendations
```

---

## Key Principles

1. **Never overwrite**: Each stage appends one layer. No stage deletes or overwrites another stage's output.
2. **Deterministic identity**: `packet_key` is immutable, derived from `source_ref + directory_path`.
3. **Postgres is truth**: All writes go to Postgres first. Qdrant/Neo4j/Redis are mirrors.
4. **Stages are independent**: Stage 8 doesn't depend on Stage 7's output, only on its own input.
5. **HMM is a pure consumer**: It reads all stages, never writes to any feature table.
6. **Validation gates per stage**: Each stage has a measurable coverage target.

---

## Why This Works

- **Parallelizable**: Stages that don't have dependencies can run in parallel.
- **Debuggable**: Each stage has its own input/output contract. Easy to validate.
- **Reproducible**: Stages are deterministic. Re-run them and get identical results.
- **Maintainable**: Replacing one stage (e.g., swapping out Neo4j GDS for Rust graph-lib) doesn't affect others.
- **Scalable**: Each stage can be independently optimized or distributed.
- **Audit trail**: Every stage version is tracked (`astgrep_version`, `langextract_version`, etc.).
