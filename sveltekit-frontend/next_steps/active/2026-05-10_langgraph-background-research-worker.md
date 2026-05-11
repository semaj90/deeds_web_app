# LangGraph Background Research Worker — Deferred Plan

**Status**: deferred — design doc only. Do not start until exit criteria (§9) are green.
**Created**: 2026-05-10
**Scope**: a **second** LangGraph deployment for slow conditional research workflows. Sits beside the **existing** `legal-ai-langgraph:8091` synthesis service, does not replace it.

---

## 0. What already exists (don't duplicate this)

This codebase **already runs a LangGraph container** — `legal-ai-langgraph` on port 8091, currently 7+ hours healthy. It is the **real-time synthesis path** for the chat loop:

| Property | Value |
|---|---|
| Container | `legal-ai-langgraph` (docker-compose `--profile gpu`) |
| Build context | `docker/langgraph-synthesis/` (Python + FastAPI + LangGraph + LibTorch) |
| Port | 8091 |
| Routes | `POST /synthesize`, `POST /synthesize/stream`, `GET /health`, `GET /cache/stats`, `GET /hmm/stats`, `POST /hmm/adapt` |
| Cache stack | L1 Redis exact-match → L2 Bifrost semantic → L3 LangGraph DAG |
| State | `SynthesisState = { entities, web_results, rg_results, rag_hits, kag_neighbors, kag_source, ace_context, merged_context, llm_response, confidence, retried, trace_id }` |
| LLM | `gemma4-legal-vlm:latest` via Ollama (`host.docker.internal:11434`) — auto-picks up `gemma4-hermes-64k:latest` too |
| Auto-discovers Ollama models | ✅ confirmed via `/health` |
| GPU | RTX 3060 Ti, nvidia runtime, 6 GB limit |
| Persistence | torch.compile inductor + Triton caches mounted; no graph-state checkpoint table (yet) |

**This doc is NOT about that container.** It's about a **second worker** wired to RabbitMQ for conditional branching jobs that don't belong in the request path.

---

## 1. Why a second worker (and not just extending the synth service)

The synth service has a clean contract: `query in → answer out` within a request lifetime. Adding multi-step retry / OCR fallback / external research / checkpointing to that same endpoint would:

| Problem | Why it matters |
|---|---|
| Request-path timeouts | Conditional flows can run 30s–10min. SvelteKit fetch timeouts kill them mid-DAG. |
| State leakage | The synth service is stateless (per `SynthesisState` lifetime = one request). Conditional re-entry needs persistence. |
| Coupling | Background jobs that fail shouldn't degrade chat latency. They need a separate failure boundary. |
| Concurrency limits | Synth service has 6 GB memory limit. Heavy research jobs would starve real-time chat. |

So: keep `/synthesize` for chat. Add `legal-ai-langgraph-worker` for background jobs.

---

## 2. The architecture layer this fits in

```
USER-FACING (already done)
  SvelteKit chat / Hermes Agent
    → /api/ai/intent-dispatch (TS-native intent router — Phase B ✅)
    → TRACE MCP :8788 (88 tools)

REAL-TIME SYNTHESIS (already running)
  POST :8091/synthesize
    → L1 Redis → L2 Bifrost → L3 LangGraph DAG (already a LangGraph!)
    → Gemma4 via Ollama
    → answer back in 5-30s

BACKGROUND ORCHESTRATION (this doc — DEFERRED)
  RabbitMQ queue `research.langgraph`
    → legal-ai-langgraph-worker (separate container, Postgres-checkpointed)
    → multi-step conditional flows with retries
    → result back to Postgres / Redis / Qdrant / Neo4j
    → SSE notification to UI when done
```

LangGraph belongs in **all three** of the lower two layers — but with different deployment shapes:
- Synth (`:8091`) = stateless, in-request, "fast graph"
- Worker (proposed) = stateful, queue-driven, "slow graph with checkpoints"

---

## 3. Candidate use cases (priority order)

### 3.1 Legal PDF Deep Research

```
PDF uploaded → granite-docling OCR
  → legal_section classifier (caption / facts / holding / disposition)
  → citation extraction
  → IF citation confidence < 0.7:
       fallback extraction (different prompt template)
       query CourtListener API
       ask gemma3:270m as last resort
  → build GraphRAG edges in Neo4j
  → summarize doctrine cluster (RAPTOR level 1)
  → persist RAPTOR tree to admin_raptor_summaries
```

Cannot run in `/synthesize` because: 30s–5min duration, branching depth ≥ 3, needs checkpoint at "citation resolved" boundary so re-runs don't re-OCR.

