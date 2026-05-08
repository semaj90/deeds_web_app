# ComfyUI Workflow Library

Drop **`Save (API Format)`** exports from ComfyUI Desktop here. The
submission smoke (`npm run comfyui:submit-smoke`) defaults to
`dev-workflow-api.json` in this directory.

## Why API Format, not the visual workflow JSON

ComfyUI exports two JSON shapes:

| Format | Source | Shape | What it's for |
|--------|--------|-------|---------------|
| **API Format** | `Settings → Save (API Format)` | flat object: `{ "<nodeId>": { class_type, inputs } }` | Submitted to `POST /prompt` — the runtime API contract |
| Visual workflow | `File → Save Workflow` | nested `{ nodes, links, groups }` | Loaded back into the ComfyUI UI for editing — **not** accepted by the API |

Use API Format. The bridge will reject the visual format with a node-shape error.

## Recommended workflows

| Filename | Purpose | Required nodes | Status |
|----------|---------|----------------|--------|
| `dev-workflow-api.json` | Smoke test — any small graph (e.g. KSampler → VAEDecode → SaveImage) | core ComfyUI only | drop yours here |
| `trellis-image-to-glb.json` | Future Phase 1 — single photo → GLB mesh | `ComfyUI-3D-Pack` (TRELLIS.2 nodes) | not yet — author when node-pack is installed |

## Authoring flow

1. Open ComfyUI Desktop (or portable/source)
2. Build the graph visually
3. Run it once locally to confirm it works in the UI
4. **`Settings → Save (API Format)`** → save here
5. Validate from the repo:
   ```bash
   npm run comfyui:submit-smoke
   ```
6. If `--strict` and ComfyUI is reachable + workflow exists, the script
   exits 1 on any failure. Otherwise non-strict skips cleanly.

## What the smoke does NOT do

- ❌ Download models or checkpoints
- ❌ Install custom node packs
- ❌ Process outputs (no GLB / image fetch / decode)
- ❌ Write to MinIO / Postgres / Qdrant / Redis / Neo4j
- ❌ Publish RabbitMQ messages
- ❌ Require the SvelteKit dev server (uses `tsx` to import the client directly)

It is purely the HTTP submission round-trip: `POST /prompt` → `prompt_id`,
plus an optional `GET /history/<prompt_id>` poll via `--poll-once`.

## Gitignore convention

The directory itself is tracked (`.gitkeep`). Individual workflow JSONs
are **opt-in tracked** — small generic ones (smoke, fixtures) belong in
git; case-specific or model-specific exports may be too large or contain
operator-specific paths and should be `.gitignore`d as needed.
