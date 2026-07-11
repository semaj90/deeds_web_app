# Spec-Driven Kanban Task Board

Generated: 2026-07-05

## Current Slice Status

| Task | Status | Evidence |
|---|---:|---|
| Qdrant point ID bridge | proven bounded, partial coverage | Direct `atlas_packets.qdrant_point_id` set-payload apply patched 196/200 rows; 4 ambiguous mappings were skipped |
| Tree node ID propagation | proven in Postgres, bounded mirrors | 58,365 / 58,365 packet rows; Qdrant readback matched 20/20 and Neo4j tree-only graphify passed |
| Title ID propagation | proven in Postgres | Live readiness gate reports 58,365 / 58,365 packet rows; downstream mirrors remain derived |
| Semantic fanout / rerank | partial | Domain topic inference still depends on widening LangExtract + EmbeddingGemma + TurboVec + BM25 + AE/KMeans/SOM coverage |
| MapReduce consolidation | proven | `mapreduce-consolidated-index.mjs --dry-run --limit 50 --slim` passes and aggregates file/import/topic evidence |
| QLoRA dataset prep | blocked on corpus quality | Canonical labels are complete, but summary coverage is 7.16% and AST-symbol coverage is 0.88% |
| Arrow batch transport | proven bounded | 200 rows / 48 columns round-trip through Arrow IPC with stable splits, row index, and vector-buffer validation |
| mmap registry payloads | proven bounded | HyperRAG materializer writes validated MsgPack packets and registry rows; full-corpus promotion remains pending |
| ACP routing fan-out | wired | HMM router exists and emits bounded routing suggestions |
| Progressive semantic compiler gate | wired | Explicit live validator now checks identity, feature, metrics, and tree fan-out coverage |
| HyperRAG packet materializer | proven | `scripts/atlas/hyperrag-packet-materializer.mjs` now passes dry-run and apply on a bounded slice, writing MsgPack + hot registry rows |
| Game-engine runtime cache | wired | Service worker now uses same-origin runtime-cache endpoints, stable POST body hashes, and a packet LOD manifest schema |
| Stub/mock cleanup | partial | New lanes are bounded and real, but older schema drift still needs cleanup |
| Rust parser / N-API lane | proven | `verify-rust-napi-exports.mjs` and `test-rust-parser.mjs` pass on the live checkout |
| TurboVec sidecar smoke | proven | Smoke now passes on 8791, matching the live pipeline validator |
| Fuse.js usage | lexical-only | Keep it off the deep semantic path; use it only as a UI/search fallback |

## Live Proved Lanes

- Go retrieval smoke: PASS
- TurboVec ANN pipeline: PASS
- TurboVec sidecar smoke: PASS on 8791
- Rust parser / N-API exports: PASS
- Rust msgpack chunker: PASS on bounded archive
- Semantic training export: PASS on bounded slices
- Summary-ranking stage 2: PASS on a bounded apply slice, 10 pgvector rows written
- Direct Qdrant payload bridge: PASS on bounded apply slices, 20/20 and 200/200 points updated
- Naive Bayes training: PASS on bounded slices
- Naive Bayes prediction apply: PASS on bounded slices
- HMM routing: PASS on bounded slices
- Topology audit: PASS on bounded slices
- SOM validator: partial on bounded slices, 267/400 occupied cells and 2,674/58,365 assigned packets
- Shared tuple helper is now wired into lexical feature extraction
- Lexical apply slice: PASS on 200 packets, coverage increased
- Fuse.js should not be used for deep semantic packet routing

## Routing Boundary

