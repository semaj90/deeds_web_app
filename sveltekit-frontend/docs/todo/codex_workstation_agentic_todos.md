# Codex Workstation Prompt + TODOs for Local Legal-AI HyperRAG Node

**Target repo:** `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`  
**Target machine:** Windows 10 Home + WSL2 + Docker Desktop + Intel 10th-gen i7 + RTX 3060 8GB + 20GB RAM  
**Purpose:** Give Codex / Claude Code / Gemma4 a safe, bounded prompt and TODO plan for continuing the Legal-AI workstation build.

---

## 1. Workstation Architecture Name

Use this name in docs and prompts:

```txt
Single-Workstation Legal-AI HyperRAG Node
```

or:

```txt
Cold-Corpus / Hot-Context Legal-AI Workstation
```

Core idea:

```txt
Do not keep the whole corpus, all Docker services, Gemma4, OCR, embeddings, graph jobs, and Vite hot at the same time.

Use profiles:
  interactive
  ingestion
  graph/topology
  full-smoke
```

---

## 2. Stack Roles

| Layer | Tool | Role |
|---|---|---|
| UI/API | SvelteKit 2 | SSR-first hybrid MPA and browser-safe API boundary |
| UI state | Svelte 5 runes | Local component reactivity only |
| Forms | Superforms v2 + Zod | Validation, uploads, progressive enhancement |
| Durable truth | Postgres + Drizzle | Cases, evidence, files, workflow ledger, metadata envelopes |
| Object storage | SeaweedFS | PDFs, images, OCR artifacts, Docling outputs |
| Hot cache | Redis / Valkey | ACE context packets, workflow status, centroid cache |
| Dense retrieval | Qdrant | Vector recall over chunks, docs, evidence, AGENTS cards |
| Graph topology | Neo4j + APOC/GDS | KAG/DAG graph paths, PageRank, communities |
| Wiki/index pages | CouchDB | Karpathy wiki, AGENTS cards, MapReduce rollups |
| Offline analytics | DuckDB | Reconciliation across Postgres/Qdrant/Neo4j/CouchDB exports |
| Background jobs | RabbitMQ | OCR, extraction, embedding, indexing, graph updates |
| Document parsing | Docling + Granite-Docling | PDF/image/page to structured Markdown/JSON/layout |
| Structured extraction | LangExtract worker | Entities, events, claims, crime signals |
| Reasoning | Gemma4 / TurboQuant | Planning, legal analysis, synthesis |
| Embeddings | EmbeddingGemma | Retrieval vectors only |
| Prefilter | TurboVec | Optional compressed ANN prefilter, not canonical |
| Agent memory | Engram | Optional episodic agent/operator memory, not canonical |
| Model tool surface | TRACE MCP | Allowlisted model-facing tools |
| GPU bridge | LibTorch / CUDA / N-API | Optional canary rerank/vector math with CPU fallback |

---

## 3. Non-Negotiable Rules

```txt
Do not add new datastores.
Do not add SurrealDB, MongoDB, LanceDB, Spark, or Kafka.
Do not run broad drizzle push.
Do not change identity strategy.
Do not bypass HyperRagFusionService.
Do not call Qdrant, Neo4j, Redis, TurboVec, Gemma4, gRPC, or workers from the browser.
Do not expose raw apply_patch, shell, delete, or schema mutation tools to Gemma4.
Do not make Engram canonical.
Do not make TurboVec canonical.
Do not store raw KV cache, GPU tensors, RoPE tensors, native pointers, or hidden reasoning.
Do not state guilt as fact in legal outputs.
All legal outputs are draft / review-required.
```

---

## 4. Canonical Retrieval Boundary

All app-facing retrieval must go through:

```txt
src/lib/server/retrieval/hyperrag-fusion-service.ts
POST /api/search/hyperrag
```

Retrieval flow:

```txt
Browser/Admin UI
  → SvelteKit API
  → HyperRagFusionService
  → Qdrant dense/KAG recall
  → optional TurboVec prefilter
  → Redis ACE/cache hints
  → Neo4j graph authority/path expansion
  → GPU rerank canary if enabled
  → cluster coherence boost
  → optional Gemma4 synthesis
```

