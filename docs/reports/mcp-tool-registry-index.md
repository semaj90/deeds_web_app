# Parent Atlas MCP Tool Registry Index

**Generated**: 2026-08-22T20:48:42.883Z
**Sources**: C:\Users\james\Videos\deeds-web-app\docs\reports\mcp-tool-ontology.json | C:\Users\james\Videos\deeds-web-app\docs\reports\mcp-tool-manifest-packets.json
**Unique tools**: 327
**Trace tools**: 175
**Manifest tools**: 190
**RPC methods**: 74

## Index
- [IDENTITY](#identity) (2)
- [MEMORY](#memory) (2)
- [CACHE](#cache) (27)
- [LEXICAL](#lexical) (53)
- [DENSE](#dense) (33)
- [GRAPH](#graph) (38)
- [RERANK](#rerank) (6)
- [SYNTHESIS](#synthesis) (29)
- [OPS](#ops) (12)
- [READ](#read) (5)
- [UNKNOWN](#unknown) (120)

## Executive Summary

error: all llama-server routes failed: llama-primary: llama-primary 500: {"error":{"code":500,"message":"\n------------\nWhile executing CallExpression at line 85, column 32 in source:\n...first %}↵            {{- raise_exception('System message must be at the beginnin...\n                                           ^\nError: Jinja Exception: System message must be at the beginning.","type":"server_error"}} | atomic-llama: fetch failed

## IDENTITY

Layer identity contains 2 tools. 1 expose identity fields and 0 write surfaces. Top-ranked tools: atlas.source_refs, atlas.query.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 85 | `atlas.source_refs` | trace-mcp | 112 | source_ref | — | Return the top sourceRefs from the compact Atlas packet. |
| 87 | `atlas.query` | trace-mcp | 104 | — | — | Atlas alias for ranked technical search. Returns the same compact hit list as kb.trace_search for a query. |

## MEMORY

Layer memory contains 2 tools. 0 expose identity fields and 1 write surfaces. Top-ranked tools: memory:prior_answer_lookup, engram.chat_memory_recent.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 2 | `memory:prior_answer_lookup` | manifest-packets | 421 | — | postgres | Look up a prior LLM answer from the 3-tier cache (Redis L1 → Postgres L2 → Qdrant L3 semantic). Returns compressed Code… |
| 91 | `engram.chat_memory_recent` | trace-mcp | 99 | — | — | Read-only recent chat memory lookup from engram_cards. |

## CACHE

Layer cache contains 27 tools. 0 expose identity fields and 13 write surfaces. Top-ranked tools: wiki.search, ace.compact_search, karpathy.attention_rank_files, wiki.status, ops.fixer_semantic_recall.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 1 | `wiki.search` | trace-mcp, manifest-packets | 496 | — | postgres | Searches the codebase wiki (Karpathy/AGENTS) using a hybrid approach: lexical ripgrep, graph metadata, and semantic Qdr… |
| 6 | `ace.compact_search` | trace-mcp | 350 | — | — | Token-budgeted semantic search returning a compact context tree. Use this instead of reading full files when you need f… |
| 7 | `karpathy.attention_rank_files` | trace-mcp | 348 | — | — | Rank files by attention score (Karpathy blend). Embeds query via embeddinggemma, fetches Karpathy scores from Redis, re… |
| 9 | `wiki.status` | trace-mcp, manifest-packets | 328 | — | postgres | Returns high-level status of the codebase knowledge base (Karpathy/AGENTS). includes page count, last updated, and stal… |
| 10 | `ops.fixer_semantic_recall` | trace-mcp | 310 | — | — | Recalls known fix templates via Redis L1 → Postgres L2 → Qdrant semantic L3. Call before LLM analysis to skip redundant… |
| 11 | `legal.check_services` | trace-mcp | 270 | — | — | Probe all 9 backing services (Postgres, Redis, Qdrant, Neo4j, Ollama, RabbitMQ, CouchDB, SeaweedFS, Obsidian) and repor… |
| 12 | `codebase:export_bundle` | manifest-packets | 260 | — | postgres | Return the unified codebase indexing export bundle: graph (nodes + edges), cluster summaries (purpose + patterns + warn… |
| 13 | `startup:briefing` | manifest-packets | 260 | — | postgres | Read-only access to the startup briefing state artifact. Returns system status (Postgres, Redis, Qdrant, Neo4j), covera… |
| 20 | `cluster.summary.refresh` | manifest-packets | 246 | — | postgres | Re-run LLM summarization for a cluster and store the new embedding. Use force=true to bypass cache. |
| 23 | `ops.gpu_attention` | trace-mcp | 238 | — | — | GPU scaled dot-product attention over a flat key matrix. Returns softmax attention weights per key. Results are Redis-c… |
| 26 | `ops.update_LLMS.md` | trace-mcp | 226 | — | — | Append a new fact, rule, or tool note to a directory LLMS.md file and flush to Redis. Use this after discovering someth… |
| 33 | `karpathy.som_topology_stats` | trace-mcp | 186 | — | — | Get SOM topology statistics: grid dimensions, cluster occupancy, centroid stats. Reads from Redis cached SOM state (gpu… |
| 35 | `engram.chat_memory_store` | trace-mcp | 181 | — | engram | Append a chat turn to user memory store (Redis sorted set + bounded trim). |
| 36 | `atlas.embedding_cluster_tags` | trace-mcp | 180 | — | — | Assign SOM cluster tags to a 768-dimensional embedding by matching against cached SOM centroids in Redis. |
| 37 | `atlas.embedding_keywords` | trace-mcp | 180 | — | — | Extract top-K keywords from a 768-dimensional source embedding using cosine similarity to cached keyword centroids in R… |
| 38 | `evidence.image_feedback` | trace-mcp | 180 | — | — | Record thumbs-up or thumbs-down on a visual search result. Votes accumulate in Redis; Qdrant payload (trust_score, user… |
| 39 | `legal.transcribe_video` | trace-mcp | 180 | — | — | Queue a video URL for non-blocking background processing via RabbitMQ: yt-dlp download → FFmpeg audio extraction → Whis… |
| 40 | `agents_md` | manifest-packets | 176 | — | postgres | Resolve the nearest AGENTS.md file for a given source path. Checks Redis first (agents:dir:<path>) then walks up the di… |
| 49 | `analytics:research_topics` | manifest-packets | 166 | — | postgres | Query the Redis-cached JSONL research index: qlora_examples joined with response_feedback, |
| 50 | `analytics:unified_research` | manifest-packets | 166 | — | postgres | Unified research query orchestrating: research-cache (qlora × feedback), |
| 66 | `engram.ace_packet_inject` | trace-mcp | 162 | — | engram | Write ACE context packet to Redis with 1h TTL: ace:packet:{runId}. |
| 78 | `ops.verify_write` | trace-mcp | 150 | — | — | Proves that a write actually occurred by reading the target back and computing its hash. A write is NOT proven merely b… |
| 92 | `atlas_get_active_context` | trace-mcp | 96 | — | — | Read the newest bounded ACE reconciliation packet from Redis Valkey, validate it, and return compact resume context. |
| 93 | `context.build_ace_packet` | trace-mcp | 96 | — | — | Build and persist a bounded ACE packet from a sourceRef or markdown content. Reads a local file when sourceRef resolves… |
| 116 | `engram.redis_health` | trace-mcp | 86 | — | redis | Check Redis availability used by engram memory tools. |
| 117 | `inference:route` | manifest-packets | 86 | — | postgres | Route an inference request through the optimal backend: TRT→Triton→Bifrost→Ollama cascade. Direct import bypasses HTTP … |
| 138 | `redis` | manifest-packets | 82 | — | postgres |  |

## LEXICAL

Layer lexical contains 53 tools. 0 expose identity fields and 48 write surfaces. Top-ranked tools: codebase:search, search.go_hybrid, kag.recall_similar_fix, kb.search_cards, chunk.lookup.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 3 | `codebase:search` | manifest-packets | 414 | — | postgres | Semantic code search using dual-vector (content + signature) embeddings in Qdrant. Uses 768-dim embeddinggemma vectors … |
| 8 | `search.go_hybrid` | trace-mcp, manifest-packets | 341 | — | postgres | Go search service RRF fusion: parallel FTS + pgvector + Qdrant with reciprocal rank fusion. Faster than in-process hybr… |
| 15 | `kag.recall_similar_fix` | trace-mcp | 255 | — | — | Recalls prior fixes for an error via exact-hash + pg_trgm similarity over error_fingerprints. |
| 16 | `kb.search_cards` | manifest-packets | 252 | — | postgres | Search the knowledge base for codebase "cards" (identity-spine chunks). Returns ranked cards with stable IDs (card:path… |
| 17 | `chunk.lookup` | manifest-packets | 248 | — | postgres | Look up a single codebase chunk by its Qdrant ID. Returns path, kind, domain, cluster, semantic tags. |
| 18 | `topology_search` | manifest-packets | 248 | — | postgres | Search the 4D topology-indexed codebase using cosine prefilter (Qdrant 768-dim) |
| 19 | `wiki_encyclopedia_search` | manifest-packets | 248 | — | postgres | Topological encyclopedia route that takes a query, searches Karpathy wiki + Qdrant + SOM clusters, returns did-you-mean… |
| 21 | `TurboVecService.Search` | manifest-packets | 246 | — | postgres | gRPC RPC TurboVecService.Search: TurboSearchRequest → TurboSearchResponse (declared in proto/active/turbovec.proto). |
| 22 | `codebase:ace_context` | manifest-packets | 240 | — | postgres | Run full ACE (Agentic Contextual Engineering) synthesis with optional codebase/AST context. Assembles user profile, cas… |
| 48 | `legal.find_similar_opinions` | trace-mcp | 168 | — | — | Find similar case opinions, judgments, and rulings via Qdrant semantic search on the legal_documents collection filtere… |
| 57 | `codebase:concurrent_research` | manifest-packets | 164 | — | postgres | LangGraph-style concurrent deep research over codebase_chunks_768. |
| 58 | `codebase.rg_search` | manifest-packets | 164 | — | postgres | Controlled ripgrep search over the codebase. Returns line hits from relative repo paths and is safe for exact symbol or… |
| 59 | `kb.expand_neighbors` | manifest-packets | 164 | — | postgres | Expand the topological neighborhood of a card or file using graph relationships. Returns structurally-related cards bas… |
| 60 | `kb.explain_retrieval` | manifest-packets | 164 | — | postgres | Provide an audit trace for why a specific card or search result was retrieved. Includes cluster dominance, community pu… |
| 61 | `kb.rg_atlas_search` | manifest-packets | 164 | — | postgres | Full RG-Atlas search pipeline: rg lexical sweep → GPU Karpathy blend → |
| 63 | `research:reddit_search` | manifest-packets | 164 | — | postgres | Search Reddit posts for community knowledge. Always uses raw_json=1 to prevent |
| 64 | `RetrievalService.ExpandAstNeighbors` | manifest-packets | 164 | — | postgres | gRPC RPC RetrievalService.ExpandAstNeighbors: AstExpansionRequest → AstExpansionResponse (declared in sveltekit-fronten… |
| 67 | `research:search_chunks` | manifest-packets | 162 | — | postgres | Semantic search over the chunks_web_search collection. Returns ranked results from |
| 68 | `kag.multi_lane_search` | trace-mcp | 160 | — | — | Performs 11-lane HyperRAG retrieval across hash, n-gram, graph, feature atlas, and activity prefetch lanes. Returns ran… |
| 69 | `analytics:codebase_research` | manifest-packets | 158 | — | postgres | Deep research codebase scanner using ripgrep pattern analysis, pipeline hit distribution, |
| 70 | `analytics:web_research` | manifest-packets | 158 | — | postgres | Run web research for selfPrompt queries: SearXNG/Google/DDG search → 768-dim embedding → |
| 71 | `CyberElephantService.ProcessDocuments` | manifest-packets | 158 | — | postgres | gRPC RPC CyberElephantService.ProcessDocuments: DocumentBatch → VectorSearchResponse (declared in proto/active/vectors.… |
| 72 | `CyberElephantService.SearchSimilar` | manifest-packets | 158 | — | postgres | gRPC RPC CyberElephantService.SearchSimilar: VectorQuery → VectorSearchResponse (declared in proto/active/vectors.proto… |
| 73 | `evidence:analyze_multimodal` | manifest-packets | 158 | — | postgres | GPU-accelerated multimodal evidence analysis (images/videos/audio): YOLO object detection, Whisper transcription, CLIP … |
| 74 | `evidence:search_similar` | manifest-packets | 158 | — | postgres | Cross-modal semantic search: find visually or acoustically similar evidence using CLIP/Whisper embeddings. Query with t… |
| 77 | `analytics:deep_research` | manifest-packets | 150 | — | postgres | Generate personalized deep research topics from RAG/KAG/DAG/ACE hit analytics, |
| 79 | `reports:generate_from_template` | manifest-packets | 150 | — | postgres | Generate a report from a legal template (charging memo, search warrant affidavit, case summary, evidence inventory, wit… |
| 129 | `search.hybrid` | trace-mcp | 84 | — | — | Performs hybrid (FTS + semantic) search across the codebase. |
| 150 | `search.postgres_fts` | trace-mcp | 80 | — | — | Code search using PostgreSQL Full Text Search. |
| 162 | `citations:search` | manifest-packets | 74 | — | postgres | Search legal citations across cases. Returns matching citations with source, page, and relevance. |
| 163 | `codebase:rg_search` | manifest-packets | 74 | — | postgres | Fast ripgrep search over the SvelteKit codebase. Supports regex patterns and file-type |
| 164 | `CodeIntelService.LookupChunk` | manifest-packets | 74 | — | postgres | gRPC RPC CodeIntelService.LookupChunk: ChunkLookupRequest → ChunkLookupResponse (declared in proto/active/codeintel.pro… |
| 165 | `compose:pipeline` | manifest-packets | 74 | — | postgres | Chain multiple tools sequentially. Each step can reference previous results via {{stepN.field}} template syntax. Exampl… |
| 166 | `kb.get_card` | manifest-packets | 74 | — | postgres | Retrieve the full content and high-fidelity metadata for a specific knowledge card by ID. Use this when you have a card… |
| 167 | `kb.search_schema_contract` | manifest-packets | 74 | — | postgres | Semantic search across the standalone schema-indexer contract cards. Use for schema-focused prompt context engineering … |
| 168 | `langextract:custom` | manifest-packets | 74 | — | postgres | Custom structured extraction with user-defined prompt and few-shot examples. Flexible for any domain (medical, financia… |
| 169 | `LibrarySearchService.GetDocumentToc` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.GetDocumentToc: TocRequest → TocResponse (declared in sveltekit-frontend/proto/active/lib… |
| 170 | `LibrarySearchService.GetNodeContext` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.GetNodeContext: NodeContextRequest → NodeContextResponse (declared in sveltekit-frontend/… |
| 171 | `LibrarySearchService.Health` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.Health: HealthRequest → HealthResponse (declared in sveltekit-frontend/proto/active/libra… |
| 172 | `LibrarySearchService.ResolveCitation` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.ResolveCitation: CitationRequest → CitationResponse (declared in sveltekit-frontend/proto… |
| 173 | `LibrarySearchService.SearchLibrary` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.SearchLibrary: LibrarySearchRequest → LibrarySearchResponse (declared in sveltekit-fronte… |
| 174 | `LibrarySearchService.StreamLibrary` | manifest-packets | 74 | — | postgres | gRPC RPC LibrarySearchService.StreamLibrary: LibrarySearchRequest → LibrarySearchEvent (declared in sveltekit-frontend/… |
| 175 | `rag:search` | manifest-packets | 74 | — | postgres | Perform a semantic search across legal documents and web |
| 176 | `research:github_search` | manifest-packets | 74 | — | postgres | Search GitHub issues, code, or repositories for deep research context. |
| 177 | `RetrievalService.GetClusterSummary` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.GetClusterSummary: ClusterSummaryRequest → ClusterSummaryResponse (declared in sveltekit-fron… |
| 178 | `RetrievalService.GetResearchContext` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.GetResearchContext: ResearchContextRequest → ResearchContextResponse (declared in sveltekit-f… |
| 179 | `RetrievalService.Health` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.Health: HealthRequest → HealthResponse (declared in sveltekit-frontend/proto/active/retrieval… |
| 180 | `RetrievalService.SearchChunks` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.SearchChunks: SearchChunksRequest → SearchChunksResponse (declared in sveltekit-frontend/prot… |
| 181 | `RetrievalService.SearchCodebase` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.SearchCodebase: CodebaseSearchRequest → CodebaseSearchResponse (declared in sveltekit-fronten… |
| 182 | `RetrievalService.SearchEvidence` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.SearchEvidence: EvidenceSearchRequest → EvidenceSearchResponse (declared in sveltekit-fronten… |
| 183 | `RetrievalService.StreamCodebase` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.StreamCodebase: CodebaseSearchRequest → CodebaseChunkEvent (declared in sveltekit-frontend/pr… |
| 184 | `RetrievalService.StreamEvidence` | manifest-packets | 74 | — | postgres | gRPC RPC RetrievalService.StreamEvidence: EvidenceSearchRequest → EvidenceBundleEvent (declared in sveltekit-frontend/p… |
| 185 | `vault.search` | manifest-packets | 74 | — | postgres | Search the Obsidian codebase vault by keyword (case-insensitive substring on title + frontmatter + body) with optional … |

## DENSE

Layer dense contains 33 tools. 2 expose identity fields and 20 write surfaces. Top-ranked tools: atlas.packet_search, image.enrich_tags, wiki.explain_page, atlas.coverage, atlas.prefilter.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 5 | `atlas.packet_search` | trace-mcp, manifest-packets | 356 | feature_id, source_ref | postgres | Query the canonical atlas_packets table by source_ref path (variants tried automatically), |
| 14 | `image.enrich_tags` | trace-mcp | 256 | — | — | VLM-enrich one Qdrant evidence point with auto-generated tags. Fetches the image (from payload file_path or MinIO), run… |
| 24 | `wiki.explain_page` | trace-mcp, manifest-packets | 236 | — | postgres | Returns a detailed explanation of a specific wiki page (directory or feature), including related files, imports, cluste… |
| 27 | `atlas.coverage` | trace-mcp, manifest-packets | 214 | feature_id, source_ref | postgres | Phase 3I verification gate: reports coverage metrics for atlas_packets. |
| 41 | `atlas.prefilter` | trace-mcp | 176 | — | — | TurboVec ANN cluster prefilter. Embeds the query and queries the TurboVec sidecar (:8099) to identify the top-N cluster… |
| 47 | `graph.status` | manifest-packets | 168 | — | postgres | Report current graph indexing health: cluster count, chunk count, embedding coverage, Neo4j reachability. |
| 51 | `gpu:similarity` | manifest-packets | 166 | — | postgres | Compute pairwise cosine similarity matrix on GPU via LibTorch CUDA (bypasses HTTP, ~5-20ms). Falls back to CPU if GPU u… |
| 52 | `image.caption` | trace-mcp | 166 | — | — | Get a VLM-generated caption and suggested tags for a local image file. Calls the Gemma4-VLM pipeline (Triton→TurboQuant… |
| 53 | `image.search_by_text` | trace-mcp | 166 | — | — | Search the evidence image index using a text description. Embeds the query via embeddinggemma and searches Qdrant. No i… |
| 54 | `TurboVecService.Health` | manifest-packets | 166 | — | postgres | gRPC RPC TurboVecService.Health: HealthRequest → HealthResponse (declared in proto/active/turbovec.proto). |
| 55 | `TurboVecService.Transform` | manifest-packets | 166 | — | postgres | gRPC RPC TurboVecService.Transform: TransformRequest → TransformResponse (declared in proto/active/turbovec.proto). |
| 56 | `TurboVecService.Upsert` | manifest-packets | 166 | — | postgres | gRPC RPC TurboVecService.Upsert: UpsertRequest → UpsertResponse (declared in proto/active/turbovec.proto). |
| 62 | `ldr_research` | trace-mcp | 164 | — | — | Execute Local Deep Research - autonomous web search, document extraction, and synthesis for questions Parent Atlas cann… |
| 75 | `embedding:generate` | manifest-packets | 154 | — | postgres | Generate 768-dim embeddings via gRPC direct (bypasses HTTP, ~50ms vs ~180ms). Falls back to Ollama HTTP if gRPC unavail… |
| 76 | `EmbeddingService.GenerateEmbeddings` | manifest-packets | 154 | — | postgres | gRPC RPC EmbeddingService.GenerateEmbeddings: EmbeddingRequest → EmbeddingResponse (declared in proto/active/embedding.… |
| 81 | `ops.fixer_pattern_store` | trace-mcp | 142 | — | — | [OPERATOR-GATED] Stores a fix attempt outcome to the 3-layer fixer memory. Increments success/failure counts, upserts t… |
| 82 | `ops.trust_audit` | trace-mcp | 142 | — | — | Read-only audit of the trust-tier injection-detection system. Returns count of blocked content hashes and the most rece… |
| 109 | `atlas.embedding_all_tags` | trace-mcp | 88 | — | — | Comprehensive tag derivation for a packet embedding. Combines keywords, cluster tags, and neighbor query in parallel. R… |
| 110 | `atlas.embedding_neighbors` | trace-mcp | 88 | — | — | Find semantically adjacent packets via Qdrant ANN search on a 768-dimensional embedding. Returns a query structure for … |
| 112 | `evidence.search_by_image` | trace-mcp | 88 | — | — | Search evidence by uploading an image. The VLM describes the image, embeds it, and returns semantically similar evidenc… |
| 113 | `legal.batch_ingest` | trace-mcp | 88 | — | — | Publish one or more document URLs to the document.embed RabbitMQ queue for background embedding and indexing. Use to bu… |
| 114 | `legal.cross_reference_evidence` | trace-mcp | 88 | — | — | Semantic cross-reference: find evidence chunks similar to a reference evidence item across one or more cases using Qdra… |
| 115 | `topology.language_distribution` | trace-mcp | 88 | — | — | Get language distribution across Qdrant clusters. Queries codebase_chunks_768 payload tags (language field) and returns… |
| 151 | `CyberElephantService.GetClusters` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.GetClusters: ClusterRequest → ClusterResponse (declared in proto/active/vectors.proto). |
| 152 | `CyberElephantService.GetDocumentById` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.GetDocumentById: DocumentIdRequest → DocumentVector (declared in proto/active/vectors.pro… |
| 153 | `CyberElephantService.GetStatus` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.GetStatus: StatusRequest → SystemStatus (declared in proto/active/vectors.proto). |
| 154 | `CyberElephantService.HealthCheck` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.HealthCheck: HealthRequest → HealthResponse (declared in proto/active/vectors.proto). |
| 155 | `CyberElephantService.UpdateClusters` | manifest-packets | 78 | — | postgres | gRPC RPC CyberElephantService.UpdateClusters: ClusterUpdateRequest → ClusterResponse (declared in proto/active/vectors.… |
| 156 | `EmbeddingService.GetStats` | manifest-packets | 78 | — | postgres | gRPC RPC EmbeddingService.GetStats: StatsRequest → StatsResponse (declared in proto/active/embedding.proto). |
| 157 | `EmbeddingService.Health` | manifest-packets | 78 | — | postgres | gRPC RPC EmbeddingService.Health: HealthRequest → HealthResponse (declared in proto/active/embedding.proto). |
| 158 | `EmbeddingService.StreamEmbeddings` | manifest-packets | 78 | — | postgres | gRPC RPC EmbeddingService.StreamEmbeddings: EmbeddingChunk → EmbeddingResult (declared in proto/active/embedding.proto). |
| 159 | `evidence:analyze` | manifest-packets | 78 | — | postgres | Analyze evidence text: extract entities, detect forensic patterns, auto-tag with 3-store mirroring (pgvector + Qdrant +… |
| 160 | `vault.read` | manifest-packets | 78 | — | postgres | Read one Obsidian note. Returns parsed frontmatter, full body, extracted typed edges (up/same/imports/contains), and em… |

## GRAPH

Layer graph contains 38 tools. 3 expose identity fields and 15 write surfaces. Top-ranked tools: wiki.refresh_directory, kag.feature_lookup, trace.graphrag_search, codebase:graph_traverse, graph.pagerank_top.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 25 | `wiki.refresh_directory` | trace-mcp, manifest-packets | 228 | — | postgres | Refreshes one directory card (LLMS.md mirror). Default dryRun=true. |
| 32 | `kag.feature_lookup` | trace-mcp | 194 | — | — | Look up which files implement a named feature. Queries the durable feature_implementations + feature_file_edges tables … |
| 34 | `trace.graphrag_search` | trace-mcp | 182 | — | — | GraphRAG hybrid retrieval: dense+sparse RRF prefetch → Neo4j graph expansion → Karpathy blend rerank. |
| 42 | `codebase:graph_traverse` | manifest-packets | 172 | — | postgres | Multi-hop graph traversal from a start file. Returns subgraph nodes and edges with LibTorch PageRank scores. Use mode=e… |
| 43 | `graph.pagerank_top` | trace-mcp, manifest-packets | 172 | — | postgres | Return the top-N highest PageRank nodes (most architecturally central files). |
| 44 | `graph.semantic_path_synthesis` | trace-mcp | 170 | — | — | Synthesizes a semantic narrative along the shortest structural path between nodes. |
| 45 | `hypergraph.semantic_path_synthesis` | trace-mcp | 170 | — | — | Synthesizes a semantic narrative along a path in the hypergraph. |
| 46 | `library.registry_fetch_tier` | trace-mcp | 170 | — | — | Fetch Tier 3 (bounded, depth-limited implementation subset, with content) or Tier 4 (full walk, paths-only) file conten… |
| 65 | `atlas.explain_trace` | trace-mcp | 162 | — | — | Return the compact summary and retrieval path for the current Atlas packet. |
| 80 | `ops.gpu_pagerank` | trace-mcp | 148 | — | — | GPU power-iteration PageRank on a flat adjacency matrix. Returns normalised rank scores (sum to 1.0). Cached 300 s by s… |
| 88 | `atlas.graph.pagerank` | trace-mcp | 102 | packet_key | — | List the top authoritative nodes in the codebase by PageRank score (computed by Neo4j GDS). Returns paginated results w… |
| 89 | `clusters.som_cell_lookup` | trace-mcp | 102 | source_ref, packet_key | — | Look up packets in a 20×20 SOM grid cell and its Moore neighborhood (8 adjacent cells). Returns packet_key, source_ref,… |
| 90 | `context.build_indexed_source_packet` | trace-mcp | 102 | source_ref | — | Build a compact Valkey-backed packet for an already indexed source_ref. Prefers Parent Atlas identity lookup (NES card … |
| 94 | `atlas.build_taxonomy_topology_packet` | trace-mcp | 94 | — | — | Build a compact ACE packet for taxonomy/topology routing. Combines ontology path, top children, SOM 20x20 neighborhood,… |
| 95 | `atlas.compact_context` | trace-mcp | 94 | — | — | Build a compact Atlas context packet with top chunks, sourceRefs, a compressed summary, confidence, and retrieval path. |
| 96 | `context.prefetch_feature_context` | trace-mcp | 94 | — | — | Build a prefetch packet for the next feature edit using recent activity, directory KAG context, community graph context… |
| 97 | `graph.materialize_pathway` | trace-mcp | 94 | — | — | Materializes a synthesized pathway into the persistent hypergraph context. |
| 98 | `hypergraph.explain_activation` | trace-mcp | 94 | — | — | Explains why a specific hypergraph edge was activated for a set of query terms. |
| 99 | `hypergraph.get_edge` | trace-mcp | 94 | — | — | Returns full details for a specific hypergraph edge. |
| 100 | `kb.search_pathways` | trace-mcp | 94 | — | — | Searches for previously synthesized and materialized pathways. |
| 101 | `library.registry_lookup` | trace-mcp | 94 | — | — | Resolve a library/package identity by its canonical address (e.g. "npm:ts-morph@27.0.2", "pip:torch@2.8.0+cu128"). Retu… |
| 102 | `research.playbook_lookup_by_language` | trace-mcp | 94 | — | — | Lookup code playbooks and examples by programming language. Searches CouchDB karpathy_wiki (stored playbooks indexed by… |
| 103 | `runtime.sse_probe` | trace-mcp | 94 | — | — | Verifies TRACE MCP Streamable HTTP/SSE path by calling tools/list with Accept: text/event-stream. |
| 104 | `taxonomy.path` | trace-mcp | 94 | — | — | Returns the full ontological path from a leaf node to root. |
| 105 | `topology.search_som_neighborhood` | trace-mcp | 94 | — | — | Searches for nodes in the SOM grid neighborhood of an anchored query. |
| 108 | `hypergraph.search` | trace-mcp | 90 | — | — | Semantic search across the hypergraph edges. |
| 118 | `codebase:file_intel` | manifest-packets | 84 | — | postgres | Unified file intelligence: Neo4j AST metadata, IMPORTS graph edges (in+out), GPU cluster assignment, and missing-import… |
| 119 | `codebase:graph_neighbors` | manifest-packets | 84 | — | postgres | Return immediate graph neighbors for a file: files it imports and files that import it. Useful for impact analysis and … |
| 120 | `evidence.link_image_graph` | trace-mcp | 84 | — | qdrant | Create IMAGE_FOR edges in Neo4j from an evidence image node to CodebaseFile nodes. Normally fires automatically after s… |
| 121 | `graph.community_for_node` | trace-mcp, manifest-packets | 84 | — | neo4j, postgres | Get the GPU cluster, SOM cluster, and community membership for a node. |
| 122 | `graph.expand_neighborhood` | trace-mcp, manifest-packets | 84 | — | neo4j, postgres | Expand graph neighborhood from sourceRefs. Returns nodes/edges/sourceRefs/confidence and compatibility neighbors. |
| 123 | `graph.index` | manifest-packets | 84 | — | postgres | Trigger graph indexing pipeline: Neo4j sync → SOM topology training → GPU graph analysis. |
| 124 | `graph.shortest_path` | trace-mcp, manifest-packets | 84 | — | neo4j, postgres | Find the shortest dependency path between two files or symbols in Neo4j. |
| 125 | `graphrag_expand_context` | manifest-packets | 84 | — | postgres | Expand relationships and explain paths using GraphRAG (Neo4j, CouchDB). |
| 126 | `hypergraph.expand_members` | trace-mcp | 84 | — | neo4j | Returns all related edges for a given edge hash by member overlap. |
| 127 | `langextract:file` | manifest-packets | 84 | — | postgres | Extract structured information from a file path or URL. Supports PDF, TXT, and web pages. Uses LangExtract multi-pass p… |
| 128 | `RetrievalService.GetTopologyContext` | manifest-packets | 84 | — | postgres | gRPC RPC RetrievalService.GetTopologyContext: TopologyRequest → TopologyResponse (declared in sveltekit-frontend/proto/… |
| 149 | `neo4j` | manifest-packets | 80 | — | postgres |  |

## RERANK

Layer rerank contains 6 tools. 0 expose identity fields and 4 write surfaces. Top-ranked tools: search.rerank, turbovec.rank_chunks, GpuBridgeService.AssignSom, GpuBridgeService.BatchCosine, GpuBridgeService.EncodeLatent.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 106 | `search.rerank` | trace-mcp | 92 | — | — | Reranks a list of document snippets for relevance to a query using llama-server. |
| 107 | `turbovec.rank_chunks` | trace-mcp | 92 | — | — | Read-only RotorQuant blended rerank for sourceRefs. No writes. |
| 130 | `GpuBridgeService.AssignSom` | manifest-packets | 82 | — | postgres | gRPC RPC GpuBridgeService.AssignSom: AssignSomRequest → AssignSomResponse (declared in proto/active/gpu_bridge.proto). |
| 131 | `GpuBridgeService.BatchCosine` | manifest-packets | 82 | — | postgres | gRPC RPC GpuBridgeService.BatchCosine: BatchCosineRequest → BatchCosineResponse (declared in proto/active/gpu_bridge.pr… |
| 132 | `GpuBridgeService.EncodeLatent` | manifest-packets | 82 | — | postgres | gRPC RPC GpuBridgeService.EncodeLatent: EncodeLatentRequest → EncodeLatentResponse (declared in proto/active/gpu_bridge… |
| 137 | `marco_rerank_chunks` | manifest-packets | 82 | — | postgres | Rerank chunks after retrieval using MarcoReranker logic. |

## SYNTHESIS

Layer synthesis contains 29 tools. 1 expose identity fields and 13 write surfaces. Top-ranked tools: atlas.populate_feature_documents, legal.build_timeline, legal.cross_examine, legal.issue_spotter, legal.mock_trial.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 111 | `atlas.populate_feature_documents` | trace-mcp | 88 | feature_id | — | Generate or refresh the feature-scoped docs bundle for Parent Atlas. Builds docs/features note content, writes docs/<fe… |
| 133 | `legal.build_timeline` | trace-mcp | 82 | — | — | Extract a chronological timeline of events from all evidence associated with a case using Gemma4 NER. Returns TimelineE… |
| 134 | `legal.cross_examine` | trace-mcp | 82 | — | — | Generate strategic cross-examination questions for a witness using Gemma4. Analyzes the witness statement and case cont… |
| 135 | `legal.issue_spotter` | trace-mcp | 82 | — | — | Gemma4 legal issue analysis: identifies legal issues, applicable statutes, strengths, weaknesses, missing evidence, and… |
| 136 | `legal.mock_trial` | trace-mcp | 82 | — | — | Multi-role mock trial simulation using Gemma4. Prosecution makes an opening statement, defense counters, then a judge d… |
| 139 | `shell.run` | trace-mcp | 82 | — | — | Run a bash command and return output. Used by Gemma4 to safely invoke shell operations. Output is truncated to 10KB to … |
| 140 | `kag.web_search` | trace-mcp | 80 | — | — | L10 lane web search (T4 trust). Searches the web for information-seeking queries. Skips for code/error queries. Returns… |
| 141 | `kb.explain_context_pack` | trace-mcp | 80 | — | — | Explains the retrieval provenance and assembly logic for a generated context pack. |
| 142 | `LLMS.md.binding_chain` | trace-mcp | 80 | — | — | Walks the LLMS.md binding hierarchy for a file to determine the order of applying envelopes. |
| 143 | `LLMS.md.context_for_file` | trace-mcp | 80 | — | — | Returns only the AGENTS-related slice of the atlas context packet for a file. |
| 144 | `LLMS.md.coverage` | trace-mcp | 80 | — | — | Reports the population status of the LLMS.md envelope for a file. |
| 145 | `LLMS.md.coverage_chain` | trace-mcp | 80 | — | — | Returns the full LLMS.md inheritance chain for a file. |
| 146 | `LLMS.md.peers_for_dir` | trace-mcp | 80 | — | — | Returns the directory card directly from the atlas cache. |
| 147 | `LLMS.md.peers_via_relations` | trace-mcp | 80 | — | — | Finds neighboring directories using the SHARES_TAGS hypergraph relation. |
| 148 | `LLMS.md.shares_tags` | trace-mcp | 80 | — | — | Returns neighboring directories based on shared tags in their LLMS.md files. |
| 161 | `kb.archive_synthesis` | trace-mcp | 76 | — | — | Archive a synthesis artifact. |
| 187 | `codeintel.ace.context` | manifest-packets | 72 | — | postgres | Assemble a normalized ACE CodeIntel context bundle from cluster summaries, chunk metadata, and health stats. Returns st… |
| 188 | `codeintel.fix_recommend` | manifest-packets | 72 | — | postgres | Given a TypeScript/SvelteKit compiler error or runtime exception, retrieves semantically similar codebase chunks from t… |
| 189 | `face:identify` | manifest-packets | 72 | — | postgres | Multi-pass GRPO face matching for a reference POI using gemma4 VLM. |
| 191 | `langextract:legal` | manifest-packets | 72 | — | postgres | Extract structured legal entities from text using Google LangExtract + gemma4-rotorquant:latest. Returns parties (plain… |
| 192 | `ace.wiki` | manifest-packets | 70 | — | postgres | Generate a structured wiki-style article about a query from ACE codebase context. |
| 193 | `cluster.summary.get` | manifest-packets | 70 | — | postgres | Fetch the LLM-generated summary for a GPU cluster (purpose, patterns, warnings, tags). |
| 194 | `clusters.get_summary_lenses` | trace-mcp, manifest-packets | 70 | — | postgres | Get the LLMS.md wiki summary and KAG notes for a cluster. Fastest way to understand what a cluster does. |
| 195 | `codebase:explain_cluster` | manifest-packets | 70 | — | postgres | Return a VLM-synthesised narrative for a GPU k-means cluster in the codebase index. |
| 196 | `CodeIntelService.SummarizeCluster` | manifest-packets | 70 | — | postgres | gRPC RPC CodeIntelService.SummarizeCluster: SummarizeClusterRequest → SummarizeClusterResponse (declared in proto/activ… |
| 197 | `EnrichmentService.SummarizeCluster` | manifest-packets | 70 | — | postgres | gRPC RPC EnrichmentService.SummarizeCluster: ClusterSummaryRequest → ClusterSummaryResponse (declared in proto/active/c… |
| 198 | `llm_synthesis.log_event` | manifest-packets | 70 | — | postgres | Durably log an LLM synthesis event: writes to Postgres llm_synthesis_events, |
| 199 | `poi:face_synth` | manifest-packets | 70 | — | postgres | Generate QLoRA synthetic training data (JSONL) for POI face identity fine-tuning. |
| 200 | `stable_diffusion_generate` | manifest-packets | 70 | — | postgres | Generate images from text prompts using Stable Diffusion (legal document visualization, crime scene reconstruction, etc… |

## OPS

Layer ops contains 12 tools. 0 expose identity fields and 4 write surfaces. Top-ranked tools: ops.audit_tool_result, ops.gpu_pipeline_stats, ops.gpu_topk, ops.inspect_tool_contract, ops.search_tools.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 204 | `ops.audit_tool_result` | trace-mcp | 58 | — | — | Verifies that a tool result is consistent with what was attempted. Classifies the result and determines whether a side … |
| 205 | `ops.gpu_pipeline_stats` | trace-mcp | 58 | — | — | Returns GPU pipeline diagnostics: active stream slots, pending queue depth, cache hit rate over last 50 ops, and device… |
| 206 | `ops.gpu_topk` | trace-mcp | 58 | — | — | GPU top-k index selection. Returns k indices of highest-scoring candidates in descending order. Use after pipelineAtten… |
| 207 | `ops.inspect_tool_contract` | trace-mcp | 58 | — | — | Returns the formal input contract for a named ops.* tool: required fields, types, nullability, side-effect class, and a… |
| 208 | `ops.search_tools` | trace-mcp | 58 | — | — | Search the bounded tool catalog and return a compact always-include + recent + ranked subset. Use this to avoid floodin… |
| 209 | `ops.validate_claims` | trace-mcp | 58 | — | — | Parses proposed agent response claims and verifies each one against evidence. Detects false completion claims (claiming… |
| 210 | `ops.validate_tool_call` | trace-mcp | 58 | — | — | Pre-flight validation for any ops.* write tool call. Checks all required arguments are non-null non-empty strings, vali… |
| 211 | `ops.execute_graphify` | trace-mcp | 54 | — | — | Executes an authorized graphify pipeline command. |
| 215 | `ops.propose_patch` | trace-mcp | 48 | — | postgres, kanban | PROPOSES a patch for a file. READ-ONLY PREVIEW. Does NOT modify files. |
| 216 | `ops.record_fix_attempt` | trace-mcp | 48 | — | postgres, kanban | Records a fix attempt and its outcome to the persistent audit log. |
| 217 | `ops.run_quality_gate` | trace-mcp | 48 | — | postgres | Executes a project-wide quality gate (tsc or vitest-all). |
| 218 | `ops.run_targeted_test` | trace-mcp | 48 | — | postgres | Executes a single Vitest test file and returns the outcome. |

## READ

Layer read contains 5 tools. 0 expose identity fields and 2 write surfaces. Top-ranked tools: atlas.get_chunk, file.read_window, kb.wiki_note_lookup, db.schema_overview, db.table_inspect.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 186 | `atlas.get_chunk` | trace-mcp | 72 | — | — | Return a chunk from the compact Atlas chunk index, optionally prioritizing a chunkId, chunkIndex, or sourceRef. |
| 190 | `file.read_window` | trace-mcp | 72 | — | — | Reads a bounded window/range of lines from a file. Highly recommended for reading large markdown (.md) or JSON files to… |
| 201 | `kb.wiki_note_lookup` | trace-mcp | 68 | — | — | Look up notes in the wiki. |
| 202 | `db.schema_overview` | trace-mcp | 62 | — | postgres | Lists every table in the public schema with row estimate + structural flags. |
| 203 | `db.table_inspect` | trace-mcp | 62 | — | postgres | Returns columns + indexes + foreign keys for one table. No row data. |

## UNKNOWN

Layer unknown contains 120 tools. 3 expose identity fields and 65 write surfaces. Top-ranked tools: trace.kag_search, clusters.get_members, topology.search_near, search.dev_context, topology.search_4d.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 4 | `trace.kag_search` | trace-mcp, manifest-packets | 364 | — | postgres | Full KAG-DAG retrieval: semantic vector search + knowledge graph expansion + LLMS.md context. Heavier than search__dev_… |
| 28 | `clusters.get_members` | trace-mcp, manifest-packets | 212 | — | postgres | List files in a GPU or directory cluster, sorted by PageRank. |
| 29 | `topology.search_near` | trace-mcp, manifest-packets | 204 | — | postgres | Search the 4D SOM manifold for files near a natural-language query. Useful for finding semantically similar code across… |
| 30 | `search.dev_context` | trace-mcp, manifest-packets | 202 | — | postgres | Search the codebase for context relevant to a coding or debugging query. Returns ranked file chunks with stable keys. C… |
| 31 | `topology.search_4d` | trace-mcp, manifest-packets | 200 | — | postgres | SOM X (BMU column) |
| 83 | `trace.explain_retrieval` | trace-mcp, manifest-packets | 126 | — | postgres | Inspect the cached retrieval trace for a previous query. Shows which sources contributed and why. |
| 84 | `topology.same_som_cluster` | trace-mcp, manifest-packets | 124 | — | postgres | Find all files sharing the same SOM cluster as the given node. Good for finding related implementations. |
| 86 | `kb.hybrid_search` | trace-mcp, manifest-packets | 110 | — | postgres |  |
| 212 | `atlas.feature_document_enrichment_plan` | trace-mcp | 52 | source_ref | — | Build a deterministic, non-mutating Parent Atlas feature-document enrichment plan. Validates feature-doc sources, folds… |
| 213 | `atlas.feature_document_status` | trace-mcp | 52 | feature_id | — | Return feature-scoped document evidence readiness for Parent Atlas. Checks docs/features notes, docs/<feature_id> bundl… |
| 214 | `atlas.materialize_feature_evidence_tuples` | trace-mcp | 52 | source_ref, packet_key | — | Read-only tuple materializer for Parent Atlas feature-document evidence. Links feature docs to canonical packet_key, so… |
| 219 | `atlas.feature_document_ingestion_plan` | trace-mcp | 44 | — | — | Return the validated ingestion plan for a feature docs bundle. Reads docs/<feature>/manifest.json, filters officialDocs… |
| 220 | `atlas.pos_concept_tagging` | trace-mcp | 44 | — | — | Build a deterministic POS/concept tagging packet from AST, semantic, topology, ranking, citation, screenshot, and MCP t… |
| 221 | `atlas.suggest_files` | trace-mcp | 44 | — | — | Return the top suggested files from the compact Atlas packet. |
| 222 | `atlas.workstation_status` | trace-mcp | 44 | — | — | Return Parent Atlas workstation readiness from the canonical Postgres spine plus lane-health artifacts. Use this before… |
| 223 | `clusters.kmeans_members` | trace-mcp | 44 | — | — | List packets belonging to K-means clusters (0–19, from atlas_packets.som_cluster). Returns source refs, authority score… |
| 224 | `codebase.context_for_file` | trace-mcp | 44 | — | — | Returns the full atlas context packet for a specific file. |
| 225 | `context.explain_compression` | trace-mcp | 44 | — | — | Explains the compression logic and token budget for a specific task packet. |
| 226 | `context.refresh_task_toc` | trace-mcp | 44 | — | — | Refreshes the Table of Contents for a specific task context. |
| 227 | `kag.ingest_error` | trace-mcp | 44 | — | — | Fingerprints and stores a raw error text for future retrieval. |
| 228 | `kag.ingest_memory_directory` | trace-mcp | 44 | — | — | Ingests agent run records from the memory directory into the database. |
| 229 | `kag.panel_context` | trace-mcp | 44 | — | — | Return recently viewed files and tools from panel_activity_log for the active user session (HyperRAG L11 prefetch). Pro… |
| 230 | `kag.record_agent_run` | trace-mcp | 44 | — | — | Records an autonomous agent run artifact to memory. |
| 231 | `kb.organize_messy_text` | trace-mcp | 44 | — | — | Organize messy text into structured entities and sections. |
| 232 | `kb.search_notecards` | trace-mcp | 44 | — | — | Searches for identity-spine notecards matching a query. |
| 233 | `kb.search_summary_tree` | trace-mcp | 44 | — | — | RAPTOR-style hierarchical search across per-chunk lens, cluster narrative, and directory-card summary tiers. |
| 234 | `kb.trace_search` | trace-mcp | 44 | — | — | Search the hypergraph/KAG context for documents, cards, and relations matching a query. |
| 235 | `knowledge.get_minified_map` | trace-mcp | 44 | — | — | Returns a minified architectural map for a specific directory. |
| 236 | `legal.find_precedents` | trace-mcp | 44 | — | — | Semantic + full-text search across legal precedents, case opinions, and rulings. Returns ranked results with citation, … |
| 237 | `legal.get_transcript` | trace-mcp | 44 | — | — | Retrieve the Whisper transcript for an audio/video evidence item that has already been processed. Returns the full text… |
| 238 | `legal.score_case` | trace-mcp | 44 | — | — | Compute an evidence-weighted case strength score (0-100) for a given case. Factors: evidence count (×10, max 40), witne… |
| 239 | `legal.search_recordings` | trace-mcp | 44 | — | — | Timestamp-aware semantic search across Whisper audio segments. Returns matching segments with start/end times so prosec… |
| 240 | `legal.similar_cases` | trace-mcp | 44 | — | — | Find cases similar to a given case using PostgreSQL full-text similarity on case title and description. Returns up to 2… |
| 241 | `legal.write_obsidian_note` | trace-mcp | 44 | — | — | Write or append a markdown note to the Obsidian vault via the Local REST API plugin (requires Obsidian running at ENV.O… |
| 242 | `library.registry_rescan` | trace-mcp | 44 | — | — | Trigger a rescan of the library registry (npm root + sveltekit-frontend + miniforge pip sidecar). Runs scripts/atlas/li… |
| 243 | `library.registry_search` | trace-mcp | 44 | — | — | Search the library registry by name substring, source type, package manager, or workspace root. Returns bounded metadat… |
| 244 | `miniforge.analyze` | trace-mcp | 44 | — | — | Run Miniforge CUDA-backed NLP analysis over text for entities, relationships, chunks, and features. |
| 245 | `miniforge.extract` | trace-mcp | 44 | — | — | Run Miniforge CUDA-backed extraction over text and return normalized structure plus extracted entities. |
| 246 | `miniforge.health` | trace-mcp | 44 | — | — | Check the local Miniforge CUDA sidecar used for NLP and analysis. |
| 247 | `phase109a_archive_signal` | trace-mcp | 44 | — | — | Archive a semantic signal: transitions ACTIVE or SUPERSEDED to ARCHIVED state. Creates immutable audit event in semanti… |
| 248 | `phase109a_promote_recommendation` | trace-mcp | 44 | — | — | Promote a recommendation to APPROVED status. Enforces mutual approval safeguard (approver ≠ creator). Supports dry-run … |
| 249 | `phase109a_query_signal_history` | trace-mcp | 44 | — | — | Query the state transition history for a semantic signal. Returns all audit events in reverse chronological order. |
| 250 | `phase109a_supersede_recommendation` | trace-mcp | 44 | — | — | Supersede a recommendation with a replacement: transitions ACTIVE lifecycle_state to SUPERSEDED. Revision-aware — rejec… |
| 251 | `phase109a_supersede_signal` | trace-mcp | 44 | — | — | Supersede a semantic signal with a replacement: transitions ACTIVE to SUPERSEDED. Sets superseded_by link and creates a… |
| 252 | `phase109a_validate_state_transition` | trace-mcp | 44 | — | — | Validate whether a state transition is allowed without making changes. Useful for dry-run validation. |
| 253 | `runtime.quic_status` | trace-mcp | 44 | — | — | Reports QUIC/HTTP3 dev-lane configuration and probes the local Caddy/Vite QUIC endpoint if present. |
| 254 | `runtime.simdjson_status` | trace-mcp | 44 | — | — | Reports SIMD/AVX2 JSON parser availability, fallback mode, cache metrics, and safe usage notes. |
| 255 | `service_workers.result` | trace-mcp | 44 | — | — | Fetch the result of a queued local trace service worker job by job id. |
| 256 | `service_workers.status` | trace-mcp | 44 | — | — | Return the current local trace service worker queue status and recent job summaries. |
| 257 | `taxonomy.children` | trace-mcp | 44 | — | — | Lists children of a specific ontological node in the topology. |
| 258 | `tools.batch_call` | trace-mcp | 44 | — | — | Executes multiple tool calls in parallel to reduce total latency. |
| 259 | `topology.hydration_status` | trace-mcp | 44 | — | — | Returns a diagnostic overview of topological hydration coverage. |
| 260 | `topology.recompute_manifold_plan` | trace-mcp | 44 | — | — | Provides a recommended plan for restoring topological hydration. |
| 261 | `trace_dynamic_context` | trace-mcp | 44 | — | — | Build a bounded evidence bundle with the first trace_dynamic_context slice: static discovery plus canonical Postgres jo… |
| 262 | `trace_search` | trace-mcp | 44 | — | — | DEPRECATED bare-name alias for kb.trace_search. Gated by MCP_LEGACY_ALIASES. |
| 263 | `trace.system_health` | trace-mcp | 44 | — | — | Returns the health and latency status of all backend retrieval and inference services. |
| 264 | `trace.validate_ace_hit` | trace-mcp | 44 | — | — | Validates a retrieved chunk against the ACE cache and graph contracts. |
| 265 | `ui.analyze_view` | trace-mcp | 44 | — | — | Analyzes the current UI state based on a provided snapshot. |
| 266 | `wiki_note_lookup` | trace-mcp | 44 | — | — | DEPRECATED bare-name alias for kb.wiki_note_lookup. Gated by MCP_LEGACY_ALIASES. |
| 267 | `admin.log_event` | trace-mcp | 40 | — | — | Logs a manual administrative event with context. |
| 268 | `kb.extract_citations` | trace-mcp | 40 | — | — | Extract legal citations and statutes from text. |
| 269 | `skills.list` | trace-mcp | 40 | — | — | Filter skills by name or description. |
| 270 | `skills.run_mission` | trace-mcp | 40 | — | — | Execute a specialized autonomous skill mission. |
| 271 | `analytics:mapreduce_matrix` | manifest-packets | 34 | — | postgres | Execute MapReduce matrix analysis across RAG/KAG/DAG/ACE pipelines. |
| 272 | `ast:cross_language` | manifest-packets | 34 | — | postgres | Synthesize cross-language equivalents for a TypeScript/JS function. |
| 273 | `cases:create` | manifest-packets | 34 | — | postgres | Create a new legal case. Returns the created case with ID. |
| 274 | `cases:delete` | manifest-packets | 34 | — | postgres | Delete a case and all associated data. Use with caution. |
| 275 | `ChatAssistantService.CreateSession` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.CreateSession: CreateSessionRequest → SessionInfo (declared in proto/active/chat_assistan… |
| 276 | `ChatAssistantService.GetHistory` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.GetHistory: HistoryRequest → HistoryResponse (declared in proto/active/chat_assistant.pro… |
| 277 | `ChatAssistantService.Health` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.Health: ChatHealthRequest → ChatHealthResponse (declared in proto/active/chat_assistant.p… |
| 278 | `ChatAssistantService.RAGQuery` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.RAGQuery: RAGQueryRequest → RAGQueryResponse (declared in proto/active/chat_assistant.pro… |
| 279 | `ChatAssistantService.SendMessage` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.SendMessage: ChatRequest → ChatResponse (declared in proto/active/chat_assistant.proto). |
| 280 | `ChatAssistantService.StreamMessage` | manifest-packets | 34 | — | postgres | gRPC RPC ChatAssistantService.StreamMessage: ChatRequest → ChatToken (declared in proto/active/chat_assistant.proto). |
| 281 | `Chr97Agent.GetCartridge` | manifest-packets | 34 | — | postgres | gRPC RPC Chr97Agent.GetCartridge: GetCartridgeRequest → GetCartridgeResponse (declared in proto/active/chr97_agent.prot… |
| 282 | `Chr97Agent.GetTimeline` | manifest-packets | 34 | — | postgres | gRPC RPC Chr97Agent.GetTimeline: TimelineRequest → TimelineResponse (declared in proto/active/chr97_agent.proto). |
| 283 | `Chr97Agent.QueryTags` | manifest-packets | 34 | — | postgres | gRPC RPC Chr97Agent.QueryTags: TagQueryRequest → TagQueryResponse (declared in proto/active/chr97_agent.proto). |
| 284 | `citations:add_to_case` | manifest-packets | 34 | — | postgres | Add a legal citation to a case. Stores citation text, source, and page reference. |
| 285 | `codebase:get_buffer` | manifest-packets | 34 | — | postgres | Retrieve a pre-assembled context buffer containing high-token codebase insights (e.g. architecture overview). |
| 286 | `codeintel.health` | manifest-packets | 34 | — | postgres | Check CodeIntel pipeline health (cluster_summaries + chunk index + gRPC reachability). |
| 287 | `CodeIntelService.GetClusterSummary` | manifest-packets | 34 | — | postgres | gRPC RPC CodeIntelService.GetClusterSummary: GetClusterSummaryRequest → ClusterSummary (declared in proto/active/codein… |
| 288 | `CodeIntelService.GetJobStatus` | manifest-packets | 34 | — | postgres | gRPC RPC CodeIntelService.GetJobStatus: GetJobStatusRequest → JobStatus (declared in proto/active/codeintel.proto). |
| 289 | `CodeIntelService.ListClusterSummaries` | manifest-packets | 34 | — | postgres | gRPC RPC CodeIntelService.ListClusterSummaries: ListClusterSummariesRequest → ListClusterSummariesResponse (declared in… |
| 290 | `context.build_kv_packet` | trace-mcp, manifest-packets | 34 | — | postgres | Build a compressed KV context packet for a set of hot files. Returns an attention TOC + file card summaries. Use when y… |
| 291 | `context.get_compressed_card` | trace-mcp, manifest-packets | 34 | — | postgres | Fetch a compressed HCA card for a file or trace. Returns a 128-token summary: one-line description, key symbols, risks.… |
| 292 | `EnrichmentService.BatchEnrich` | manifest-packets | 34 | — | postgres | gRPC RPC EnrichmentService.BatchEnrich: BatchEnrichRequest → BatchEnrichResponse (declared in proto/active/codeintel_en… |
| 293 | `evidence:detect_objects` | manifest-packets | 34 | — | postgres | Detect objects in image evidence using the installed YOLO ONNX model. The live repo currently uses a restored yolov8n C… |
| 294 | `evidence:transcribe_gpu` | manifest-packets | 34 | — | postgres | GPU-accelerated audio/video transcription using Whisper. Faster than browser WASM for long recordings (>10s). Returns f… |
| 295 | `facial_analysis` | manifest-packets | 34 | — | postgres | Detect and analyze faces in images or video frames (witness identification, security footage analysis) |
| 296 | `hmm_infer_repair_states` | manifest-packets | 34 | — | postgres | Infer missing implementation states and repair order using HMM. |
| 297 | `langextract_extract_error_facts` | manifest-packets | 34 | — | postgres | Extract structured error, feature, and docs facts from messy text. |
| 298 | `langextract:evidence` | manifest-packets | 34 | — | postgres | Extract forensic/evidentiary entities from text: persons (witnesses, suspects), locations, phone numbers, emails, docum… |
| 299 | `reports:create` | manifest-packets | 34 | — | postgres | Create a new blank report for a case. Returns report ID and metadata. |
| 300 | `reports:delete` | manifest-packets | 34 | — | postgres | Delete a report. Audit log entry will be created for legal compliance. |
| 301 | `reports:export` | manifest-packets | 34 | — | postgres | Export a report to PDF, DOCX, or HTML format. Returns download URL. |
| 302 | `reports:list` | manifest-packets | 34 | — | postgres | List reports with optional case filtering. Returns report metadata including title, status, creation date. |
| 303 | `sveltekit_import_boundary_check` | manifest-packets | 34 | — | postgres | Check SvelteKit import boundaries (e.g., $lib/server leaked to client). |
| 304 | `sveltekit_route_audit` | manifest-packets | 34 | — | postgres | Audit a SvelteKit 2 route for existence, Zod schema, and auth guards. |
| 305 | `ToolCallingService.ExecuteTool` | manifest-packets | 34 | — | postgres | gRPC RPC ToolCallingService.ExecuteTool: ToolCallRequest → ToolCallResponse (declared in proto/active/tool_calling.prot… |
| 306 | `ToolCallingService.ExecuteToolBatch` | manifest-packets | 34 | — | postgres | gRPC RPC ToolCallingService.ExecuteToolBatch: ToolCallBatchRequest → ToolCallBatchResponse (declared in proto/active/to… |
| 307 | `ToolCallingService.ExecuteToolStream` | manifest-packets | 34 | — | postgres | gRPC RPC ToolCallingService.ExecuteToolStream: ToolCallRequest → ToolCallEvent (declared in proto/active/tool_calling.p… |
| 308 | `ToolCallingService.ListTools` | manifest-packets | 34 | — | postgres | gRPC RPC ToolCallingService.ListTools: ListToolsRequest → ListToolsResponse (declared in proto/active/tool_calling.prot… |
| 309 | `ToolRouter.CallTool` | manifest-packets | 34 | — | postgres | gRPC RPC ToolRouter.CallTool: CallToolRequest → CallToolResponse (declared in sveltekit-frontend/proto/active/tool_rout… |
| 310 | `ToolRouter.CallToolBatch` | manifest-packets | 34 | — | postgres | gRPC RPC ToolRouter.CallToolBatch: CallToolBatchRequest → CallToolBatchResponse (declared in sveltekit-frontend/proto/a… |
| 311 | `ToolRouter.CallToolStream` | manifest-packets | 34 | — | postgres | gRPC RPC ToolRouter.CallToolStream: CallToolRequest → CallToolEvent (declared in sveltekit-frontend/proto/active/tool_r… |
| 312 | `ToolRouter.ListTools` | manifest-packets | 34 | — | postgres | gRPC RPC ToolRouter.ListTools: ListToolsRequest → ListToolsResponse (declared in sveltekit-frontend/proto/active/tool_r… |
| 313 | `toposort_repair_plan` | manifest-packets | 34 | — | postgres | Topological sort to order the repair plan based on HMM states. |
| 314 | `transcribe_audio` | manifest-packets | 34 | — | postgres | Transcribe audio evidence files (WAV, MP3, M4A) using Docling ASR. Returns transcript text with word count and duration. |
| 315 | `video_to_frames` | manifest-packets | 34 | — | postgres | Extract frames from video evidence (depositions, surveillance, courtroom recordings) for analysis |
| 316 | `vlm:switch_mode` | manifest-packets | 34 | — | postgres | Switch the VLM inference mode between TEXT (TurboQuant) and VISION (Ollama VLM). Use this to prevent VRAM OOM on 8GB ca… |
| 317 | `cases:load` | manifest-packets | 30 | — | postgres | Load legal cases with optional filtering |
| 318 | `cases:update` | manifest-packets | 30 | — | postgres | Update an existing case |
| 319 | `citations:list_by_case` | manifest-packets | 30 | — | postgres | List all citations linked to a specific case. |
| 320 | `content` | manifest-packets | 30 | — | postgres |  |
| 321 | `narrative` | manifest-packets | 30 | — | postgres |  |
| 322 | `playwright:browser_action` | manifest-packets | 30 | — | postgres | Execute a browser action using Playwright |
| 323 | `postgres` | manifest-packets | 30 | — | postgres |  |
| 324 | `rag:index_page` | manifest-packets | 30 | — | postgres | Index a web page for RAG knowledge |
| 325 | `reports:update` | manifest-packets | 30 | — | postgres | Update an existing report |
| 326 | `summary` | manifest-packets | 30 | — | postgres |  |
| 327 | `unknown` | manifest-packets | 30 | — | postgres |  |

## All Tools Ranked

| Rank | Tool | Primary Layer | Sources | Permissions | Score |
|------|------|---------------|---------|-------------|-------|
| 1 | `wiki.search` | cache | trace-mcp, manifest-packets | read_only | 496 |
| 2 | `memory:prior_answer_lookup` | memory | manifest-packets | read_only | 421 |
| 3 | `codebase:search` | lexical | manifest-packets | read_only | 414 |
| 4 | `trace.kag_search` | unknown | trace-mcp, manifest-packets | read_only | 364 |
| 5 | `atlas.packet_search` | dense | trace-mcp, manifest-packets | read_only | 356 |
| 6 | `ace.compact_search` | cache | trace-mcp | read_only | 350 |
| 7 | `karpathy.attention_rank_files` | cache | trace-mcp | read_only | 348 |
| 8 | `search.go_hybrid` | lexical | trace-mcp, manifest-packets | read_only | 341 |
| 9 | `wiki.status` | cache | trace-mcp, manifest-packets | read_only | 328 |
| 10 | `ops.fixer_semantic_recall` | cache | trace-mcp | read_only | 310 |
| 11 | `legal.check_services` | cache | trace-mcp | read_only | 270 |
| 12 | `codebase:export_bundle` | cache | manifest-packets | read_only | 260 |
| 13 | `startup:briefing` | cache | manifest-packets | read_only | 260 |
| 14 | `image.enrich_tags` | dense | trace-mcp | read_only | 256 |
| 15 | `kag.recall_similar_fix` | lexical | trace-mcp | read_only | 255 |
| 16 | `kb.search_cards` | lexical | manifest-packets | read_only | 252 |
| 17 | `chunk.lookup` | lexical | manifest-packets | read_only | 248 |
| 18 | `topology_search` | lexical | manifest-packets | read_only | 248 |
| 19 | `wiki_encyclopedia_search` | lexical | manifest-packets | read_only | 248 |
| 20 | `cluster.summary.refresh` | cache | manifest-packets | read_only | 246 |
| 21 | `TurboVecService.Search` | lexical | manifest-packets | read_write | 246 |
| 22 | `codebase:ace_context` | lexical | manifest-packets | read_only | 240 |
| 23 | `ops.gpu_attention` | cache | trace-mcp | read_only | 238 |
| 24 | `wiki.explain_page` | dense | trace-mcp, manifest-packets | read_only | 236 |
| 25 | `wiki.refresh_directory` | graph | trace-mcp, manifest-packets | read_only | 228 |
| 26 | `ops.update_LLMS.md` | cache | trace-mcp | read_only | 226 |
| 27 | `atlas.coverage` | dense | trace-mcp, manifest-packets | read_only | 214 |
| 28 | `clusters.get_members` | unknown | trace-mcp, manifest-packets | read_only | 212 |
| 29 | `topology.search_near` | unknown | trace-mcp, manifest-packets | read_only | 204 |
| 30 | `search.dev_context` | unknown | trace-mcp, manifest-packets | read_only | 202 |
| 31 | `topology.search_4d` | unknown | trace-mcp, manifest-packets | read_only | 200 |
| 32 | `kag.feature_lookup` | graph | trace-mcp | read_only | 194 |
| 33 | `karpathy.som_topology_stats` | cache | trace-mcp | read_only | 186 |
| 34 | `trace.graphrag_search` | graph | trace-mcp | read_only | 182 |
| 35 | `engram.chat_memory_store` | cache | trace-mcp | read_write | 181 |
| 36 | `atlas.embedding_cluster_tags` | cache | trace-mcp | read_only | 180 |
| 37 | `atlas.embedding_keywords` | cache | trace-mcp | read_only | 180 |
| 38 | `evidence.image_feedback` | cache | trace-mcp | read_only | 180 |
| 39 | `legal.transcribe_video` | cache | trace-mcp | read_only | 180 |
| 40 | `agents_md` | cache | manifest-packets | read_only | 176 |
| 41 | `atlas.prefilter` | dense | trace-mcp | read_only | 176 |
| 42 | `codebase:graph_traverse` | graph | manifest-packets | read_only | 172 |
| 43 | `graph.pagerank_top` | graph | trace-mcp, manifest-packets | read_only | 172 |
| 44 | `graph.semantic_path_synthesis` | graph | trace-mcp | read_only | 170 |
| 45 | `hypergraph.semantic_path_synthesis` | graph | trace-mcp | read_only | 170 |
| 46 | `library.registry_fetch_tier` | graph | trace-mcp | read_only | 170 |
| 47 | `graph.status` | dense | manifest-packets | read_only | 168 |
| 48 | `legal.find_similar_opinions` | lexical | trace-mcp | read_only | 168 |
| 49 | `analytics:research_topics` | cache | manifest-packets | read_only | 166 |
| 50 | `analytics:unified_research` | cache | manifest-packets | read_only | 166 |
| 51 | `gpu:similarity` | dense | manifest-packets | read_only | 166 |
| 52 | `image.caption` | dense | trace-mcp | read_only | 166 |
| 53 | `image.search_by_text` | dense | trace-mcp | read_only | 166 |
| 54 | `TurboVecService.Health` | dense | manifest-packets | read_write | 166 |
| 55 | `TurboVecService.Transform` | dense | manifest-packets | read_write | 166 |
| 56 | `TurboVecService.Upsert` | dense | manifest-packets | read_write | 166 |
| 57 | `codebase:concurrent_research` | lexical | manifest-packets | read_only | 164 |
| 58 | `codebase.rg_search` | lexical | manifest-packets | read_only | 164 |
| 59 | `kb.expand_neighbors` | lexical | manifest-packets | read_only | 164 |
| 60 | `kb.explain_retrieval` | lexical | manifest-packets | read_only | 164 |
| 61 | `kb.rg_atlas_search` | lexical | manifest-packets | read_only | 164 |
| 62 | `ldr_research` | dense | trace-mcp | read_only | 164 |
| 63 | `research:reddit_search` | lexical | manifest-packets | read_only | 164 |
| 64 | `RetrievalService.ExpandAstNeighbors` | lexical | manifest-packets | read_write | 164 |
| 65 | `atlas.explain_trace` | graph | trace-mcp | read_only | 162 |
| 66 | `engram.ace_packet_inject` | cache | trace-mcp | read_write | 162 |
| 67 | `research:search_chunks` | lexical | manifest-packets | read_only | 162 |
| 68 | `kag.multi_lane_search` | lexical | trace-mcp | read_only | 160 |
| 69 | `analytics:codebase_research` | lexical | manifest-packets | read_only | 158 |
| 70 | `analytics:web_research` | lexical | manifest-packets | read_only | 158 |
| 71 | `CyberElephantService.ProcessDocuments` | lexical | manifest-packets | read_write | 158 |
| 72 | `CyberElephantService.SearchSimilar` | lexical | manifest-packets | read_write | 158 |
| 73 | `evidence:analyze_multimodal` | lexical | manifest-packets | read_only | 158 |
| 74 | `evidence:search_similar` | lexical | manifest-packets | read_only | 158 |
| 75 | `embedding:generate` | dense | manifest-packets | read_only | 154 |
| 76 | `EmbeddingService.GenerateEmbeddings` | dense | manifest-packets | read_write | 154 |
| 77 | `analytics:deep_research` | lexical | manifest-packets | read_only | 150 |
| 78 | `ops.verify_write` | cache | trace-mcp | read_only | 150 |
| 79 | `reports:generate_from_template` | lexical | manifest-packets | read_only | 150 |
| 80 | `ops.gpu_pagerank` | graph | trace-mcp | read_only | 148 |
| 81 | `ops.fixer_pattern_store` | dense | trace-mcp | read_only | 142 |
| 82 | `ops.trust_audit` | dense | trace-mcp | read_only | 142 |
| 83 | `trace.explain_retrieval` | unknown | trace-mcp, manifest-packets | read_only | 126 |
| 84 | `topology.same_som_cluster` | unknown | trace-mcp, manifest-packets | read_only | 124 |
| 85 | `atlas.source_refs` | identity | trace-mcp | read_only | 112 |
| 86 | `kb.hybrid_search` | unknown | trace-mcp, manifest-packets | read_only | 110 |
| 87 | `atlas.query` | identity | trace-mcp | read_only | 104 |
| 88 | `atlas.graph.pagerank` | graph | trace-mcp | read_only | 102 |
| 89 | `clusters.som_cell_lookup` | graph | trace-mcp | read_only | 102 |
| 90 | `context.build_indexed_source_packet` | graph | trace-mcp | read_only | 102 |
| 91 | `engram.chat_memory_recent` | memory | trace-mcp | read_only | 99 |
| 92 | `atlas_get_active_context` | cache | trace-mcp | read_only | 96 |
| 93 | `context.build_ace_packet` | cache | trace-mcp | read_only | 96 |
| 94 | `atlas.build_taxonomy_topology_packet` | graph | trace-mcp | read_only | 94 |
| 95 | `atlas.compact_context` | graph | trace-mcp | read_only | 94 |
| 96 | `context.prefetch_feature_context` | graph | trace-mcp | read_only | 94 |
| 97 | `graph.materialize_pathway` | graph | trace-mcp | read_only | 94 |
| 98 | `hypergraph.explain_activation` | graph | trace-mcp | read_only | 94 |
| 99 | `hypergraph.get_edge` | graph | trace-mcp | read_only | 94 |
| 100 | `kb.search_pathways` | graph | trace-mcp | read_only | 94 |
| 101 | `library.registry_lookup` | graph | trace-mcp | read_only | 94 |
| 102 | `research.playbook_lookup_by_language` | graph | trace-mcp | read_only | 94 |
| 103 | `runtime.sse_probe` | graph | trace-mcp | read_only | 94 |
| 104 | `taxonomy.path` | graph | trace-mcp | read_only | 94 |
| 105 | `topology.search_som_neighborhood` | graph | trace-mcp | read_only | 94 |
| 106 | `search.rerank` | rerank | trace-mcp | read_only | 92 |
| 107 | `turbovec.rank_chunks` | rerank | trace-mcp | read_only | 92 |
| 108 | `hypergraph.search` | graph | trace-mcp | read_only | 90 |
| 109 | `atlas.embedding_all_tags` | dense | trace-mcp | read_only | 88 |
| 110 | `atlas.embedding_neighbors` | dense | trace-mcp | read_only | 88 |
| 111 | `atlas.populate_feature_documents` | synthesis | trace-mcp | read_only | 88 |
| 112 | `evidence.search_by_image` | dense | trace-mcp | read_only | 88 |
| 113 | `legal.batch_ingest` | dense | trace-mcp | read_only | 88 |
| 114 | `legal.cross_reference_evidence` | dense | trace-mcp | read_only | 88 |
| 115 | `topology.language_distribution` | dense | trace-mcp | read_only | 88 |
| 116 | `engram.redis_health` | cache | trace-mcp | read_write | 86 |
| 117 | `inference:route` | cache | manifest-packets | read_only | 86 |
| 118 | `codebase:file_intel` | graph | manifest-packets | read_only | 84 |
| 119 | `codebase:graph_neighbors` | graph | manifest-packets | read_only | 84 |
| 120 | `evidence.link_image_graph` | graph | trace-mcp | read_write | 84 |
| 121 | `graph.community_for_node` | graph | trace-mcp, manifest-packets | read_only | 84 |
| 122 | `graph.expand_neighborhood` | graph | trace-mcp, manifest-packets | read_only | 84 |
| 123 | `graph.index` | graph | manifest-packets | read_only | 84 |
| 124 | `graph.shortest_path` | graph | trace-mcp, manifest-packets | read_only | 84 |
| 125 | `graphrag_expand_context` | graph | manifest-packets | read_only | 84 |
| 126 | `hypergraph.expand_members` | graph | trace-mcp | read_write | 84 |
| 127 | `langextract:file` | graph | manifest-packets | read_only | 84 |
| 128 | `RetrievalService.GetTopologyContext` | graph | manifest-packets | read_write | 84 |
| 129 | `search.hybrid` | lexical | trace-mcp | read_only | 84 |
| 130 | `GpuBridgeService.AssignSom` | rerank | manifest-packets | read_write | 82 |
| 131 | `GpuBridgeService.BatchCosine` | rerank | manifest-packets | read_write | 82 |
| 132 | `GpuBridgeService.EncodeLatent` | rerank | manifest-packets | read_write | 82 |
| 133 | `legal.build_timeline` | synthesis | trace-mcp | read_only | 82 |
| 134 | `legal.cross_examine` | synthesis | trace-mcp | read_only | 82 |
| 135 | `legal.issue_spotter` | synthesis | trace-mcp | read_only | 82 |
| 136 | `legal.mock_trial` | synthesis | trace-mcp | read_only | 82 |
| 137 | `marco_rerank_chunks` | rerank | manifest-packets | read_only | 82 |
| 138 | `redis` | cache | manifest-packets | read_only | 82 |
| 139 | `shell.run` | synthesis | trace-mcp | read_only | 82 |
| 140 | `kag.web_search` | synthesis | trace-mcp | read_only | 80 |
| 141 | `kb.explain_context_pack` | synthesis | trace-mcp | read_only | 80 |
| 142 | `LLMS.md.binding_chain` | synthesis | trace-mcp | read_only | 80 |
| 143 | `LLMS.md.context_for_file` | synthesis | trace-mcp | read_only | 80 |
| 144 | `LLMS.md.coverage` | synthesis | trace-mcp | read_only | 80 |
| 145 | `LLMS.md.coverage_chain` | synthesis | trace-mcp | read_only | 80 |
| 146 | `LLMS.md.peers_for_dir` | synthesis | trace-mcp | read_only | 80 |
| 147 | `LLMS.md.peers_via_relations` | synthesis | trace-mcp | read_only | 80 |
| 148 | `LLMS.md.shares_tags` | synthesis | trace-mcp | read_only | 80 |
| 149 | `neo4j` | graph | manifest-packets | read_only | 80 |
| 150 | `search.postgres_fts` | lexical | trace-mcp | read_only | 80 |
| 151 | `CyberElephantService.GetClusters` | dense | manifest-packets | read_write | 78 |
| 152 | `CyberElephantService.GetDocumentById` | dense | manifest-packets | read_write | 78 |
| 153 | `CyberElephantService.GetStatus` | dense | manifest-packets | read_write | 78 |
| 154 | `CyberElephantService.HealthCheck` | dense | manifest-packets | read_write | 78 |
| 155 | `CyberElephantService.UpdateClusters` | dense | manifest-packets | read_write | 78 |
| 156 | `EmbeddingService.GetStats` | dense | manifest-packets | read_write | 78 |
| 157 | `EmbeddingService.Health` | dense | manifest-packets | read_write | 78 |
| 158 | `EmbeddingService.StreamEmbeddings` | dense | manifest-packets | read_write | 78 |
| 159 | `evidence:analyze` | dense | manifest-packets | read_only | 78 |
| 160 | `vault.read` | dense | manifest-packets | read_only | 78 |
| 161 | `kb.archive_synthesis` | synthesis | trace-mcp | read_only | 76 |
| 162 | `citations:search` | lexical | manifest-packets | read_only | 74 |
| 163 | `codebase:rg_search` | lexical | manifest-packets | read_only | 74 |
| 164 | `CodeIntelService.LookupChunk` | lexical | manifest-packets | read_write | 74 |
| 165 | `compose:pipeline` | lexical | manifest-packets | read_only | 74 |
| 166 | `kb.get_card` | lexical | manifest-packets | read_only | 74 |
| 167 | `kb.search_schema_contract` | lexical | manifest-packets | read_only | 74 |
| 168 | `langextract:custom` | lexical | manifest-packets | read_only | 74 |
| 169 | `LibrarySearchService.GetDocumentToc` | lexical | manifest-packets | read_write | 74 |
| 170 | `LibrarySearchService.GetNodeContext` | lexical | manifest-packets | read_write | 74 |
| 171 | `LibrarySearchService.Health` | lexical | manifest-packets | read_write | 74 |
| 172 | `LibrarySearchService.ResolveCitation` | lexical | manifest-packets | read_write | 74 |
| 173 | `LibrarySearchService.SearchLibrary` | lexical | manifest-packets | read_write | 74 |
| 174 | `LibrarySearchService.StreamLibrary` | lexical | manifest-packets | read_write | 74 |
| 175 | `rag:search` | lexical | manifest-packets | read_only | 74 |
| 176 | `research:github_search` | lexical | manifest-packets | read_only | 74 |
| 177 | `RetrievalService.GetClusterSummary` | lexical | manifest-packets | read_write | 74 |
| 178 | `RetrievalService.GetResearchContext` | lexical | manifest-packets | read_write | 74 |
| 179 | `RetrievalService.Health` | lexical | manifest-packets | read_write | 74 |
| 180 | `RetrievalService.SearchChunks` | lexical | manifest-packets | read_write | 74 |
| 181 | `RetrievalService.SearchCodebase` | lexical | manifest-packets | read_write | 74 |
| 182 | `RetrievalService.SearchEvidence` | lexical | manifest-packets | read_write | 74 |
| 183 | `RetrievalService.StreamCodebase` | lexical | manifest-packets | read_write | 74 |
| 184 | `RetrievalService.StreamEvidence` | lexical | manifest-packets | read_write | 74 |
| 185 | `vault.search` | lexical | manifest-packets | read_only | 74 |
| 186 | `atlas.get_chunk` | read | trace-mcp | read_only | 72 |
| 187 | `codeintel.ace.context` | synthesis | manifest-packets | read_only | 72 |
| 188 | `codeintel.fix_recommend` | synthesis | manifest-packets | read_only | 72 |
| 189 | `face:identify` | synthesis | manifest-packets | read_only | 72 |
| 190 | `file.read_window` | read | trace-mcp | read_only | 72 |
| 191 | `langextract:legal` | synthesis | manifest-packets | read_only | 72 |
| 192 | `ace.wiki` | synthesis | manifest-packets | read_only | 70 |
| 193 | `cluster.summary.get` | synthesis | manifest-packets | read_only | 70 |
| 194 | `clusters.get_summary_lenses` | synthesis | trace-mcp, manifest-packets | read_only | 70 |
| 195 | `codebase:explain_cluster` | synthesis | manifest-packets | read_only | 70 |
| 196 | `CodeIntelService.SummarizeCluster` | synthesis | manifest-packets | read_write | 70 |
| 197 | `EnrichmentService.SummarizeCluster` | synthesis | manifest-packets | read_write | 70 |
| 198 | `llm_synthesis.log_event` | synthesis | manifest-packets | read_only | 70 |
| 199 | `poi:face_synth` | synthesis | manifest-packets | read_only | 70 |
| 200 | `stable_diffusion_generate` | synthesis | manifest-packets | read_only | 70 |
| 201 | `kb.wiki_note_lookup` | read | trace-mcp | read_only | 68 |
| 202 | `db.schema_overview` | read | trace-mcp | read_write | 62 |
| 203 | `db.table_inspect` | read | trace-mcp | read_write | 62 |
| 204 | `ops.audit_tool_result` | ops | trace-mcp | read_only | 58 |
| 205 | `ops.gpu_pipeline_stats` | ops | trace-mcp | read_only | 58 |
| 206 | `ops.gpu_topk` | ops | trace-mcp | read_only | 58 |
| 207 | `ops.inspect_tool_contract` | ops | trace-mcp | read_only | 58 |
| 208 | `ops.search_tools` | ops | trace-mcp | read_only | 58 |
| 209 | `ops.validate_claims` | ops | trace-mcp | read_only | 58 |
| 210 | `ops.validate_tool_call` | ops | trace-mcp | read_only | 58 |
| 211 | `ops.execute_graphify` | ops | trace-mcp | read_only | 54 |
| 212 | `atlas.feature_document_enrichment_plan` | unknown | trace-mcp | read_only | 52 |
| 213 | `atlas.feature_document_status` | unknown | trace-mcp | read_only | 52 |
| 214 | `atlas.materialize_feature_evidence_tuples` | unknown | trace-mcp | read_only | 52 |
| 215 | `ops.propose_patch` | ops | trace-mcp | read_write | 48 |
| 216 | `ops.record_fix_attempt` | ops | trace-mcp | read_write | 48 |
| 217 | `ops.run_quality_gate` | ops | trace-mcp | read_write | 48 |
| 218 | `ops.run_targeted_test` | ops | trace-mcp | read_write | 48 |
| 219 | `atlas.feature_document_ingestion_plan` | unknown | trace-mcp | read_only | 44 |
| 220 | `atlas.pos_concept_tagging` | unknown | trace-mcp | read_only | 44 |
| 221 | `atlas.suggest_files` | unknown | trace-mcp | read_only | 44 |
| 222 | `atlas.workstation_status` | unknown | trace-mcp | read_only | 44 |
| 223 | `clusters.kmeans_members` | unknown | trace-mcp | read_only | 44 |
| 224 | `codebase.context_for_file` | unknown | trace-mcp | read_only | 44 |
| 225 | `context.explain_compression` | unknown | trace-mcp | read_only | 44 |
| 226 | `context.refresh_task_toc` | unknown | trace-mcp | read_only | 44 |
| 227 | `kag.ingest_error` | unknown | trace-mcp | read_only | 44 |
| 228 | `kag.ingest_memory_directory` | unknown | trace-mcp | read_only | 44 |
| 229 | `kag.panel_context` | unknown | trace-mcp | read_only | 44 |
| 230 | `kag.record_agent_run` | unknown | trace-mcp | read_only | 44 |
| 231 | `kb.organize_messy_text` | unknown | trace-mcp | read_only | 44 |
| 232 | `kb.search_notecards` | unknown | trace-mcp | read_only | 44 |
| 233 | `kb.search_summary_tree` | unknown | trace-mcp | read_only | 44 |
| 234 | `kb.trace_search` | unknown | trace-mcp | read_only | 44 |
| 235 | `knowledge.get_minified_map` | unknown | trace-mcp | read_only | 44 |
| 236 | `legal.find_precedents` | unknown | trace-mcp | read_only | 44 |
| 237 | `legal.get_transcript` | unknown | trace-mcp | read_only | 44 |
| 238 | `legal.score_case` | unknown | trace-mcp | read_only | 44 |
| 239 | `legal.search_recordings` | unknown | trace-mcp | read_only | 44 |
| 240 | `legal.similar_cases` | unknown | trace-mcp | read_only | 44 |
| 241 | `legal.write_obsidian_note` | unknown | trace-mcp | read_only | 44 |
| 242 | `library.registry_rescan` | unknown | trace-mcp | read_only | 44 |
| 243 | `library.registry_search` | unknown | trace-mcp | read_only | 44 |
| 244 | `miniforge.analyze` | unknown | trace-mcp | read_only | 44 |
| 245 | `miniforge.extract` | unknown | trace-mcp | read_only | 44 |
| 246 | `miniforge.health` | unknown | trace-mcp | read_only | 44 |
| 247 | `phase109a_archive_signal` | unknown | trace-mcp | read_only | 44 |
| 248 | `phase109a_promote_recommendation` | unknown | trace-mcp | read_only | 44 |
| 249 | `phase109a_query_signal_history` | unknown | trace-mcp | read_only | 44 |
| 250 | `phase109a_supersede_recommendation` | unknown | trace-mcp | read_only | 44 |
| 251 | `phase109a_supersede_signal` | unknown | trace-mcp | read_only | 44 |
| 252 | `phase109a_validate_state_transition` | unknown | trace-mcp | read_only | 44 |
| 253 | `runtime.quic_status` | unknown | trace-mcp | read_only | 44 |
| 254 | `runtime.simdjson_status` | unknown | trace-mcp | read_only | 44 |
| 255 | `service_workers.result` | unknown | trace-mcp | read_only | 44 |
| 256 | `service_workers.status` | unknown | trace-mcp | read_only | 44 |
| 257 | `taxonomy.children` | unknown | trace-mcp | read_only | 44 |
| 258 | `tools.batch_call` | unknown | trace-mcp | read_only | 44 |
| 259 | `topology.hydration_status` | unknown | trace-mcp | read_only | 44 |
| 260 | `topology.recompute_manifold_plan` | unknown | trace-mcp | read_only | 44 |
| 261 | `trace_dynamic_context` | unknown | trace-mcp | read_only | 44 |
| 262 | `trace_search` | unknown | trace-mcp | read_only | 44 |
| 263 | `trace.system_health` | unknown | trace-mcp | read_only | 44 |
| 264 | `trace.validate_ace_hit` | unknown | trace-mcp | read_only | 44 |
| 265 | `ui.analyze_view` | unknown | trace-mcp | read_only | 44 |
| 266 | `wiki_note_lookup` | unknown | trace-mcp | read_only | 44 |
| 267 | `admin.log_event` | unknown | trace-mcp | read_only | 40 |
| 268 | `kb.extract_citations` | unknown | trace-mcp | read_only | 40 |
| 269 | `skills.list` | unknown | trace-mcp | read_only | 40 |
| 270 | `skills.run_mission` | unknown | trace-mcp | read_only | 40 |
| 271 | `analytics:mapreduce_matrix` | unknown | manifest-packets | read_only | 34 |
| 272 | `ast:cross_language` | unknown | manifest-packets | read_only | 34 |
| 273 | `cases:create` | unknown | manifest-packets | read_only | 34 |
| 274 | `cases:delete` | unknown | manifest-packets | read_only | 34 |
| 275 | `ChatAssistantService.CreateSession` | unknown | manifest-packets | read_write | 34 |
| 276 | `ChatAssistantService.GetHistory` | unknown | manifest-packets | read_write | 34 |
| 277 | `ChatAssistantService.Health` | unknown | manifest-packets | read_write | 34 |
| 278 | `ChatAssistantService.RAGQuery` | unknown | manifest-packets | read_write | 34 |
| 279 | `ChatAssistantService.SendMessage` | unknown | manifest-packets | read_write | 34 |
| 280 | `ChatAssistantService.StreamMessage` | unknown | manifest-packets | read_write | 34 |
| 281 | `Chr97Agent.GetCartridge` | unknown | manifest-packets | read_write | 34 |
| 282 | `Chr97Agent.GetTimeline` | unknown | manifest-packets | read_write | 34 |
| 283 | `Chr97Agent.QueryTags` | unknown | manifest-packets | read_write | 34 |
| 284 | `citations:add_to_case` | unknown | manifest-packets | read_only | 34 |
| 285 | `codebase:get_buffer` | unknown | manifest-packets | read_only | 34 |
| 286 | `codeintel.health` | unknown | manifest-packets | read_only | 34 |
| 287 | `CodeIntelService.GetClusterSummary` | unknown | manifest-packets | read_write | 34 |
| 288 | `CodeIntelService.GetJobStatus` | unknown | manifest-packets | read_write | 34 |
| 289 | `CodeIntelService.ListClusterSummaries` | unknown | manifest-packets | read_write | 34 |
| 290 | `context.build_kv_packet` | unknown | trace-mcp, manifest-packets | read_only | 34 |
| 291 | `context.get_compressed_card` | unknown | trace-mcp, manifest-packets | read_only | 34 |
| 292 | `EnrichmentService.BatchEnrich` | unknown | manifest-packets | read_write | 34 |
| 293 | `evidence:detect_objects` | unknown | manifest-packets | read_only | 34 |
| 294 | `evidence:transcribe_gpu` | unknown | manifest-packets | read_only | 34 |
| 295 | `facial_analysis` | unknown | manifest-packets | read_only | 34 |
| 296 | `hmm_infer_repair_states` | unknown | manifest-packets | read_only | 34 |
| 297 | `langextract_extract_error_facts` | unknown | manifest-packets | read_only | 34 |
| 298 | `langextract:evidence` | unknown | manifest-packets | read_only | 34 |
| 299 | `reports:create` | unknown | manifest-packets | read_only | 34 |
| 300 | `reports:delete` | unknown | manifest-packets | read_only | 34 |
| 301 | `reports:export` | unknown | manifest-packets | read_only | 34 |
| 302 | `reports:list` | unknown | manifest-packets | read_only | 34 |
| 303 | `sveltekit_import_boundary_check` | unknown | manifest-packets | read_only | 34 |
| 304 | `sveltekit_route_audit` | unknown | manifest-packets | read_only | 34 |
| 305 | `ToolCallingService.ExecuteTool` | unknown | manifest-packets | read_write | 34 |
| 306 | `ToolCallingService.ExecuteToolBatch` | unknown | manifest-packets | read_write | 34 |
| 307 | `ToolCallingService.ExecuteToolStream` | unknown | manifest-packets | read_write | 34 |
| 308 | `ToolCallingService.ListTools` | unknown | manifest-packets | read_write | 34 |
| 309 | `ToolRouter.CallTool` | unknown | manifest-packets | read_write | 34 |
| 310 | `ToolRouter.CallToolBatch` | unknown | manifest-packets | read_write | 34 |
| 311 | `ToolRouter.CallToolStream` | unknown | manifest-packets | read_write | 34 |
| 312 | `ToolRouter.ListTools` | unknown | manifest-packets | read_write | 34 |
| 313 | `toposort_repair_plan` | unknown | manifest-packets | read_only | 34 |
| 314 | `transcribe_audio` | unknown | manifest-packets | read_only | 34 |
| 315 | `video_to_frames` | unknown | manifest-packets | read_only | 34 |
| 316 | `vlm:switch_mode` | unknown | manifest-packets | read_only | 34 |
| 317 | `cases:load` | unknown | manifest-packets | read_only | 30 |
| 318 | `cases:update` | unknown | manifest-packets | read_only | 30 |
| 319 | `citations:list_by_case` | unknown | manifest-packets | read_only | 30 |
| 320 | `content` | unknown | manifest-packets | read_only | 30 |
| 321 | `narrative` | unknown | manifest-packets | read_only | 30 |
| 322 | `playwright:browser_action` | unknown | manifest-packets | read_only | 30 |
| 323 | `postgres` | unknown | manifest-packets | read_only | 30 |
| 324 | `rag:index_page` | unknown | manifest-packets | read_only | 30 |
| 325 | `reports:update` | unknown | manifest-packets | read_only | 30 |
| 326 | `summary` | unknown | manifest-packets | read_only | 30 |
| 327 | `unknown` | unknown | manifest-packets | read_only | 30 |

## Notes

- TRACE MCP remains the live read surface.
- Manifest packets capture the broader MCP / gRPC registry surface.
- `gemma4_summarize` is used for the section summaries when the local offload server is available; otherwise the report falls back to deterministic summaries.
- This index is read-only and links into the Parent Atlas navigation surface.
