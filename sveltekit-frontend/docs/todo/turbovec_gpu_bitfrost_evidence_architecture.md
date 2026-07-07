# TurboVec + GPU CUDA Streams + BitFrost ACE Context Architecture

**Goal:** Fit TurboVec, Qdrant, Postgres JSONB, Redis/BitFrost cache, gRPC/MCP, GPU tensor processing, and Gemma4 into one evidence-ingestion and retrieval architecture for audio, video, images, documents, and codebase wiki memory.

**Core decision:**

```text
Qdrant    = production semantic index
Postgres  = durable evidence / JSONB / audit source of truth
Neo4j     = GraphRAG / multi-hop reasoning
SeaweedFS = binary file storage
Redis     = hot cache and ranking signals
CouchDB   = Karpathy wiki / MapReduce notes
TurboVec  = compressed local vector sidecar / prefilter
GPU CUDA  = dense tensor math only
gRPC      = typed worker boundary for heavy processing
MCP       = safe model-facing tool boundary
Gemma4    = planner, summarizer, synthesizer
```

---

## 1. TurboVec Role

`RyanCodrai/turbovec` is a Rust vector index with Python bindings. It supports a compressed vector index, Python/Rust APIs, persistent write/load, and stable external IDs through `IdMapIndex`.

TurboVec should be used as:

```text
compressed local ANN sidecar
fast top-K prefilter
encoded64 / feature-vector experiment lane
cache warmer
offline search benchmark
```

TurboVec should **not** be used as:

```text
source of truth
evidence metadata store
case permission store
timestamp authority
audit log
human correction ledger
binary file store
graph database
```

---

## 2. Why uint64 IDs?

TurboVec `IdMapIndex` expects stable numeric external IDs.

Your app usually has string IDs:

```text
Qdrant point ID: ev_123_frame_00013
Evidence ID:    ev_123
Chunk ID:       seg_120000_145000
```

TurboVec wants something like:

```text
uint64 external ID: 100000000013
```

So use a mapping table.

### Suggested mapping table

```sql
CREATE TABLE IF NOT EXISTS turbovec_id_map (
  turbovec_id BIGINT PRIMARY KEY,
  qdrant_collection TEXT NOT NULL,
  qdrant_point_id TEXT NOT NULL,
  evidence_id TEXT,
  modality TEXT,
  view TEXT,
  timestamp_ms BIGINT,
  created_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);
```

### Runtime mapping

```text
TurboVec returns uint64 IDs
  → lookup qdrant_point_id / evidence_id
  → fetch canonical payload from Qdrant/Postgres
  → apply case permissions
  → merge with other retrieval lanes
```

---

## 3. Canonical Evidence Ingestion Spine

```text
video / audio / image / document
  ↓
Postgres evidence row
  ↓
SeaweedFS original blob
  ↓
transcript / frame captions / OCR / summaries
  ↓
Qdrant vectors with payload metadata
  ↓
Neo4j evidence graph
  ↓
CouchDB/Karpathy wiki note
  ↓
Redis hot cache
  ↓
Gemma4/ACE synthesis
```

TurboVec joins **after** Qdrant has canonical vectors and metadata.

---

## 4. Audio + Video Alignment

Do not use vector similarity for first-pass audio/video alignment.

Use timestamps.

### Transcript segment

```json
{
  "evidence_id": "ev_123",
  "segment_id": "seg_120000_145000",
  "start_ms": 120000,
  "end_ms": 145000,
  "text": "speaker says ...",
  "confidence": 0.91
}
```

### Frame

```json
{
  "evidence_id": "ev_123",
  "frame_id": "frame_00013",
  "timestamp_ms": 130000,
  "caption": "A person stands near a vehicle."
}
```

### Alignment rule

```text
same evidence_id
AND frame.timestamp_ms BETWEEN transcript.start_ms AND transcript.end_ms
```

### Graph edges

```text
(:Frame)-[:ALIGNS_WITH]->(:TranscriptSegment)
(:TranscriptSegment)-[:MENTIONS]->(:Entity)
(:Frame)-[:DEPICTS]->(:Entity)
```

---

## 5. Video Frames Every 10 Seconds

Default frame extraction strategy:

```text
1 frame every 10 seconds
max 60 frames per video initially
scene-change detection later
manual frame selection later
```

Scale estimate:

```text
1 hour video   = 360 frames
100 hours      = 36,000 frames
1,000 hours    = 360,000 frames
10M frames     = very large archive scale
```

Recommended progression:

```text
small scale:
  Qdrant only

medium scale:
  Qdrant + Redis hot cache

large scale:
  Qdrant canonical + TurboVec sidecar prefilter + Neo4j graph expansion
```

