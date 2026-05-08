# ComfyUI HTTP Bridge — Phase 0

Minimal HTTP-only bridge between SvelteKit and a running ComfyUI instance.

## What this phase does

- Probe ComfyUI reachability (`GET /api/comfyui/health`)
- Submit a `workflow_api.json` payload (`POST /api/comfyui/render`)
- Poll `/history/<promptId>` for completion (client-side helper)
- Build `/view` URLs for generated outputs

## What this phase does NOT do

- ✗ Run TRELLIS image→GLB locally
- ✗ Process / decimate / upload GLBs
- ✗ Write to MinIO, Postgres, Redis, Qdrant, or Neo4j
- ✗ Publish to RabbitMQ
- ✗ Drag-drop UI / canvas integration
- ✗ Download ComfyUI models
- ✗ Install custom node packs (TRELLIS.2 / ComfyUI-3D-Pack)

That all comes later. **This phase is the stable HTTP primitive every
later phase composes against.**

## Files

| File | Role |
|------|------|
| [`src/lib/server/comfyui/comfyui-client.ts`](../../src/lib/server/comfyui/comfyui-client.ts) | `ComfyUIClient` class: `healthCheck`, `submitPrompt`, `getHistory`, `getViewUrl`, `waitForCompletion` |
| [`src/routes/api/comfyui/health/+server.ts`](../../src/routes/api/comfyui/health/+server.ts) | `GET` — auth-guarded reachability probe |
| [`src/routes/api/comfyui/render/+server.ts`](../../src/routes/api/comfyui/render/+server.ts) | `POST` — Zod-validated workflow submission |
| [`scripts/comfyui/smoke-comfyui-client.mjs`](../../scripts/comfyui/smoke-comfyui-client.mjs) | Smoke probe — passes if ComfyUI is up; non-strict mode exits 0 when ComfyUI is down |
| [`scripts/comfyui/workflow_api.example.json`](../../scripts/comfyui/workflow_api.example.json) | Placeholder workflow shape — replace with a real export from ComfyUI Desktop |

## Env contract

```
COMFYUI_BASE_URL=http://127.0.0.1:8188   # default if unset
```

The client is stateless — `new ComfyUIClient({ baseUrl })` overrides at
construction time. The default singleton (`comfyui` named export) binds
to `process.env.COMFYUI_BASE_URL` at import time.

## Failure-mode contract (degraded JSON)

`/api/comfyui/health` and `/api/comfyui/render` return **200** with
`{ ok: false, error: '...' }` when ComfyUI is unreachable, returns a
non-2xx status, or rejects the workflow. They do NOT throw 500s on
network failure — clients destructure the same top-level keys whether
ComfyUI is up or down. (Same shape contract as the rest of the API per
CLAUDE.md §"Degraded Response Contract".)

`/api/comfyui/render` does throw 400 on bad input (missing/invalid
workflow object) and 401 when no session is present.

## Running ComfyUI for development

```
# Operator runs locally:
python main.py --listen 127.0.0.1 --port 8188
# Or via ComfyUI Desktop on the same port.

# Smoke from the deeds repo:
cd sveltekit-frontend
npm run comfyui:smoke
# → "✅ ComfyUI bridge OK" if reachable
# → "⚠ ComfyUI is not running — skipping" if not (exit 0)

# Strict mode (CI):
npm run comfyui:smoke:strict
# → exits 1 if ComfyUI is not reachable

# Submit a real workflow (drop API Format export into scripts/comfyui/workflows/):
npm run comfyui:submit-smoke
# → "skipped: no workflow file" if scripts/comfyui/workflows/dev-workflow-api.json missing
# → "skipped: ComfyUI unreachable" if ComfyUI offline
# → "✅ submitted: prompt_id = <uuid>" on success
npm run comfyui:submit-smoke:strict   # promotes both skip cases to exit 1
```

## Submitting a real workflow

1. Open ComfyUI Desktop → build the workflow you want.
2. Workflow → **Save (API Format)** → produces a JSON file (the API graph
   is different from the human-editable `.json` workflow file — it's
   keyed by node ID, with `class_type` per node).
3. POST that JSON as `body.workflow` to `/api/comfyui/render`:

```ts
const res = await fetch('/api/comfyui/render', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body:    JSON.stringify({ workflow: workflowApiJson, client_id: 'detective-mode-1' }),
  credentials: 'include',
});
const { ok, prompt_id, error } = await res.json();
```

4. Poll `getHistory(prompt_id)` (or use `waitForCompletion` server-side)
   until `done: true`. Outputs come back keyed by node id.

5. For each output file, build `client.getViewUrl(filename, subfolder, type)`
   to get the download URL. ComfyUI hosts the file directly — no
   intermediate copy through the SvelteKit server.

## Phase 1 (next, NOT in this commit)

When TRELLIS.2 / ComfyUI-3D-Pack node packs are installed:

1. Operator drops the TRELLIS workflow_api.json into
   `scripts/comfyui/workflows/trellis-image-to-glb.json` (replaces the
   placeholder).
2. New endpoint `POST /api/evidence/[id]/comfyui-trellis` reads the
   evidence photo, swaps the LoadImage node's image input, calls
   `comfyui.submitPrompt()`, and waits for the GLB output.
3. RabbitMQ producer wraps step 2 so the API stays sub-second.
4. GLB → MinIO + `evidence_3d_assets` row + `evidenceAuditLog` entry
   with SHA-256 + model digest (chain-of-custody hard gate per CLAUDE.md).

## Hard-gate alignment

This bridge phase respects all five reconstruction hard gates from
CLAUDE.md §"Reconstruction 3-Track Architecture":

1. **Stylization is the admissibility hedge** — the example workflow's
   positive prompt explicitly requests "PS1 low-poly … demonstrative
   reconstruction" and the negative prompt rejects "photorealistic, high
   detail". Real workflows the operator drops in must follow the same
   rule.
2. **Evidence is near-exact** — TRELLIS workflows (Phase 1) preserve
   silhouette/texture from the source photo. The HTTP bridge does not
   modify pixels; it only proxies submission.
3. **Chain of custody** — Phase 1 will SHA-256 every GLB at write time
   and log `metadata.trellis_model = '...'` to evidence_audit_log. This
   bridge is the network primitive it builds on.
4. **No GPU work on the Node main thread** — ComfyUI runs in its own
   process on its own port. The bridge is pure HTTP fetch.
5. **Export bundles SHA-256-verifiable** — orthogonal to this phase
   (export ZIP packing is Phase 6).
