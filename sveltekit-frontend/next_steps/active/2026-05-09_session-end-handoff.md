# Session-end handoff — 2026-05-09 (late)

> Captured at session limit. Reads top-down: wins → operator actions → open issues → next-session pickup.

## Three big wins this session

### 1. `ensure-mcp-server.mjs` spawn fix — stdio capture works ✅

**Bug**: `cmd.exe /d /c tsx.cmd ...` (3-process indirection) and `{shell:true}` (Node maps to `cmd.exe /d /s /c`) both broke fd inheritance for the grandchild Node process when combined with `detached:true`. Result: `logs/trace-mcp/launch-*.err` and `*.out` were 0 bytes for hours of debugging sessions.

**Fix**: spawn `node` directly with the tsx loader args, bypassing tsx.cmd batch entirely:
```js
const tsxPreflight = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'preflight.cjs');
const tsxLoader    = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs');
const nodeArgs     = ['--require', tsxPreflight, '--import', pathToFileURL(tsxLoader).href, serverEntry];
spawn(process.execPath, nodeArgs, { stdio: ['ignore', outFd, errFd], detached: true, ... });
```

**Verified live**: `.out` grew from 0 → 1699 bytes after one smoke run. Real content captured:
- Startup banner (`TRACE MCP server listening on http://127.0.0.1:8788`)
- `[mcp] DISPATCH tool: codebase.context_for_file` per tool call
- `[ollama-diag] endpoint=/api/embed model=embeddinggemma:latest duration_ms=571 status=200`
- `[qdrant] codebase_chunks_768 using dense-only search (bm25 not configured)`

**Unlocks**: agentic-error-fixing loop is now physically possible. Future MCP exceptions land in `.err` → `mcp:tail-errors` watcher reads → `kag.ingest_error` → `error_fingerprints` Postgres → next session's `kag.recall_similar_fix`.

### 2. Live `:8788` TRACE MCP stable — no more 500s ✅

**Path**: source-level `z.record(z.any())` → `z.record(z.string(), z.any())` two-arg fix (commit `f41951c0ee`) + zod-v4-tools-list-patch.ts wired at `trace-mcp-server.ts:54` + bisect 8/8 PASS + G34 `mcp:zod-record-two-arg` permanent guard.

