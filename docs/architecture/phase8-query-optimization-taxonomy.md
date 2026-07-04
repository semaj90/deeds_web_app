# Phase 8 Query Optimization Taxonomy

## Community-Scoped Retrieval

This reference defines how Atlas should route queries across Postgres, BM25/lexical search, TurboVec, Qdrant, and Neo4j so that cluster organization stays stable and canonical IDs remain the source of truth.

## Canonical Identity Contract

Use stable IDs only.

```text
packet_id      = canonical UUID primary key
packet_ulid    = optional sortable workflow/event id
packet_key     = deterministic SHA-256 content identity
community_id   = Louvain / graph community index
som_row        = SOM grid row
som_col        = SOM grid column
feature_id     = ontology / domain grouping key
title_id       = semantic grouping key derived from summary meaning
source_ref     = canonical source path or module reference
```

Rules:

- Do not key caches on raw generated text.
- Do not use title_id or feature_id as primary keys.
- Do not mutate packet identity fields during rerank or cache warmup.
- Postgres remains canonical truth.
- Qdrant, Redis/BitFrost, Neo4j, and TurboVec are mirrors or accelerators.
- For cross-system joins in Qdrant, Neo4j, Redis, and ACP, prefer `packet_key` as the stable join key.
- `packet_id` stays the Postgres row identity.
- `packet_ulid` is optional workflow ordering, not semantic identity.

## 4D Topology Tuple

The linked-list tuple spine for topology-aware retrieval is:

```text
(packet_key, packet_id, source_ref, feature_id, title_id,
 community_id, som_row, som_col, cluster_id,
 latent_64, page_rank_score, canonical,
 supersedes[], superseded_by, created_at)
```

This gives the system four stable axes:

- X: `som_col`
- Y: `som_row`
- Z: `cluster_id` or SOM depth
- T: `created_at` plus `supersedes` lineage

Notes:

- `latent_64` is a vector field used by accelerators, not a single axis.
- `cluster_id` / SOM depth is the topology axis.
- Lineage remains `created_at` plus `supersedes` / `superseded_by`.

## Query Routing Taxonomy

### 1. Topology Gate

Use Postgres first when the query has a stable structural scope.

Best filters:

- `community_id = $1`
- `feature_id = $1`
- `source_ref = $1`
- `packet_key = $1`
- `som_row / som_col` neighborhood

If the query has no known community, source, or feature scope, start broader:

```text
Qdrant broad recall
  -> infer likely community_id / feature_id
  -> Postgres narrowed fetch
  -> TurboVec rerank
  -> Neo4j authority
  -> RRF
  -> ACE packet assembly
```

This is the fastest path for strict narrowing because it uses indexed equality or bounded range constraints before any semantic search.

### 2. Lexical Gate

Use BM25, FTS, or `pg_trgm` when the query is token-heavy, source-code-heavy, or exact wording matters.

Good for:

- function names
- symbols
- file paths
- comments
- noun / verb extraction

### 3. Semantic Gate

Use Qdrant dense vectors for general meaning search and cross-file similarity.

Use TurboVec for:

- ANN prefilter
- 768 -> 64 transform
- hot candidate rerank
- GPU/CPU topology-local clustering

### 4. Graph Gate

Use Neo4j when the query needs:

- PageRank
- community expansion
- dependency hops
- import/call/uses edges
- lineage traversal

### 5. HMM Control Gate

Use HMM when the problem is sequential state inference, not retrieval.

HMM should consume:

- user analytics
- error logs
- agent telemetry
- retry / failure sequences
- tool-call state transitions

HMM should emit:

- `error_class`
- `state_id`
- `repair_mode`
- `confidence`
- `ACE swap` candidate hints

HMM is not:

- ANN search
- semantic ranking
- vector compression
- canonical identity

Use HMM to:

- classify the likely failure mode
- choose the next repair packet
- trigger ACE packet swaps
- route recovery work into ACP / queue systems

Do not use HMM to:

- rank retrieval candidates
- generate embeddings
- define packet identity
- replace TurboVec, Qdrant, or Neo4j

## Recommended Retrieval Order

