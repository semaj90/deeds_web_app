# Parent Atlas cuVS / Agentic Retrieval Alignment

Date: 2026-07-26
Status: `SEMANTIC_INFRASTRUCTURE_PARTIALLY_IMPLEMENTED`

## Current Status Classification

- `OKF_EXPORT_LOAD_PATHS_PRESENT`
- `HYPERRAG_ROUTES_PRESENT`
- `PACKET_SCHEMAS_PRESENT`
- `ZOD_VALIDATION_PRESENT`
- `IDENTITY_UTILITIES_PRESENT`
- `TOPOLOGY_FEATURE_LANES_PRESENT`
- `CANONICAL_CONTRACT_NOT_YET_UNIFIED`
- `CROSS_LAYER_IDENTITY_NOT_YET_PROVEN`
- `RUNTIME_VALIDATION_PARTIAL`
- `END_TO_END_EXECUTION_PROOF_PENDING`

## Goal

Align the existing Parent Atlas stack around one retrieval and indexing contract that supports:

- canonical Postgres packet identity
- typed semantic packets
- KAG and HyperRAG evidence-chain execution
- Qdrant multivector retrieval mirrors
- Neo4j topology expansion and explanation
- Redis centroid and packet hot-cache acceleration
- cuVS / RAPIDS offline and prefilter acceleration
- LangExtract / AST / ontology / classifier enrichment
- MCP tool calling and agentic workflow execution

This is an alignment pass, not a greenfield plan. The repo already contains many of the needed pieces.

## Existing First-Party Assets Confirmed

- cuVS / RAPIDS readiness:
  - `scripts/bootstrap-wsl2-rapids.sh`
  - `scripts/bootstrap-wsl2-rapids.ps1`
  - `scripts/bench/bench-stage3-cuvs.mjs`
  - `scripts/atlas/audit-turbovec-cuvs-readiness.mjs`
- sparse and hybrid retrieval:
  - `scripts/backfill-canon-sparse.mjs`
  - `sveltekit-frontend/docs/obsidian-vault/Files/src__lib__server__vector__bm42-sparse.md`
  - `src/lib/server/retrieval/unified-orchestrator.ts`
- ontology and LangExtract:
  - `scripts/atlas/classify-domain-ontology.mjs`
  - `scripts/atlas/generate-ontology-tuples.mjs`
  - `scripts/atlas/materialize-registry-ontology-tuples.mts`
  - `scripts/atlas/langextract-entity-bridge.mjs`
  - `scripts/atlas/langextract-enrichment-worker.mjs`
  - `scripts/atlas/langextract-feature-labels-step5.mjs`
- topology and graph:
  - `scripts/atlas/compute-pagerank-neo4j-v2.mjs`
  - `scripts/atlas/compute-louvain-neo4j.mjs`
  - `scripts/atlas/neo4j-cluster-fanout.mjs`
  - `scripts/atlas/export-neo4j-topology-evidence.mjs`
  - `sveltekit-frontend/src/lib/server/topology/pagerank-contract.ts`
- vector and Qdrant mirror work:
  - `scripts/atlas/build-qdrant-384-hnsw.mts`
  - `scripts/atlas/enrich-qdrant-packet-payload.mjs`
  - `scripts/atlas/enrich-qdrant-som-payload.mts`
  - `scripts/atlas/backfill-qdrant-payload-upsert.mjs`
  - `scripts/atlas/fix-qdrant-named-vectors.mjs`
- offline processing and transport:
  - `scripts/atlas/build-arrow-source-map.mjs`
  - `scripts/atlas/arrow-batch-export.mjs`
  - `scripts/atlas/materialize-mapreduce-duckdb.mjs`
  - `scripts/atlas/ingester/prepare_duckdb_inputs.mjs`
  - `scripts/atlas/ingest-msgpack-chunks.mjs`
- workflow and agentic seams:
  - `scripts/atlas/daily-graphify-mastra-workflow.mjs`
  - `scripts/atlas/phase1-file-understanding-mastra.mjs`
  - `scripts/atlas/agentic-recommendation-workflow.mjs`
  - `sveltekit-frontend/src/mcp/trace-mcp-server.ts`
