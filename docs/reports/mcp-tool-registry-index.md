# Parent Atlas MCP Tool Registry Index

**Generated**: 2026-09-04T15:58:39.323Z
**Sources**: C:\Users\james\Videos\deeds-web-app\docs\reports\mcp-tool-ontology.json | C:\Users\james\Videos\deeds-web-app\docs\reports\mcp-tool-manifest-packets.json
**Unique tools**: 337
**Trace tools**: 173
**Manifest tools**: 206
**RPC methods**: 74

## Index
- [IDENTITY](#identity) (5)
- [MEMORY](#memory) (2)
- [CACHE](#cache) (28)
- [LEXICAL](#lexical) (53)
- [DENSE](#dense) (33)
- [GRAPH](#graph) (40)
- [RERANK](#rerank) (6)
- [SYNTHESIS](#synthesis) (31)
- [OPS](#ops) (12)
- [READ](#read) (5)
- [UNKNOWN](#unknown) (122)

## Executive Summary

The Parent Atlas MCP tool registry contains 40 tools organized by category, primarily focused on codebase search, retrieval, and knowledge management. Most tools write to Postgres, with several reading from Redis, Qdrant, Neo4j, and other services. Search tools use hybrid approaches combining lexical ripgrep, dense vector embeddings in Qdrant, and graph metadata from Neo4j. Memory and caching tools leverage a three-tier system spanning Redis, Postgres, and Qdrant. Identity and audit tools validate data parity across services, while graph tools navigate SOM clusters and knowledge graphs. Additional tools handle legal research, GPU attention, image enrichment, and operational diagnostics, with several tools reading from multiple backing services to provide comprehensive context retrieval.

## IDENTITY

Layer identity contains 5 tools. 4 expose identity fields and 3 write surfaces. Top-ranked tools: atlas.identity_audit, marco_rerank_chunks, schema-dependents:find, atlas.source_refs, atlas.query.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 4 | `atlas.identity_audit` | manifest-packets | 368 | source_ref, packet_key | postgres | Validate packet_key, source_ref, content_hash parity across Postgres, Qdrant, Neo4j, and Redis. |
| 12 | `marco_rerank_chunks` | manifest-packets | 274 | feature_id, source_ref | postgres | Rerank chunks after retrieval using canonical packet-envelope signals (AST, LangExtract, Qdrant, source_ref, title_id, … |
| 14 | `schema-dependents:find` | manifest-packets | 272 | feature_id, source_ref, packet_key | postgres | Find all files/functions that depend on a database table. Returns Neo4j USES_DB edges (source_ref, operation, line_num)… |
| 91 | `atlas.source_refs` | trace-mcp | 112 | source_ref | — | Return the top sourceRefs from the compact Atlas packet. |
| 93 | `atlas.query` | trace-mcp | 104 | — | — | Atlas alias for ranked technical search. Returns the same compact hit list as kb.trace_search for a query. |

## MEMORY

Layer memory contains 2 tools. 0 expose identity fields and 1 write surfaces. Top-ranked tools: memory:prior_answer_lookup, engram.chat_memory_recent.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 2 | `memory:prior_answer_lookup` | manifest-packets | 421 | — | postgres | Look up a prior LLM answer from the 3-tier cache (Redis L1 → Postgres L2 → Qdrant L3 semantic). Returns compressed Code… |
| 96 | `engram.chat_memory_recent` | trace-mcp | 99 | — | — | Read-only recent chat memory lookup from engram_cards. |

## CACHE

Layer cache contains 28 tools. 0 expose identity fields and 14 write surfaces. Top-ranked tools: wiki.search, ace.compact_search, karpathy.attention_rank_files, wiki.status, ops.fixer_semantic_recall.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 1 | `wiki.search` | trace-mcp, manifest-packets | 496 | — | postgres | Searches the codebase wiki (Karpathy/AGENTS) using a hybrid approach: lexical ripgrep, graph metadata, and semantic Qdr… |
| 7 | `ace.compact_search` | trace-mcp | 350 | — | — | Token-budgeted semantic search returning a compact context tree. Use this instead of reading full files when you need f… |
| 8 | `karpathy.attention_rank_files` | trace-mcp | 348 | — | — | Rank files by attention score (Karpathy blend). Embeds query via embeddinggemma, fetches Karpathy scores from Redis, re… |
| 10 | `wiki.status` | trace-mcp, manifest-packets | 328 | — | postgres | Returns high-level status of the codebase knowledge base (Karpathy/AGENTS). includes page count, last updated, and stal… |
| 11 | `ops.fixer_semantic_recall` | trace-mcp | 310 | — | — | Recalls known fix templates via Redis L1 → Postgres L2 → Qdrant semantic L3. Call before LLM analysis to skip redundant… |
| 15 | `legal.check_services` | trace-mcp | 270 | — | — | Probe all 9 backing services (Postgres, Redis, Qdrant, Neo4j, Ollama, RabbitMQ, CouchDB, SeaweedFS, Obsidian) and repor… |
| 16 | `codebase:export_bundle` | manifest-packets | 260 | — | postgres | Return the unified codebase indexing export bundle: graph (nodes + edges), cluster summaries (purpose + patterns + warn… |
| 17 | `startup:briefing` | manifest-packets | 260 | — | postgres | Read-only access to the startup briefing state artifact. Returns system status (Postgres, Redis, Qdrant, Neo4j), covera… |
| 24 | `cluster.summary.refresh` | manifest-packets | 246 | — | postgres | Re-run LLM summarization for a cluster and store the new embedding. Use force=true to bypass cache. |
| 27 | `ops.gpu_attention` | trace-mcp | 238 | — | — | GPU scaled dot-product attention over a flat key matrix. Returns softmax attention weights per key. Results are Redis-c… |
| 31 | `ops.update_LLMS.md` | trace-mcp | 226 | — | — | Append a new fact, rule, or tool note to a directory LLMS.md file and flush to Redis. Use this after discovering someth… |
| 39 | `karpathy.som_topology_stats` | trace-mcp | 186 | — | — | Get SOM topology statistics: grid dimensions, cluster occupancy, centroid stats. Reads from Redis cached SOM state (gpu… |
| 41 | `engram.chat_memory_store` | trace-mcp | 181 | — | engram | Append a chat turn to user memory store (Redis sorted set + bounded trim). |
| 42 | `atlas.embedding_cluster_tags` | trace-mcp | 180 | — | — | Assign SOM cluster tags to a 768-dimensional embedding by matching against cached SOM centroids in Redis. |
| 43 | `atlas.embedding_keywords` | trace-mcp | 180 | — | — | Extract top-K keywords from a 768-dimensional source embedding using cosine similarity to cached keyword centroids in R… |
| 44 | `evidence.image_feedback` | trace-mcp | 180 | — | — | Record thumbs-up or thumbs-down on a visual search result. Votes accumulate in Redis; Qdrant payload (trust_score, user… |
| 45 | `legal.transcribe_video` | trace-mcp | 180 | — | — | Queue a video URL for non-blocking background processing via RabbitMQ: yt-dlp download → FFmpeg audio extraction → Whis… |
| 46 | `agents_md` | manifest-packets | 176 | — | postgres | Resolve the nearest AGENTS.md file for a given source path. Checks Redis first (agents:dir:<path>) then walks up the di… |
| 55 | `analytics:research_topics` | manifest-packets | 166 | — | postgres | Query the Redis-cached JSONL research index: qlora_examples joined with response_feedback, |
| 56 | `analytics:unified_research` | manifest-packets | 166 | — | postgres | Unified research query orchestrating: research-cache (qlora × feedback), |
| 71 | `engram.ace_packet_inject` | trace-mcp | 162 | — | engram | Write ACE context packet to Redis with 1h TTL: ace:packet:{runId}. |
| 83 | `ops.verify_write` | trace-mcp | 150 | — | — | Proves that a write actually occurred by reading the target back and computing its hash. A write is NOT proven merely b… |
| 97 | `atlas_get_active_context` | trace-mcp | 96 | — | — | Read the newest bounded ACE reconciliation packet from Redis Valkey, validate it, and return compact resume context. |
| 98 | `context.build_ace_packet` | trace-mcp | 96 | — | — | Build and persist a bounded ACE packet from a sourceRef or markdown content. Reads a local file when sourceRef resolves… |
| 121 | `engram.redis_health` | trace-mcp | 86 | — | redis | Check Redis availability used by engram memory tools. |
| 122 | `inference:route` | manifest-packets | 86 | — | postgres | Route an inference request through the optimal backend: TRT→Triton→Bifrost→Ollama cascade. Direct import bypasses HTTP … |
| 142 | `redis` | manifest-packets | 82 | — | postgres |  |
| 143 | `redis_only` | manifest-packets | 82 | — | postgres |  |

## LEXICAL

Layer lexical contains 53 tools. 0 expose identity fields and 48 write surfaces. Top-ranked tools: codebase:search, search.go_hybrid, kag.recall_similar_fix, kb.search_cards, chunk.lookup.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 3 | `codebase:search` | manifest-packets | 414 | — | postgres | Semantic code search using dual-vector (content + signature) embeddings in Qdrant. Uses 768-dim embeddinggemma vectors … |
| 9 | `search.go_hybrid` | trace-mcp, manifest-packets | 341 | — | postgres | Go search service RRF fusion: parallel FTS + pgvector + Qdrant with reciprocal rank fusion. Faster than in-process hybr… |
| 19 | `kag.recall_similar_fix` | trace-mcp | 255 | — | — | Recalls prior fixes for an error via exact-hash + pg_trgm similarity over error_fingerprints. |
| 20 | `kb.search_cards` | manifest-packets | 252 | — | postgres | Search the knowledge base for codebase "cards" (identity-spine chunks). Returns ranked cards with stable IDs (card:path… |
| 21 | `chunk.lookup` | manifest-packets | 248 | — | postgres | Look up a single codebase chunk by its Qdrant ID. Returns path, kind, domain, cluster, semantic tags. |
| 22 | `topology_search` | manifest-packets | 248 | — | postgres | Search the 4D topology-indexed codebase using cosine prefilter (Qdrant 768-dim) |
| 23 | `wiki_encyclopedia_search` | manifest-packets | 248 | — | postgres | Topological encyclopedia route that takes a query, searches Karpathy wiki + Qdrant + SOM clusters, returns did-you-mean… |
| 25 | `TurboVecService.Search` | manifest-packets | 246 | — | postgres | gRPC RPC TurboVecService.Search: TurboSearchRequest → TurboSearchResponse (declared in proto/active/turbovec.proto). |
| 26 | `codebase:ace_context` | manifest-packets | 240 | — | postgres | Run full ACE (Agentic Contextual Engineering) synthesis with optional codebase/AST context. Assembles user profile, cas… |
| 54 | `legal.find_similar_opinions` | trace-mcp | 168 | — | — | Find similar case opinions, judgments, and rulings via Qdrant semantic search on the legal_documents collection filtere… |
| 63 | `codebase:concurrent_research` | manifest-packets | 164 | — | postgres | LangGraph-style concurrent deep research over codebase_chunks_768. |
| 64 | `codebase.rg_search` | manifest-packets | 164 | — | postgres | Controlled ripgrep search over the codebase. Returns line hits from relative repo paths and is safe for exact symbol or… |
| 65 | `kb.expand_neighbors` | manifest-packets | 164 | — | postgres | Expand the topological neighborhood of a card or file using graph relationships. Returns structurally-related cards bas… |
| 66 | `kb.explain_retrieval` | manifest-packets | 164 | — | postgres | Provide an audit trace for why a specific card or search result was retrieved. Includes cluster dominance, community pu… |
| 67 | `kb.rg_atlas_search` | manifest-packets | 164 | — | postgres | Full RG-Atlas search pipeline: rg lexical sweep → GPU Karpathy blend → |
| 68 | `research:reddit_search` | manifest-packets | 164 | — | postgres | Search Reddit posts for community knowledge. Always uses raw_json=1 to prevent |
| 69 | `RetrievalService.ExpandAstNeighbors` | manifest-packets | 164 | — | postgres | gRPC RPC RetrievalService.ExpandAstNeighbors: AstExpansionRequest → AstExpansionResponse (declared in sveltekit-fronten… |
| 72 | `research:search_chunks` | manifest-packets | 162 | — | postgres | Semantic search over the chunks_web_search collection. Returns ranked results from |
| 73 | `kag.multi_lane_search` | trace-mcp | 160 | — | — | Performs 11-lane HyperRAG retrieval across hash, n-gram, graph, feature atlas, and activity prefetch lanes. Returns ran… |
| 74 | `analytics:codebase_research` | manifest-packets | 158 | — | postgres | Deep research codebase scanner using ripgrep pattern analysis, pipeline hit distribution, |
| 75 | `analytics:web_research` | manifest-packets | 158 | — | postgres | Run web research for selfPrompt queries: SearXNG/Google/DDG search → 768-dim embedding → |
| 76 | `CyberElephantService.ProcessDocuments` | manifest-packets | 158 | — | postgres | gRPC RPC CyberElephantService.ProcessDocuments: DocumentBatch → VectorSearchResponse (declared in proto/active/vectors.… |
| 77 | `CyberElephantService.SearchSimilar` | manifest-packets | 158 | — | postgres | gRPC RPC CyberElephantService.SearchSimilar: VectorQuery → VectorSearchResponse (declared in proto/active/vectors.proto… |
| 78 | `evidence:analyze_multimodal` | manifest-packets | 158 | — | postgres | GPU-accelerated multimodal evidence analysis (images/videos/audio): YOLO object detection, Whisper transcription, CLIP … |
| 79 | `evidence:search_similar` | manifest-packets | 158 | — | postgres | Cross-modal semantic search: find visually or acoustically similar evidence using CLIP/Whisper embeddings. Query with t… |
| 82 | `analytics:deep_research` | manifest-packets | 150 | — | postgres | Generate personalized deep research topics from RAG/KAG/DAG/ACE hit analytics, |
| 84 | `reports:generate_from_template` | manifest-packets | 150 | — | postgres | Generate a report from a legal template (charging memo, search warrant affidavit, case summary, evidence inventory, wit… |
| 134 | `search.hybrid` | trace-mcp | 84 | — | — | Performs hybrid (FTS + semantic) search across the codebase. |
| 157 | `search.postgres_fts` | trace-mcp | 80 | — | — | Code search using PostgreSQL Full Text Search. |
| 170 | `citations:search` | manifest-packets | 74 | — | postgres | Search legal citations across cases. Returns matching citations with source, page, and relevance. |
| 171 | `codebase:rg_search` | manifest-packets | 74 | — | postgres | Fast ripgrep search over the SvelteKit codebase. Supports regex patterns and file-type |
| 172 | `CodeIntelService.LookupChunk` | manifest-packets | 74 | — | postgres | gRPC RPC CodeIntelService.LookupChunk: ChunkLookupRequest → ChunkLookupResponse (declared in proto/active/codeintel.pro… |
| 173 | `compose:pipeline` | manifest-packets | 74 | — | postgres | Chain multiple tools sequentially. Each step can reference previous results via {{stepN.field}} template syntax. Exampl… |
| 174 | `kb.get_card` | manifest-packets | 74 | — | postgres | Retrieve the full content and high-fidelity metadata for a specific knowledge card by ID. Use this when you have a card… |
| 175 | `kb.search_schema_contract` | manifest-packets | 74 | — | postgres | Semantic search across the standalone schema-indexer contract cards. Use for schema-focused prompt context engineering … |
| 176 | `langextract:custom` | manifest-packets | 74 | — | postgres | Custom structured extraction with user-defined prompt and few-shot examples. Flexible for any domain (medical, financia… |
| 177 | `LibrarySearchService.GetDocumentToc` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.GetDocumentToc: TocRequest → TocResponse (declared in sveltekit-frontend/proto/active/lib… |
| 178 | `LibrarySearchService.GetNodeContext` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.GetNodeContext: NodeContextRequest → NodeContextResponse (declared in sveltekit-frontend/… |
| 179 | `LibrarySearchService.Health` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.Health: HealthRequest → HealthResponse (declared in sveltekit-frontend/proto/active/libra… |
| 180 | `LibrarySearchService.ResolveCitation` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.ResolveCitation: CitationRequest → CitationResponse (declared in sveltekit-frontend/proto… |
| 181 | `LibrarySearchService.SearchLibrary` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.SearchLibrary: LibrarySearchRequest → LibrarySearchResponse (declared in sveltekit-fronte… |
| 182 | `LibrarySearchService.StreamLibrary` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.StreamLibrary: LibrarySearchRequest → LibrarySearchEvent (declared in sveltekit-frontend/… |
| 183 | `rag:search` | manifest-packets | 74 | — | postgres | Perform a semantic search across legal documents and web |
| 184 | `research:github_search` | manifest-packets | 74 | — | postgres | Search GitHub issues, code, or repositories for deep research context. |
| 185 | `RetrievalService.GetClusterSummary` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.GetClusterSummary: ClusterSummaryRequest → ClusterSummaryResponse (declared in sveltekit-fron… |
| 186 | `RetrievalService.GetResearchContext` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.GetResearchContext: ResearchContextRequest → ResearchContextResponse (declared in sveltekit-f… |
| 187 | `RetrievalService.Health` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.Health: HealthRequest → HealthResponse (declared in sveltekit-frontend/proto/active/retrieval… |
| 188 | `RetrievalService.SearchChunks` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.SearchChunks: SearchChunksRequest → SearchChunksResponse (declared in sveltekit-frontend/prot… |
| 189 | `RetrievalService.SearchCodebase` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.SearchCodebase: CodebaseSearchRequest → CodebaseSearchResponse (declared in sveltekit-fronten… |
| 190 | `RetrievalService.SearchEvidence` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.SearchEvidence: EvidenceSearchRequest → EvidenceSearchResponse (declared in sveltekit-fronten… |
| 191 | `RetrievalService.StreamCodebase` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.StreamCodebase: CodebaseSearchRequest → CodebaseChunkEvent (declared in sveltekit-frontend/pr… |
| 192 | `RetrievalService.StreamEvidence` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.StreamEvidence: EvidenceSearchRequest → EvidenceBundleEvent (declared in sveltekit-frontend/p… |
| 193 | `vault.search` | manifest-packets | 74 | — | postgres | Search the Obsidian codebase vault by keyword (case-insensitive substring on title + frontmatter + body) with optional … |

## DENSE

Layer dense contains 33 tools. 2 expose identity fields and 21 write surfaces. Top-ranked tools: atlas.packet_search, image.enrich_tags, wiki.explain_page, ldr_research, atlas.coverage.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 6 | `atlas.packet_search` | trace-mcp, manifest-packets | 356 | feature_id, source_ref | postgres | Query the canonical atlas_packets table by source_ref path (variants tried automatically), |
| 18 | `image.enrich_tags` | trace-mcp | 256 | — | — | VLM-enrich one Qdrant evidence point with auto-generated tags. Fetches the image (from payload file_path or MinIO), run… |
| 28 | `wiki.explain_page` | trace-mcp, manifest-packets | 236 | — | postgres | Returns a detailed explanation of a specific wiki page (directory or feature), including related files, imports, cluste… |
| 29 | `ldr_research` | trace-mcp, manifest-packets | 234 | — | postgres | Execute Local Deep Research - autonomous web search, document extraction, and synthesis for legal queries. Returns synt… |
| 33 | `atlas.coverage` | trace-mcp, manifest-packets | 214 | feature_id, source_ref | postgres | Phase 3I verification gate: reports coverage metrics for atlas_packets. |
| 47 | `atlas.prefilter` | trace-mcp | 176 | — | — | TurboVec ANN cluster prefilter. Embeds the query and queries the TurboVec sidecar (:8099) to identify the top-N cluster… |
| 53 | `graph.status` | manifest-packets | 168 | — | postgres | Report current graph indexing health: cluster count, chunk count, embedding coverage, Neo4j reachability. |
| 57 | `gpu:similarity` | manifest-packets | 166 | — | postgres | Compute pairwise cosine similarity matrix on GPU via LibTorch CUDA (bypasses HTTP, ~5-20ms). Falls back to CPU if GPU u… |
| 58 | `image.caption` | trace-mcp | 166 | — | — | Get a VLM-generated caption and suggested tags for a local image file. Calls the Gemma4-VLM pipeline (Triton→TurboQuant… |
| 59 | `image.search_by_text` | trace-mcp | 166 | — | — | Search the evidence image index using a text description. Embeds the query via embeddinggemma and searches Qdrant. No i… |
| 60 | `TurboVecService.Health` | manifest-packets | 166 | — | postgres | gRPC RPC TurboVecService.Health: HealthRequest → HealthResponse (declared in proto/active/turbovec.proto). |
| 61 | `TurboVecService.Transform` | manifest-packets | 166 | — | postgres | gRPC RPC TurboVecService.Transform: TransformRequest → TransformResponse (declared in proto/active/turbovec.proto). |
| 62 | `TurboVecService.Upsert` | manifest-packets | 166 | — | postgres | gRPC RPC TurboVecService.Upsert: UpsertRequest → UpsertResponse (declared in proto/active/turbovec.proto). |
| 80 | `embedding:generate` | manifest-packets | 154 | — | postgres | Generate 768-dim embeddings via gRPC direct (bypasses HTTP, ~50ms vs ~180ms). Falls back to Ollama HTTP if gRPC unavail… |
| 81 | `EmbeddingService.GenerateEmbeddings` | manifest-packets | 154 | — | postgres | gRPC RPC EmbeddingService.GenerateEmbeddings: EmbeddingRequest → EmbeddingResponse (declared in proto/active/embedding.… |
| 86 | `ops.fixer_pattern_store` | trace-mcp | 142 | — | — | [OPERATOR-GATED] Stores a fix attempt outcome to the 3-layer fixer memory. Increments success/failure counts, upserts t… |
| 87 | `ops.trust_audit` | trace-mcp | 142 | — | — | Read-only audit of the trust-tier injection-detection system. Returns count of blocked content hashes and the most rece… |
| 114 | `atlas.embedding_all_tags` | trace-mcp | 88 | — | — | Comprehensive tag derivation for a packet embedding. Combines keywords, cluster tags, and neighbor query in parallel. R… |
| 115 | `atlas.embedding_neighbors` | trace-mcp | 88 | — | — | Find semantically adjacent packets via Qdrant ANN search on a 768-dimensional embedding. Returns a query structure for … |
| 117 | `evidence.search_by_image` | trace-mcp | 88 | — | — | Search evidence by uploading an image. The VLM describes the image, embeds it, and returns semantically similar evidenc… |
| 118 | `legal.batch_ingest` | trace-mcp | 88 | — | — | Publish one or more document URLs to the document.embed RabbitMQ queue for background embedding and indexing. Use to bu… |
| 119 | `legal.cross_reference_evidence` | trace-mcp | 88 | — | — | Semantic cross-reference: find evidence chunks similar to a reference evidence item across one or more cases using Qdra… |
| 120 | `topology.language_distribution` | trace-mcp | 88 | — | — | Get language distribution across Qdrant clusters. Queries codebase_chunks_768 payload tags (language field) and returns… |
| 158 | `CyberElephantService.GetClusters` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.GetClusters: ClusterRequest → ClusterResponse (declared in proto/active/vectors.proto). |
| 159 | `CyberElephantService.GetDocumentById` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.GetDocumentById: DocumentIdRequest → DocumentVector (declared in proto/active/vectors.pro… |
| 160 | `CyberElephantService.GetStatus` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.GetStatus: StatusRequest → SystemStatus (declared in proto/active/vectors.proto). |
| 161 | `CyberElephantService.HealthCheck` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.HealthCheck: HealthRequest → HealthResponse (declared in proto/active/vectors.proto). |
| 162 | `CyberElephantService.UpdateClusters` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.UpdateClusters: ClusterUpdateRequest → ClusterResponse (declared in proto/active/vectors.… |
| 163 | `EmbeddingService.GetStats` | manifest-packets | 78 | — | postgres | gRPC RPC EmbeddingService.GetStats: StatsRequest → StatsResponse (declared in proto/active/embedding.proto). |
| 164 | `EmbeddingService.Health` | manifest-packets | 78 | — | postgres | gRPC RPC EmbeddingService.Health: HealthRequest → HealthResponse (declared in proto/active/embedding.proto). |
| 165 | `EmbeddingService.StreamEmbeddings` | manifest-packets | 78 | — | postgres | gRPC RPC EmbeddingService.StreamEmbeddings: EmbeddingChunk → EmbeddingResult (declared in proto/active/embedding.proto). |
| 166 | `evidence:analyze` | manifest-packets | 78 | — | postgres | Analyze evidence text: extract entities, detect forensic patterns, auto-tag with 3-store mirroring (pgvector + Qdrant +… |
| 168 | `vault.read` | manifest-packets | 78 | — | postgres | Read one Obsidian note. Returns parsed frontmatter, full body, extracted typed edges (up/same/imports/contains), and em… |

## GRAPH

Layer graph contains 40 tools. 3 expose identity fields and 18 write surfaces. Top-ranked tools: clusters.som_cell_lookup, wiki.refresh_directory, kag.feature_lookup, trace.graphrag_search, codebase:graph_traverse.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 13 | `clusters.som_cell_lookup` | trace-mcp, manifest-packets | 272 | source_ref, packet_key, feature_id | postgres | Look up packets in a 20×20 SOM grid cell and its Moore-neighborhood (adjacent 8 cells). Returns packet_key, source_ref,… |
| 30 | `wiki.refresh_directory` | trace-mcp, manifest-packets | 228 | — | postgres | Refreshes one directory card (LLMS.md mirror). Default dryRun=true. |
| 38 | `kag.feature_lookup` | trace-mcp | 194 | — | — | Look up which files implement a named feature. Queries the durable feature_implementations + feature_file_edges tables … |
| 40 | `trace.graphrag_search` | trace-mcp | 182 | — | — | GraphRAG hybrid retrieval: dense+sparse RRF prefetch → Neo4j graph expansion → Karpathy blend rerank. |
| 48 | `codebase:graph_traverse` | manifest-packets | 172 | — | postgres | Multi-hop graph traversal from a start file. Returns subgraph nodes and edges with LibTorch PageRank scores. Use mode=e… |
| 49 | `graph.pagerank_top` | trace-mcp, manifest-packets | 172 | — | postgres | Return the top-N highest PageRank nodes (most architecturally central files). |
| 50 | `graph.semantic_path_synthesis` | trace-mcp | 170 | — | — | Synthesizes a semantic narrative along the shortest structural path between nodes. |
| 51 | `hypergraph.semantic_path_synthesis` | trace-mcp | 170 | — | — | Synthesizes a semantic narrative along a path in the hypergraph. |
| 52 | `library.registry_fetch_tier` | trace-mcp | 170 | — | — | Fetch Tier 3 (bounded, depth-limited implementation subset, with content) or Tier 4 (full walk, paths-only) file conten… |
| 70 | `atlas.explain_trace` | trace-mcp | 162 | — | — | Return the compact summary and retrieval path for the current Atlas packet. |
| 85 | `ops.gpu_pagerank` | trace-mcp | 148 | — | — | GPU power-iteration PageRank on a flat adjacency matrix. Returns normalised rank scores (sum to 1.0). Cached 300 s by s… |
| 94 | `atlas.graph.pagerank` | trace-mcp | 102 | packet_key | — | List the top authoritative nodes in the codebase by PageRank score (computed by Neo4j GDS). Returns paginated results w… |
| 95 | `context.build_indexed_source_packet` | trace-mcp | 102 | source_ref | — | Build a compact Valkey-backed packet for an already indexed source_ref. Prefers Parent Atlas identity lookup (NES card … |
| 99 | `atlas.build_taxonomy_topology_packet` | trace-mcp | 94 | — | — | Build a compact ACE packet for taxonomy/topology routing. Combines ontology path, top children, SOM 20x20 neighborhood,… |
| 100 | `atlas.compact_context` | trace-mcp | 94 | — | — | Build a compact Atlas context packet with top chunks, sourceRefs, a compressed summary, confidence, and retrieval path. |
| 101 | `context.prefetch_feature_context` | trace-mcp | 94 | — | — | Build a prefetch packet for the next feature edit using recent activity, directory KAG context, community graph context… |
| 102 | `graph.materialize_pathway` | trace-mcp | 94 | — | — | Materializes a synthesized pathway into the persistent hypergraph context. |
| 103 | `hypergraph.explain_activation` | trace-mcp | 94 | — | — | Explains why a specific hypergraph edge was activated for a set of query terms. |
| 104 | `hypergraph.get_edge` | trace-mcp | 94 | — | — | Returns full details for a specific hypergraph edge. |
| 105 | `kb.search_pathways` | trace-mcp | 94 | — | — | Searches for previously synthesized and materialized pathways. |
| 106 | `library.registry_lookup` | trace-mcp | 94 | — | — | Resolve a library/package identity by its canonical address (e.g. "npm:ts-morph@27.0.2", "pip:torch@2.8.0+cu128"). Retu… |
| 107 | `research.playbook_lookup_by_language` | trace-mcp | 94 | — | — | Lookup code playbooks and examples by programming language. Searches CouchDB karpathy_wiki (stored playbooks indexed by… |
| 108 | `runtime.sse_probe` | trace-mcp | 94 | — | — | Verifies TRACE MCP Streamable HTTP/SSE path by calling tools/list with Accept: text/event-stream. |
| 109 | `taxonomy.path` | trace-mcp | 94 | — | — | Returns the full ontological path from a leaf node to root. |
| 110 | `topology.search_som_neighborhood` | trace-mcp | 94 | — | — | Searches for nodes in the SOM grid neighborhood of an anchored query. |
| 113 | `hypergraph.search` | trace-mcp | 90 | — | — | Semantic search across the hypergraph edges. |
| 123 | `codebase:file_intel` | manifest-packets | 84 | — | postgres | Unified file intelligence: Neo4j AST metadata, IMPORTS graph edges (in+out), GPU cluster assignment, and missing-import… |
| 124 | `codebase:graph_neighbors` | manifest-packets | 84 | — | postgres | Return immediate graph neighbors for a file: files it imports and files that import it. Useful for impact analysis and … |
| 125 | `evidence.link_image_graph` | trace-mcp | 84 | — | qdrant | Create IMAGE_FOR edges in Neo4j from an evidence image node to CodebaseFile nodes. Normally fires automatically after s… |
| 126 | `graph.community_for_node` | trace-mcp, manifest-packets | 84 | — | neo4j, postgres | Get the GPU cluster, SOM cluster, and community membership for a node. |
| 127 | `graph.expand_neighborhood` | trace-mcp, manifest-packets | 84 | — | neo4j, postgres | Expand graph neighborhood from sourceRefs. Returns nodes/edges/sourceRefs/confidence and compatibility neighbors. |
| 128 | `graph.index` | manifest-packets | 84 | — | postgres | Trigger graph indexing pipeline: Neo4j sync → SOM topology training → GPU graph analysis. |
| 129 | `graph.shortest_path` | trace-mcp, manifest-packets | 84 | — | neo4j, postgres | Find the shortest dependency path between two files or symbols in Neo4j. |
| 130 | `graphrag_expand_context` | manifest-packets | 84 | — | postgres | Expand relationships and explain paths using GraphRAG (Neo4j, CouchDB). |
| 131 | `hypergraph.expand_members` | trace-mcp | 84 | — | neo4j | Returns all related edges for a given edge hash by member overlap. |
| 132 | `langextract:file` | manifest-packets | 84 | — | postgres | Extract structured information from a file path or URL. Supports PDF, TXT, and web pages. Uses LangExtract multi-pass p… |
| 133 | `RetrievalService.GetTopologyContext` | manifest-packets | 84 | — | postgres | gRPC RPC RetrievalService.GetTopologyContext: TopologyRequest → TopologyResponse (declared in sveltekit-frontend/proto/… |
| 145 | `dir_path` | manifest-packets | 80 | — | postgres |  |
| 146 | `file_path` | manifest-packets | 80 | — | postgres |  |
| 156 | `neo4j` | manifest-packets | 80 | — | postgres |  |

## RERANK

Layer rerank contains 6 tools. 0 expose identity fields and 4 write surfaces. Top-ranked tools: search.rerank, turbovec.rank_chunks, GpuBridgeService.AssignSom, GpuBridgeService.BatchCosine, GpuBridgeService.EncodeLatent.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 111 | `search.rerank` | trace-mcp | 92 | — | — | Reranks a list of document snippets for relevance to a query using llama-server. |
| 112 | `turbovec.rank_chunks` | trace-mcp | 92 | — | — | Read-only RotorQuant blended rerank for sourceRefs. No writes. |
| 135 | `GpuBridgeService.AssignSom` | manifest-packets | 82 | — | postgres | gRPC RPC GpuBridgeService.AssignSom: AssignSomRequest → AssignSomResponse (declared in proto/active/gpu_bridge.proto). |
| 136 | `GpuBridgeService.BatchCosine` | manifest-packets | 82 | — | postgres | gRPC RPC GpuBridgeService.BatchCosine: BatchCosineRequest → BatchCosineResponse (declared in proto/active/gpu_bridge.pr… |
| 137 | `GpuBridgeService.EncodeLatent` | manifest-packets | 82 | — | postgres | gRPC RPC GpuBridgeService.EncodeLatent: EncodeLatentRequest → EncodeLatentResponse (declared in proto/active/gpu_bridge… |
| 167 | `phase18_reranker` | manifest-packets | 78 | — | postgres |  |

## SYNTHESIS

Layer synthesis contains 31 tools. 1 expose identity fields and 15 write surfaces. Top-ranked tools: atlas.populate_feature_documents, legal.build_timeline, legal.cross_examine, legal.issue_spotter, legal.mock_trial.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 116 | `atlas.populate_feature_documents` | trace-mcp | 88 | feature_id | — | Generate or refresh the feature-scoped docs bundle for Parent Atlas. Builds docs/features note content, writes docs/<fe… |
| 138 | `legal.build_timeline` | trace-mcp | 82 | — | — | Extract a chronological timeline of events from all evidence associated with a case using Gemma4 NER. Returns TimelineE… |
| 139 | `legal.cross_examine` | trace-mcp | 82 | — | — | Generate strategic cross-examination questions for a witness using Gemma4. Analyzes the witness statement and case cont… |
| 140 | `legal.issue_spotter` | trace-mcp | 82 | — | — | Gemma4 legal issue analysis: identifies legal issues, applicable statutes, strengths, weaknesses, missing evidence, and… |
| 141 | `legal.mock_trial` | trace-mcp | 82 | — | — | Multi-role mock trial simulation using Gemma4. Prosecution makes an opening statement, defense counters, then a judge d… |
| 144 | `shell.run` | trace-mcp | 82 | — | — | Run a bash command and return output. Used by Gemma4 to safely invoke shell operations. Output is truncated to 10KB to … |
| 147 | `kag.web_search` | trace-mcp | 80 | — | — | L10 lane web search (T4 trust). Searches the web for information-seeking queries. Skips for code/error queries. Returns… |
| 148 | `kb.explain_context_pack` | trace-mcp | 80 | — | — | Explains the retrieval provenance and assembly logic for a generated context pack. |
| 149 | `LLMS.md.binding_chain` | trace-mcp | 80 | — | — | Walks the LLMS.md binding hierarchy for a file to determine the order of applying envelopes. |
| 150 | `LLMS.md.context_for_file` | trace-mcp | 80 | — | — | Returns only the AGENTS-related slice of the atlas context packet for a file. |
| 151 | `LLMS.md.coverage` | trace-mcp | 80 | — | — | Reports the population status of the LLMS.md envelope for a file. |
| 152 | `LLMS.md.coverage_chain` | trace-mcp | 80 | — | — | Returns the full LLMS.md inheritance chain for a file. |
| 153 | `LLMS.md.peers_for_dir` | trace-mcp | 80 | — | — | Returns the directory card directly from the atlas cache. |
| 154 | `LLMS.md.peers_via_relations` | trace-mcp | 80 | — | — | Finds neighboring directories using the SHARES_TAGS hypergraph relation. |
| 155 | `LLMS.md.shares_tags` | trace-mcp | 80 | — | — | Returns neighboring directories based on shared tags in their LLMS.md files. |
| 169 | `kb.archive_synthesis` | trace-mcp | 76 | — | — | Archive a synthesis artifact. |
| 195 | `codeintel.ace.context` | manifest-packets | 72 | — | postgres | Assemble a normalized ACE CodeIntel context bundle from cluster summaries, chunk metadata, and health stats. Returns st… |
| 196 | `codeintel.fix_recommend` | manifest-packets | 72 | — | postgres | Given a TypeScript/SvelteKit compiler error or runtime exception, retrieves semantically similar codebase chunks from t… |
| 197 | `face:identify` | manifest-packets | 72 | — | postgres | Multi-pass GRPO face matching for a reference POI using gemma4 VLM. |
| 199 | `langextract:legal` | manifest-packets | 72 | — | postgres | Extract structured legal entities from text using Google LangExtract + gemma4-rotorquant:latest. Returns parties (plain… |
| 200 | `ace.wiki` | manifest-packets | 70 | — | postgres | Generate a structured wiki-style article about a query from ACE codebase context. |
| 201 | `atlas.cross_store_proof` | manifest-packets | 70 | — | postgres | Generate a gate-ready proof report for ATLAS_CROSS_STORE_IDENTITY_PROVEN validation. |
| 202 | `cluster.summary.get` | manifest-packets | 70 | — | postgres | Fetch the LLM-generated summary for a GPU cluster (purpose, patterns, warnings, tags). |
| 203 | `clusters.get_summary_lenses` | trace-mcp, manifest-packets | 70 | — | postgres | Get the LLMS.md wiki summary and KAG notes for a cluster. Fastest way to understand what a cluster does. |
| 204 | `codebase:explain_cluster` | manifest-packets | 70 | — | postgres | Return a VLM-synthesised narrative for a GPU k-means cluster in the codebase index. |
| 205 | `CodeIntelService.SummarizeCluster` | manifest-packets | 70 | — | postgres | gRPC RPC CodeIntelService.SummarizeCluster: SummarizeClusterRequest → SummarizeClusterResponse (declared in proto/activ… |
| 206 | `EnrichmentService.SummarizeCluster` | manifest-packets | 70 | — | postgres | gRPC RPC EnrichmentService.SummarizeCluster: ClusterSummaryRequest → ClusterSummaryResponse (declared in proto/active/c… |
| 207 | `llm_synthesis.log_event` | manifest-packets | 70 | — | postgres | Durably log an LLM synthesis event: writes to Postgres llm_synthesis_events, |
| 208 | `poi:face_synth` | manifest-packets | 70 | — | postgres | Generate QLoRA synthetic training data (JSONL) for POI face identity fine-tuning. |
| 209 | `stable_diffusion_generate` | manifest-packets | 70 | — | postgres | Generate images from text prompts using Stable Diffusion (legal document visualization, crime scene reconstruction, etc… |
| 211 | `gemma4-opencode` | manifest-packets | 66 | — | postgres |  |

## OPS

Layer ops contains 12 tools. 0 expose identity fields and 5 write surfaces. Top-ranked tools: ops.search_tools, ops.audit_tool_result, ops.gpu_pipeline_stats, ops.gpu_topk, ops.inspect_tool_contract.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 32 | `ops.search_tools` | trace-mcp, manifest-packets | 216 | — | postgres | Search the bounded tool catalog and return a compact always-include + recent + ranked subset. Use this to avoid floodin… |
| 214 | `ops.audit_tool_result` | trace-mcp | 58 | — | — | Verifies that a tool result is consistent with what was attempted. Classifies the result and determines whether a side … |
| 215 | `ops.gpu_pipeline_stats` | trace-mcp | 58 | — | — | Returns GPU pipeline diagnostics: active stream slots, pending queue depth, cache hit rate over last 50 ops, and device… |
| 216 | `ops.gpu_topk` | trace-mcp | 58 | — | — | GPU top-k index selection. Returns k indices of highest-scoring candidates in descending order. Use after pipelineAtten… |
| 217 | `ops.inspect_tool_contract` | trace-mcp | 58 | — | — | Returns the formal input contract for a named ops.* tool: required fields, types, nullability, side-effect class, and a… |
| 218 | `ops.validate_claims` | trace-mcp | 58 | — | — | Parses proposed agent response claims and verifies each one against evidence. Detects false completion claims (claiming… |
| 219 | `ops.validate_tool_call` | trace-mcp | 58 | — | — | Pre-flight validation for any ops.* write tool call. Checks all required arguments are non-null non-empty strings, vali… |
| 220 | `ops.execute_graphify` | trace-mcp | 54 | — | — | Executes an authorized graphify pipeline command. |
| 224 | `ops.propose_patch` | trace-mcp | 48 | — | postgres, kanban | PROPOSES a patch for a file. READ-ONLY PREVIEW. Does NOT modify files. |
| 225 | `ops.record_fix_attempt` | trace-mcp | 48 | — | postgres, kanban | Records a fix attempt and its outcome to the persistent audit log. |
| 226 | `ops.run_quality_gate` | trace-mcp | 48 | — | postgres | Executes a project-wide quality gate (tsc or vitest-all). |
| 227 | `ops.run_targeted_test` | trace-mcp | 48 | — | postgres | Executes a single Vitest test file and returns the outcome. |

## READ

Layer read contains 5 tools. 0 expose identity fields and 2 write surfaces. Top-ranked tools: atlas.get_chunk, file.read_window, kb.wiki_note_lookup, db.schema_overview, db.table_inspect.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 194 | `atlas.get_chunk` | trace-mcp | 72 | — | — | Return a chunk from the compact Atlas chunk index, optionally prioritizing a chunkId, chunkIndex, or sourceRef. |
| 198 | `file.read_window` | trace-mcp | 72 | — | — | Reads a bounded window/range of lines from a file. Highly recommended for reading large markdown (.md) or JSON files to… |
| 210 | `kb.wiki_note_lookup` | trace-mcp | 68 | — | — | Look up notes in the wiki. |
| 212 | `db.schema_overview` | trace-mcp | 62 | — | postgres | Lists every table in the public schema with row estimate + structural flags. |
| 213 | `db.table_inspect` | trace-mcp | 62 | — | postgres | Returns columns + indexes + foreign keys for one table. No row data. |

## UNKNOWN

Layer unknown contains 122 tools. 3 expose identity fields and 70 write surfaces. Top-ranked tools: trace.kag_search, clusters.get_members, topology.search_near, search.dev_context, topology.search_4d.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 5 | `trace.kag_search` | trace-mcp, manifest-packets | 364 | — | postgres | Full KAG-DAG retrieval: semantic vector search + knowledge graph expansion + LLMS.md context. Heavier than search__dev_… |
| 34 | `clusters.get_members` | trace-mcp, manifest-packets | 212 | — | postgres | List files in a GPU or directory cluster, sorted by PageRank. |
| 35 | `topology.search_near` | trace-mcp, manifest-packets | 204 | — | postgres | Search the 4D SOM manifold for files near a natural-language query. Useful for finding semantically similar code across… |
| 36 | `search.dev_context` | trace-mcp, manifest-packets | 202 | — | postgres | Search the codebase for context relevant to a coding or debugging query. Returns ranked file chunks with stable keys. C… |
| 37 | `topology.search_4d` | trace-mcp, manifest-packets | 200 | — | postgres | SOM X (BMU column) |
| 88 | `trace.explain_retrieval` | trace-mcp, manifest-packets | 126 | — | postgres | Inspect the cached retrieval trace for a previous query. Shows which sources contributed and why. |
| 89 | `clusters.kmeans_members` | trace-mcp, manifest-packets | 124 | — | postgres | List packets belonging to one or more K-means clusters (cluster IDs 0–19). Returns source refs, authority scores, and S… |
| 90 | `topology.same_som_cluster` | trace-mcp, manifest-packets | 124 | — | postgres | Find all files sharing the same SOM cluster as the given node. Good for finding related implementations. |
| 92 | `kb.hybrid_search` | trace-mcp, manifest-packets | 110 | — | postgres |  |
| 221 | `atlas.feature_document_enrichment_plan` | trace-mcp | 52 | source_ref | — | Build a deterministic, non-mutating Parent Atlas feature-document enrichment plan. Validates feature-doc sources, folds… |
| 222 | `atlas.feature_document_status` | trace-mcp | 52 | feature_id | — | Return feature-scoped document evidence readiness for Parent Atlas. Checks docs/features notes, docs/<feature_id> bundl… |
| 223 | `atlas.materialize_feature_evidence_tuples` | trace-mcp | 52 | source_ref, packet_key | — | Read-only tuple materializer for Parent Atlas feature-document evidence. Links feature docs to canonical packet_key, so… |
| 228 | `atlas.feature_document_ingestion_plan` | trace-mcp | 44 | — | — | Return the validated ingestion plan for a feature docs bundle. Reads docs/<feature>/manifest.json, filters officialDocs… |
| 229 | `atlas.pos_concept_tagging` | trace-mcp | 44 | — | — | Build a deterministic POS/concept tagging packet from AST, semantic, topology, ranking, citation, screenshot, and MCP t… |
| 230 | `atlas.suggest_files` | trace-mcp | 44 | — | — | Return the top suggested files from the compact Atlas packet. |
| 231 | `atlas.workstation_status` | trace-mcp | 44 | — | — | Return Parent Atlas workstation readiness from the canonical Postgres spine plus lane-health artifacts. Use this before… |
| 232 | `codebase.context_for_file` | trace-mcp | 44 | — | — | Returns the full atlas context packet for a specific file. |
| 233 | `context.explain_compression` | trace-mcp | 44 | — | — | Explains the compression logic and token budget for a specific task packet. |
| 234 | `context.refresh_task_toc` | trace-mcp | 44 | — | — | Refreshes the Table of Contents for a specific task context. |
| 235 | `domain.classify` | trace-mcp | 44 | — | — | Classify text into the canonical domain taxonomy via the Miniforge sidecar's classify pass (sklearn NB/LR over KMeans w… |
| 236 | `kag.ingest_error` | trace-mcp | 44 | — | — | Fingerprints and stores a raw error text for future retrieval. |
| 237 | `kag.ingest_memory_directory` | trace-mcp | 44 | — | — | Ingests agent run records from the memory directory into the database. |
| 238 | `kag.panel_context` | trace-mcp | 44 | — | — | Return recently viewed files and tools from panel_activity_log for the active user session (HyperRAG L11 prefetch). Pro… |
| 239 | `kag.record_agent_run` | trace-mcp | 44 | — | — | Records an autonomous agent run artifact to memory. |
| 240 | `kb.organize_messy_text` | trace-mcp | 44 | — | — | Organize messy text into structured entities and sections. |
| 241 | `kb.search_notecards` | trace-mcp | 44 | — | — | Searches for identity-spine notecards matching a query. |
| 242 | `kb.search_summary_tree` | trace-mcp | 44 | — | — | RAPTOR-style hierarchical search across per-chunk lens, cluster narrative, and directory-card summary tiers. |
| 243 | `kb.trace_search` | trace-mcp | 44 | — | — | Search the hypergraph/KAG context for documents, cards, and relations matching a query. |
| 244 | `knowledge.get_minified_map` | trace-mcp | 44 | — | — | Returns a minified architectural map for a specific directory. |
| 245 | `legal.find_precedents` | trace-mcp | 44 | — | — | Semantic + full-text search across legal precedents, case opinions, and rulings. Returns ranked results with citation, … |
| 246 | `legal.get_transcript` | trace-mcp | 44 | — | — | Retrieve the Whisper transcript for an audio/video evidence item that has already been processed. Returns the full text… |
| 247 | `legal.score_case` | trace-mcp | 44 | — | — | Compute an evidence-weighted case strength score (0-100) for a given case. Factors: evidence count (×10, max 40), witne… |
| 248 | `legal.search_recordings` | trace-mcp | 44 | — | — | Timestamp-aware semantic search across Whisper audio segments. Returns matching segments with start/end times so prosec… |
| 249 | `legal.similar_cases` | trace-mcp | 44 | — | — | Find cases similar to a given case using PostgreSQL full-text similarity on case title and description. Returns up to 2… |
| 250 | `legal.write_obsidian_note` | trace-mcp | 44 | — | — | Write or append a markdown note to the Obsidian vault via the Local REST API plugin (requires Obsidian running at ENV.O… |
| 251 | `library.registry_rescan` | trace-mcp | 44 | — | — | Trigger a rescan of the library registry (npm root + sveltekit-frontend + miniforge pip sidecar). Runs scripts/atlas/li… |
| 252 | `library.registry_search` | trace-mcp | 44 | — | — | Search the library registry by name substring, source type, package manager, or workspace root. Returns bounded metadat… |
| 253 | `miniforge.analyze` | trace-mcp | 44 | — | — | Run Miniforge CUDA-backed NLP analysis over text for entities, relationships, chunks, and features. |
| 254 | `miniforge.extract` | trace-mcp | 44 | — | — | Run Miniforge CUDA-backed extraction over text and return normalized structure plus extracted entities. |
| 255 | `miniforge.health` | trace-mcp | 44 | — | — | Check the local Miniforge CUDA sidecar used for NLP and analysis. |
| 256 | `phase109a_archive_signal` | trace-mcp | 44 | — | — | Archive a semantic signal: transitions ACTIVE or SUPERSEDED to ARCHIVED state. Creates immutable audit event in semanti… |
| 257 | `phase109a_promote_recommendation` | trace-mcp | 44 | — | — | Promote a recommendation to APPROVED status. Enforces mutual approval safeguard (approver ≠ creator). Supports dry-run … |
| 258 | `phase109a_query_signal_history` | trace-mcp | 44 | — | — | Query the state transition history for a semantic signal. Returns all audit events in reverse chronological order. |
| 259 | `phase109a_supersede_recommendation` | trace-mcp | 44 | — | — | Supersede a recommendation with a replacement: transitions ACTIVE lifecycle_state to SUPERSEDED. Revision-aware — rejec… |
| 260 | `phase109a_supersede_signal` | trace-mcp | 44 | — | — | Supersede a semantic signal with a replacement: transitions ACTIVE to SUPERSEDED. Sets superseded_by link and creates a… |
| 261 | `phase109a_validate_state_transition` | trace-mcp | 44 | — | — | Validate whether a state transition is allowed without making changes. Useful for dry-run validation. |
| 262 | `runtime.quic_status` | trace-mcp | 44 | — | — | Reports QUIC/HTTP3 dev-lane configuration and probes the local Caddy/Vite QUIC endpoint if present. |
| 263 | `runtime.simdjson_status` | trace-mcp | 44 | — | — | Reports SIMD/AVX2 JSON parser availability, fallback mode, cache metrics, and safe usage notes. |
| 264 | `service_workers.result` | trace-mcp | 44 | — | — | Fetch the result of a queued local trace service worker job by job id. |
| 265 | `service_workers.status` | trace-mcp | 44 | — | — | Return the current local trace service worker queue status and recent job summaries. |
| 266 | `taxonomy.children` | trace-mcp | 44 | — | — | Lists children of a specific ontological node in the topology. |
| 267 | `tools.batch_call` | trace-mcp | 44 | — | — | Executes multiple tool calls in parallel to reduce total latency. |
| 268 | `topology.hydration_status` | trace-mcp | 44 | — | — | Returns a diagnostic overview of topological hydration coverage. |
| 269 | `topology.recompute_manifold_plan` | trace-mcp | 44 | — | — | Provides a recommended plan for restoring topological hydration. |
| 270 | `trace_dynamic_context` | trace-mcp | 44 | — | — | Build a bounded evidence bundle with the first trace_dynamic_context slice: static discovery plus canonical Postgres jo… |
| 271 | `trace.system_health` | trace-mcp | 44 | — | — | Returns the health and latency status of all backend retrieval and inference services. |
| 272 | `trace.validate_ace_hit` | trace-mcp | 44 | — | — | Validates a retrieved chunk against the ACE cache and graph contracts. |
| 273 | `ui.analyze_view` | trace-mcp | 44 | — | — | Analyzes the current UI state based on a provided snapshot. |
| 274 | `kb.extract_citations` | trace-mcp | 40 | — | — | Extract legal citations and statutes from text. |
| 275 | `skills.list` | trace-mcp | 40 | — | — | Filter skills by name or description. |
| 276 | `skills.run_mission` | trace-mcp | 40 | — | — | Execute a specialized autonomous skill mission. |
| 277 | `analytics:mapreduce_matrix` | manifest-packets | 34 | — | postgres | Execute MapReduce matrix analysis across RAG/KAG/DAG/ACE pipelines. |
| 278 | `ast:cross_language` | manifest-packets | 34 | — | postgres | Synthesize cross-language equivalents for a TypeScript/JS function. |
| 279 | `cases:create` | manifest-packets | 34 | — | postgres | Create a new legal case. Returns the created case with ID. |
| 280 | `cases:delete` | manifest-packets | 34 | — | postgres | Delete a case and all associated data. Use with caution. |
| 281 | `ChatAssistantService.CreateSession` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.CreateSession: CreateSessionRequest → SessionInfo (declared in proto/active/chat_assistan… |
| 282 | `ChatAssistantService.GetHistory` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.GetHistory: HistoryRequest → HistoryResponse (declared in proto/active/chat_assistant.pro… |
| 283 | `ChatAssistantService.Health` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.Health: ChatHealthRequest → ChatHealthResponse (declared in proto/active/chat_assistant.p… |
| 284 | `ChatAssistantService.RAGQuery` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.RAGQuery: RAGQueryRequest → RAGQueryResponse (declared in proto/active/chat_assistant.pro… |
| 285 | `ChatAssistantService.SendMessage` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.SendMessage: ChatRequest → ChatResponse (declared in proto/active/chat_assistant.proto). |
| 286 | `ChatAssistantService.StreamMessage` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.StreamMessage: ChatRequest → ChatToken (declared in proto/active/chat_assistant.proto). |
| 287 | `Chr97Agent.GetCartridge` | manifest-packets | 34 | — | postgres | gRPC RPC Chr97Agent.GetCartridge: GetCartridgeRequest → GetCartridgeResponse (declared in proto/active/chr97_agent.prot… |
| 288 | `Chr97Agent.GetTimeline` | manifest-packets | 34 | — | postgres | gRPC RPC Chr97Agent.GetTimeline: TimelineRequest → TimelineResponse (declared in proto/active/chr97_agent.proto). |
| 289 | `Chr97Agent.QueryTags` | manifest-packets | 34 | — | postgres | gRPC RPC Chr97Agent.QueryTags: TagQueryRequest → TagQueryResponse (declared in proto/active/chr97_agent.proto). |
| 290 | `citations:add_to_case` | manifest-packets | 34 | — | postgres | Add a legal citation to a case. Stores citation text, source, and page reference. |
| 291 | `codebase:get_buffer` | manifest-packets | 34 | — | postgres | Retrieve a pre-assembled context buffer containing high-token codebase insights (e.g. architecture overview). |
| 292 | `codeintel.health` | manifest-packets | 34 | — | postgres | Check CodeIntel pipeline health (cluster_summaries + chunk index + gRPC reachability). |
| 293 | `CodeIntelService.GetClusterSummary` | manifest-packets | 34 | — | postgres | gRPC RPC CodeIntelService.GetClusterSummary: GetClusterSummaryRequest → ClusterSummary (declared in proto/active/codein… |
| 294 | `CodeIntelService.GetJobStatus` | manifest-packets | 34 | — | postgres | gRPC RPC CodeIntelService.GetJobStatus: GetJobStatusRequest → JobStatus (declared in proto/active/codeintel.proto). |
| 295 | `CodeIntelService.ListClusterSummaries` | manifest-packets | 34 | — | postgres | gRPC RPC CodeIntelService.ListClusterSummaries: ListClusterSummariesRequest → ListClusterSummariesResponse (declared in… |
| 296 | `context.build_kv_packet` | trace-mcp, manifest-packets | 34 | — | postgres | Build a compressed KV context packet for a set of hot files. Returns an attention TOC + file card summaries. Use when y… |
| 297 | `context.get_compressed_card` | trace-mcp, manifest-packets | 34 | — | postgres | Fetch a compressed HCA card for a file or trace. Returns a 128-token summary: one-line description, key symbols, risks.… |
| 298 | `EnrichmentService.BatchEnrich` | manifest-packets | 34 | — | postgres | gRPC RPC EnrichmentService.BatchEnrich: BatchEnrichRequest → BatchEnrichResponse (declared in proto/active/codeintel_en… |
| 299 | `evidence:detect_objects` | manifest-packets | 34 | — | postgres | Detect objects in image evidence using the installed YOLO ONNX model. The live repo currently uses a restored yolov8n C… |
| 300 | `evidence:transcribe_gpu` | manifest-packets | 34 | — | postgres | GPU-accelerated audio/video transcription using Whisper. Faster than browser WASM for long recordings (>10s). Returns f… |
| 301 | `facial_analysis` | manifest-packets | 34 | — | postgres | Detect and analyze faces in images or video frames (witness identification, security footage analysis) |
| 302 | `hmm_infer_repair_states` | manifest-packets | 34 | — | postgres | Infer missing implementation states and repair order using HMM. |
| 303 | `langextract_extract_error_facts` | manifest-packets | 34 | — | postgres | Extract structured error, feature, and docs facts from messy text. |
| 304 | `langextract:evidence` | manifest-packets | 34 | — | postgres | Extract forensic/evidentiary entities from text: persons (witnesses, suspects), locations, phone numbers, emails, docum… |
| 305 | `reports:create` | manifest-packets | 34 | — | postgres | Create a new blank report for a case. Returns report ID and metadata. |
| 306 | `reports:delete` | manifest-packets | 34 | — | postgres | Delete a report. Audit log entry will be created for legal compliance. |
| 307 | `reports:export` | manifest-packets | 34 | — | postgres | Export a report to PDF, DOCX, or HTML format. Returns download URL. |
| 308 | `reports:list` | manifest-packets | 34 | — | postgres | List reports with optional case filtering. Returns report metadata including title, status, creation date. |
| 309 | `sveltekit_import_boundary_check` | manifest-packets | 34 | — | postgres | Check SvelteKit import boundaries (e.g., $lib/server leaked to client). |
| 310 | `sveltekit_route_audit` | manifest-packets | 34 | — | postgres | Audit a SvelteKit 2 route for existence, Zod schema, and auth guards. |
| 311 | `ToolCallingService.ExecuteTool` | manifest-packets | 34 | — | postgres | gRPC RPC ToolCallingService.ExecuteTool: ToolCallRequest → ToolCallResponse (declared in proto/active/tool_calling.prot… |
| 312 | `ToolCallingService.ExecuteToolBatch` | manifest-packets | 34 | — | postgres | gRPC RPC ToolCallingService.ExecuteToolBatch: ToolCallBatchRequest → ToolCallBatchResponse (declared in proto/active/to… |
| 313 | `ToolCallingService.ExecuteToolStream` | manifest-packets | 34 | — | postgres | gRPC RPC ToolCallingService.ExecuteToolStream: ToolCallRequest → ToolCallEvent (declared in proto/active/tool_calling.p… |
| 314 | `ToolCallingService.ListTools` | manifest-packets | 34 | — | postgres | gRPC RPC ToolCallingService.ListTools: ListToolsRequest → ListToolsResponse (declared in proto/active/tool_calling.prot… |
| 315 | `ToolRouter.CallTool` | manifest-packets | 34 | — | postgres | gRPC RPC ToolRouter.CallTool: CallToolRequest → CallToolResponse (declared in sveltekit-frontend/proto/active/tool_rout… |
| 316 | `ToolRouter.CallToolBatch` | manifest-packets | 34 | — | postgres | gRPC RPC ToolRouter.CallToolBatch: CallToolBatchRequest → CallToolBatchResponse (declared in sveltekit-frontend/proto/a… |
| 317 | `ToolRouter.CallToolStream` | manifest-packets | 34 | — | postgres | gRPC RPC ToolRouter.CallToolStream: CallToolRequest → CallToolEvent (declared in sveltekit-frontend/proto/active/tool_r… |
| 318 | `ToolRouter.ListTools` | manifest-packets | 34 | — | postgres | gRPC RPC ToolRouter.ListTools: ListToolsRequest → ListToolsResponse (declared in sveltekit-frontend/proto/active/tool_r… |
| 319 | `toposort_repair_plan` | manifest-packets | 34 | — | postgres | Topological sort to order the repair plan based on HMM states. |
| 320 | `transcribe_audio` | manifest-packets | 34 | — | postgres | Transcribe audio evidence files (WAV, MP3, M4A) using Docling ASR. Returns transcript text with word count and duration. |
| 321 | `video_to_frames` | manifest-packets | 34 | — | postgres | Extract frames from video evidence (depositions, surveillance, courtroom recordings) for analysis |
| 322 | `vlm:switch_mode` | manifest-packets | 34 | — | postgres | Switch the VLM inference mode between TEXT (TurboQuant) and VISION (Ollama VLM). Use this to prevent VRAM OOM on 8GB ca… |
| 323 | `cases:load` | manifest-packets | 30 | — | postgres | Load legal cases with optional filtering |
| 324 | `cases:update` | manifest-packets | 30 | — | postgres | Update an existing case |
| 325 | `citations:list_by_case` | manifest-packets | 30 | — | postgres | List all citations linked to a specific case. |
| 326 | `content` | manifest-packets | 30 | — | postgres |  |
| 327 | `context_lines` | manifest-packets | 30 | — | postgres |  |
| 328 | `issue` | manifest-packets | 30 | — | postgres |  |
| 329 | `notes` | manifest-packets | 30 | — | postgres |  |
| 330 | `operator_token` | manifest-packets | 30 | — | postgres |  |
| 331 | `outcome` | manifest-packets | 30 | — | postgres |  |
| 332 | `playwright:browser_action` | manifest-packets | 30 | — | postgres | Execute a browser action using Playwright |
| 333 | `postgres` | manifest-packets | 30 | — | postgres |  |
| 334 | `rag:index_page` | manifest-packets | 30 | — | postgres | Index a web page for RAG knowledge |
| 335 | `reports:update` | manifest-packets | 30 | — | postgres | Update an existing report |
| 336 | `section` | manifest-packets | 30 | — | postgres |  |
| 337 | `unknown` | manifest-packets | 30 | — | postgres |  |

## All Tools Ranked

| Rank | Tool | Primary Layer | Sources | Permissions | Score |
|------|------|---------------|---------|-------------|-------|
| 1 | `wiki.search` | cache | trace-mcp, manifest-packets | read_only | 496 |
| 2 | `memory:prior_answer_lookup` | memory | manifest-packets | read_only | 421 |
| 3 | `codebase:search` | lexical | manifest-packets | read_only | 414 |
| 4 | `atlas.identity_audit` | identity | manifest-packets | read_only | 368 |
| 5 | `trace.kag_search` | unknown | trace-mcp, manifest-packets | read_only | 364 |
| 6 | `atlas.packet_search` | dense | trace-mcp, manifest-packets | read_only | 356 |
| 7 | `ace.compact_search` | cache | trace-mcp | read_only | 350 |
| 8 | `karpathy.attention_rank_files` | cache | trace-mcp | read_only | 348 |
| 9 | `search.go_hybrid` | lexical | trace-mcp, manifest-packets | read_only | 341 |
| 10 | `wiki.status` | cache | trace-mcp, manifest-packets | read_only | 328 |
| 11 | `ops.fixer_semantic_recall` | cache | trace-mcp | read_only | 310 |
| 12 | `marco_rerank_chunks` | identity | manifest-packets | read_only | 274 |
| 13 | `clusters.som_cell_lookup` | graph | trace-mcp, manifest-packets | read_only | 272 |
| 14 | `schema-dependents:find` | identity | manifest-packets | read_only | 272 |
| 15 | `legal.check_services` | cache | trace-mcp | read_only | 270 |
| 16 | `codebase:export_bundle` | cache | manifest-packets | read_only | 260 |
| 17 | `startup:briefing` | cache | manifest-packets | read_only | 260 |
| 18 | `image.enrich_tags` | dense | trace-mcp | read_only | 256 |
| 19 | `kag.recall_similar_fix` | lexical | trace-mcp | read_only | 255 |
| 20 | `kb.search_cards` | lexical | manifest-packets | read_only | 252 |
| 21 | `chunk.lookup` | lexical | manifest-packets | read_only | 248 |
| 22 | `topology_search` | lexical | manifest-packets | read_only | 248 |
| 23 | `wiki_encyclopedia_search` | lexical | manifest-packets | read_only | 248 |
| 24 | `cluster.summary.refresh` | cache | manifest-packets | read_only | 246 |
| 25 | `TurboVecService.Search` | lexical | manifest-packets | read_write | 246 |
| 26 | `codebase:ace_context` | lexical | manifest-packets | read_only | 240 |
| 27 | `ops.gpu_attention` | cache | trace-mcp | read_only | 238 |
| 28 | `wiki.explain_page` | dense | trace-mcp, manifest-packets | read_only | 236 |
| 29 | `ldr_research` | dense | trace-mcp, manifest-packets | read_only | 234 |
| 30 | `wiki.refresh_directory` | graph | trace-mcp, manifest-packets | read_only | 228 |
| 31 | `ops.update_LLMS.md` | cache | trace-mcp | read_only | 226 |
| 32 | `ops.search_tools` | ops | trace-mcp, manifest-packets | read_only | 216 |
| 33 | `atlas.coverage` | dense | trace-mcp, manifest-packets | read_only | 214 |
| 34 | `clusters.get_members` | unknown | trace-mcp, manifest-packets | read_only | 212 |
| 35 | `topology.search_near` | unknown | trace-mcp, manifest-packets | read_only | 204 |
| 36 | `search.dev_context` | unknown | trace-mcp, manifest-packets | read_only | 202 |
| 37 | `topology.search_4d` | unknown | trace-mcp, manifest-packets | read_only | 200 |
| 38 | `kag.feature_lookup` | graph | trace-mcp | read_only | 194 |
| 39 | `karpathy.som_topology_stats` | cache | trace-mcp | read_only | 186 |
| 40 | `trace.graphrag_search` | graph | trace-mcp | read_only | 182 |
| 41 | `engram.chat_memory_store` | cache | trace-mcp | read_write | 181 |
| 42 | `atlas.embedding_cluster_tags` | cache | trace-mcp | read_only | 180 |
| 43 | `atlas.embedding_keywords` | cache | trace-mcp | read_only | 180 |
| 44 | `evidence.image_feedback` | cache | trace-mcp | read_only | 180 |
| 45 | `legal.transcribe_video` | cache | trace-mcp | read_only | 180 |
| 46 | `agents_md` | cache | manifest-packets | read_only | 176 |
| 47 | `atlas.prefilter` | dense | trace-mcp | read_only | 176 |
| 48 | `codebase:graph_traverse` | graph | manifest-packets | read_only | 172 |
| 49 | `graph.pagerank_top` | graph | trace-mcp, manifest-packets | read_only | 172 |
| 50 | `graph.semantic_path_synthesis` | graph | trace-mcp | read_only | 170 |
| 51 | `hypergraph.semantic_path_synthesis` | graph | trace-mcp | read_only | 170 |
| 52 | `library.registry_fetch_tier` | graph | trace-mcp | read_only | 170 |
| 53 | `graph.status` | dense | manifest-packets | read_only | 168 |
| 54 | `legal.find_similar_opinions` | lexical | trace-mcp | read_only | 168 |
| 55 | `analytics:research_topics` | cache | manifest-packets | read_only | 166 |
| 56 | `analytics:unified_research` | cache | manifest-packets | read_only | 166 |
| 57 | `gpu:similarity` | dense | manifest-packets | read_only | 166 |
| 58 | `image.caption` | dense | trace-mcp | read_only | 166 |
| 59 | `image.search_by_text` | dense | trace-mcp | read_only | 166 |
| 60 | `TurboVecService.Health` | dense | manifest-packets | read_write | 166 |
| 61 | `TurboVecService.Transform` | dense | manifest-packets | read_write | 166 |
| 62 | `TurboVecService.Upsert` | dense | manifest-packets | read_write | 166 |
| 63 | `codebase:concurrent_research` | lexical | manifest-packets | read_only | 164 |
| 64 | `codebase.rg_search` | lexical | manifest-packets | read_only | 164 |
| 65 | `kb.expand_neighbors` | lexical | manifest-packets | read_only | 164 |
| 66 | `kb.explain_retrieval` | lexical | manifest-packets | read_only | 164 |
| 67 | `kb.rg_atlas_search` | lexical | manifest-packets | read_only | 164 |
| 68 | `research:reddit_search` | lexical | manifest-packets | read_only | 164 |
| 69 | `RetrievalService.ExpandAstNeighbors` | lexical | manifest-packets | read_write | 164 |
| 70 | `atlas.explain_trace` | graph | trace-mcp | read_only | 162 |
| 71 | `engram.ace_packet_inject` | cache | trace-mcp | read_write | 162 |
| 72 | `research:search_chunks` | lexical | manifest-packets | read_only | 162 |
| 73 | `kag.multi_lane_search` | lexical | trace-mcp | read_only | 160 |
| 74 | `analytics:codebase_research` | lexical | manifest-packets | read_only | 158 |
| 75 | `analytics:web_research` | lexical | manifest-packets | read_only | 158 |
| 76 | `CyberElephantService.ProcessDocuments` | lexical | manifest-packets | read_write | 158 |
| 77 | `CyberElephantService.SearchSimilar` | lexical | manifest-packets | read_write | 158 |
| 78 | `evidence:analyze_multimodal` | lexical | manifest-packets | read_only | 158 |
| 79 | `evidence:search_similar` | lexical | manifest-packets | read_only | 158 |
| 80 | `embedding:generate` | dense | manifest-packets | read_only | 154 |
| 81 | `EmbeddingService.GenerateEmbeddings` | dense | manifest-packets | read_write | 154 |
| 82 | `analytics:deep_research` | lexical | manifest-packets | read_only | 150 |
| 83 | `ops.verify_write` | cache | trace-mcp | read_only | 150 |
| 84 | `reports:generate_from_template` | lexical | manifest-packets | read_only | 150 |
| 85 | `ops.gpu_pagerank` | graph | trace-mcp | read_only | 148 |
| 86 | `ops.fixer_pattern_store` | dense | trace-mcp | read_only | 142 |
| 87 | `ops.trust_audit` | dense | trace-mcp | read_only | 142 |
| 88 | `trace.explain_retrieval` | unknown | trace-mcp, manifest-packets | read_only | 126 |
| 89 | `clusters.kmeans_members` | unknown | trace-mcp, manifest-packets | read_only | 124 |
| 90 | `topology.same_som_cluster` | unknown | trace-mcp, manifest-packets | read_only | 124 |
| 91 | `atlas.source_refs` | identity | trace-mcp | read_only | 112 |
| 92 | `kb.hybrid_search` | unknown | trace-mcp, manifest-packets | read_only | 110 |
| 93 | `atlas.query` | identity | trace-mcp | read_only | 104 |
| 94 | `atlas.graph.pagerank` | graph | trace-mcp | read_only | 102 |
| 95 | `context.build_indexed_source_packet` | graph | trace-mcp | read_only | 102 |
| 96 | `engram.chat_memory_recent` | memory | trace-mcp | read_only | 99 |
| 97 | `atlas_get_active_context` | cache | trace-mcp | read_only | 96 |
| 98 | `context.build_ace_packet` | cache | trace-mcp | read_only | 96 |
| 99 | `atlas.build_taxonomy_topology_packet` | graph | trace-mcp | read_only | 94 |
| 100 | `atlas.compact_context` | graph | trace-mcp | read_only | 94 |
| 101 | `context.prefetch_feature_context` | graph | trace-mcp | read_only | 94 |
| 102 | `graph.materialize_pathway` | graph | trace-mcp | read_only | 94 |
| 103 | `hypergraph.explain_activation` | graph | trace-mcp | read_only | 94 |
| 104 | `hypergraph.get_edge` | graph | trace-mcp | read_only | 94 |
| 105 | `kb.search_pathways` | graph | trace-mcp | read_only | 94 |
| 106 | `library.registry_lookup` | graph | trace-mcp | read_only | 94 |
| 107 | `research.playbook_lookup_by_language` | graph | trace-mcp | read_only | 94 |
| 108 | `runtime.sse_probe` | graph | trace-mcp | read_only | 94 |
| 109 | `taxonomy.path` | graph | trace-mcp | read_only | 94 |
| 110 | `topology.search_som_neighborhood` | graph | trace-mcp | read_only | 94 |
| 111 | `search.rerank` | rerank | trace-mcp | read_only | 92 |
| 112 | `turbovec.rank_chunks` | rerank | trace-mcp | read_only | 92 |
| 113 | `hypergraph.search` | graph | trace-mcp | read_only | 90 |
| 114 | `atlas.embedding_all_tags` | dense | trace-mcp | read_only | 88 |
| 115 | `atlas.embedding_neighbors` | dense | trace-mcp | read_only | 88 |
| 116 | `atlas.populate_feature_documents` | synthesis | trace-mcp | read_only | 88 |
| 117 | `evidence.search_by_image` | dense | trace-mcp | read_only | 88 |
| 118 | `legal.batch_ingest` | dense | trace-mcp | read_only | 88 |
| 119 | `legal.cross_reference_evidence` | dense | trace-mcp | read_only | 88 |
| 120 | `topology.language_distribution` | dense | trace-mcp | read_only | 88 |
| 121 | `engram.redis_health` | cache | trace-mcp | read_write | 86 |
| 122 | `inference:route` | cache | manifest-packets | read_only | 86 |
| 123 | `codebase:file_intel` | graph | manifest-packets | read_only | 84 |
| 124 | `codebase:graph_neighbors` | graph | manifest-packets | read_only | 84 |
| 125 | `evidence.link_image_graph` | graph | trace-mcp | read_write | 84 |
| 126 | `graph.community_for_node` | graph | trace-mcp, manifest-packets | read_only | 84 |
| 127 | `graph.expand_neighborhood` | graph | trace-mcp, manifest-packets | read_only | 84 |
| 128 | `graph.index` | graph | manifest-packets | read_only | 84 |
| 129 | `graph.shortest_path` | graph | trace-mcp, manifest-packets | read_only | 84 |
| 130 | `graphrag_expand_context` | graph | manifest-packets | read_only | 84 |
| 131 | `hypergraph.expand_members` | graph | trace-mcp | read_write | 84 |
| 132 | `langextract:file` | graph | manifest-packets | read_only | 84 |
| 133 | `RetrievalService.GetTopologyContext` | graph | manifest-packets | read_write | 84 |
| 134 | `search.hybrid` | lexical | trace-mcp | read_only | 84 |
| 135 | `GpuBridgeService.AssignSom` | rerank | manifest-packets | read_write | 82 |
| 136 | `GpuBridgeService.BatchCosine` | rerank | manifest-packets | read_write | 82 |
| 137 | `GpuBridgeService.EncodeLatent` | rerank | manifest-packets | read_write | 82 |
| 138 | `legal.build_timeline` | synthesis | trace-mcp | read_only | 82 |
| 139 | `legal.cross_examine` | synthesis | trace-mcp | read_only | 82 |
| 140 | `legal.issue_spotter` | synthesis | trace-mcp | read_only | 82 |
| 141 | `legal.mock_trial` | synthesis | trace-mcp | read_only | 82 |
| 142 | `redis` | cache | manifest-packets | read_only | 82 |
| 143 | `redis_only` | cache | manifest-packets | read_only | 82 |
| 144 | `shell.run` | synthesis | trace-mcp | read_only | 82 |
| 145 | `dir_path` | graph | manifest-packets | read_only | 80 |
| 146 | `file_path` | graph | manifest-packets | read_only | 80 |
| 147 | `kag.web_search` | synthesis | trace-mcp | read_only | 80 |
| 148 | `kb.explain_context_pack` | synthesis | trace-mcp | read_only | 80 |
| 149 | `LLMS.md.binding_chain` | synthesis | trace-mcp | read_only | 80 |
| 150 | `LLMS.md.context_for_file` | synthesis | trace-mcp | read_only | 80 |
| 151 | `LLMS.md.coverage` | synthesis | trace-mcp | read_only | 80 |
| 152 | `LLMS.md.coverage_chain` | synthesis | trace-mcp | read_only | 80 |
| 153 | `LLMS.md.peers_for_dir` | synthesis | trace-mcp | read_only | 80 |
| 154 | `LLMS.md.peers_via_relations` | synthesis | trace-mcp | read_only | 80 |
| 155 | `LLMS.md.shares_tags` | synthesis | trace-mcp | read_only | 80 |
| 156 | `neo4j` | graph | manifest-packets | read_only | 80 |
| 157 | `search.postgres_fts` | lexical | trace-mcp | read_only | 80 |
| 158 | `CyberElephantService.GetClusters` | dense | manifest-packets | read_write | 78 |
| 159 | `CyberElephantService.GetDocumentById` | dense | manifest-packets | read_write | 78 |
| 160 | `CyberElephantService.GetStatus` | dense | manifest-packets | read_write | 78 |
| 161 | `CyberElephantService.HealthCheck` | dense | manifest-packets | read_write | 78 |
| 162 | `CyberElephantService.UpdateClusters` | dense | manifest-packets | read_write | 78 |
| 163 | `EmbeddingService.GetStats` | dense | manifest-packets | read_write | 78 |
| 164 | `EmbeddingService.Health` | dense | manifest-packets | read_write | 78 |
| 165 | `EmbeddingService.StreamEmbeddings` | dense | manifest-packets | read_write | 78 |
| 166 | `evidence:analyze` | dense | manifest-packets | read_only | 78 |
| 167 | `phase18_reranker` | rerank | manifest-packets | read_only | 78 |
| 168 | `vault.read` | dense | manifest-packets | read_only | 78 |
| 169 | `kb.archive_synthesis` | synthesis | trace-mcp | read_only | 76 |
| 170 | `citations:search` | lexical | manifest-packets | read_only | 74 |
| 171 | `codebase:rg_search` | lexical | manifest-packets | read_only | 74 |
| 172 | `CodeIntelService.LookupChunk` | lexical | manifest-packets | read_write | 74 |
| 173 | `compose:pipeline` | lexical | manifest-packets | read_only | 74 |
| 174 | `kb.get_card` | lexical | manifest-packets | read_only | 74 |
| 175 | `kb.search_schema_contract` | lexical | manifest-packets | read_only | 74 |
| 176 | `langextract:custom` | lexical | manifest-packets | read_only | 74 |
| 177 | `LibrarySearchService.GetDocumentToc` | lexical | manifest-packets | read_write | 74 |
| 178 | `LibrarySearchService.GetNodeContext` | lexical | manifest-packets | read_write | 74 |
| 179 | `LibrarySearchService.Health` | lexical | manifest-packets | read_write | 74 |
| 180 | `LibrarySearchService.ResolveCitation` | lexical | manifest-packets | read_write | 74 |
| 181 | `LibrarySearchService.SearchLibrary` | lexical | manifest-packets | read_write | 74 |
| 182 | `LibrarySearchService.StreamLibrary` | lexical | manifest-packets | read_write | 74 |
| 183 | `rag:search` | lexical | manifest-packets | read_only | 74 |
| 184 | `research:github_search` | lexical | manifest-packets | read_only | 74 |
| 185 | `RetrievalService.GetClusterSummary` | lexical | manifest-packets | read_write | 74 |
| 186 | `RetrievalService.GetResearchContext` | lexical | manifest-packets | read_write | 74 |
| 187 | `RetrievalService.Health` | lexical | manifest-packets | read_write | 74 |
| 188 | `RetrievalService.SearchChunks` | lexical | manifest-packets | read_write | 74 |
| 189 | `RetrievalService.SearchCodebase` | lexical | manifest-packets | read_write | 74 |
| 190 | `RetrievalService.SearchEvidence` | lexical | manifest-packets | read_write | 74 |
| 191 | `RetrievalService.StreamCodebase` | lexical | manifest-packets | read_write | 74 |
| 192 | `RetrievalService.StreamEvidence` | lexical | manifest-packets | read_write | 74 |
| 193 | `vault.search` | lexical | manifest-packets | read_only | 74 |
| 194 | `atlas.get_chunk` | read | trace-mcp | read_only | 72 |
| 195 | `codeintel.ace.context` | synthesis | manifest-packets | read_only | 72 |
| 196 | `codeintel.fix_recommend` | synthesis | manifest-packets | read_only | 72 |
| 197 | `face:identify` | synthesis | manifest-packets | read_only | 72 |
| 198 | `file.read_window` | read | trace-mcp | read_only | 72 |
| 199 | `langextract:legal` | synthesis | manifest-packets | read_only | 72 |
| 200 | `ace.wiki` | synthesis | manifest-packets | read_only | 70 |
| 201 | `atlas.cross_store_proof` | synthesis | manifest-packets | read_only | 70 |
| 202 | `cluster.summary.get` | synthesis | manifest-packets | read_only | 70 |
| 203 | `clusters.get_summary_lenses` | synthesis | trace-mcp, manifest-packets | read_only | 70 |
| 204 | `codebase:explain_cluster` | synthesis | manifest-packets | read_only | 70 |
| 205 | `CodeIntelService.SummarizeCluster` | synthesis | manifest-packets | read_write | 70 |
| 206 | `EnrichmentService.SummarizeCluster` | synthesis | manifest-packets | read_write | 70 |
| 207 | `llm_synthesis.log_event` | synthesis | manifest-packets | read_only | 70 |
| 208 | `poi:face_synth` | synthesis | manifest-packets | read_only | 70 |
| 209 | `stable_diffusion_generate` | synthesis | manifest-packets | read_only | 70 |
| 210 | `kb.wiki_note_lookup` | read | trace-mcp | read_only | 68 |
| 211 | `gemma4-opencode` | synthesis | manifest-packets | read_only | 66 |
| 212 | `db.schema_overview` | read | trace-mcp | read_write | 62 |
| 213 | `db.table_inspect` | read | trace-mcp | read_write | 62 |
| 214 | `ops.audit_tool_result` | ops | trace-mcp | read_only | 58 |
| 215 | `ops.gpu_pipeline_stats` | ops | trace-mcp | read_only | 58 |
| 216 | `ops.gpu_topk` | ops | trace-mcp | read_only | 58 |
| 217 | `ops.inspect_tool_contract` | ops | trace-mcp | read_only | 58 |
| 218 | `ops.validate_claims` | ops | trace-mcp | read_only | 58 |
| 219 | `ops.validate_tool_call` | ops | trace-mcp | read_only | 58 |
| 220 | `ops.execute_graphify` | ops | trace-mcp | read_only | 54 |
| 221 | `atlas.feature_document_enrichment_plan` | unknown | trace-mcp | read_only | 52 |
| 222 | `atlas.feature_document_status` | unknown | trace-mcp | read_only | 52 |
| 223 | `atlas.materialize_feature_evidence_tuples` | unknown | trace-mcp | read_only | 52 |
| 224 | `ops.propose_patch` | ops | trace-mcp | read_write | 48 |
| 225 | `ops.record_fix_attempt` | ops | trace-mcp | read_write | 48 |
| 226 | `ops.run_quality_gate` | ops | trace-mcp | read_write | 48 |
| 227 | `ops.run_targeted_test` | ops | trace-mcp | read_write | 48 |
| 228 | `atlas.feature_document_ingestion_plan` | unknown | trace-mcp | read_only | 44 |
| 229 | `atlas.pos_concept_tagging` | unknown | trace-mcp | read_only | 44 |
| 230 | `atlas.suggest_files` | unknown | trace-mcp | read_only | 44 |
| 231 | `atlas.workstation_status` | unknown | trace-mcp | read_only | 44 |
| 232 | `codebase.context_for_file` | unknown | trace-mcp | read_only | 44 |
| 233 | `context.explain_compression` | unknown | trace-mcp | read_only | 44 |
| 234 | `context.refresh_task_toc` | unknown | trace-mcp | read_only | 44 |
| 235 | `domain.classify` | unknown | trace-mcp | read_only | 44 |
| 236 | `kag.ingest_error` | unknown | trace-mcp | read_only | 44 |
| 237 | `kag.ingest_memory_directory` | unknown | trace-mcp | read_only | 44 |
| 238 | `kag.panel_context` | unknown | trace-mcp | read_only | 44 |
| 239 | `kag.record_agent_run` | unknown | trace-mcp | read_only | 44 |
| 240 | `kb.organize_messy_text` | unknown | trace-mcp | read_only | 44 |
| 241 | `kb.search_notecards` | unknown | trace-mcp | read_only | 44 |
| 242 | `kb.search_summary_tree` | unknown | trace-mcp | read_only | 44 |
| 243 | `kb.trace_search` | unknown | trace-mcp | read_only | 44 |
| 244 | `knowledge.get_minified_map` | unknown | trace-mcp | read_only | 44 |
| 245 | `legal.find_precedents` | unknown | trace-mcp | read_only | 44 |
| 246 | `legal.get_transcript` | unknown | trace-mcp | read_only | 44 |
| 247 | `legal.score_case` | unknown | trace-mcp | read_only | 44 |
| 248 | `legal.search_recordings` | unknown | trace-mcp | read_only | 44 |
| 249 | `legal.similar_cases` | unknown | trace-mcp | read_only | 44 |
| 250 | `legal.write_obsidian_note` | unknown | trace-mcp | read_only | 44 |
| 251 | `library.registry_rescan` | unknown | trace-mcp | read_only | 44 |
| 252 | `library.registry_search` | unknown | trace-mcp | read_only | 44 |
| 253 | `miniforge.analyze` | unknown | trace-mcp | read_only | 44 |
| 254 | `miniforge.extract` | unknown | trace-mcp | read_only | 44 |
| 255 | `miniforge.health` | unknown | trace-mcp | read_only | 44 |
| 256 | `phase109a_archive_signal` | unknown | trace-mcp | read_only | 44 |
| 257 | `phase109a_promote_recommendation` | unknown | trace-mcp | read_only | 44 |
| 258 | `phase109a_query_signal_history` | unknown | trace-mcp | read_only | 44 |
| 259 | `phase109a_supersede_recommendation` | unknown | trace-mcp | read_only | 44 |
| 260 | `phase109a_supersede_signal` | unknown | trace-mcp | read_only | 44 |
| 261 | `phase109a_validate_state_transition` | unknown | trace-mcp | read_only | 44 |
| 262 | `runtime.quic_status` | unknown | trace-mcp | read_only | 44 |
| 263 | `runtime.simdjson_status` | unknown | trace-mcp | read_only | 44 |
| 264 | `service_workers.result` | unknown | trace-mcp | read_only | 44 |
| 265 | `service_workers.status` | unknown | trace-mcp | read_only | 44 |
| 266 | `taxonomy.children` | unknown | trace-mcp | read_only | 44 |
| 267 | `tools.batch_call` | unknown | trace-mcp | read_only | 44 |
| 268 | `topology.hydration_status` | unknown | trace-mcp | read_only | 44 |
| 269 | `topology.recompute_manifold_plan` | unknown | trace-mcp | read_only | 44 |
| 270 | `trace_dynamic_context` | unknown | trace-mcp | read_only | 44 |
| 271 | `trace.system_health` | unknown | trace-mcp | read_only | 44 |
| 272 | `trace.validate_ace_hit` | unknown | trace-mcp | read_only | 44 |
| 273 | `ui.analyze_view` | unknown | trace-mcp | read_only | 44 |
| 274 | `kb.extract_citations` | unknown | trace-mcp | read_only | 40 |
| 275 | `skills.list` | unknown | trace-mcp | read_only | 40 |
| 276 | `skills.run_mission` | unknown | trace-mcp | read_only | 40 |
| 277 | `analytics:mapreduce_matrix` | unknown | manifest-packets | read_only | 34 |
| 278 | `ast:cross_language` | unknown | manifest-packets | read_only | 34 |
| 279 | `cases:create` | unknown | manifest-packets | read_only | 34 |
| 280 | `cases:delete` | unknown | manifest-packets | read_only | 34 |
| 281 | `ChatAssistantService.CreateSession` | unknown | manifest-packets | read_write | 34 |
| 282 | `ChatAssistantService.GetHistory` | unknown | manifest-packets | read_write | 34 |
| 283 | `ChatAssistantService.Health` | unknown | manifest-packets | read_write | 34 |
| 284 | `ChatAssistantService.RAGQuery` | unknown | manifest-packets | read_write | 34 |
| 285 | `ChatAssistantService.SendMessage` | unknown | manifest-packets | read_write | 34 |
| 286 | `ChatAssistantService.StreamMessage` | unknown | manifest-packets | read_write | 34 |
| 287 | `Chr97Agent.GetCartridge` | unknown | manifest-packets | read_write | 34 |
| 288 | `Chr97Agent.GetTimeline` | unknown | manifest-packets | read_write | 34 |
| 289 | `Chr97Agent.QueryTags` | unknown | manifest-packets | read_write | 34 |
| 290 | `citations:add_to_case` | unknown | manifest-packets | read_only | 34 |
| 291 | `codebase:get_buffer` | unknown | manifest-packets | read_only | 34 |
| 292 | `codeintel.health` | unknown | manifest-packets | read_only | 34 |
| 293 | `CodeIntelService.GetClusterSummary` | unknown | manifest-packets | read_write | 34 |
| 294 | `CodeIntelService.GetJobStatus` | unknown | manifest-packets | read_write | 34 |
| 295 | `CodeIntelService.ListClusterSummaries` | unknown | manifest-packets | read_write | 34 |
| 296 | `context.build_kv_packet` | unknown | trace-mcp, manifest-packets | read_only | 34 |
| 297 | `context.get_compressed_card` | unknown | trace-mcp, manifest-packets | read_only | 34 |
| 298 | `EnrichmentService.BatchEnrich` | unknown | manifest-packets | read_write | 34 |
| 299 | `evidence:detect_objects` | unknown | manifest-packets | read_only | 34 |
| 300 | `evidence:transcribe_gpu` | unknown | manifest-packets | read_only | 34 |
| 301 | `facial_analysis` | unknown | manifest-packets | read_only | 34 |
| 302 | `hmm_infer_repair_states` | unknown | manifest-packets | read_only | 34 |
| 303 | `langextract_extract_error_facts` | unknown | manifest-packets | read_only | 34 |
| 304 | `langextract:evidence` | unknown | manifest-packets | read_only | 34 |
| 305 | `reports:create` | unknown | manifest-packets | read_only | 34 |
| 306 | `reports:delete` | unknown | manifest-packets | read_only | 34 |
| 307 | `reports:export` | unknown | manifest-packets | read_only | 34 |
| 308 | `reports:list` | unknown | manifest-packets | read_only | 34 |
| 309 | `sveltekit_import_boundary_check` | unknown | manifest-packets | read_only | 34 |
| 310 | `sveltekit_route_audit` | unknown | manifest-packets | read_only | 34 |
| 311 | `ToolCallingService.ExecuteTool` | unknown | manifest-packets | read_write | 34 |
| 312 | `ToolCallingService.ExecuteToolBatch` | unknown | manifest-packets | read_write | 34 |
| 313 | `ToolCallingService.ExecuteToolStream` | unknown | manifest-packets | read_write | 34 |
| 314 | `ToolCallingService.ListTools` | unknown | manifest-packets | read_write | 34 |
| 315 | `ToolRouter.CallTool` | unknown | manifest-packets | read_write | 34 |
| 316 | `ToolRouter.CallToolBatch` | unknown | manifest-packets | read_write | 34 |
| 317 | `ToolRouter.CallToolStream` | unknown | manifest-packets | read_write | 34 |
| 318 | `ToolRouter.ListTools` | unknown | manifest-packets | read_write | 34 |
| 319 | `toposort_repair_plan` | unknown | manifest-packets | read_only | 34 |
| 320 | `transcribe_audio` | unknown | manifest-packets | read_only | 34 |
| 321 | `video_to_frames` | unknown | manifest-packets | read_only | 34 |
| 322 | `vlm:switch_mode` | unknown | manifest-packets | read_only | 34 |
| 323 | `cases:load` | unknown | manifest-packets | read_only | 30 |
| 324 | `cases:update` | unknown | manifest-packets | read_only | 30 |
| 325 | `citations:list_by_case` | unknown | manifest-packets | read_only | 30 |
| 326 | `content` | unknown | manifest-packets | read_only | 30 |
| 327 | `context_lines` | unknown | manifest-packets | read_only | 30 |
| 328 | `issue` | unknown | manifest-packets | read_only | 30 |
| 329 | `notes` | unknown | manifest-packets | read_only | 30 |
| 330 | `operator_token` | unknown | manifest-packets | read_only | 30 |
| 331 | `outcome` | unknown | manifest-packets | read_only | 30 |
| 332 | `playwright:browser_action` | unknown | manifest-packets | read_only | 30 |
| 333 | `postgres` | unknown | manifest-packets | read_only | 30 |
| 334 | `rag:index_page` | unknown | manifest-packets | read_only | 30 |
| 335 | `reports:update` | unknown | manifest-packets | read_only | 30 |
| 336 | `section` | unknown | manifest-packets | read_only | 30 |
| 337 | `unknown` | unknown | manifest-packets | read_only | 30 |

## Notes

- TRACE MCP remains the live read surface.
- Manifest packets capture the broader MCP / gRPC registry surface.
- `repo_summarize` (local-llm-offload MCP, canonical tool name; `gemma4_summarize` is a deprecated alias) is used for the section summaries when the local offload server is available; otherwise the report falls back to deterministic summaries.
- This index is read-only and links into the Parent Atlas navigation surface.
