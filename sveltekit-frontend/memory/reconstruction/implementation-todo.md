# Crime Reconstruction — Implementation TODO

Live state as of 2026-05-08:

- **ComfyUI Desktop** — installed (`C:\Users\james\AppData\Local\Programs\@comfyorgcomfyui-electron\`), not running. Operator launches manually.
- **TurboQuant** :8090 — healthy, serves Gemma4-legal-vlm via llama-server.exe (chat + VLM).
- **Ollama** :11434 — running, `gemma4-rotorquant:latest` registered but cold.
- **Phase 0B compiler** — done, deterministic (`2240019055…`).
- **ComfyUI HTTP bridge** — done, smoke ready.
- **Phase 1 SceneIntent extractor** — appears in flight (operator-authored).
- **4-lane hypergraph + vault index** — green, 282 edges / 3991 vault rows / 8/8 smoke.

## Build order (each row independently shippable)

| # | Task | Owner | Status | Verify |
|---|------|-------|--------|--------|
| 0 | Start Docker Desktop (restores Postgres 5434 + Redis 6379) | Operator | 🟥 **stopped today** | `npm run smoke:hypergraph:vault` → 8/8 green |
| 1 | Start ComfyUI Desktop, note port | Operator | 🟥 not started (installed) | Desktop log shows "Starting server" at `127.0.0.1:<port>` |
| 2 | Set `COMFYUI_BASE_URL` env, run smoke | Operator | ⬜ blocked on (1) | `npm run comfyui:smoke` → `✅ ComfyUI bridge OK` |
| 3 | Build minimal workflow in ComfyUI Desktop, **Save (API Format)** | Operator | ✅ `dev-workflow-api.json` already saved (8 nodes) | File exists at `scripts/comfyui/workflows/dev-workflow-api.json` |
| 4 | POST workflow to `/api/comfyui/render`, poll history | Engineer | ⬜ blocked on (1)+(2) | `npm run comfyui:submit-smoke` → `✅ submitted: prompt_id = <uuid>` |
| 5 | Phase 1 SceneIntent extractor wired to Gemma4 (TurboQuant :8090) | Engineer | ✅ **shipped** (`scene-intent-extractor.ts`, `POST /api/reconstruction/scene-intent`) | TurboQuant healthy, route 200s with degraded fallback |
| 6 | 2D Lane-A timeline viewer | Engineer | ✅ **shipped** (`/demos/scene-intent-2d/+page.svelte`, 419 LoC) | Renders fixture w/ confidence colors + evidence drawer |
| 6a | Compile button on 2D viewer (POST → `/api/reconstruction/compile`) | Engineer | ✅ **shipped this session** | Click compiles, shows plan_hash + projection warnings + Mixamo mapping |
| 6b | Playwright spec for 2D viewer + Compile loop | Engineer | ✅ **shipped this session** (`tests/reconstruction-scene-intent-2d.spec.ts`) | `npm run test:e2e:scene-intent-2d` (needs dev server) |
| 7 | Install ComfyUI-3D-Pack node pack via Manager | Operator | ⬜ blocked on (1) | TRELLIS / image-to-GLB nodes appear in node search |
| 8 | Save TRELLIS image→GLB workflow as `scripts/comfyui/workflows/trellis-image-to-glb.json` | Operator | ⬜ blocked on (7) | Real workflow file replaces the placeholder |
| 9 | `evidence_3d_assets` Drizzle table + manual SQL migration | Engineer | ⬜ ready to draft (parallel, no blockers) | `psql -f drizzle/manual/evidence_3d_assets.sql` succeeds |
| 10 | `POST /api/evidence/[id]/comfyui-trellis` route — load evidence photo, swap LoadImage node, submit, poll, persist GLB to MinIO + audit | Engineer | ⬜ blocked on (8) + (9) | Round-trip writes `evidence_3d_assets` row with SHA-256 |
| 11 | RabbitMQ `evidence.render` producer wraps step 10 | Engineer | ⬜ blocked on (10) | API sub-second; SSE notifies on completion |
| 12 | Drag-drop UI on the WebGPU canvas | Engineer | ⬜ blocked on (11) | Drop a photo, see PS1 alleyway gain a GLB after ~30s |
| 13 | Pivot ComfyUI Desktop → portable/source venv on stable port :8188 | Operator | ⬜ blocked on (12) confirmed working | `npm run comfyui:smoke` green against new port |
| 14 | Mini-modal viewer (Bits UI Dialog `child` snippet, collapse/expand/fullscreen) | Engineer | ⬜ blocked on (12) | Modal opens from detective board, scene loads, scrubs timeline |
| 15 | `crime_scenes` Drizzle table + `/api/scene/[id]/export` ZIP endpoint | Engineer | ⬜ blocked on (14) | Export returns ZIP with `index.html` + `scene.json` + assets + `manifest.txt` |
| 16 | Standalone offline `index.html` viewer template (Three.js single-file ESM) | Engineer | ⬜ blocked on (15) | Double-click opens in Chrome offline, plays the scene |
| 17 | `blender.*` MCP tool family (intent only, calls deterministic compiler) | Engineer | ⬜ blocked on (5)+(6) (now unblocked) | Gemma4 agent proposes scene edits via MCP, compiler applies |

**Legend:** ✅ shipped · 🟥 outage today · ⬜ pending · 🟨 in flight

## Hard gates (re-stated, must hold across every row)

1. PS1/N64 stylization on environments (admissibility hedge).
2. Evidence-derived GLBs stay near-exact (no PS1 jitter on TRELLIS output).
3. SHA-256 every 3D asset, log model digest in `evidence_audit_log`.
4. No GPU/3D work on the Node main thread — RabbitMQ Python sidecars only.
5. Export ZIPs are SHA-256-verifiable (`manifest.txt`).

## Service inventory (where Gemma4 lives, where ComfyUI lives)

```
TurboQuant :8090        ← Gemma4 chat + VLM (llama-server.exe + mmproj)
Ollama :11434           ← Gemma4 fallback (cold by default)
ComfyUI Desktop :8000   ← image / video / 3D workflows (operator launches)
ComfyUI portable :8188  ← future production replacement for Desktop
SvelteKit :5173         ← orchestrator, API surface, MCP server
RabbitMQ :5672          ← scene.render / evidence.render / scene.export queues
MinIO :9000             ← GLB + MP4 storage
Postgres :5434          ← canonical DB (vault_md_index, hypergraph_edges, evidence_3d_assets)
Redis :6379             ← L1 cache (gpu:karpathy:*, ace:topo:*, etc.)
Qdrant :6333            ← codebase_chunks_768 + evidence_items + 4 other collections
Neo4j :7474/:7687       ← graph topology, SIMILAR_TOPOLOGY edges
```

**Rule of thumb:** SvelteKit is the only thing that talks to all of them. No service talks to another service except through SvelteKit (or a RabbitMQ queue SvelteKit produces to). This is the "web tier stays light" hard gate from CLAUDE.md.

## Quick commands

```powershell
# Operator: launch ComfyUI Desktop manually (or click Desktop shortcut)
& "C:\Users\james\AppData\Local\Programs\@comfyorgcomfyui-electron\ComfyUI.exe"

# Engineer: probe bridge against Desktop
$env:COMFYUI_BASE_URL = "http://127.0.0.1:8000"   # Desktop default
npm run comfyui:smoke

# Engineer: probe against portable / source ComfyUI
$env:COMFYUI_BASE_URL = "http://127.0.0.1:8188"
npm run comfyui:smoke

# Operator: confirm TurboQuant is up before SceneIntent extraction
curl http://127.0.0.1:8090/health

# Operator: load Gemma4 into Ollama (only if TurboQuant is down)
curl -X POST http://127.0.0.1:11434/api/generate `
  -H "Content-Type: application/json" `
  -d '{"model":"gemma4-rotorquant:latest","prompt":"warm","keep_alive":"1h"}'

# Engineer: Phase 0B compiler (deterministic, byte-identical re-runs)
npm run reconstruction:compile-demo

# Engineer: 4-lane hypergraph regression gate
npm run smoke:hypergraph:vault
```
