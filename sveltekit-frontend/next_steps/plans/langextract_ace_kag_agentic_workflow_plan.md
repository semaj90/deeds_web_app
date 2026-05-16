# ACE Agentic Workflow + LangExtract + KAG/DAG Integration Plan

**Target repo:** `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`  
**Target stack:** SvelteKit 2, Gemma4/TurboQuant, HyperRAG, ACE/BitFrost, Redis, Qdrant, Neo4j, Postgres, CouchDB, SeaweedFS, RabbitMQ, Docling/Granite, optional Engram.

---

## 1. Executive Summary

This design adds a safe agentic workflow layer on top of the existing Legal-AI / HyperRAG stack.

```txt
Evidence upload
  → SeaweedFS object storage
  → Postgres uploaded_files + evidence records
  → RabbitMQ workflow job
  → Docling / Granite-Docling document parsing
  → LangExtract structured extraction
  → KAG/DAG projection into Postgres + Qdrant + Neo4j + Redis
  → HyperRAG Fusion Service
  → Gemma4 JSON planner / structured legal analysis
  → ACE / BitFrost context cache
  → Engram optional agent memory
```

The most important rule:

```txt
Do not let Gemma4 directly mutate the system.
Gemma4 proposes plans.
Zod validates plans.
TRACE MCP / server services execute only approved safe tools.
RabbitMQ handles long-running jobs.
Postgres records workflow truth.
```

---

## 2. Component Roles

| Component | Role | Canonical? | Notes |
|---|---|---:|---|
| SvelteKit 2 | SSR/API gateway | Yes | Browser calls pages/actions/API routes only. |
| Postgres | Durable truth | Yes | Cases, evidence, uploaded_files, workflow_runs, metadata_envelopes. |
| SeaweedFS | Local object storage | Yes for files | PDFs, OCR artifacts, Docling output, frame exports. |
| RabbitMQ | Background jobs | Yes for jobs | OCR, extraction, embedding, indexing, graph updates. |
| Docling / Granite-Docling | Document parsing | Worker lane | PDF/image/page to Markdown/JSON/layout. |
| LangExtract | Structured extraction | Worker/sidecar lane | Entities, events, claims, crime signals. |
| Qdrant | Dense vector recall | Yes | Chunks, summaries, evidence, docs, AGENTS cards. |
| Neo4j | KAG/DAG graph topology | Yes | Evidence/entity/event/statute/route/feature relationships. |
| Redis | Hot ACE/BitFrost cache | Cache only | Context packets, cluster cards, workflow status. |
| CouchDB | Wiki / MapReduce pages | Supporting | Karpathy wiki, AGENTS docs, stitched daily pages. |
| DuckDB | Offline reconciliation | Supporting | Audit Qdrant/Postgres/Neo4j/CouchDB consistency. |
| Gemma4 | Planner/synthesizer | Reasoning model | JSON plans, legal analysis, what/who/why/how. |
| EmbeddingGemma | Embedding model | Retrieval model | Do not replace with Gemma4 MoE. |
| TurboVec | Optional ANN prefilter | No | Candidate narrowing only. |
| Engram | Optional episodic agent memory | No | Agent/operator decisions and lessons. |
| LibTorch / CUDA bridge | GPU rerank/native math | Optional canary | Guarded addon + CPU fallback. |
| N-API | Node ↔ C++ bridge | Infrastructure | Loads `.node` native addons from Node. |

---

## 3. LangExtract: Python vs TypeScript

### What LangExtract should do

LangExtract converts Docling/OCR text into structured records:

```json
{
  "entities": [],
  "events": [],
  "claims": [],
  "crimeSignals": [],
  "summary": "",
  "warnings": []
}
```

For legal/evidence workflows, it should extract people, organizations, locations, dates, statutes, cases, charges, injuries, evidence references, incident events, allegations, facts, inferences, unknowns, and crime element signals.

### Can we rewrite LangExtract in TypeScript?

Yes, but only the deterministic app-facing parts should be rewritten first.

Good TypeScript targets:

```txt
Zod schemas
normalizers
evidence reference validation
confidence bounding
entity ID generation
KAG projection
Redis cache writing
Qdrant payload shaping
Neo4j edge shaping
workflow integration
```

