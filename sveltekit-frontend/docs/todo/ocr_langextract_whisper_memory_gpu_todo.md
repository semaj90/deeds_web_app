# OCR + LangExtract + Whisper Memory/GPU TODO

**Goal:** Add image-to-text/OCR, structured extraction, Whisper audio flow, memory storage, autoencoding, GPU batch processing, and ACE/Gemma4 retrieval integration to the existing SvelteKit 2 evidence + Master Atlas architecture.

**Core decision:**

```text
Image/PDF OCR        = IBM Granite Vision / Docling-style document extraction lane
Structured entities  = LangExtract / native extraction
Audio transcription  = Whisper / faster-whisper / whisper.cpp
Embedding            = EmbeddingGemma through Ollama by default
Semantic search      = Qdrant
Durable records      = Postgres JSONB
Graph reasoning      = Neo4j
Hot cache            = Redis / BitFrost ACE packets
Wiki notes           = CouchDB / Karpathy wiki
Optional sidecar     = TurboVec
GPU                  = dense batch math only
Gemma4               = planner, synthesis, recommendations
Langfuse             = traces, scores, observability
```

---

## 1. Direct Recommendation

Use this pipeline:

```text
image / PDF / scanned doc
  → OCR / document extraction
  → LangExtract structured fields
  → Postgres JSONB envelope
  → EmbeddingGemma vector
  → Qdrant semantic index
  → Neo4j evidence/entity graph
  → Redis ACE context packet
  → Gemma4 synthesis
```

For audio/video:

```text
audio/video
  → extract audio
  → Whisper transcription
  → timestamped segments
  → LangExtract entities
  → Postgres JSONB envelope
  → EmbeddingGemma vector
  → Qdrant semantic index
  → optional autoencoder 768→64
  → Redis centroids / ACE packet
  → Gemma4 synthesis
```

---

## 2. Image to Text: Granite + Docling-Style Lane

### Use cases

```text
scanned PDF pages
screenshots
photo evidence
forms
tables
diagrams
charts
receipts
legal exhibits
```

### TODO

- [ ] Add `src/lib/server/evidence/ocr/ocr-types.ts`.
- [ ] Add `src/lib/server/evidence/ocr/granite-ocr-service.ts`.
- [ ] Add `src/lib/server/evidence/ocr/docling-normalizer.ts`.
- [ ] Add `src/lib/server/evidence/ocr/ocr-confidence.ts`.
- [ ] Add API route: `POST /api/evidence/ocr/analyze`.
- [ ] Add smoke: `scripts/smoke-ocr-ingest.mjs`.

### Output shape

```json
{
  "evidence_id": "ev_123",
  "page_id": "page_0001",
  "modality": "image",
  "view": "ocr_text",
  "text": "Extracted text...",
  "tables": [],
  "figures": [],
  "layout_blocks": [],
  "confidence": 0.87,
  "model": "granite-vision-or-docling-lane",
  "trust_tier": "ocr_candidate"
}
```

### Important rule

```text
OCR output is candidate text, not ground truth.
Always keep original image/PDF.
Store model, confidence, page/frame timestamp, and source URI.
Allow human correction.
```

---

## 3. LangExtract / Structured Extraction Lane

LangExtract should run **after OCR/transcription**, not before.

### Input sources

```text
OCR text
transcript segments
document chunks
frame captions
image captions
Gemma4 summaries
```

### Extract

```text
people
organizations
locations
dates
times
events
vehicles
statutes
citations
case names
docket numbers
money amounts
addresses
visible text
evidence labels
risk flags
```

### TODO

- [ ] Add `src/lib/server/evidence/extraction/langextract-evidence-service.ts`.
- [ ] Reuse existing native legal/entity extractor if available.
- [ ] Add Zod schema for extracted entities.
- [ ] Add confidence and source span offsets.
- [ ] Add fallback: regex/native extraction when LLM extraction unavailable.
- [ ] Store extracted entities in Postgres JSONB.
- [ ] Create Neo4j entity nodes and edges.
- [ ] Add Qdrant payload tags from extracted entities.

### Entity JSON shape