**Verified live**: PID 39896 returned `tools/list` 200 OK with **41 tools** (parallel writer's later drift fix raises this to ~70+ after next restart). `smoke:atlas` runs end-to-end: 4 PASS / 2 WARN / 11 FAIL — every fail is a **data gap**, not infrastructure (hypergraph_edges empty, atlas Redis cache empty for probe file).

### 3. Phase C synth loop ran live with TRACE MCP ✅

**First clean round-trip** (no degraded mode, no 500s):
```
synth:loop:dry --query "wire browser context lane" --slug browser-context
  → Lane 1: trace.kag_search ✅ (2 bytes, empty), kag.multi_lane_search ✅ (767 bytes), context.build_kv_packet ⚠ (server-side ioredis bug)
  → Lane 2: graph analysis (0 centers — needs hypergraph seed)
  → Lane 3: rerank (0 centers → 0 kept)
  → Lane 4: skipped (--dry-run)
  → all 4 lane files written
```

Lane 1 corrections shipped: `graph.pagerank_top` (not registered) → `kag.multi_lane_search` swap, plus `taskId` arg added to `context.build_kv_packet`.

## Files changed this session

| File | Change |
|---|---|
| `scripts/ensure-mcp-server.mjs` | Spawn fix: bypass cmd.exe + tsx.cmd, spawn node directly with tsx loader args |
| `scripts/synth/run-loop.mjs` | Lane 1 tool name swap + add `taskId`/`hotFiles`/`hotSymbols` to `context.build_kv_packet` |
| `scripts/mcp/tail-and-ingest-errors.mjs` | (parallel writer, 221 lines) chokidar + Redis dedup + `--dry-run` + `--backfill` |
| `package.json` | +3 npm scripts: `mcp:tail-errors`, `mcp:tail-errors:dry`, `mcp:tail-errors:backfill` |
| `scripts/unwrap-optional-registries.mjs` | (parallel writer, one-shot) un-wrapped 22 inline canonical tools from `if (ENABLE_OPTIONAL_REGISTRIES)` |
| `src/mcp/trace-mcp-server.ts` | (parallel writer drift fixes) env-flag split MCP_LEGACY_ALIASES vs MCP_OPTIONAL_REGISTRIES; trace.kag_search un-gated; 22 inline tools un-wrapped (3569 → 3525 lines) |

## Operator action items (in order)

```powershell
# 1. Kill stale MCP + re-spawn (picks up parallel writer's drift fixes too — 22 unwrapped tools come back)
netstat -ano | findstr ":8788" | findstr "LISTENING"
taskkill /F /PID <PID-from-above>
node scripts\ensure-mcp-server.mjs --spawn

# 2. Verify the unwrap landed (tools/list should jump 42 → ~70+)
curl -s -X POST http://127.0.0.1:8788/mcp `
  -H "Content-Type: application/json" `
  -H "Accept: application/json, text/event-stream" `
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' `
  | Select-String -Pattern '"name":' -AllMatches | % { $_.Matches.Count }

# 3. Seed hypergraph (fixes 5 of 11 smoke:atlas FAILs + populates kag.multi_lane_search hits)
npm run hypergraph:seed
npm run hypergraph:seed:lane-b   # if it errors with "lane-b not found", that's the optional 2nd lane

# 4. Start the watcher in background (closes the agentic-error-fixing loop)
npm run mcp:tail-errors          # long-lived; runs forever, ingests new .err blocks live

# 5. Real synth:loop run (no --dry-run, exercises Lane 4 Gemma4)
npm run synth:loop -- --query "wire browser context lane" --slug browser-context
npm run synth:handoff            # records audit + prints Claude Code handoff command

# 6. Hand off to Claude Code (env vars set TurboQuant or remote Anthropic)
$env:ANTHROPIC_BASE_URL = "http://127.0.0.1:8090"   # local Gemma4 via TurboQuant
$env:ANTHROPIC_AUTH_TOKEN = "dummy"
claude code --prompt-file "<briefPath the handoff printed>"
```

## Open issues (not blockers, just queued)

| Issue | Cause | Fix path |
|---|---|---|
| `context.build_kv_packet` returns "Stream isn't writeable, enableOfflineQueue:false" | ioredis cold-start: handler calls Redis command before `await redis.connect()` | ~2-line server-side fix at `trace-mcp-server.ts:1700+` (add `await redis.connect().catch(()=>{})` at handler top) |
| `context_for_file` returns sparse payload (filePath/normalizedPath/promptCards undefined) | Atlas Redis cache empty for probe file `src/lib/server/db/client.ts` | Run codebase indexer / pre-warm atlas cache; investigate which loader populates `ace:atlas:dir:*` keys |
| `kag.multi_lane_search` returns 0 hits across all 5 lanes | hypergraph_edges + ngram + symbol indexes empty | `npm run hypergraph:seed` (operator action #3 above) |
| smoke:atlas P1.7 FAIL on filePath/normalizedPath/promptCards/recommendedActions/provenance shape | Same as atlas cache empty | Same fix as above |
| smoke:atlas P1.8 FAIL on hypergraph.search returning 0 hits | hypergraph_edges empty | Same as #3 above |
| `mcp:tail-errors` backfill found 0 blocks in existing .err files | All `.err` files were 0 bytes pre-spawn-fix | None needed — going forward they'll have content |

## Status snapshot at end of session

| Layer | State |
|---|---|
| Source-level z.record fix + bisect 8/8 + G34 | ✅ shipped, locked |
| `zod-v4-tools-list-patch.ts` wired | ✅ at trace-mcp-server.ts:54 |
| Spawn fix (cmd.exe bypass) | ✅ shipped, verified live |
| Stdio capture | ✅ working — 1699+ bytes per session |
| Live `:8788` MCP | ✅ stable, 41 tools (→ ~70+ after operator restart picks up unwrap) |
| Browser Context Lane smoke 7/7 | ✅ |
| `synth:handoff` companion | ✅ shipped (`scripts/synth/handoff-to-claude.mjs`) |
| `mcp:tail-errors` watcher | ✅ shipped (parallel writer's, 221 lines) + npm scripts wired |
| Phase C synth:loop with live MCP | ✅ runs end-to-end, all 4 lane files written |
| Lane 1 tool corrections | ✅ shipped |
| Hypergraph seed | ❌ pending operator |
| Atlas cache pre-warm | ❌ pending investigation |
| Server-side ioredis cold-start (`context.build_kv_packet`) | ❌ pending (~2-line fix) |
| Phase D hooks | ⏸ deferred per security review |

## Cross-references

- `scripts/ensure-mcp-server.mjs` — spawn fix
- `scripts/synth/run-loop.mjs` — Lane 1 corrections
- `scripts/synth/handoff-to-claude.mjs` — handoff companion
- `scripts/mcp/tail-and-ingest-errors.mjs` — agentic-error-fix watcher
- `scripts/smoke/smoke-mcp-tools-list-bisect.mjs` — bisect (8/8 PASS in isolation)
- `src/mcp/zod-v4-tools-list-patch.ts` — runtime safety net (source-level fix is canonical)
- `scripts/validate/full-system.mjs` — G34 `mcp:zod-record-two-arg` permanent guard at line 786
- `memory/architecture/mcp-mount-smoke-2026-05-09.md` — parallel writer's mount audit (5-7 healthy MCP servers via mcporter)
- `docs/architecture/trace-kag-web-development-guide.md` — 23-section dev guide (yesterday)
- `docs/architecture/trace-runtime-split.md` — runtime boundary rule (yesterday)

## Next-session pickup

1. **Verify operator action items 1-2 above** — tools/list count should be 70+
2. **Either**: fix the server-side `context.build_kv_packet` ioredis cold-start (~2 lines) OR investigate atlas cache empty
3. **Real synth:loop run** with hypergraph seeded — first time Lane 4 Gemma4 will get real evidence
4. **Phase D design** (hooks) when the operational layer is fully green
5. ✅ **DONE** — `docs/architecture/trace-kag-web-development-guide.md` §16 already marked RESOLVED with source-level fix + G34 guard reference (verified 2026-05-09).
