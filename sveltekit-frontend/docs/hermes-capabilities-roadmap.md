# Hermes Agent — Capabilities Roadmap for Legal AI Platform

> Generated: 2026-05-11 | Platform: Hermes v0.13.0 + Gemma4-hermes-64k (64K ctx) + RTX 3060 Ti

---

## Codebase Inventory — Agents for Codebase Indexing

> `rg` + `awk` sweep across `src/` — what already exists, what Hermes skills can wrap TODAY.

### Status legend: ✅ full · ⚠️ partial · ❌ missing

---

### 1. Video Download + Transcript ⚠️ partial

| File | What it does |
|------|-------------|
| `src/lib/server/retrieval/youtube-transcript.ts` | 3-strategy pipeline: `youtube-transcript` pkg → Firecrawl markdown → Firecrawl audio |
| `src/routes/api/knowledge/youtube/+server.ts` | Ingestion endpoint — calls `fetchYouTubeTranscript()`, chunks result, embeds to `knowledge_base` Qdrant |

**Gap:** No `yt-dlp` for non-YouTube URLs, no Whisper integration for video (only audio — see §2). No `video_transcripts` Qdrant collection — transcripts go into `knowledge_base` with no timestamp payload.

**Hermes skill to wire:** `transcribe-video` → `fetchYouTubeTranscript(url)` → legal-chunker → embed → upsert `knowledge_base` with `{ note_id, video_id, timestamp_start, timestamp_end }` payload.

---

### 2. Audio Transcription / Whisper ✅ full

| File | What it does |
|------|-------------|
| `src/routes/api/whisper/transcribe/+server.ts` | Whisper transcription endpoint |
| `src/lib/server/workers/audio-processor.ts` | `enrichTranscription()` — post-Whisper: NER + RAG search + graph neighbors + Gemma4 summary |
| `src/routes/api/audio/search/+server.ts` | Segment-level + transcript-level semantic search (dual mode: `precise`/`coarse`) |
| `src/lib/server/db/schema-postgres.ts` | Tables: `whisperSegments` (`start_time`, `end_time`, `text`, `confidence`), `audioTranscripts` |

**Hermes skill to wire:** `transcribe-audio(evidenceId)` → POST `/api/whisper/transcribe` → returns `{ segments[], entities[], summary }`. Already production-ready; just needs a named Hermes skill.

---

### 3. Prosecutor Notes ❌ missing

`caseNotes` table exists in schema but: no API endpoints, no embed pipeline, no Qdrant collection, no UI.

**Build plan:** `prosecutor_notes` table (Drizzle) + `/api/notes` CRUD + embed on save → Qdrant `prosecutor_notes` → Hermes skill `add-note` / `search-notes`.

---

### 4. Mock Trial / Courtroom Simulation ✅ full

| File | What it does |
|------|-------------|
| `src/lib/courtroom/courtroom-types.ts` | `CourtroomCharacter` (prosecutor/defense/judge/witness), `CourtroomView`, `ANIMATION_TYPES` (idle/speaking/objection/gesture/point/react) |
| `src/lib/courtroom/courtroom-scene.svelte.ts` | Babylon.js 3D scene manager (1556 LoC) |
| `src/lib/courtroom/timeline-engine.svelte.ts` | Keyframe-driven playback — `TimelineKeyframe { timeMs, characterRole, animType, cameraView, dialogueTurn }` |
| `src/routes/(app)/demos/courtroom-sim/+page.svelte` | Phoenix Wright-style demo UI |
| `src/routes/api/simulation/+server.ts` | Simulation session endpoints |
| `src/lib/components/courtroom/StrategyWizard.svelte` | 4-step strategy builder (RAG→KAG→Semantic→LLM chain) |

**Missing for multi-agent Hermes loop:** Multi-agent session orchestration (prosecutor session / defense session / judge session each with isolated ACE context), FRE rules system prompt, RabbitMQ `trial.turn` queue for turn serialization.

---

