# Agent Timeline

> Generated: 2026-05-11T02:09:22Z | 60 commits
> Used by agents for temporal retrieval — correlate errors, fixes, and features with timestamps.
> Source: git log + Redis KAG notes + Qdrant embedding index.

## 🔧 Fix (14)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-10T16:32:07Z | `f59bc6b` | `intent` | fix(intent): drop RouterDecisionSchema.parse on routeIntent return path | `server/ai` |
| 2026-05-10T16:21:47Z | `6b85d14` | `schema` | fix(schema): evidence.uploaded_by uuid -> integer + switch ownership filter | `server/db`, `(app)/evidence`, `evidence/upload` |
| 2026-05-10T14:36:40Z | `3c285ea` | `schema` | fix(schema): cast user.id for cases.userId integer + reports.createdBy/evidence.uploadedBy uuid | `server/db`, `(app)/cases`, `cases/new` |
| 2026-05-10T14:09:34Z | `9e0722a` | `schema` | fix(schema): cases.user_id uuid->integer + dev-bypass user.id alignment | `src`, `server/db`, `(app)/cases` |
| 2026-05-10T13:52:45Z | `e54bc08` | `schema` | fix(schema): create crimes table + use metadata JSONB on raw_error_embeddings | `components/webgpu`, `server/indexer`, `lib/utils` |
| 2026-05-10T13:37:33Z | `4fc5fbd` | `schema` | fix(schema): add statutes.section + category + source_url columns | — |
| 2026-05-10T13:34:42Z | `32194c3` | `schema` | fix(schema): add admin_ai_chat_sessions.context_tag + active columns | — |
| 2026-05-10T13:28:03Z | `230d084` | `schema` | fix(schema): align uploaded_by + sessions to integer; wire EvidenceMediaViewer + viewer route | `components/admin`, `components/evidence`, `components/forms` |
| 2026-05-10T03:55:42Z | `1d78935` | `gpu-graph` | fix(gpu-graph): add ssr=false, fix distance-normalized edge attraction | `admin/gpu-evidence-graph` |
| 2026-05-10T03:45:47Z | `68e5a51` | `api` | fix(api): add Zod validation to evidence/tags and research/encode POST handlers | `evidence/tags`, `research/encode` |
| 2026-05-10T02:38:34Z | `8e2385b` | `seaweedfs` | fix(seaweedfs): correct healthcheck hostnames + wire S3 gateway | — |
| 2026-05-09T21:08:39Z | `0a74503` | `karpathy` | fix(karpathy): dotenv + by_lane all-edges query for gpu:karpathy:by_lane | — |
| 2026-05-09T20:50:10Z | `f551104` | `smoke` | fix(smoke): hyperrag smoke SSE parser + relaxed G-HR3/G-HR4 gates for empty Qdrant | — |
| 2026-05-09T11:16:16Z | `f41951c` | `mcp` | fix(mcp): tools/list _zod crash — z.record(z.any()) zod-3 single-arg syntax | `src/mcp` |

