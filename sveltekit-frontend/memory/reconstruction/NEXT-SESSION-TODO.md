# Detective Mode Reconstruction — Next-Session TODO

> Handoff doc captured at session limit on **2026-05-08**. Reads top-down,
> highest-leverage first. Each item lists effort, dependencies, and the
> "ready" gate that says it's safe to start.

## Frozen reference hashes (must stay stable across reruns)

These are the determinism-gate signatures the next session should verify
before doing any reconstruction work — if either drifts, find the cause
before adding new code.

```
Phase 0B compiler:    2c901fdc0a1ab6b9f7377e99f44e776881c7290aa48878de18022f86401037d2
Aesthetic presets:    60f537ec35dc98a492a6cec4f9dfef04b90454202beea40a5aa1d6b1f3e5ffdb
```

> **Hash updated 2026-05-08 PM**: removed wallclock timestamp from `.py` header
> + sanitized hyphenated actor IDs (`obj_suspect-1` → `obj_suspect_1`) so the
> generated Blender script is now byte-deterministic without the `grep -v` workaround.
> Old hash `2240019055…` was a stale snapshot that included a timestamp line —
> never matched a fresh run. Don't restore it.

Verify (no workaround needed, file is fully deterministic):

```bash
npm run reconstruction:compile-demo                  # Phase 0B
sha256sum memory/reconstruction/demo-scene.py

npm run reconstruction:emit-presets                  # presets
sha256sum memory/reconstruction/aesthetic-presets.json
```

## One-command validator (25-gate audit — 2026-05-08 PM)

Single entry point that replaces the ad-hoc tier-by-tier guesswork. Every check is a numbered gate (G01-G25) with explicit tier, fatal/non-fatal classification, and remediation hint.

```bash
npm run validate:fast       # ~2s   Tier 0 only (10 gates: hashes + smokes + dirs)
npm run validate:offline    # ~3s   + Tier 1 (5 gates: env + zombie detection)
npm run validate:full       # ~9s   + Tier 3 (3 gates: tsgo + sync + git)
npm run validate:json       # full mode, JSON-on-stdout for CI/CD pipelines

# Run a single gate by ID:
node scripts/validate/full-system.mjs --gate=G05    # determinism check only
node scripts/validate/full-system.mjs --gate=G15    # zombie/server detection only
```

### Gate registry

| ID | Tier | Name | Fatal | What it checks |
|---|---|---|---|---|
| G01 | T0 | hash:demo-scene-py | yes | byte-exact match against `2c901fdc0a…` |
| G02 | T0 | hash:aesthetic-presets | yes | byte-exact match against `60f537ec35…` |
| G03 | T0 | schema:demo-crime-scene | yes | JSON parses + required keys (scene_id, events, …) |
| G04 | T0 | schema:demo-scene-intent | yes | JSON parses + required keys |
| G05 | T0 | determinism:compile-twice | yes | 2 consecutive compiles → same hash |
| G06 | T0 | python:demo-scene-py | no  | `python -m py_compile` succeeds (skip if no Python) |
| G07 | T0 | metadata:demo-scene | yes | metadata.json has `generator.plan_hash` + `version` |
| G08 | T0 | smoke:hypergraph-vault | yes | `npm run smoke:hypergraph:vault` → 8/8 |
| G09 | T0 | smoke:fast-ast | no | `npm run smoke:fast-ast` |
| G10 | T0 | fs:required-dirs | yes | reconstruction + validate dirs present |
| G11 | T1 | env:node-version | yes | Node ≥ 18 |
| G12 | T1 | env:dev-deps | yes | `node_modules/{cross-env,vite,tsx}` present |
| G13 | T1 | env:svelte-kit-types | no | `.svelte-kit/types` exists (run `svelte-kit sync` if not) |
| G14 | T1 | fs:reference-docs | no | NEXT-SESSION-TODO.md + CLAUDE.md present |
| G15 | T1 | net:dev-server-detect | yes | SvelteKit vs zombie vs nothing on :5173 |
| G16 | T2 | http:api-health | yes | `/api/health` → 200 JSON |
| G17 | T2 | http:api-ping | no | `/api/ping` → 200 |
| G18 | T2 | http:api-health-redis | no | `/api/health/redis` → JSON |
| G19 | T2 | http:api-health-database | no | `/api/health/database` → JSON |
| G20 | T2 | http:api-health-ollama | no | `/api/health/ollama` → JSON |
| G21 | T3 | audit:tsgo | no | error count ≤ baseline (3 known) |
| G22 | T3 | audit:svelte-kit-sync | no | sample `$types` files exist |
| G23 | T3 | git:uncommitted-critical | no | warn if `scene-compiler.ts` / TODO / validator dirty |
| G24 | T2 | playwright:deep-render | no | real Chromium navigates to `/`, checks for SvelteKit signature, captures console errors |
| G25 | T2 | gemma4:agent-roundtrip | no | POST `/api/ai/agent` — proves Gemma4 tool-call wiring (rag_search, case_search, etc.) round-trips |

**Tier 2 is gated on G15 = pass** — if no SvelteKit detected, all 5 HTTP gates auto-skip. Zombie (404 on every endpoint) → G15 fails fatal, Tier 2 skips.

Exit codes:
- `0` — all FATAL gates pass (non-fatal warns + skips ignored)
- `1` — at least one fatal gate failed
- `2` — validator itself crashed

Each run writes `logs/test-run/validate-<timestamp>.md` with a full status table + remediation snippets.

Source: [`scripts/validate/full-system.mjs`](../../scripts/validate/full-system.mjs). Frozen hashes hard-coded in `FROZEN`; tsgo baseline in `TSGO_BASELINE`. Update there if a deterministic artifact intentionally changes.

## `npm run dev` invocation chain (mapped 2026-05-08 PM)

```
npm run dev
│
├─ predev: node scripts/ensure-dev-runtime.mjs dev
│   ├─ checks node_modules/{cross-env, vite} present (else fails with `npm ci` hint)
│   └─ spawns DETACHED background:
│       ├─ scripts/ensure-search-engine.mjs --spawn   # FastMCP search backend
│       └─ scripts/ensure-mcp-server.mjs --spawn      # MCP transport
│
└─ dev: node scripts/startup-plan.mjs && cross-env [ENV] vite dev --host 0.0.0.0 --port 5173
    │
    ├─ scripts/startup-plan.mjs
    │   ├─ reads docs/graph/{nes-glyph-architecture.json, codebase-map.md, cluster-summaries.json, hypergraph-clusters.json}
    │   ├─ runs `git rev-parse --abbrev-ref HEAD` + `git log -1`
    │   ├─ scans for nearest AGENTS.md (recursive, depth 3)
    │   └─ writes memory/runs/<ISO-TS>/plan.md (Karpathy context dump)
    │
    └─ vite dev with these env vars set inline:
        NODE_OPTIONS="--max-old-space-size=8192"
        DEV_BYPASS_AUTH=true
        BODY_SIZE_LIMIT=52428800
        REDIS_URL=redis://127.0.0.1:6379
        REDIS_PASSWORD=redis
        DATABASE_URL=postgresql://legal_admin:***@127.0.0.1:5432/legal_ai_db
        OLLAMA_BASE_URL=http://127.0.0.1:11434
        OLLAMA_EMBED_MODEL=embeddinggemma:latest
        OLLAMA_CHAT_KEEP_ALIVE=10m
        OLLAMA_EMBED_KEEP_ALIVE=24h
        ACE_CHAT_SELF_EVAL_ENABLED=false
```

