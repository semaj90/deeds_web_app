# Hermes Agent Roadmap — Suggestions & Recommendations
**Generated: 2026-05-11 | Stack: Hermes :8642 + TRACE MCP :8788 + SvelteKit :5173**

---

## 1. What Hermes Can Already Do (Current Stack)

| Category | Capability | Status |
|---|---|---|
| Retrieval | Qdrant ANN semantic search (768-dim codebase_chunks) | ✅ live |
| Retrieval | Cluster summary lenses (Redis SOM + Qdrant topo tags) | ✅ live |
| Retrieval | Redis topology / Karpathy authority scores | ✅ live |
| Retrieval | CouchDB MapReduce views (karpathy_wiki by_cluster) | ✅ live |
| Retrieval | Karpathy wiki notes (cluster/retrieval/playbook/research/directory) | ✅ live |
| Graph | Redis import graph expansion (fan-in/fan-out from graphify) | ✅ live |
| Inference | Pipeline gap detection (5 states including autoencoder weights) | ✅ live |
| Synthesis | assembleContext → Gemma4 / Hermes prose | ✅ live |
| Prefilter | Encoded cluster prefilter 768→64 (boost/enforce/shadow modes) | ✅ live |
| Graph | Real Neo4j Cypher expansion (1–3 hop) | 🔧 PR ready |

---

## 2. Tool Rename (Immediate — Honesty Fix)

**Current name is misleading:** `neo4j_expand_neighborhood` in the executor does NOT run Cypher.
It reads Redis `code:graph:file:*` import-graph cache.

**Proposed split:**
```
deep_import_graph_expand   — Redis import-graph cache (fan-in/fan-out, current implementation)
neo4j_expand_neighborhood  — Real Cypher 1–3 hop expansion (new, bolt://localhost:7687)
```

---

## 3. Batch Processing Tasks (High Value, Low Risk)

### 3A. Batch Embedding Backfill
- Scroll all Qdrant `codebase_chunks_768` points missing `som_cluster` payload field
- Run k-means via GPU, write cluster IDs back in batches of 200
- Script: `npm run graphify:full` already does this; expose as Hermes `repair` tool
- **Est. effort**: wire existing script as RabbitMQ job `graph.cluster.backfill`

### 3B. Batch Karpathy Wiki Generation
- For every directory missing a `DirectoryNote` in CouchDB, generate one via Gemma4
- Feed into `karpathy_wiki_lookup` immediately
- Script: `npm run graphify:agents` → `karpathy:gpu`
- **Est. effort**: 1–2h; schedule nightly via `ace:startup:heavy_last_run` gate

### 3C. Batch Evidence Embedding
- Evidence items uploaded but not yet in `evidence_items` Qdrant collection
- Scroll Postgres `evidence` table, compare against Qdrant point count
- Gap items: re-run Stage 4 of evidence pipeline (embed → dual-store)
- Queue via RabbitMQ `document.embed` (already wired)

### 3D. Batch Research Summary Synthesis
- `research_summaries` rows with null `manifold4` — run `projectTo4D` via topology-projection
- `npm run graphify:manifold4-backfill` (create if missing)
- Enables semantic manifold navigation in ACE Stage 2

### 3E. Batch Autoencoder Training
- Collect 768-dim embeddings from `codebase_chunks_768` (need ≥256 points)
- Train 768→256→64 two-layer encoder via GRPO or simple Adam on reconstruction loss
- Write W1/b1/W2/b2 to Redis `ace:autoencoder:weights`, `ace:autoencoder:meta`
- Unlocks: encoded-cluster prefilter with real cluster scores (currently Xavier placeholder)
- **Gate**: `AUTOENCODER_WEIGHTS_TRAINED` state in HMM pipeline checker

---

## 4. GPU / CUDA Graph Creation & Clustering

### 4A. K-Means with CUDA (already wired, expose to Hermes)
- `tensorrt_bridge.node:kmeansWithCentroids` — 100× faster than CPU for n≥256
- Hermes `repair` mode should offer `run_gpu_clustering` tool that triggers:
  1. Scroll Qdrant for all 768-dim embeddings
  2. Run GPU k-means (k=20, 100 iterations)
  3. Write centroids to Redis `gpu:autoencoder:centroids_64_meta`
  4. Update `som_cluster` payload in Qdrant batch