For most codebase queries:

```text
Postgres topology filter
  -> BM25 / lexical narrowing
  -> Qdrant dense candidates
  -> TurboVec prefilter / rerank
  -> Neo4j authority / neighborhood scoring
  -> RRF blend
  -> ACE packet assembly
```

For agentic error recovery:

```text
user analytics / logs
  -> HMM error-state classification
  -> canonical packet_key lookup
  -> BitFrost / open-memory recovery packet
  -> TurboVec / Qdrant candidate narrowing
  -> Neo4j authority / dependency hops
  -> ACE swap / repair packet
```

## Why `community_id` Matters

`community_id` is the first practical cut for graph-local retrieval.

Use it to:

- narrow candidate packets before ANN
- keep cluster members together in Neo4j projections
- warm BitFrost buckets by topology
- reduce expensive full-corpus candidate scans

If `community_id` is known, do not start with a full vector search unless you need broad recall.

## Neo4j Cluster Organization

Neo4j should organize around canonical packet fields, not raw generated summaries.

Suggested node and edge shape:

- `(:Packet { packet_key, packet_id, source_ref, feature_id, title_id, community_id })`
- `(:Community { community_id })`
- `(:Feature { feature_id })`
- `(:Title { title_id })`
- `(:SomCell { som_row, som_col })`

Suggested edges:

- `(:Packet)-[:IN_COMMUNITY]->(:Community)`
- `(:Packet)-[:HAS_FEATURE]->(:Feature)`
- `(:Packet)-[:HAS_TITLE]->(:Title)`
- `(:Packet)-[:IN_SOM_CELL]->(:SomCell)`
- `(:Packet)-[:SUPERSEDES]->(:Packet)`
- `(:Packet)-[:RELATED_CONCEPT]->(:Packet)`
- `(:Packet)-[:CALLS|IMPORTS|DEPENDS_ON]->(:Packet)`

## MapReduce Grouping Keys

Use these keys when reducing summarized packets into grouped packets and graph joins:

```text
emit(title_id, packet_key)
emit(feature_id, packet_key)
emit(community_id, packet_key)
emit(som_row:som_col, packet_key)
emit(source_ref, packet_key)
emit(ontology_label, packet_key)
```

Reduce by:

- `title_id`
- `feature_id`
- `community_id`
- `som_cell`
- `source_ref`

## Rerank Guidance

For `marco_rerank_chunks` and related packet scoring, use the following weighting contract as a default reference:

```text
0.35 Qdrant dense score
0.20 lexical / token overlap
0.20 LangExtract semantic score
0.15 AST-grep / code structure score
0.10 authority / provenance score
```

Use this ranking after the topology gate, not before it.

## Cache Rules

BitFrost keys should stay canonical:

- `bitfrost:packet:{packet_key}`
- `bitfrost:summary:{packet_key or chunk_id only if legacy lane requires it}`
- `bitfrost:feature:{feature_id}`
- `bitfrost:title:{title_id}`
- `bitfrost:som:{som_row}:{som_col}`
- `bitfrost:community:{community_id}`

Prefer `packet_key` for new canonical cache entries. Keep `chunk_id` only as a legacy compatibility fallback.

Do not build cache identity from raw generated summary text.

## Minimal SQL Shape

```sql
SELECT id, packet_key, source_ref, feature_id, title_id, community_id, som_row, som_col, page_rank_score
FROM atlas_packets
WHERE community_id = $1
ORDER BY page_rank_score DESC NULLS LAST, id
LIMIT 200;
```

## Minimal Cypher Shape

```cypher
MATCH (p:Packet {community_id: $community_id})
OPTIONAL MATCH (p)-[:HAS_FEATURE]->(f:Feature)
OPTIONAL MATCH (p)-[:HAS_TITLE]->(t:Title)
OPTIONAL MATCH (p)-[:IN_SOM_CELL]->(c:SomCell)
RETURN p, f, t, c
ORDER BY p.page_rank_score DESC
LIMIT 200;
```

## Practical Rule