- Fuse.js stays lexical/UI only.
- Deep semantic routing stays on Qdrant + TurboVec + RRF + reranker.
- HMM/ACP should consume semantic evidence, not Fuse.js fuzzy matches.
- Domain clustering for code/data/legal is a required semantic validation gate, not an optional enhancement.
- `tree_node_id` is the packet-level fan-out join for Neo4j GDS PageRank/community context, Qdrant payload filtering, and reranking.
- Semantic fanout should follow: LangExtract/lexical pass -> EmbeddingGemma -> Qdrant/BM25 candidate set -> AE latent64 -> KMeans -> SOM -> TurboVec rerank -> final reranker.
- MapReduce consolidation is the wiki-style consolidation pass for file/import/topic aggregation before cluster fanout.
- QLoRA adapter training should use canonical feature/metrics tuples plus topic labels; it does not need `qdrant_id` as a training feature.
- HyperRAG RPC should assemble validated packets, write MsgPack/mmap-ready envelopes, and emit telemetry after ACP chooses the action lane.
- Runtime cache promotion should follow the game-engine model: precompute packet assets, cache visibility/centroids, stream only needed packets, and record action-state telemetry.
- Arrow IPC is batch transport. Its packet index stores Arrow row positions, not mmap byte offsets.
- MsgPack/mmap is the validated hot-packet lane; incomplete or rejected rows remain outside it.

## Live Training Readiness Refresh (2026-07-10)

Command: `npm run atlas:training:readiness`

| Signal | Coverage | Gate |
|---|---:|---:|
| canonical packet identity | 58,365 / 58,365 | PASS |
| `tree_node_id` | 100% | PASS |
| `feature_id` / `title_id` / `domain_class` | 100% | PASS |
| `used_concepts` | 99.99% | PASS |
| lexical features | 99.98% | PASS |
| AST symbols | 0.88% | BLOCKED |
| summaries | 7.16% | BLOCKED |
| canonical packet embeddings | 0.017% | BLOCKED |
| `latent_64` | 2.14% | BLOCKED |
| SOM 20x20 packet assignment | 7.17% | BLOCKED |
| `qdrant_point_id` | 8.08% | BLOCKED for mirror repair, not required for Arrow dataset identity |

Promotion decisions:

- Arrow batch export: PASS
- bounded HyperRAG packet materialization: PASS
- QLoRA semantic corpus: BLOCKED
- autoencoder training: BLOCKED
- Packet-JEPA reranker promotion: BLOCKED
- GPU topology MapReduce: BLOCKED

`tree_node_id` is a derived lineage/traversal join used for Neo4j fan-out, PageRank/community context, Qdrant payload filtering, and topology reranking. It is not `packet_key`, and it is not a semantic training target.

Bounded mirror proof:

- Qdrant: 196 existing points patched with `set_payload`; direct readback matched 20/20 packet and tree IDs, with 20/20 SOM coordinates.
- Neo4j: `graphify-packet-contract.mjs --tree-only` passed with zero batch errors; the live graph currently has 18,811 `HAS_TREE_NODE` edges, so full parity remains incomplete.
- TurboVec reranker: exact tree-node and tree-authority promotion tests pass after ANN candidate generation.

The existing Packet-JEPA experiment is proven but not promoted: its held-out MRR and NDCG@10 are below the 384d cosine/PCA baselines.

## LOD / Streaming View

- LOD is a derived zoom layer over the canonical packet spine.
- Stream bounded batches by `domain_class`, `feature_id`, `community_id`, and SOM cell.
- Do not stream raw corpus payloads as a replacement for the packet registry.

## Completion Estimate

### Created: 100%

Scripts and board contracts exist.

### Wired: 89%

The live retrieval, semantic training, NB, HMM, topology audit, and bounded packet materializer lanes are connected to the real schema.

### Proven: 79%

Bounded slices and sidecar smoke tests pass, and the HyperRAG packet materializer now has a passing bounded apply slice.

### Done: 62%

Core lanes are live, but the pipeline is not production-complete until the identity bridges and topology propagation are finished.

## Remaining Blockers