- packet, ontology, and validation seams already present:
  - `.okf/manifest.yaml`
  - `.okf/systems/hyperrag.md`
  - `docs/deep-research-task-schema.okf.yaml`
  - `docs/contracts/latent64.okf.json`
  - `config/vector-lanes.schema.json`
  - `src/routes/api/export/okf/+server.ts`
  - `src/lib/server/export/okf-serializer.ts`
  - `sveltekit-frontend/src/lib/server/okf/mastra-workflows.okf.yaml`
  - `sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts`
  - `src/lib/server/ingest/ingest-packet-schema.ts`
  - `src/lib/server/atlas/ace-kag-dag-evidence-schema.ts`
  - `sveltekit-frontend/src/lib/server/ontology/packet-ontology.schema.ts`
  - `sveltekit-frontend/src/lib/server/identity/ulid.ts`
  - `sveltekit-frontend/src/lib/server/hyperrag/hyperrag-projection-contract.ts`
  - `sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts`
  - `sveltekit-frontend/src/routes/api/atlas/hyperrag-packet-rpc/+server.ts`
  - `src/lib/server/topology/feature-tracking-layer.ts`

## Canonical State Rules

Keep these boundaries strict:

- PostgreSQL 18 is canonical for:
  - `packet_key`
  - `source_ref`
  - `title_id`
  - `feature_id`
  - `tree_node_id`
  - revision lineage
  - ontology tuples
  - semantic facts and fact participants
  - validation results
  - classifier decisions
  - evidence tuples
  - packet manifests
- Qdrant is a rebuildable multivector mirror:
  - searchable vectors
  - retrieval payload hints
  - not canonical identity truth
- Neo4j is a rebuildable topology projection:
  - `CALLS`
  - `IMPORTS`
  - `DEFINES`
  - `community_id`
  - `pagerank`
  - fanout explanation paths
- Redis / Valkey is hot acceleration only:
  - centroid cache
  - packet cache
  - query cache
  - cuVS index metadata
- SeaweedFS is immutable object storage for large artifacts:
  - Arrow snapshots
  - msgpack batches
  - autoencoder and clustering artifacts

## KAG / HyperRAG Execution Shape

Treat this as a KAG + HyperRAG execution system, not merely another dense-search pipeline.

The missing abstraction is the typed semantic packet that binds together:

- source evidence
- ontology entities and constraints
- embeddings
- hypergraph facts
- executable tool intent
- validation state
- storage and transport identities

Target execution flow:

- source code, docs, events, and database rows
- structural extraction
- semantic packet materializer
- canonical PostgreSQL truth and validation ledger
- Qdrant dense, sparse, and multivector retrieval mirrors
- Neo4j and hypergraph projection
- Redis or Valkey hot routing state
- Arrow or mmap artifacts for batch analytics and GPU evaluation
- query semantic compilation
- centroid router
- hybrid candidate generation
- evidence-chain construction
- tool-call proposal
- ontology and state-machine validator
- authorized MCP or Mastra execution

The ontology is not another retriever. It is the layer that decides whether a retrieved fact or proposed action is structurally valid.

Current repo truth:

- `.okf` already exists and is not hypothetical
- Zod runtime validation already exists in multiple packet and retrieval contracts
- HyperRAG packet routes and contracts already exist
- `title_id` and `tree_node_id` are already treated as required in some topology paths
- ULID support already exists for ordered identity generation

The remaining work is to reconcile these seams into one versioned semantic-packet, hypergraph-fact, feature-matrix, and validation-envelope contract, then prove that contract across ingestion, storage, retrieval, graph projection, RPC, and agent execution.

## Canonical Contract Boundary

The next promoted artifact should define four related contracts rather than one oversized object:

- `SemanticPacketV1`
  - retrievable semantic evidence unit
  - canonical identity, content lineage, ontology resolution, evidence state, and representation references
- `HypergraphFactV1`
  - n-ary semantic relationship or execution fact
  - participants, role bindings, evidence spans, ontology version, and authority
- `FeatureMatrixRowV1`
  - model, retrieval, routing, topology, ontology, and classifier inputs
  - derived row keyed back to the canonical packet, not canonical truth
- `ContractValidationResult`
  - packet or fact admissibility envelope
  - schema version, validator version, identity, and violation list

## Identity and Packet Contract

Use one identity spine across all lanes:

- `packet_key`: canonical packet identity
- `source_ref`: canonical source identity, one source can map to many packets
- `title_id`: stable title or document grouping identity
- `feature_id`: semantic feature assignment
- `tree_node_id`: structural identity for symbol / AST node
- `qdrant_point_id`: vector mirror identity only
- `community_id`: graph topology grouping only
- `kmeans_cluster_id`: geometric routing only
- `som_cell_id`: topology map only

Recommended ID rules:

- `packet_key`
  - deterministic hash-based identity from canonical source, span, and extractor version
- `source_ref`
  - canonical path or source location, not immutable identity by itself
- `title_id`
  - stable logical grouping for one-to-many packet rollups