### 5. Case Similarity / Precedent Cross-Reference ✅ full

| File | What it does |
|------|-------------|
| `src/routes/api/cases/[id]/similar/+server.ts` | Multi-modal similar-case search |
| `src/routes/api/precedents/search/+server.ts` | Precedent search endpoint |
| `src/routes/api/cases/cluster/+server.ts` | Case clustering |
| `src/lib/server/ml/multi-modal-ranker.ts` | 5-source blend: vector (40%) + tag Jaccard (20%) + k-means topic (20%) + Neo4j graph centrality (15%) + user history (5%) |
| `src/lib/components/legal/SimilarCasesPanel.svelte` | UI component |

**Hermes skill to wire:** `find-precedents({ caseId, query, jurisdiction? })` → POST `/api/precedents/search` → ranked list with distinguishing factors. Already works; just needs a named skill.

---

### 6. Timeline Extraction ⚠️ partial

| File | What it does |
|------|-------------|
| `src/routes/api/cases/[id]/timeline/+server.ts` | Case activity timeline (who/what/why/how) |
| `src/routes/api/persons-of-interest/[id]/timeline/+server.ts` | POI-specific timeline |
| `src/routes/api/cartridge/timeline/+server.ts` | Graph-based timeline (CHR97 cartridge) |
| `src/lib/components/legal/CaseTimeline.svelte` | Timeline UI |
| `src/lib/components/legal/CustodyTimeline.svelte` | Chain-of-custody timeline |
| `src/lib/db/schema/evidence.ts` | `timelineEvents` table — `{ id, type, title, actor, method, reason, timestamp, metadata }` |

**Gap:** No LLM-driven extraction from raw text/transcripts into `TimelineEvent[]`. Events are manually inserted — no "extract timeline from this deposition" pipeline.

**Hermes skill to wire:** `timeline-extract(text, caseId)` → Gemma4 structured output → Zod `TimelineEvent[]` → batch INSERT → return ordered timeline.

---

### 7. FRE / Objection Rules ⚠️ partial

`courtroom-types.ts` has `'objection'` animation. `schema-postgres.ts` `relationTypeEnum` includes: `hearsay`, `privileged`, `inadmissible`, `expert`, `circumstantial`, `direct_evidence`.  Evidence type enum has: `hearsay`, `expert`, `scientific`, `demonstrative`, `testimonial`.

**Gap:** No FRE rule engine — no lookup table, no reasoning over Rule 401/403/802/804/901 etc. Objection is an animation state, not a legal ruling.

**Build plan:** Load FRE rules as static JSON → system prompt injection for judge Hermes session → `fre_lookup({ argument })` tool returns applicable rule + ruling tendency.

---

### 8. Exhibit Numbering ❌ missing

`evidence.evidenceNumber` field exists (e.g. "EV-001") but no auto-sequencing, no per-case numbering, no exhibit register API.

**Build plan:** `/api/cases/[id]/exhibits/next` → Redis `INCR case:{id}:exhibit_seq` → return `"Exhibit ${n}"`. 10-line endpoint.

---

### 9. Batch Processing / Embed ✅ full

| File | What it does |
|------|-------------|
| `src/lib/server/batch-embedder.ts` | Auto-windowed batch embedding (batch=32, 50ms window) |
| `src/lib/server/evidence/batch-entity-embedder.ts` | `batchEmbedAndStoreEntities()` — GPU batch → Qdrant `evidence_items` (100–500 entities/sec) |
| `src/lib/server/evidence/batch-entity-storer.ts` | `batchStoreEntities()` — Drizzle multi-row INSERT |
| `src/lib/server/legal/ingestion-worker.ts` | Batch document ingestion worker |

**Hermes skill to wire:** `batch-ingest(folderPath)` → walks folder → per-file RabbitMQ `document.embed` publish → polls progress → returns ingestion summary.

---

### 10. Video / Audio Timestamp Search ✅ full

