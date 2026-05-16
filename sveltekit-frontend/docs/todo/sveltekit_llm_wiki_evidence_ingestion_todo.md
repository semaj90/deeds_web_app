# SvelteKit 2 LLM-Wiki + Evidence Ingestion TODO

**Goal:** Build a SvelteKit 2 workflow for a local LLM-wiki / Karpathy wiki, evidence ingestion, video/audio/image/document processing, multi-query retrieval, and agentic workflow tracking.

**Current architecture decision:**

```text
Postgres   = durable source of truth / audit ledger
SeaweedFS  = binary blob storage for videos, frames, audio, PDFs, images
Qdrant     = primary semantic retrieval index
Neo4j      = GraphRAG / multi-hop relationship reasoning
Redis      = hot cache, job state, summaries, centroids, query plans
CouchDB    = Karpathy wiki / MapReduce notes
Gemma4     = planner, summarizer, synthesis model
TurboVec   = optional vector/encoded64 accelerator
Hermes     = operator UI through TRACE MCP tools
SvelteKit  = app UI, API routes, dashboards, workflow control
```

Do **not** make LangGraph, pgvector, CUDA kernels, TurboVec, or Hermes own the whole system. They are optional lanes/tools, not the spine.

---

## 0. Safety Rules

- [ ] Do not run `drizzle push`.
- [ ] Do not change `cases.user_id` identity strategy.
- [ ] Do not run `buildHypergraph4D()` as a write job.
- [ ] Do not run full codebase re-index until smoke tests are green.
- [ ] Do not make TurboVec the canonical evidence store.
- [ ] Do not use Redis as source of truth.
- [ ] Do not overwrite original evidence files.
- [ ] Treat transcripts and VLM captions as **candidate analysis**, not legal ground truth.
- [ ] Store model, confidence, timestamps, and provenance for every generated artifact.
- [ ] Every ingestion step must be retryable and idempotent.

---

## 1. Foundation: LLM-Wiki / Karpathy Wiki Manager

### Routes

```text
src/routes/(app)/admin/knowledge-base/+page.svelte
```

### API routes

```text
GET  /api/wiki/status
POST /api/wiki/search
POST /api/wiki/refresh-directory
GET  /api/wiki/page/[id]
```

### Dashboard panels

- [ ] Wiki Status
- [ ] Search
- [ ] Directory Card Inspector
- [ ] FeatureMap / NES Glyph Preview
- [ ] Graph Links
- [ ] Stale Pages
- [ ] Recent Activity
- [ ] Agentic Workflow Runs
- [ ] Evidence Notes
- [ ] Qdrant Payload Coverage
- [ ] Neo4j AgentsCard Count
- [ ] Redis Hot Cache Count
- [ ] CouchDB Wiki Doc Count

### Wiki status payload

```json
{
  "ok": true,
  "pages": {
    "couchdbWikiDocs": 406,
    "redisAgentsDirKeys": 387,
    "redisAgentsRoot": true
  },
  "graph": {
    "latestGraphifyAt": "2026-05-13T00:00:00.000Z",
    "codebaseGraphFresh": true,
    "neo4jAgentsCardCount": 406,
    "neo4jDirectoryCount": 406
  },
  "qdrant": {
    "collection": "codebase_chunks_768",
    "payloadCoverage": {
      "agents_card_id": 0.82,
      "feature_keys": 0.76
    }
  },
  "warnings": []
}
```

---

## 2. Evidence Registration

Every evidence file starts with a durable Postgres row.

### Tables or equivalents

```text
evidence_items
evidence_media_assets
evidence_processing_jobs
evidence_transcript_segments
evidence_frames
evidence_summaries
evidence_workflow_runs
evidence_workflow_steps
```

### TODO

- [ ] Define `EvidenceWorkflowRun`.
- [ ] Define `VideoIngestJob`.
- [ ] Register original media first.
- [ ] Compute SHA256.
- [ ] Store original binary in SeaweedFS.
- [ ] Create Postgres `evidence_items` row.
- [ ] Create Postgres `evidence_media_assets` row.
- [ ] Mark job status as `queued`.
- [ ] Add idempotency key: `sha256 + caseId + sourceUri`.
- [ ] Never overwrite existing evidence without explicit operator approval.