1. Canonical packet embedding coverage for AE/JEPA/topology training
2. AST symbol extraction coverage for structural supervision
3. Summary coverage for comprehensive QLoRA topic training
4. SOM assignment coverage after embeddings are versioned
5. `qdrant_point_id` bridge materialization for mirror repair
6. Rejected-envelope archive ingestion
7. Python CUDA training environment; native addon is ready, repo venv remains CPU-only
8. RAPIDS/cuVS/nx-cugraph WSL2 worker lane

## Next Execution Cards

1. Backfill `qdrant_point_id` by real Qdrant point IDs only.
2. Audit `tree_node_id` mirror parity without regenerating the now-complete Postgres identity.
3. Expand AST extraction, summaries, and canonical embedding coverage in bounded batches.
4. Materialize SOM adjacency and topology density after embedding coverage is versioned.
5. Add rejected-envelope archive input for mixed NB training.
6. Keep Fuse.js out of the deep semantic/routing path.
7. Scale the pgvector embed/write lane before reopening Qdrant tagging.
8. Add LOD streaming as a derived zoom layer over topology fields.
9. Treat semantic reranking and clustering as a required gate for domain topic inference.
10. Use map-reduction to consolidate wiki-like file/topic evidence before clustering and rerank.
11. Build the QLoRA dataset from feature/metrics evidence and canonical topic labels, not from vector IDs; block training until summary and AST gates pass.
12. Add a bounded HyperRAG packet materializer that joins RPC input, packet assembly, validator output, and telemetry before any cache promotion.
13. Promote the service-worker cache lane by replacing dummy Redis/SOM clients, using stable request hashes, and adding packet LOD manifests.

## Missing Script Prompts

1. **Qdrant bridge validator**: materialize `packet_key -> qdrant_point_id -> relative_path`, validate duplicates and orphans, then update `atlas_packets` in batched writes only.
2. **Concrete source-ref propagation**: backfill `source_ref`, `source_path`, `file_path`, and `canonical_source_ref` from canonical joins, and reject synthetic or ambiguous identity.
3. **Tree-node propagation audit**: verify `tree_node_id` across Postgres, Qdrant payloads, and Neo4j, then backfill only deterministic gaps.
4. **SOM contract repair**: normalize SOM row/col values to the 20x20 contract, repair invalid coordinates, and re-run topology validation.
5. **Concept coverage backfill**: populate `used_concepts` and `concept_ids` in bounded batches with LangExtract plus fallback extraction.
6. **Feature/metrics split**: write `atlas_packet_features` and `atlas_packet_metrics` separately so retrieval can read evidence and derived math independently.
7. **Arrow batch import**: add the batch import companion to the Arrow export lane and make it resumable by offset and limit.
8. **mmap hot registry writer**: serialize only validated packets into MsgPack, write mmap entries, and persist offset/length/checksum in Postgres.
9. **ACP routing fan-out**: route HMM-classified failures into repair actions, log attempts with traceability, and keep the executor separate from scoring.
10. **Promotion-gate audit**: block packet promotion unless qdrant, tree, and topology thresholds all pass, then emit a ranked rejection report.
11. **Recommendation gap refresh**: refresh the recommendation index in bounded slices and write the kanban board slice with the highest-priority gap commands.
12. **Source-ref discovery audit**: audit abstract source refs to concrete file paths, report unresolved rows, and backfill deterministic join keys.
13. **Semantic fanout gate**: validate `LangExtract -> EmbeddingGemma -> TurboVec/BM25 -> AE/KMeans/SOM -> rerank` before topic promotion.
14. **OCR/doc ingestion slice**: add bounded OCR/PDF/image normalization so documents enter the semantic extraction pipeline before clustering.
15. **Hot/warm/cold promotion rule**: only promote packets after semantic validation passes, then separate hot cache, warm registry, and cold archive layers.
16. **Wiki consolidation pass**: run `mapreduce-consolidated-index.mjs` in bounded slices to consolidate file/import/topic evidence into a wiki-like intermediate index.
17. **QLoRA dataset export**: consume the proven Arrow IPC semantic batch, then emit model-specific JSONL only after summary and AST coverage gates pass.
18. **Graph fanout lane**: add the 3D graph/A* traversal lane as a separate fanout experiment if topology routing needs more than SOM locality.
19. **HyperRAG packet materializer**: implement a single bounded joiner for RPC input -> packet assembly -> validator -> MsgPack/mmap writer -> telemetry -> ACP handoff.
20. **Game-engine runtime cache audit**: replace placeholder service-worker cache clients, hash POST bodies, add packet LOD manifests, and prove IndexedDB/WebGPU cache parity on a fixed fixture.