---

## 5. Current Runtime Reality

Known current runtime decisions:

```txt
/api/files
  = canonical uploaded_files route

/api/evidence/upload
  = legacy evidence pipeline, delegates storage/uploaded_files creation to shared upload-file-service

SeaweedFS
  = local object storage, not MinIO

Gemma4
  = reasoning/generation model

EmbeddingGemma
  = embedding model, separate from Gemma4

Gemma4 ONNX
  = remote E2B/LiteRT path, no local merged static Gemma4 ONNX artifact

Gemma3 270M ONNX
  = lightweight local client fallback asset

TurboQuant / llama-server.exe
  = native local server-side fallback on :8090

TRACE MCP
  = model-facing tool server, single owner for trace.kag_search
```

---

## 6. Development Profiles

### Interactive profile

Use for coding, UI, search, chat:

```txt
Docker:
  Postgres
  Redis
  Qdrant
  Neo4j
  CouchDB

Native/local:
  TurboQuant / llama-server.exe
  TRACE MCP
  Go retrieval if needed
  Vite / SvelteKit
```

### Ingestion profile

Use for upload/OCR/extraction:

```txt
Docker:
  Postgres
  Redis
  RabbitMQ
  SeaweedFS
  Qdrant

Workers:
  Docling worker
  LangExtract worker
  embedding worker
```

### Graph/topology profile

Use for Karpathy/GraphRAG/topology:

```txt
Docker:
  Postgres
  Redis
  Qdrant
  Neo4j
  CouchDB

Scripts:
  agents:write
  graphify:semantic
  graphify:topology
  hypergraph:build
  DuckDB reconciliation
```

### Full-smoke profile

Use briefly:

```txt
npm run dev:gpu
npm run smoke:hyperrag
npm run smoke:atlas
npm run smoke:legal-analysis
npm run smoke:agent-workflow
```

---

## 7. How to Check Docker and Runtime

Run from:

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
```

### Docker containers

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Postgres

```powershell
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "select now();"
```

### Redis

```powershell
docker exec legal-ai-valkey valkey-cli -a redis ping
```

### Qdrant

```powershell
curl http://127.0.0.1:6333/collections
```

### SeaweedFS S3

```powershell
curl http://127.0.0.1:8333
```

### llama-server / TurboQuant

```powershell
node scripts/ensure-llama-server.mjs
curl http://127.0.0.1:8090/health
```

### TRACE MCP

```powershell
node scripts/ensure-mcp-server.mjs --spawn
node scripts/ensure-mcp-server.mjs
curl http://127.0.0.1:8788/health
```

### Dev runtime assets

```powershell
node scripts/ensure-dev-runtime.mjs dev
```

### Full GPU dev boot

```powershell
npm run dev:gpu
```

---

## 8. Agent Workflow Layer

Add a safe plan-first workflow layer.

Files:

```txt
src/lib/server/agents/gemma4-plan-schema.ts
src/lib/server/agents/agent-workflow-types.ts
src/lib/server/agents/agent-workflow-orchestrator.ts
src/routes/api/agents/workflow/+server.ts
tests/unit/agent-workflow-orchestrator.test.ts
tests/routes/api/agents/workflow.test.ts
docs/architecture/agentic-workflow-layer.md
```

Modes:

```txt
plan_only
execute_safe_tools
queue_jobs
operator_approval
```

Allowed tools:

```txt
hyperrag.search
trace.kag_search
trace.explain_retrieval
topology.search_near
evidence.get_case_summary
evidence.list_evidence
legal.search_statutes
legal.match_elements
workflow.get_status
workflow.queue_safe_job
```

Rejected tools:

```txt
unknown tools
write tools
delete tools
external send/export without approval
raw shell
apply_patch
drizzle push
schema mutation
```

---

## 9. Gemma4 Planning Contract

Gemma4 should emit JSON plans first.

Example:

```json
{
  "workflowType": "detective_analysis",
  "steps": [
    {
      "id": "retrieve_case_context",
      "kind": "retrieve_context",
      "tool": "hyperrag.search",
      "args": {
        "query": "timeline persons events possible crimes",
        "mode": "legal"
      },
      "safety": "read_only",
      "reason": "Need case context before analysis."
    },
    {
      "id": "extract_entities",
      "kind": "queue_job",
      "queue": "evidence.langextract",
      "args": {
        "evidenceIds": ["ev_123"]
      },
      "safety": "background_job",
      "reason": "Need structured entities and events."
    }
  ],
  "needsHumanReview": true,
  "warnings": ["AI output is draft and requires legal review."]
}
```

Validate with Zod before execution.

---

## 10. Docling + LangExtract Pipeline

```txt
/api/evidence/upload
  → shared upload-file-service
  → SeaweedFS + uploaded_files
  → RabbitMQ evidence.docling
  → Docling / Granite-Docling parses PDF/image/page
  → evidence.langextract
  → LangExtract extracts entities/events/claims/crime signals
  → TypeScript normalizer
  → KAG projection
  → Postgres metadata_envelopes
  → Qdrant semantic payloads
  → Neo4j graph paths
  → Redis ACE context