- `tree_node_id`
  - stable structural identity for parser-backed nodes or symbols
- `uuid`
  - relational primary keys and externally referenced durable rows
- `ulid`
  - ordered event, run, trace, and packet-materialization instance IDs

Identity policy must stay explicit:

- `packet_key`
  - deterministic canonical packet identity
- `tree_node_id`
  - parser-owned structural identity
  - nullable for non-AST documents or records
- `title_id`
  - grouping identity only
  - must not replace packet identity
- `uuid`
  - interoperability identifier where UUID form is required
- `ulid`
  - sortable identity for runs, facts, revisions, events, and ledgers
- `content_hash`
  - immutable version identity for the actual content revision
- `source_ref`
  - human-readable source location
  - not immutable identity by itself

Keep semantic resolution separate from runtime validity:

- `EvidenceState`
  - `ACTIVE_VERIFIED`
  - `ACTIVE_DEGRADED`
  - `GATED`
  - `REFERENCE_ONLY`
  - `SUPERSEDED`
  - `FAILED`
- `KnowledgeResolution`
  - `RESOLVED`
  - `UNCLASSIFIED`
  - `AMBIGUOUS`
  - `ONTOLOGY_GAP`
  - `CONFLICTING_EVIDENCE`

Recommended packet envelope in Postgres:

```json
{
  "schema_version": "atlas.packet.v1",
  "packet_key": "pkt_...",
  "source_ref": "src/lib/server/retrieval/...",
  "feature_id": "feature_hybrid_code_search",
  "tree_node_id": "ts:function:hybridSearch:...",
  "summary": "Combines dense and sparse retrieval and reranks candidates.",
  "domain_class": "retrieval",
  "feature_label": "hybrid-code-search",
  "ontology_labels": ["retrieval", "ranking", "semantic-search"],
  "evidence_state": "ACTIVE_VERIFIED",
  "payload": {
    "structural": {},
    "semantic": {},
    "topology": {},
    "routing": {},
    "classification": {}
  }
}
```

Do not collapse topology, routing, and classification into one generic cluster field.

Recommended validation layers for the packet contract:

- `.okf`
  - ontology and feature-rule source of truth
- JSON Schema
  - transport and cross-language validation contract
- Zod
  - TypeScript runtime validation contract
- database constraints
  - canonical final gate

Current repo truth:

- `src/lib/server/ingest/ingest-packet-schema.ts` already provides a packet-oriented Zod contract
- `src/lib/server/atlas/ace-kag-dag-evidence-schema.ts` already provides KAG/DAG evidence validation
- `sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts` already validates an OKF workflow schema with Zod

So the unresolved step is not whether validation exists. It is whether these validators are aligned to one canonical semantic-packet and hypergraph-fact contract.

## Reconciliation Ownership Table

- root `.okf` manifest
  - canonical declarative source
- runtime `.okf` loader
  - generated or validated projection of the canonical source
- export route and serializer
  - serialization boundary
- Mastra loader
  - runtime consumer
- HyperRAG routes and projection contract
  - consumers of resolved packet, ontology, and fact contracts
- packet schemas and identity helpers
  - shared contract and identity spine
- topology modules
  - feature-matrix topology family only
- Qdrant payload upserts
  - rebuildable projection of canonical packet metadata and vectors
- Redis / Valkey packet and centroid cache
  - derived cache only, never canonical identity truth

## Hypergraph Fact Contract

Do not reduce all meaning to binary graph edges when the fact is n-ary.

Use HyperRAG-style semantic facts for events and execution constraints that bind several participants into one fact record.

Recommended relational split in Postgres:

- `semantic_packets`
- `semantic_facts`
- `semantic_fact_participants`
- `semantic_fact_evidence`
- `ontology_constraints`

Neo4j can project these facts for reasoning and traversal, but canonical fact truth stays in Postgres.

Current repo truth:

- HyperRAG and KAG packet seams already exist in routes and contracts
- there are existing schema families for `kag-dag`, packet topology, atlas packets, and route runtime packets
- the remaining gap is a single promoted relational fact model rather than several adjacent packet and projection schemas

## JSONB vs GIN

Use Postgres `jsonb` for flexible evidence and packet payload metadata, but keep hot filter keys as typed columns when they are core retrieval selectors.

Recommended split:

- typed columns:
  - `packet_key`
  - `source_ref`
  - `feature_id`
  - `tree_node_id`
  - `domain_class`
  - `feature_label`
  - `community_id`
  - `kmeans_cluster_id`
  - `som_cell_id`
  - `qdrant_point_id`