## ✨ Feat (26)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-10T18:42:30Z | `783f3a6` | `mcp` | feat(mcp): research.synthesize → legal-ai-langgraph:8091 (89th tool) | `src/mcp` |
| 2026-05-10T17:38:39Z | `0176f40` | `sw` | feat(sw): Phase D offline analytics queue (CACHE_VERSION v1.6.0) | `lib/client`, `server/ai` |
| 2026-05-10T17:38:36Z | `22e920c` | `evidence` | feat(evidence): SSE /api/evidence/[id]/analyze/stream — Phase 3 Item 6 | `analyze/stream` |
| 2026-05-10T16:20:05Z | `ffe166d` | `intent` | feat(intent): Phase C demo page at /intent-chat | `(dev)/intent-chat` |
| 2026-05-10T16:03:59Z | `027ab92` | `sw+intent` | feat(sw+intent): Phase C SW telemetry + contextual-chat store + dispatch tests | `lib/stores`, `telemetry/batch` |
| 2026-05-10T16:01:14Z | `db2dc5d` | `intent` | feat(intent): Phase B intent-router + /api/ai/intent-dispatch route | `server/ai`, `server/mcp`, `ai/intent-dispatch` |
| 2026-05-10T15:21:16Z | `8d2dbea` | `rag` | feat(rag): RAG_RRF_ENABLED canary in /api/rag/search for legal queries | `lib/server`, `rag/search` |
| 2026-05-10T14:48:37Z | `8744cf7` | `intent` | feat(intent): Phase A regex intent classifier — pure module + 31 tests | `lib/intent` |
| 2026-05-10T14:37:20Z | `e061beb` | `retrieval` | feat(retrieval): wire RRF into new /api/rag/search-fused endpoint | `rag/search-fused` |
| 2026-05-10T14:19:05Z | `5b9ad41` | `retrieval` | feat(retrieval): Phase 1 sparse+dense lane — tsvector + RRF + BM25 | `server/retrieval` |
| 2026-05-10T02:45:46Z | `ef56774` | `speculative` | feat(speculative): wire gemma3:270m as draft model for llama-server speculative decoding | — |
| 2026-05-10T02:24:39Z | `021e52c` | `agent` | feat(agent): wire Langfuse tracing + Redis pattern recall into agentic-error-fix | — |
| 2026-05-10T02:05:53Z | `103a6a4` | `ace` | feat(ace): QueryRouter4x4 dispatch + web_search L10 lane + smoke 10/10 | `server/ace`, `server/routing`, `services/knowledge-search` |
| 2026-05-10T00:48:21Z | `649b9da` | `mcp+image` | feat(mcp+image): image.enrich_tags MCP tool + batch enrichment script (78 tools) | `src/mcp` |
| 2026-05-10T00:43:12Z | `97d791a` | `mcp` | feat(mcp): image search tools — 4 new TRACE MCP tools (77 total) | `src/mcp` |
| 2026-05-09T23:45:09Z | `9062cb5` | `evidence+synth` | feat(evidence+synth): image search UI + GRPO synthesis loop scripts | `components/evidence`, `server/vector`, `evidence/search-by-image` |
| 2026-05-09T20:40:12Z | `fd81867` | `karpathy` | feat(karpathy): GPU batch stream log, AGENTS.md T1 patch, lane atlas, ACE hit-rate | — |
| 2026-05-09T20:31:28Z | `3f320f6` | `hyperrag` | feat(hyperrag): HyperRAG Feature Atlas + Trust-Tier system (§1-§13 blueprint) | `server/ace`, `server/db`, `src/mcp` |
| 2026-05-09T19:51:13Z | `d3bfc92` | `session` | feat(session): browser-context lane, admin AI chat, external research agent, mcp:tail-errors, smoke  | `components/admin`, `server/admin`, `server/ai` |
| 2026-05-09T19:43:51Z | `d6f23e5` | `mcp` | feat(mcp): un-gate canonical tools, fix ioredis cold-starts, expand multi-lane, wire prior-fix recal | `server/ace`, `src/mcp` |
| 2026-05-09T11:42:14Z | `f23fcbc` | `claude-code` | feat(claude-code): Phase D — PreToolUse deny + PostToolUse audit hooks | — |
| 2026-05-09T11:28:04Z | `972caef` | `synth` | feat(synth): Phase C — Gemma4 ⇄ MCP synthesis loop CLI | — |
| 2026-05-09T10:30:23Z | `1a39486` | `mcp` | feat(mcp): Phase B — read-only db.* inspection tools + G33 gate | `src/mcp` |
| 2026-05-09T10:22:57Z | `0818601` | `mcp` | feat(mcp): adopted MCP servers (enabled:false) + smoke probe + plan amendments | — |
| 2026-05-09T09:46:35Z | `2970e39` | `mcp` | feat(mcp): gemma4-offload stdio MCP + G29/G30/G31 validator gates | — |
| 2026-05-09T09:26:14Z | `9b51ec1` | `validate` | feat(validate): add G26+G27 TurboQuant gates + G25 backend diagnostics | — |

