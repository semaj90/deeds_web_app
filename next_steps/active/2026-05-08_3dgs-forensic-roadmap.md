# 3D Scene Reconstruction Lane — Roadmap (3DGS / NeRF / Photogrammetry)

> Captures planning intent for the forensic crime-scene reconstruction lane.
> **Not** a request to implement now — this is the staged trigger map for
> when each capability becomes load-bearing. Mirrors the structure of
> [2026-05-08_serialization-roadmap.md](2026-05-08_serialization-roadmap.md).

## Current state (2026-05-08)

| Layer | Tooling | Status |
|---|---|---|
| Image evidence schema | `screenshot_artifacts` Postgres table + 12 indexes (HNSW, trgm, JSONB) | ✅ provisioned |
| Sharp pipeline | `enrich-screenshots.mjs` (phash, dhash, 16×16/64×64 thumbs) | ✅ tested on 30 baselines |
| VLM caption | `caption-screenshots-gemma4.mjs` (Ollama VLM) | ⚠️ blocked by VRAM (TurboQuant on :8090); see visual-evidence-lane TODO |
| Caption embeddings | `embeddinggemma:latest` → 768-dim → HNSW | ✅ verified end-to-end with synthetic vector |
| Topology link | `cluster_id` text column matching Qdrant `cluster_key` | ✅ ready, populates after caption pass |
| 3D scene reconstruction | none | 🔴 deferred (P3) |
| WebGL/WebGPU viewer | none | 🔴 deferred (P3) |
| Frame-level video analysis | none | 🔴 deferred (P3) |
| Chain-of-custody audit | implicit via `created_at` + `metadata` JSONB | ⚠️ formalize when forensic use is live |

## Decision matrix — what to build vs defer

### Build now (already in flight)
- 2D screenshot evidence lane: phash dedupe, VLM caption, embedding,
  Qdrant index. Covers UI regression, route screenshot review, evidence
  catalog. Closes via the visual-evidence-lane TODO.

### Build when load-bearing (P2 — hours of work each)
- **`visual_change_score`** — Sharp pixel-diff between current and previous
  same-route screenshot → Redis dirty queue. Trigger: ACE asks "what
  routes drifted since last index?"
- **`visual_rank`** composite — combine `graphAuthorityScore` +
  `visualChangeScore` + `auditRisk` + `componentCentrality`. Trigger:
  agent needs a single-number "where to look first" ranking.
- **Per-Bits-UI-primitive baselines** — capture canonical demo state for
  the 9 primitives in active use. Trigger: visual regression on a
  primitive should compare to a known-good, not the previous run.

### Defer (P3+ — days of work, high VRAM cost)
- **3D Gaussian Splatting (3DGS)** — scene reconstruction from photos.
  Trigger: actual forensic case requires 3D walk-through. Cost: 8 GB VRAM
  is "minimum, restrictive"; needs ≥12 GB for production scenes (RTX 4080+
  or cloud A100). On RTX 3060 Ti, viable only with FP16 + tiling for
  small interiors (200–400 photos).
- **Photogrammetry fallback** (COLMAP / OpenMVG) — CPU-bound, hours per
  scene. Trigger: 3DGS doesn't fit, and a static mesh is acceptable.
- **NeRF / Instant-NGP** — only if 3DGS doesn't converge. 3DGS dominates
  on speed (6 min vs 48 hr for mip-NeRF-360 at comparable PSNR).
