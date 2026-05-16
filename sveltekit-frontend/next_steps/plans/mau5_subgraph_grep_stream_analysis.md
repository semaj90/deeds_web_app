# mau5-subgraph-grep-stream-analysis.md — Repo Diagnostics for Subgraph Instruction Programming

**Purpose:** Turn the Subgraph Instruction Programming + KAG/ACE topology plan into a repo-level grep/stream diagnostic workflow. This document helps agents verify what exists, what is missing, and where to wire the SvelteKit 2 SSR/API gateway, Svelte 5 runes, Bits UI, Superforms/Zod, Drizzle/Postgres, Redis, Qdrant, Neo4j, CouchDB, gRPC sidecars, TurboVec, ACE, KAG, and Gemma4.

**Parent plan:** `docs/design/subgraph-instruction-programming.md` or `docs/design/2026-05-13_subgraph_instruction_programming_schema_todo.md`

---

## 1. Target Architecture Being Verified

```text
Browser
  → SvelteKit 2 SSR/API Gateway
  → Svelte 5 runes UI
  → Bits UI v2 primitives
  → Superforms v2 + Zod validation
  → Drizzle/Postgres durable truth
  → Redis BitFrost/ACE hot cache
  → Qdrant dense/hybrid semantic retrieval
  → Neo4j KAG/DAG graph paths
  → CouchDB stitched wiki / MapReduce rollups
  → gRPC/Protobuf sidecars for workers
  → TurboVec optional compressed ANN sidecar
  → Gemma4/TurboQuant planner + synthesis
```

The repo analysis should prove whether this architecture is implemented as:

```text
routes
components
server services
schemas
database tables
cache keys
retrieval lanes
graph edges
sidecar clients
tests
smoke scripts
docs
```

---

## 2. What This Grep Stream Should Answer

The diagnostic flow should answer:

```text
1. Is SvelteKit acting as SSR/API gateway, not pure SPA?
2. Which routes use +page.server.ts, +server.ts, form actions, or SSE?
3. Where are Svelte 5 runes used?
4. Where are Bits UI components used?
5. Where are Superforms/Zod forms used?
6. Which Drizzle/Postgres tables support workflow/atlas/cache/evidence?
7. Where are Redis/Qdrant/Neo4j/CouchDB clients used?
8. Where are ACE/KAG/BitFrost context packets built?
9. Where are gRPC/Protobuf sidecars defined or called?
10. Where are TurboVec/media/Whisper/OCR workers wired?
11. Which files implement subgraph-style ownership?
12. Which tests/smokes verify these features?
```

---

## 3. One-Shot Repo Grep Command

Run from:

```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend
```

PowerShell/Git Bash:

```bash
rg -n --glob '!node_modules' --glob '!*.map' --glob '!build' --glob '!dist' \
  "SvelteKit|\+page\.server|\+server|actions\s*=|superValidate|superForm|zod|z\.|bits-ui|\$state|\$derived|\$effect|\$props|drizzle|pgTable|redis|qdrant|neo4j|couchdb|ace:ctx|BitFrost|Bifrost|KAG|DAG|GraphRAG|manifold4|som_cluster|grpc|protobuf|proto3|TurboVec|turbovec|Whisper|OCR|LangExtract|EmbeddingGemma|Ollama|Gemma4|TurboQuant|MCP|SubgraphInstruction|DailyAtlas|daily_activity_atlas|agent_workflow_events|user_activity_events|patch_proposals" \
  src docs scripts tests > tmp/mau5-subgraph-grep-stream.txt
```

Then summarize:

```bash
rg -n "SubgraphInstruction|daily_activity_atlas|agent_workflow_events|user_activity_events|patch_proposals|ace:ctx|KAG|manifold4|turbovec|superValidate|superForm|bits-ui|\$state" tmp/mau5-subgraph-grep-stream.txt
```

---

## 4. Focused Grep Streams

### 4.1 SvelteKit SSR/API Gateway

```bash
rg -n --glob '!node_modules' "\+page\.server|\+server|export const actions|RequestHandler|ServerLoad|load:|event\.locals|cookies|redirect\(|fail\(" src/routes src/lib
```

Classify:

```text
+page.server.ts     → SSR data loading
+server.ts          → API gateway
actions             → form actions
SSE/stream routes   → live agent/chat/workflow updates
```

Expected result:

```text
SvelteKit is a multi-page SSR/API gateway, not a pure SPA.
```

---

### 4.2 Svelte 5 Runes

```bash
rg -n --glob '!node_modules' "\$state|\$derived|\$effect|\$props|\.svelte\.ts" src/lib src/routes
```

Look for:

```text
Svelte 5 state
derived state
browser effects
component props
.svelte.ts stores/machines
```

Warning signs:

```text
old $: reactive declarations
export let
on:event handlers
```

Check old syntax:

```bash
rg -n --glob '!node_modules' "export let|\$:\s|on:[a-zA-Z]+" src/lib src/routes
```

---

### 4.3 Bits UI v2

```bash
rg -n --glob '!node_modules' "bits-ui|from ['\"]\$lib/components/ui|Dialog|Tabs|Select|Popover|Dropdown|Command|Tooltip|Progress|ScrollArea" src/lib src/routes
```

Classify:

```text
Dialog      → upload modals, patch review
Tabs        → evidence/timeline/search panels
Select      → filters
Command     → command palette/search
Progress    → workflow status
Tooltip     → diagnostics hints
```

---

### 4.4 Superforms v2 + Zod

```bash
rg -n --glob '!node_modules' "superValidate|superForm|sveltekit-superforms|zod|z\.object|z\.string|z\.instanceof|message\(|setError|enhance" src/lib src/routes
```

Look for:

```text
server-side validation
client enhancement
file upload forms
schema reuse
typed form actions
```

Key question:

```text
Are evidence upload and patch approval forms standardized with Superforms/Zod?
```

---

### 4.5 Drizzle/Postgres Truth

```bash
rg -n --glob '!node_modules' "pgTable|drizzle|integer\(|uuid\(|jsonb\(|timestamp|text\(|boolean\(|index\(|relations\(" src/lib/server/db src/lib/server/schema* src
```

Look for tables:

```text
user_activity_events
agent_workflow_events
patch_proposals
daily_activity_atlas
recommendation_events
workflow_runs
workflow_steps
llm_context_cache
metadata_envelopes
topology_positions
topology_snapshots
tensor_analysis_cache
```

Focused:

```bash
rg -n "user_activity_events|agent_workflow_events|patch_proposals|daily_activity_atlas|recommendation_events|llm_context_cache|topology_positions|topology_snapshots|tensor_analysis_cache" src drizzle docs scripts
```

---

### 4.6 Redis / BitFrost / ACE Cache

```bash
rg -n --glob '!node_modules' "ace:ctx|llm_context_cache|resolveContextCacheSources|Bifrost|BitFrost|bifrost|cacheKey|repoGitSha|systemPromptHash|toolDefinitionsHash|Redis|ioredis|redis\." src docs scripts tests
```

Verify:

```text
Redis hot cache
Postgres durable cache
local JSON fallback
cache identity fields
toolPolicy preservation
KAG packet support
```

Expected cache order:

```text
Redis → Postgres → local JSON → miss
```

---

### 4.7 Qdrant Dense Search

```bash
rg -n --glob '!node_modules' "Qdrant|qdrant|searchPoints|query_points|upsert|setPayload|scroll|collection|dense|sparse|RRF|reciprocal|embedding" src docs scripts tests
```

Look for collections:

```text
codebase_chunks_768
markdown_chunks
evidence_text_chunks
evidence_visual_chunks
evidence_summaries
feature_summaries
daily_activity_summaries
subgraph_instruction_chunks
qdrant_docs
```

---

### 4.8 Neo4j Graph / KAG / DAG

```bash
rg -n --glob '!node_modules' "neo4j|Cypher|MATCH |MERGE |UNWIND|KAG|DAG|GraphRAG|Pentagon|pathway|graph path|semantic_path|topology|manifold4|som_cluster" src docs scripts tests
```

Look for graph edges:

```text
File → imports → File
Route → calls → API
API → uses → Service
Service → touches → Table
Feature → owns → Files
AgentsCard → describes → Directory
DailyAtlas → touched → File
PatchProposal → modifies → File
```

