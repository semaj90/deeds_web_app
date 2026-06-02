# Phase 102 Handoff — Task Semantic Packet Integration

Generated: 2026-06-01T22:00:00.000Z  
Prerequisite: Phase 101 closeout confirmed (`docs/reports/phase-101-closeout.md`)

---

## Goal

Wire the Task Semantic Packet layer so that every Kanban task produces a durable Postgres row, a Qdrant vector point, and a Redis hot-context entry that Gemma4 / OpenCode / TRACE MCP agents can pick up in O(1).

---

## Operator Gate (Run First)

Before any Phase 102 code work, the operator must apply three SQL files that are already written and sitting on disk:

```bash
# 1. NES chrom tables (if not yet applied)
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  < sveltekit-frontend/drizzle/manual/20260601_nes_chrom_packets_and_kag_dag_hits.sql

# 2. Task semantic packets v2 expansion columns + task_cluster_links table
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  < sveltekit-frontend/drizzle/manual/20260601_task_semantic_packets_v2.sql

# 3. Alias ID + GIN index
docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  < sveltekit-frontend/drizzle/manual/20260601_task_semantic_packets_alias_id_and_atlas_profile_gin.sql

# Verify
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT column_name FROM information_schema.columns
   WHERE table_name = 'task_semantic_packets'
   ORDER BY ordinal_position;"
```

---

## Phase 102 Tasks (Ordered)

### T1 — `workspace_task_id ↔ feature_id ↔ cluster_id` Bridge

**What**: The `task_cluster_links` table (created in v2 SQL) needs a writer.  
**Where**: New script `scripts/atlas/sync-task-cluster-links.mjs`  
**Logic**:
1. Read `workspace_tasks` rows (Kanban) that have a `feature_id`
2. Look up `gpu:karpathy:scores` in Redis for the feature's source files → get `cluster_id`
3. Look up Qdrant `codebase_chunks_768` for the feature's stable key → get `qdrant_point_id`
4. INSERT into `task_cluster_links` (upsert on `workspace_task_id + feature_id`)

**Gate**: `SELECT count(*) FROM task_cluster_links` returns > 0 after first run.

---

### T2 — Qdrant Payload Indexes for Agent Pickup

**What**: Add `payload_index` entries to `codebase_chunks_768` for `feature_id`, `cluster_id`, `task_id` so agents can filter without scanning.  
**Where**: `scripts/atlas/create-qdrant-payload-indexes.mjs`  
**API call** (idempotent):
```javascript
await qdrant.createPayloadIndex('codebase_chunks_768', {
  field_name: 'feature_id', field_schema: 'keyword'
});
await qdrant.createPayloadIndex('codebase_chunks_768', {
  field_name: 'cluster_id', field_schema: 'keyword'
});
await qdrant.createPayloadIndex('codebase_chunks_768', {
  field_name: 'task_id', field_schema: 'keyword'
});
```
**Gate**: `GET /collections/codebase_chunks_768` → `payload_schema` lists all three fields.

---

### T3 — Gemma4 Summary Packets

**What**: For each row in `task_semantic_packets` where `summary_llm IS NULL`, call Gemma4 (via `bifrostChat`) to produce a 2-sentence summary and write it back.  
**Where**: `scripts/atlas/generate-task-summary-packets.mjs`  
**Model**: `gemma4-rotorquant:latest` via `bifrostChat()` (L1 Redis exact → L2 Bifrost → L3 Ollama)  
**Prompt skeleton**:
```
Summarize this task in 2 sentences for an AI agent.
task_title: {title}
feature_id: {feature_id}
cluster_id: {cluster_id}
next_action: {next_action}
```
**Gate**: `SELECT count(*) FROM task_semantic_packets WHERE summary_llm IS NOT NULL` increases.

---

### T4 — Bifrost / Redis Hot-Context Queue

