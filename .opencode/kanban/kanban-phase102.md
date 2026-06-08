# Phase 102 Kanban — HyperRAG → Agentic Error-Fix Pipeline

**Updated:** 2026-06-08  
**Derived from:** Live Postgres/Valkey/RabbitMQ state + Karpathy GPU indexing gaps  
**Goal:** Close the loop from dense GPU indexing → feature labeling → tracked error fixing → smoke/validation testing

---

## Column: BLOCKED (needs operator action)

| ID | Title | Blocker | Est. |
|----|-------|---------|------|
| B1 | **RabbitMQ queue declaration** | App never connects on cold start — 0 queues declared. 7 queues (`cache.invalidate`, `document.embed`, `evidence.process`, `vector.index`, `chat.context`, `analytics.track`, `codebase.index`) must be asserted before agentic workers can publish. Run `npm run dev` once OR call `POST /api/rabbitmq/status` to trigger queue assertion. Container: `b19c2ffc2b28_legal-ai-rabbitmq` (healthy). | 5 min |
| B2 | **`feature_id_match = 0` in route_packet_rewards** | ACE route writes semantic IDs (`"ai-agent"`, `"graph-intelligence"`) into `route_runtime_packets.feature_id` instead of file paths. Breaks the join to `code_relations_v1`. Needs normalization in `routeQuery()` or `/api/ace/route/+server.ts`. | 1h |

---

## Column: TODO — Atlas / Graph Completion

| ID | Title | Description | Est. | Deps |
|----|-------|-------------|------|------|
| A1 | **Parent atlas lane C: SHARES_TAGS edges** | Lane A (`cluster_context`) and B (`shared_resource`) shipped. Lane C hyperedge needs tag-overlap edges built from Qdrant payload tags → code_relations_v1 `SHARES_TAGS`. Script: `scripts/atlas/build-all-lanes-parent-atlas.mjs --lane=c`. | 2h | — |
| A2 | **Karpathy GPU rescore (dirty files)** | 219 files scored. Run `npm run karpathy:gpu:dirty` to pick up files changed since last run. Needs Ollama + llama-server warm. Writes to `gpu:karpathy:scores` (24h TTL). | 30m | Ollama up |
| A3 | **Lane routing policy from chunk_hit_log** | `chunk_hit_log` is empty — no lane decisions recorded yet. Tier 1 decision-table router requires ≥50 chunk hits per lane. Run `npm run kb:export-lane-router-training` once enough SSE chat hits accumulate, OR seed with synthetic hits from existing `route_runtime_packets`. | 2h | SSE chat active |
| A4 | **Summaries completion** | `file_summaries`: 3,547 rows but unknown % with actual summary text (vs null). Run `atlas:tasks:summarize` to backfill. Needs Ollama warm. | 1h | Ollama up |
| A5 | **graph_refresh_manifest update** | `memory/exports/graph-refresh-manifest.json` is stale. Run `graphify:domain-topology` to regenerate topology + update manifest timestamp. | 20m | — |

---

## Column: TODO — Agentic Error-Fix Pipeline

| ID | Title | Description | Est. | Deps |
|----|-------|-------------|------|------|
| E1 | **Error DAG audit** | Run `npm run audit:error-dag:json` → writes JSONB diagnostic report. Feeds the agentic batch-fix planner. Check `scratch/audits/` output. | 15m | — |
| E2 | **Feature label tagging** | Run `graphify:feature-labels` to assign semantic feature labels to Karpathy top-200 files. Labels feed the error-fix priority queue and the ACE `queryTags` leaderboard (G51). | 30m | A2 done |
| E3 | **Agentic batch-fix dry-run** | Run `npm run agent:fix:batch:quiet` — parallel hotspot fix planner. Reads Karpathy authority blend + tsgo diagnostics to prioritize. Output to `logs/task-output/`. | 1h | E1, E2 |
| E4 | **tsgo full audit** | Run `npm run audit:tsgo:json` to write fresh JSONB diagnostic snapshot. Feed results into `metadata_envelopes(source_type='diagnostic')` via `scripts/tsgo-diagnostics-to-jsonb.mjs`. | 20m | — |

