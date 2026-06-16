# Parent Atlas MCP Tool Registry Index

**Generated**: 2026-06-16T16:14:25.660Z
**Sources**: C:\Users\james\Videos\deeds-web-app\docs\reports\mcp-tool-ontology.json | C:\Users\james\Videos\deeds-web-app\docs\reports\mcp-tool-manifest-packets.json
**Unique tools**: 128
**Trace tools**: 128
**Manifest tools**: 0
**RPC methods**: 74

## Index
- [IDENTITY](#identity) (2)
- [MEMORY](#memory) (1)
- [CACHE](#cache) (12)
- [LEXICAL](#lexical) (6)
- [DENSE](#dense) (14)
- [GRAPH](#graph) (23)
- [RERANK](#rerank) (2)
- [SYNTHESIS](#synthesis) (15)
- [OPS](#ops) (7)
- [READ](#read) (5)
- [UNKNOWN](#unknown) (41)

## Executive Summary

Parent Atlas tool registry spans 128 tools across 11 active layers. TRACE MCP covers the live surface; manifest packets cover the broader MCP / gRPC registry.

## IDENTITY

Layer identity contains 2 tools; top-ranked tools are atlas.source_refs, atlas.query.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 34 | `atlas.source_refs` | trace-mcp | 112 | source_ref | — | Return the top sourceRefs from the compact Atlas packet. |
| 35 | `atlas.query` | trace-mcp | 104 | — | — | Atlas alias for ranked technical search. Returns the same compact hit list as kb.trace_search for a query. |

## MEMORY

I need repo report snippets or command output to answer.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 36 | `engram.chat_memory_recent` | trace-mcp | 99 | — | — | Read-only recent chat memory lookup from engram_cards. |

## CACHE

Layer cache contains 12 tools; top-ranked tools are ace.compact_search, wiki.search, wiki.status, ops.fixer_semantic_recall, legal.check_services.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 1 | `ace.compact_search` | trace-mcp | 350 | — | — | Token-budgeted semantic search returning a compact context tree. Use this instead of reading full files when you need f… |
| 2 | `wiki.search` | trace-mcp | 338 | — | — | Hybrid wiki search over rg/codebase-graph metadata, Redis Karpathy scores, Qdrant payloads, CouchDB wiki docs, and Post… |
| 3 | `wiki.status` | trace-mcp | 338 | — | — | Returns Karpathy/AGENTS wiki status across Postgres, Redis, CouchDB, Qdrant, Neo4j, and graphify metadata. |
| 4 | `ops.fixer_semantic_recall` | trace-mcp | 310 | — | — | Recalls known fix templates via Redis L1 → Postgres L2 → Qdrant semantic L3. Call before LLM analysis to skip redundant… |
| 7 | `legal.check_services` | trace-mcp | 270 | — | — | Probe all 9 backing services (Postgres, Redis, Qdrant, Neo4j, Ollama, RabbitMQ, CouchDB, SeaweedFS, Obsidian) and repor… |
| 12 | `ops.gpu_attention` | trace-mcp | 238 | — | — | GPU scaled dot-product attention over a flat key matrix. Returns softmax attention weights per key. Results are Redis-c… |
| 13 | `ops.update_LLMS.md` | trace-mcp | 226 | — | — | Append a new fact, rule, or tool note to a directory LLMS.md file and flush to Redis. Use this after discovering someth… |
| 17 | `engram.chat_memory_store` | trace-mcp | 181 | — | engram | Append a chat turn to user memory store (Redis sorted set + bounded trim). |
| 18 | `evidence.image_feedback` | trace-mcp | 180 | — | — | Record thumbs-up or thumbs-down on a visual search result. Votes accumulate in Redis; Qdrant payload (trust_score, user… |
| 19 | `legal.transcribe_video` | trace-mcp | 180 | — | — | Queue a video URL for non-blocking background processing via RabbitMQ: yt-dlp download → FFmpeg audio extraction → Whis… |
| 28 | `engram.ace_packet_inject` | trace-mcp | 162 | — | engram | Write ACE context packet to Redis with 1h TTL: ace:packet:{runId}. |
| 53 | `engram.redis_health` | trace-mcp | 86 | — | redis | Check Redis availability used by engram memory tools. |

## LEXICAL

Layer lexical contains 6 tools; top-ranked tools are search.go_hybrid, kag.recall_similar_fix, legal.find_similar_opinions, kag.multi_lane_search, search.hybrid.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 9 | `search.go_hybrid` | trace-mcp | 256 | — | — | Go search service RRF fusion of FTS + pgvector + Qdrant. |
| 10 | `kag.recall_similar_fix` | trace-mcp | 255 | — | — | Recalls prior fixes for an error via exact-hash + pg_trgm similarity over error_fingerprints. |
| 24 | `legal.find_similar_opinions` | trace-mcp | 168 | — | — | Find similar case opinions, judgments, and rulings via Qdrant semantic search on the legal_documents collection filtere… |
| 30 | `kag.multi_lane_search` | trace-mcp | 160 | — | — | Performs 11-lane HyperRAG retrieval across hash, n-gram, graph, feature atlas, and activity prefetch lanes. Returns ran… |
| 58 | `search.hybrid` | trace-mcp | 84 | — | — | Performs hybrid (FTS + semantic) search across the codebase. |
| 74 | `search.postgres_fts` | trace-mcp | 80 | — | — | Code search using PostgreSQL Full Text Search. |

## DENSE

Layer dense contains 14 tools; top-ranked tools are atlas:packet_search, atlas.packet_search, image.enrich_tags, wiki.explain_page, atlas:verify_coverage.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 5 | `atlas:packet_search` | trace-mcp | 286 | feature_id, source_ref | — | Query the canonical atlas_packets table. Search by source_ref path (variants tried automatically), feature_id, concept_… |
| 6 | `atlas.packet_search` | trace-mcp | 286 | feature_id, source_ref | — | Query the canonical atlas_packets table. Search by source_ref path (variants tried automatically), feature_id, concept_… |
| 8 | `image.enrich_tags` | trace-mcp | 256 | — | — | VLM-enrich one Qdrant evidence point with auto-generated tags. Fetches the image (from payload file_path or MinIO), run… |
| 11 | `wiki.explain_page` | trace-mcp | 246 | — | — | Explains one wiki page with source files, imports, path aliases, feature keys, Qdrant tags, graph links, activity score… |
| 15 | `atlas:verify_coverage` | trace-mcp | 184 | feature_id, source_ref | — | Phase 3I verification gate. Reports coverage metrics for the atlas_packets canonical warehouse: total packets, source_r… |
| 20 | `atlas.prefilter` | trace-mcp | 176 | — | — | TurboVec ANN cluster prefilter. Embeds the query and queries the TurboVec sidecar (:8099) to identify the top-N cluster… |
| 21 | `atlas.coverage` | trace-mcp | 174 | feature_id, source_ref | postgres | Phase 3I verification gate. Reports coverage metrics for the atlas_packets canonical warehouse: total packets, source_r… |
| 25 | `image.caption` | trace-mcp | 166 | — | — | Get a VLM-generated caption and suggested tags for a local image file. Calls the Gemma4-VLM pipeline (Triton→TurboQuant… |
| 26 | `image.search_by_text` | trace-mcp | 166 | — | — | Search the evidence image index using a text description. Embeds the query via embeddinggemma and searches Qdrant. No i… |
| 32 | `ops.fixer_pattern_store` | trace-mcp | 142 | — | — | [OPERATOR-GATED] Stores a fix attempt outcome to the 3-layer fixer memory. Increments success/failure counts, upserts t… |
| 33 | `ops.trust_audit` | trace-mcp | 142 | — | — | Read-only audit of the trust-tier injection-detection system. Returns count of blocked content hashes and the most rece… |
| 50 | `evidence.search_by_image` | trace-mcp | 88 | — | — | Search evidence by uploading an image. The VLM describes the image, embeds it, and returns semantically similar evidenc… |
| 51 | `legal.batch_ingest` | trace-mcp | 88 | — | — | Publish one or more document URLs to the document.embed RabbitMQ queue for background embedding and indexing. Use to bu… |
| 52 | `legal.cross_reference_evidence` | trace-mcp | 88 | — | — | Semantic cross-reference: find evidence chunks similar to a reference evidence item across one or more cases using Qdra… |

## GRAPH

Layer graph contains 23 tools; top-ranked tools are kag.feature_lookup, trace.graphrag_search, graph.semantic_path_synthesis, hypergraph.semantic_path_synthesis, atlas.explain_trace.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 14 | `kag.feature_lookup` | trace-mcp | 194 | — | — | Look up which files implement a named feature. Queries the durable feature_implementations + feature_file_edges tables … |
| 16 | `trace.graphrag_search` | trace-mcp | 182 | — | — | GraphRAG hybrid retrieval: dense+sparse RRF prefetch → Neo4j graph expansion → Karpathy blend rerank. |
| 22 | `graph.semantic_path_synthesis` | trace-mcp | 170 | — | — | Synthesizes a semantic narrative along the shortest structural path between nodes. |
| 23 | `hypergraph.semantic_path_synthesis` | trace-mcp | 170 | — | — | Synthesizes a semantic narrative along a path in the hypergraph. |
| 27 | `atlas.explain_trace` | trace-mcp | 162 | — | — | Return the compact summary and retrieval path for the current Atlas packet. |
| 29 | `wiki.refresh_directory` | trace-mcp | 162 | — | — | Refreshes one AGENTS/Karpathy directory card. Defaults to dryRun=true and does not start a full re-index. |
| 31 | `ops.gpu_pagerank` | trace-mcp | 148 | — | — | GPU power-iteration PageRank on a flat adjacency matrix. Returns normalised rank scores (sum to 1.0). Cached 300 s by s… |
| 37 | `atlas.compact_context` | trace-mcp | 94 | — | — | Build a compact Atlas context packet with top chunks, sourceRefs, a compressed summary, confidence, and retrieval path. |
| 38 | `context.prefetch_feature_context` | trace-mcp | 94 | — | — | Build a prefetch packet for the next feature edit using recent activity, directory KAG context, community graph context… |
| 39 | `graph.materialize_pathway` | trace-mcp | 94 | — | — | Materializes a synthesized pathway into the persistent hypergraph context. |
| 40 | `graph.pagerank_top` | trace-mcp | 94 | — | — | Lists the top authoritative nodes in the graph by PageRank score. |
| 41 | `hypergraph.explain_activation` | trace-mcp | 94 | — | — | Explains why a specific hypergraph edge was activated for a set of query terms. |
| 42 | `hypergraph.get_edge` | trace-mcp | 94 | — | — | Returns full details for a specific hypergraph edge. |
| 43 | `kb.search_pathways` | trace-mcp | 94 | — | — | Searches for previously synthesized and materialized pathways. |
| 44 | `runtime.sse_probe` | trace-mcp | 94 | — | — | Verifies TRACE MCP Streamable HTTP/SSE path by calling tools/list with Accept: text/event-stream. |
| 45 | `taxonomy.path` | trace-mcp | 94 | — | — | Returns the full ontological path from a leaf node to root. |
| 46 | `topology.search_som_neighborhood` | trace-mcp | 94 | — | — | Searches for nodes in the SOM grid neighborhood of an anchored query. |
| 49 | `hypergraph.search` | trace-mcp | 90 | — | — | Semantic search across the hypergraph edges. |
| 54 | `evidence.link_image_graph` | trace-mcp | 84 | — | qdrant | Create IMAGE_FOR edges in Neo4j from an evidence image node to CodebaseFile nodes. Normally fires automatically after s… |
| 55 | `graph.community_for_node` | trace-mcp | 84 | — | neo4j | Returns the community/cluster membership for a specific node. |
| 56 | `graph.expand_neighborhood` | trace-mcp | 84 | — | neo4j | Expands graph neighborhood from sourceRefs (read-only). Supports legacy stableKey/depth args for backward compatibility. |
| 57 | `hypergraph.expand_members` | trace-mcp | 84 | — | neo4j | Returns all related edges for a given edge hash by member overlap. |
| 64 | `graph.shortest_path` | trace-mcp | 80 | — | neo4j | Finds the shortest path between two graph nodes. |

## RERANK

Layer rerank contains 2 tools; top-ranked tools are search.rerank, turbovec.rank_chunks.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 47 | `search.rerank` | trace-mcp | 92 | — | — | Reranks a list of document snippets for relevance to a query using llama-server. |
| 48 | `turbovec.rank_chunks` | trace-mcp | 92 | — | — | Read-only RotorQuant blended rerank for sourceRefs. No writes. |

## SYNTHESIS

Layer synthesis contains 15 tools; top-ranked tools are legal.build_timeline, legal.cross_examine, legal.issue_spotter, legal.mock_trial, clusters.get_summary_lenses.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 59 | `legal.build_timeline` | trace-mcp | 82 | — | — | Extract a chronological timeline of events from all evidence associated with a case using Gemma4 NER. Returns TimelineE… |
| 60 | `legal.cross_examine` | trace-mcp | 82 | — | — | Generate strategic cross-examination questions for a witness using Gemma4. Analyzes the witness statement and case cont… |
| 61 | `legal.issue_spotter` | trace-mcp | 82 | — | — | Gemma4 legal issue analysis: identifies legal issues, applicable statutes, strengths, weaknesses, missing evidence, and… |
| 62 | `legal.mock_trial` | trace-mcp | 82 | — | — | Multi-role mock trial simulation using Gemma4. Prosecution makes an opening statement, defense counters, then a judge d… |
| 63 | `clusters.get_summary_lenses` | trace-mcp | 80 | — | — | Returns wiki and LLMS.md context lenses for a GPU cluster. |
| 65 | `kag.web_search` | trace-mcp | 80 | — | — | L10 lane web search (T4 trust). Searches the web for information-seeking queries. Skips for code/error queries. Returns… |
| 66 | `kb.explain_context_pack` | trace-mcp | 80 | — | — | Explains the retrieval provenance and assembly logic for a generated context pack. |
| 67 | `LLMS.md.binding_chain` | trace-mcp | 80 | — | — | Walks the LLMS.md binding hierarchy for a file to determine the order of applying envelopes. |
| 68 | `LLMS.md.context_for_file` | trace-mcp | 80 | — | — | Returns only the AGENTS-related slice of the atlas context packet for a file. |
| 69 | `LLMS.md.coverage` | trace-mcp | 80 | — | — | Reports the population status of the LLMS.md envelope for a file. |
| 70 | `LLMS.md.coverage_chain` | trace-mcp | 80 | — | — | Returns the full LLMS.md inheritance chain for a file. |
| 71 | `LLMS.md.peers_for_dir` | trace-mcp | 80 | — | — | Returns the directory card directly from the atlas cache. |
| 72 | `LLMS.md.peers_via_relations` | trace-mcp | 80 | — | — | Finds neighboring directories using the SHARES_TAGS hypergraph relation. |
| 73 | `LLMS.md.shares_tags` | trace-mcp | 80 | — | — | Returns neighboring directories based on shared tags in their LLMS.md files. |
| 75 | `kb.archive_synthesis` | trace-mcp | 76 | — | — | Archive a synthesis artifact. |

## OPS

Layer ops contains 7 tools; top-ranked tools are ops.gpu_pipeline_stats, ops.gpu_topk, ops.execute_graphify, ops.propose_patch, ops.record_fix_attempt.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 81 | `ops.gpu_pipeline_stats` | trace-mcp | 58 | — | — | Returns GPU pipeline diagnostics: active stream slots, pending queue depth, cache hit rate over last 50 ops, and device… |
| 82 | `ops.gpu_topk` | trace-mcp | 58 | — | — | GPU top-k index selection. Returns k indices of highest-scoring candidates in descending order. Use after pipelineAtten… |
| 83 | `ops.execute_graphify` | trace-mcp | 54 | — | — | Executes an authorized graphify pipeline command. |
| 84 | `ops.propose_patch` | trace-mcp | 48 | — | postgres, kanban | PROPOSES a patch for a file. READ-ONLY PREVIEW. Does NOT modify files. |
| 85 | `ops.record_fix_attempt` | trace-mcp | 48 | — | postgres, kanban | Records a fix attempt and its outcome to the persistent audit log. |
| 86 | `ops.run_quality_gate` | trace-mcp | 48 | — | postgres | Executes a project-wide quality gate (tsc or vitest-all). |
| 87 | `ops.run_targeted_test` | trace-mcp | 48 | — | postgres | Executes a single Vitest test file and returns the outcome. |

## READ

Layer read contains 5 tools; top-ranked tools are atlas.get_chunk, file.read_window, kb.wiki_note_lookup, db.schema_overview, db.table_inspect.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 76 | `atlas.get_chunk` | trace-mcp | 72 | — | — | Return a chunk from the compact Atlas chunk index, optionally prioritizing a chunkId, chunkIndex, or sourceRef. |
| 77 | `file.read_window` | trace-mcp | 72 | — | — | Reads a bounded window/range of lines from a file. Highly recommended for reading large markdown (.md) or JSON files to… |
| 78 | `kb.wiki_note_lookup` | trace-mcp | 68 | — | — | Look up notes in the wiki. |
| 79 | `db.schema_overview` | trace-mcp | 62 | — | postgres | Lists every table in the public schema with row estimate + structural flags. |
| 80 | `db.table_inspect` | trace-mcp | 62 | — | postgres | Returns columns + indexes + foreign keys for one table. No row data. |

## UNKNOWN

Layer unknown contains 41 tools; top-ranked tools are atlas.suggest_files, codebase.context_for_file, context.build_kv_packet, context.explain_compression, context.get_compressed_card.

| Rank | Tool | Source | Score | Identity | Writes To | Summary |
|------|------|--------|-------|----------|-----------|---------|
| 88 | `atlas.suggest_files` | trace-mcp | 44 | — | — | Return the top suggested files from the compact Atlas packet. |
| 89 | `codebase.context_for_file` | trace-mcp | 44 | — | — | Returns the full atlas context packet for a specific file. |
| 90 | `context.build_kv_packet` | trace-mcp | 44 | — | — | Assembles a context packet of compressed file cards for a specific task. |
| 91 | `context.explain_compression` | trace-mcp | 44 | — | — | Explains the compression logic and token budget for a specific task packet. |
| 92 | `context.get_compressed_card` | trace-mcp | 44 | — | — | Returns a compressed context card for a specific file or trace. |
| 93 | `context.refresh_task_toc` | trace-mcp | 44 | — | — | Refreshes the Table of Contents for a specific task context. |
| 94 | `kag.ingest_error` | trace-mcp | 44 | — | — | Fingerprints and stores a raw error text for future retrieval. |
| 95 | `kag.ingest_memory_directory` | trace-mcp | 44 | — | — | Ingests agent run records from the memory directory into the database. |
| 96 | `kag.panel_context` | trace-mcp | 44 | — | — | Return recently viewed files and tools from panel_activity_log for the active user session (HyperRAG L11 prefetch). Pro… |
| 97 | `kag.record_agent_run` | trace-mcp | 44 | — | — | Records an autonomous agent run artifact to memory. |
| 98 | `kb.hybrid_search` | trace-mcp | 44 | — | — | Performs hybrid (lexical + semantic) search across KAG context. |
| 99 | `kb.organize_messy_text` | trace-mcp | 44 | — | — | Organize messy text into structured entities and sections. |
| 100 | `kb.search_notecards` | trace-mcp | 44 | — | — | Searches for identity-spine notecards matching a query. |
| 101 | `kb.search_summary_tree` | trace-mcp | 44 | — | — | RAPTOR-style hierarchical search across per-chunk lens, cluster narrative, and directory-card summary tiers. |
| 102 | `kb.trace_search` | trace-mcp | 44 | — | — | Search the hypergraph/KAG context for documents, cards, and relations matching a query. |
| 103 | `knowledge.get_minified_map` | trace-mcp | 44 | — | — | Returns a minified architectural map for a specific directory. |
| 104 | `legal.find_precedents` | trace-mcp | 44 | — | — | Semantic + full-text search across legal precedents, case opinions, and rulings. Returns ranked results with citation, … |
| 105 | `legal.get_transcript` | trace-mcp | 44 | — | — | Retrieve the Whisper transcript for an audio/video evidence item that has already been processed. Returns the full text… |
| 106 | `legal.score_case` | trace-mcp | 44 | — | — | Compute an evidence-weighted case strength score (0-100) for a given case. Factors: evidence count (×10, max 40), witne… |
| 107 | `legal.search_recordings` | trace-mcp | 44 | — | — | Timestamp-aware semantic search across Whisper audio segments. Returns matching segments with start/end times so prosec… |
| 108 | `legal.similar_cases` | trace-mcp | 44 | — | — | Find cases similar to a given case using PostgreSQL full-text similarity on case title and description. Returns up to 2… |
| 109 | `legal.write_obsidian_note` | trace-mcp | 44 | — | — | Write or append a markdown note to the Obsidian vault via the Local REST API plugin (requires Obsidian running at ENV.O… |
| 110 | `runtime.quic_status` | trace-mcp | 44 | — | — | Reports QUIC/HTTP3 dev-lane configuration and probes the local Caddy/Vite QUIC endpoint if present. |
| 111 | `runtime.simdjson_status` | trace-mcp | 44 | — | — | Reports SIMD/AVX2 JSON parser availability, fallback mode, cache metrics, and safe usage notes. |
| 112 | `search.dev_context` | trace-mcp | 44 | — | — | Returns codebase chunks for coding and debugging prompts. |
| 113 | `taxonomy.children` | trace-mcp | 44 | — | — | Lists children of a specific ontological node in the topology. |
| 114 | `tools.batch_call` | trace-mcp | 44 | — | — | Executes multiple tool calls in parallel to reduce total latency. |
| 115 | `topology.hydration_status` | trace-mcp | 44 | — | — | Returns a diagnostic overview of topological hydration coverage. |
| 116 | `topology.recompute_manifold_plan` | trace-mcp | 44 | — | — | Provides a recommended plan for restoring topological hydration. |
| 117 | `topology.same_som_cluster` | trace-mcp | 44 | — | — | Returns other nodes in the same SOM cluster as the reference node. |
| 118 | `topology.search_4d` | trace-mcp | 44 | — | — | Explicit 4D manifold coordinate search with optional JSONB payload filters. |
| 119 | `topology.search_near` | trace-mcp | 44 | — | — | Semantic search for nodes within a 4D topology radius. |
| 120 | `trace.kag_search` | trace-mcp | 44 | — | — | High-performance KAG-DAG retrieval: Go retrieval service → SvelteKit proxy → Postgres fallback. |
| 121 | `trace.system_health` | trace-mcp | 44 | — | — | Returns the health and latency status of all backend retrieval and inference services. |
| 122 | `trace.validate_ace_hit` | trace-mcp | 44 | — | — | Validates a retrieved chunk against the ACE cache and graph contracts. |
| 123 | `ui.analyze_view` | trace-mcp | 44 | — | — | Analyzes the current UI state based on a provided snapshot. |
| 124 | `clusters.get_members` | trace-mcp | 40 | — | — | Returns the member nodes for a specific cluster. |
| 125 | `kb.extract_citations` | trace-mcp | 40 | — | — | Extract legal citations and statutes from text. |
| 126 | `skills.list` | trace-mcp | 40 | — | — | Filter skills by name or description. |
| 127 | `skills.run_mission` | trace-mcp | 40 | — | — | Execute a specialized autonomous skill mission. |
| 128 | `trace.explain_retrieval` | trace-mcp | 40 | — | — | Explains the retrieval trace for a specific query. |

## All Tools Ranked

| Rank | Tool | Primary Layer | Sources | Permissions | Score |
|------|------|---------------|---------|-------------|-------|
| 1 | `ace.compact_search` | cache | trace-mcp | read_only | 350 |
| 2 | `wiki.search` | cache | trace-mcp | read_only | 338 |
| 3 | `wiki.status` | cache | trace-mcp | read_only | 338 |
| 4 | `ops.fixer_semantic_recall` | cache | trace-mcp | read_only | 310 |
| 5 | `atlas:packet_search` | dense | trace-mcp | read_only | 286 |
| 6 | `atlas.packet_search` | dense | trace-mcp | read_only | 286 |
| 7 | `legal.check_services` | cache | trace-mcp | read_only | 270 |
| 8 | `image.enrich_tags` | dense | trace-mcp | read_only | 256 |
| 9 | `search.go_hybrid` | lexical | trace-mcp | read_only | 256 |
| 10 | `kag.recall_similar_fix` | lexical | trace-mcp | read_only | 255 |
| 11 | `wiki.explain_page` | dense | trace-mcp | read_only | 246 |
| 12 | `ops.gpu_attention` | cache | trace-mcp | read_only | 238 |
| 13 | `ops.update_LLMS.md` | cache | trace-mcp | read_only | 226 |
| 14 | `kag.feature_lookup` | graph | trace-mcp | read_only | 194 |
| 15 | `atlas:verify_coverage` | dense | trace-mcp | read_only | 184 |
| 16 | `trace.graphrag_search` | graph | trace-mcp | read_only | 182 |
| 17 | `engram.chat_memory_store` | cache | trace-mcp | read_write | 181 |
| 18 | `evidence.image_feedback` | cache | trace-mcp | read_only | 180 |
| 19 | `legal.transcribe_video` | cache | trace-mcp | read_only | 180 |
| 20 | `atlas.prefilter` | dense | trace-mcp | read_only | 176 |
| 21 | `atlas.coverage` | dense | trace-mcp | read_write | 174 |
| 22 | `graph.semantic_path_synthesis` | graph | trace-mcp | read_only | 170 |
| 23 | `hypergraph.semantic_path_synthesis` | graph | trace-mcp | read_only | 170 |
| 24 | `legal.find_similar_opinions` | lexical | trace-mcp | read_only | 168 |
| 25 | `image.caption` | dense | trace-mcp | read_only | 166 |
| 26 | `image.search_by_text` | dense | trace-mcp | read_only | 166 |
| 27 | `atlas.explain_trace` | graph | trace-mcp | read_only | 162 |
| 28 | `engram.ace_packet_inject` | cache | trace-mcp | read_write | 162 |
| 29 | `wiki.refresh_directory` | graph | trace-mcp | read_only | 162 |
| 30 | `kag.multi_lane_search` | lexical | trace-mcp | read_only | 160 |
| 31 | `ops.gpu_pagerank` | graph | trace-mcp | read_only | 148 |
| 32 | `ops.fixer_pattern_store` | dense | trace-mcp | read_only | 142 |
| 33 | `ops.trust_audit` | dense | trace-mcp | read_only | 142 |
| 34 | `atlas.source_refs` | identity | trace-mcp | read_only | 112 |
| 35 | `atlas.query` | identity | trace-mcp | read_only | 104 |
| 36 | `engram.chat_memory_recent` | memory | trace-mcp | read_only | 99 |
| 37 | `atlas.compact_context` | graph | trace-mcp | read_only | 94 |
| 38 | `context.prefetch_feature_context` | graph | trace-mcp | read_only | 94 |
| 39 | `graph.materialize_pathway` | graph | trace-mcp | read_only | 94 |
| 40 | `graph.pagerank_top` | graph | trace-mcp | read_only | 94 |
| 41 | `hypergraph.explain_activation` | graph | trace-mcp | read_only | 94 |
| 42 | `hypergraph.get_edge` | graph | trace-mcp | read_only | 94 |
| 43 | `kb.search_pathways` | graph | trace-mcp | read_only | 94 |
| 44 | `runtime.sse_probe` | graph | trace-mcp | read_only | 94 |
| 45 | `taxonomy.path` | graph | trace-mcp | read_only | 94 |
| 46 | `topology.search_som_neighborhood` | graph | trace-mcp | read_only | 94 |
| 47 | `search.rerank` | rerank | trace-mcp | read_only | 92 |
| 48 | `turbovec.rank_chunks` | rerank | trace-mcp | read_only | 92 |
| 49 | `hypergraph.search` | graph | trace-mcp | read_only | 90 |
| 50 | `evidence.search_by_image` | dense | trace-mcp | read_only | 88 |
| 51 | `legal.batch_ingest` | dense | trace-mcp | read_only | 88 |
| 52 | `legal.cross_reference_evidence` | dense | trace-mcp | read_only | 88 |
| 53 | `engram.redis_health` | cache | trace-mcp | read_write | 86 |
| 54 | `evidence.link_image_graph` | graph | trace-mcp | read_write | 84 |
| 55 | `graph.community_for_node` | graph | trace-mcp | read_write | 84 |
| 56 | `graph.expand_neighborhood` | graph | trace-mcp | read_write | 84 |
| 57 | `hypergraph.expand_members` | graph | trace-mcp | read_write | 84 |
| 58 | `search.hybrid` | lexical | trace-mcp | read_only | 84 |
| 59 | `legal.build_timeline` | synthesis | trace-mcp | read_only | 82 |
| 60 | `legal.cross_examine` | synthesis | trace-mcp | read_only | 82 |
| 61 | `legal.issue_spotter` | synthesis | trace-mcp | read_only | 82 |
| 62 | `legal.mock_trial` | synthesis | trace-mcp | read_only | 82 |
| 63 | `clusters.get_summary_lenses` | synthesis | trace-mcp | read_only | 80 |
| 64 | `graph.shortest_path` | graph | trace-mcp | read_write | 80 |
| 65 | `kag.web_search` | synthesis | trace-mcp | read_only | 80 |
| 66 | `kb.explain_context_pack` | synthesis | trace-mcp | read_only | 80 |
| 67 | `LLMS.md.binding_chain` | synthesis | trace-mcp | read_only | 80 |
| 68 | `LLMS.md.context_for_file` | synthesis | trace-mcp | read_only | 80 |
| 69 | `LLMS.md.coverage` | synthesis | trace-mcp | read_only | 80 |
| 70 | `LLMS.md.coverage_chain` | synthesis | trace-mcp | read_only | 80 |
| 71 | `LLMS.md.peers_for_dir` | synthesis | trace-mcp | read_only | 80 |
| 72 | `LLMS.md.peers_via_relations` | synthesis | trace-mcp | read_only | 80 |
| 73 | `LLMS.md.shares_tags` | synthesis | trace-mcp | read_only | 80 |
| 74 | `search.postgres_fts` | lexical | trace-mcp | read_only | 80 |
| 75 | `kb.archive_synthesis` | synthesis | trace-mcp | read_only | 76 |
| 76 | `atlas.get_chunk` | read | trace-mcp | read_only | 72 |
| 77 | `file.read_window` | read | trace-mcp | read_only | 72 |
| 78 | `kb.wiki_note_lookup` | read | trace-mcp | read_only | 68 |
| 79 | `db.schema_overview` | read | trace-mcp | read_write | 62 |
| 80 | `db.table_inspect` | read | trace-mcp | read_write | 62 |
| 81 | `ops.gpu_pipeline_stats` | ops | trace-mcp | read_only | 58 |
| 82 | `ops.gpu_topk` | ops | trace-mcp | read_only | 58 |
| 83 | `ops.execute_graphify` | ops | trace-mcp | read_only | 54 |
| 84 | `ops.propose_patch` | ops | trace-mcp | read_write | 48 |
| 85 | `ops.record_fix_attempt` | ops | trace-mcp | read_write | 48 |
| 86 | `ops.run_quality_gate` | ops | trace-mcp | read_write | 48 |
| 87 | `ops.run_targeted_test` | ops | trace-mcp | read_write | 48 |
| 88 | `atlas.suggest_files` | unknown | trace-mcp | read_only | 44 |
| 89 | `codebase.context_for_file` | unknown | trace-mcp | read_only | 44 |
| 90 | `context.build_kv_packet` | unknown | trace-mcp | read_only | 44 |
| 91 | `context.explain_compression` | unknown | trace-mcp | read_only | 44 |
| 92 | `context.get_compressed_card` | unknown | trace-mcp | read_only | 44 |
| 93 | `context.refresh_task_toc` | unknown | trace-mcp | read_only | 44 |
| 94 | `kag.ingest_error` | unknown | trace-mcp | read_only | 44 |
| 95 | `kag.ingest_memory_directory` | unknown | trace-mcp | read_only | 44 |
| 96 | `kag.panel_context` | unknown | trace-mcp | read_only | 44 |
| 97 | `kag.record_agent_run` | unknown | trace-mcp | read_only | 44 |
| 98 | `kb.hybrid_search` | unknown | trace-mcp | read_only | 44 |
| 99 | `kb.organize_messy_text` | unknown | trace-mcp | read_only | 44 |
| 100 | `kb.search_notecards` | unknown | trace-mcp | read_only | 44 |
| 101 | `kb.search_summary_tree` | unknown | trace-mcp | read_only | 44 |
| 102 | `kb.trace_search` | unknown | trace-mcp | read_only | 44 |
| 103 | `knowledge.get_minified_map` | unknown | trace-mcp | read_only | 44 |
| 104 | `legal.find_precedents` | unknown | trace-mcp | read_only | 44 |
| 105 | `legal.get_transcript` | unknown | trace-mcp | read_only | 44 |
| 106 | `legal.score_case` | unknown | trace-mcp | read_only | 44 |
| 107 | `legal.search_recordings` | unknown | trace-mcp | read_only | 44 |
| 108 | `legal.similar_cases` | unknown | trace-mcp | read_only | 44 |
| 109 | `legal.write_obsidian_note` | unknown | trace-mcp | read_only | 44 |
| 110 | `runtime.quic_status` | unknown | trace-mcp | read_only | 44 |
| 111 | `runtime.simdjson_status` | unknown | trace-mcp | read_only | 44 |
| 112 | `search.dev_context` | unknown | trace-mcp | read_only | 44 |
| 113 | `taxonomy.children` | unknown | trace-mcp | read_only | 44 |
| 114 | `tools.batch_call` | unknown | trace-mcp | read_only | 44 |
| 115 | `topology.hydration_status` | unknown | trace-mcp | read_only | 44 |
| 116 | `topology.recompute_manifold_plan` | unknown | trace-mcp | read_only | 44 |
| 117 | `topology.same_som_cluster` | unknown | trace-mcp | read_only | 44 |
| 118 | `topology.search_4d` | unknown | trace-mcp | read_only | 44 |
| 119 | `topology.search_near` | unknown | trace-mcp | read_only | 44 |
| 120 | `trace.kag_search` | unknown | trace-mcp | read_only | 44 |
| 121 | `trace.system_health` | unknown | trace-mcp | read_only | 44 |
| 122 | `trace.validate_ace_hit` | unknown | trace-mcp | read_only | 44 |
| 123 | `ui.analyze_view` | unknown | trace-mcp | read_only | 44 |
| 124 | `clusters.get_members` | unknown | trace-mcp | read_only | 40 |
| 125 | `kb.extract_citations` | unknown | trace-mcp | read_only | 40 |
| 126 | `skills.list` | unknown | trace-mcp | read_only | 40 |
| 127 | `skills.run_mission` | unknown | trace-mcp | read_only | 40 |
| 128 | `trace.explain_retrieval` | unknown | trace-mcp | read_only | 40 |

## Notes

- TRACE MCP remains the live read surface.
- Manifest packets capture the broader MCP / gRPC registry surface.
- `gemma4_summarize` is used for the section summaries when the local offload server is available; otherwise the report falls back to deterministic summaries.
- This index is read-only and links into the Parent Atlas navigation surface.