### Evidence item shape

```json
{
  "id": "ev_123",
  "case_id": "case_456",
  "modality": "video",
  "source_url": null,
  "uploaded_file_id": "asset_789",
  "storage_uri": "s3://evidence/videos/ev_123.mp4",
  "sha256": "...",
  "status": "queued",
  "created_at": "2026-05-13T00:00:00.000Z"
}
```

---

## 3. Phase V1 — Transcript-First Video Ingestion

Start here. Do not start with VLM/keyframes.

### Files

```text
src/lib/server/evidence/video/video-ingest-types.ts
src/lib/server/evidence/video/video-ingest-service.ts
src/lib/server/evidence/video/transcript-service.ts
src/lib/server/evidence/video/video-summary-service.ts
src/routes/api/evidence/video/ingest/+server.ts
scripts/smoke-video-ingest.mjs
```

### Pipeline

```text
video file / approved URL
  → store original
  → extract audio with FFmpeg
  → transcribe audio
  → optionally translate transcript
  → split transcript into timestamped chunks
  → summarize transcript
  → embed transcript chunks
  → store chunks in Qdrant
  → write CouchDB/Karpathy wiki video note
```

### TODO

- [ ] Add video ingest API route.
- [ ] Accept local uploaded video first.
- [ ] Keep URL downloading operator-approved only.
- [ ] Extract audio with FFmpeg.
- [ ] Transcribe with Whisper / faster-whisper / whisper.cpp.
- [ ] Store transcript model metadata.
- [ ] Split transcript into timestamped segments.
- [ ] Store transcript segments in Postgres.
- [ ] Embed transcript chunks into Qdrant.
- [ ] Write CouchDB/Karpathy wiki note.
- [ ] Add `scripts/smoke-video-ingest.mjs`.

### Transcript segment shape

```json
{
  "evidence_id": "ev_123",
  "start_ms": 120000,
  "end_ms": 145000,
  "text": "speaker says ...",
  "language": "en",
  "translated_text": null,
  "confidence": 0.91,
  "model": "whisper",
  "trust_tier": "transcript_candidate"
}
```

### Evidence warning

```text
Transcript is evidence candidate, not ground truth.
Always keep the timestamped source audio/video.
Allow human correction.
Never overwrite original media.
```

---

## 4. Phase V2 — Video to Images / Keyframes

Default to one frame every 10 seconds.

### FFmpeg default

```bash
ffmpeg -i input.mp4 -vf "fps=1/10,scale=768:-1" frames/frame-%05d.jpg
```

### TODO

- [ ] Extract 1 frame every 10 seconds.
- [ ] Cap at max 60 frames per video initially.
- [ ] Store extracted frames in SeaweedFS.
- [ ] Create `evidence_frames` rows.
- [ ] Run VLM captioning on frames.
- [ ] OCR visible text.
- [ ] Embed frame captions into Qdrant.
- [ ] Link frame timestamp to transcript segment by time overlap.
- [ ] Add manual frame-selection mode later.
- [ ] Add scene-change detection later.

### Timestamp matching rule

```text
frame.timestamp_ms BETWEEN transcript.start_ms AND transcript.end_ms
```

### Frame payload

```json
{
  "evidence_id": "ev_123",
  "frame_id": "frame_00012",
  "timestamp_ms": 120000,
  "caption": "A person stands near a vehicle.",
  "objects": ["person", "vehicle"],
  "visible_text": [],
  "tags": ["vehicle", "person", "outdoor"],
  "transcript_segment_ids": ["seg_120000_145000"]
}
```

---

## 5. Qdrant Collections

Qdrant remains the primary semantic index.

### Collections

```text
evidence_text_chunks
evidence_visual_chunks
evidence_summaries
```

### Text chunk payload

```json
{
  "evidence_id": "ev_123",
  "case_id": "case_456",
  "modality": "video",
  "view": "transcript_segment",
  "start_ms": 120000,
  "end_ms": 145000,
  "language": "en",
  "tags": ["argument", "vehicle"],
  "entities": [],
  "source_uri": "s3://evidence/videos/ev_123.mp4",
  "trust_tier": "transcript_candidate",
  "model": "whisper"
}
```

### Visual chunk payload

