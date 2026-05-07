# Agent Timeline

> Generated: 2026-05-07T21:47:25Z | 60 commits
> Used by agents for temporal retrieval — correlate errors, fixes, and features with timestamps.
> Source: git log + Redis KAG notes + Qdrant embedding index.

## 🔧 Fix (26)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-07T14:45:46Z | `f8e395e` | `gds` | fix(gds): expand path-alias matching to close Qdrant 14% miss | — |
| 2026-05-07T14:41:31Z | `4351c88` | `agent` | fix(agent): robust parseToolRequest + clean up gemma4-tool-call smoke | `server/ai` |
| 2026-05-07T14:06:23Z | `c98786c` | `scripts` | fix(scripts): add graphify:cluster and graphify:cluster:fast alias scripts | — |
| 2026-05-07T14:04:11Z | `70aedaf` | `smoke` | fix(smoke): correct GDS 2.x API mismatches in smoke-neo4j-graph-enrich (10/10) | — |
| 2026-05-07T13:57:48Z | `c1030ec` | `smoke` | fix(smoke): GDS9 column name from_file → source_file in neo4j smoke test | — |
| 2026-05-07T13:56:37Z | `693d178` | `ui` | fix(ui): wire YoRHaTable select-all, remove TagInput noop, add mcp:legacy scripts | `components/ui`, `components/yorha`, `yorha/components` |
| 2026-05-07T13:43:31Z | `a065c8a` | `g17` | fix(g17): clear remaining localhost scan to zero violations | `lib/server`, `server/db` |
| 2026-05-07T13:10:37Z | `d89302e` | `gds` | fix(gds): multi-alias Qdrant indexing to eliminate silent enrichment misses | — |
| 2026-05-07T13:05:07Z | `84fbe78` | `mcp` | fix(mcp): wire dev:agent to trace-mcp-server.ts (HTTP :8788) for Gemma4 agentic calls | — |
| 2026-05-07T13:04:44Z | `8ad75b6` | `g17` | fix(g17): remove accidental localhost URL fallbacks from server clients | `server/ai`, `server/chrrom`, `server/config` |
| 2026-05-07T12:59:13Z | `2d1ea79` | `gds` | fix(gds): patch Qdrant for all chunks per file with normalised path lookup | `server/db` |
| 2026-05-07T12:56:09Z | `fd97b5c` | `g17` | fix(g17): eliminate hardcoded localhost URLs outside env.server.ts | `server/ai`, `server/chrrom`, `server/db` |
| 2026-05-07T12:54:11Z | `83b032a` | `g17` | fix(g17): complete G17 localhost audit — 0 remaining process.env URL fallbacks | `agent/tools`, `server/analytics`, `server/cache` |
| 2026-05-07T12:21:28Z | `e3f3210` | `g17` | fix(g17): batch-remove remaining localhost fallbacks via fix-g17-localhost.mjs | `server/ace`, `server/ai`, `server/analytics` |
| 2026-05-07T12:20:10Z | `722b3bf` | `g17` | fix(g17): remove hardcoded localhost fallbacks; bulk chunk inserts; Zod validation | `server/ace`, `server/ai`, `server/cache` |
| 2026-05-07T12:15:10Z | `605e148` | `pipeline` | fix(pipeline): close authority run-dir, stale GDS projection, and tsgo errors | `lib/server` |
| 2026-05-07T09:55:38Z | `4f2e4f0` | `tsgo` | fix(tsgo): resolve 26 tsgo TS2339/TS2769/TS2304/TS2614 errors across 4 files | `server/ace`, `server/mcp`, `src/mcp` |
| 2026-05-07T09:52:58Z | `7f90da3` | `pipeline` | fix(pipeline): fix authority→Qdrant mirror chain + wire-synthesis Qdrant integer filter | `server/inference` |
| 2026-05-07T09:38:58Z | `922fed6` | `mcp+tests` | fix(mcp+tests): remove duplicate clusters.get_summary_lenses, patch 595 auto-stubs for HttpError | `src/mcp` |
| 2026-05-06T22:03:16Z | `ac11424` | `mcp` | fix(mcp): z.record() key type to z.string() for TS strict mode | `src/mcp` |
| 2026-05-06T22:02:57Z | `424aac7` | `agent` | fix(agent): pass goRetrievalHits to dispatchTool call site | `server/ai` |
| 2026-05-06T22:00:22Z | `261f2ab` | `agent` | fix(agent): add GoHit type + goRetrievalHits param to dispatchTool | `server/ai` |
| 2026-05-06T21:52:42Z | `0b4508c` | `ace` | fix(ace): close gap_synth_004 + gap_synth_005 — GDS scheduling + rerank writeback | — |
| 2026-05-06T21:47:08Z | `ff2b975` | `agent` | fix(agent): gemma4 tool definitions + TRACE CLAUDE.md update | `server/ai` |
| 2026-05-06T21:44:58Z | `adbfa87` | `ace` | fix(ace): close ACE relation sampling gap — all 12 files now resolve | `server/ace`, `server/ai`, `server/gpu` |
| 2026-05-06T10:09:55Z | `828115b` | `mcp` | fix(mcp): neo4j default password matches .env + topology path payload fix | `src/mcp` |