- `jsonb` payload:
  - classifier evidence
  - ontology tuples
  - sparse token stats
  - extraction metadata
  - model versions
  - provenance

Recommended indexes:

- btree:
  - `source_ref`
  - `feature_id`
  - `tree_node_id`
  - `domain_class`
  - `feature_label`
- GIN on `payload jsonb_path_ops`
- partial GIN only where query patterns prove useful

Do not store raw 384-dim or larger dense vectors in `jsonb` for online retrieval.

## Feature Matrix Contract

Do not frame the system as only `384` versus `768`.

Use an explicit decomposed feature matrix:

- `dense_768`
  - canonical native semantic representation
  - current `embeddinggemma` full representation preserved for lineage, compatibility, and recall benchmarking
- `dense_384`
  - canonical online retrieval representation
  - accepted truncated `embeddinggemma` projection
  - only valid when projection lineage, normalization, and producer version are explicit
- `latent_64`
  - routing and clustering lane
  - used for cuVS, centroid routing, SOM, and bounded prefilter acceleration
- `bm25_sparse`
  - required lexical baseline
- `bm42_sparse`
  - optional experimental sparse weighting lane
- structural features
  - AST kind
  - symbol kind
  - imports
  - calls
  - route/schema facts
- topology features
  - `pagerank`
  - `community_id`
  - path proximity
  - fanout evidence
- routing features
  - `kmeans_cluster_id`
  - `som_cell_id`
  - centroid distance
  - latent neighborhood
- classifier features
  - logistic-regression / naive-Bayes / XGBoost input matrix over the lanes above

This means:

- `768` is not competing with `384`
- `384` is only meaningful as a derived feature representation
- vectors are representations, not the knowledge layer itself
- do not concatenate `384` and `768` into a synthetic `1152`-dim semantic vector
- fuse ranks or calibrated scores across lanes, not raw coordinates from different latent spaces

Recommended role split:

- `dense_384`
  - canonical online semantic search lane
- `dense_768`
  - legacy recall and compatibility lane
- `latent_64`
  - clustering, centroid routing, SOM, and bounded ANN experiments only
- `topology_4`
  - visualization, drift, and storage-order metadata only
- token or view multivectors
  - late-interaction precision lane for bounded reranking only

## Multivector Qdrant Contract

Qdrant should hold multivector search representations, not canonical semantics.

Recommended named vectors per point:

- `dense_768`
  - canonical semantic retrieval embedding
- `dense_384`
  - optional derived projection for task-specific or cost-bounded search
- `latent_64`
  - compressed routing / cuVS / centroid / SOM input
- `bm25_sparse`
  - required lexical sparse lane
- `bm42_sparse`
  - experimental sparse lexical lane

Required multivector rule:

- store named representations separately
- keep `dense_384`, `dense_768`, `latent_64`, sparse lexical lanes, and optional token or view multivectors as separate contracts
- never collapse those lanes into one coordinate space by concatenation

Recommended payload:

```json
{
  "packet_key": "pkt_...",
  "source_ref": "src/lib/server/retrieval/hybrid-search.ts",
  "feature_id": "feature_hybrid_code_search",
  "tree_node_id": "ts:function:hybridSearch:...",
  "domain_class": "retrieval",
  "feature_label": "hybrid-code-search",
  "community_id": 42,
  "kmeans_cluster_id": 17,
  "som_cell_id": 238,
  "pagerank": 0.002741,
  "ontology_labels": ["retrieval", "ranking"],
  "summary": "Combines dense and sparse retrieval and reranks candidates.",
  "evidence_state": "ACTIVE_VERIFIED",
  "model_versions": {
    "semantic_384": "embeddinggemma-384-v4",
    "legacy_768": "embeddinggemma-768-v2",
    "dense_384_projection": "derived-projection-v1",
    "latent": "ae64-v1",
    "classifier": "xgboost-lane-v1"
  },
  "vector_refs": {
    "dense_384": {
      "status": "ACTIVE",
      "normalized": true
    },
    "dense_768": {
      "status": "REFERENCE_ONLY",
      "normalized": true
    }
  }
}
```

Recommended rule:

- Qdrant payload stores canonical IDs and bounded routing hints
- classifier probabilities and long evidence traces stay in Postgres
- mark each vector lane as `ACTIVE`, `REFERENCE_ONLY`, `MIGRATION_SOURCE`, or `SUPERSEDED`

## Score Fusion Rule

Do not treat `384` and `768` cosine scores as directly comparable just because they share the same source text.

Allowed fusion order:

- search `dense_384`
- search `dense_768`
- search BM25 or BM42
- search graph and centroid lanes
- merge by `packet_key`
- fuse by rank or calibrated probability