## ♻️ Refactor (1)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-10T18:43:18Z | `4cd6a4f` | `services` | refactor(services): split lib/services server-only items to lib/server/services (PR-2) | `server/ace`, `server/cache`, `server/db` |

## 🔩 Chore (6)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-10T18:12:05Z | `c37183e` | `vscode` | chore(vscode): 7 Hermes Agent + Ollama setup tasks | — |
| 2026-05-10T17:34:31Z | `01bc0a5` | `PR-1 consolidation cleanup` | chore: delete 30 dead artifact files (PR-1 consolidation cleanup) | `api/v1`, `server/cases`, `server/db` |
| 2026-05-10T13:30:38Z | `ac4bc0f` | — | chore: gitignore graphify per-run output snapshots | — |
| 2026-05-09T19:53:53Z | `11485b5` | `graphify` | chore(graphify): final graph + memory snapshot update | — |
| 2026-05-09T19:52:47Z | `d98e5f8` | `graphify` | chore(graphify): second regeneration pass — obsidian indexes, memory atlas, AGENTS.md hierarchy | `src`, `src/lib`, `lib/ai` |
| 2026-05-09T19:49:36Z | `694bdbe` | `graphify` | chore(graphify): regenerate codebase graph, obsidian clusters, atlas index, AGENTS.md hierarchy | — |

## 🧪 Test (1)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-10T14:42:36Z | `6fa420b` | `retrieval` | test(retrieval): Phase 1E — sparse-bm25 + rag-search-fused tests + SW design doc | `lib/client`, `[id]/view` |

## 📝 Docs (11)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-10T19:04:55Z | `b74cdec` | `audit` | docs(audit): feature x spec x implementation audit (2026-05-11) | — |
| 2026-05-10T18:29:55Z | `38e7663` | `langgraph` | docs(langgraph): deferred plan for second LangGraph worker (background flows) | `server/services`, `services/error-analysis`, `services/knowledge-search` |
| 2026-05-10T17:08:37Z | `17eb2ab` | `rotorquant` | docs(rotorquant): integration notes + cache hierarchy + bitnet.c eval | — |
| 2026-05-10T16:58:49Z | `a640e92` | `research` | docs(research): next-steps research + Claude Code/Codex prompt checklist | — |
| 2026-05-10T16:16:28Z | `239ab18` | `checklist` | docs(checklist): full-stack legal-AI Claude Code prompt checklist + IntentBadge | `components/intent` |
| 2026-05-10T14:09:22Z | `e00a4db` | `master` | docs(master): append 2026-05-10 session synthesis + create admin_raptor_summaries | — |
| 2026-05-09T11:34:24Z | `a30c9f4` | `arch` | docs(arch): Hermes Agent + WSL2 + local Gemma4 integration guide | — |
| 2026-05-09T10:42:41Z | `f2997d8` | `mcp` | docs(mcp): bisect runbook for tools/list _zod crash | — |
| 2026-05-09T10:15:13Z | `7b46c77` | `arch` | docs(arch): 2026 MCP ecosystem survey + revised Phase B (adopt vs build) | — |
| 2026-05-09T10:08:20Z | `332a2df` | — | docs+config: Gemma4↔Claude Code synthesis loop plan + 4 skills + 4 subagents | — |
| 2026-05-09T09:54:17Z | `6df1cd1` | `arch` | docs(arch): Claude Code agent-OS + Drizzle MCP + store alignment | — |

## 📌 Other (1)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-10T05:21:45Z | `61c9fe9` | — | 510_26 | `client/wgsl`, `components/admin`, `components/evidence` |