### 3.2 External Research Validation

```
user asks "what's the standard for hearsay in CA 9th Circuit"
  → local KAG search via kag.multi_lane_search (already exists)
  → IF local evidence count < 3 OR confidence < 0.6:
       query SearXNG (already wired in research-cache)
       query Context7 official docs
       trust-tier rank results
       compare against legal corpus chunks
       IF information_gain > threshold:
         write ResearchNote to research_summaries
         enqueue qdrant index job
```

Cannot run in `/synthesize` because: external HTTP fetches can be slow, want to checkpoint between fetch + rerank so partial failure doesn't lose progress.

### 3.3 Error-Fix Investigation

```
test failure → ingest stack trace into error_fingerprints (existing table)
  → recall similar fixes via kag.recall_similar_fix
  → IF no prior fix:
       inspect changed files (git diff)
       inspect related schema (Drizzle definitions)
       inspect failing route handler
       synthesize patch plan via gemma4-legal-vlm
       write patch_plan to error_fix_history
       notify operator via SSE
```

Cannot run in `/synthesize` because: needs filesystem read, git access, multi-LLM rounds with intermediate Zod validation.

---

## 4. Deployment shape

```yaml
# docker-compose.yml — DEFERRED ADD
langgraph-worker:
  build: ./docker/langgraph-worker
  container_name: legal-ai-langgraph-worker
  runtime: nvidia
  profiles: ["gpu"]
  environment:
    - OLLAMA_URL=http://host.docker.internal:11434
    - QDRANT_URL=http://qdrant:6333
    - NEO4J_URI=bolt://neo4j:7687
    - DATABASE_URL=postgresql://legal_admin:123456@postgres:5432/legal_ai_db
    - REDIS_URL=redis://redis:6379/2     # different DB# than synth service
    - RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/
    - QUEUE_NAME=research.langgraph
    - DLQ_NAME=research.langgraph.dlq
    - CHECKPOINT_TABLE=langgraph_checkpoints
    - LLM_MODEL=gemma4-hermes-64k:latest  # 64K context for multi-step flows
  depends_on:
    - rabbitmq
    - postgres
    - redis
  networks:
    - legal-ai-network
  restart: unless-stopped
```

No new exposed port — worker is RabbitMQ-driven, not HTTP-driven. Different Redis DB# (`/2`) and Postgres `langgraph_checkpoints` table keep it isolated from synth.

---

## 5. Boundary rules

| Rule | Why |
|---|---|
| Worker MUST NOT call databases directly — only via approved service clients | Keeps blast radius bounded; lets us mock Qdrant/Neo4j in tests |
| Worker MUST NOT expose tools to Gemma4 / Claude | Tool boundary stays at TRACE MCP `:8788` (per `docs/architecture/trace-runtime-split.md`) |
| Worker receives already-sanitized job envelopes | No prompt-injection vector — sanitization happens at SvelteKit edge |
| Heavy jobs are background-only | Real-time chat goes through `/synthesize` (existing) or `/api/ai/intent-dispatch` (Phase B) |
| Worker result envelope is the ONLY return surface | No mid-graph writes to user-visible tables; "recommendedWrites" is a proposal the operator/cron approves |

---

## 6. Required TypeScript contracts

```ts
// src/lib/server/queue/langgraph-jobs.ts  (TO BE CREATED — Phase LG-1)
export type LangGraphResearchJob = {
  jobId:        string;          // crypto.randomUUID()
  kind:
    | 'legal_pdf_research'
    | 'external_research_validation'
    | 'error_fix_investigation'
    | 'citation_resolution';
  query?:       string;
  documentId?:  string;
  caseId?:      string;
  featureId?:   string;
  trustPolicy:  'strict' | 'normal' | 'exploratory';
  maxSteps:     number;          // hard cap on graph node executions
};

export type LangGraphResearchResult = {
  jobId:   string;
  status:  'completed' | 'failed' | 'partial';
  summary: string;
  citations: Array<{
    source:     string;
    trustTier:  string;
    confidence: number;
  }>;
  graphEdges: Array<{
    from:       string;
    to:         string;
    relation:   string;
    confidence: number;
  }>;
  recommendedWrites: Array<{
    target:          'qdrant' | 'postgres' | 'redis' | 'couchdb' | 'neo4j';
    reason:          string;
    payloadPreview:  unknown;     // operator/cron approves the actual write
  }>;
};
```

These types ship FIRST (Phase LG-1) — they're the contract Hermes / SvelteKit / MCP all bind to. The Python worker comes later.

---

## 7. Implementation phases (≤1 day each, sequential)

