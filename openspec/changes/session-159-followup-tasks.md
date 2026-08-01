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

## Open — next session, priority order

### 1. `/api/health` route crash (found, not fixed)
- **File**: `sveltekit-frontend/src/routes/api/health/+server.ts:161`
- **Error**: `TypeError: Cannot read properties of undefined (reading 'replace')`
- **Evidence**: captured live from standalone `npx vite dev` run, `/tmp/session-159/vite-standalone.log`
- **Next step**: read line 161, identify the undefined value being `.replace()`'d (likely a version string, env var, or Redis response field)

### 2. `/api/health`'s Redis client — same NOAUTH pattern as TRACE MCP, different file
- **Evidence**: `[ioredis] Unhandled error event: ReplyError: NOAUTH Authentication required.` in the same log, immediately after the `/api/health` 500
- **Next step**: `rg -n "new Redis\(" sveltekit-frontend/src/routes/api/health` and any modules it imports; apply the same `password` fix pattern as commit `4b6597bb7c`. Given this pattern has now appeared in 4+ independent files (trace-mcp-server.ts, engram_tools.ts, lib/server/mcp/server.ts, and now something feeding /api/health), consider a repo-wide sweep: `rg -n "new Redis\(" --type ts --type mjs -g '!node_modules'` and check every hit for a `password` field.

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