---

## 6. JSONB Envelope Pattern

Use Postgres JSONB for metadata and provenance, not raw vectors.

Raw vectors belong in Qdrant or TurboVec sidecar.

### Example frame-caption envelope

```json
{
  "evidence_id": "ev_123",
  "modality": "video",
  "view": "frame_caption",
  "timestamp_ms": 130000,
  "source_uri": "s3://evidence/frames/frame_00013.jpg",
  "text": "A person stands near a vehicle.",
  "tags": ["person", "vehicle"],
  "embedding": {
    "model": "embeddinggemma",
    "dim": 768,
    "qdrant_collection": "evidence_visual_chunks",
    "qdrant_point_id": "ev_123_frame_00013",
    "turbovec_index": "evidence_visual.tvim",
    "turbovec_id": "100000000013"
  },
  "analysis": {
    "vlm_model": "gemma-vlm",
    "confidence": 0.82,
    "trust_tier": "visual_caption_candidate"
  }
}
```

---

## 7. gRPC Boundary

Use gRPC when media/vector processing needs isolation or a faster worker runtime.

Start with TypeScript workers if they are sufficient. Move to gRPC when you need process isolation, Go/Rust/Python libraries, streaming outputs, or a stable cross-language contract.

### Suggested gRPC services

```text
SvelteKit / TRACE
  → gRPC EvidenceIngestService
      ExtractAudio()
      ExtractFrames()
      TranscribeAudio()
      CaptionFrame()
      EmbedText()
      EmbedImageCaption()
      Encode64()

  → gRPC TurboVecSearchService
      Search()
      ReloadIndex()
      Health()
```

### Protobuf sketch

```proto
syntax = "proto3";

package evidence.v1;

message EvidenceRef {
  string evidence_id = 1;
  string case_id = 2;
  string storage_uri = 3;
}

message TranscriptSegment {
  string id = 1;
  string evidence_id = 2;
  int64 start_ms = 3;
  int64 end_ms = 4;
  string text = 5;
  string language = 6;
  float confidence = 7;
  string model = 8;
}

message FrameAnalysis {
  string id = 1;
  string evidence_id = 2;
  int64 timestamp_ms = 3;
  string frame_uri = 4;
  string caption = 5;
  repeated string objects = 6;
  repeated string visible_text = 7;
  repeated string tags = 8;
  float confidence = 9;
}

message VectorQuery {
  string collection = 1;
  repeated float vector = 2;
  uint32 top_k = 3;
}

message VectorHit {
  uint64 external_id = 1;
  float score = 2;
}

message VectorSearchResult {
  repeated VectorHit hits = 1;
}

service EvidenceIngestService {
  rpc TranscribeVideo(EvidenceRef) returns (stream TranscriptSegment);
  rpc AnalyzeFrames(EvidenceRef) returns (stream FrameAnalysis);
}

service TurboVecSearchService {
  rpc Search(VectorQuery) returns (VectorSearchResult);
  rpc ReloadIndex(VectorQuery) returns (VectorSearchResult);
  rpc Health(VectorQuery) returns (VectorSearchResult);
}
```

---

## 8. MCP Boundary

MCP is the safe tool-facing boundary for Gemma4, Hermes, Claude Code, and other agents.

MCP should expose small, named tools:

```text
evidence.video_ingest
evidence.search
evidence.explain_result
evidence.get_workflow_status
wiki.status
wiki.search
ace.context_cache_status
```

MCP should **not** expose raw database writes, raw Redis commands, raw Qdrant mutation, or raw filesystem access.

### Safe flow

```text
Gemma4 / Hermes / Claude Code
  → MCP tool call
  → SvelteKit service
  → Postgres/Qdrant/Neo4j/Redis workers
  → structured result
  → Gemma4 synthesis
```

### Tool-policy rule

Any cached ACE context packet should carry a `toolPolicy` field so cached packets do not accidentally re-enable tools that were not allowed in the original context.

---

## 9. BitFrost / NanoFlow-Style ACE Context Cache

This cache stores logical context packs, not raw model KV tensors.

### Cache order

```text
Redis ace:ctx:{cacheKey}
  → Postgres llm_context_cache
  → NVMe local JSON .cache/ace/context-packs/{cacheKey}.json
  → miss → full retrieval
```

### Cache stores

```text
summary
chunk IDs
graph paths
tool policy
FeatureMap packets
Wiki cards
relationship reports
retrieval trace metadata
```

### Cache does not store

```text
raw llama KV tensors
GPU pointers
native handles
hidden reasoning
raw model memory
```

### Cache identity fields

```text
modelName
modelQuant
backend
tokenizerHash
systemPromptHash
toolDefinitionsHash
repoGitSha
corpusHash
ragBundleHash
graphSnapshotHash
```