`src/routes/api/audio/search/+server.ts` — dual mode:
- `precise`: segment-level Qdrant search, returns `{ startMs, endMs, text, confidence }` per hit
- `coarse`: transcript-level, returns document summary

Collection: `audio_segments` (768-dim). Supports case-scoped filter via `case_id` payload.

**Hermes skill to wire:** `search-recordings({ query, caseId, mode })` → POST `/api/audio/search` → returns timestamped clips. Wire to `/evidence/[id]/view` player seek.

---

### 11. Witness / Cross-Examination ⚠️ partial

| File | What it does |
|------|-------------|
| `src/routes/api/ai/cross-exam/+server.ts` | Generate cross-exam questions: `{ text, purpose, expectedAnswer, followUp }[]` + strategy |
| `src/lib/components/yorha/CrossExaminationAssistant.svelte` | Cross-exam UI component |
| `src/lib/courtroom/courtroom-types.ts` | `'witness'` character role with `speaking`/`objection` animations |
| `src/routes/api/persons-of-interest/[id]/timeline/+server.ts` | Includes `witness_statement` relation type |

**Gap:** No deposition transcript → witness persona pipeline. Mock trial witness speaks from animation states, not from actual deposition content.

**Build plan:** Deposition PDF → Whisper/OCR → embed → witness Hermes session gets deposition as context → answers cross-exam questions in-character.

---

### 12. Verdict Prediction / Case Scoring ✅ full

| File | What it does |
|------|-------------|
| `src/routes/api/ai/case-scoring/+server.ts` | `CaseScore { score 0–100, riskLevel, factors[], recommendations[] }` — evidence (40) + witness (24) + documentation (15) + status (10) |
| `src/routes/api/ai/case-prediction/+server.ts` | Case outcome prediction endpoint |
| `src/lib/components/ai/CaseScoringDashboard.svelte` | Scoring dashboard |
| `src/lib/components/CaseOutcomePrediction.svelte` | Outcome prediction UI |
| `src/routes/(app)/demos/case-prediction/+page.svelte` | Live demo |

**Hermes skill to wire:** `score-case(caseId)` → GET `/api/ai/case-scoring` → returns score + recommended actions. Runs after every evidence upload.

---

### Hermes Skill → Existing API Mapping (wire TODAY, no new code)

| Hermes skill | Existing endpoint | Est. wire time |
|-------------|------------------|---------------|
| `transcribe-audio` | `POST /api/whisper/transcribe` | 30 min |
| `find-precedents` | `POST /api/precedents/search` | 30 min |
| `search-recordings` | `POST /api/audio/search` | 30 min |
| `cross-examine` | `POST /api/ai/cross-exam` | 30 min |
| `score-case` | `GET /api/ai/case-scoring/[id]` | 30 min |
| `similar-cases` | `GET /api/cases/[id]/similar` | 30 min |
| `batch-ingest` | RabbitMQ `document.embed` publish | 2h |

### Still Needs Building (new code required)

| Feature | Gap | Effort |
|---------|-----|--------|
| Prosecutor notes | Table + API + embed pipeline | 2 days |
| FRE rule engine | Static JSON rules + judge system prompt | 1 day |
| Exhibit auto-numbering | Redis INCR + API endpoint | 2h |
| Timeline extraction from text | Gemma4 structured output → `TimelineEvent[]` | 1 day |
| Deposition → witness persona | PDF→Whisper→witness Hermes session | 2 days |
| Multi-agent trial orchestration | Isolated ACE contexts + RabbitMQ turn queue | 3 days |
| Non-YouTube video (`yt-dlp`) | Binary wrapper + `video_transcripts` collection | 1 day |

---

## What Hermes Already Unlocks (Day 1)