**What**: After T3 writes `summary_llm`, push the packet into Redis so ACE Stage A0 can serve it without hitting Postgres.  
**Key pattern**: `ace:task:{workspace_task_id}` (JSON string, TTL 24h)  
**Where**: Add to `generate-task-summary-packets.mjs` as a post-write step, using the ioredis cold-start pattern (already in `karpathy-gpu-enrich.mjs`).  
**Gate**: `docker exec legal-ai-redis redis-cli KEYS "ace:task:*"` returns rows.

---

### T5 — Langfuse Trace per Task

**What**: Each Gemma4 summary call in T3 should emit a Langfuse trace with `task_id`, `feature_id`, `cluster_id`, and latency.  
**Where**: Import `logInference` from `src/lib/server/observability/inference-log.js` — already wired for `type: 'llm'`.  
**Fields to add**: `metadata: { task_id, feature_id, cluster_id }` in the trace span.  
**Gate**: Langfuse UI at `http://localhost:3030/traces` shows traces tagged with `task_id`.

---

### T6 — OpenCode Kanban Task Materialization

**What**: After T1–T5 land, add an OpenCode startup script that reads the top-10 `task_cluster_links` rows (ordered by Karpathy blend score) and writes them as `.opencode/cards/task-{id}.json` so OpenCode surfaces them on folderOpen.  
**Where**: `scripts/opencode/materialize-task-cards.mjs`  
**Card shape** (matches existing `.opencode/cards/*.json` format):
```json
{
  "id": "task-{workspace_task_id}",
  "type": "task_semantic_packet",
  "feature_id": "...",
  "cluster_id": "...",
  "summary_llm": "...",
  "next_action": "...",
  "qdrant_point_id": "...",
  "blend_score": 0.0,
  "generated_at": "..."
}
```
**Gate**: `ls .opencode/cards/task-*.json | wc -l` returns ≥ 1 after script run.

---

### T7 — VLM Lane Completion

**What**: The VLM lane scaffold (`local-llama-provider.ts`, `lane-router.ts`, `vlm-readiness.ts`) needs the remaining three files completed:
- `vlm-lane.ts` — `runVlmLane()` via Vercel AI SDK `generateText`
- `vlm-plan-parser.ts` — `parseVlmPlan()` JSON extractor
- `tool-dispatcher.ts` — allowlisted `rg` / `qdrant` / `searxng` dispatcher
- `run-local-ai.ts` — single entrypoint that switches `text` / `vlm`

**Note**: These were started in the previous session. Complete and wire into `/api/ai/chat/stream` as a pre-routing step: if `selectAiLane(req) === 'vlm'` and `vlmReady`, delegate to `runLocalAi()` instead of `routeStreamingInference`.

---

## What NOT to Do in Phase 102

- Do not run `drizzle-kit push` or `drizzle-kit migrate` — use the manual SQL files only
- Do not change `users.id` type — stays `serial integer`
- Do not add a PG 18 upgrade — PG 16 + pgvector 0.8.2 is the target
- Do not force-generate new embeddings if Qdrant already has the point — check `scroll` first

---

## Success Criteria

| Criterion | Command |
|---|---|
| `task_cluster_links` populated | `SELECT count(*) FROM task_cluster_links;` → > 0 |
| Qdrant payload indexes present | `GET /collections/codebase_chunks_768` → `payload_schema` has `feature_id`, `cluster_id`, `task_id` |
| Gemma4 summaries written | `SELECT count(*) FROM task_semantic_packets WHERE summary_llm IS NOT NULL;` → > 0 |
| Redis hot-context populated | `redis-cli KEYS "ace:task:*"` → ≥ 1 key |
| Langfuse traces visible | Langfuse UI traces tagged `task_id` |
| OpenCode task cards present | `ls .opencode/cards/task-*.json` → ≥ 1 file |
| VLM lane smoke | `node scripts/smoke-all-gpu-lanes.mjs` — VLM lane: `vlm_server_health: true`, `vlm_model_capability: true` |
| svelte-check | exit 0 — 0 errors, 0 warnings |