Recommended initial strategy:

- RRF over:
  - `dense_384`
  - `dense_768`
  - lexical
  - graph

Recommended later strategy:

- per-lane calibration with logistic regression or isotonic calibration
- learned fusion with XGBoost over lane scores and evidence features
- optional learned cross-space projection only as a derived comparison lane
- never as a silent replacement for the original `384` or `768` vectors

Do not:

- concatenate `384` and `768`
- zero-pad `384` into `768`
- compare cosine values from two spaces as if they were already aligned

## Static vs Dynamic Parameters

Keep three classes of parameters separate:

- static indexed parameters
  - `kmeans_cluster_id`
  - `distance_to_centroid`
  - `som_cell_id`
  - `community_id`
  - global PageRank percentile
  - `domain_class`
  - `feature_id`
  - `ontology_id`
  - embedding version
  - stored in Postgres and mirrored into Qdrant payloads
- query-dynamic parameters
  - query-to-centroid similarity
  - query-to-SOM distance
  - personalized PageRank
  - graph path proximity
  - BM25 or BM42 score
  - dense similarity
  - query domain probability
  - live in request memory or short-TTL Redis only
- learned model parameters
  - logistic coefficients
  - XGBoost trees
  - rotation matrices
  - autoencoder weights
  - calibration curves
  - live in model registry artifacts, not packet payloads

Do not persist query-specific relevance into canonical packets.

## Canonical Payload Example

Use a packet payload shape that keeps `384`, `768`, routing, and topology separate:

```json
{
  "packet_key": "pkt_7ebdc697",
  "source_ref": "src/lib/server/retrieval/hybrid-search.ts",
  "tree_node_id": "ts:function:hybridSearch:7ebdc697",
  "semantic": {
    "domain_class": "retrieval",
    "feature_id": "hybrid_fusion",
    "ontology_version": "3.2.0"
  },
  "vector_refs": {
    "semantic_384": {
      "collection": "codebase_chunks_384_hybrid",
      "name": "content",
      "model_version": "embeddinggemma-384-v4",
      "normalized": true,
      "status": "ACTIVE"
    },
    "legacy_768": {
      "collection": "codebase_chunks_768",
      "name": "content",
      "model_version": "embeddinggemma-768-v2",
      "normalized": true,
      "status": "REFERENCE_ONLY"
    },
    "latent_64": {
      "collection": "codebase_topology_64",
      "name": "latent_64",
      "model_version": "ae64-v3"
    }
  },
  "geometry": {
    "kmeans_cluster_id": 17,
    "centroid_distance": 0.143,
    "som_cell_id": 238,
    "som_x": 11,
    "som_y": 18,
    "hilbert_order": 793
  },
  "topology": {
    "community_id": 42,
    "pagerank_percentile": 0.87
  }
}
```

## Late Interaction Lane

Late interaction should be treated as a bounded multivector reranking lane, not the default corpus-wide index.

Use it to:

- store several token or view vectors per packet when justified
- run late interaction only on the final bounded candidate set
- improve precision after dense, lexical, graph, and centroid candidate generation

Do not:

- make late interaction the first-stage index for the full corpus
- collapse token-level multivectors into the same contract as packet-level dense search

## Knowledge Layer Contract

The knowledge layer is not the vector store. It is the constrained classification and evidence contract that sits above extraction and below synthesis.

Required first-class knowledge-layer entities:

- `.okf` ontology registry and version
- ontology version
- domain registry
- feature registry
- evidence rules
- exclusion rules
- authority classes
- unresolved states

Recommended `.okf` role:

- internal Ontology Knowledge Format contract
- declares domains, features, evidence rules, exclusions, and required authorities
- compiles into:
  - ontology registry tables
  - JSON Schema
  - Zod validators
- runtime authorization and validation gates

Current repo truth:

- `.okf` content already exists at the repo root and under `sveltekit-frontend/src/lib/server/okf/`
- there is already an OKF export path and a Mastra OKF loader

That means `.okf` should now be treated as a live contract source to normalize, not a new format to invent.

The unresolved ownership rule is:

- root `.okf` manifest = canonical declarative source
- runtime `.okf` loader = generated or validated projection
- export route = serialization boundary
- Mastra loader = runtime consumer
- HyperRAG = consumer of resolved ontology and packet contracts

The gate should fail when root and runtime `.okf` representations disagree on ontology IDs, ontology version, entity classes, relationship types, aliases, authority classes, unresolved-state policy, or exclusion rules.

Recommended authority classes:

- `ast`
- `runtime`
- `test`
- `semantic`
- `derived`