```

---

## 11. LangExtract TypeScript Bridge TODO

Files:

```txt
src/lib/server/extraction/langextract-types.ts
src/lib/server/extraction/langextract-client.ts
src/lib/server/extraction/legal-extraction-normalizer.ts
tests/unit/langextract-client.test.ts
tests/unit/legal-extraction-normalizer.test.ts
```

Validation logic:

```txt
✓ valid request POSTs to /extract
✓ timeout returns controlled error
✓ non-200 returns controlled error
✓ fail-open wrapper returns empty extraction with warning
✓ result validates against Zod schema
✓ confidence clamped 0..1
✓ evidenceRefs preserved
✓ missing evidenceRefs creates warning
✓ unsupported entity type maps to unknown
✓ deterministic IDs generated from text/type/evidenceRef
```

---

## 12. KAG Projection TODO

Files:

```txt
src/lib/server/kag/kag-projection-service.ts
src/lib/server/kag/kag-edge-types.ts
tests/unit/kag-projection-service.test.ts
```

Projection targets:

```txt
Postgres:
  metadata_envelopes

Qdrant:
  evidence chunk payloads

Neo4j:
  Evidence / Entity / Event / Claim / CrimeSignal / Statute edges

Redis:
  ace:evidence:extract:{evidenceId}
  ace:case:entities:{caseId}
  ace:case:timeline:{caseId}
  ace:ctx:{cacheKey}
```

Validation logic:

```txt
✓ dryRun writes nothing
✓ creates metadata_envelope payload
✓ prepares Qdrant payload update
✓ prepares Neo4j edge batch
✓ prepares Redis cache key
✓ handles empty extraction
✓ invalid evidence refs become warnings
```

---

## 13. ACE / BitFrost Cache TODO

Files:

```txt
src/lib/server/ace/ace-context-writer.ts
src/lib/server/ace/ace-context-reader.ts
tests/unit/ace-context-writer.test.ts
```

Cache packet:

```json
{
  "cacheKey": "llmctx_abc",
  "caseId": "case_123",
  "evidenceIds": ["ev_123"],
  "chunkIds": ["chunk_1", "chunk_2"],
  "entityIds": ["entity_1"],
  "eventIds": ["event_1"],
  "graphPaths": ["Evidence->Event->Entity->CrimeElement"],
  "toolPolicy": "read_only",
  "summary": "The evidence suggests a timeline involving...",
  "createdAt": "2026-05-14T00:00:00Z"
}
```

Validation logic:

```txt
✓ writes ace:ctx packet
✓ preserves chunkIds/entityIds/eventIds/graphPaths
✓ Redis unavailable falls back to Postgres/local JSON
✓ cache packet never stores raw tensors/KV cache
```

---

## 14. Engram Memory TODO

Files:

```txt
src/lib/server/memory/engram-memory-source.ts
tests/unit/engram-memory-source.test.ts
```

Use Engram for:

```txt
operator decisions
agent lessons
what failed
what worked
case workflow notes
prompt fixes
retrieval failures
```

Do not use Engram for:

```txt
canonical evidence
PDF chunks
Qdrant vectors
Neo4j topology truth
Postgres metadata truth
```

Projection:

```txt
Engram memory
  → metadata_envelope
  → Qdrant agent_memory_summaries
  → Neo4j (:AgentMemory)
  → Redis recent memory
  → Daily Activity Atlas