```json
{
  "entity_id": "ent_123",
  "type": "vehicle",
  "text": "white truck",
  "source_id": "seg_120000_145000",
  "source_modality": "transcript",
  "start_offset": 42,
  "end_offset": 53,
  "confidence": 0.76,
  "extractor": "langextract",
  "normalized": {
    "label": "vehicle:white_truck"
  }
}
```

---

## 4. Whisper Audio Flow

### Pipeline

```text
video/audio file
  → FFmpeg audio extraction
  → Whisper / faster-whisper / whisper.cpp
  → timestamped transcript segments
  → optional translation
  → LangExtract
  → embedding
  → Qdrant
  → Neo4j timestamp graph
  → wiki note
```

### TODO

- [ ] Add `src/lib/server/evidence/audio/audio-extract-service.ts`.
- [ ] Add `src/lib/server/evidence/audio/whisper-transcript-service.ts`.
- [ ] Add `src/lib/server/evidence/audio/transcript-segmenter.ts`.
- [ ] Add `src/lib/server/evidence/audio/transcript-quality.ts`.
- [ ] Add smoke: `scripts/smoke-whisper-flow.mjs`.

### Segment shape

```json
{
  "evidence_id": "ev_123",
  "segment_id": "seg_120000_145000",
  "start_ms": 120000,
  "end_ms": 145000,
  "text": "speaker says...",
  "language": "en",
  "translated_text": null,
  "confidence": 0.91,
  "model": "whisper",
  "trust_tier": "transcript_candidate"
}
```

### Audio reliability rules

- [ ] Keep original audio/video.
- [ ] Keep model/version/settings.
- [ ] Store confidence.
- [ ] Store timestamps.
- [ ] Allow human correction.
- [ ] Mark low-confidence segments for review.
- [ ] Do not treat transcript as verified evidence until reviewed.

---

## 5. Memory Storage: Postgres JSONB + Qdrant + Redis

### Durable JSONB envelope

Use Postgres for metadata/provenance.

```json
{
  "source_type": "audio_transcript_segment",
  "source_id": "seg_120000_145000",
  "evidence_id": "ev_123",
  "summary": "Segment discusses a person near a vehicle.",
  "text_ref": {
    "postgres_table": "evidence_transcript_segments",
    "id": "seg_120000_145000"
  },
  "embedding": {
    "model": "embeddinggemma",
    "dim": 768,
    "qdrant_collection": "evidence_text_chunks",
    "qdrant_point_id": "ev_123_seg_120000_145000",
    "encoded64_version": "ae-2026-05-10"
  },
  "extraction": {
    "entities": ["person", "vehicle"],
    "extractor": "langextract",
    "confidence": 0.76
  },
  "cache_refs": {
    "redis_summary_key": "evidence:summary:ev_123",
    "ace_context_key": "ace:ctx:..."
  }
}
```

### Redis hot keys

```text
evidence:summary:{evidenceId}
evidence:timeline:{evidenceId}
evidence:ocr:{pageHash}
evidence:transcript:{segmentHash}
evidence:frame-analysis:{frameHash}
ace:ctx:{cacheKey}
gpu:autoencoder:centroids_64
```

### Qdrant collections

```text
evidence_text_chunks
evidence_visual_chunks
evidence_summaries
markdown_chunks
feature_summaries
```

---

## 6. Autoencoding Memory

Use autoencoding for retrieval compression, not as the source of truth.

### Flow

```text
EmbeddingGemma
  → 768d vector
  → Qdrant canonical vector
  → autoencoder 768→64
  → encoded_64 named vector or payload pointer
  → Redis centroid cache
  → optional TurboVec sidecar
```

### TODO

- [ ] Finish Redis weight loader for autoencoder.
- [ ] Add `encode768to64()`.
- [ ] Add batch encode support.
- [ ] Add dry-run backfill for Qdrant `encoded_64`.
- [ ] Compute cluster centroids.
- [ ] Store centroids in Redis.
- [ ] Add ACE shadow-mode prefilter.
- [ ] Log encoded64 lane in Langfuse.
- [ ] Do not enforce prefilter until miss-rate is measured.