Do **not** immediately rewrite the ML-heavy extraction model in TypeScript. Python remains better for ML model inference, Docling integration, VLM/page extraction, PyTorch, OCR/layout/table processing, and legal NLP packages.

Best compromise:

```txt
SvelteKit TypeScript
  → LangExtractClient HTTP/gRPC
  → Python LangExtract worker
  → structured JSON result
  → TypeScript normalizer/Zod validation
  → KAG projection
```

---

## 4. Recommended File Layout

```txt
src/lib/server/extraction/
  langextract-types.ts
  langextract-client.ts
  legal-extraction-normalizer.ts

src/lib/server/kag/
  kag-projection-service.ts
  kag-edge-types.ts

src/lib/server/agents/
  gemma4-plan-schema.ts
  agent-workflow-types.ts
  agent-workflow-orchestrator.ts

src/lib/server/memory/
  engram-memory-source.ts

src/lib/server/ace/
  ace-context-writer.ts
  ace-context-reader.ts

workers/langextract-worker/
  worker.py
  requirements.txt
  Dockerfile

workers/docling-worker/
  worker.py
  requirements.txt
  Dockerfile

docs/architecture/
  langextract-kag-bridge.md
  agentic-workflow-layer.md
  granite-docling-ingestion-worker.md
```

---

## 5. TypeScript LangExtract Bridge

### `langextract-types.ts`

```ts
export type ExtractedEntity = {
  id?: string;
  type:
    | 'person'
    | 'organization'
    | 'location'
    | 'date'
    | 'time'
    | 'statute'
    | 'case'
    | 'charge'
    | 'weapon'
    | 'vehicle'
    | 'property'
    | 'medical'
    | 'digital_account'
    | 'unknown';
  text: string;
  normalized?: string;
  role?: string;
  confidence: number;
  evidenceRefs: string[];
};

export type ExtractedEvent = {
  id?: string;
  type:
    | 'incident_event'
    | 'communication'
    | 'threat'
    | 'injury'
    | 'property_damage'
    | 'entry'
    | 'theft'
    | 'arrest'
    | 'report_filed'
    | 'unknown';
  description: string;
  time?: string;
  location?: string;
  participants?: string[];
  confidence: number;
  evidenceRefs: string[];
};

export type ExtractedClaim = {
  id?: string;
  claim: string;
  kind: 'fact' | 'allegation' | 'inference' | 'unknown';
  speaker?: string;
  confidence: number;
  evidenceRefs: string[];
};

export type CrimeSignal = {
  label: string;
  jurisdiction?: string;
  statuteRef?: string;
  element?: string;
  confidence: number;
  evidenceRefs: string[];
};

export type LangExtractRequest = {
  caseId?: string;
  evidenceId: string;
  sourceType:
    | 'docling_markdown'
    | 'docling_json'
    | 'ocr_text'
    | 'transcript'
    | 'plain_text';
  text: string;
  evidenceRefs?: string[];
  schemaMode: 'legal_evidence' | 'statute' | 'case_law' | 'codebase' | 'general';
};

export type LangExtractResult = {
  evidenceId: string;
  entities: ExtractedEntity[];
  events: ExtractedEvent[];
  claims: ExtractedClaim[];
  crimeSignals: CrimeSignal[];
  summary?: string;
  warnings: string[];
  provenance: {
    langextract: boolean;
    model?: string;
    durationMs?: number;
  };
};
```

### `langextract-client.ts`

