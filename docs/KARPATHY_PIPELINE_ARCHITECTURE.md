# Karpathy GPU Pipeline Architecture

Comprehensive technical specification for the Deeds Web App intelligence stack.

## 1. Dual-Lane Architecture

The system is split into two specialized pipelines to ensure maximum performance and separation of concerns.

### A. Embeddings / Indexing Lane (Ollama)
*   **Model**: `embeddinggemma:latest` via Ollama `/api/embed`.
*   **Purpose**: Building long-term memory, vector search, and topological mapping.
*   **Flow**:
    1.  **Notecards/Chunks**: Stable units of code or documentation.
    2.  **Embedding Generation**: Ollama computes 768-dim vectors.
    3.  **Cache Vectors**: Redis stores `text_hash -> vector` for instant reuse.
    4.  **Autoencode / k-means / Graph Rank**: GPU-accelerated organizational logic.
    5.  **Storage**: Postgres (pgvector) + Qdrant (dense ANN).
    6.  **Retreival**: MCP tools provide secure, schema-aware access.
    7.  **Output**: Context-packed `chunk_id` bundles for the generation lane.

### B. Generation Lane (llama-server)
*   **Model**: `Gemma4` / `Qwen` via `llama-server`.
*   **Inference Tech**: KV Cache / TurboQuant / Bitfrost.
*   **Purpose**: Reasoning over retrieved context, answer generation, and plan synthesis.
*   **Flow**:
    1.  **Context Pack**: Input from MCP retrieval tools (with `chunk_id` citations).
    2.  **Inference**: llama-server generates response tokens.
    3.  **KV Optimization**: TurboQuant maintains large context windows in VRAM.
    4.  **Output**: Final answer, fix plan, or architectural recommendation.

---

## 2. Storage & Caching Matrix

| Backend | Data Type | Role |
| :--- | :--- | :--- |
| **Redis** | `text_hash` → Embedding | Exact vector cache, hot query results. |
| **Bitfrost** | Semantic Cache | Caches similar prompts/answers and context summaries. |
| **Qdrant** | Dense ANN | Fast vector search over chunks/notes with payload filters. |
| **Postgres + pgvector** | SQL Mirror | Durable storage, metadata joins, SQL-filtered vector queries. |
| **llama-server KV** | Volatile Cache | Generation-time token memory (not durable storage). |

---

## 3. The Chunk Identity Spine

Every piece of information follows a unified identification protocol to enable seamless cross-backend joins.

**`chunk_id`**
→ `text_hash` (content integrity)
→ `embedding_id` (vector tracking)
→ `qdrant_point_id` (search point)
→ `pgvector_row` (SQL record)
→ `cluster_id` (topological group)
→ `hypergraph_edges` (relationship map)
→ `ACE_context_item` (RAG unit)
→ `Gemma4_answer_citation` (final output)

### Example Metadata (JSON)
```json
{
  "packet_key": "packet:card:src/hooks.server.ts:09dd0811f209",
  "chunk_id": "card:src/hooks.server.ts:09dd0811f209",
  "text_hash": "sha256:...",
  "kb_snapshot_hash": "sha256:...",
  "source_path": "src/hooks.server.ts",
  "canonical_source_ref": "src/hooks.server.ts",
  "source_ref": "src/hooks.server.ts#default",
  "source_ref_key": "src/hooks.server.ts#default",
  "feature_id": "hooks.server",
  "feature_label": "hooks.server.ts",
  "domain_class": "auth",
  "ontology_label": "auth_pipeline",
  "topology_label": "web_entrypoint",
  "community_id": "auth",
  "cluster_key": "server-entry",
  "som_cluster": 42,
  "community_confidence": 0.91,
  "qdrant_point_id": "144288",
  "qdrant_collection": "codebase_chunks_768",
  "redis_centroid_key": "centroid:auth",
  "tags": ["auth", "redis", "qdrant", "db", "llm"],
  "ace_tags": ["auth", "cache", "retrieval"],
  "risk_score": 0.297,
  "embedding_model": "embeddinggemma:latest",
  "embedding_dim": 768
}
```

### Multihop Summary Envelope

For multihop traversal, the summary layer should preserve the same identity spine and persist the traversal labels used by Neo4j/GDS, Redis centroids, and Qdrant mirrors:

- `packet_key`
- `source_ref`
- `source_ref_key`
- `feature_id`
- `feature_label`
- `domain_class`
- `ontology_label`
- `topology_label`
- `summary_packet_key`
- `community_id`
- `som_cluster`
- `qdrant_point_id`
- `redis_centroid_key`

These fields are searchable metadata, not identity replacements. The canonical truth remains Postgres packet and summary tables.

## Karpathy Metadata Contract

Each indexed code chunk should carry enough metadata to support deterministic retrieval, topology expansion, reranking, and replay learning.

### Required Metadata
```json
{
  "packet_key": "packet:card:src/hooks.server.ts:09dd0811f209",
  "chunk_id": "card:src/hooks.server.ts:09dd0811f209",
  "text_hash": "sha256:...",
  "kb_snapshot_hash": "sha256:...",
  "source_path": "src/hooks.server.ts",
  "source_ref": "src/hooks.server.ts#handle",
  "source_ref_key": "src/hooks.server.ts#handle",
  "symbol": "handle",
  "kind": "hooks",
  "feature_id": "auth.session.middleware",
  "feature_label": "Session Middleware",
  "domain_class": "authentication",
  "ontology_label": "auth_pipeline",
  "topology_label": "web_entrypoint",
  "tags": ["auth", "redis", "qdrant", "db", "llm"],
  "risk_score": 0.297,
  "embedding_model": "embeddinggemma:latest",
  "embedding_dim": 768,
  "summary_version": "gemma4-v1",
  "policy_model_version": "policy-reranker-v1"
}
```