Required unresolved states:

- `UNCLASSIFIED`
- `AMBIGUOUS`
- `ONTOLOGY_GAP`

Recommended rule:

- the model does not invent `domain_class` or `feature_label` freely
- it chooses from the active ontology version or emits an explicit unresolved state
- ontology and evidence rules live in canonical Postgres tables, not in prompt-only memory

## Schema Validation Contract

Use one shared packet and fact contract across TypeScript, Python, and Go.

Recommended validation chain:

- `.okf` source ontology
- generated JSON Schema for transport and storage boundaries
- Zod validation for TypeScript runtime gates
- Python `jsonschema` or equivalent validation for sidecars
- SQL constraints and typed columns in Postgres

Recommended rule:

- do not admit a semantic packet, fact, or tool proposal into execution unless it passes schema validation and ontology validation
- do not allow sidecars to emit untyped ad hoc packet JSON

## cuVS / RAPIDS Role

Use cuVS and RAPIDS as acceleration lanes, not as the canonical search store.

Best fit here:

- offline IVF / ANN build over `latent_64`
- GPU prefilter over bounded candidate pools
- clustering support for KMeans and neighbor routing
- batch evaluation / timing comparisons against Qdrant HNSW
- GPU exact top-k benchmark ground truth
- cuVS CAGRA benchmark lane
- cuVS Vamana build lane for DiskANN-compatible artifacts

Keep Qdrant as the default online mirror until cuVS is proven on:

- recall parity
- latency parity or improvement
- deterministic ID mapping
- crash recovery

Recommended artifact set for cuVS:

- Arrow or msgpack export with:
  - row index
  - `packet_key`
  - `source_ref`
  - `tree_node_id`
  - `feature_id`
  - `latent_64`
- Redis metadata:
  - `ace:cuvs:index:meta`
  - `ace:cuvs:index:data`

DiskANN / Vamana rule:

- use Vamana and DiskANN as future artifact lanes, not as canonical storage
- use cuVS Vamana to reduce build time and generate benchmarkable graph artifacts
- use Redis SVS VAMANA only as a separate infrastructure experiment if Redis intentionally becomes a vector-serving lane

Hilbert ordering rule:

- use Hilbert order for SOM or reduced-space storage locality, tiling, partition order, and batch layout
- do not treat Hilbert ordering as a replacement for HNSW, CAGRA, Vamana, or semantic retrieval

Rotation rule:

- orthogonal rotation before quantization is a compression or robustness tool
- it is not a semantic identity transform
- every rotated or quantized artifact must carry `rotation_id`, `input_dimension`, `output_dimension`, `quantizer_version`, and `artifact_ref`

## Benchmark Order

Benchmark candidate indexes in this order:

1. exact GPU brute-force
2. Qdrant HNSW
3. cuVS CAGRA
4. cuVS IVF Flat
5. cuVS IVF PQ
6. cuVS Vamana build and DiskANN-compatible artifact generation
7. Redis SVS VAMANA only as a separate infrastructure experiment

Why this order:

- exact GPU gives recall ground truth
- Qdrant is the deployed online baseline
- CAGRA tests native GPU graph ANN
- IVF Flat and IVF PQ test partitioning and compression
- Vamana or DiskANN test the future SSD-scale artifact lane
- Redis SVS VAMANA stays optional unless Redis intentionally becomes a vector-serving lane

Track:

- recall@10
- recall@50
- NDCG@10
- MRR
- p50, p95, p99 latency
- build time
- index bytes per vector
- VRAM
- host RAM
- SSD reads
- update cost

## NLP / Ontology / Classifier Ordering

Recommended enrichment order:

1. parser and identity pass
2. LangExtract / lexical pass
3. ontology tuple generation
4. semantic embedding pass
5. logistic regression / naive Bayes baseline classification
6. XGBoost classifier or reranker pass
7. Qdrant payload mirror update
8. Neo4j topology update
9. SOM / KMeans routing update
10. ACE packet materialization
11. ontology and state-machine validation
12. authorized MCP / Mastra tool execution

Classifier roles:

- logistic regression / naive Bayes:
  - transparent baseline domain and lane classification
- XGBoost:
  - stronger feature / lane / rerank model on structured features
- PyTorch:
  - autoencoder
  - policy reranker
  - optional reinforcement signals

Recommended classifier feature matrix inputs:

- path tokens
- AST kind and symbol kind
- imports and called APIs
- BM25 and BM42 sparse signals
- `dense_768` similarity features
- optional `dense_384` derived similarity features
- topology features
- routing features
- ontology match features
- runtime and test evidence features

