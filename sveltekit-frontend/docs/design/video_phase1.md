# Video Phase 1

## Goal
Build transcript-first video ingestion with Postgres as truth, SeaweedFS for blobs, Qdrant as primary semantic search, Neo4j for graph reasoning, Redis for hot cache, CouchDB for stitched wiki pages, TurboVec as optional sidecar, and Gemma4 for synthesis after retrieval.

## Datastore Split
- `Postgres` = truth, manifests, JSONB envelopes, workflow/audit records
- `Qdrant` = primary semantic vector search
- `Neo4j` = 4D/topology/GraphRAG relationships and multi-hop traversal
- `Redis` = hot cache for ACE/BitFrost context packets
- `CouchDB` = stitched `.md` wiki pages and MapReduce rollups
- `SeaweedFS` = original binary files: PDFs, videos, frames, audio, images
- `TurboVec` = optional compressed sidecar for fast prefilter/topK
- `Gemma4` = synthesis/planning after retrieval is narrowed

## Non-Goals
- Do not make LangGraph the spine.
- Do not make pgvector the primary store.
- Do not make CUDA kernels the orchestration layer.
- Do not make Hermes own ingestion.

## Evidence Ingestion Spine
Evidence input
- text / documents / PDFs
- audio
- video
- images

Normalize
- canonical evidence record in Postgres

Process
- modality-specific processors
- chunks / frames / transcript segments / image captions
- embeddings + tags + entities

Persist
- Qdrant semantic index
- Neo4j graph links
- Redis hot cache
- Gemma4 synthesis through ACE

## V1 Scope
Input
- local video file
- operator-approved URL

Process
1. Store the original video in SeaweedFS.
2. Create a durable Postgres evidence row first.
3. Extract audio with FFmpeg.
4. Transcribe audio with Whisper / faster-whisper / whisper.cpp.
5. Split transcript into timestamped chunks.
6. Summarize the transcript.
7. Embed transcript chunks into Qdrant.
8. Write wiki note / summary data for later stitching.

No VLM lane in V1.
No frame analysis in V1.

## V1 Tables
- `evidence_items`
- `evidence_media_assets`
- `evidence_transcript_segments`
- `evidence_processing_jobs`

## Canonical Postgres Ledger
Use Postgres for durable records:
- `documents`
- `evidence_items`
- `evidence_media_assets`
- `evidence_transcript_segments`
- `evidence_frames`
- `evidence_summaries`
- `wiki_pages`
- `markdown_chunks`
- `metadata_envelopes`
- `llm_context_cache`
- `workflow_runs`
- `workflow_steps`
- `feature_maps`
- `grpo_memory_sticks`

Use JSONB envelopes for flexible metadata:

```json
{
  "source_path": "docs/design/turbovec_gpu_bitfrost_evidence_architecture.md",
  "chunk_id": "md:turbovec:section:12",
  "summary": "Explains TurboVec sidecar retrieval and Qdrant canonical payload lookup.",
  "tags": ["turbovec", "qdrant", "bitfrost", "ace"],
  "feature_keys": ["retrieval.turbovec_sidecar", "cache.bitfrost_context"],
  "qdrant_point_id": "md:turbovec:section:12",
  "neo4j_node_id": "MarkdownChunk:md:turbovec:section:12",
  "redis_cache_key": "ace:ctx:...",
  "trust_tier": "internal_design_doc"
}
```

Postgres answers:
- What exists?
- Where did it come from?
- When was it indexed?
- Which workflow created it?
- Which Qdrant / Neo4j / Redis records point to it?
- Was it accepted or rejected by memory gain?

## CouchDB Wiki Corpus
Use CouchDB for stitched `.md` wiki pages.

Flow
`.md` files -> parse headings/frontmatter/code blocks -> extract sections -> summarize sections -> stitch wiki page docs -> store in CouchDB

Example doc:

```json
{
  "_id": "wiki:design:turbovec-gpu-bitfrost",
  "type": "wiki_page",
  "title": "TurboVec + GPU + BitFrost Evidence Architecture",
  "source_path": "docs/design/turbovec_gpu_bitfrost_evidence_architecture.md",
  "sections": [
    {
      "heading": "BitFrost / NanoFlow-Style ACE Context Cache",
      "summary": "Logical context-pack reuse through Redis, Postgres, and local JSON.",
      "tags": ["bitfrost", "ace", "redis", "context-cache"]
    }
  ],
  "feature_keys": ["cache.bitfrost", "retrieval.turbovec"],
  "updated_at": "..."
}
```

MapReduce views
- `by_tag`
- `by_feature_key`
- `by_source_path`
- `by_updated_at`
- `by_status`
- `link_matrix`

## Qdrant Semantic Retrieval
Use Qdrant for actual semantic search.

Collections
- `markdown_chunks`
- `codebase_chunks_768`
- `evidence_text_chunks`
- `evidence_visual_chunks`
- `evidence_summaries`
- `feature_summaries`
- `qdrant_docs`

Payload for `.md` chunks:

```json
{
  "source_type": "markdown_design_doc",
  "source_path": "docs/design/turbovec_gpu_bitfrost_evidence_architecture.md",
  "section_heading": "Retrieval Flow With TurboVec + Qdrant + GraphRAG",
  "chunk_id": "md:turbovec:retrieval-flow",
  "summary": "Gemma4 expands query, TurboVec optionally prefilters, Qdrant fetches canonical payloads, Neo4j expands graph, ACE builds context.",
  "tags": ["gemma4", "qdrant", "turbovec", "neo4j", "ace"],
  "feature_keys": ["retrieval.hyper_semantic", "cache.bitfrost"],
  "trust_tier": "internal_design_doc",
  "indexed_at": "..."
}
```