### What to store

```text
Qdrant:
  original 768d vector
  optional encoded_64 vector
  payload: encoded64_version, som_cluster, manifold4

Redis:
  gpu:autoencoder:centroids_64
  encoded64 metadata

Postgres:
  only references and provenance
```

---

## 7. SOM / 4D Topology

SOM and 4D topology are for clustering and graph reasoning.

### 4D manifold

```json
{
  "som_x": 12,
  "som_y": 7,
  "semantic_z": 0.84,
  "grpo_w": 0.31,
  "manifold4": [12, 7, 0.84, 0.31]
}
```

### TODO

- [ ] Assign `som_cluster` to OCR chunks.
- [ ] Assign `som_cluster` to transcript chunks.
- [ ] Assign `som_cluster` to frame captions.
- [ ] Mirror topology metadata into Qdrant payloads.
- [ ] Add Neo4j `(:SomCell)` nodes.
- [ ] Add `(:Chunk)-[:IN_SOM_CELL]->(:SomCell)` edges.
- [ ] Add topology-aware retrieval lane.
- [ ] Do not run write job until identity strategy is settled if user/activity signals are involved.

---

## 8. Concurrent Parallelism

Use parallelism at the workflow step level.

### Good parallel lanes

```text
OCR pages in batches
frame caption batches
embedding batches
transcript segment extraction
LangExtract over chunks
Qdrant upserts in batches
Neo4j edge writes in batches
Redis cache writes in batches
```

### Bad parallel lanes

```text
writing same evidence row concurrently
overwriting same wiki note concurrently
running full GPU indexing while Gemma4 inference is active
running VLM + Gemma4 + indexing on 8GB VRAM simultaneously
```

### SvelteKit worker pattern

```text
workflow job
  → step queue
  → batch workers
  → Promise.allSettled for independent steps
  → durable step status in Postgres
  → Redis hot status
  → dashboard polling/SSE
```

### TODO

- [ ] Add concurrency limit per modality.
- [ ] Add GPU semaphore.
- [ ] Add CPU worker pool for parsing/OCR normalization.
- [ ] Add Qdrant batch size config.
- [ ] Add Redis lock per evidence ID.
- [ ] Add retry policy.
- [ ] Add cancellation support.
- [ ] Add degraded-mode status.

---

## 9. GPU Batch Processing

Use GPU for dense math, not orchestration.

### Good GPU candidates

```text
VLM caption batches
Embedding batches
Autoencoder 768→64
Batch cosine similarity
SOM/BMU assignment
k-means clustering
Cross-encoder rerank if GPU-served
```

### Bad GPU candidates

```text
FFmpeg orchestration
yt-dlp download
JSON parsing
Postgres writes
Qdrant network calls
Neo4j traversal
Redis writes
timestamp alignment
workflow state transitions
```

### CUDA stream concept

```text
Stream 1:
  embed transcript batch

Stream 2:
  embed frame-caption batch

Stream 3:
  autoencoder 768→64

Stream 4:
  batch cosine rerank
```

Only use this when you have enough stable batches to keep the GPU busy.

### TODO

- [ ] Add `GpuWorkQueue`.
- [ ] Add max concurrent GPU jobs setting.
- [ ] Add VRAM guard before VLM/Gemma4/indexing.
- [ ] Add batch size tuning.
- [ ] Add Langfuse spans for GPU jobs.
- [ ] Do not add CUDA Graphs until fixed-shape workload is stable.

---

## 10. Langfuse Observability

Langfuse should trace every lane.

### Spans

```text
ocr.extract
langextract.entities
audio.extract
whisper.transcribe
transcript.segment
embed.text
embed.visual
autoencoder.encode64
qdrant.upsert
neo4j.write_edges
redis.cache
ace.context_cache
gemma4.synthesize
```

### TODO

- [ ] Add trace wrapper for OCR.
- [ ] Add trace wrapper for Whisper.
- [ ] Add trace wrapper for LangExtract.
- [ ] Add trace wrapper for embeddings.
- [ ] Add trace wrapper for autoencoder.
- [ ] Add trace wrapper for Qdrant upserts.
- [ ] Add trace wrapper for ACE context cache.
- [ ] Mirror important feedback into Postgres.
- [ ] Do not log secrets or hidden reasoning.
- [ ] Do not log full private evidence text by default.