```

Validation logic:

```txt
✓ Engram unavailable fails open
✓ memory result maps to agent_memory_summaries shape
✓ low boost applied
✓ not treated as canonical evidence
```

---

## 15. GPU / LibTorch / N-API TODO

Files:

```txt
src/lib/server/ai/libtorch-reranker.ts
src/lib/server/retrieval/hyperrag-fusion-service.ts
tests/unit/libtorch-reranker.test.ts
```

Rules:

```txt
GPU rerank is canary only.
Native addon load must be guarded.
CPU fallback must work.
API must strip vectors from response.
Do not require GPU rerank for search success.
```

Validation logic:

```txt
✓ missing .node addon does not crash import
✓ CPU fallback path works
✓ GPU rerank signal appears only when enabled
✓ vectors stripped from API response
```

---

## 16. Libraries Needed

### Node / TypeScript

```txt
zod
amqplib
@types/amqplib
ioredis
neo4j-driver
@qdrant/js-client-rest
pg
drizzle-orm
```

Optional:

```txt
@modelcontextprotocol/sdk
langchain
@langchain/langgraph
```

### Python workers

```txt
docling
transformers
torch
pillow
fastapi
uvicorn
pydantic
aio-pika
httpx
```

Optional:

```txt
lexnlp
spacy
rapidfuzz
onnxruntime-gpu
cupy
```

### Native / GPU

```txt
libtorch
CUDA Toolkit
TensorRT
node-addon-api
cmake-js
node-gyp
```

---

## 17. Validation Commands

Targeted tests:

```powershell
npx vitest run tests/unit/langextract-client.test.ts
npx vitest run tests/unit/kag-projection-service.test.ts
npx vitest run tests/unit/agent-workflow-orchestrator.test.ts
npx vitest run tests/unit/engram-memory-source.test.ts
npx vitest run tests/unit/ace-context-writer.test.ts
```

Route tests:

```powershell
npx vitest run tests/routes/api/agents/workflow.test.ts
npx vitest run tests/routes/api/legal/analyze-crime.test.ts
npx vitest run tests/routes/api/evidence/upload.test.ts
```

Smoke:

```powershell
npm run smoke:hyperrag
npm run smoke:atlas
npm run smoke:legal-analysis
npm run smoke:agent-workflow
npm run smoke:docling
npm run smoke:langextract
```

Runtime:

```powershell
node scripts/ensure-dev-runtime.mjs dev
node scripts/ensure-llama-server.mjs
node scripts/ensure-mcp-server.mjs
npm run dev:gpu
```

---

## 18. Implementation TODO Checklist

### Phase A — Docs and prompt

```txt
[ ] Add this doc under docs/architecture/codex-workstation-agentic-todos.md
[ ] Link from docs/AGENTS.md
[ ] Link from master stack checklist
```

### Phase B — Agent plan schema

```txt
[ ] Add gemma4-plan-schema.ts
[ ] Add agent-workflow-types.ts
[ ] Add agent-workflow-orchestrator.ts
[ ] Add /api/agents/workflow plan_only route
[ ] Add tests for invalid/unknown/destructive plans
```

### Phase C — LangExtract bridge

```txt
[ ] Add langextract-types.ts
[ ] Add langextract-client.ts
[ ] Add legal-extraction-normalizer.ts
[ ] Add fail-open behavior
[ ] Add tests
```

### Phase D — KAG projection

```txt
[ ] Add kag-projection-service.ts
[ ] Add dryRun=true default
[ ] Prepare Postgres metadata_envelope payload
[ ] Prepare Qdrant payload update
[ ] Prepare Neo4j edge batch
[ ] Prepare Redis cache packet
[ ] Add tests
```

### Phase E — ACE cache

```txt
[ ] Add ace-context-writer.ts
[ ] Add extraction-aware context packet
[ ] Preserve graphPaths/entityIds/eventIds/chunkIds
[ ] Ensure no raw tensors/KV cache are written
[ ] Add tests
```

### Phase F — Engram

```txt
[ ] Add engram-memory-source.ts
[ ] Fail open if Engram unavailable
[ ] Map memory to low-weight HyperRAG lane
[ ] Project selected memories to metadata_envelopes/Qdrant/Neo4j/Redis later
[ ] Add tests
```

### Phase G — Workers

```txt
[ ] Add workers/docling-worker contract
[ ] Add workers/langextract-worker contract
[ ] Add RabbitMQ queue names
[ ] Add dry-run worker mode
[ ] Add worker contract tests
```

### Phase H — Product service

```txt
[ ] Add CrimeAnalysisService
[ ] Add /api/legal/analyze-crime
[ ] Use HyperRagFusionService only
[ ] Preserve facts/allegations/inferences/unknowns
[ ] Add caveats
[ ] Add tests
```

---

## 19. Codex / Claude Code / Gemma4 Prompt

```txt
You are working in:
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Task:
Add the ACE Agentic Workflow Layer for Legal-AI as a safe plan-first orchestrator with LangExtract/KAG integration.