## Neo4j Fanout and Explanation

Neo4j should answer:

- what structurally connects these candidates
- what nearby nodes should be expanded
- why a recommendation was produced

Recommended graph-derived outputs:

- `community_id`
- `pagerank`
- `fanout_neighbors`
- `shortest_path_evidence`
- `supporting_edge_types`

Use PageRank as a bounded prior only. It is not feature authority.

## Latent Storage

Use latent vectors for routing, not canonical meaning.

Recommended storage:

- Postgres:
  - store artifact references and manifest rows
  - not the full dense matrix
- SeaweedFS:
  - `.arrow`
  - `.msgpack`
  - `.npy`
  - optional binary latent shards
- optional Postgres `bytea`:
  - only for small bounded blobs or manifests
  - not for primary large matrix storage

If you need mmap or zero-copy batch processing:

- Arrow first
- msgpack for compact transport
- JSON only for API payloads and small debug artifacts

## Online Agentic Dense Search Flow

Target flow:

1. user query arrives
2. MCP tool or Mastra workflow normalizes query
3. LangExtract and ontology matcher derive:
   - domain hints
   - feature hints
   - entity hints
   - source_ref priors
4. retrieve in parallel:
   - BM25/BM42 sparse
   - Qdrant dense
   - Qdrant latent or cuVS prefilter
   - Redis centroid cache
   - Neo4j topology fanout
5. dedupe by `packet_key` and `tree_node_id`
6. rerank using:
   - semantic score
   - sparse score
   - structural match
   - topology prior
   - routing proximity
   - classifier probability
7. construct evidence chain from source packets plus hypergraph facts
8. materialize compact ACE packet
9. hand packet to Gemma4 / Ornith function-tool caller
10. validate proposed action against ontology constraints and state machine
11. MCP tools execute bounded follow-up actions
12. write recommendation and evidence outcome back to Postgres

## Mastra / MCP / Function Calling Boundary

Recommended ownership:

- MCP:
  - low-level callable tools
  - health, search, topology, packet inspection, enrichment entrypoints
- Mastra:
  - durable workflow orchestration
  - retries
  - resume checkpoints
  - agent planning
- Gemma4 / Ornith:
  - bounded synthesis
  - tool selection
  - recommendation generation
- Python middleware sidecars:
  - LangExtract
  - XGBoost serving
  - PyTorch inference or training
  - cuVS batch jobs
  - JSON Schema validated packet and fact materialization

Do not let the model write directly to Qdrant, Neo4j, Redis, or SeaweedFS. Durable mutations should remain workflow-owned and Postgres-first.

## Recommended Next Execution Order

1. Reconcile the canonical four-contract boundary:
   - `SemanticPacketV1`
   - `HypergraphFactV1`
   - `FeatureMatrixRowV1`
   - `ContractValidationResult`
2. Prove canonical packet envelope fields across Postgres, Qdrant, and Neo4j:
   - `packet_key`
   - `source_ref`
   - `title_id`
   - `feature_id`
   - `tree_node_id`
   - `domain_class`
   - `feature_label`
3. Define and validate `.okf` as the ontology contract source:
   - versioned ontology registry
   - JSON Schema generation
   - Zod runtime validation
   - unresolved-state handling
   - reconcile root `.okf`, docs `.okf`, and `sveltekit-frontend/src/lib/server/okf/` into one promoted active contract path
4. Prove n-ary semantic fact persistence and projection:
   - `semantic_facts`
   - `semantic_fact_participants`
   - `semantic_fact_evidence`
   - Neo4j projection parity
5. Audit Qdrant named vectors and payload parity against the recommended multivector contract
6. Audit classifier outputs so logistic/XGBoost decisions are stored separately from topology and routing fields
7. Add a compact Arrow or msgpack export contract for cuVS and offline DuckDB processing
8. Validate Redis centroid cache keys and packet cache keys against the same canonical IDs
9. Run a read-only semantic-contract reconciliation artifact pass:
   - `scripts/atlas/reconcile-semantic-contracts.mjs`
   - `artifacts/semantic-contract-reconciliation.json`
   - `artifacts/semantic-contract-conflicts.ndjson`
   - `artifacts/semantic-contract-identity-map.parquet`
10. Run a `384` versus `768` parity benchmark with exact GPU top-k as the reference:
   - exact GPU brute-force ground truth
   - Qdrant HNSW baseline
   - optional cuVS CAGRA / IVF Flat / IVF PQ / Vamana comparisons
   - RRF versus calibrated score fusion comparison
   - decision on whether `dense_768` materially improves recall over `dense_384`
   - record the result as one of:
     - `legacy_768 = REFERENCE_ONLY`
     - `legacy_768 = MIGRATION_SOURCE`
     - `legacy_768 = ACTIVE`
     - `legacy_768 = SUPERSEDED`