---

### 4.9 CouchDB / Wiki / MapReduce

```bash
rg -n --glob '!node_modules' "CouchDB|couchdb|MapReduce|mapreduce|link_matrix|wiki|karpathy|AGENTS.md|agents:dir|directory card|daily page" src docs scripts tests
```

Verify:

```text
AGENTS directory cards
Karpathy wiki pages
Daily Activity Atlas pages
link_matrix rollups
cluster summaries
```

---

### 4.10 gRPC / Protobuf / Sidecars

```bash
rg -n --glob '!node_modules' "grpc|@grpc|proto3|protobuf|\.proto|50051|50053|sidecar|worker|health|circuit|timeout|retry|load balancer|proxy" src proto docs scripts tests
```

Look for sidecars:

```text
embedding worker
retrieval worker
TurboVec sidecar
Whisper worker
OCR worker
media worker
```

---

### 4.11 TurboVec

```bash
rg -n --glob '!node_modules' "TurboVec|turbovec|IdMapIndex|uint64|tvim|compressed ANN|sidecar|turbovec-client|turbovec_search_bridge" src docs scripts tests
```

Verify:

```text
TS client
Python bridge
uint64 ID mapping
Qdrant point ID lookup
fallback to Qdrant
```

Important wording:

```text
TurboVec = compressed ANN sidecar
TurboQuant/Gemma4 = GPU inference lane
```

Do not call TurboVec RTX-accelerated unless the bridge actually uses CUDA.

---

### 4.12 OCR / Whisper / LangExtract / Media Workers

```bash
rg -n --glob '!node_modules' "Whisper|faster-whisper|whisper.cpp|ffmpeg|OCR|Docling|Granite|LangExtract|transcript|frame|caption|audio|video|evidence_frames|evidence_transcript_segments" src docs scripts tests
```

Verify:

```text
transcript-first ingestion
frame extraction every 10 seconds
OCR/image-to-text
LangExtract structured extraction
Qdrant payloads
Neo4j timestamp alignment
```

---

## 5. Stream Diagnostics

### 5.1 Stream atlas smoke

PowerShell:

```powershell
npm run smoke:atlas 2>&1 | Tee-Object -FilePath logs/task-output/pipeline-test/smoke-atlas-stream.log
```

Git Bash:

```bash
npm run smoke:atlas 2>&1 | tee logs/task-output/pipeline-test/smoke-atlas-stream.log
```

Then:

```bash
rg -n "PASS|FAIL|WARN|SKIP|DEGRADED|dev server unreachable|fetch failed|context_for_file|hypergraph.search|ace/recommendations" logs/task-output/pipeline-test/smoke-atlas-stream.log
```

---

### 5.2 Stream SvelteKit dev logs

PowerShell:

```powershell
npm run dev 2>&1 | Tee-Object -FilePath logs/dev-server-stream.log
```

Then in another terminal:

```bash
rg -n "error|warn|500|fetch failed|upload|evidence|ace|qdrant|neo4j|redis|superforms|zod" logs/dev-server-stream.log
```

---

### 5.3 Stream test output

```bash
npx vitest run tests/unit/llm-context-cache.test.ts tests/unit/context-cache-planner.test.ts 2>&1 | tee logs/task-output/pipeline-test/cache-tests-stream.log

rg -n "PASS|FAIL|Error|Assertion|cache|toolPolicy|redis|postgres|local-json" logs/task-output/pipeline-test/cache-tests-stream.log
```

---

## 6. Report Format

Create:

```text
docs/audit/2026-05-13_subgraph-grep-stream-analysis.md
```

With sections:

```text
1. Summary
2. SvelteKit SSR/API gateway findings
3. Svelte 5 runes findings
4. Bits UI findings
5. Superforms/Zod findings
6. Drizzle/Postgres schema findings
7. Redis/BitFrost/ACE cache findings
8. Qdrant retrieval findings
9. Neo4j KAG/DAG findings
10. CouchDB/Wiki findings
11. gRPC/sidecar findings
12. TurboVec findings
13. OCR/Whisper/LangExtract findings
14. Missing pieces
15. Recommended next commits
```

---

## 7. Status Labels