---

## Column: TODO — Smoke → Validation Chain

| ID | Title | Description | Est. | Deps |
|----|-------|-------------|------|------|
| S1 | **smoke:graphify (5-pillar)** | `npm run smoke:graphify` — checks graph JSON + Redis fast cache + KAG notes + Qdrant `codebase_chunks_768` + ACE `FAST_AST_SCORE_CAP`. Must be 8/8 (was 8/8 last run). Re-run after A1/A5. | 5m | A5 |
| S2 | **smoke-opencode-tool-call** | `node scripts/tests/smoke-opencode-tool-call.mjs` — validates `supports_system_role: true` after launcher fix. Run after next llama-server restart with `--chat-template-file`. | 2m | llama-server restart |
| S3 | **smoke-semantic-valkey (8/8)** | `node sveltekit-frontend/scripts/tests/smoke-semantic-valkey.mjs` — Gate 7 TTL fix shipped. Re-run to confirm 8/8. | 3m | Valkey up |
| S4 | **Playwright auth suite (11/11)** | `npx playwright test tests/e2e/auth-login-db.spec.ts` — was 11/11 last session. Re-run after any schema change. | 5m | dev server |
| S5 | **Route packet rewards smoke** | `npm run atlas:rewards:populate` (dry-run) → should show 45 packets, 9 successes, avg_overlap ≈ 0.586. Verify B2 fix raises `feature_id_match > 0`. | 5m | B2 |

---

## Column: IN PROGRESS

| ID | Title | Status |
|----|-------|--------|
| C1 | **Card directory migration** | ✅ DONE — 14 atlas scripts now import from `_neschrom-paths.mjs`. `neschrom97/cards/` is canonical write target. `memory/packets/cards/` created. |
| C2 | **NDJSON → code_relations_v1** | ✅ DONE — 30,339 edges loaded (7 types). `route_packet_rewards` bootstrapped (45 rows). |
| C3 | **`--chat-template-file` launcher fix** | ✅ DONE — `launch-turboquant.ps1` now injects `--chat-template-file configs/templates/gemma4-opencode.jinja`. Needs llama-server restart to verify. |
| C4 | **OpenCode context overload fix** | ✅ DONE — `ace-packet.json` watcher-ignored + trimmed. All root `.opencode/*.json` artifacts watcher-ignored. |

---

## Column: DONE (this phase)

| ID | Title | Commit |
|----|-------|--------|
| D1 | index-codebase-fast scope fix (55k→15k files) | `ab1ae8b2a2` |
| D2 | smoke Gate 7 TTL race fix | `6f4a0186f5` |
| D3 | NDJSON → Postgres 4-edge-type loader | `e4ad3cc0bf` |
| D4 | route_packet_rewards bootstrap | `e4ad3cc0bf` |
| D5 | BM25 GIN index on file_summaries | `e4ad3cc0bf` |
| D6 | _neschrom-paths.mjs + 14-script refactor | `9bcb3b1eac` |
| D7 | launcher --chat-template-file fix | `ea9c3bce22` |

---

## Priority Order (recommended)

```
NOW (no deps):  B1 (RabbitMQ) → S3 → E1 → E4 → A5
NEXT (Ollama):  A2 → E2 → A4 → S1 → S2
THEN (feature): B2 → A1 → A3 → E3 → S4 → S5
```

## RabbitMQ Quick-Fix

```bash
# Option 1: just start the dev server (declares queues on startup)
npm run dev

# Option 2: direct queue declaration probe  
curl -s -X POST http://localhost:5173/api/rabbitmq/status | jq .

# Verify queues declared:
docker exec b19c2ffc2b28_legal-ai-rabbitmq rabbitmqctl list_queues name messages consumers
```

## feature_id_match Fix (B2)

The ACE route stores `result.packet?.feature_ids?.[0]` as `feature_id` in `route_runtime_packets`.  
`feature_ids` are semantic labels like `"ai-agent"` — not file paths.  
Fix: normalize to the closest matching source file before insert, OR add a separate `source_file_id` column that stores the primary source_ref instead.