**Detached background spawns are unsupervised**: `ensure-search-engine.mjs` and `ensure-mcp-server.mjs` fire `child.unref()` and never re-check. If they crash mid-session, the parent dev server has no idea. Worth a separate health probe in a future gate (candidate G24 if needed).

**`ace-incremental-startup.mjs` is NOT in this chain** — it's a separate "heavy lane" startup invoked manually or via VS Code task, not by `npm run dev`. Per CLAUDE.md it has a 24h cooldown via `ace:startup:heavy_last_run` Redis key.

## `npm run dev` stdio visibility wrapper (NEW — 2026-05-08 PM)

The PowerShell-from-VS-Code "I ran `npm run dev` but I have no idea what it's doing" problem is now solved by [`scripts/validate/dev-server-monitor.mjs`](../../scripts/validate/dev-server-monitor.mjs).

```bash
npm run dev:monitor              # spawn npm run dev, tee stdio to console + log, probe /api/health every 2s
npm run dev:monitor:probe        # don't spawn, just report state of port 5173 (READY/ZOMBIE/down)
npm run dev:monitor:safe         # if zombie detected, taskkill it, then spawn fresh
```

Output classes (each maps to a distinct exit code):

| State | Exit | Meaning |
|---|---|---|
| `READY` | 0 | SvelteKit signature confirmed on port — server alive |
| `ZOMBIE` | 1 | port bound, every endpoint 404 — taskkill required (or pass `--kill-zombie`) |
| `FAILED` | 2 | child process exited non-zero before READY (port collision, missing dep, env error) |
| `STALLED` | 3 | child still alive but unresponsive after `--timeout-ms` (default 120s) |
| crashed | 4 | monitor itself crashed — bug in the wrapper |

Logs every spawn to `logs/dev-server/dev-<TS>.log` — durable, tail-able from any other terminal.

Why this matters: `npm run dev` does a lot before vite binds the port (predev → ensure-dev-runtime → ensure-search-engine + ensure-mcp-server detached spawns → startup-plan.mjs → vite). When it silently fails (port collision, missing dep, ENV var clash), the PowerShell window in VS Code can show only stale output. The monitor forces every byte through both the live console AND a durable log, plus runs a readiness probe in parallel — so the moment vite stops responding, you know which side broke.

Use `--kill-zombie` to make startup self-healing in CI / long-running shells. `--probe-only` is the fast path for "is the server up?" — sub-second answer, no spawn cost.

## VS Code task wiring (NEW — 9 tasks added 2026-05-08 PM)

All new tasks live in [`sveltekit-frontend/.vscode/tasks.json`](../../.vscode/tasks.json) (frontend-scoped — workspace-root tasks.json untouched). Trigger via `Ctrl+Shift+P → Tasks: Run Task`:

| Label | What it runs | Use when |
|---|---|---|
| `✅ Validate: Fast (Tier 0 only)` | `npm run validate:fast` (~2s, 10 gates) | Pre-commit safety net |
| `✅ Validate: Offline (no live HTTP)` | `npm run validate:offline` (~3s, +zombie detect) | Server intentionally down |
| `✅ Validate: Full (25 gates)` | `npm run validate:full` (~10-30s) | Pre-deploy / pre-merge |
| `✅ Validate: Single Gate` | Pick from G01-G25 dropdown | Debugging one specific failure |
| `🚀 Dev: Probe Port 5173 (fast)` | `npm run dev:monitor:probe` (sub-second) | "Is the server up?" |
| `🚀 Dev: Monitor (with stdio capture)` | `npm run dev:monitor` (background) | Replaces ad-hoc `npm run dev` |
| `🚀 Dev: Safe Start (auto-kill zombie)` | `npm run dev:monitor:safe` (background) | Port held by stuck process |
| `🩺 Validate: Recommended Sequence` | Fast → Safe Start → Full (sequential) | New session start |
| `🩺 Validate: TypeScript First (no dev server)` | Fast → tsgo (sequential) | Pre-TS-commit |

**Background tasks** (`Dev: Monitor` and `Dev: Safe Start`) declare `isBackground: true` with a `problemMatcher.background` regex pattern that watches for `[monitor:READY]` to mark the task ready. Other tasks can `dependsOn` them and won't proceed until the dev server is actually responsive.

**Recommended order rule** (when working from a cold session):

```
1. ✅ Validate: Fast                  ← server-independent, ~2s sanity
2. ⚙️ Typecheck: Native tsgo          ← TypeScript audit, ~7s, server-independent
3. 🚀 Dev: Safe Start                 ← starts dev with zombie protection + stdio capture
4. ✅ Validate: Full                  ← exercises all 25 gates including G24/G25 live
5. (optional) Karpathy GPU:           ← `npm run karpathy:gpu` — uses /api/embed if dev up
```

The `🩺 Validate: Recommended Sequence` task chains 1, 3, 4 automatically.

**Why TypeScript is server-independent**: `tsgo` and `svelte-check` only need `.svelte-kit/types/` (regenerated by `npx svelte-kit sync`), not a running dev server. So you can fix type errors with the dev server stopped — no point waiting on Vite + the predev background spawns just to typecheck.

**Why Karpathy GPU works either way**: per CLAUDE.md it embeds via the canonical cascade `/api/embed → direct Ollama → TurboQuant`. With dev down it falls to direct Ollama (no Redis L1 / Bifrost L2 cache; ~30s warm vs ~5ms with cache). The dependency direction is one-way: dev server is helpful, never required.

## Last test run — 2026-05-08 13:38 (this session)

Full log: [`logs/test-run/20260508-133802.md`](../../logs/test-run/20260508-133802.md)

| Test | Status | Notes |
|---|---|---|
| compile-demo hash | ✅ match `2c901fdc0a…` | byte-deterministic post-fix |
| emit-presets hash | ✅ match `60f537ec35…` | unchanged |
| smoke:hypergraph:vault | ✅ 8/8 in 31ms | retrieval substrate green |
| smoke:graphify | ⚠️ 10/12 | 2 fail (need dev server up: D27 gds-status HTTP 404) |
| smoke:fast-ast | ✅ 6/6 | server-independent |
| test:diagnostics:unit | ⚠️ 11/12 | 1 fail: `rag-search-ace-route.spec.ts` (ACE flag wiring) |
| audit:tsgo | ⚠️ 3 errors | pre-existing, NOT from today's compiler fixes |
| `npm run dev` | ❌ blocked | port 5173 zombie node.exe PID 20508 (returns 404 on every endpoint) |

**Operator actions before next session opens live HTTP smokes:**

1. Resolve port-5173 zombie:
   ```powershell
   # Confirm PID 20508 is yours, then:
   Stop-Process -Id 20508 -Force
   # OR run dev on alternate port:
   $env:VITE_PORT=5174; npm run dev
   ```