Context:
This is a Single-Workstation Legal-AI HyperRAG Node.
SvelteKit 2 is the SSR/API gateway.
HyperRagFusionService is canonical retrieval.
Gemma4 is planner/synthesizer, not an embedding model.
EmbeddingGemma remains the embedding lane.
Docling/Granite parses PDFs into structured document text/layout.
LangExtract extracts legal/evidence entities, events, claims, and crime signals.
Postgres/Qdrant/Neo4j/Redis are the KAG mutual-index stores.
RabbitMQ queues long-running extraction/indexing jobs.
Engram is optional episodic agent memory, not canonical storage.

Rules:
- Do not add new datastores.
- Do not add SurrealDB, MongoDB, LanceDB, Spark, or Kafka.
- Do not bypass HyperRagFusionService.
- Do not call gRPC or sidecars from the browser.
- Do not execute Gemma4 tool plans without Zod validation.
- Do not expose raw apply_patch, raw shell, delete, or schema mutation tools.
- Do not state guilt as fact.
- Keep all legal outputs draft/review-required.
- Everything optional must fail open.
- Start in dry-run mode.
- Do not write to Qdrant/Neo4j unless dryRun=false.

Implement first:
1. src/lib/server/agents/gemma4-plan-schema.ts
2. src/lib/server/agents/agent-workflow-types.ts
3. src/lib/server/agents/agent-workflow-orchestrator.ts
4. src/routes/api/agents/workflow/+server.ts
5. tests/unit/agent-workflow-orchestrator.test.ts
6. tests/routes/api/agents/workflow.test.ts
7. docs/architecture/agentic-workflow-layer.md

Then implement:
1. src/lib/server/extraction/langextract-types.ts
2. src/lib/server/extraction/langextract-client.ts
3. src/lib/server/extraction/legal-extraction-normalizer.ts
4. src/lib/server/kag/kag-projection-service.ts
5. src/lib/server/memory/engram-memory-source.ts
6. src/lib/server/ace/ace-context-writer.ts

Return:
- summary of files changed
- commands run
- tests passed/failed/skipped
- blockers
- next commit message
```

---

## 20. Recommended Commit Sequence

```txt
1. docs(architecture): add Codex workstation agentic TODOs
2. feat(agents): add Gemma4 plan-only workflow orchestrator
3. test(agents): reject unsafe workflow plans
4. feat(extraction): add LangExtract TypeScript bridge
5. test(extraction): validate extraction normalization
6. feat(kag): add dry-run KAG projection service
7. feat(ace): write extraction-aware context packets
8. feat(memory): add optional Engram memory source
9. feat(workers): add Docling and LangExtract worker contracts
10. feat(legal): add crime analysis service contract
```