Hermes is an **agentic orchestration layer** on top of Ollama. It adds:
- **Persistent memory** (sessions, embeddings, history across restarts)
- **Skill system** (reusable named workflows triggered by slash-commands or API)
- **MCP tool surface** (TRACE :8788 tools + 42 registered tools available to the model)
- **Scheduled jobs** (Cron syntax, folder-open triggers, idle triggers)
- **Gateway API** (:8642/v1 — OpenAI-compatible, routes to gemma4-rotorquant:latest)
- **Workspace UI** (React UI at :3000 — Skills, Sessions, Memory, Jobs browser)

---

## Priority Queue: What to Build Next

### TIER 1 — Batch Processing (unlocks everything else)

| # | Feature | Hermes role | Est. effort |
|---|---------|-------------|-------------|
| 1 | **Batch document ingestion skill** | `hermes skill create ingest-evidence` triggers the 8-stage evidence pipeline for a folder of PDFs/images | 1 day |
| 2 | **GPU cluster rebuild on schedule** | Cron skill: `graphify:full` every night → SOM + k-means + PageRank → Redis centroids → ACE ready next morning | 2h |
| 3 | **Karpathy authority refresh** | Cron skill: `karpathy:gpu:dirty` on every folder open (incremental, 30s) | done — wire to Hermes cron |
| 4 | **Parallel evidence chunking worker** | Hermes job dispatches RabbitMQ `document.embed` messages → 8 concurrent chunk+embed+Qdrant-index workers | 1 day |
| 5 | **Batch cross-reference scanner** | POST case IDs → Hermes skill → KAG traversal → returns statute/case citation graph per evidence item | 1 day |

### TIER 2 — Graph + CUDA Analysis

| # | Feature | Hermes role | Est. effort |
|---|---------|-------------|-------------|
| 6 | **True Neo4j Cypher expansion tool** | `neo4j_expand_neighborhood({ startNodeIds, labels, maxHops, limit })` — live Cypher 1–3 hop traversal for evidence, cases, statutes, persons | 1 day |
| 7 | **CUDA k-means on new evidence** | Skill: embed new evidence batch → `kmeansWithCentroids` GPU call → assign `som_cluster` tags → Qdrant payload update | 1 day |
| 8 | **Hyperedge rebuild trigger** | Post-ingest hook: if new_chunks > 50 → publish `hg:rebuild` → `run-hypergraph.ts` standalone (out-of-process, avoids OOM) | 2h |
| 9 | **Graph similarity for case matching** | `graphSimilarity(caseEmbedding, allCaseEmbeddings)` via `tensorrt_bridge.node` → top-5 similar prior cases surfaced in Hermes response | 1 day |
| 10 | **PageRank daily refresh** | Cron: `run-pagerank.ts` → `couchdb:pagerank_scores` (6h TTL) → feeds Karpathy blend → ACE authority scores update | done — wire to Hermes cron |

### TIER 3 — Language Analysis for Rapid Prototyping (KAG→DAG)

| # | Feature | Hermes role | Notes |
|---|---------|-------------|-------|
| 11 | **KAG hit → DAG job planner** | Hermes receives KAG retrieval hits → ranks by DAG dependency order → emits ordered fix/task list | Uses existing `document-dag.ts` |
| 12 | **Programming language detector** | Skill: analyze repo file tree → detect dominant language patterns → emit "switch X to Y for rapid prototype" recommendations (e.g. prototype in Python, harden in TS) | Uses tsgo + file extension heuristics |
| 13 | **Schema drift detector** | Hermes skill: compare Drizzle schema vs live Postgres `information_schema` → emit ALTER TABLE plan ranked by DAG dependency order | Uses existing DB introspection |
| 14 **ACE error-to-fix loop** | Hermes reads tsgo diagnostics JSON → KAG traversal for related files → DAG orders fixes → emits PR-ready patch plan | Uses `tsgo-diagnostics-to-jsonb.mjs` |

---

## The Big Ones: Prosecutor Workflow

### A. Video Downloader + Transcriber → Searchable Notes