```json
{
  "evidence_id": "ev_123",
  "case_id": "case_456",
  "modality": "video",
  "view": "frame_caption",
  "frame_id": "frame_00012",
  "timestamp_ms": 120000,
  "objects": ["person", "vehicle"],
  "visible_text": [],
  "tags": ["vehicle", "person"]
}
```

### TODO

- [ ] Create collection contract docs.
- [ ] Add payload schema validation.
- [ ] Add Qdrant health check.
- [ ] Add Qdrant dry-run mode.
- [ ] Add Qdrant payload coverage panel.
- [ ] Add failure fallback: write Postgres job warning if Qdrant unavailable.

---

## 6. Neo4j GraphRAG Evidence Layer

### Nodes

```text
(:Evidence)
(:TranscriptSegment)
(:Frame)
(:Image)
(:DocumentChunk)
(:Entity)
(:Tag)
(:Case)
(:Person)
(:Location)
(:Event)
```

### Edges

```text
(:Case)-[:HAS_EVIDENCE]->(:Evidence)
(:Evidence)-[:HAS_SEGMENT]->(:TranscriptSegment)
(:Evidence)-[:HAS_FRAME]->(:Frame)
(:TranscriptSegment)-[:MENTIONS]->(:Entity)
(:Frame)-[:DEPICTS]->(:Entity)
(:Frame)-[:ALIGNS_WITH]->(:TranscriptSegment)
(:Evidence)-[:TAGGED]->(:Tag)
(:Evidence)-[:SUPPORTS]->(:Event)
(:Evidence)-[:CONFLICTS_WITH]->(:Evidence)
```

### TODO

- [ ] Add Evidence/Segment/Frame/Entity nodes.
- [ ] Add timestamp alignment edges.
- [ ] Add support/conflict edges.
- [ ] Add graph trace output.
- [ ] Add evidence Pentagon Search.
- [ ] Add graph health panel in dashboard.

---

## 7. CouchDB / Karpathy Wiki Notes

For every evidence item, write a wiki note.

### Wiki note shape

```md
# Video Evidence Note: <title>

## Summary

## Timeline

- 00:00–00:30 ...
- 00:30–01:00 ...

## Transcript Highlights

## Keyframes

- 00:02:00 frame_00012: person near vehicle

## Entities

## Tags

## Retrieval Links

- Qdrant points
- Neo4j nodes
- SeaweedFS assets
```

### Redis keys

```text
wiki:evidence:{evidenceId}
evidence:summary:{evidenceId}
evidence:timeline:{evidenceId}
```

### TODO

- [ ] Write CouchDB note after transcript summary.
- [ ] Update note after frame analysis.
- [ ] Add hash-based no-op updates.
- [ ] Link note to Knowledge Base Manager.
- [ ] Add stale note detector.
- [ ] Add wiki note preview UI.

---

## 8. Redis Hot Cache

Redis is fast cache, not truth.

### Suggested keys

```text
evidence:job:{jobId}
evidence:summary:{evidenceId}
evidence:timeline:{evidenceId}
evidence:frame-analysis:{frameHash}
evidence:transcript:{transcriptHash}
qdrant:query:{queryHash}
ace:ctx:{cacheKey}
gpu:autoencoder:centroids_64
```

### TODO

- [ ] Cache recent transcript summaries.
- [ ] Cache recent frame/VLM analysis.
- [ ] Cache evidence timeline.
- [ ] Cache query plans.
- [ ] Cache ACE context packs.
- [ ] Add TTL policy.
- [ ] Add cache hit/miss dashboard metrics.

---

## 9. TurboVec Lane

TurboVec is optional acceleration, not canonical storage.

### Use TurboVec for

```text
local fast matching
encoded64 experiments
feature/video/frame cluster experiments
offline vector smoke tests
cache warming
```

### Do not use TurboVec for

```text
canonical evidence metadata
case/evidence permissions
audit logs
original files
operator decisions
```

### 10M documents / frames note

TurboVec may help for 10M-scale local vector experiments, but 10M-scale production search requires more than a fast Rust vector call:

```text
chunk IDs
payload filters
case permissions
timestamp metadata
source URIs
audit logs
dedupe
rebuild strategy
human correction
```

Keep Qdrant primary.

### Video-frame scale estimate

