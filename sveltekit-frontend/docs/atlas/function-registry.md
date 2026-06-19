# Function Registry — deeds-web-app

> Generated: 2026-06-19T04:01:46.973Z
> Source of truth for agentic coding anti-duplication gate.

## Anti-Duplication Rule

Before creating a new file or function:
1. Search `lane-to-function-map.json` for matching lane/symbols.
2. Search `scripts/atlas/`, `src/lib/server/retrieval/`, `src/lib/server/ace/`.
3. If an entry covers ≥60% of the job → **REUSE IT**.
4. Only create new code for missing glue/orchestration.

---

## Packet Layer `PACKET_LAYER`

| Field | Value |
|---|---|
| domain_class | `packet_identity` |
| ontology_label | `parent_atlas_packet` |
| topology_label | `packet_store` |

| File | Symbols | Purpose |
|---|---|---|
| `scripts/atlas/add-atlas-packets-columns.mjs` | `—` | add-atlas-packets-columns.mjs |
| `scripts/atlas/audit-atlas-packet-join-gaps.mjs` | `—` | audit atlas packet join gaps |
| `scripts/atlas/audit-hidden-packet-pathmap.mjs` | `—` | Read-only hidden packet pathmap auditor. |
| `scripts/atlas/audit-packet-contract-mirrors.mjs` | `—` | audit packet contract mirrors |
| `scripts/atlas/audit-packets.mjs` | `—` | audit-packets.mjs |
| `scripts/atlas/audit-trace-packet-ref-normalization.mjs` | `—` | Audit: Trace Packet Ref Normalization |
| `scripts/atlas/backfill-atlas-packet-summaries-from-files.mjs` | `—` | backfill-atlas-packet-summaries-from-files.mjs |
| `scripts/atlas/backfill-atlas-packets-from-hop-index.mjs` | `backfillAtlasPackets` | @module atlas/backfill-atlas-packets-from-hop-index |
| `scripts/atlas/backfill-nes-chrom-packets.mjs` | `—` | backfill nes chrom packets |
| `scripts/atlas/backfill-packet-cluster-id.mjs` | `—` | backfill-packet-cluster-id.mjs |
| `scripts/atlas/backfill-packet-metadata-to-postgres.mjs` | `—` | scripts/atlas/backfill-packet-metadata-to-postgres.mjs |
| `scripts/atlas/backfill-packet-metadata.mjs` | `—` | backfill-packet-metadata.mjs |
| `scripts/atlas/backfill-packet-topology-env.mjs` | `—` | scripts/atlas/backfill-packet-topology-env.mjs |
| `scripts/atlas/backfill-qdrant-packet-keys.mjs` | `—` | Backfill Qdrant with packet_key from Postgres |
| `scripts/atlas/backfill-trace-packet-ref-normalization.mjs` | `—` | Backfill: Trace Packet Ref Normalization |
| `scripts/atlas/batch-memory-exports-to-ldjson.mjs` | `—` | Batch memory/exports/*.json report objects into deterministic LD-JSON. |
| `scripts/atlas/build-compressed-packets.mjs` | `—` | scripts/atlas/build-compressed-packets.mjs |
| `scripts/atlas/build-mcp-tool-manifest-packets.mjs` | `—` | build-mcp-tool-manifest-packets.mjs |
| `scripts/atlas/build-neschrom-index.mjs` | `—` | build-neschrom-index.mjs |
| `scripts/atlas/build-neschrom97-card-registry.mjs` | `—` | Build a compact NESCHROM97 card registry. |
| `scripts/atlas/build-neschrom97-registry.mjs` | `—` | Build NESCHROM97 Card Registry |
| `scripts/atlas/cache-ace-packet.mjs` | `—` | @file scripts/atlas/cache-ace-packet.mjs |
| `scripts/atlas/classify-neschrom97-cards.mjs` | `—` | NESCHROM97 Card Taxonomy Classifier |
| `scripts/atlas/classify-packet-temperature.mjs` | `—` | Phase 3C: Classify Packet Temperature |
| `scripts/atlas/compute-missing-packet-keys.mjs` | `—` | Compute Missing packet_key in Postgres |
| `scripts/atlas/create-agent-pickup-packets.mjs` | `—` | create agent pickup packets |
| `scripts/atlas/enrich-addressable-packets-with-vectors.mjs` | `—` | enrich addressable packets with vectors |
| `scripts/atlas/enrich-domain-packet-payloads.mjs` | `—` | enrich-domain-packet-payloads.mjs |
| `scripts/atlas/enrich-qdrant-packet-payload.mjs` | `—` | Enrich: Qdrant Packet Payload |
| `scripts/atlas/enrich_atlas_packets.mjs` | `—` | enrich_atlas_packets.mjs |
| `scripts/atlas/extract-rg-dump-packets.mjs` | `—` | extract-rg-dump-packets.mjs |
| `scripts/atlas/extract-session-notes-to-packets.mjs` | `—` | extract-session-notes-to-packets.mjs |
| `scripts/atlas/fix-backfill-legacy-packet-keys.mjs` | `—` | Backfill packet_key for legacy glyph_records that were ingested via |
| `scripts/atlas/fix-missing-packet-keys.mjs` | `—` | Phase D: Fix missing packet_keys in Qdrant for recently ingested Postgres packet |
| `scripts/atlas/generate-parent-atlas-packets.mjs` | `—` | @file scripts/atlas/generate-parent-atlas-packets.mjs |
| `scripts/atlas/generate-task-summary-packets.mjs` | `—` | generate-task-summary-packets.mjs — Phase 102 T3 + T4 |
| `scripts/atlas/generate_parent_atlas_packets.mjs` | `—` | generate parent atlas packets |
| `scripts/atlas/graphify-packet-contract.mjs` | `—` | graphify-packet-contract.mjs |
| `scripts/atlas/index-function-packets.mjs` | `—` | index-function-packets.mjs |
| `scripts/atlas/index-parent-atlas-packets.mjs` | `—` | @file scripts/atlas/index-parent-atlas-packets.mjs |
| `scripts/atlas/ingest-grpc-packets-to-qdrant.mjs` | `—` | Ingest gRPC service packets into Qdrant codebase_chunks_768. |
| `scripts/atlas/ingest-qdrant-to-atlas-packets.mjs` | `—` | ingest-qdrant-to-atlas-packets.mjs |
| `scripts/atlas/inject-ndjson-as-ace-packets.mjs` | `—` | inject-ndjson-as-ace-packets.mjs |
| `scripts/atlas/load-som-packets-to-redis.mjs` | `—` | load-som-packets-to-redis.mjs |
| `scripts/atlas/materialize-addressable-packets.mjs` | `—` | materialize addressable packets |
| `scripts/atlas/materialize-feature-map-duckdb.mjs` | `—` | materialize-feature-map-duckdb.mjs |
| `scripts/atlas/materialize-gemma-recommendations.mjs` | `—` | materialize gemma recommendations |
| `scripts/atlas/materialize-glyph-records.mjs` | `—` | scripts/atlas/materialize-glyph-records.mjs |
| `scripts/atlas/materialize-hidden-packet-pathmap-duckdb.mjs` | `—` | Materialize the hidden packet pathmap surfaces into DuckDB. |
| `scripts/atlas/materialize-mapreduce-duckdb.mjs` | `—` | Materialize the consolidated mapreduce NDJSON into a persistent DuckDB file. |
| `scripts/atlas/materialize-nes-packets.mjs` | `—` | materialize-nes-packets.mjs |
| `scripts/atlas/materialize-neschrom97-ldjson.mjs` | `—` | materialize-neschrom97-ldjson.mjs |
| `scripts/atlas/materialize-packet-markdown-chunks.mjs` | `—` | materialize packet markdown chunks |
| `scripts/atlas/materialize-recommendation-tasks.mjs` | `—` | @file scripts/atlas/materialize-recommendation-tasks.mjs |
| `scripts/atlas/materialize-task-cards.mjs` | `—` | materialize-task-cards.mjs — Phase 102 T6 + T6.1 + T6.2 + T6.3 |
| `scripts/atlas/packet-materializer-lib.mjs` | `sha8, slug, buildPacketKey, buildPacketPayload` | packet-materializer-lib.mjs |
| `scripts/atlas/packetize-proto-rpc-tools.mjs` | `—` | packetize-proto-rpc-tools.mjs |
| `scripts/atlas/patch-neschrom97-qdrant-tags.mjs` | `—` | patch-neschrom97-qdrant-tags.mjs |
| `scripts/atlas/phase101-parent-atlas-packetize.mjs` | `—` | phase101 parent atlas packetize |
| `scripts/atlas/plan-neschrom97-qdrant-tags.mjs` | `—` | Read-only planning pass for NESCHROM97 Qdrant payload enrichment. |
| `scripts/atlas/populate-atlas-packets-aggressive.mjs` | `—` | @file scripts/atlas/populate-atlas-packets-aggressive.mjs |
| `scripts/atlas/populate-route-packet-rewards.mjs` | `—` | populate-route-packet-rewards.mjs |
| `scripts/atlas/preassemble-ace-packets.mjs` | `—` | preassemble-ace-packets.mjs |
| `scripts/atlas/project-parent-atlas-rg-dump-packets.mjs` | `—` | project parent atlas rg dump packets |
| `scripts/atlas/repair-packet-contract-mirrors.mjs` | `—` | Additive repair runner for packet contract mirrors. |
| `scripts/atlas/report-nes-chrom-packet-hits.mjs` | `—` | report nes chrom packet hits |
| `scripts/atlas/report-route-runtime-packets.mjs` | `—` | scripts/atlas/report-route-runtime-packets.mjs |
| `scripts/atlas/route-runtime-packet-recommendations.mjs` | `—` | scripts/atlas/route-runtime-packet-recommendations.mjs |
| `scripts/atlas/run-packet-enrichment-lanes.mjs` | `—` | run packet enrichment lanes |
| `scripts/atlas/schema-audit-atlas-packets.mjs` | `—` | Schema Audit for atlas_packets |
| `scripts/atlas/seed-neo4j-bounded-used-packet-edges-normalized.mjs` | `—` | Seed: Neo4j USED_PACKET Edges (Normalized) |
| `scripts/atlas/smoke-ace-packet-builder.mjs` | `—` | scripts/atlas/smoke-ace-packet-builder.mjs |
| `scripts/atlas/smoke-hyperrag-packet-rpc.mjs` | `—` | smoke hyperrag packet rpc |
| `scripts/atlas/smoke-neschrom97-ldjson-stream.mjs` | `—` | NESCHROM97 LDJSON Stream Smoke Test |
| `scripts/atlas/smoke-neschrom97-registry.mjs` | `—` | NESCHROM97 Registry Smoke Test |
| `scripts/atlas/smoke-packet-reader-writer.mjs` | `—` | smoke-packet-reader-writer.mjs |
| `scripts/atlas/split-atlas-packets-ledgers.mjs` | `—` | Split atlas_packets into two canonical ledgers: |
| `scripts/atlas/standardize-karpathy-gpu-packets.mjs` | `—` | @file scripts/atlas/standardize-karpathy-gpu-packets.mjs |
| `scripts/atlas/standardize-nes-chrom-packets.mjs` | `—` | @file scripts/atlas/standardize-nes-chrom-packets.mjs |
| `scripts/atlas/sync-qdrant-from-whole-codebase-packets.mjs` | `—` | Phase D: Sync Qdrant from Whole-Codebase Packets |
| `scripts/atlas/upsert-qdrant-packet-payload.mjs` | `—` | upsert-qdrant-packet-payload.mjs |
| `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs` | `—` | Phase D: Upsert Whole-Codebase Atlas Packets |
| `scripts/atlas/validate-addressable-packets.mjs` | `—` | scripts/atlas/validate-addressable-packets.mjs |
| `scripts/atlas/validate-json-packet-integrity.mjs` | `—` | validate json packet integrity |
| `scripts/atlas/validate-packet-contract.mjs` | `—` | validate-packet-contract.mjs  — read-only |
| `scripts/atlas/verify-atlas-packets.mjs` | `—` | verify-atlas-packets.mjs |
| `scripts/atlas/verify-packet-metadata.mjs` | `—` | verify-packet-metadata.mjs |
| `scripts/atlas/verify-qdrant-packet-payload.mjs` | `—` | verify-qdrant-packet-payload.mjs |
| `scripts/atlas/wire-bifrost-packet-mirror.mjs` | `—` | Mirrors Bifrost packet data from the Postgres atlas_higher_hop_index table to Re |
| `scripts/atlas/_neschrom-paths.mjs` | `ensureDirs, ROOT, CARDS_DIR, PACKETS_DIR` | _neschrom-paths.mjs — canonical path resolver for NES-CHROM97 card store |
| `sveltekit-frontend/scripts/atlas/audit-hidden-packet-pathmap.mjs` | `—` | audit hidden packet pathmap |
| `sveltekit-frontend/scripts/atlas/audit-runtime-packet-density.mjs` | `—` | Read-only auditor for route_runtime_packets density. |
| `sveltekit-frontend/scripts/atlas/backfill-atlas-packets-feature-id.mjs` | `—` | backfill-atlas-packets-feature-id.mjs |
| `sveltekit-frontend/scripts/atlas/backfill-packet-metadata-to-postgres.mjs` | `main` | backfill packet metadata to postgres |
| `sveltekit-frontend/scripts/atlas/materialize-addressable-packets.mjs` | `main` | materialize addressable packets |
| `sveltekit-frontend/scripts/atlas/materialize-route-runtime-packets.mjs` | `—` | materialize route runtime packets |
| `sveltekit-frontend/scripts/atlas/phase-20-packet-helpers.mjs` | `loadPool, ensureDirFor, normalizeText, toNullableText` | phase 20 packet helpers |
| `sveltekit-frontend/scripts/atlas/plan-runtime-packet-backfill.mjs` | `—` | plan runtime packet backfill |
| `sveltekit-frontend/scripts/atlas/populate-atlas-packets-aggressive.mjs` | `—` | populate-atlas-packets-aggressive.mjs |
| `sveltekit-frontend/scripts/atlas/seed-neo4j-bounded-used-packet-edges.mjs` | `—` | Bounded Neo4j seed from the agent trace spine. |
| `sveltekit-frontend/scripts/atlas/sync-qdrant-packet-payload.mjs` | `—` | Sync canonical packet metadata from Postgres atlas_packets to Qdrant codebase_ch |
| `sveltekit-frontend/scripts/atlas/validate-addressable-packets.mjs` | `main` | validate addressable packets |
| `sveltekit-frontend/scripts/atlas/validate-packet-contract.mjs` | `—` | validate packet contract |
| `sveltekit-frontend/scripts/atlas/verify-packet-metadata.mjs` | `—` | verify packet metadata |
| `sveltekit-frontend/scripts/atlas/verify-qdrant-packet-payload.mjs` | `—` | verify qdrant packet payload |
| `sveltekit-frontend/src/lib/server/ace/ace-packet-store.ts` | `makePacketId, makeQueryHash, writeAcePacket, readAcePacketById` | ace-packet-store.ts |
| `sveltekit-frontend/src/lib/server/ace/context-packet-budgeter.ts` | `DEFAULT_BUDGET, ContextPacketBudgeter, ContextBudget` | src/lib/server/ace/context-packet-budgeter.ts |
| `sveltekit-frontend/src/lib/server/ace/nes-chrom-card-store.ts` | `normalizeCardId, normalizeSourceRef, cardIdVariants, createCard` | nes-chrom-card-store.ts |
| `sveltekit-frontend/src/lib/server/ace/parent-atlas-packet-assembler.ts` | `assemblePacketForSourceRef, bulkAssemblePackets, AssembleOpts, AssembleResult` | parent-atlas-packet-assembler.ts |
| `sveltekit-frontend/src/lib/server/ace/som-packet-store.ts` | `createSomPacket, readSomPacket, readSomPacketById, updateSomPacket` | som-packet-store.ts |
| `sveltekit-frontend/src/lib/server/db/schema/atlas-feature-packets.ts` | `atlasFeaturePackets, AtlasFeaturePackets, NewAtlasFeaturePackets` | atlas feature packets |
| `sveltekit-frontend/src/lib/server/db/schema/atlas-packets.ts` | `atlasPackets, AtlasIdentityLane, AtlasPacket, NewAtlasPacket` | atlas packets |
| `sveltekit-frontend/src/lib/server/db/schema/nes-chrom-packets.ts` | `nesChromPackets, nesChromKagDagHits, packetMarkdownChunks, NesChromPacket` | NES chrom packets |
| `sveltekit-frontend/src/lib/server/db/schema/packet-metadata-v1.ts` | `packetMetadataSelectors, PacketMetadataBuilder, PacketIdentity, PacketRuntimeMetadata` | Packet Metadata V1 Schema — Structured envelope for atlas_packets.metadata JSONB |
| `sveltekit-frontend/src/lib/server/db/schema/route_runtime_packets.ts` | `routeRuntimePackets, RouteRuntimePacket, NewRouteRuntimePacket` | route runtime packets |

## Retrieval Layer `RETRIEVAL_LAYER`

| Field | Value |
|---|---|
| domain_class | `retrieval_pipeline` |
| ontology_label | `hyperrag_fusion` |
| topology_label | `core_search_entrypoint` |

| File | Symbols | Purpose |
|---|---|---|
| `sveltekit-frontend/src/lib/server/retrieval/ace-retrieval-logger.ts` | `—` | ace retrieval logger |
| `sveltekit-frontend/src/lib/server/retrieval/bm25-search.ts` | `bm25SearchIndexed, bm25SearchUnindexed` | BM25 Search via PostgreSQL trigram similarity |
| `sveltekit-frontend/src/lib/server/retrieval/boosted-reranker.ts` | `loadBoostWeights, saveBoostWeights, scoreRow, scoreWithBoostedReranker` | Gradient-Boosted Reranker |
| `sveltekit-frontend/src/lib/server/retrieval/cluster-aware-reranker.ts` | `applyClusterCoherenceBoost, extractDominantCluster, RAGChunkLike, ClusterRerankerOpts` | Cluster-aware reranker. |
| `sveltekit-frontend/src/lib/server/retrieval/cold-storage-retrieval-service.ts` | `—` | cold storage retrieval service |
| `sveltekit-frontend/src/lib/server/retrieval/concept-overlap-search.ts` | `conceptOverlapSearch, extractQueryConcepts` | Concept Overlap Search |
| `sveltekit-frontend/src/lib/server/retrieval/cross-encoder-reranker.ts` | `rerankToUnified, rerankWithGemma4, getRerankStatus, RERANK_FALLBACK_THRESHOLD` | Cross-Encoder Reranker — Gemma4 pointwise scoring with Redis score cache. |
| `sveltekit-frontend/src/lib/server/retrieval/cuda-rnn-reranker.ts` | `isCudaRnnRankerEnabled, buildCudaRnnSignals, rerankChunksCudaExperimental, CudaRnnSignals` | cuda rnn reranker |
| `sveltekit-frontend/src/lib/server/retrieval/encoded-cluster-prefilter.ts` | `encodedClusterPrefilter` | encoded cluster prefilter |
| `sveltekit-frontend/src/lib/server/retrieval/gpu-reranker.ts` | `gpuRerank, gpuRerankQdrantResults, RerankableDoc, RerankResult` | GPU-Accelerated Post-Retrieval Reranker |
| `sveltekit-frontend/src/lib/server/retrieval/graph-informed-retrieval.ts` | `graphExpandRetrieval, ContextDoc` | Graph-Informed Retrieval Expansion (P0 KAG Gap Fix) |
| `sveltekit-frontend/src/lib/server/retrieval/hyperrag-fusion-service.ts` | `HyperRagFusionService, LexicalClusterHit, HyperRagMode, HyperRagQuery` | hyperrag fusion service |
| `sveltekit-frontend/src/lib/server/retrieval/hyperrag-packet-rpc.ts` | `hyperragPacketRpc, closeHyperRagPacketRpcPool, HyperRagPacketRpcInput, HyperRagPacketRpcPacket` | hyperrag packet rpc |
| `sveltekit-frontend/src/lib/server/retrieval/langextract-reranker.ts` | `rerankWithLangExtractGRPO, rerankChunksGRPO, RerankableChunk, GRPORerankResult` | LangExtract Entity-Aware GRPO Reranker |
| `sveltekit-frontend/src/lib/server/retrieval/manifold4-search.ts` | `searchManifold4, computeManifold4Centroid, blendManifoldScore, Manifold4Point` | Manifold4-bounded retrieval — 4D Euclidean neighborhood search over |
| `sveltekit-frontend/src/lib/server/retrieval/neo4j-graph-signal.ts` | `checkNeo4jHealth, queryNeoJsGraphSignal, queryNeoJsGraphSignalByNames, getNeo4jGraphStats` | Neo4j Graph Signal for RRF Ranking |
| `sveltekit-frontend/src/lib/server/retrieval/prefilter.redis.ts` | `getCentroids64, invalidateCentroids64Cache, getCentroidCacheEntry, REDIS_HASH` | Load and validate 64-dim cluster centroids from Redis. |
| `sveltekit-frontend/src/lib/server/retrieval/prefilter.shadow.ts` | `cosineSimilarity, topKClusters, buildFilterFromClusters, resolveMode` | prefilter.shadow |
| `sveltekit-frontend/src/lib/server/retrieval/prefilter.types.ts` | `EncodedPrefilterMode, EncodedPrefilterConfig, TopKCluster, CentroidCacheEntry` | prefilter.types |
| `sveltekit-frontend/src/lib/server/retrieval/query-router-4x4.ts` | `classifyQuery, getRouterMatrix, QueryRouteResult, QueryClassificationInput` | @fileoverview QueryRouter4x4 Module |
| `sveltekit-frontend/src/lib/server/retrieval/rrf-combiner.ts` | `combineViaRRF, RetrievalLaneName, ContextHit, RRFOptions` | Reciprocal Rank Fusion (RRF) Combiner |
| `sveltekit-frontend/src/lib/server/retrieval/rrf-fuse.ts` | `rrfFuse, rrfFuseDenseSparse, RrfHit, RrfSource` | Reciprocal Rank Fusion (RRF) — combine multiple ranked lists into one. |
| `sveltekit-frontend/src/lib/server/retrieval/rrf-integration.ts` | `multiLaneRetrievalWithRRF, computeMetrics, RRFIntegrationOptions, RRFIntegrationOutput` | RRF Integration: Multi-Signal Ranking with Reciprocal Rank Fusion |
| `sveltekit-frontend/src/lib/server/retrieval/sparse-bm25.ts` | `sparseLegalSearch, SparseSearchHit, SparseSearchOptions` | Sparse (BM25-style) lexical search over `legal_documents.content_tsv`. |
| `sveltekit-frontend/src/lib/server/retrieval/summary-card-retrieval.ts` | `normalizeSummaryCardCandidate, rankSummaryCardCandidates, buildSummaryCardPromptSection, retrieveSummaryCards` | summary card retrieval |
| `sveltekit-frontend/src/lib/server/retrieval/topological-search.ts` | `applyTopologicalBoostAsync, applyTopologicalBoost, BoostOptions` | Advanced Topological Retrieval Boost |
| `sveltekit-frontend/src/lib/server/retrieval/topology-search-client.ts` | `isTopologySearchHealthy, queryTopology, searchManifold4Remote, searchCosineRemote` | topology-search-client.ts |
| `sveltekit-frontend/src/lib/server/retrieval/triton-reranker.ts` | `scoreBatchTriton, isRerankerReady, TritonRerankResult` | Triton Reranker Client |
| `sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts` | `turbovecPrefilter, turbovecSearch, turbovecHealth, TurboVecPrefilterResult` | turbovec-prefilter.ts |
| `sveltekit-frontend/src/lib/server/retrieval/turbovec-rerank.ts` | `turbovecRerank, QdrantHit, GraphRAGHints, RerankOptions` | retrieval.turbovec.rerank |
| `sveltekit-frontend/src/lib/server/retrieval/web-search.ts` | `webSearch, webSearchToUnified, formatWebResultsAsContext, WebSearchResult` | Web Search Integration — External Knowledge Retrieval |
| `sveltekit-frontend/src/lib/server/retrieval/wikipedia-search.ts` | `searchWikipedia, getWikipediaExcerpt, formatWikipediaAsContext, wikipediaToUnified` | Wikipedia Search Integration |
| `sveltekit-frontend/src/lib/agent/tools/packet-search.tool.ts` | `—` | packet.search tool |
| `sveltekit-frontend/src/lib/agent/tools/topology-status.tool.ts` | `—` | topology.status tool: Check service availability without exposing details. |

## Graph Topology Layer `GRAPH_TOPOLOGY_LAYER`

| Field | Value |
|---|---|
| domain_class | `graph_topology` |
| ontology_label | `neo4j_gds` |
| topology_label | `graph_index` |

| File | Symbols | Purpose |
|---|---|---|
| `scripts/atlas/align-neo4j-canonical-source-refs.mjs` | `—` | align-neo4j-canonical-source-refs.mjs |
| `scripts/atlas/backfill-community-id.mjs` | `—` | Priority 0: Topology Propagation Fix |
| `scripts/atlas/backfill-gds-som-topology.mjs` | `—` | scripts/atlas/backfill-gds-som-topology.mjs |
| `scripts/atlas/backfill-som-community-id.mjs` | `—` | backfill-som-community-id.mjs |
| `scripts/atlas/backfill-topology-index.mjs` | `—` | Task 8: Backfill Topology Index |
| `scripts/atlas/codebase-semantics-neo4j-report.mjs` | `—` | codebase semantics neo4j report |
| `scripts/atlas/export-neo4j-dryrun.mjs` | `—` | export neo4j dryrun |
| `scripts/atlas/export-neo4j-gds-scores.mjs` | `—` | scripts/atlas/export-neo4j-gds-scores.mjs |
| `scripts/atlas/export-neo4j-topology-evidence.mjs` | `—` | scripts/atlas/export-neo4j-topology-evidence.mjs |
| `scripts/atlas/generate-neo4j-context.mjs` | `—` | generate neo4j context |
| `scripts/atlas/ingest-topology-to-neo4j.mjs` | `—` | ingest-topology-to-neo4j.mjs |
| `scripts/atlas/lib/neo4j-http.mjs` | `—` | neo4j http |
| `scripts/atlas/neo4j-graph-enrich.mjs` | `—` | neo4j-graph-enrich.mjs  (Phase D2) |
| `scripts/atlas/phase-16-h-neo4j-bridge.mjs` | `—` | Phase 16-H.7: Neo4j Node Bridge |
| `scripts/atlas/phase-16-neo4j-gds-knn-build.mjs` | `—` | Phase 16: Neo4j GDS KNN Graph Construction |
| `scripts/atlas/phase-19c-neo4j-sync.mjs` | `—` | phase-19c-neo4j-sync.mjs |
| `scripts/atlas/phase-2-neo4j-concept-activation.mjs` | `—` | Phase 2: Neo4j USED_CONCEPT Edge Activation |
| `scripts/atlas/phase-2b-neo4j-communities.mjs` | `—` | phase-2b-neo4j-communities.mjs |
| `scripts/atlas/phase3-neo4j-sync.mjs` | `—` | phase3-neo4j-sync.mjs |
| `scripts/atlas/phase4-neo4j-sync.mjs` | `—` | phase4-neo4j-sync.mjs |
| `scripts/atlas/phase5-neo4j-sync.mjs` | `—` | phase5-neo4j-sync.mjs |
| `scripts/atlas/project-feature-matrix-neo4j.mjs` | `—` | project-feature-matrix-neo4j.mjs |
| `scripts/atlas/project-neo4j-graphrag.mjs` | `—` | project neo4j graphrag |
| `scripts/atlas/project-sourceRef-context-neo4j.mjs` | `—` | project sourceRef context neo4j |
| `scripts/atlas/seed-neo4j-bounded-khop.mjs` | `—` | @file scripts/atlas/seed-neo4j-bounded-khop.mjs |
| `scripts/atlas/seed-neo4j-bounded-used-packet-edges-normalized.mjs` | `—` | Seed: Neo4j USED_PACKET Edges (Normalized) |
| `scripts/atlas/seed-neo4j-rpc-graph.mjs` | `—` | Lane 12.3: Seed Neo4j RPC Graph |
| `scripts/atlas/seed-neo4j-used-concept-edges.mjs` | `—` | seed-neo4j-used-concept-edges.mjs |
| `scripts/atlas/sync-gds-centrality-to-postgres.mjs` | `—` | Sync Neo4j GDS centrality scores → atlas_topology_index |
| `scripts/atlas/sync-graph-truth-neo4j.mjs` | `—` | sync-graph-truth-neo4j.mjs |
| `scripts/atlas/verify-community-provenance.mjs` | `—` | verify community provenance |
| `scripts/atlas/verify-used-concept-edges.mjs` | `—` | verify-used-concept-edges.mjs |
| `scripts/atlas/write-used-concept-edges.mjs` | `—` | write-used-concept-edges.mjs |
| `scripts/atlas/write-used-concepts-live.mjs` | `—` | write-used-concepts-live.mjs |
| `sveltekit-frontend/scripts/atlas/generate-neo4j-graphrag-report.mjs` | `—` | generate neo4j graphrag report |
| `sveltekit-frontend/scripts/atlas/project-clusters-neo4j.mjs` | `—` | scripts/atlas/project-clusters-neo4j.mjs |
| `sveltekit-frontend/scripts/atlas/project-feature-matrix-neo4j.mjs` | `—` | project-feature-matrix-neo4j.mjs |
| `sveltekit-frontend/scripts/atlas/seed-neo4j-bounded-used-packet-edges.mjs` | `—` | Bounded Neo4j seed from the agent trace spine. |
| `sveltekit-frontend/scripts/graph/build-community-graph.mjs` | `—` | scripts/graph/build-community-graph.mjs |
| `sveltekit-frontend/scripts/graph/debug-gds-lookup.mjs` | `—` | debug gds lookup |
| `sveltekit-frontend/scripts/graph/write-summary-cards-neo4j.mjs` | `—` | write summary cards neo4j |

## Qdrant Layer `QDRANT_LAYER`

| Field | Value |
|---|---|
| domain_class | `vector_store` |
| ontology_label | `qdrant_mirror` |
| topology_label | `cache_mirror` |

| File | Symbols | Purpose |
|---|---|---|
| `scripts/atlas/adaptive-schema-contract-reconciler.mjs` | `—` | adaptive schema contract reconciler |
| `scripts/atlas/atlas-live-reconciliation-audit.mjs` | `—` | @fileoverview Atlas Live Reconciliation Audit Script (v1.0) |
| `scripts/atlas/audit-karpathy-mirror.mjs` | `—` | audit karpathy mirror |
| `scripts/atlas/audit-offline-vector-artifacts.mjs` | `—` | audit-offline-vector-artifacts.mjs |
| `scripts/atlas/audit-packet-contract-mirrors.mjs` | `—` | audit packet contract mirrors |
| `scripts/atlas/audit-pgvector-schema.mjs` | `—` | pgvector schema auditor. |
| `scripts/atlas/audit-postgres-contract-mirrors.mjs` | `—` | Read-only packet contract mirror audit. |
| `scripts/atlas/audit-qdrant-connectivity.mjs` | `—` | Audit Qdrant Connectivity |
| `scripts/atlas/audit-qdrant-noise.mjs` | `—` | audit-qdrant-noise.mjs |
| `scripts/atlas/audit-qdrant-postgres-payload-schema.mjs` | `—` | Audit: Qdrant Payload Schema vs Postgres atlas_codebase_packets |
| `scripts/atlas/backfill-active-topology-mirror-from-qdrant.mjs` | `—` | scripts/atlas/backfill-active-topology-mirror-from-qdrant.mjs |
| `scripts/atlas/backfill-atlas-source-refs-via-qdrant.mjs` | `—` | backfill-atlas-source-refs-via-qdrant.mjs |
| `scripts/atlas/backfill-karpathy-attention-qdrant.mjs` | `—` | backfill-karpathy-attention-qdrant.mjs |
| `scripts/atlas/backfill-qdrant-packet-keys.mjs` | `—` | Backfill Qdrant with packet_key from Postgres |
| `scripts/atlas/backfill-qdrant-payload-complete.mjs` | `—` | H.5: Backfill Qdrant Payload with canonical Postgres fields |
| `scripts/atlas/backfill-qdrant-payload-upsert.mjs` | `—` | Backfill Qdrant Payload via Upsert (Update Existing Points) |
| `scripts/atlas/backfill-qdrant-som-from-centroids.mjs` | `—` | Backfills missing Qdrant SOM payloads by projecting file chunks onto the |
| `scripts/atlas/backfill-qdrant-source-ref-hash.mjs` | `—` | backfill-qdrant-source-ref-hash.mjs |
| `scripts/atlas/backfill-qdrant-source-refs.mjs` | `—` | backfill-qdrant-source-refs.mjs |
| `scripts/atlas/configure-qdrant-memory.mjs` | `—` | Qdrant Vector & HNSW Memory Optimization Script |
| `scripts/atlas/create-qdrant-feature-maps.mjs` | `—` | create qdrant feature maps |
| `scripts/atlas/create-qdrant-payload-indexes.mjs` | `—` | create-qdrant-payload-indexes.mjs — Phase 102 T2 |
| `scripts/atlas/debug-qdrant-codebase-alignment.mjs` | `—` | debug qdrant codebase alignment |
| `scripts/atlas/debug-qdrant-legacy-ambiguous-slice.mjs` | `—` | Debug Qdrant Legacy/Ambiguous Slice |
| `scripts/atlas/debug-qdrant-postgres-mismatch-full.mjs` | `—` | Phase D: Debug Qdrant/Postgres Identity Mismatch |
| `scripts/atlas/debug-qdrant-postgres-mismatch.mjs` | `—` | Debug: Qdrant ↔ Postgres Identity Reconciliation |
| `scripts/atlas/enrich-addressable-packets-with-vectors.mjs` | `—` | enrich addressable packets with vectors |
| `scripts/atlas/enrich-qdrant-packet-payload.mjs` | `—` | Enrich: Qdrant Packet Payload |
| `scripts/atlas/gemma4-batch-summarize-qdrant.mjs` | `—` | gemma4-batch-summarize-qdrant.mjs |
| `scripts/atlas/generate-qdrant-source-cards.mjs` | `—` | generate-qdrant-source-cards.mjs — Phase 3 prerequisite |
| `scripts/atlas/index-component-profiles-qdrant.mjs` | `—` | index component profiles qdrant |
| `scripts/atlas/ingest-grpc-packets-to-qdrant.mjs` | `—` | Ingest gRPC service packets into Qdrant codebase_chunks_768. |
| `scripts/atlas/ingest-production-no-qdrant-source-refs.mjs` | `—` | Ingests the active-production Parent Atlas rows that have no Qdrant point. |
| `scripts/atlas/ingest-qdrant-to-atlas-packets.mjs` | `—` | ingest-qdrant-to-atlas-packets.mjs |
| `scripts/atlas/ingest-rpc-tools-to-qdrant.mjs` | `—` | Lane 12.1: Ingest gRPC service/method packets to Qdrant codebase_chunks_768 |
| `scripts/atlas/load-turbovec-index-from-qdrant.mjs` | `—` | load-turbovec-index-from-qdrant.mjs |
| `scripts/atlas/mirror-parent-atlas-feature-command-atlas-postgres.mjs` | `—` | mirror parent atlas feature command atlas postgres |
| `scripts/atlas/mirror-parent-atlas-to-postgres.mjs` | `—` | mirror parent atlas to postgres |
| `scripts/atlas/patch-neschrom97-qdrant-tags.mjs` | `—` | patch-neschrom97-qdrant-tags.mjs |
| `scripts/atlas/phase-16-h-4-qdrant-discovery-streaming.mjs` | `—` | Phase 16-H.4: Qdrant Discovery (Streaming, No OOM) |
| `scripts/atlas/phase-16-h-qdrant-discovery.mjs` | `—` | Phase 16-H.4: Qdrant Discovery |
| `scripts/atlas/phase-16-h-qdrant-gap-classifier.mjs` | `—` | Phase 16-H gap classifier |
| `scripts/atlas/phase-16-h-qdrant-payload-sync.mjs` | `—` | Phase 16-H.5: Qdrant Payload Canonicalization |
| `scripts/atlas/phase-19c-qdrant-index.mjs` | `—` | phase-19c-qdrant-index.mjs |
| `scripts/atlas/phase-1b-sync-som-from-qdrant.mjs` | `—` | Phase 1b: Sync SOM Cluster from Qdrant → Postgres |
| `scripts/atlas/phase-1c-backfill-qdrant-hit.mjs` | `—` | Phase 1c: Backfill Qdrant Hit Enrichment |
| `scripts/atlas/phase-2-qdrant-chunk-enrichment.mjs` | `—` | Phase 2: Qdrant Chunk Enrichment |
| `scripts/atlas/phase-d-enrich-qdrant.mjs` | `—` | Phase D: Qdrant Enrichment — Canonical Cohort Only |
| `scripts/atlas/plan-neschrom97-qdrant-tags.mjs` | `—` | Read-only planning pass for NESCHROM97 Qdrant payload enrichment. |
| `scripts/atlas/project-parent-atlas-feature-command-atlas-qdrant.mjs` | `—` | project parent atlas feature command atlas qdrant |
| `scripts/atlas/prune-junk-qdrant-chunks.mjs` | `—` | prune-junk-qdrant-chunks.mjs |
| `scripts/atlas/purge-qdrant-noise.mjs` | `—` | purge-qdrant-noise.mjs |
| `scripts/atlas/pytorch-qdrant-redis-som-index.mjs` | `—` | pytorch-qdrant-redis-som-index.mjs |
| `scripts/atlas/qdrant-cluster-tag-audit.mjs` | `—` | qdrant cluster tag audit |
| `scripts/atlas/qdrant-path-bridge.mjs` | `—` | qdrant path bridge |
| `scripts/atlas/qdrant-payload-contract-repair.mjs` | `—` | Part C: Qdrant Payload Contract Repair |
| `scripts/atlas/qdrant-postgres-mirror-reconciliation.mjs` | `—` | qdrant postgres mirror reconciliation |
| `scripts/atlas/qdrant-tag-backfill.mjs` | `—` | qdrant-tag-backfill.mjs |
| `scripts/atlas/qdrant-tag-mirror.mjs` | `—` | qdrant tag mirror |
| `scripts/atlas/qdrant-upsert-clusters.mjs` | `—` | qdrant upsert clusters |
| `scripts/atlas/qdrant-utils.mjs` | `loadCentroids, validateDim, buildPointsFromCentroids, validateVectorDim` | qdrant utils |
| `scripts/atlas/repair-packet-contract-mirrors.mjs` | `—` | Additive repair runner for packet contract mirrors. |
| `scripts/atlas/repair-qdrant-legacy-ambiguous-slice.mjs` | `—` | Repair Qdrant Legacy/Ambiguous Slice |
| `scripts/atlas/repair-qdrant-point-ids.mjs` | `—` | scripts/atlas/repair-qdrant-point-ids.mjs |
| `scripts/atlas/repair-topology-mirror.mjs` | `—` | scripts/atlas/repair-topology-mirror.mjs |
| `scripts/atlas/report-production-no-qdrant.mjs` | `—` | Reports active-production Parent Atlas rows that do not have a Qdrant point. |
| `scripts/atlas/report-production-qdrant-no-som.lib.mjs` | `normalizeSourceRef, bucketFor, isActiveCoverageRow, GENERATED_FILTER` | report production qdrant no som.lib |
| `scripts/atlas/report-production-qdrant-no-som.mjs` | `—` | Reports production atlas rows that have Qdrant points but no SOM cluster. |
| `scripts/atlas/sync-atlas-feature-map-from-qdrant.mjs` | `—` | sync-atlas-feature-map-from-qdrant.mjs |
| `scripts/atlas/sync-duckdb-mirror.mjs` | `syncDuckDBMirror` | @fileoverview Synchronizes core metadata from the codebase and graph services in |
| `scripts/atlas/sync-qdrant-from-whole-codebase-packets.mjs` | `—` | Phase D: Sync Qdrant from Whole-Codebase Packets |
| `scripts/atlas/sync-qdrant-payload-tags.mjs` | `—` | sync-qdrant-payload-tags.mjs |
| `scripts/atlas/tag-backfill-qdrant.mjs` | `—` | tag-backfill-qdrant.mjs |
| `scripts/atlas/tag-qdrant-codebase-payloads.mjs` | `—` | tag qdrant codebase payloads |
| `scripts/atlas/test-qdrant-connectivity.mjs` | `—` | Test Qdrant connectivity |
| `scripts/atlas/upsert-qdrant-packet-payload.mjs` | `—` | upsert-qdrant-packet-payload.mjs |
| `scripts/atlas/vector64-dryrun.mjs` | `—` | vector64-dryrun.mjs |
| `scripts/atlas/verify-qdrant-legacy-ambiguous-slice.mjs` | `—` | Verify Qdrant Legacy/Ambiguous Slice Repair |
| `scripts/atlas/verify-qdrant-packet-payload.mjs` | `—` | verify-qdrant-packet-payload.mjs |
| `scripts/atlas/wire-atlas-qdrant.mjs` | `—` | wire-atlas-qdrant.mjs |
| `scripts/atlas/wire-bifrost-packet-mirror.mjs` | `—` | Mirrors Bifrost packet data from the Postgres atlas_higher_hop_index table to Re |
| `scripts/atlas/wire-redis-centroid-mirror.mjs` | `—` | wire redis centroid mirror |
| `sveltekit-frontend/scripts/atlas/audit-postgres-contract-mirrors.mjs` | `—` | audit postgres contract mirrors |
| `sveltekit-frontend/scripts/atlas/audit-qdrant-payload-contract.mjs` | `—` | audit-qdrant-payload-contract.mjs |
| `sveltekit-frontend/scripts/atlas/backfill-qdrant-payload-complete.mjs` | `—` | Backfill the canonical Phase D/E Qdrant payload contract. |
| `sveltekit-frontend/scripts/atlas/backfill-qdrant-source-refs.mjs` | `—` | backfill qdrant source refs |
| `sveltekit-frontend/scripts/atlas/classify-qdrant-orphans.mjs` | `—` | classify-qdrant-orphans.mjs |
| `sveltekit-frontend/scripts/atlas/compress-manifold-vectors.mjs` | `—` | scripts/atlas/compress-manifold-vectors.mjs |
| `sveltekit-frontend/scripts/atlas/debug-qdrant-postgres-mismatch.mjs` | `—` | Debug Qdrant/Postgres Mismatch |
| `sveltekit-frontend/scripts/atlas/index-task-distillates-qdrant-v2.mjs` | `—` | scripts/atlas/index-task-distillates-qdrant.mjs |
| `sveltekit-frontend/scripts/atlas/index-task-distillates-qdrant.mjs` | `—` | scripts/atlas/index-task-distillates-qdrant.mjs |
| `sveltekit-frontend/scripts/atlas/patch-qdrant-feature-ids.mjs` | `—` | patch-qdrant-feature-ids.mjs |
| `sveltekit-frontend/scripts/atlas/phase-d-enrich-qdrant.mjs` | `—` | Phase D: Qdrant Enrichment — Canonical Cohort Only |
| `sveltekit-frontend/scripts/atlas/qdrant-tag-backfill.mjs` | `—` | qdrant-tag-backfill.mjs |
| `sveltekit-frontend/scripts/atlas/reconcile-qdrant-postgres-payloads.mjs` | `—` | reconcile-qdrant-postgres-payloads.mjs |
| `sveltekit-frontend/scripts/atlas/sync-qdrant-metadata-by-source.mjs` | `—` | Sync metadata to Qdrant points by source_ref matching |
| `sveltekit-frontend/scripts/atlas/sync-qdrant-packet-payload.mjs` | `—` | Sync canonical packet metadata from Postgres atlas_packets to Qdrant codebase_ch |
| `sveltekit-frontend/scripts/atlas/verify-qdrant-packet-payload.mjs` | `—` | verify qdrant packet payload |

## SOM / Cluster Layer `SOM_CLUSTER_LAYER`

| Field | Value |
|---|---|
| domain_class | `som_clustering` |
| ontology_label | `som_cluster` |
| topology_label | `cluster_node` |

| File | Symbols | Purpose |
|---|---|---|
| `scripts/atlas/backfill-gds-som-topology.mjs` | `—` | scripts/atlas/backfill-gds-som-topology.mjs |
| `scripts/atlas/backfill-packet-cluster-id.mjs` | `—` | backfill-packet-cluster-id.mjs |
| `scripts/atlas/backfill-qdrant-som-from-centroids.mjs` | `—` | Backfills missing Qdrant SOM payloads by projecting file chunks onto the |
| `scripts/atlas/backfill-som-community-id.mjs` | `—` | backfill-som-community-id.mjs |
| `scripts/atlas/backfill-som-coordinates.mjs` | `—` | backfill-som-coordinates.mjs |
| `scripts/atlas/batch-cluster-summarizer.mjs` | `—` | @fileoverview Batch Cluster Summarizer Script |
| `scripts/atlas/bridge-gpu-clusters-to-atlas-feature-map.mjs` | `—` | bridge-gpu-clusters-to-atlas-feature-map.mjs |
| `scripts/atlas/cluster-attribution-pipeline.mjs` | `—` | cluster-attribution-pipeline.mjs — Phase 3: Cluster Attribution |
| `scripts/atlas/graphify-cluster-summaries.mjs` | `—` | graphify-cluster-summaries.mjs |
| `scripts/atlas/graphrag-cluster-recommendations.mjs` | `—` | graphrag cluster recommendations |
| `scripts/atlas/load-som-packets-to-redis.mjs` | `—` | load-som-packets-to-redis.mjs |
| `scripts/atlas/logger-analytics-clustering-health-patch-a.mjs` | `—` | Part A: Logger Fallback Patch |
| `scripts/atlas/logger-analytics-clustering-health.mjs` | `—` | Analytics & Clustering Health Logger |
| `scripts/atlas/logger-atlas-clustering-health.mjs` | `—` | Atlas Clustering Health Baseline Logger |
| `scripts/atlas/phase-16-h-som-repair.mjs` | `—` | Phase 16-H.3: SOM Repair |
| `scripts/atlas/phase-16-train-som-20x20.mjs` | `—` | Phase 16: Train 20x20 Self-Organizing Map (SOM) |
| `scripts/atlas/phase-1b-gpu-kmeans-som.mjs` | `—` | Phase 1b: GPU K-means → SOM Cluster Assignment |
| `scripts/atlas/phase-1b-som-backfill-heuristic.mjs` | `—` | Phase 1b: SOM Backfill for Unmatched Packets (Heuristic) |
| `scripts/atlas/phase-1b-sync-som-from-qdrant.mjs` | `—` | Phase 1b: Sync SOM Cluster from Qdrant → Postgres |
| `scripts/atlas/phase-1c-backfill-som-cluster.mjs` | `—` | Phase 1c: Backfill SOM Cluster Enrichment |
| `scripts/atlas/phase-1d-redis-som-cell-cache.mjs` | `—` | Phase 1d: Redis SOM Cell Cache Population |
| `scripts/atlas/phase-2c-backfill-som.mjs` | `—` | phase-2c-backfill-som.mjs |
| `scripts/atlas/pytorch-qdrant-redis-som-index.mjs` | `—` | pytorch-qdrant-redis-som-index.mjs |
| `scripts/atlas/qdrant-cluster-tag-audit.mjs` | `—` | qdrant cluster tag audit |
| `scripts/atlas/qdrant-upsert-clusters.mjs` | `—` | qdrant upsert clusters |
| `scripts/atlas/report-production-qdrant-no-som.lib.mjs` | `normalizeSourceRef, bucketFor, isActiveCoverageRow, GENERATED_FILTER` | report production qdrant no som.lib |
| `scripts/atlas/report-production-qdrant-no-som.mjs` | `—` | Reports production atlas rows that have Qdrant points but no SOM cluster. |
| `scripts/atlas/som-clustering-pipeline.mjs` | `—` | som-clustering-pipeline.mjs |
| `scripts/atlas/sync-cluster-tags-redis.mjs` | `—` | sync-cluster-tags-redis.mjs |
| `scripts/atlas/sync-task-cluster-links.mjs` | `—` | sync-task-cluster-links.mjs  (Phase 102 — T1) |
| `scripts/atlas/train-som-20x20.mjs` | `—` | Train SOM: 20×20 Self-Organizing Map on latent-64 space |
| `scripts/atlas/update-db-clusters-som.mjs` | `—` | update db clusters som |
| `scripts/atlas/warmup-bifrost-clusters.mjs` | `—` | scripts/atlas/warmup-bifrost-clusters.mjs |
| `sveltekit-frontend/scripts/atlas/append_clusters_to_parent_atlas.mjs` | `—` | append clusters to parent atlas |
| `sveltekit-frontend/scripts/atlas/apply_clusters_via_sql.mjs` | `—` | apply clusters via sql |
| `sveltekit-frontend/scripts/atlas/audit-som-coordinate-coverage.mjs` | `—` | audit som coordinate coverage |
| `sveltekit-frontend/scripts/atlas/audit-som-coverage-gaps.mjs` | `—` | audit som coverage gaps |
| `sveltekit-frontend/scripts/atlas/backfill-som-coordinates-from-report.mjs` | `—` | backfill som coordinates from report |
| `sveltekit-frontend/scripts/atlas/backfill-som-from-existing-topology.mjs` | `—` | backfill som from existing topology |
| `sveltekit-frontend/scripts/atlas/cache-hypergraph-cluster-cards.mjs` | `—` | cache-hypergraph-cluster-cards.mjs |
| `sveltekit-frontend/scripts/atlas/derive-cluster-feature-ids.mjs` | `—` | derive-cluster-feature-ids.mjs |
| `sveltekit-frontend/scripts/atlas/extract-cluster-aliases.mjs` | `—` | scripts/atlas/extract-cluster-aliases.mjs |
| `sveltekit-frontend/scripts/atlas/hot-keyword-cluster-summary.mjs` | `—` | hot keyword cluster summary |
| `sveltekit-frontend/scripts/atlas/mapreduce/som_prepare.mjs` | `—` | som prepare |
| `sveltekit-frontend/scripts/atlas/project-clusters-neo4j.mjs` | `—` | scripts/atlas/project-clusters-neo4j.mjs |
| `sveltekit-frontend/scripts/atlas/search-clusters-lexical.mjs` | `—` | scripts/atlas/search-clusters-lexical.mjs |
| `sveltekit-frontend/scripts/atlas/smoke-rg-cluster-pivot.mjs` | `—` | smoke-rg-cluster-pivot.mjs |
| `sveltekit-frontend/scripts/atlas/warmup-bifrost-clusters.mjs` | `—` | warmup bifrost clusters |
| `scripts/docs-atlas/autoencode-som-clustering.mjs` | `—` | autoencode som clustering |
| `scripts/graph/build-clusters.mjs` | `—` | build clusters |
| `scripts/migrate-qdrant-clusters.ts` | `—` | Qdrant Clustering Payload Migration |
| `scripts/smoke/smoke-som-packet-crud.mjs` | `—` | smoke-som-packet-crud.mjs |
| `scripts/tests/report-production-qdrant-no-som.test.mjs` | `—` | report production qdrant no som.test |
| `scripts/tests/smoke-atlas-cluster-worker.mjs` | `—` | scripts/tests/smoke-atlas-cluster-worker.mjs |
| `sveltekit-frontend/scripts/agents/som-cluster-cards.mjs` | `—` | som-cluster-cards.mjs — producer script (stub for tests) |
| `sveltekit-frontend/scripts/cluster-summarize.ts` | `—` | ACE Cluster Summarization Script |
| `sveltekit-frontend/scripts/export-cluster-summaries.mjs` | `—` | Exports `cluster_summaries` (Postgres) joined with code_llm_index hit density |
| `sveltekit-frontend/scripts/graph/build-cluster-llms-index.mjs` | `—` | build-cluster-agents-index.mjs |
| `sveltekit-frontend/scripts/graphify-cluster-pagerank.mjs` | `—` | graphify-cluster-pagerank.mjs |
| `sveltekit-frontend/scripts/graphify-neo4j-clusters.mjs` | `—` | scripts/graphify-neo4j-clusters.mjs |
| `sveltekit-frontend/scripts/graphify-semantic-cluster.mjs` | `—` | graphify-semantic-cluster.mjs — Phase B: Semantic cluster mapping |
| `sveltekit-frontend/scripts/graphify-som-cluster-summaries.mjs` | `—` | scripts/graphify-som-cluster-summaries.mjs |
| `sveltekit-frontend/scripts/graphify-som-topology.mjs` | `—` | Graphify SOM Topology — hypergraph cluster → SOM grid mapping |
| `sveltekit-frontend/scripts/hypergraph-cluster-digest.mjs` | `—` | hypergraph-cluster-digest.mjs |
| `sveltekit-frontend/scripts/karpathy-qdrant-cluster-backfill.ts` | `—` | karpathy qdrant cluster backfill |
| `sveltekit-frontend/scripts/llms/som-cluster-cards.mjs` | `—` | AGENTS card SOM clustering → DAG ingestion → KAG/ACE Redis hits |
| `sveltekit-frontend/scripts/mirror-qdrant-clusters-to-postgres.mjs` | `—` | mirror-qdrant-clusters-to-postgres.mjs |
| `sveltekit-frontend/scripts/normalize-cluster-keys.mjs` | `—` | normalize-cluster-keys.mjs |
| `sveltekit-frontend/scripts/patch-cluster-embeddings.ts` | `—` | patch-cluster-embeddings.ts |
| `sveltekit-frontend/scripts/phase104-backups/src/lib/server/ai/som-bitmap-visualizer.ts` | `encodeEmbeddingToBitmap, bitmapToDataUrl, SOMBitmapResult` | som bitmap visualizer |
| `sveltekit-frontend/scripts/phase104-backups/src/lib/services/gpu-cluster-acceleration.ts` | `GPUClusterManager, GPUContext, GPUWorkload` | gpu cluster acceleration |
| `sveltekit-frontend/scripts/phase104-backups/src/lib/services/gpu-som-embeddings.ts` | `GPUSOMEmbeddings` | gpu som embeddings |
| `sveltekit-frontend/scripts/phase104-backups/src/lib/services/webgpu-som-enhanced-cache.ts` | `webgpuSOMCache` | webgpu som enhanced cache |
| `sveltekit-frontend/scripts/phase104-backups/src/lib/services/webgpu-som-error-fixer.ts` | `InputProps, MinIOService` | webgpu som error fixer |
| `sveltekit-frontend/scripts/qdrant-cluster-collection.mjs` | `—` | qdrant cluster collection |
| `sveltekit-frontend/scripts/seed-redis-clusters.js` | `—` | seed redis clusters |
| `sveltekit-frontend/scripts/smoke-cluster-cards.mjs` | `—` | smoke-cluster-cards.mjs — Quick sanity check for /api/clusters/cards |
| `sveltekit-frontend/scripts/smoke-som-bmu.mjs` | `—` | smoke-som-bmu.mjs |
| `sveltekit-frontend/scripts/start-trace-mcp-cluster.mjs` | `—` | start-trace-mcp-cluster.mjs |
| `sveltekit-frontend/scripts/summarize-clusters-pg.ts` | `—` | summarize-clusters-pg.ts — Gemma4 cluster summaries with agentic tool calling. |
| `sveltekit-frontend/scripts/sync-cluster-summaries-to-qdrant.mjs` | `—` | Sync cluster_summaries (Postgres) → Qdrant `cluster_narratives` + Redis cache. |
| `sveltekit-frontend/scripts/sync-clusters-to-kag.mjs` | `—` | sync-clusters-to-kag.mjs |
| `sveltekit-frontend/scripts/tests/fix-cluster4.mjs` | `—` | fix cluster4 |
| `sveltekit-frontend/scripts/validate-qdrant-cluster-tags.mjs` | `—` | validate-qdrant-cluster-tags.mjs |
| `sveltekit-frontend/scripts/warm-forest-clusters.mjs` | `—` | warm-forest-clusters.mjs — Seed cluster:forest:embed:* in Redis |
| `sveltekit-frontend/scripts/wiki/backfill-qdrant-cluster-keys.mjs` | `—` | gap_synth_003 backfill — patch cluster_key + agents_scope into codebase_chunks_7 |

## Runtime Evidence Layer `RUNTIME_EVIDENCE_LAYER`

| Field | Value |
|---|---|
| domain_class | `runtime_evidence` |
| ontology_label | `route_packet` |
| topology_label | `evidence_collector` |

| File | Symbols | Purpose |
|---|---|---|
| `scripts/atlas/collect-runtime-evidence.mjs` | `—` | scripts/atlas/collect-runtime-evidence.mjs |
| `scripts/atlas/report-route-runtime-packets.mjs` | `—` | scripts/atlas/report-route-runtime-packets.mjs |
| `scripts/atlas/route-runtime-packet-recommendations.mjs` | `—` | scripts/atlas/route-runtime-packet-recommendations.mjs |
| `sveltekit-frontend/scripts/atlas/materialize-route-runtime-packets.mjs` | `—` | materialize route runtime packets |
| `scripts/tests/smoke-route-runtime-packets.mjs` | `—` | scripts/tests/smoke-route-runtime-packets.mjs |

## ACE / Agent Layer `ACE_AGENT_LAYER`

| Field | Value |
|---|---|
| domain_class | `ace_context` |
| ontology_label | `ace_assembly` |
| topology_label | `context_planner` |

| File | Symbols | Purpose |
|---|---|---|
| `sveltekit-frontend/src/lib/server/ace/ace-agent.ts` | `runAceAgentQuery, ACE_TOOLS, AceAgentResult` | ace-agent.ts — Multi-step Gemma 4 agentic loop for ACE code-intel queries. |
| `sveltekit-frontend/src/lib/server/ace/ace-hit-tagger.ts` | `tagAceHits, getChunkHitCount, getChunkHitCountBulk, syncHitCountsToQdrant` | ACE Hit Tagger — marks Qdrant codebase chunks that are selected by ACE synthesis |
| `sveltekit-frontend/src/lib/server/ace/auto-tagger.ts` | `autoTagDocument, AutoTagResult` | Auto-Tagger Pipeline |
| `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` | `—` | context assembler |
| `sveltekit-frontend/src/lib/server/ace/context-cache-planner.ts` | `buildAceContextPlannerState, loadAceContextPlannerHit, storeAceContextPlannerHit, AceContextPlannerState` | context cache planner |
| `sveltekit-frontend/src/lib/server/ace/context-cache-registry.ts` | `buildAceContextRegistryPacket, toFeatureWikiPacket, writeAceContextRegistry, readAceContextRegistry` | context cache registry |
| `sveltekit-frontend/src/lib/server/ace/feature-context-cache.ts` | `sanitizeTelemetry, getCachedPacket, setCachedPacket, invalidatePacket` | feature-context-cache.ts |
| `sveltekit-frontend/src/lib/server/ace/gemma4-codeintel.ts` | `createEmptyGemmaStageTimings, buildGemma4AcePrompt, callGemma4WithAceContext, callGemma4WithTools` | gemma4-codeintel.ts — Gemma4 prompt builder + LLM caller for CodeIntel ACE conte |
| `sveltekit-frontend/src/lib/server/ace/kag-dag-runner.ts` | `—` | kag dag runner |
| `sveltekit-frontend/src/lib/server/ace/llm-context-cache.ts` | `buildContextCacheKey, getContextCachePath, normalizeCachedContextPacket, getContextCache` | llm context cache |
| `sveltekit-frontend/src/lib/server/ace/query-router.ts` | `routeQuery, QueryRouterOpts, RouteTrace, QueryRouterResult` | query-router.ts |
| `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts` | `getAdaptiveTopK, runCHR97Search, assembleACEContext, persistACEChunks` | ACE Context Assembler — Central Orchestration Module |
| `sveltekit-frontend/src/lib/server/features/ai/ace/gemma4-packet-compiler.ts` | `compilePacketWithGemma4, PacketFact, PacketEdge, PacketState` | gemma4-packet-compiler.ts |
| `sveltekit-frontend/src/lib/server/features/ai/ace/kag-dag-runner.ts` | `KagDagRunner, DagNodeName, DagContext, DagNode` | kag dag runner |