**Pipeline:**
```
URL (YouTube / court recording / news clip)
  → yt-dlp download (mp4/mp3)
  → Whisper transcription (word-level timestamps)
  → Legal chunker (STATEMENT / TESTIMONY / EXHIBIT / OBJECTION sections)
  → Embed chunks → Qdrant `video_transcripts` collection
  → notes schema: { note_id, video_id, timestamp_start, timestamp_end, speaker?, content, chunk_embedding }
  → Semantic search: "find all mentions of defendant near Exhibit 3"
```

**Hermes role:** Skill `transcribe-video` — takes URL → runs pipeline → returns searchable note IDs. The prosecutor queries: *"find all mentions of 'chain of custody' in deposition videos"* → Hermes returns timestamped clips + transcript excerpts.

**New Qdrant collection needed:** `video_transcripts` (768-dim, payload: `{ note_id, video_id, timestamp_ms, speaker, section_type }`)

**Effort:** 3 days (yt-dlp + Whisper.cpp/OpenAI Whisper + chunker extension + new collection)

---

### B. Raw Notes → Semantically Searched Notes

**Current gap:** Prosecutors take handwritten/dictated notes but can't cross-reference them.

**Pipeline:**
```
Raw text (paste / voice / OCR scan)
  → Gemma4-legal: extract entities (persons, dates, statutes, case refs, exhibits)
  → Structure: { note_id, created_at, case_id, entities[], content, embedding }
  → Qdrant `prosecutor_notes` + Postgres `prosecutor_notes` table
  → Semantic query: "notes mentioning Exhibit 7 and defendant's alibi"
  → Cross-ref: "find prior case notes where this statute was argued"
```

**Hermes skill:** `add-note` (voice/text) → `search-notes` → `cross-ref-note` (find similar notes across all cases).

**Effort:** 2 days (Drizzle table + Qdrant collection + Hermes skill + UI widget)

---

### C. Case Builder (create + collect evidence)

**What Hermes enables:**
- Skill `create-case` → validated form → Postgres `cases` insert → RabbitMQ `evidence.process` queue initialized
- Skill `add-evidence` → upload + pipeline trigger → returns chunk summary + cluster assignment
- Skill `case-brief` → KAG traversal for all case evidence → Gemma4 synthesis → returns 2-page case brief
- Skill `find-gaps` → HMM inference on evidence clusters → "you have no financial records for the 2023 window"

---

### D. Cross-Reference Engine (prior cases, opinions, judgements)

**What Hermes enables:**
```
New case facts
  → embed → Qdrant `legal_cases` similarity search (top-10 prior cases)
  → Neo4j: RELATED_CASE, CITES_STATUTE, FOLLOWED_BY_OPINION edges
  → CouchDB PageRank: which precedents carry most authority?
  → Gemma4: "Case X is most analogous because..."
  → Returns: ranked precedent list + distinguishing factors + key quotes
```

**Hermes skill:** `find-precedents({ caseId, query, jurisdiction? })` — returns annotated precedent list with similarity scores and distinguishing factors.

**Missing pieces:** `RELATED_CASE` Neo4j edges (need to run after case embedding), `legal_cases` Qdrant collection (exists), citation parser for PDFs (already in legal-chunker).

**Effort:** 2 days

---

### E. Mock Trial Simulator

**What Hermes enables:**

```
Participants:
  - Prosecutor agent  (Gemma4, ACE context = prosecution evidence)
  - Defense agent     (Gemma4, ACE context = defense evidence + exculpatory)
  - Judge agent       (Gemma4, rules of evidence + jurisdiction config)
  - Witness agents    (Gemma4, persona = deposition transcripts)

Flow:
  1. Opening statements (each agent generates from their ACE context)
  2. Direct examination (prosecutor → witness, turn-by-turn)
  3. Cross-examination  (defense → witness, challenges inconsistencies)
  4. Objections         (judge rules using FRE + jurisdiction rules)
  5. Closing arguments
  6. Verdict analysis   (judge: "based on weight of evidence...")
```

**Hermes role:** Orchestrates multi-agent turn loop. Each agent is a separate Hermes session with its own ACE context window. Judge session has FRE rules loaded as system prompt.