Qdrant answers:
- Which chunks are semantically relevant?
- Which design notes mention the same concept under different words?
- Which evidence / document / video / frame chunks match intent?

## Neo4j Graph Layer
Use Neo4j for graph relationships, not raw vectors.

Nodes
- `MarkdownDoc`
- `MarkdownChunk`
- `Feature`
- `Tag`
- `Evidence`
- `Frame`
- `TranscriptSegment`
- `CodeFile`
- `AgentsCard`
- `QdrantCluster`
- `SomCell`
- `WorkflowRun`
- `Recommendation`

Edges
- `(:MarkdownDoc)-[:HAS_SECTION]->(:MarkdownChunk)`
- `(:MarkdownChunk)-[:DESCRIBES]->(:Feature)`
- `(:Feature)-[:USES]->(:Datastore)`
- `(:Feature)-[:IMPLEMENTED_BY]->(:CodeFile)`
- `(:QdrantCluster)-[:CONTAINS]->(:MarkdownChunk)`
- `(:SomCell)-[:NEAR]->(:SomCell)`
- `(:Frame)-[:ALIGNS_WITH]->(:TranscriptSegment)`
- `(:WorkflowRun)-[:PRODUCED]->(:Recommendation)`

4D topology properties

```json
{
  "som_x": 12,
  "som_y": 7,
  "semantic_z": 0.84,
  "grpo_w": 0.31,
  "manifold4": [12, 7, 0.84, 0.31]
}
```

Neo4j answers:
- What connects this document to this feature?
- Which code files implement the design?
- Which Qdrant clusters are near this topic?
- Which recommendations came from this workflow?
- What path connects BitFrost cache to video evidence retrieval?

## Redis Hot Context Packets
Redis stores the fast reusable packet, not the truth.

Keys
- `ace:ctx:{cacheKey}`
- `ace:ctx:hits:{cacheKey}`
- `ace:ctx:meta:{cacheKey}`
- `wiki:page:{wikiId}:summary`
- `wiki:tag:{tag}`
- `agents:dir:{dirHash}`
- `feature:summary:{featureId}`
- `gpu:karpathy:scores`
- `gpu:autoencoder:centroids_64`

ACE packet

```json
{
  "query": "how do we use TurboVec with video evidence?",
  "summary": "Use Qdrant as canonical semantic index and TurboVec as compressed prefilter.",
  "chunk_ids": ["md:turbovec:retrieval-flow", "md:evidence:video-ingestion"],
  "graph_paths": [["TurboVec", "prefilters", "Qdrant", "fetches", "EvidenceChunk"]],
  "tool_policy": {
    "allowed": ["wiki.search", "evidence.search", "ace.build_context"],
    "blocked": ["raw_db_write", "drizzle_push"]
  },
  "recommendations": [
    "Build transcript-first ingestion before frame/VLM lane.",
    "Keep Qdrant canonical and TurboVec sidecar."
  ]
}
```

Redis answers:
- Have we already built this context?
- What was the compact prior answer?
- Which chunks / graph paths should Gemma4 reuse?
- What recommendations should be injected?

## TurboVec Sidecar
Use TurboVec only after Qdrant has canonical data.

Flow
Qdrant vectors -> export selected embeddings -> TurboVec IdMapIndex -> uint64 IDs -> `.tvim` sidecar file -> query prefilter -> map IDs back to Qdrant / Postgres

TurboVec answers:
- Which 100 vectors are likely close very quickly and cheaply?

TurboVec does not answer:
- Can this user access this evidence?
- What timestamp is this frame?
- What source file produced this?
- Is this transcript human-corrected?

That comes from Postgres / Qdrant payloads.

## Retrieval Order
User asks -> Gemma4 intent planner -> multi-query expansion -> Qdrant dense search -> Postgres metadata lookup -> Neo4j traversal -> CouchDB wiki lookup -> Redis ACE packet -> RRF / rerank / trust filter -> Gemma4 final synthesis

## Phase Order
1. Finish `resolveContextCacheSources()`
2. Add markdown ingestion schema or reuse `metadata_envelopes`
3. Parse and chunk `.md` files
4. Store markdown metadata in Postgres
5. Store stitched wiki docs in CouchDB
6. Embed chunks into Qdrant
7. Add graph nodes / edges in Neo4j
8. Cache summaries in Redis
9. Add ACE context source: `getWikiContextForQuery()`
10. Add recommendation injection into ACE packet
11. Add video / evidence transcript ingestion
12. Add frame extraction every 10 seconds
13. Add timestamp graph alignment
14. Add TurboVec sidecar export
15. Add gRPC TurboVec worker if the sidecar proves useful

## Acceptance Criteria
- Transcript-first video ingestion works end-to-end.
- Postgres stores the canonical evidence row and transcript segments.
- SeaweedFS stores the original video and extracted audio.
- Qdrant stores transcript chunks as the primary semantic index.
- Neo4j can link evidence, transcript, and future frames.
- Redis can cache the compact ACE packet.
- CouchDB can store stitched wiki pages.
- TurboVec remains optional and non-authoritative.

## Notes
This phase doc matches the current architecture intent: Postgres is the durable ledger, but not the only datastore. Qdrant stays primary for retrieval, Neo4j stays for reasoning, Redis stays for hot context, and Gemma4 stays for synthesis after narrowing.