### Redis keys

```text
ace:ctx:{cacheKey}
ace:ctx:hits:{cacheKey}
ace:ctx:meta:{cacheKey}
feature:summary:{featureId}
feature:glyph:{featureId}
feature:map:{featureId}
agents:dir:{dirHash}
gpu:karpathy:scores
gpu:autoencoder:centroids_64
grpo:memory:{queryHash}
```

---

## 10. GPU CUDA Streams and Tensor Work

CUDA streams are useful for overlapping independent GPU work, especially data transfer and compute, but they only help when the workload has enough independent batches.

Use GPU for dense tensor math.

### Good RTX/CUDA candidates

```text
embedding batches
VLM frame captions
autoencoder 768→64 encoding
batch cosine rerank
k-means clustering
SOM / BMU assignment
cross-encoder rerank if GPU-served
```

### Bad RTX/CUDA candidates

```text
yt-dlp download
FFmpeg orchestration
JSON parsing
JSONB writes
Postgres writes
Qdrant network calls
Neo4j traversal
timestamp alignment
small top-20 reranks
TurboVec CPU SIMD search
```

### CUDA stream idea

```text
stream 1:
  encode transcript batch

stream 2:
  encode frame-caption batch

stream 3:
  batch cosine rerank

stream 4:
  autoencoder 768→64
```

Only use this once you have enough batches to keep the GPU busy.

---

## 11. CUDA Graphs Later

CUDA Graphs are not the next step.

Use CUDA Graphs later only for fixed-shape repeated tensor ops:

```text
batch encode [256, 768] → [256, 64]
batch cosine [1, 768] × [N, 768]
fixed topK tensor op
```

Do not use CUDA Graphs for:

```text
dynamic graph traversal
Qdrant calls
Neo4j calls
FFmpeg orchestration
JSON parsing
file upload
workflow tracking
```

---

## 12. Autoencoder + SOM + TurboVec

These are different stages.

```text
EmbeddingGemma
  text/frame caption → 768d embedding

Autoencoder
  768d → 64d learned projection

SOM
  groups embeddings into topology cells / BMU row/col

TurboVec
  compressed sidecar search over 768d or 64d vectors

Qdrant
  canonical search index and payload filters
```

### Recommended flow

```text
1. Store canonical 768d in Qdrant.
2. Store payload:
     som_cluster
     som_bmu_row
     som_bmu_col
     evidence_id
     timestamp_ms
3. Later add encoded_64 named vector or encoded64 pointer.
4. Export selected vectors to TurboVec:
     768d for better recall
     64d for smaller/faster prefilter
5. TurboVec returns uint64 IDs.
6. Map uint64 → Qdrant point IDs.
7. Fetch canonical payloads from Qdrant/Postgres.
```

---

## 13. Retrieval Flow With TurboVec + Qdrant + GraphRAG

```text
User query
  ↓
Gemma4 query planner
  ↓
expand:
  semantic query
  exact keyword query
  entity query
  timeline query
  visual query
  ↓
EmbeddingGemma embeds query
  ↓
Optional TurboVec prefilter:
  compressed sidecar topK
  returns uint64 IDs
  ↓
Qdrant:
  native search and/or lookup by mapped IDs
  payload filters:
    case_id
    evidence_id
    modality
    timestamp range
    trust tier
  ↓
Neo4j:
  Frame ↔ TranscriptSegment ↔ Entity ↔ Event expansion
  ↓
Redis:
  cached summaries, ACE packets, centroids
  ↓
RRF merge:
  Qdrant + TurboVec + graph + wiki + activity
  ↓
MARCO / LangExtract / Gemma rerank
  ↓
ACE compact context packet
  ↓
Gemma4 final answer
```

---

## 14. Gemma4 Role

Gemma4 should not directly access raw databases.

Gemma4 should:

```text
classify intent
expand the query
choose retrieval lanes
summarize results
explain graph connections
synthesize final answer
propose next workflow step
```

Gemma4 should call MCP tools only:

```text
evidence.search
evidence.get_timeline
wiki.search
ace.build_context
workflow.get_status
```

It should not directly call:

```text
valkey-cli / redis-cli
psql
qdrant raw mutation
neo4j write cypher
filesystem delete/write tools
```

---

## 15. TurboVec Spike TODO

### Phase TV1 — Local install and dummy index

```text
[ ] Create isolated Python environment.
[ ] pip install turbovec numpy.
[ ] Create 1K dummy 768d vectors.
[ ] Build IdMapIndex(dim=768, bit_width=4).
[ ] Add vectors with stable uint64 external IDs.
[ ] Search one query vector.
[ ] Persist index to .cache/turbovec/evidence_text.tvim.
[ ] Reload index.
[ ] Verify IDs survive reload.
```