11. Wire one end-to-end Mastra workflow:
   - query
   - parallel retrieval
   - topology fanout
   - hypergraph fact recovery
   - rerank
   - ACE packet
   - ontology validation
   - Gemma4 synthesis
   - recommendation row

12. Reconcile existing repo seams into the canonical promoted path:
   - OKF loader and export path
   - packet Zod schemas
   - HyperRAG packet RPC routes
   - `title_id` and `tree_node_id` identity handling
   - ULID and UUID generation policy

## Concrete Gaps To Close

- prove the knowledge-layer contract:
  - ontology versioning
  - domain and feature registry tables
  - evidence rule enforcement
  - unresolved state handling
- prove one canonical `SemanticPacketV1` envelope across packet, feature, topology, retrieval, and RPC layers
- prove one canonical `HypergraphFactV1` envelope for n-ary facts and evidence spans
- prove one canonical `FeatureMatrixRowV1` contract that keeps semantic, lexical, structural, topology, routing, ontology, and classifier features separate
- prove one canonical `ContractValidationResult` envelope for packet and fact admission
- prove `.okf` to JSON Schema and Zod generation path
- prove root `.okf` authority and runtime `.okf` projection rules
- prove canonical ID creation rules for `uuid`, `ulid`, `title_id`, `tree_node_id`, `content_hash`, and `packet_key`
- prove cross-store identity parity among Postgres, Qdrant, Neo4j, HyperRAG RPC, and caches
- prove n-ary fact persistence and HyperRAG retrieval without lossy pairwise-only reconstruction
- prove Qdrant named vector parity for `dense_768`, optional derived `dense_384`, `latent_64`, and sparse lane naming
- prove late-interaction multivector use stays bounded to reranking rather than replacing packet-level ANN
- prove exact GPU top-k benchmark ground truth for `384` versus `768` before adding another ANN index
- prove whether `dense_768` materially improves recall or only serves as a compatibility lane
- prove any Vamana or DiskANN artifact lane behind the same identity and result-shape contract
- prove classifier decision persistence contract in Postgres
- prove Neo4j fanout explanation rows are keyed by canonical IDs
- prove cuVS export and reload path against the current canonical source map
- prove ACE packets omit raw unbounded source content and keep compact metadata only
- prove one online MCP tool path calls the aligned retrieval stack rather than a legacy parallel stack

## Runtime Proof Matrix

The next runtime proof should follow one packet across all layers:

- source file located
- `tree_node_id` assigned by the structural lane
- `packet_key` derived deterministically
- `title_id` resolved for grouping only
- Zod validation passes
- JSON Schema validation passes
- PostgreSQL packet row persisted
- Qdrant payload upsert references the same canonical packet
- HyperRAG fact evidence references the same `packet_key`
- `.okf` ontology version resolves without fallback drift
- topology features attach as topology fields only
- routing features attach as routing fields only
- RPC retrieval returns the same identity set

Required assertions:

- `packet_key` remains identical across projections
- `content_hash` matches the current source revision
- `tree_node_id` resolves to the original structural node
- `title_id` is never substituted for packet identity
- Qdrant payload references the PostgreSQL packet rather than replacing it
- HyperRAG evidence points at the same packet and ontology version
- unresolved semantic states are not silently upgraded to `RESOLVED`
- KMeans and SOM remain routing features
- PageRank and community remain topology features

## Verdict

The repo should now be described as:

- `SEMANTIC_INFRASTRUCTURE_PARTIALLY_IMPLEMENTED`
- `OKF_EXPORT_LOAD_PATHS_PRESENT`
- `HYPERRAG_ROUTES_PRESENT`
- `PACKET_SCHEMAS_PRESENT`
- `ZOD_VALIDATION_PRESENT`
- `IDENTITY_UTILITIES_PRESENT`
- `TOPOLOGY_FEATURE_LANES_PRESENT`
- `CANONICAL_CONTRACT_NOT_YET_UNIFIED`
- `CROSS_LAYER_IDENTITY_NOT_YET_PROVEN`
- `RUNTIME_VALIDATION_PARTIAL`
- `END_TO_END_EXECUTION_PROOF_PENDING`

The highest-value constraint is this:

Postgres stores canonical packet identity and evidence truth; Qdrant, Neo4j, Redis, cuVS, Arrow, msgpack, and model sidecars are all acceleration or projection lanes built from that truth.