```text
1 hour video   = 360 frames at 1 frame / 10 seconds
100 hours      = 36,000 frames
1,000 hours    = 360,000 frames
10M frames     = very large archive scale
```

### TODO

- [ ] Keep canonical vectors in Qdrant.
- [ ] Export selected vectors to TurboVec sidecar.
- [ ] Benchmark TurboVec on frame captions.
- [ ] Benchmark TurboVec on transcript chunks.
- [ ] Compare Qdrant vs TurboVec latency.
- [ ] Use TurboVec only as sidecar accelerator if it wins.

---

## 10. Hyper-Semantic Multi-Query Search

### Query flow

```text
user query
  → Gemma4 query planner
  → expand:
      semantic query
      exact keyword query
      entity query
      timeline query
      visual query
  → Qdrant:
      evidence_text_chunks
      evidence_visual_chunks
      evidence_summaries
  → Neo4j:
      evidence graph expansion
  → Redis:
      hot summaries / cached query plans
  → RRF merge
  → MARCO / LangExtract / Gemma rerank
  → ACE compact context pack
  → Gemma4 final answer
```

### TODO

- [ ] Add Gemma4 evidence query planner.
- [ ] Add multi-query expansion.
- [ ] Search transcript chunks.
- [ ] Search visual frame captions.
- [ ] Search evidence summaries.
- [ ] Expand via Neo4j graph.
- [ ] Merge with RRF.
- [ ] Rerank with MARCO/LangExtract/Gemma.
- [ ] Build ACE evidence context packet.
- [ ] Emit trace for each retrieval lane.

---

## 11. Agentic Workflow Tracking

### Tables or equivalents

```text
evidence_workflow_runs
evidence_workflow_steps
```

### Run states

```text
queued
running
waiting_for_operator
completed
failed
skipped
degraded
```

### Step examples

```text
register_original
extract_audio
transcribe_audio
split_transcript
extract_frames
caption_frames
embed_text
embed_visual
write_qdrant
write_neo4j
write_wiki_note
quality_check
```

### Dashboard should show

- [ ] Current step
- [ ] Duration
- [ ] Warnings
- [ ] Errors
- [ ] Cache hits
- [ ] Qdrant writes
- [ ] Neo4j writes
- [ ] Wiki note link
- [ ] Retry button
- [ ] Cancel button
- [ ] Re-run from failed step

---

## 12. Subagents / Services

Use TypeScript services/MCP tools first.

### Subagents

```text
video-ingestor
transcript-agent
vision-agent
evidence-normalizer
embedding-agent
graph-agent
summary-agent
retrieval-agent
quality-agent
```

### TODO

- [ ] Define each subagent as a TypeScript service first.
- [ ] Expose safe MCP tools later.
- [ ] Add operator-gated write tools only where needed.
- [ ] Keep LangGraph deferred until workflows become conditional/checkpointed.
- [ ] Keep Hermes as operator UI, not processing runtime.

---

## 13. SvelteKit 2 UI Features

### Routes

```text
/admin/knowledge-base
/admin/evidence-ingestion
/admin/evidence/:id/timeline
/admin/evidence/:id/frames
/admin/evidence/:id/transcript
/admin/evidence/search
/admin/workflows
```

### Components

```text
KnowledgeBaseManager.svelte
EvidenceWorkflowTracker.svelte
VideoTimelineViewer.svelte
TranscriptSegmentList.svelte
FrameGrid.svelte
EvidenceSearchPanel.svelte
GraphTracePanel.svelte
QdrantPayloadInspector.svelte
WikiNoteViewer.svelte
UploadDiagnosticsPanel.svelte
RetryFailedStepButton.svelte
```

---

## 14. SvelteKit 2 UI Reliability: Broken Buttons / Upload Failures

Because buttons sometimes do not work and uploads fail, add a dedicated UI reliability pass.

### Common causes to check