- **WebGPU 3DGS viewer** (WebSplatter pattern) — 1.2–4.5× faster than
  WebGL. Trigger: client-side splat counts exceed 8–16 M (Three.js limit
  per Kellogg's GaussianSplats3D).
- **Server-side render + GLTF stream** — fallback for clients without
  WebGPU. Trigger: deploying to mobile / older browsers.
- **WebCodecs frame analysis** — `VideoFrame` + `OffscreenCanvas` worker
  pipeline, YOLOv8n ONNX detection, Tesseract OCR. Trigger: investigator
  needs frame-level evidence review (timeline, entry/exit paths,
  per-frame object detection).
- **Gaussian → SuGaR mesh extraction → Blender headless → Mixamo rig →
  animation** — full evidence presentation pipeline. Trigger: courtroom
  exhibit needs animated 3D scene walkthrough.

## Schema readiness — already in place

Today's `screenshot_artifacts` covers most of the forensic image table the
research note proposes. Gap analysis:

| Research-note field | `screenshot_artifacts` column | Status |
|---|---|---|
| `id` UUID PK | ✅ `id uuid` | match |
| `source_kind` | ✅ `source_kind text` | match |
| `image_uri` | ✅ `image_uri text` | match |
| `caption` | ✅ `caption text` | match |
| `ocr_text` | ✅ `ocr_text text` | match |
| `phash` | ✅ `phash text` + index | match |
| `cluster_key` | ✅ `cluster_id text` | renamed; same intent |
| `metadata` | ✅ `metadata jsonb` + GIN | match |
| `chain_of_custody` log | ⚠️ implicit via `created_at` + `updated_at` | need explicit audit table for forensic use |
| `camera_id` / `gps` | ⚠️ ride in `metadata` JSONB for now | promote to first-class when load-bearing |
| `3d_anchor_position` | 🔴 not present | add `point4d` column when 3DGS lands |
| `scene_id` | 🔴 not present | add when scene reconstruction starts |

## Hard gates (do not skip)

1. **Forensic admissibility requires audit logs.** Implicit timestamps in
   the table are insufficient for legal use. When this lane goes live for
   real cases:
   - Add `evidence_audit_log` table: `(action, evidence_id, user_id, ts, sha256)`
   - SHA-256 every blob at write time; store hash in `metadata.sha256`
   - Append-only WAL or WORM storage for the audit log
   - This already exists for `evidence` table (`evidenceAuditLog` per
     CLAUDE.md) — extend the same pattern to `screenshot_artifacts`.

2. **Original media is read-only.** Processed copies only.

3. **Model versions are auditable.** Every `caption` row needs
   `metadata.model = 'gemma4-legal-vlm:latest@<digest>'` so a future
   review can prove which model produced the description.

## Pipeline shape (when activated)

```
photos / video frames
  ↓ COLMAP camera calibration
sparse points + intrinsics + extrinsics
  ↓ 3DGS train (Inria reference impl)
gaussians.ply / .splat
  ↓ SuGaR (surface-aligned Gaussians → Poisson mesh)
scene_mesh_textured.ply
  ↓ Blender headless (decimate, UV, GLTF export)
scene.glb
  ↓ optional: Mixamo auto-rig + Blender render
clip.mp4

Parallel lane (per frame / image):
  Sharp normalize → phash/dhash → 16×16/64×64 thumbs
  Gemma4 VLM caption (via :8090 to share VRAM)
  EmbeddingGemma caption embedding
  Optional Tesseract OCR (text-heavy frames only)
  Optional YOLOv8n ONNX detection (P3 — UI element boxes)
  Optional MobileSAM masks (P4 — pixel-level segmentation)
```

## Web-rendering decision

Default: **server-render, stream GLTF**. Why:
- 3DGS client-side: borderline on 8 GB; sorting millions of splats hits
  WebGL CPU bottleneck.
- GLTF over Three.js: works on every browser, accepts annotation
  overlays via `<canvas>`, integrates with Bits UI Dialog pattern for
  the evidence-tray modal interaction sketched in the research note.
- WebGPU port: when telemetry shows WebGL CPU sort > 30% frame time on
  RTX 3060 Ti reference scenes.

## RTX 3060 Ti operating envelope

Verified for the existing GPU pipeline (LibTorch + Karpathy GPU enrich):
- **Free VRAM at idle**: 7,126 / 8,191 MB
- **Karpathy GPU pipeline footprint**: ~196 KB (autoencoder weights) +
  6 KB (encoded buffer for 24 vectors) — negligible
- **Embeddinggemma loaded**: 1,108 MB
- **TurboQuant gemma4-legal-vlm**: ~5,300 MB (loaded on demand, exclusive)

3DGS budget on this card: maybe 200–400 photos at 1024px FP16 with
aggressive Gaussian pruning. Larger scenes need RTX 4080+ or batch
processing.

## Trigger checklist

Before opening this lane:
- [ ] Visual evidence lane (P0–P2 in visual-evidence-lane TODO) green
- [ ] First real forensic case requires 3D walk-through (not 2D photos)
- [ ] Either: RTX 4080+ in budget, OR willing to ship server-side render
- [ ] Audit-log extension to `screenshot_artifacts` shipped
- [ ] CLAUDE.md updated with chain-of-custody invariants for visual evidence

When all five tick: re-read this doc, lift the relevant pipeline stages,
ship behind a feature flag.

## Cross-references

- [2026-05-08_visual-evidence-lane-todo.md](2026-05-08_visual-evidence-lane-todo.md) — current 2D pipeline TODO
- [2026-05-08_serialization-roadmap.md](2026-05-08_serialization-roadmap.md) — JSONB → Proto → gRPC → MCP → QUIC layer triggers
- [2026-05-08_mcp-trace-hardening-session.md](2026-05-08_mcp-trace-hardening-session.md) — this session's work log
- `drizzle/manual/screenshot_artifacts.sql` — schema already in place
- `scripts/screenshots/` — caption + enrich + index scripts
- CLAUDE.md §"Evidence Pipeline (8 stages)" — existing `evidence` table
  audit pattern to mirror

## Why this is on the back burner

- Current backlog (visual lane P0–P2) covers 90% of the agent's UI/UX
  evidence needs without 3D.
- 3DGS on 8 GB VRAM is a research project, not a feature.
- Forensic admissibility is a chain-of-custody problem first, a render
  problem second. Solve audit logs before pixels.
- HTTP/2 and JSON-RPC handle current data shapes. Don't pre-build a
  splat-streaming protocol.

When the trigger lands: this doc becomes the implementation brief.