### 4B. SOM Topology (already wired, add Hermes visibility)
- `trainSOM` from tensorrt_bridge — 2D grid topology for graph layout
- Currently runs in `graphify:full` pipeline
- Expose as read-only tool: `som_topology_stats` → returns grid dimensions, BMU assignments, neighbor counts

### 4C. Attention-Weighted PageRank
- `attentionScoreGPU(probe, 768, embeddings, n)` — scores files by relevance to a query
- Currently used only in `karpathy-gpu-enrich.mjs`
- Wire into Hermes `analyze` mode: `attention_rank_files({ query, topN })` tool
- Returns: top-N files by attention score, for focused ACE context

### 4D. CUDA Graph Capture (Future)
- Record static inference graph for repeated Gemma4 queries (same prompt prefix)
- Eliminates per-call CUDA kernel launch overhead (~10ms saved per call)
- **Blocker**: needs TensorRT-LLM ≥0.10 with explicit CUDA graph API

### 4E. Hyperedge Weight Recomputation
- `run-hypergraph.ts` builds 4D hyperedges; weights decay without refresh
- Schedule nightly recompute for edges with age > 24h (Redis TTL signal)
- Queue via RabbitMQ `vector.index` exchange

---

## 5. Language Analysis for Rapid Prototyping (KAG → DAG)

### 5A. Programming Language Distribution from KAG
- Neo4j query: `MATCH (f:CodebaseFile) RETURN f.language, count(*) ORDER BY count DESC`
- Feed into KAG: "what languages are used?" → semantic answer with file counts
- Tag-cluster approach: Qdrant `topTags` per cluster already has language tags (ts, svelte, py, go)
- **New tool**: `language_distribution` → returns language→file count map from Qdrant cluster tags

### 5B. DAG Hit Analysis by Language
- When DAG hits a cluster containing Go files (gRPC services), suggest Go templates
- When DAG hits TypeScript server files, suggest SvelteKit route scaffolding
- Playbook notes in `karpathy_wiki` should record language-specific fix patterns
- **New tool**: `playbook_lookup_by_language({ language, symptom })` → filters PlaybookNotes

### 5C. Cross-Language Import Boundary Detection
- Current `codebase_dynamic_import_trace` stub → wire to actual `dual-embedder.ts` which tracks `@vite-ignore` patterns
- Detect TS→Go gRPC boundaries, TS→Python sidecar calls, WASM→JS bridges
- Surface as Hermes `debug` tool: `import_boundary_trace({ from_language, to_language })`

### 5D. Rapid Scaffolding from Cluster Templates
- When a query maps to cluster #12 (gRPC clients), emit a code template
- Template library in CouchDB `karpathy_wiki` as `ResearchNote` type with `codeAreas`
- Hermes `analyze` mode: query → cluster → template suggestion → Gemma4 fills in specifics

---

## 6. Video Downloader + Transcriber Pipeline (New Feature)

### Architecture
```
URL (YouTube / MP4 / Vimeo)
  → yt-dlp sidecar (Python, RabbitMQ queue: media.download)
  → FFmpeg audio extraction (WAV 16kHz mono)
  → Whisper transcription (whisper.cpp or faster-whisper, RabbitMQ: media.transcribe)
  → Raw transcript → legal-chunker.ts (ARTICLE/SECTION/§ aware)
  → Embed chunks → Qdrant evidence_items collection
  → PostgreSQL: insert evidence row (evidence_type='video', source_url=URL)
  → CouchDB: RetrievalNote recording the transcript source
```

### Recommended Implementation Order
1. **Queue infrastructure**: add `media.download` + `media.transcribe` to RabbitMQ exchanges (alongside existing 7 queues)
2. **yt-dlp sidecar**: Python script, invoked via RabbitMQ consumer, output path in SeaweedFS `legal-evidence` bucket
3. **Whisper integration**: `faster-whisper` with `large-v3` on RTX 3060 Ti (~10× realtime for video < 1hr)
4. **Transcript chunker**: extend `legal-chunker.ts` to recognize transcript timestamps `[00:23:45]` as section boundaries
5. **UI**: `/evidence/upload` → add URL input tab alongside file drop zone
6. **Hermes tool**: `media_ingest({ url, timestampChunking: true })` queues the job and returns a job_id

