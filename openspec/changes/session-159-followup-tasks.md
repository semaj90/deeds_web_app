# OpenSpec: Session 159 Follow-Up — Open Items

**Status**: NOT_PROVEN (open items) / PROVEN (closed items, evidence linked)
**Origin**: Session 159 — MCP Redis auth, graphify apply failures, 384→768/512 embedding migration, llama-server duplicate-launch race, SvelteKit dev server diagnosis.

## Closed this session (evidence: commit hash + runtime proof)

| Item | Commit | Evidence |
|---|---|---|
| TRACE MCP Redis NOAUTH (all clients missing password) | `4b6597bb7c` | `/health` verified live: `degraded:false, redis.ok:true` |
| Graphify semantic-stage success gate structurally unreachable | `992690a55c` | `atlas:phase109b:workflow:dry` exit 0 (was exit 1) |
| ENOBUFS in `materialize-feature-envelopes.mts` (docker-exec-psql → pg.Pool) | `3b40e4c762` | `--apply` run: 20/20 batches, `with_envelope: 60251/61659` |
| graphify:daily:chain 5min execSync timeout too short | `7588eedf0a` | Chain progressed past 111K Postgres writes (prior runs died at 29K–58K) |
| 384-dim retrieval lane using invalid MRL boundary, priority:1 in fusion | `776f6b55bc` | `retrieval384` marked `blocked`/`legacy`; `QdrantLane384.config().enabled = false` |
| 384-dim script sweep → 768/512 counterparts | `4e7da6c144`, `2b5ae4aa35` | `rebuild-gemma4-summaries-768.mjs` DRY_RUN_PROVEN against live Gemma4/Ollama; `create-qdrant-codebase-768.mjs` safety guard tested against live 105K-point collection |
| llama-server duplicate-launch race (3 folderOpen tasks racing on :8090) | `0e84321503` | Cold-start proxy proof: 1 process, 1 listener, PID 40712, `hforf.gguf`, no `--mmproj`, VRAM 7531/8192 MiB (was 2 processes, 7007 MiB, near-OOM) |
| Graphify pipeline lock: no PID-liveness check + unconditional release-on-failure (loser deletes winner's lock) | `43824e4fcf` | Syntax verified; not yet exercised under a real concurrent-run test |
| `/api/health` TypeError crash (`ENV.COUCHDB_URL.replace` on undefined) + ~15 other missing ENV keys + `SEAWEED_MASTER_PORT` export | `45f58ee958`, corrected by `a0bab29896` | Live: `GET /api/health` → `{"status":"healthy"}`, all configured checks `ok:true` (was uncaught 500) |
| Root cause behind the above: `vite dev`/`npm run dev` never loads `.env` into `process.env` at all (vite.config.ts opts out of loadEnv, nothing calls dotenv.config()) — every `process.env.*` read across src/lib/server, src/mcp, scripts was silently `undefined` | `a0bab29896` | **Correction after review** — `45f58ee958`'s fix (self-loading dotenv inside `env.server.ts` + guessed localhost defaults for optional services, including a placeholder CouchDB credential) was architecturally wrong: env loading belongs in the entrypoint, env parsing belongs in the shared module, and unconfigured optional services should report `not_configured`, not a fake URL. `a0bab29896` reverted `env.server.ts` to a pure parser (no dotenv import, no fake service-URL defaults), wired `loadRuntimeEnv()` into `vite.config.ts` (the real Node entrypoint for `vite dev`, mirroring the pattern `scripts/ensure-mcp-server.mjs` already used), and reworked `/api/health` with a `ProbeStatus` type (`ok`/`error`/`not_configured`/`disabled`) so unset optional URLs never trigger a connection attempt. Re-verified live: healthy status, no duplicate ENV keys, no dotenv call in env.server.ts, no credential leakage in the response body |
| Redis NOAUTH sweep, round 2 — 7 more unguarded `new Redis(...)` call sites in the live app (src/mcp/server.ts getMcpRedis — a *different* file from the one fixed in `4b6597bb7c`; error-brain/transport/redis.ts; redis-disposable.ts; observability/cache-logger.ts; cache/cache-invalidation.ts; search/hybrid-search.ts x2; browser-context/snapshot/+server.ts) | `924d6458b3` | Grep-verified all 26 files / 54 `new Redis(` call sites in `src/` now have a `password` field, either via explicit option or an already-guarded factory (valkey-client.ts, redis.ts, redis-cache-aggressive.ts, connection-pool.ts, dispatch/mcp-tool-implementations.ts, ace/*, retrieval/*, atlas/runtime-cache-telemetry.ts) |

## Open — next session, priority order

### 1. `scripts/**` still has ~219 unguarded `new Redis(...)` call sites (deliberately out of scope this pass)
- Standalone CLI/backfill/smoke scripts under `sveltekit-frontend/scripts/` and `scripts/` — not the running server, so left untouched to keep the health-crash commits scoped.
- **Next step**: `node -e "..."` scan pattern used this session (see session transcript) can be re-run to regenerate the list; most already read `REDIS_URL`/`redisOptions` from a shared helper (e.g. `redisOpts()`) so the real fix count is probably much smaller than 219 raw hits — many share one helper function. Worth auditing the *helpers* first (`redisOpts`, `REDIS_CONFIG`, `redisOptions` locals) rather than each call site individually.

### 2. RabbitMQ login failure — NOT reproducing under the corrected env loading (downgrade from previous entry)
- Seen once under the reverted-then-corrected `env.server.ts` self-dotenv-load approach: `❌ RabbitMQ initialization failed: ... 403 (ACCESS-REFUSED) ...`. Under the corrected fix (`loadRuntimeEnv()` in `vite.config.ts`, commit `a0bab29896`), the same dev server boot shows `✅ RabbitMQ connected`, `👂 All 20 RabbitMQ consumers started` — no auth failure.
- Likely explanation: the reverted approach's `env.server.ts` called `loadDotenv({ path: '.env.local', override: true })`, which could clobber a correct `.env`-level `RABBITMQ_URL` with a stale `.env.local` value. `loadRuntimeEnv()` only sets a var if `process.env[key] === undefined` (no override), which is the more correct precedence.
- **No action needed** unless it reproduces again — leaving this noted in case it resurfaces.

### 3. Chat template alignment for `hforf.gguf` — NOT_YET_PROVEN
- **Concern**: `hforf.gguf` is launched with `--chat-template-file custom_pub_chat_template_gemma4.jinja` — a Gemma4-specific template applied regardless of model. Health-check passing only proves the model loaded and the HTTP endpoint responds; it does NOT prove chat formatting, tool-call syntax, or turn markers are correct for this specific model.
- **Validation sequence** (run in order, stop at first failure):
  1. Plain completion smoke — `POST /v1/completions`, deterministic prompt
  2. Chat completion smoke — `POST /v1/chat/completions`, system+user, no tools
  3. Structured JSON smoke — request a minimal object, validate with `JSON.parse`
  4. Tool-call smoke — one trivial tool (e.g. `echo(value: string)`), verify tool name/args, no leaked turn markers, no malformed wrappers, no duplicate assistant content
  5. Bifrost path — same model through the real Bifrost endpoint
  6. MCP path — one harmless MCP tool through the actual agent route
- Only after all 6 pass: mark `CHAT_TEMPLATE_ALIGNMENT: PROVEN`

### 4. Idempotency proof for the folderOpen fix — NOT_YET_PROVEN (proxy-tested only)
- Session 159's cold-start proof used a manual proxy invocation (kill processes → run canonical task's command directly), not an actual VS Code window close/reopen — outside tool capability.
- **Next step** (requires operator): close every VS Code window on this workspace, reopen exactly one, then run the same verification (process count, listener count, command line, health, VRAM). Then deliberately open a **second** VS Code window and confirm the launcher detects the healthy server and exits without spawning a duplicate — this is the actual idempotency proof, not just single-window behavior.

### 5. Stale references to old 384-dim scripts in still-live tasks/npm scripts
- `.vscode/tasks.json` → `"🚀 Phase 85 P6: Summary Generation (Startup Dry-Run)"` still calls `npm run atlas:p6:rebuild:summaries:dry` (384 alias), not the new `atlas:p6:rebuild:summaries:768:dry`.
- Not fixed — flagged only, since it's a low-risk dry-run startup task, not touched to keep commit scope clean per operator instruction (embedding migration vs. startup-fix vs. this cleanup should stay separate).

### 6. `graphify:daily` still on `runOn: folderOpen`
- `"🗺️ Startup: Auto-Map Codebase (graphify:daily)"` fires on every VS Code folder open. Given graphify:daily's chain now has real headroom (3h timeout, fixed lock) this is less risky than before, but it's still a multi-minute-to-hour background job firing unconditionally on every workspace open. Not touched this session — flag for operator decision (keep auto, or move to manual/cooldown-gated).

## Do not repeat these mistakes (process notes for next session)

- **Task-notification summaries claiming an exit code are unreliable** — this session caught two false "exit code 0" claims where the actual captured exit code was 1. Always embed a literal `echo "REAL_EXIT_CODE:$?"` in backgrounded commands and grep for it directly; never trust the notification summary alone.
- **`packages/atlas-duckdb/`** is entirely gitignored (`.gitignore:208: **/[Pp]ackages/*`) — edits there are real on disk but never committed. Don't assume a fix "shipped" if it touched that directory.
- **Multiple `runOn: folderOpen` VS Code tasks can independently target the same port** — `dependsOn` chains do NOT prevent this; a task with its own separate `runOn: folderOpen` will still fire its dependencies even if those dependencies had their own folderOpen trigger removed.

## MCP server canonical identity (resolved) + one open to-do

**Which of the 3 MCP server files is real** — cross-checked against both live client configs (`.mcp.json` for Claude, `.opencode/opencode.jsonc` for OpenCode), not assumed:
- `sveltekit-frontend/src/mcp/trace-mcp-server.ts` — **canonical HTTP server** (port 8788). Referenced by Claude's `.mcp.json` `"trace"` entry AND OpenCode's `opencode.jsonc` `"trace"` entry. Confirmed live: `curl http://127.0.0.1:8788/health` → 200.
- `sveltekit-frontend/src/mcp/server.ts` — **canonical stdio server**. Referenced by Claude's `.mcp.json` `"atlas-tools"` entry AND imported by `src/routes/api/mcp/+server.ts`.
- `sveltekit-frontend/src/lib/server/mcp/server.ts` — **dead duplicate** of `src/mcp/server.ts` (same 85 tool names, 11,336/11,332 differing lines). Zero references in either client config, zero route imports. Candidate for archival per this repo's archive-not-delete convention (`deeds_labs/archive/` + manifest) — not yet actioned, needs operator sign-off since it's ~5,865 lines.

**Open to-do**: `trace-mcp-server.ts` had a self-acknowledged bug 4 days before this entry (commit `94f82622fe`, 2026-07-30, titled "getting errors # LangGraph Optionalization in TRACE MCP") — a TDZ crash (`LangGraphBridge` instantiated before `pool`/`engramBridge` were ready, "Cannot access 'pool' before initialization"). That commit fixed the ordering and added a `TRACE_LANGGRAPH_ENABLED` feature flag (default `true`). Server is confirmed live now (health check passes), but **the LangGraph bridge itself has not been re-verified end-to-end** since that fix — only "server doesn't crash" is proven, not "LangGraph routing actually works." Next step: exercise a LangGraph-routed tool call through trace-mcp and confirm no regression, rather than assuming health-check-passing implies the bridge itself is healthy.

**RESOLVED (2026-08-01, later same day)**: `src/lib/server/mcp/server.ts` archived (commit `158ec39263`) — confirmed dead via identical-symbol-count comparison against the canonical `src/mcp/server.ts` (ACP bootstrap, phase109a tools, atlas semantic tools, LDR, phase18 reranker all matched exactly) plus zero references in `.mcp.json`/`opencode.jsonc`/`api/mcp` route. Recoverable at `deeds_labs/archive/2026-08-01/lib-server-mcp-server.ts.bak`, SHA-256 in `docs/archive-manifest.json`.

**RESOLVED (2026-08-01, later same day)**: `"boolean is not defined"` root-caused and fixed. It was NOT deeper in the call chain — it was a literal bare `boolean` (the TypeScript type, not `z.boolean()`) used as a zod schema value in `atlas-mastra-adapter.ts:138`, inside `atlasApplyChangeTool`'s `outputSchema: z.object({ success: boolean, rowsAffected: z.number(), newRevision: z.string() })`. `boolean` has no runtime binding in that file (only ever used as a TS type elsewhere, which erases at compile time), so any request whose module graph touched `atlasApplyChangeTool` — which is statically imported by both `atlas-mastra-workflow.ts` (into `atlasMutationWorkflow.tools`) and the route file itself — threw `ReferenceError: boolean is not defined` at module-evaluation time, before the handler or even the auth guard ran. Fixed by changing it to `z.boolean()`. Verified live: `POST /api/atlas/mastra-agent` with the documented repro now returns a clean `{"error":"Authentication required"}` 401 instead of a 500 crash — proof the module (and all 7 tool schemas in it) now evaluates successfully, since the broken schema was on the static import path that runs before the auth check.

## Phase 11 addendum (2026-08-02): Postgres side is NOT empty — corrects "no canonical writer" framing

Bounded Postgres inventory (per operator's "inventory canonical Postgres centroid tables" ask). The Phase 11 audit below only checked Redis/Valkey; the **Postgres layer actually has real, populated centroid data** — the gap is a Redis *projection* + retrieval-*reader* gap, not a total absence of canonical centroid data:

- `qdrant_centroid_clusters` (202 rows) — `cluster_key` format `node:{row}:{col}` (a **9th** distinct naming scheme, on top of the 8 already found in code), `collection_name = 'global-legal'` (not `codebase_chunks_768`), `member_count`, `page_rank`, `directory_paths`, `tags`. Stale: last `updated_at` 2026-05-10 — a single batch run, not continuously maintained.
- `gpu_cluster_centroids` (64 rows) — `cluster_id`, real `centroid_vec` (`real[]`, actual vectors), `cluster_type = 'kmeans_js'`, `topo_class`/`topo_byte`, `chunk_count`. Stale: last `updated_at` 2026-07-14.
- No Qdrant collection has "centroid" in its name — if centroid data is ever projected to Qdrant, it would need to live as payload fields on an existing collection, not a dedicated collection.

**Correction to prior framing**: "no canonical centroid writer" was true for the Redis/Valkey layer specifically, not for Postgres. Any future `parent-atlas-centroid-projection-v1` change (per `openspec/changes/parent-atlas-runtime-ownership-precall/proposal.md`'s decomposition list) should treat these two Postgres tables as candidate canonical sources to project *from*, not start from zero — but note they're both stale (no active writer currently keeping them fresh) and use yet another naming scheme (`node:{row}:{col}`) distinct from all 8 found in application code.

## Phase 11 (centroid Valkey key contract) — bounded audit complete, 2026-08-01 later same day

Scoped-down slice of the Phase 5 proposal per operator choice ("scope to one bounded piece"): audited whether the Redis/Valkey centroid key contract CLAUDE.md documents as canonical (`bifrost:packet:{packet_key}`, `centroid:directory:{hash}`, `centroid:feature:{feature_id}`, `centroid:packet:{packet_key}`) actually exists live. **It does not.**

**Live Redis state** (`docker exec legal-ai-valkey redis-cli`, 46,756 total keys, verified via `--scan`):
- `centroid:*` — **0 keys**, any pattern
- `bifrost:packet:*` — **0 keys** (note: live keys use `bitfrost:` — different spelling — not `bifrost:`)
- Dominant real namespaces: `gpu:som:*` (32,698 keys, `{"row","col","distance"}`, ~73h TTL), `gpu:autoencoder:*` (9,000), `bitfrost:summary:*` (4,828, richer packet-shaped JSON: `packet_id/packet_ulid/packet_key/source_ref/canonical_source_ref/file_path`)
- `ace:packet:*` (6 keys sampled) — distinct query-result cache shape (`query`, `query_hash`, `source_refs`, `feature_ids`, `som_cluster`, `kag_hits`, `dag_hits`), unrelated to the centroid contract
- `gpu:karpathy:clusters` (1 hash) exists; `gpu:karpathy:scores` (the hash CLAUDE.md documents) does **not**

**In code**: found ≥8 mutually-incompatible `centroid:*` key-naming schemes written across different sessions/scripts, none matching the documented contract exactly: `centroid:v1:{clusterId}` (`cache/tensor-similarity-cache.ts`), `centroid:{candidateId}:{version}` (`embedding/knn-helper.ts`), `centroid:{communityId}` (`benchmark-gpu-primitives.mjs`), `centroid:packet:{id}` (`phase7-postgres-persistence.mts`, and a `.del()` in `semantic-contracts/predictions/promote/+server.ts`), `centroid:{row}:{col}` (`phase7-redis-centroid-warming{,-fast}.mjs`), `centroid:cluster:{i}` (`phase8-9-orchestrator.mjs`, `phase8-acceleration-cache-layer.mjs`), `centroid:som:{clusterId}` (`phase8a-som-centroid-cache.mjs`, `phase9-bitfrost-semantic-cache.mjs`), `atlas:centroid:feature:{featureId}` (`taxonomy-topology-packet.ts`, prefixed differently from the plain `centroid:feature:*` the CLAUDE.md contract names).

**Live-code consequence found**: `src/lib/server/retrieval/parallel-orchestrator.ts:183` — a real search lane in the parallel retrieval orchestrator — runs `redis.keys('centroid:feature:*')` on every call. Since zero keys currently match, this lane silently contributes zero results on every invocation, with no error, no log, no visible signal that it's dead. Not fixed (out of scope for an audit-only pass) — flagged here so it isn't mistaken for "working but empty by chance."

**Verdict on Phase 5's premise**: the proposal assumed a settled, single centroid key contract to build a pre-call hook and semantic-cache layer against. That contract does not exist — 8 divergent naming schemes exist instead, none currently warmed. Any pre-call/cache-key work from the Phase 5 proposal needs a **consolidation decision** (which scheme becomes canonical, migrate or archive the other 7) before it can be built on top of. Per this repo's Consolidation Sweep Rules (root CLAUDE.md), that consolidation itself requires an audit report + explicit sign-off before any patching — not folded into this pass.

## Note (2026-08-01, later same day): possible stale `scripts/ingest/turbovec-sidecar.py` — not actioned

Background diff surfaced a second sidecar file, `scripts/ingest/turbovec-sidecar.py` (repo root, "Phase 10B" header, port 8791, 2-bit, `/rerank+/build+/prefilter+/search`, last touched ~June 20–23), distinct from `sveltekit-frontend/scripts/turbovec-sidecar.py` (the one fixed this session for the duplicate-bind bug). Checked whether the earlier turbovec fix targeted the wrong file — it did not: `.vscode/tasks.json:1038` (the real live startup task) launches `sveltekit-frontend/scripts/turbovec-sidecar.py --port 8791 --collection codebase_chunks_768 --dim 64 --bits 4`, confirming that's the genuinely live sidecar. `scripts/ingest/turbovec-sidecar.py` is referenced only by `scripts/turbovec/verify-integration-status.mjs:104`'s `fileExists()` check (a stale status-checker pointing at `docs/reports/TURBOVEC-STATUS-SESSION-74.md`) and several packet-inventory/manifest data files that just mention its path as a string — no actual launcher or npm script runs it. Looks like dead code from a superseded prototype, never archived. Not touched — flagging only, since archival decisions for this repo require the same sign-off pattern used for `src/lib/server/mcp/server.ts` earlier this session, and this wasn't part of the bounded scope agreed for this pass.

## Resume here (next session / after compact)

One open item, now better-scoped than before:

1. **Phase 5 pre-call/canonical-schema architecture — blocked on a centroid-key consolidation decision.** The Phase 11 audit above found 8 mutually-incompatible `centroid:*` Redis key schemes in code and zero live keys under any of them. Before any pre-call hook or semantic-cache-key contract work can start, the operator needs to decide: (a) which of the 8 schemes (or a new one) becomes canonical, (b) whether the other 7 get migrated, archived (deeds_labs/archive convention), or left as dead code, and (c) whether `bitfrost:` (the real live prefix) or `bifrost:` (the documented prefix) is the actual intended spelling — this typo/drift should be resolved explicitly, not silently picked. tRPC presence (Phase 8) and Mastra-as-real-package (confirmed absent, already patched with a shim) remain separately unresolved and out of scope for the centroid piece.