**RabbitMQ queue:** `trial.turn` → serializes turn order, prevents simultaneous speech.

**XState machine:** `trial-machine.ts` (states: `setup → opening → examination → objection → closing → verdict`)

**This already has a foundation:** `src/lib/courtroom/` (1556 LoC), existing `courtroom_models` + `courtroom_animations` tables, detective UI components.

**Missing:** Multi-agent Hermes session orchestration + FRE rules loader + turn serializer.

**Effort:** 1 week (biggest, most impactful)

---

## Quick Wins (< 1 day each)

| # | Feature | Command |
|---|---------|---------|
| W1 | Auto-summarize new evidence on upload | Hook `evidence.process` queue → Gemma4 summary → store in `evidence.summary` field |
| W2 | "What's missing from this case?" | Hermes skill using HMM gap inference + evidence cluster analysis |
| W3 | Statute lookup by keyword | Hermes skill → KAG `legal_glossary` + `statute_chunks` → top-5 relevant statutes |
| W4 | Deposition timeline builder | Extract date/time entities from transcript notes → ordered `TimelineEvent[]` |
| W5 | Exhibit numbering assistant | Hermes tracks exhibit_id sequence per case → prevents duplicates, suggests next ID |
| W6 | Objection guide | During trial prep: prosecutor types planned argument → Hermes returns likely objections + FRE rules |
| W7 | Verdict predictor | Given evidence clusters + prior similar cases + judge history → confidence score |
| W8 | Audio recording transcriber | Whisper.cpp (CUDA-accelerated on RTX 3060 Ti) → court hearing recordings → searchable |

---

## Hermes Tool Additions Needed (for the above)

```typescript
// Add to TOOL_HANDLERS in hermes-executor.ts:

// T1: True Neo4j Cypher expansion
neo4j_expand_neighborhood({ startNodeIds, labels?, maxHops, limit })

// T2: Video transcript search
video_transcript_search({ query, caseId?, speakerFilter?, limit })

// T3: Prosecutor notes search
notes_semantic_search({ query, caseId?, dateRange?, entityFilter? })

// T4: Prior case similarity
case_similarity_search({ caseId, topK, jurisdictionFilter? })

// T5: FRE objection lookup
fre_lookup({ argument, jurisdiction? })  // Federal Rules of Evidence

// T6: Timeline event extraction
timeline_extract({ text, caseId })

// T7: Trial turn generator (mock trial)
trial_turn({ sessionId, role, aceContextPacket })
```

---

## Recommended Build Order

```
Week 1:  Batch processing (T1-T5) + Video transcriber (A)
Week 2:  Raw notes pipeline (B) + Cross-reference engine (D)  
Week 3:  Case builder skills (C) + Quick wins (W1-W8)
Week 4:  Mock trial simulator (E) — builds on all prior work
```

---

## Architecture Note: Hermes vs Direct API

| Use case | Use Hermes skill | Use direct /api route |
|----------|-----------------|----------------------|
| Multi-step workflow (ingest → embed → index → notify) | ✓ | |
| Single atomic operation (search, fetch, insert) | | ✓ |
| Scheduled/recurring work | ✓ | |
| Interactive prosecutor queries | ✓ | |
| UI form submission | | ✓ |
| Batch overnight processing | ✓ | |

**Rule:** If the task has > 2 steps or needs memory across calls → Hermes skill. If it's one atomic DB/Qdrant call → SvelteKit API route.

---

## Current Hermes Stack Health

| Service | Port | Status |
|---------|------|--------|
| Ollama (GPU) | :11434 | ✓ running |
| Hermes gateway | :8642 | ✓ auto-start on login |
| TRACE MCP | :8788 | check: `hermes gateway status` |
| Hermes Workspace UI | :3000 | start via Desktop shortcut |
| SvelteKit dev | :5173 | `npm run dev` |
| `/api/ai/hermes-run` | :5173 | ✓ plan→execute→synth wired |