## ✨ Feat (23)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-07T14:33:08Z | `504530d` | `smoke` | feat(smoke): add agent roundtrip smoke scripts | — |
| 2026-05-07T14:14:44Z | `926f82c` | `health` | feat(health): check-all-tools 42-gate probe, 35 PASS 0 FAIL | — |
| 2026-05-07T08:51:51Z | `c383b6f` | `startup` | feat(startup): write startup_health/pids/bg-jobs artifacts; stability-test run-dir output; docs/star | — |
| 2026-05-07T08:43:16Z | `a20c7e3` | `startup+synthesis` | feat(startup+synthesis): TurboQuant stability gate, Node orchestrator, audit pipeline, fetch-rerank  | `server/ace`, `server/observability`, `server/search` |
| 2026-05-07T08:18:22Z | `f9c4363` | `startup` | feat(startup): parallel Full AI Stack VS Code task + 28-step audit | — |
| 2026-05-07T07:57:55Z | `da00f77` | `graph` | feat(graph): cluster→AGENTS.md index for fast ACE retrieval hits | — |
| 2026-05-07T03:24:27Z | `d25a3dd` | `tile-engine` | feat(tile-engine): SemanticTile, TileEngineTrace, standardized quaternion pipeline | `server/ace`, `server/search` |
| 2026-05-07T03:13:35Z | `ab0bf76` | `topology` | feat(topology): standardise manifold4 axes before quaternion projection | `server/search` |
| 2026-05-07T03:09:49Z | `0bb819a` | `mcp` | feat(mcp): rank FastMCP tools by HMM state and gain history | `server/mcp` |
| 2026-05-06T22:43:13Z | `0dd56c0` | `mcp` | feat(mcp): Redis 24hr ACE hits cache for trace.kag_search | `server/ace`, `src/mcp` |
| 2026-05-06T22:34:59Z | `e4aec21` | `mcp+feedback` | feat(mcp+feedback): normalizeJsonFilter, search.go_hybrid hardening + 19 tests | `src/mcp` |
| 2026-05-06T22:24:43Z | `6230d7e` | `mapreduce` | feat(mapreduce): harden reduce-neo4j + add 16 unit tests | — |
| 2026-05-06T22:05:51Z | `dab8fd3` | `ace` | feat(ace): add glyph_cluster lane to multi-lane-retrieval | `server/ace` |
| 2026-05-06T22:02:43Z | `506932b` | `agent` | feat(agent): expose goToolClusterContext in A2A task response | `ai/agent` |
| 2026-05-06T21:59:43Z | `3203337` | `agent` | feat(agent): inject Go cluster context + complete synthesis memory archival | `server/ai` |
| 2026-05-06T21:58:17Z | `cc52e37` | `ace` | feat(ace): chain both rerank writeback scripts in graphify:full | — |
| 2026-05-06T21:57:34Z | `f274104` | `ace` | feat(ace): detailed rerank breakdown writeback + synthesis TODO docs | — |
| 2026-05-06T21:57:26Z | `84f2aae` | `mcp+authority` | feat(mcp+authority): inline neo4j-gds logic + normalized retrieval result types | `src/mcp` |
| 2026-05-06T21:46:52Z | `5ee99d1` | `proto+config` | feat(proto+config): TRACE proto contracts + memory artifacts + vitest config | — |
| 2026-05-06T21:46:38Z | `ba49ab8` | `scripts` | feat(scripts): wiki/mapreduce/graph pipeline scripts | — |
| 2026-05-06T21:46:24Z | `9e63706` | `db+routes` | feat(db+routes): code_relations + error_fingerprints schema + API routes | `server/db`, `pipeline/events`, `analytics/feedback` |
| 2026-05-06T21:46:10Z | `19ad36a` | `ace` | feat(ace): add ACE spine modules + graph/wiki infrastructure | `server/ace`, `server/agents`, `server/analytics` |
| 2026-05-06T10:05:24Z | `6055b01` | `indexer` | feat(indexer): extend worker pool with chunk/hash/metadata/qdrant_payload tasks | `server/workers`, `lib/workers` |

## ♻️ Refactor (1)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-07T13:49:19Z | `c486e66` | `ace` | refactor(ace): migrate ACE Qdrant access to unified-client singleton | `server/ace` |

## 🔩 Chore (6)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-07T13:45:00Z | `7b6408f` | `graphify` | chore(graphify): update graph artifacts + GDS run snapshots after G17 sweep | — |
| 2026-05-07T13:36:11Z | `e7631b7` | `synth` | chore(synth): mark G17 resolved + exempt config.ts from localhost gate | — |
| 2026-05-07T13:05:46Z | `7f1195e` | `quaternion` | chore(quaternion): add deferred CUDA batch similarity TODO | `server/search` |
| 2026-05-07T12:21:40Z | `a1ac60a` | `scripts` | chore(scripts): add fix-g17-localhost.mjs batch fixer script | — |
| 2026-05-07T12:20:24Z | `dd0c27c` | `graphify` | chore(graphify): update pipeline artifacts from 2026-05-07 full run | — |
| 2026-05-06T21:59:11Z | `e8cd15d` | `agents+graph` | chore(agents+graph): regenerated AGENTS.md files + graphify artifact refresh | `src`, `src/lib`, `lib/ai` |

## 🧪 Test (1)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-06T21:54:04Z | `24861c0` | `smoke` | test(smoke): 7-gate GRT smoke for Go-backed MCP tool cascade | — |

## 📝 Docs (1)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-06T21:47:20Z | `d95542b` | `claude` | docs(claude): add TurboQuant ICLR 2026 paper notes + KV cache policy update | — |

## 📌 Other (2)

| Timestamp | Hash | Scope | Subject | Dirs |
|-----------|------|-------|---------|------|
| 2026-05-07T03:27:39Z | `0a450c5` | — | memory_logs_56_26 | `server/ace`, `server/ai`, `server/analytics` |
| 2026-05-06T16:21:43Z | `895042d` | — | 56_26_almost_there | `src`, `src/lib`, `lib/ai` |