- [ ] `on:click` handler removed during Svelte 5/runes migration.
- [ ] Button is inside a form and defaults to `type="submit"`.
- [ ] Submit button triggers navigation before async handler finishes.
- [ ] Component event dispatcher changed or was not forwarded.
- [ ] Modal closes before upload promise resolves.
- [ ] Store update does not refresh card list after upload success.
- [ ] `enhance` action returns but UI does not invalidate data.
- [ ] Missing `await invalidateAll()` or targeted `invalidate(...)`.
- [ ] Auth/session cookie mismatch.
- [ ] File size exceeds server/body limit.
- [ ] FormData key mismatch.
- [ ] Server route expects `uploaded_by` or `user_id` type that differs from DB.
- [ ] Upload API returns success but card list query is stale.
- [ ] Background job queued but UI expects immediate processed result.

### Button standards

- [ ] Every non-submit button must use `type="button"`.
- [ ] Every submit button must have visible loading state.
- [ ] Disable button while request is in flight.
- [ ] Show errors inline.
- [ ] Use one source of truth for loading/error/success.
- [ ] Add `data-testid` for Playwright.
- [ ] Add toast or status region after action.

### Upload standards

- [ ] Validate file type client-side.
- [ ] Validate file size client-side.
- [ ] Validate file type server-side.
- [ ] Validate file size server-side.
- [ ] Use `FormData`.
- [ ] Store original first.
- [ ] Return durable `evidence_id` immediately.
- [ ] Queue processing job.
- [ ] UI should show `queued/running/completed/failed`.
- [ ] Refresh evidence card list after successful registration.
- [ ] Do not wait for transcription/frame analysis before showing upload success.

### SvelteKit upload fix checklist

- [ ] Inspect `src/routes/api/evidence/upload/+server.ts`.
- [ ] Inspect upload component.
- [ ] Verify FormData field names match.
- [ ] Verify response includes new evidence ID.
- [ ] After success, call `invalidateAll()` or invalidate the evidence list route.
- [ ] Add optimistic UI row with `status=queued`.
- [ ] Add polling/SSE for processing state.
- [ ] Add Playwright test for upload → card appears.
- [ ] Add Playwright test for failed upload → error shown.
- [ ] Add Playwright test for button click not submitting wrong form.

### Playwright tests

```text
tests/evidence-upload.spec.ts
tests/evidence-buttons.spec.ts
tests/evidence-workflow-tracker.spec.ts
```

Test cases:

- [ ] Upload valid file shows queued card.
- [ ] Upload invalid type shows error.
- [ ] Upload too-large file shows error.
- [ ] Upload button disables while uploading.
- [ ] Upload modal does not close before response unless success.
- [ ] Card list refreshes after success.
- [ ] Retry button calls failed-step API.
- [ ] Cancel button marks workflow cancelled.
- [ ] Timeline tab loads transcript segments.
- [ ] Frames tab loads extracted frames.

---

## 15. Best First Implementation

Start with:

```text
V1 transcript-first video ingestion + workflow tracker
```

Then:

```text
V2 frames every 10 seconds + VLM captions
```

Then:

```text
V3 Qdrant multi-query search over transcript + frames
```

Then:

```text
V4 Neo4j evidence GraphRAG
```

Then:

```text
V5 TurboVec sidecar acceleration
```

---

## 16. Immediate Commit Sequence

### Commit 1

```text
docs(evidence): add SvelteKit LLM-wiki evidence ingestion plan
```

### Commit 2

```text
fix(ui): harden evidence upload button and refresh behavior
```

### Commit 3

```text
feat(evidence): add transcript-first video ingest job model
```

### Commit 4

```text
feat(evidence): transcribe and index video transcript chunks
```

### Commit 5

```text
feat(evidence): extract keyframes and index visual captions
```

### Commit 6

```text
feat(search): add hyper-semantic evidence multi-query search
```

### Commit 7

```text
feat(graph): add evidence GraphRAG timeline edges
```

---

## 17. Final Recommendation

Start small and reliable:

```text
upload works
workflow tracking works
original media is stored
transcript-first ingestion works
Qdrant transcript search works
wiki note is generated
```

Only after that:

```text
keyframes
VLM analysis
Neo4j evidence graph
TurboVec sidecar
CUDA/encoded64 optimization
LangGraph background coordination
```

Keep the production spine:

```text
Postgres = truth
SeaweedFS = files
Qdrant = semantic retrieval
Neo4j = graph reasoning
Redis = hot cache
CouchDB = wiki notes
Gemma4 = planning/synthesis
SvelteKit = UI/API
Hermes = operator workspace
```