```ts
import type { LangExtractRequest, LangExtractResult } from './langextract-types';

export type LangExtractClientOptions = {
  baseUrl?: string;
  timeoutMs?: number;
};

export class LangExtractClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(opts: LangExtractClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.LANGEXTRACT_URL ?? 'http://127.0.0.1:8124';
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async extract(input: LangExtractRequest): Promise<LangExtractResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`LangExtract failed: ${res.status} ${await res.text()}`);
      }

      return (await res.json()) as LangExtractResult;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

---

## 6. Python LangExtract Worker Contract

Expose:

```txt
GET  /health
POST /extract
```

Input:

```json
{
  "caseId": "case_123",
  "evidenceId": "ev_123",
  "sourceType": "docling_markdown",
  "text": "...",
  "schemaMode": "legal_evidence"
}
```

Output:

```json
{
  "evidenceId": "ev_123",
  "entities": [],
  "events": [],
  "claims": [],
  "crimeSignals": [],
  "summary": "",
  "warnings": [],
  "provenance": {
    "langextract": true,
    "model": "langextract-legal-v1",
    "durationMs": 1234
  }
}
```

Fail-open output:

```json
{
  "evidenceId": "ev_123",
  "entities": [],
  "events": [],
  "claims": [],
  "crimeSignals": [],
  "warnings": ["LangExtract unavailable; extraction skipped"],
  "provenance": {
    "langextract": false
  }
}
```

---

## 7. KAG/DAG Projection

### Postgres

Write a durable `metadata_envelopes` record:

```json
{
  "sourceType": "langextract_result",
  "caseId": "case_123",
  "evidenceId": "ev_123",
  "entities": [],
  "events": [],
  "claims": [],
  "crimeSignals": [],
  "extractorVersion": "legal-extract-v1",
  "sourceHash": "sha256..."
}
```

### Qdrant

Attach payload references:

```json
{
  "case_id": "case_123",
  "evidence_id": "ev_123",
  "metadata_envelope_id": "env_123",
  "entity_ids": ["entity_1"],
  "event_ids": ["event_1"],
  "claim_ids": ["claim_1"],
  "crime_signals": ["unauthorized_entry"],
  "manifold4": [12, 7, 0.84, 0.31]
}
```

### Neo4j

Create graph nodes/edges:

```txt
(:Evidence)-[:HAS_ENTITY]->(:Entity)
(:Evidence)-[:HAS_EVENT]->(:Event)
(:Event)-[:INVOLVES]->(:Entity)
(:Claim)-[:SUPPORTED_BY]->(:Evidence)
(:Claim)-[:MAY_SUPPORT]->(:CrimeElement)
(:CrimeSignal)-[:MATCHES]->(:Statute)
(:Chunk)-[:HAS_QDRANT_POINT]->(:QdrantPoint)
```

### Redis / ACE

Hot keys:

```txt
ace:evidence:extract:{evidenceId}
ace:case:entities:{caseId}
ace:case:timeline:{caseId}
ace:ctx:{cacheKey}
```

---

## 8. ACE / BitFrost Context Cache

ACE should cache logical context packets, not raw KV tensors.

Context packet:

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

Store in:

```txt
Redis:
  ace:ctx:{cacheKey}

Postgres:
  llm_context_cache

Local fallback:
  .cache/ace/context-packs/{cacheKey}.json
```

Never store raw KV cache, GPU tensors, RoPE tensors, native pointers, or hidden reasoning.

---

## 9. Engram Agentic Memory

Engram is optional episodic memory.

Use it for:

```txt
operator decisions
agent lessons
what failed
what worked
case workflow notes
prompt fixes
retrieval failures
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

Suggested HyperRAG weight:

```txt
Engram boost = 0.05 to 0.10
```

---

## 10. Gemma4 Function Calling / JSON Planning

Start with validated JSON planning instead of unrestricted tool calling.

Gemma4 output:

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

Validate with Zod before executing anything.

---

## 11. AgentWorkflowOrchestrator

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

Rejected:

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

## 12. CUDA, PyTorch, LibTorch, TensorRT, and N-API

### PyTorch

Use for Python-first ML experimentation:

```txt
Docling/Granite experimentation
LangExtract model inference
GPU testing
prototype rerankers
training/fine-tuning experiments
```

### LibTorch

LibTorch is the C++ API/distribution for PyTorch-style tensor inference. Use it when you need C++ inference/reranking, CUDA tensor operations, and a native hot path without Python.

### CUDA

Use CUDA for batch cosine similarity, attention rerank, autoencoder 768→64, SOM/BMU batch assignment, and matrix operations.

### TensorRT

Use TensorRT later if you need optimized ONNX/model deployment and stable high-throughput inference. Do not add it before service contracts are stable.

### N-API

N-API is the Node.js C/C++ addon interface. Use it for TypeScript/Node calling native `.node` modules such as a LibTorch reranker or CUDA vector operator.

Always guard native addon loading:

```txt
If addon missing:
  use CPU fallback
  do not crash app import
```

---

## 13. Python vs C++ vs TypeScript vs Go