### Storage Mapping

- `Postgres atlas_packets` = truth, packet identity, metadata, summaries, replay state.
- `Postgres atlas_summary_layers` = stored summary layer and summary metadata envelope.
- `Qdrant` = semantic mirror, vector search, payload filters.
- `Neo4j` = topology mirror, imports/calls/feature graph.
- `Valkey / BitFrost` = hot cache, packet lookup, SOM cell cache, replay hints.
- `.pt` artifacts = learned structures: policy, SOM codebook, autoencoder, centroids.

### Retrieval Use

This metadata enables:

```text
query
  ↓
intent decomposition
  ↓
Qdrant content/summary/signature search
  ↓
metadata filter by feature_id/domain/tags/risk
  ↓
Neo4j expansion by source_path/symbol/imports
  ↓
Karpathy rerank
  ↓
policy-reranker.pt score
  ↓
ACE packet assembly
  ↓
Gemma4 synthesis
```

### Karpathy Rerank Score

```text
karpathy_score =
  0.25 * semantic_similarity
+ 0.20 * summary_similarity
+ 0.15 * authority_score
+ 0.10 * risk_score
+ 0.10 * topology_score
+ 0.10 * replay_reward
+ 0.05 * recency_score
+ 0.05 * cache_hit_score
```

Final displayed rank should be normalized to 0-100%.

### Snapshot Rule

Every packet must include:

- `text_hash`
- `kb_snapshot_hash`
- `embedding_model`
- `embedding_dim`
- `summary_version`
- `policy_model_version`

This prevents stale embeddings, stale summaries, and replay contamination.

### Agentic OS Use

At VS Code startup or idle time:

```text
scan recent logs
  ↓
map errors to packets
  ↓
query indexed summaries
  ↓
rank likely blockers
  ↓
create Kanban tasks
  ↓
write RLM replay events
  ↓
warm BitFrost cache
```

### Status Labels

- `CREATED` = metadata exists
- `WIRED` = searchable through Postgres/Qdrant/Neo4j
- `PROVEN` = proof command returned expected packet/rank
- `DONE` = replay/eval confirms improvement

---

## 4. Organizational Layer: Autoencode + k-means

GPU-accelerated clustering organizes the latent space into navigable regions.

1.  **Embedding Vectors** (Float32[768])
2.  **PCA / Autoencoder** (Optional dimensionality reduction)
3.  **GPU k-means** (`clusterEmbeddings` kernel)
4.  **Cluster IDs** (`cluster_id` / `som_cluster`)
5.  **Persistence**: Written to Postgres payload and Qdrant metadata.

**Use Cases**:
*   Detecting duplicate documentation.
*   Mapping codebase "regions" for visual navigation.
*   Recommending related files during a fix.
*   Compressing context by selecting representative chunks from clusters.

---

## 5. PostgreSQL Mirroring (pgvector)

The `codebase_chunk_index` table enables powerful hybrid queries:

```sql
SELECT relative_path, summary
FROM codebase_chunk_index
WHERE kind = 'route'
  AND semantic_tags @> ARRAY['auth']
ORDER BY summary_embedding <=> :query_embedding
LIMIT 10;
```

---

## 6. MCP Retrieval Flow

Agents do not access raw vectors; they use structured MCP tools.

1.  **`kb.search_cards(query, filters)`**: Returns ranked top cards.
2.  **`kb.get_card(card_id)`**: Retrieves full card metadata.
3.  **`kb.expand_neighbors(card_id)`**: Explores hypergraph/code neighbors.
4.  **`kb.explain_retrieval(query)`**: Provides reasoning for the selection.

---

## 7. CUDA Audit & GPU Wiring (May 2026)

### Hardware: RTX 3060 Ti (8 GB GDDR6)
### LibTorch: 2.9.0+cu130

| Kernel | File | Status | Purpose |
| :--- | :--- | :--- | :--- |
| `graphSimilarity` | `libtorch_graph.cc` | Hardened | Pairwise similarity for graph nodes. |
| `clusterEmbeddings` | `libtorch_graph.cc` | Partially fixed | GPU k-means clustering. |
| `batchCosineSimilarity` | `libtorch_graph.cc` | New | Optimized 1:N query reranking. |
| `graphSimilarityHalf` | `libtorch_graph.cc` | New | FP16 path for large-set clustering. |
| `getCudaMemory` | `libtorch_graph.cc` | New | VRAM OOM guard monitoring. |

---

## 8. Build Order (Best Practice)

1.  **Stable Notecards**: Validate `graph_file_cards.jsonl` and `rank.json`.
2.  **Embedding Jobs**: Generate jobs without network dependency.
3.  **Runner**: Ollama `/api/embed` + Redis Cache + Qdrant/Postgres Upsert.
4.  **Clustering**: GPU k-means + cluster_id writeback.
5.  **MCP Tools**: Implement `kb.*` tools.
6.  **ACE Context**: Integrate sparse + dense + hypergraph ranking.
7.  **Generation**: Optimize llama-server (q8_0) + TurboQuant/Bitfrost.