| Phase | Work | Exit gate |
|---|---|---|
| **LG-0** | Do nothing. Keep as design doc. | Operator decides to start |
| **LG-1** | Add TS job/result schemas in `src/lib/server/queue/langgraph-jobs.ts`. No Python yet. | Zod validators + 6 G26-compliant route stubs pass |
| **LG-2** | Add `research.langgraph` + `research.langgraph.dlq` queues to `rabbitmq-manager-fixed.ts`. Publish-only (no consumer). | Test publish lands in queue, visible in RabbitMQ UI |
| **LG-3** | Stand up `docker/langgraph-worker/` consuming ONE kind: `citation_resolution`. Smallest viable graph. | One real PDF resolves a citation end-to-end |
| **LG-4** | Add Postgres `langgraph_checkpoints` table + LangGraph PostgresSaver. Worker survives restart mid-graph. | Kill worker mid-job → restart → resumes from checkpoint |
| **LG-5** | (Optional) LangGraph Studio for graph-visual debugging. UI-only addition. | Studio opens, shows live graph executions |

**Estimated total**: 4–5 days for LG-1 through LG-4. Studio (LG-5) is optional.

---

## 8. What this does NOT propose

- Touching `legal-ai-langgraph:8091` synth service. That stays.
- Replacing `/api/ai/intent-dispatch` (Phase B) or Hermes Agent.
- New MCP tools. The TRACE MCP `:8788` surface stays at 88 tools (89 if `research.synthesize` lands separately — see `hermes-langgraph-integration` notes).
- New user-visible UI. Results land in `research_summaries`, `error_fix_history`, `admin_raptor_summaries`; existing UIs surface them.
- LangGraph Cloud / hosted offering. Worker is local-only.
- Replacing your TS-native intent router. That's the right layer for online routing; LangGraph worker is for offline conditional research.

---

## 9. Exit criteria — DO NOT START LG-1 UNTIL

| Gate | Why |
|---|---|
| Evidence-upload Playwright tests are green | Need a stable PDF intake path before adding background OCR retry |
| `cases.user_id` integer-vs-uuid identity strategy resolved | Background jobs need a stable user FK |
| Legal section enum landed (caption/facts/holding/disposition) | First worker kind depends on section tags |
| RRF sparse+dense fusion in production | LangGraph worker reuses RRF for the synthesis node |
| `admin_raptor_summaries` table schema accepted | RAPTOR tree is the output target for `legal_pdf_research` |
| **Current priority order**: see project `master_agents.md` Session 2026-05-10 §"Next-step priority order" | Don't context-switch off the current sprint |

---

## 10. Current priority order (kept here for reference; canonical is master_agents.md)

```
1. Path A: cases.user_id integer alignment
2. Path B: admin_ai_chat / crimes / file_path schema drift  ✅ DONE this session
3. Legal retrieval 1A: legal_section enum (parallel agent in progress)
4. Legal retrieval 1B: GIN tsvector + sparse search  ✅ DONE this session
5. Legal retrieval 1C: RRF fusion module  ✅ DONE this session
6. RAPTOR tree table design  ✅ DONE this session (table created)
7. RAPTOR summarizer + writer (raptor-summarizer.ts already exists, needs callers)
8. THEN revisit LangGraph background worker (this doc)
```

So: write the LangGraph plan doc now, keep it deferred. The synth service at `:8091` continues to handle the real-time chat side meanwhile.

---

## 11. Cross-references

- `docker-compose.yml` lines 1000-1054 — existing `legal-ai-langgraph:8091` synth service definition
- `docker/langgraph-synthesis/app.py` lines 897-984 — `/synthesize` endpoint, the canonical fast-graph reference
- `src/lib/server/ai/intent-router.ts` — TS-native routing (Phase B, complementary not competing)
- `src/lib/server/queue/rabbitmq-manager-fixed.ts` — 7-queue manager (add `research.langgraph` here in LG-2)
- `src/lib/server/db/schema/admin-raptor-summaries.ts` — RAPTOR target table for `legal_pdf_research` worker
- `next_steps/active/2026-05-10_rotorquant-bitnet-cache-hierarchy.md` — sister design doc (also deferred)
- `next_steps/active/2026-05-10_service-worker-regex-tool-router.md` — Phase A–D intent + SW (ALL SHIPPED this session)
- `docs/architecture/trace-runtime-split.md` — boundary rule: LangGraph never gets direct DB access

---

**Doc length**: ~290 lines. Designed to be the answer when the next session asks "should we add a LangGraph worker?" — the answer is "yes, eventually; here's the build order and exit criteria; the synth service at :8091 already handles real-time."