## Topology Recommendation Slice

Generated: 2026-07-05T23:52:54.195Z
Total features indexed: 1000
Total packets: 18514
Summarized packets: 1427
Tree-linked features: missing 1
Qdrant-bridged features: missing 979

| priority | gap | feature | packets | tree linked | qdrant keyed | todo score | command |
|---:|---|---|---:|---:|---:|---:|---|
| 2339 | missing_summary | +server.ts.disabled | 2397 | 2397 | 0 | 18401 | npm run atlas:phase8:step3:langextract:apply |
| 1443 | missing_summary | LLMS.md | 1429 | 1429 | 214 | 10803 | npm run atlas:phase8:step3:langextract:apply |
| 1352 | missing_summary | +server.ts | 1327 | 1327 | 212 | 10044 | npm run atlas:phase8:step3:langextract:apply |
| 828 | missing_summary | +server.ts | 777 | 777 | 648 | 5307 | npm run atlas:phase8:step3:langextract:apply |
| 687 | missing_summary | LLMS.md | 639 | 639 | 0 | 4867 | npm run atlas:phase8:step3:langextract:apply |
| 597 | missing_summary | invoked.timestamp | 534 | 534 | 0 | 4102 | npm run atlas:phase8:step3:langextract:apply |
| 398 | missing_summary | +page.ts | 321 | 321 | 304 | 2133 | npm run atlas:phase8:step3:langextract:apply |
| 354 | missing_summary | invoked.timestamp | 279 | 279 | 0 | 2122 | npm run atlas:phase8:step3:langextract:apply |
| 276 | missing_summary | relationship_map.json | 185 | 185 | 0 | 1450 | npm run atlas:phase8:step3:langextract:apply |
| 275 | missing_summary | next_actions.md | 185 | 185 | 0 | 1445 | npm run atlas:phase8:step3:langextract:apply |
| 273 | missing_summary | graph_nodes.json | 181 | 181 | 0 | 1423 | npm run atlas:phase8:step3:langextract:apply |
| 268 | missing_summary | qdrant_cluster_tags.json | 181 | 181 | 0 | 1398 | npm run atlas:phase8:step3:langextract:apply |
| 268 | missing_summary | ace_hit_relationships.json | 181 | 181 | 0 | 1398 | npm run atlas:phase8:step3:langextract:apply |
| 267 | missing_summary | graph_edges.json | 181 | 181 | 0 | 1393 | npm run atlas:phase8:step3:langextract:apply |
| 265 | missing_summary | llm_synthesis_mapping.json | 181 | 181 | 0 | 1383 | npm run atlas:phase8:step3:langextract:apply |
| 261 | missing_summary | ingest.ts | 185 | 185 | 0 | 1375 | npm run atlas:phase8:step3:langextract:apply |
| 252 | missing_summary | LLMS.md | 160 | 160 | 4 | 1251 | npm run atlas:phase8:step3:langextract:apply |
| 249 | missing_summary | run-build-script-build-script-build.json | 160 | 160 | 0 | 1240 | npm run atlas:phase8:step3:langextract:apply |
| 247 | missing_summary | LLMS.md | 156 | 156 | 0 | 1218 | npm run atlas:phase8:step3:langextract:apply |
| 223 | missing_summary | __init__.pyi | 129 | 129 | 0 | 1017 | npm run atlas:phase8:step3:langextract:apply |