### Notes Timestamp IDs
- Chunk ID format: `{evidence_id}_{ISO_timestamp}_{chunk_index}` e.g. `abc123_20260511T143000_042`
- Stored as Qdrant payload field `timestamp_id`
- Enables queries like: "what was said at 14:30?" → Qdrant filter `timestamp_id ≥ 20260511T143000`
- CouchDB view: `by_timestamp_id` → range scans over transcript chunks by time window

---

## 7. Prosecutor Workflow Features

### 7A. Case Creation from Evidence
- **Input**: video URL + uploaded documents + person names
- **Hermes action**: `create_case_from_evidence({ sources[], caseTitle })` → triggers batch pipeline
  1. Download/transcribe media
  2. OCR documents
  3. NER: extract persons, dates, locations, statutes, amounts
  4. Build case graph: Person→Event→Evidence edges in Neo4j
  5. Auto-generate case summary via Gemma4
- **Output**: populated case in Postgres + Neo4j subgraph

### 7B. Evidence Cross-Reference
- **Hermes tool**: `cross_reference_evidence({ evidenceId, caseIds[] })` 
- Runs Qdrant ANN search across all listed cases
- Returns: matching chunks with case ID, similarity score, shared entity overlap
- Useful for: "has this fingerprint appeared in another case?"

### 7C. Case Opinion & Judgment Retrieval
- **Collection**: `legal_documents` (Qdrant) already holds legal documents
- **New subtype**: `opinion`, `judgment`, `statute_interpretation`
- **Hermes tool**: `find_similar_opinions({ facts, chargeCode })` 
  → embed facts → ANN in legal_documents filtered by `doc_type: opinion`
  → return top-5 with citation, outcome, similarity
- Cross-reference with `legal_precedents` Postgres table (already exists)

### 7D. Previous Case Pattern Matching
- PlaybookNotes in Karpathy wiki can store prosecutor playbooks:
  `symptom: "defendant claims alibi"` → `retrievalRoute: "check_cell_tower_evidence"` → `resolution: "tower ping at scene"`
- **Hermes `analyze` mode**: `playbook_lookup({ symptom })` → returns fix attempts from prior cases
- Build the playbook automatically from closed case outcomes (post-verdict annotation)

### 7E. Timeline Auto-Construction
- Input: all evidence chunks for a case
- NER: extract date/time entities from each chunk
- Sort by timestamp, cluster by location/actor
- Output: `TimelineEvent[]` (schema already exists in `courtroom-types.ts`)
- **Hermes tool**: `build_case_timeline({ caseId })` → returns timeline JSON + confidence

---

## 8. Mock Trial Simulator

### Architecture (builds on existing courtroom/ infrastructure)
```
Case data (evidence + timeline + persons)
  ↓
SceneIntent JSON (Zod-validated — already specified in courtroom-types.ts)
  ↓
Deterministic scene compiler (TS — NOT LLM-generated code)
  ↓
  ├─ Lane A: 2D legal timeline viewer (existing /demos/crime-reconstruction)
  ├─ Lane B: Gemma4 plays roles (prosecution / defense / judge / witness)
  ├─ Lane C: Blender Mixamo animation (existing courtroom_models table)
  └─ Lane D: WebGPU low-poly viewer (existing Threlte/Three.js scaffold)
```

### Gemma4 Role Assignments
- **Prosecution**: given evidence + charges → generates opening statement, questions
- **Defense**: given same + playbook of defenses → cross-examines, challenges evidence
- **Judge**: moderates, applies evidence rules (hearsay, chain of custody)
- **Witness**: given deposition text → answers questions staying in character
- **Jury simulation**: 12 independent Gemma4 calls with different temperature → vote + rationale

### Interaction Loop
```
prosecutor_agent → object | ask_question | present_evidence
  → judge_agent validates (admissibility gate)
  → witness_agent responds OR defense_agent objects
  → score updated: {prosecution: N, defense: N}
  → verdict when rounds exhausted or motion granted
```