Example:

```python
import numpy as np
from turbovec import IdMapIndex

dim = 768
n = 1000

vectors = np.random.randn(n, dim).astype("float32")
vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)

ids = np.arange(100000, 100000 + n, dtype=np.uint64)

index = IdMapIndex(dim=dim, bit_width=4)
index.add_with_ids(vectors, ids)

query = vectors[0:1]
scores, hit_ids = index.search(query, k=10)

index.write(".cache/turbovec/evidence_text.tvim")
loaded = IdMapIndex.load(".cache/turbovec/evidence_text.tvim")

scores2, hit_ids2 = loaded.search(query, k=10)
assert list(hit_ids[0]) == list(hit_ids2[0])
print("IDs survived reload")
```

---

## 16. Qdrant Export to TurboVec TODO

```text
[ ] Scroll Qdrant evidence_text_chunks.
[ ] Extract vector + point ID + evidence ID.
[ ] Create uint64 external ID mapping.
[ ] Write mapping to Postgres or JSONL.
[ ] Build TurboVec IdMapIndex.
[ ] Persist .tvim sidecar.
[ ] Add checksum for sidecar.
[ ] Add rebuild timestamp.
[ ] Add sidecar health check.
```

---

## 17. TurboVec gRPC Worker TODO

```text
[ ] Define TurboVecSearchService proto.
[ ] Implement Python or Rust worker.
[ ] Add Search(collection, vector, topK).
[ ] Add ReloadIndex(collection).
[ ] Add Health().
[ ] Add SvelteKit gRPC client.
[ ] Add fallback if worker unavailable.
[ ] Add retrieval trace span:
      turbovec_prefilter.enabled
      turbovec_prefilter.duration_ms
      turbovec_prefilter.hit_count
```

---

## 18. SvelteKit Integration TODO

### API routes

```text
POST /api/evidence/video/ingest
GET  /api/evidence/workflows/[id]
POST /api/evidence/workflows/[id]/retry
POST /api/evidence/workflows/[id]/cancel
POST /api/search/evidence
GET  /api/search/evidence/lane-health
```

### Admin routes

```text
/admin/evidence-ingestion
/admin/evidence/:id/timeline
/admin/evidence/:id/frames
/admin/evidence/:id/transcript
/admin/evidence/search
/admin/knowledge-base
```

### Components

```text
EvidenceWorkflowTracker.svelte
VideoTimelineViewer.svelte
FrameGrid.svelte
TranscriptSegmentList.svelte
EvidenceSearchPanel.svelte
GraphTracePanel.svelte
QdrantPayloadInspector.svelte
TurboVecLaneHealth.svelte
WikiNoteViewer.svelte
```

---

## 19. Guardrails

```text
[ ] Do not replace Qdrant with TurboVec.
[ ] Do not store permissions only in TurboVec.
[ ] Do not store evidence provenance only in TurboVec.
[ ] Do not skip Postgres evidence rows.
[ ] Do not skip SeaweedFS original media storage.
[ ] Do not use vector similarity for timestamp alignment.
[ ] Do not run full 10M ingest before V1/V2 are stable.
[ ] Do not add gRPC before TypeScript worker path is proven.
[ ] Do not add CUDA kernels before retrieval traces show the bottleneck.
[ ] Do not run broad drizzle push.
[ ] Do not let Gemma4 directly call raw DB/search tools.
```

---

## 20. Final Recommendation

Use TurboVec like this:

```text
Phase 1:
  Qdrant only for V1 transcript ingestion

Phase 2:
  Qdrant for frame captions

Phase 3:
  Export Qdrant vectors to TurboVec sidecar

Phase 4:
  Use TurboVec as compressed prefilter for topK IDs

Phase 5:
  Fetch canonical payloads from Qdrant/Postgres

Phase 6:
  Use Neo4j/Gemma4 to reason over results
```

This gives you TurboVec's low-RAM speed without giving up metadata, filtering, graph reasoning, auditability, permissions, and evidence provenance.

---

## 21. Immediate Next Steps

```text
1. Finish transcript-first evidence ingestion.
2. Store transcript chunks in Qdrant.
3. Add frame extraction every 10 seconds.
4. Store frame captions in Qdrant.
5. Add timestamp alignment Frame ↔ TranscriptSegment.
6. Add Neo4j evidence graph.
7. Spike TurboVec locally with 1K dummy vectors.
8. Export Qdrant vectors into TurboVec sidecar.
9. Add gRPC only after the sidecar works locally.
10. Add ACE/Gemma4 retrieval lane integration.
```