If a query has a stable community or feature scope, narrow in Postgres first.  
If it is lexical, use BM25 next.  
If it is semantic, use Qdrant + TurboVec.  
If it needs authority or paths, use Neo4j.  
If it is an error-state / repair decision, use HMM first, then hand the bounded recovery packet back to retrieval.

This keeps Neo4j clusters organized around canonical packet lineage rather than around raw model output.

## Lexical Cluster Buckets

Use these buckets when generating cluster cards, ontology labels, or rerank features:

```text
nouns      -> domain objects, files, tables, concepts, packets
verbs      -> actions, mutations, transforms, queries, writes
adjectives -> qualifiers, states, severity, scope, stability
adverbs    -> modifiers, speed/quality hints, routing hints
code       -> functions, methods, imports, exports, symbols
data       -> rows, payloads, vectors, jsonb, tuples, envelopes
functions  -> AST-grep / tree-sitter function nodes
reranker   -> cross-encoder, TurboVec, Triton, XGBoost, policy rankers
semantics  -> title_id, feature_id, ontology_label, concept tags
topology   -> community_id, som_row, som_col, cluster_id, latent_64
lineage    -> packet_key, supersedes, superseded_by, created_at
```

## Domain Term Families

Use these families to keep SOM 20x20 clusters stable across related technical terms.
These are examples, not hard schema fields.

```text
networking -> quic, tcp, udp, grpc, websocket, http, rpc, transport
web        -> html5, css, dom, browser, ui, frontend, svelte, react
languages  -> javascript, typescript, python, go, rust, sql, shell
tooling    -> lsp, ast-grep, parser, tokenizer, formatter, analyzer
storage    -> postgres, jsonb, duckdb, qdrant, redis, valkey, index
graph      -> neo4j, community, pagerank, louvain, edge, node, lineage
compute    -> gpu, cuda, tensor, matmul, reranker, embedding, triton
workflow   -> rpc, acp, mcp, worker, queue, batch, retry, daemon
```

When a packet has a mixed domain, keep the primary family and one secondary family.
Examples:

- `quic` -> `networking`
- `ast-grep` -> `tooling`
- `html5` / `css` -> `web`
- `lsp` -> `tooling`
- `neo4j` / `pagerank` -> `graph`
- `qdrant` / `redis` -> `storage`
- `gemma4` / `turbovec` -> `compute`

### Suggested extraction order

1. Lexical terms from `rg`, `awk`, FTS, and summaries.
2. Structural terms from AST-grep and symbol extraction.
3. Semantic labels from LangExtract or summary parsing.
4. Topology labels from SOM, cluster, community, and PageRank data.
5. Rerank signals from Qdrant, TurboVec, and authority scores.

### Cluster card hint

If a packet is being grouped for Neo4j or SOM analysis, keep these fields together:

- `packet_key`
- `source_ref`
- `feature_id`
- `title_id`
- `community_id`
- `som_row`
- `som_col`
- `cluster_id`
- `page_rank_score`

That combination is the stable clustering spine. Summary text is useful, but it is not the grouping key.

## Production Readiness Audit

Use this audit before promoting any new retrieval, clustering, or semantic-rpc lane.

### Canonical first

- `Postgres` owns packet identity and lineage.
- `pgvector` owns the canonical semantic mirror.
- `Qdrant` owns ANN retrieval mirror data.
- `Redis/BitFrost` owns hot cache and bucket locality.
- `Neo4j` owns contextual trees and graph traversal only.

### Required readiness checks

1. Canonical IDs are present and stable:
   - `packet_id`
   - `packet_ulid`
   - `packet_key`
   - `feature_id`
   - `title_id`
   - `community_id`
   - `som_row`
   - `som_col`
2. Summary rows are clean and normalized before any label derivation.
3. Lexical, semantic, and topology labels are derived from the same packet envelope.
4. Qdrant payloads mirror canonical fields and do not invent identity.
5. BitFrost keys stay canonical and are not based on raw generated text.
6. Neo4j edge materialization is replayable from canonical packet records.
7. Rerank scores are explainable and traceable back to source features.

### Optional acceleration lanes

These lanes improve throughput, but they do not replace the canonical store:

```text
rg / awk / FTS
  -> AST-grep / symbol extraction
  -> LangExtract / semantic labels
  -> Postgres JSONB trees for local grouping
  -> pgvector multi-vector mirror
  -> TurboVec ANN sidecar
  -> Qdrant candidate retrieval
  -> ONNX / Gemma4 E2B reranker (optional)
  -> N-API / LibTorch CUDA bridge for matmul / kmeans / SOM / AE
  -> cuVS / CAGRA sidecar for ANN experiments
  -> xgradient / XGBoost / LibTorch rerank experiments
  -> Neo4j contextual trees
  -> semantic RPC packet assembly
  -> ACP / ACE / KAG / DAG call routing
```

Notes:

- `Postgres JSONB trees` are useful for fast structural grouping and audit queries.
- `Neo4j contextual trees` should be projected from canonical packets, not used as the source of truth.
- `ONNX / Gemma4 E2B rerankers` should sit behind the canonical rerank contract, not define identity or cache keys.
- `N-API / LibTorch` is the practical lane for batch matmul, K-means, SOM, and autoencoder training.
- `cuVS / CAGRA` is the high-speed ANN experiment lane; use it after the Qdrant contract is stable.
- `xgradient` should be treated as a downstream rerank or clustering experiment unless it is benchmarked and promoted.
- `TurboVec ANN sidecar` should stay a retrieval accelerator, not a canonical store.
- `semantic RPC packets` should be derived from packet identity and labels, never from raw generation text.

### Suggested accelerator split

Use this split when deciding where a component belongs:

```text
N-API / LibTorch:
  matmul, cosine batch scoring, kmeans, SOM 20x20, AE train, latent bytea export

ONNX Runtime:
  Gemma4 E2B rerank helper, classification heads, score normalization, label validation

cuVS / TurboVec:
  ANN prefilter, candidate narrowing, 768 -> 64 transform experiments, topology-local search

Postgres / JSONB:
  canonical packet tree, lineage, grouped tuple joins, durable audit rows

Redis / BitFrost:
  hot centroids, packet/title/feature buckets, SOM cell buckets, cache locality hints

Neo4j:
  contextual trees, multi-hop edges, tree_node_id / relationship traversal, PageRank
```

### Storage mapping for derived outputs

- `latent bytea` and `centroid bytea` belong in Postgres or a durable blob side table.
- `tree_node_id` should come from the graph/topology layer, not from the raw model output.
- Qdrant fusion tags should mirror the canonical packet envelope and cluster metadata.
- Redis centroids should be treated as hot cache and scheduling hints, not as the canonical cluster record.

### Minimal promotion rule

Do not promote a lane unless it can prove all of the following:

- same input produces the same canonical envelope
- cache hits are keyed by stable identity
- rerank output is reproducible
- topology projection can be replayed
- Postgres remains the source of truth

### Promotion checklist

| Lane | Gate | Pass condition |
|---|---|---|
| Postgres / pgvector | Canonical identity | `packet_id`, `packet_ulid`, `packet_key`, `feature_id`, `title_id`, `community_id` are present and stable |
| AST-grep / LangExtract | Structural + semantic labels | Functions, nouns, verbs, concepts, and relationship hints are derivable from the same packet envelope |
| BitFrost / Redis | Hot cache locality | Keys are stable (`packet_key`, `feature_id`, `title_id`, `som_row:som_col`) and do not depend on raw generated text |
| Qdrant | ANN mirror | Payload mirrors canonical packet fields and vector dimension matches the live embedding contract |
| TurboVec / cuVS | Accelerator only | ANN or transform results improve latency without changing canonical output shape |
| N-API / LibTorch | Numeric acceleration | Matmul, K-means, SOM, or AE outputs match CPU validation within tolerance |
| ONNX / Gemma4 E2B | Optional rerank helper | Score or label output is consistent, reproducible, and does not become identity |
| Neo4j | Contextual tree projection | Edges can be replayed from canonical packets and produce the expected `tree_node_id` / PageRank structure |
| Semantic RPC | Transport envelope | RPC packets carry canonical IDs and labels, not raw generation text |
| XGBoost / xgradient | Experimental rerank lane | Benchmark shows a clear win against the current rerank baseline before promotion |