### New Hermes Tools Needed
| Tool | Mode | Description |
|---|---|---|
| `trial_init({ caseId })` | analyze | loads case, assigns roles, returns session_id |
| `trial_turn({ session_id, actor, action, content })` | analyze | one turn of examination |
| `trial_verdict({ session_id })` | analyze | jury simulation, returns probability + rationale |
| `evidence_admissibility({ evidenceId, rule })` | analyze | checks FRE rule (hearsay, chain of custody) |

### Prosecutor Prep Mode (lighter weight)
- **Before trial**: run mock cross-examination on prosecution witnesses
- Gemma4 plays aggressive defense attorney, prosecutor practices responses
- Records weak answers → generates PlaybookNote for that witness/topic
- Accessible via: `POST /api/ai/hermes-run { aceMode: "analyze", userQuery: "mock cross-examine witness Jane Doe on alibi evidence" }`

---

## 9. Semantic Notes Pipeline (notes_id_timestamp)

### Raw Notes → Searchable Knowledge
```
Input: text/audio/video note (any format)
  ↓
Transcribe (Whisper) / OCR (Tesseract) / parse text
  ↓
Chunked by semantic boundaries (existing legal-chunker.ts)
  ↓
Embed 768-dim (embeddinggemma:latest)
  ↓
Qdrant collection: prosecutor_notes
  Point ID format: {note_id}_{unix_timestamp_ms}
  Payload: { note_id, timestamp, source_type, case_id, tags[], raw_text }
  ↓
CouchDB: RetrievalNote linking query→chunk trail for future recall
  ↓
Hermes `search` tool: natural language → note chunks → answer + citations
```

### Query Examples Enabled
- "What did I note about the defendant's alibi on May 3rd?" → timestamp filter + ANN
- "Show me all notes mentioning 'cell tower' across all cases" → ANN no filter
- "Summarize my notes from last week's depositions" → date-range scroll + Gemma4 synthesis
- "Find contradictions between my notes and the defense's discovery documents" → dual ANN + diff

### ID Scheme
```
note_id: {caseId_slug}_{YYYYMMDD}_{sequence}   e.g. smith_v_jones_20260503_007
timestamp_chunk_id: {note_id}_{HH:MM:SS}_{chunk_index}
```

---

## 10. Priority Order (Recommended)

| Priority | Item | Effort | Value |
|---|---|---|---|
| P1 | Autoencoder training batch job (unlocks prefilter) | 3h | High — prefilter now noise |
| P1 | Tool rename: deep_import_graph_expand + real neo4j_expand_neighborhood | 1h | Honesty / debuggability |
| P1 | Video ingest queue (yt-dlp + Whisper) | 8h | Core prosecutor workflow |
| P2 | Prosecutor notes pipeline (notes_id_timestamp → Qdrant) | 4h | Daily workflow |
| P2 | Language distribution + playbook_by_language tools | 2h | KAG/DAG rapid proto |
| P2 | Cross-reference evidence Hermes tool | 3h | Case building |
| P3 | Timeline auto-construction from NER | 4h | Case structure |
| P3 | Opinion/judgment retrieval tool | 2h | Legal precedent |
| P3 | Batch manifold4 backfill | 1h | Search quality |
| P4 | Mock trial simulator (Lane B text-only first) | 12h | High value, complex |
| P4 | CUDA graph capture for repeated inference | 6h | Latency optimization |
| P5 | 3D trial visualization (Lane C/D) | 20h+ | Demonstrative evidence |

---

## 11. Immediate Code Actions (this session)

- [x] Rename `neo4j_expand_neighborhood` executor to use real Karpathy file paths (done)
- [x] Split into `deep_import_graph_expand` (Redis) + `neo4j_expand_neighborhood` (Cypher)
- [x] Add `neo4j_expand_neighborhood` real Cypher handler using `getNeo4jDriver()`
- [ ] Add `AUTOENCODER_WEIGHTS_TRAINED` to HMM (done this session)
- [ ] Create `npm run graphify:autoencoder:train` script wrapper
- [ ] Add `media.download` + `media.transcribe` RabbitMQ queues to queue manager

---

*This document is a living roadmap. Update after each major feature lands.*