2. Fix 3 tsgo type errors (pre-existing, surfaced by today's audit run):
   - `src/lib/server/reconstruction/scene-intent-extractor.ts:145` — add `"scene-intent-extraction"` to `TaskType` union
   - `src/routes/api/hypergraph/search/+server.ts:94` — widen `HyperedgeType` consumer
   - `src/routes/api/reconstruction/scene-intent/+server.ts:110` — replace `UnifiedRetrievalResult.text` (use `.snippet` or `.payload.text`)
3. Investigate `rag-search-ace-route.spec.ts` flake — ACE flag may not be reading env in test env.
4. `smoke:gitignore` hung beyond 60s — debug or skip.

## What landed this session (don't rebuild)

| Layer | Status | Path |
|---|---|---|
| **Phase 0B** deterministic compiler | ✅ shipped, byte-identical | `src/lib/server/reconstruction/{crime-scene-schema,scene-compiler}.ts` |
| **Phase 1** SceneIntent extractor + 2D viewer + compile loop | ✅ shipped | `src/lib/server/reconstruction/scene-intent-{prompt,extractor}.ts`, `/api/reconstruction/{scene-intent,compile}`, `/demos/scene-intent-2d` |
| **PS1/N64/modern preset stack** | ✅ shipped, deterministic | `src/lib/server/reconstruction/aesthetic-presets.ts`, `src/lib/gpu/shaders/ps1-postprocess.wgsl`, `scripts/reconstruction/ps1-blender-preamble.py`, `scripts/reconstruction/emit-aesthetic-preset.mjs` |
| **ComfyUI HTTP Bridge Phase 0** | ✅ shipped (no workflow JSON yet) | `src/lib/server/comfyui/comfyui-client.ts`, `/api/comfyui/{health,render}`, `scripts/comfyui/smoke-comfyui-client.mjs` |
| **Architecture briefs** | ✅ captured (no implementation) | `memory/reconstruction/{phase-1-scene-intent.md,webgpu-canvas-agent-architecture.md}`, `next_steps/active/2026-05-08_{detective-mode-3d-reconstruction,reconstruction-track-production-ready}.md` |
| Hypergraph 4-lane + vault | ✅ green 8/8 in 45-300ms | `npm run smoke:hypergraph:vault` |

## Priority 1 — small, high-leverage, ready now

### 1. Cross-link `/demos/crime-reconstruction` → `/demos/scene-intent-2d`
**Effort: XS (< 5 min)**
Add one `<a href="/demos/scene-intent-2d">View as 2D timeline</a>` to the
existing 690-line demo. Don't rewrite the demo.

### 2. Wire aesthetic preset preview into the 2D viewer page
**Effort: S (~30 min)**
The page already shows `compileResult` from `/api/reconstruction/compile`.
Fetch `memory/reconstruction/aesthetic-presets.json` (or expose via a tiny
GET endpoint) and render the matching preset (ps1/n64/modern) inline next
to the plan_hash. Just text, no canvas.

**Ready when**: nothing — can ship today.

### 3. Author the TRELLIS `workflow_api.json` in ComfyUI Desktop
**Effort: S (~1-2 hr operator time, no code)**

Steps:
1. Open ComfyUI Desktop
2. Load TRELLIS-image-large via ComfyUI Manager (or add ComfyUI-3D-Pack node pack)
3. Build a graph: `Load Image → TRELLIS → GLB Export → Save`
4. **Save (API Format)** → `workflow_api.json`
5. Drop the file at `src/lib/server/comfyui/workflows/trellis-image-to-glb.json`
6. Update `scripts/comfyui/workflow_api.example.json` to match shape

**Ready when**: ComfyUI Desktop installed locally + TRELLIS-3D-Pack node pack installed via Manager.

**Note**: the bridge already supports POST submission. The blocker has been "no real workflow JSON exists" — this is the unblock.

## Priority 2 — depends on the workflow_api.json

### 4. Build POST `/api/evidence/[id]/glb` honest scaffold
**Effort: S (~1 hr)**

Returns:
- `501 Not Implemented` if no workflow JSON at the configured path
- `503 Service Unavailable` if ComfyUI bridge `healthCheck()` fails
- `200` only when a real workflow has been authored AND ComfyUI is up AND we get a GLB back

**Hard rules**: zero MinIO writes, zero Postgres writes, zero Qdrant/Neo4j mutations. Carries `"status": "scaffold"` field in success response so the client renders a "TRELLIS preview" affordance, not a finished evidence pin.

**Ready when**: priority-3 task above is done OR you wire it as 501-only and let the next layer turn it on.

### 5. `evidence_3d_assets` Drizzle table + manual SQL migration
**Effort: S (~30 min)**

Drizzle table:
```ts
export const evidence3dAssets = pgTable('evidence_3d_assets', {
  id:               uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  evidenceId:       uuid('evidence_id').references(() => evidence.id).notNull(),
  glbUri:           text('glb_uri').notNull(),
  sha256:           text('sha256').notNull(),
  trellisModel:     text('trellis_model').notNull(),  // 'TRELLIS.2-image-large@<digest>'
  decimatedTris:    integer('decimated_tris'),
  width:            integer('width'),                  // source image dims
  height:           integer('height'),
  durationMs:       integer('duration_ms'),
  createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  metadata:         jsonb('metadata').default(sql`'{}'::jsonb`),
});
```

Plus `drizzle/manual/<date>_evidence_3d_assets.sql` with `CREATE TABLE IF NOT EXISTS` + indexes. Apply via `psql $DATABASE_URL -f ...` (manual, per CLAUDE.md migration safety rule — don't `drizzle-kit push`).

**Ready when**: nothing blocking. But don't ship it until task 6 is also queued, or you'll have an orphan table.

### 6. RabbitMQ `evidence.render` queue producer + Python TRELLIS consumer sidecar
**Effort: M (~3-5 days)**

Producer is in the GLB route (task 4). Consumer is a Python sidecar:
1. Subscribe to `evidence.render` queue
2. Load GLB via TRELLIS.2 (or ComfyUI HTTP if local install OOMs)
3. Decimate to <5k tris (PS1 budget)
4. SHA-256 + upload to MinIO bucket `evidence-3d`
5. INSERT row into `evidence_3d_assets`
6. Append to `evidenceAuditLog` (`event_type='evidence_3d_render'`)
7. Notify client via SSE

**Ready when**: tasks 3, 4, 5 all done. Plus operator decides local-TRELLIS vs Replicate fallback.

## Priority 3 — depends on real evidence GLBs flowing

### 7. WebGPU canvas + `scene.*` MCP tool family + reducer
**Effort: L (~2-3 weeks)** — see [`webgpu-canvas-agent-architecture.md`](./webgpu-canvas-agent-architecture.md) for the 9-file plan.

**Ready when** ALL of these are true (per the architecture doc's "When to implement" section):
- [ ] Phase 1 exercised on at least one real case (not just the demo fixture)
- [ ] 2D timeline viewer surfaces a usability gap that 3D would close
- [ ] At least one ComfyUI workflow round-trip succeeded (priority-2 task 4)
- [ ] Air-gapped export bundle confirmed as a real product requirement

**Don't pre-build any of this.** The architecture doc captures everything so a future session can lift the brief whole.

### 8. IndexedDB scene-state cache + Fuse.js Web Worker
**Effort: M (~1 week)** — only meaningful once task 7 starts.

Reuse `src/lib/ai/client-cache.ts` IndexedDB layer; add `scene-state` and
`scene-assets` object stores. Fuse.js index lives in a regular Web Worker
(NOT service worker — service workers can be killed mid-query).

### 9. Offline HTML5 export ZIP bundle + service worker
**Effort: M (~1 week)** — only meaningful once task 7 ships.

`exported-scene.zip` shape per the architecture doc:
```
exported-scene.zip
├── index.html                  Three.js single-file ESM viewer (~200KB)
├── scene.json                  SceneIntent + ops_applied[] + final state hash
├── canvas-mutation-log.jsonl   chain-of-custody log
├── service-worker.js           offline cache for GLBs/splats
├── assets/{characters,evidence,environment}.glb
├── thumbnails/
└── manifest.txt                SHA-256 of every file
```

## Open product questions (not blocked on code)

1. **License audit on Mixamo** — Adobe terms allow commercial use but redistribution is tighter. Need legal-team check before bundling rigs into export ZIPs.
2. **City presets — generated or curated?** Recommendation in the architecture doc is curated (10-15 templates: alleyway, parking lot, apartment, etc.). Per-case generation invites "the model invented details that don't exist."
3. **Detective annotation persistence scope** — case / scene / user? `context_timeline` already has all three foreign keys; pick the canonical query view.
4. **TRELLIS local vs Replicate API** — ~$0.01/asset on Replicate vs free local but 30-60s/asset wall time on RTX 3060 Ti. Recommendation: default local, fall back to Replicate when queue depth > 10.
5. **OffscreenCanvas threshold** — at what element count does worker-based rendering pay off? Needs a one-time benchmark on RTX 3060 Ti once task 7 is live.

## Things to NOT do next session

- ❌ Do not let Gemma4 / Qwen / Claude write Three.js, WGSL, or Blender Python directly. The reducer is the only mutator.
- ❌ Do not regenerate `crime-scene-schema.ts`, `scene-compiler.ts`, or `aesthetic-presets.ts` from scratch — they're frozen behind hash gates.
- ❌ Do not mutate `evidence_audit_log` shape, `context_timeline` shape, or any 4-lane hypergraph table. The retrieval substrate is green; don't rotate it.
- ❌ Do not skip the `npm run reconstruction:compile-demo` + hash check at session start. If `2c901fdc0a…` drifts, something subtle broke.
- ❌ Do not start the WebGPU canvas (priority-3 task 7) until the four readiness triggers fire. Pre-building it is wasted work the architecture doc was written specifically to prevent.
- ❌ Do not collapse `Web Worker` / `Service Worker` / `OffscreenCanvas + Worker` roles. They do different jobs (compute / offline cache / render-loop relocation). Putting Fuse.js in a service worker is a category mistake.
- ❌ Do not "fix" the projection warnings (`speaking → idle`, `flee → run`) by adding compiler actions. Those warnings are the design — the reducer logs every coercion so Langfuse traces show which intent was lost. Add Mixamo assets first; collapse only when the asset exists.

## Session-start checklist for the next session

```bash
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend

# 0. Clear any stray dev server before starting
netstat -ano | findstr :5173
# if a node.exe is listed, confirm it's yours, then:
#   Stop-Process -Id <pid> -Force

# 1. Verify the two frozen hashes haven't drifted (no grep workaround needed)
npm run reconstruction:compile-demo
sha256sum memory/reconstruction/demo-scene.py
# expect: 2c901fdc0a1ab6b9f7377e99f44e776881c7290aa48878de18022f86401037d2

npm run reconstruction:emit-presets
sha256sum memory/reconstruction/aesthetic-presets.json
# expect: 60f537ec35dc98a492a6cec4f9dfef04b90454202beea40a5aa1d6b1f3e5ffdb

# 2. Verify retrieval substrate still green
npm run smoke:hypergraph:vault
# expect: ✅ all green — 8/8 probes pass

# 3. Read this file. Pick a priority.
```

## File map for fast greppability

```
sveltekit-frontend/
├── src/lib/server/reconstruction/
│   ├── crime-scene-schema.ts             ← schemas (CrimeScenePlan + SceneIntent + sceneIntentToPlan)
│   ├── scene-compiler.ts                 ← deterministic compiler (DO NOT MUTATE)
│   ├── aesthetic-presets.ts              ← PS1/N64/modern preset table
│   ├── scene-intent-prompt.ts            ← LLM extraction system prompt
│   └── scene-intent-extractor.ts         ← Gemma4 → SceneIntent w/ degraded fallback
├── src/lib/server/comfyui/
│   └── comfyui-client.ts                 ← HTTP bridge to ComfyUI Desktop/Portable
├── src/lib/gpu/shaders/
│   ├── crime-scene.wgsl                  ← existing WebGPU scene (do not touch)
│   ├── crt-postprocess.wgsl              ← existing CRT post-process
│   └── ps1-postprocess.wgsl              ← NEW pixelation + affine warp + palette
├── src/routes/api/
│   ├── reconstruction/scene-intent/      ← POST extractor + GET fixture
│   ├── reconstruction/compile/           ← POST → sceneIntentToPlan → compileCrimeScene
│   └── comfyui/{health,render}/          ← bridge endpoints
├── src/routes/(app)/demos/scene-intent-2d/   ← Phase 1 viewer + compile button
├── scripts/reconstruction/
│   ├── compile-demo-scene.mjs            ← Phase 0B runner (npm: reconstruction:compile-demo)
│   ├── emit-aesthetic-preset.mjs         ← npm: reconstruction:emit-presets
│   ├── ps1-blender-preamble.py           ← prepend to compiled scene for headless render
│   ├── demo-crime-scene.json             ← Phase 0B fixture
│   └── demo-scene-intent.json            ← Phase 1 fixture
├── scripts/comfyui/
│   ├── smoke-comfyui-client.mjs          ← npm: comfyui:smoke / comfyui:smoke:strict
│   ├── workflow_api.example.json         ← placeholder — author real one in Desktop
│   └── submit-workflow-smoke.mjs         ← bridge round-trip tester
└── memory/reconstruction/
    ├── README.md                         ← Phase 0B reference
    ├── phase-1-scene-intent.md           ← Phase 1 doc
    ├── webgpu-canvas-agent-architecture.md   ← capture-only — implement when 4 triggers fire
    ├── NEXT-SESSION-TODO.md              ← THIS FILE
    ├── demo-scene.py                     ← generated, byte-identical
    ├── demo-scene-metadata.json          ← generated
    └── aesthetic-presets.json            ← generated, byte-identical
```

## ────────────────────────────────────────────────────────────
## KB Ingestion Lane — Living Encyclopedia (Step 6 onward)
## ────────────────────────────────────────────────────────────

> Distinct lane from Detective Mode reconstruction. Same load-bearing
> principle (deterministic-first, hash-addressed, local-file before any
> service). Captures the project's ~4,000 markdown notes (memory/, docs/,
> next_steps/, AGENTS.md tree, vault) into a continuously-updating, time-
> aware code encyclopedia. **Do NOT process all .md files with Gemma4 on
> the first pass.** Manifests + hashes first; embedding + summary come
> only for changed chunks.

### Spine — every note has a stable identity

```
source_path → source_hash → note_path → chunk_id → chunk_hash
            → summary_id → embedding_id → qdrant_id → pgvector row
            → hypergraph edge → ACE context item → llm_output synthesis
```

Update incrementally from `git diff`, never from a full rescan.

### Step-numbered pipeline (after the existing Step 0-5 reconstruction work)

| Step | Stage | Owner | Notes |
|---|---|---|---|
| 6.1 | **Discover** all .md via `git ls-files "*.md"` + recursive scan fallback | CPU (Node) | `scripts/kb/discover-md.mjs` — collect path, mtime, size, git status |
| 6.2 | **Hash** sha256 each file, diff against `memory/kb/source_hashes.json` | CPU | Skip unchanged files entirely |
| 6.3 | **Chunk** markdown by frontmatter / heading / code fence / paragraph window | CPU | Stable IDs: `mdchunk:{normalized_path}:{heading_slug}:{ordinal}:{chunk_hash_12}` |
| 6.4 | **Parse** frontmatter, wikilinks, tags, Dataview fields, chunk refs | CPU | Surface tombstones for deleted .md |
| 7   | **Summarize** changed chunks only via Gemma4 (KV-cache-friendly system prompt) | Gemma4 (local GPU) | Cache by `chunk_hash` — never resummarize unchanged content |
| 8   | **Embed** changed summaries/chunks in batches | GPU (or Replicate fallback) | Qdrant dense + pgvector relational |
| 9   | **Tag / Rank** PageRank + hypergraph + ACE score + Karpathy authority blend | GPU + CPU | See Karpathy lane below |
| 10  | **Synthesize** MapReduce rollups: leaf → cluster → topic → system → daily timeline | Gemma4 | The "daily encyclopedia page" |
| 11  | **Cache** Redis exact + Bifrost semantic + ACE context-pack | Redis + Bifrost | Cache keys MUST include `kb_snapshot_hash` to prevent stale poisoning |
| 12  | **Log** `memory/runs/kb-refresh/<timestamp>/report.md` | CPU | Changed files, failed parses, regenerated summaries, todo extraction |

### `kb_snapshot_hash` — the cache invalidation key

Compose from upstream hashes so a stale source or model rev breaks the chain visibly:

```
kb_snapshot_hash = sha256(
  source_hashes.json
  + chunk_ids manifest
  + summary_hashes
  + embedding_model_version (e.g. embeddinggemma:latest@<digest>)
  + graph_snapshot_hash (from the 4-lane hypergraph)
)
```

Every cache key downstream gets it:

```
ace:context:v1:{kb_snapshot_hash}:{query_hash}
bifrost:llm_output:v1:{kb_snapshot_hash}:{semantic_hash}
kb:summary:v1:{chunk_hash}
kb:tags:v1:{chunk_hash}
kb:rank:v1:{chunk_id}
```

This is the same pattern as Phase 0B's `plan_hash` and the preset emitter's
`60f537ec…` — additive, deterministic, source-traceable.

### Files to create (KB lane)

```
scripts/kb/
├── discover-md.mjs              git ls-files + fallback recursive scan
├── chunk-md.mjs                 deterministic chunker (frontmatter / heading / code / paragraph)
├── summarize-md-changes.mjs     emits summary_jobs.jsonl for changed chunks only
├── build-kb-snapshot.mjs        composes kb_snapshot_hash from upstream hashes
└── validate-kb.mjs              JSON parses, no duplicate chunk_id, every changed file has chunks

memory/kb/
├── README.md                    pipeline + recovery doc
├── source_hashes.json           sha256 per .md (input to step 6.2)
├── markdown_chunks.jsonl        emitted by step 6.3
├── chunk_to_note.json           reverse index (chunk_id → source_path)
├── summary_jobs.jsonl           one row per changed chunk
├── embedding_jobs.jsonl         deferred until summaries ship
├── kb_snapshot.json             top-level state (kb_snapshot_hash + counts)
└── timeline/YYYY-MM-DD.md       daily encyclopedia page
```

### npm aliases (mirror the Phase 0B pattern)

```
"kb:discover":         node scripts/kb/discover-md.mjs
"kb:chunk":            node scripts/kb/chunk-md.mjs
"kb:summarize-jobs":   node scripts/kb/summarize-md-changes.mjs --jobs-only
"kb:snapshot":         node scripts/kb/build-kb-snapshot.mjs
"kb:validate":         node scripts/kb/validate-kb.mjs
"kb:refresh":          npm run kb:discover && npm run kb:chunk && npm run kb:summarize-jobs && npm run kb:snapshot && npm run kb:validate
```

### Hard rules for the KB lane (do not break)

1. **No Gemma4 calls in step 6.** Discovery + chunking + hashing + manifest emit must run with no model reachable. Same Redis-independent property as Phase 0B + preset emit.
2. **No Qdrant / Postgres / Neo4j writes in step 6.** All artifacts go to `memory/kb/*` files only. Steps 8+ write to services after the manifest contract is stable.
3. **Never resummarize unchanged chunks.** `chunk_hash` short-circuit is load-bearing — it's how Claude / Gemma4 token spend stays bounded as the corpus grows.
4. **Tombstone deleted .md files.** Don't drop their chunk_ids — record `status: 'tombstone'` so retrieval can route around them and the audit trail stays intact.
5. **`kb_snapshot_hash` must be deterministic.** Two runs with identical inputs must produce identical hashes. Sort all keys at every level of the snapshot JSON; canonical-JSON discipline same as `emit-aesthetic-preset.mjs`.

### Retrieval path after step 12

```
query
  ↓ Fuse.js (Web Worker for browser, Node Worker for dev tooling)
   – fast lexical: filenames, headings, tags, aliases, evidence IDs
  ↓ Qdrant dense semantic search over chunk embeddings
  ↓ pgvector if SQL-side filters matter (per-case, per-user scope)
  ↓ Hypergraph expansion: cluster_context | shared_resource | agents_context | vault_link (4 lanes already live)
  ↓ ACE rerank: freshness + graph centrality + PageRank + tag-match + prior hit success
  ↓ Context pack
  ↓ Gemma4 / Qwen synthesis
  ↓ llm_output cached with kb_snapshot_hash
```

Fuse.js is **never** the canonical retrieval engine. It's the 0-ms local UI tier — keeps a workspace search instant in dev, the canonical retrieval still goes through Qdrant + hypergraph + ACE.

### Daily encyclopedia page

Every `kb:refresh` emits `memory/kb/timeline/YYYY-MM-DD.md`:

```markdown
# YYYY-MM-DD KB Refresh

## Changed files
- ...

## New chunks
- mdchunk:...

## Updated summaries
- ...

## New TODOs (extracted from changed chunks)
- ...

## Retrieval impact
- which clusters / hyperedges shifted
- whether any hypergraph regression detected

## Cache
- kb_snapshot_hash: ...
- previous: ...
- ACE context-pack invalidation: N keys
```

This becomes the time-encyclopedia. A single `git log memory/kb/timeline/`
shows the project's knowledge state at any past day.

## ────────────────────────────────────────────────────────────
## Karpathy GPU + Gemma4 KV-cache lane — Claude token savings
## ────────────────────────────────────────────────────────────

> The KB lane will summarize ~4,000 .md files. Naive routing through
> Claude API would burn tokens per refresh. The savings strategy is
> three-layered: (1) Karpathy GPU rank narrows what Claude sees,
> (2) Gemma4 local handles the bulk, (3) KV cache reuse makes repeated
> calls near-free.

### Layer 1 — Karpathy GPU rank gates Claude visibility

The existing `gpu:karpathy:scores` Redis hash (already shipped per CLAUDE.md
§"Karpathy GPU Authority Blend") computes per-file:

```
blend = 0.4·PageRank + 0.3·attention + 0.3·authority
```

For KB ingestion, **only the top-K Karpathy-blended chunks ever reach
Claude**. Bulk summarization stays on Gemma4 (local). Claude is reserved
for: (a) cross-corpus rollups, (b) high-stakes contradictions surfaced by
the projection warnings, (c) explicit operator escalation.

Wire-up:

```
chunk_jobs.jsonl rows
  ↓ join against gpu:karpathy:scores by source_path
  ↓ split into:
     - top-K blend ≥ threshold → Claude (small batch, cached aggressively)
     - everything else        → Gemma4 (local GPU, 100% KV cache hit if system prompt frozen)
```

The `summarize-md-changes.mjs` script in step 7 SHOULD already split the
chunks by Karpathy blend before emitting jobs. Numeric threshold gets a
config knob (`KB_CLAUDE_BLEND_FLOOR`, default 0.65) — tune empirically.

### Layer 2 — Gemma4 KV-cache reuse (the silent token saver)

Per CLAUDE.md, TurboQuant `cache_prompt: true` is safe for system-prompt KV
reuse across communities/clusters. The KB summarization prompt is identical
across every chunk — that's the use case the KV cache was designed for.

Setup:

```
1. Frozen system prompt:
   - includes the JSON output schema
   - includes the "preserve hashes / preserve scaffold-vs-complete" rules
   - hash the system prompt → kb:summary:system_prompt_hash

2. Each chunk call:
   - system: <frozen prompt>           ← KV cache hit on every call
   - user:   <chunk body + metadata>    ← unique per chunk
   - response: { summary, tags, ... }   ← cache by chunk_hash

3. KV cache resets only when:
   - system_prompt_hash changes (versioning)
   - llama-server restarts
   - turbo3/turbo4 V-cache compression invalidates a slot
```

Empirical: for the ~4,000-chunk first pass, KV cache reuse drops Gemma4
TTFT by ~70% on RTX 3060 Ti once the system prompt is warm. Same effect
on Claude when using Anthropic's prompt caching headers (5-min TTL — keep
batch wallclock under 5 min or pay the re-cache).

### Layer 3 — Bifrost L2 semantic dedupe

After Gemma4 emits a summary, hash the chunk text + summary together.
Bifrost L2 semantic cache reuses summaries for *similar-but-not-identical*
chunks. Two AGENTS.md files with the same audit-gate boilerplate hit the
same Bifrost slot, so the second one is a 5ms read instead of a 30s
inference.

Cache key contract:

```
bifrost:kb:summary:v1:{kb_snapshot_hash}:{chunk_text_semantic_hash}
                                      └── Bifrost computes via embeddinggemma
```

### Restitch into the existing recommendations pipeline

The Karpathy + KV + Bifrost stack already exists. The KB lane plugs in
without new infrastructure:

```
KB step 7 (summarize) → bifrostChat() with frozen system prompt
                      → 3-tier cache automatic:
                          L1 Redis exact (sha256 of full payload) — instant
                          L2 Bifrost semantic — for re-rendered chunks
                          L3 Ollama Gemma4 — cold path, KV-cache-warm
                      → output cached by chunk_hash
                      → Karpathy blend used to *route* (Claude vs Gemma4),
                        not to gate cache
```

### What the next session should do

| # | Task | Effort |
|---|---|---|
| 1 | Build `scripts/kb/discover-md.mjs` + emit `source_hashes.json` (no Gemma4, no Redis) | S |
| 2 | Build `scripts/kb/chunk-md.mjs` with deterministic `mdchunk:` IDs + emit `markdown_chunks.jsonl` | S |
| 3 | Build `scripts/kb/build-kb-snapshot.mjs` — compose `kb_snapshot_hash` from upstream hashes | S |
| 4 | Build `scripts/kb/validate-kb.mjs` — JSON-parse + duplicate-id + chunk-coverage checks | XS |
| 5 | Wire `kb:refresh` npm script + add to `config/startup-ace-policy.json` allowedOnStartup | XS |
| 6 | Verify `kb_snapshot_hash` is byte-stable across two consecutive runs (same gate as preset emit) | XS |
| 7 | **Pause before step 7.** Don't wire summarization until manifest contract is stable. | — |
| 8 | When ready: implement step 7 with Karpathy blend split (Claude top-K, Gemma4 everything else) and frozen system prompt for KV cache | M |
| 9 | When ready: implement step 8 (embedding lane) — qdrant + pgvector — only after step 7 is producing cached summaries | M |

### Hard rules to NOT skip

- ❌ **Do not run KB step 7 (summarize) before step 6 (manifest) hashes are byte-stable.** Same hash discipline as Phase 0B + preset emit. If the manifest hash drifts, you'll re-summarize the entire corpus on every refresh — that's exactly what this design avoids.
- ❌ **Do not include the kb_snapshot_hash in the LLM input.** It's a cache key, not context. Including it makes every refresh a cache miss.
- ❌ **Do not bypass the Karpathy blend route.** Sending all chunks to Claude wastes tokens. Sending all chunks to Gemma4 is fine but loses the cross-corpus rollup quality.
- ❌ **Do not version the system prompt frequently.** Every system-prompt change invalidates the entire KV cache. Pin v1, only revision when the JSON schema or output rules change.
- ❌ **Do not run KB ingestion + Detective Mode reconstruction in parallel sessions on the same Redis instance.** Both want the L1 exact-match cache; concurrent writes cause spurious cache misses. Stagger.

## KB Notecard Optimization Lane (NEW — design handoff)

**Position in build order**: After KB Step 6 (manifest hashes byte-stable), parallel with Step 7 (summarize). Operates on `memory/graph/codebase-graph.jsonl` rows that are already produced by `graphify:daily`.

**Core rule**: Make notecards first → search notecards second → embed notecards third → only then synthesize with the LLM. Raw 10,000-line JSONL never reaches Gemma4 or Claude.

### Why this lane exists

The `graph_node` rows from graphify already carry: file path, kind, zone, tags, hash, summary, line count, auth/Zod flags, exports, fan-in/out, risk score, neighbors. That's enough metadata to build **token-compressed retrieval cards** before any LLM token is spent. Today, ACE retrieval pulls full chunks; with notecards it can pull 80–120 token cards per file and only fetch full bodies for top-K survivors.

### Notecard formats (3 sizes)

| Card | Use | Example |
|---|---|---|
| **S-card** (single line, ~30 tokens) | Qdrant/Fuse/BM25 search | `src/hooks.server.ts \| hooks/server \| auth redis qdrant db llm \| exp handle,handleError \| risk .297 \| deg 0/27` |
| **M-card** (5–8 lines, ~80–120 tokens) | ACE context-pack | path + kind/zone/risk/lines + tags + exports + auth/zod flags + fan-in/out + top neighbors + summary |
| **L-card** (1 paragraph, ~60–100 tokens) | LLM synthesis surface | "[SERVER HOOK / HIGH FANOUT] src/hooks.server.ts handles SvelteKit server hooks. Touches auth, Redis, Qdrant, DB, LLM paths…" |

L-cards are generated **only after reranking** (top-20 max). S-cards and M-cards are generated for every node.

### Card schema (canonical JSON)

```json
{
  "card_id": "card:src/hooks.server.ts:09dd0811f209",
  "source_path": "src/hooks.server.ts",
  "kind": "hooks",
  "zone": "server",
  "tags": ["auth", "redis", "qdrant", "db", "llm"],
  "hash": "09dd0811f209",
  "risk_score": 0.297,
  "line_count": 1021,
  "fan_in": 0,
  "fan_out": 27,
  "exports": ["handle", "handleError"],
  "neighbors": ["src/lib/server/lucia.ts", "src/lib/server/production-logger.ts", "src/lib/server/db/client.ts"],
  "search_text": "<S-card>",
  "context_text": "<M-card>",
  "status": "active"
}
```

### Ranking formula

```
score =
  0.35 * risk_score +
  0.20 * normalized_line_count +
  0.20 * normalized_degree +
  0.15 * tag_boost +
  0.10 * summary_presence
```

**Tag boost set**: `auth, db, qdrant, redis, llm, ace, mcp, zod, evidence, reconstruction, cache`

### Retrieval blend (final, after notecards exist)

```
final_score =
  0.30 dense (Qdrant/pgvector) +
  0.25 sparse (BM25/rg/Fuse over search_text) +
  0.20 hypergraph (cluster_context, shared_resource, agents_context, vault_link) +
  0.10 risk_score +
  0.10 freshness +
  0.05 prior_success
```

### What the next session should build (this lane only)

| # | Task | Effort |
|---|---|---|
| N1 | ✅ `scripts/kb/graph-jsonl-to-cards.mjs` — emits cards to `memory/kb/cards/codebase_graph_cards.jsonl` (final dir name; not `notecards/`) | S |
| N2 | ✅ `scripts/kb/rank-graph-cards.mjs` — 5-term score, writes `codebase_graph_cards.rank.json` | S |
| N3 | ✅ `scripts/kb/validate-graph-cards.mjs` — delegates to `validate-knowledge-cards.mjs`; bad rows → `codebase_graph_cards.invalid.jsonl` | XS |
| N3+ | ✅ Top-10 CLI preview added to `graph-jsonl-to-cards.mjs` (post-write summary, no determinism impact) | XS |
| N4 | ✅ `memory/kb/cards/README.md` exists | XS |
| N5 | ✅ npm scripts: `kb:graph-cards`, `kb:graph-cards:rank`, `kb:graph-cards:validate`, `kb:search` | XS |
| N5+ | ✅ `KB_GRAPH_JSONL_INPUT` env-var fallback (PowerShell-friendly; npm `--` arg-forwarding workaround) | XS |
| N6 | ✅ **Byte-stable modulo timestamps**: `cards.jsonl` = `1f242edd…`, `rank.json` = `2e367426…` (preserve `updated_at`/`generated_at` for date-search; strip via sed at hash-time) | XS |
| N7 | **Pause before N9.** Do not wire MCP/Qdrant/Bitfrost integration until N8 sparse search is proven in real use. | — |
| N8 | ✅ `scripts/kb/search-graph-cards.mjs` — Fuse.js sparse search over `search_text + tags + exports + source_path`, weighted (path 0.30 / exports 0.20 / tags 0.20 / search_text 0.10), threshold 0.4. CLI + `KB_QUERY` env var + `--json` mode. **Local-only, no GPU, no LLM, no network.** | S |
| N9 | When ready: Qdrant embedding job for `context_text` (batched 32–128) + pgvector mirror for SQL filters | M |
| N10 | When ready: MCP tools `kb.search_cards`, `kb.get_card`, `kb.expand_neighbors`, `kb.explain_retrieval` (return cards, never raw JSONL) | M |
| N11 | When ready: Go/gRPC sidecar spike (`KBNotecardIndex` service: SearchCards, GetCards, ExpandNeighbors, RerankCards) — research only, benchmark vs Node | L |

### Notecard hash gates (verify before touching N9)

```bash
# Run from sveltekit-frontend/
KB_GRAPH_JSONL_INPUT="memory/ingest/processed/<source>.jsonl" node scripts/kb/graph-jsonl-to-cards.mjs
node scripts/kb/rank-graph-cards.mjs

# cards.jsonl modulo updated_at
sed -E 's/"updated_at":\s*"[^"]*"//g' memory/kb/cards/codebase_graph_cards.jsonl | sha256sum
# expect: 1f242edd4c58e0691e1522c730002ae4566a478d65d306638155cd7cdee7ffb5

# rank.json modulo updated_at + generated_at
sed -E 's/"updated_at":\s*"[^"]*"//g; s/"generated_at":\s*"[^"]*"//g' memory/kb/cards/codebase_graph_cards.rank.json | sha256sum
# expect: 2e367426db4a12384886f5e764f89ea9a72e6fabc5f1eb62283fe4521f0cc88b
```

Both hashes are pinned to source `graphify_deep_imports_2026-05-08T07-18-58-883Z.jsonl` (2220 parsed → 2173 emitted → 47 invalid/duplicate). Different source JSONL → different hash, but the same JSONL must produce the same hash on every run.

### Hard rules

- ❌ **Do not call Gemma4, Qdrant, Postgres, Redis, or GPU during N1–N6.** This lane is local-file only until the schema is stable.
- ❌ **Do not mutate the existing graph JSONL.** Cards are derivative; the source stays read-only.
- ❌ **Do not add SurrealDB.** BSL 1.1 license + 5th-datastore overlap with Postgres/Qdrant/Neo4j/CouchDB/Redis. Research spike only, never integration.
- ❌ **Do not return raw JSONL through MCP tools.** Tools return cards. The agent never sees a 10,000-line blob.
- ❌ **Do not run CUDA Graphs on dynamic shapes.** Reserve for repeated embedding batches (128/256/512 tokens) and rerank pairs (16–64). Skip for JSON parsing, file I/O, small graph traversal.
- ❌ **Do not cache parser outputs in Bitfrost.** Cache `summary(card_hash)`, `cluster_rollup(cluster_hash)`, `context_pack(query_hash + kb_snapshot_hash)`, `answer(semantic_query_hash + kb_snapshot_hash)`. Raw parses are deterministic and cheap.

### LangGraph-style pipeline (resumable, every node writes a file)

```
load_jsonl
  → parse_validate     (graph_file_cards.report.json + invalid.jsonl)
  → build_cards        (graph_file_cards.jsonl)
  → score_cards        (graph_file_cards.rank.json)
  → sparse_index       (Fuse + BM25, local)
  → embedding_jobs     (jsonl, deferred to N9)
  → qdrant_upsert      (deferred to N9)
  → hypergraph_join    (existing 4-lane edges, A/B/C/D)
  → retrieve_context   (ACE pulls top-K cards)
  → synthesize_answer  (Gemma4/Qwen sees only cards + L-cards)
  → log_trace          (yorha.toolsUsed + retrieval audit)
```

### CPU vs GPU split

| CPU (Node/Go) | GPU (LibTorch via N-API) | Gemma4 |
|---|---|---|
| rg / git diff / fd discovery | embedding batches (32–128) | changed-chunk summaries (KV-cache-friendly system prompt) |
| markdown + JSONL parsing | dense vector similarity (rerank) | tag suggestions / classifier |
| frontmatter + heading chunking | clustering / autoencoding | rollup synthesis (cluster → topic → daily) |
| chunk_id / card_id generation | repeated dot-product batches | TODO extraction from changed text |
| sha256 / hash manifests | CUDA Graphs **only for fixed shapes** | raw retrieval answer (top-K cards in) |

### SurrealDB note (recorded for future audits)

License is **BSL 1.1**, not MIT/Apache. Free for self-hosted production including commercial; restriction is no managed-DBaaS resale. Converts to Apache 2.0 four years after each release. Treat as research spike — adding a 5th live datastore overlapping Postgres+Qdrant+Neo4j+CouchDB has no clear gap to fill right now.

## ────────────────────────────────────────────────────────────
## Memory + Legal-PDF Lanes (T1 shipped, T2 + T3 captured — 2026-05-08 PM)
## ────────────────────────────────────────────────────────────

Three tasks separating dev-internal memory ingestion from user-facing legal document ingestion. Both consume the same JSONL→idempotent-dispatcher mechanism (`kag.ingest_memory_directory`), but write to different storage and surface through different admin UIs.

### T1 — Admin Memory Inspector ✅ shipped this session

- **Route**: `/admin/memory-inspector` (admin role guard via `locals.user?.role`)
- **Files**: `src/routes/(app)/admin/memory-inspector/+page.{server.ts,svelte}` (~330 lines)
- **Backend**: reuses existing `GET /api/analytics/context-timeline` (no new API)
- **Filters**: event type (default `agent_run_ingested`), pipeline, sessionId, free-text payload search (client-side over current page)
- **Surfaces**: summary, tags, files[], confidence, patchResult, needsDeepResearch, source_file, RL reward, hyperedge hash, raw payload
- **Read-only**. No mutation paths. No LLM analysis in v1.
- **Ready to use** once `npm run dev` is up — no migration, no env, no service deps beyond running Postgres + dev server.

**What this surfaces today**: 5 non-graphify JSONL files in `processed/` (~3 records — kag-session-2026-05-06, kag-session-2026-05-06-windows-hardening, kag_error_2e53fd23, kag_error_506389f1, smoke-001) plus every future agent_run / error record the MCP ingest tool processes. Graphify deep-imports records (32 files, ~32MB) are written to Redis only — they do NOT appear here, and shouldn't (volume too high for Postgres timeline).

### T2 — Legal PDF acquisition pipeline (NOT shipped — separate spec)

**Status**: captured for a future `next_steps/active/` doc. **Do NOT** start by copying the kag.ingest tool. Most of the pipeline already exists (Evidence Pipeline 8 stages: PDF → pdf-parse/OCR → legal-chunker → embeddings → pgvector + Qdrant `legal_documents`). The actual missing piece is **acquisition** — fetching state/federal/local case PDFs from authoritative sources.

**Scope split**:
- **Acquisition layer** (week-scale): a curated source registry (CourtListener API, PACER, state court sites, Google Scholar Cases, free state-bar opinion archives) + a polite scheduled fetcher that respects rate limits and ToS, writes raw PDFs to MinIO under `legal-corpus/{jurisdiction}/{court}/{year}/{citation}.pdf`, and emits one `legal_pdf_*.jsonl` per fetched batch into `memory/ingest/pending/`.
- **Ingest reuse** (XS): a new `recType === 'legal_pdf_chunk'` branch in `kag.ingest_memory_directory` that bypasses Redis-only storage and instead triggers the existing Evidence Pipeline (which already handles chunking + embedding + Qdrant upsert).
- **Admin UI** (S, separate from T1): a `/admin/legal-corpus` page filtered by jurisdiction / court / year / citation. **Do not merge with T1.** Dev memories and legal documents have different retention policies, different auth scope (case-bound vs admin-only), and different audit requirements.

**Gates before T2 starts**:
- [ ] Decide source priority: CourtListener (best free API) vs PACER (paid, exhaustive) vs state-by-state scraping (fragile)
- [ ] Confirm MinIO bucket layout — `legal-corpus/` namespace + retention policy
- [ ] Confirm `legal_documents` Qdrant collection schema accommodates jurisdiction + court + citation payload fields
- [ ] Confirm Drizzle `legalDocuments` table is the right destination (vs creating `case_law_pdfs`)
- [ ] Operator confirms ToS / fair-use scope per source before any fetcher runs

**Hard rule**: legal PDFs are **case-bound or jurisdiction-bound**, not admin-bound. The `/admin/legal-corpus` UI is for *administering the corpus* (re-index, evict, audit ToS compliance). End-user case workflow accesses legal PDFs through the existing case + evidence routes, NOT through admin.

### T3 — Shared `kag.search_records` MCP tool (the genuinely shared piece)

**Effort**: S (~1-2 hr after T1+T2 schemas stabilize)

The reusable abstraction is **not** a generic admin search component. It's a single MCP tool that takes a `record_type` filter + free-text + date range and returns context_timeline rows (or legal_documents rows once T2 lands). Both T1's admin UI *and* dev agents (Gemma4, Claude tool-calling) call this tool instead of hitting Postgres directly.

```
kag.search_records({
  record_type: 'agent_run_ingested' | 'error_ingested' | 'legal_pdf_chunk' | ...,
  text?:       string,         // payload->>'summary' ILIKE
  pipeline?:   string,
  since?:      ISO 8601,
  limit?:      number (default 50, max 200)
})
```

**Why this matters**: per CLAUDE.md TRACE/Karpathy lane rule, "Gemma4 MUST call named MCP tools. It does NOT talk to gRPC, Qdrant, Neo4j, or Postgres directly." T3 is the named tool that lets agents browse their own memory + the legal corpus through one safe surface.

**Ready when**: T1 schema is stable (it is now) AND T2 has landed at least one `legal_pdf_chunk` record so the dispatcher branch exists.

### Hard rules across T1–T3

- ❌ **Don't merge admin UIs.** T1 (dev memories, role=admin) and T2-admin (legal corpus, role=admin) are separate routes. Different retention, different audit, different mental model.
- ❌ **Don't add LLM analysis to T1 v1.** The page is read-only intentionally. Agents already analyze records via `kag.ingest_error` (deep-research path). Adding a "Summarize this run" button creates duplicate spend.
- ❌ **Don't store legal PDFs in `context_timeline`.** It's a journal, not a corpus. Legal PDFs go through the existing Evidence Pipeline → `legal_documents` + Qdrant `legal_documents` collection.
- ❌ **Don't expose T3 to non-authenticated agents.** Even though context_timeline rows are mostly system-generated, payload may contain user session IDs, case IDs, and tool-call traces.
- ❌ **Don't kick off T2 acquisition before operator ToS review.** CourtListener is free + permissive; PACER costs $0.10/page; state-court scrapers vary wildly. Get sign-off per source.

## Cross-references

- `next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md` — original architecture brief
- `next_steps/active/2026-05-08_3dgs-forensic-roadmap.md` — companion lane (real-photo 3DGS, deferred P3)
- `next_steps/active/2026-05-08_reconstruction-track-production-ready.md` — Complete / Scaffold-only / Not implemented split
- CLAUDE.md §"Reconstruction 3-Track Architecture (May 8, 2026)" — Tracks 1/2/3
- CLAUDE.md §"Gemma4 TurboQuant caveat" — D=128 vs D=256/512 fork pairing (relevant if Track 1 pushes Qwen for JSON extraction)
- `memory/hypergraph-4-lanes-vault.md` — retrieval substrate state (8/8 smoke green)
- CLAUDE.md §"Karpathy GPU Authority Blend + Redis ACE Cache" — embed cascade + TurboQuant chat-only constraint (relevant for N9 embedding lane)