| Language | Best for | Use in this stack |
|---|---|---|
| TypeScript | API, schemas, orchestration, SSR, validation | SvelteKit, Zod, workflows, KAG projection |
| Python | ML workers, Docling, LangExtract, OCR, PyTorch | Background workers behind RabbitMQ |
| C++/CUDA | GPU kernels, LibTorch, TensorRT, reranking | Optional native bridge behind N-API |
| Go | high-concurrency sidecars, retrieval APIs, gRPC | Go retrieval/topology services |
| Rust | fast file/vector tools | Optional TurboVec / high-performance sidecars |

---

## 14. gRPC, MCP, HTTP, and RabbitMQ

| Protocol | Best use |
|---|---|
| HTTP | SvelteKit API, worker APIs, health checks |
| gRPC | Internal Go/Python/C++ service calls, never browser direct |
| MCP | Model-facing safe tool protocol through TRACE MCP |
| RabbitMQ | Long jobs: OCR, extraction, embeddings, indexing, graph updates |

---

## 15. LangGraph: Use Later, Not First

LangGraph can model state-machine agent workflows:

```txt
plan
  → retrieve
  → extract
  → graph expand
  → queue job
  → wait
  → summarize
  → human review
```

Recommended order:

```txt
1. Build AgentWorkflowOrchestrator with Zod plans.
2. Log workflow_runs and workflow_steps in Postgres.
3. Use RabbitMQ for jobs.
4. Add LangGraph adapter later if useful.
```

LangGraph should be an adapter, not the source of truth.

---

## 16. Queue Layout

```txt
evidence.docling
evidence.langextract
evidence.chunk
evidence.summarize
evidence.embed
evidence.index_qdrant
evidence.graph_edges
legal.match_statutes
legal.similar_cases
agent.memory_sync
ace.cache_rebuild
scene.reconstruct_3d
```

End-to-end:

```txt
/api/evidence/upload
  → evidence.docling
  → evidence.langextract
  → evidence.chunk
  → evidence.summarize
  → evidence.embed
  → evidence.index_qdrant
  → evidence.graph_edges
  → legal.match_statutes
```

---

## 17. Libraries Needed

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
nanoid or node:crypto
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

Optional legal extraction:

```txt
lexnlp
spacy
rapidfuzz
```

Optional GPU:

```txt
cupy
onnxruntime-gpu
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

Only use these when maintaining the native addon lane.

---

## 18. Validation Test Logic

### Unit tests

```txt
tests/unit/langextract-client.test.ts
tests/unit/legal-extraction-normalizer.test.ts
tests/unit/kag-projection-service.test.ts
tests/unit/agent-workflow-orchestrator.test.ts
tests/unit/engram-memory-source.test.ts
tests/unit/ace-context-writer.test.ts
```

### Route tests

```txt
tests/routes/api/agents/workflow.test.ts
tests/routes/api/legal/analyze-crime.test.ts
tests/routes/api/evidence/upload.test.ts
```

### Worker contract tests

```txt
tests/workers/docling-worker-contract.test.ts
tests/workers/langextract-worker-contract.test.ts
```

### Smoke tests

```txt
npm run smoke:hyperrag
npm run smoke:atlas
npm run smoke:legal-analysis
npm run smoke:agent-workflow
npm run smoke:docling
npm run smoke:langextract
```

### Key assertions

LangExtract client:

```txt
✓ valid request POSTs to /extract
✓ timeout returns controlled error
✓ non-200 returns controlled error
✓ fail-open wrapper returns empty extraction with warning
✓ result validates against Zod schema
```

Normalizer:

```txt
✓ confidence clamped 0..1
✓ evidenceRefs preserved
✓ missing evidenceRefs creates warning
✓ unsupported entity type maps to unknown
✓ deterministic IDs generated from text/type/evidenceRef
```

KAG projection:

```txt
✓ dryRun writes nothing
✓ creates metadata_envelope payload
✓ prepares Qdrant payload update
✓ prepares Neo4j edge batch
✓ prepares Redis cache key
✓ handles empty extraction
```

Agent orchestrator:

```txt
✓ invalid Gemma4 JSON rejected
✓ unknown tool rejected
✓ destructive tool rejected
✓ plan_only executes no tools
✓ queue_jobs only queues approved queues
✓ execute_safe_tools only calls allowlisted tools
✓ legal workflows include human review warning
```

ACE cache:

```txt
✓ writes ace:ctx packet
✓ preserves chunkIds/entityIds/eventIds/graphPaths
✓ Redis unavailable falls back to Postgres/local JSON
✓ cache packet never stores raw tensors/KV cache
```

Engram:

```txt
✓ Engram unavailable fails open
✓ memory result maps to agent_memory_summaries shape
✓ low boost applied
✓ not treated as canonical evidence
```

Native GPU:

```txt
✓ missing .node addon does not crash import
✓ CPU fallback path works
✓ GPU rerank signal appears only when enabled
✓ vectors stripped from API response
```

---

## 19. Development Safety Rules

```txt
Do not add new datastores.
Do not bypass HyperRagFusionService.
Do not call sidecars from browser.
Do not call gRPC from browser.
Do not execute Gemma4 plans without Zod validation.
Do not expose raw apply_patch.
Do not state guilt as fact.
Do not make Engram canonical.
Do not make TurboVec canonical.
Do not store raw KV cache, GPU tensors, or hidden reasoning.
Do not run broad drizzle push.
```

---

## 20. Recommended Commit Sequence

```txt
1. feat(extraction): add LangExtract bridge contract
2. test(extraction): validate LangExtract result normalization
3. feat(kag): project extraction results into KAG envelopes
4. feat(agents): add Gemma4 plan-only workflow orchestrator
5. feat(memory): add optional Engram memory source
6. feat(ace): write extraction-aware context packets
7. feat(workers): add Docling and LangExtract worker contracts
8. feat(workflows): queue evidence extraction jobs
9. test(workflows): add agent workflow validation gates
10. docs(architecture): document agentic extraction and KAG bridge
```

---

## 21. Claude Code / Codex / Gemma4 Prompt

```txt
You are working in:
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Task:
Add LangExtract + Engram + ACE/KAG integration as a safe bridge layer.

Context:
- Docling/Granite parses PDFs into structured document text/layout.
- LangExtract extracts legal/evidence entities, events, claims, and crime signals.
- HyperRagFusionService is canonical retrieval.
- Gemma4 is planner/synthesizer, not embedding model.
- EmbeddingGemma remains the embedding lane.
- Engram is optional episodic agent memory, not canonical storage.
- Postgres/Qdrant/Neo4j/Redis are the KAG mutual-index stores.
- RabbitMQ queues long-running extraction/indexing jobs.

Rules:
- Do not add new datastores.
- Do not bypass HyperRagFusionService.
- Do not call gRPC or sidecars from browser.
- Do not execute Gemma4 tool plans without Zod validation.
- Do not expose raw apply_patch.
- Do not state guilt as fact.
- Keep all legal outputs draft/review-required.
- Everything must fail open when optional sidecars are unavailable.

Implement:
1. src/lib/server/extraction/langextract-types.ts
2. src/lib/server/extraction/langextract-client.ts
3. src/lib/server/extraction/legal-extraction-normalizer.ts
4. src/lib/server/kag/kag-projection-service.ts
5. src/lib/server/agents/gemma4-plan-schema.ts
6. src/lib/server/agents/agent-workflow-orchestrator.ts
7. src/lib/server/memory/engram-memory-source.ts
8. docs/architecture/langextract-kag-bridge.md
9. tests/unit/langextract-client.test.ts
10. tests/unit/kag-projection-service.test.ts
11. tests/unit/agent-workflow-orchestrator.test.ts

Start in dry-run mode.
Do not write to Qdrant/Neo4j unless dryRun=false.
Return summary, files changed, tests run, blockers, and next commit message.
```

---

## 22. Final Architecture

```txt
User upload / case query
  → SvelteKit API
  → shared upload-file-service
  → SeaweedFS + uploaded_files
  → RabbitMQ
  → Docling / Granite worker
  → LangExtract worker
  → TypeScript normalizer
  → KAG projection
  → Postgres metadata_envelopes
  → Qdrant semantic index
  → Neo4j graph paths
  → Redis ACE context
  → HyperRAG Fusion Service
  → Gemma4 plan/synthesis
  → Engram optional agent memory
  → Legal-AI answer / workflow next action
```