---

## 11. Retrieval Flow

### Query-time flow

```text
user query
  ↓
Gemma4 planner
  ↓
multi-query expansion:
  semantic
  exact keyword
  entity
  timeline
  visual
  document/OCR
  ↓
Qdrant:
  evidence_text_chunks
  evidence_visual_chunks
  evidence_summaries
  markdown_chunks
  ↓
Neo4j:
  Evidence → Frame → TranscriptSegment → Entity → Event
  ↓
Redis:
  summaries, centroids, ACE packets
  ↓
RRF merge
  ↓
MARCO / LangExtract / Gemma rerank
  ↓
ACE context packet
  ↓
Gemma4 final answer
```

### TODO

- [ ] Add OCR chunks to retrieval planner.
- [ ] Add transcript chunks to retrieval planner.
- [ ] Add frame captions to retrieval planner.
- [ ] Add visual query expansion.
- [ ] Add timeline query expansion.
- [ ] Add graph path explanation.
- [ ] Add trust-tier filtering.
- [ ] Add human-corrected text boost.

---

## 12. SvelteKit 2 UI

### Routes

```text
/admin/evidence-ingestion
/admin/evidence/:id/ocr
/admin/evidence/:id/transcript
/admin/evidence/:id/frames
/admin/evidence/:id/timeline
/admin/evidence/search
/admin/knowledge-base
/admin/observability
```

### Components

```text
EvidenceWorkflowTracker.svelte
OcrPageViewer.svelte
TranscriptSegmentList.svelte
FrameGrid.svelte
EvidenceTimeline.svelte
LangExtractEntityPanel.svelte
QdrantPayloadInspector.svelte
AceContextPacketViewer.svelte
LangfuseTraceLink.svelte
GpuQueueStatus.svelte
```

### TODO

- [ ] Add OCR page viewer.
- [ ] Add transcript correction UI.
- [ ] Add frame-caption correction UI.
- [ ] Add entity correction UI.
- [ ] Add workflow retry UI.
- [ ] Add GPU queue status.
- [ ] Add trace link panel.
- [ ] Add cache hit/miss panel.

---

## 13. Commit Sequence

### Commit 1

```text
docs(evidence): add OCR LangExtract Whisper memory GPU plan
```

### Commit 2

```text
feat(ocr): add OCR extraction envelope and smoke
```

### Commit 3

```text
feat(audio): add Whisper transcript workflow
```

### Commit 4

```text
feat(extract): add LangExtract entity normalization
```

### Commit 5

```text
feat(memory): store OCR/transcript envelopes in Postgres and Qdrant
```

### Commit 6

```text
feat(gpu): add GPU work queue and batch observability
```

### Commit 7

```text
feat(ace): add OCR/transcript/frame context to retrieval planner
```

---

## 14. Guardrails

- [ ] Do not treat OCR as ground truth.
- [ ] Do not treat Whisper transcript as ground truth.
- [ ] Do not overwrite original evidence.
- [ ] Do not run GPU-heavy VLM + Gemma4 + indexing simultaneously on 8GB VRAM.
- [ ] Do not store raw private evidence text in Langfuse by default.
- [ ] Do not enforce encoded64 prefilter until shadow-mode traces are reviewed.
- [ ] Do not replace Qdrant with TurboVec.
- [ ] Do not add Kafka/Spark/SurrealDB for this phase.
- [ ] Do not run broad `drizzle push`.

---

## 15. Final Recommendation

Start with:

```text
OCR/image-to-text + Whisper transcript flow
```

Then:

```text
LangExtract structured entity normalization
```

Then:

```text
Postgres JSONB + Qdrant storage
```

Then:

```text
ACE/Gemma4 retrieval integration
```

Then:

```text
GPU batching and autoencoder optimization
```

Do not start with CUDA kernels or ONNX migration. The retrieval and memory substrate must be correct first.