### Algorithm readiness matrix

This is the current repo-level audit, not a vendor promise.

| Algorithm / lane | Status | Notes |
|---|---|---|
| Semantic indexing spine (`pgvector`, Qdrant, TurboVec, AST-grep, LangExtract) | READY | Canonical indexing, candidate retrieval, and semantic labeling are represented in docs and code. |
| ACP / ACE packet assembly | READY | Packet assembly, cache packets, and routing envelopes exist in the current ACE surfaces. |
| gRPC transport | READY | Embedding, retrieval, and cuVS bridges are already documented and wired as service boundaries. |
| SSE streaming | READY | Multiple streaming routes exist for graphify, agent, evidence, and inference flows. |
| HMM repair-state inference | PARTIAL | HMM exists as an error-state classification layer for contract/audit repair, not as a separate production inference service. |
| N-API / LibTorch CUDA acceleration | READY | Matmul, cosine, K-means, SOM, AE, and graph similarity bridges are present. |
| cuVS / CAGRA ANN sidecar | STAGED | Strong docs and implementation checklist exist, but treat as an accelerator lane until benchmarked live. |
| ONNX / Gemma4 E2B rerank helper | STAGED | Useful as an optional rerank helper; do not promote it to identity or canonical summary logic. |
| XGBoost / xgradient reranker | STAGED | Training and serve paths exist, but promotion should wait for benchmark and gate success. |
| Neo4j contextual trees | READY | Graph projection and traversal are documented; keep it downstream of canonical packet records. |
| Postgres JSONB trees | READY | Good for local structural grouping and audit replay. |

### Transport and orchestration matrix

| Lane | Status | Role | Primary script / surface |
|---|---|---|---|
| simdjson bridge | READY | Fast JSON parse for SSE, fanout, and cached payload decode | `sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.ts` |
| gRPC / protobuf | READY | Typed packet transport between retrieval, embedding, and sidecar lanes | `scripts/atlas/align-grpc-proto-to-postgres-indexes.mjs` |
| RabbitMQ pub/sub | READY | Work queue / bounded fanout / worker coordination | `phase7:worker:cluster:4`, `align-grpc-proto-to-postgres-indexes.mjs` |
| ACP orchestration | READY | Async packet/task coordination and retry metadata | `scripts/atlas/audit-acp-packet-transport.mjs` |
| async/await worker flow | READY | In-process orchestration for bounded batch workers | `scripts/atlas/phase7-gemma4-worker-patched.mts` |
| SSE progress streams | READY | UI progress and long-running job telemetry | `src/routes/api/**/stream/+server.ts` |
| TensorRT bridge | STAGED | GPU tensor acceleration for rerank / matmul / kernel work | `simd-bridge/cpp/build/Release/tensorrt_bridge.node` |
| TurboVec sidecar | READY | ANN prefilter / topology-local candidate narrowing | `scripts/atlas/turbovec-grpc-health.mjs` and sidecar probes |
| Qdrant mirror | READY | Dense vector mirror and payload filters | `atlas:embedding-qdrant-turbovec:test` |

### Fanout readiness after summaries

With summaries complete, the next activation order is:

1. Sanitize and verify summaries.
2. Rank and materialize semantic envelopes.
3. Warm BitFrost on canonical packet identity.
4. Validate gRPC / protobuf and RabbitMQ transport.
5. Run TurboVec / Qdrant fanout proofs.
6. Promote Neo4j topology and downstream agentic routing.

Suggested command sequence:

```powershell
npm run atlas:summary-sanitizer:hardened:test
npm run atlas:summary-layer:clean
npm run atlas:summary-surface:verify
npm run atlas:summary:index:rank:apply
npm run atlas:summary:envelopes:build:apply
npm run atlas:bitfrost-semantic-cache:warm:apply
npm run atlas:bitfrost-semantic-cache:audit
npm run atlas:embedding-qdrant-turbovec:test
npm run atlas:gpu-retrieval-summary-fanout:test
```