Use these labels:

```text
SHIPPED
  working code + tests/smoke evidence

PARTIAL
  code exists but missing wiring, tests, UI, or persistence

SPEC_ONLY
  documented but not implemented

MISSING
  not found in repo

ENV_BLOCKED
  could not test because dev server/container/service was down
```

---

## 8. Expected Findings

Likely current status:

```text
SvelteKit SSR/API gateway:
  SHIPPED

Svelte 5 runes migration:
  SHIPPED/PARTIAL

Bits UI:
  SHIPPED/PARTIAL

Superforms/Zod:
  PARTIAL

Drizzle/Postgres:
  SHIPPED/PARTIAL with schema drift risk

Redis/BitFrost/ACE cache:
  SHIPPED

Qdrant retrieval:
  SHIPPED/PARTIAL

Neo4j KAG/DAG:
  SHIPPED/PARTIAL

CouchDB/Karpathy wiki:
  PARTIAL/SHIPPED

gRPC/sidecars:
  PARTIAL

TurboVec sidecar:
  PARTIAL

OCR/Whisper/LangExtract:
  PARTIAL/SPEC_ONLY depending current code

Daily Activity Atlas:
  SPEC_ONLY/PARTIAL

SubgraphInstruction:
  SPEC_ONLY unless already implemented
```

---

## 9. Agentic Workflow Event

Each grep-stream run should produce an event:

```json
{
  "event_type": "grep_stream_analysis",
  "target_type": "subgraph_instruction_programming",
  "status": "completed",
  "metadata": {
    "output": "docs/audit/2026-05-13_subgraph-grep-stream-analysis.md",
    "queries_run": 12,
    "missing_features": [],
    "partial_features": []
  }
}
```

Store in:

```text
agent_workflow_events
```

Then summarize into:

```text
daily_activity_atlas
```

---

## 10. Recommended Next Commits

```text
1. docs(audit): add subgraph grep stream analysis
2. feat(subgraph): add SubgraphInstruction schema + seed cards
3. feat(atlas): extract static/dynamic imports into graph edges
4. feat(kag): build getKagDagPacket from Qdrant/Neo4j/Redis
5. feat(forms): standardize upload forms with Superforms/Zod
6. feat(sidecars): add sidecar health registry and fallback policy
7. feat(training): export workflow pathfinding JSONL
```

---

## 11. Claude Code Prompt

```text
You are working in:
C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

Task:
Run a repo grep-stream analysis for Subgraph Instruction Programming and KAG/ACE topology.

Inputs:
- docs/design/2026-05-13_subgraph_instruction_programming_schema_todo.md
- docs/graph/codebase-map.md
- docs/graph/codebase-graph.json
- memory/atlas/codebase-atlas.dirs.json
- src/
- scripts/
- tests/

Output:
docs/audit/2026-05-13_subgraph-grep-stream-analysis.md

Classify:
- SvelteKit SSR/API gateway
- Svelte 5 runes
- Bits UI v2
- Superforms/Zod
- Drizzle/Postgres
- Redis/BitFrost/ACE
- Qdrant
- Neo4j KAG/DAG
- CouchDB/Karpathy wiki
- gRPC/Protobuf sidecars
- TurboVec sidecar
- OCR/Whisper/LangExtract
- Daily Activity Atlas
- SubgraphInstruction cards

For each:
- grep command used
- files/directories found
- status: SHIPPED, PARTIAL, SPEC_ONLY, MISSING, ENV_BLOCKED
- missing pieces
- recommended next action

Rules:
- Do not run drizzle push.
- Do not mutate DB.
- Do not mutate Qdrant/Neo4j.
- Do not expose raw apply_patch.
- Use dry-run mode for writer scripts.
- Treat AGENTS.md as context cards, not truth.
```

---

## 12. Final Recommendation

Use this grep-stream analysis to convert the architecture plan into an executable repo audit.

The immediate goal is not to build new features. It is to prove:

```text
what exists
what is partial
what is only documented
what is missing
what should be wired next
```

Then feed the resulting findings into:

```text
Master Atlas
Daily Activity Atlas
ACE KAG/DAG packets
Gemma4 recommendations
agent_workflow_events
```
