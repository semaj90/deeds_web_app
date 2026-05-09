# WebGPU Canvas + Gemma4 MCP Agent — Architecture Capture

> **Status: capture-only.** Architecture decisions for the interactive
> WebGPU detective canvas with agentic LLM tool calling, full-canvas
> ingestion, Fuse.js fuzzy search, mutation logging, and autoencoding.
> **No implementation in this doc.** When the canvas track activates,
> this becomes the implementation brief.
>
> Ships alongside Phase 1 (`SceneIntent` extractor + 2D viewer, complete)
> and Phase 0B (deterministic compiler, byte-identical at hash
> `2240019055…`). The canvas is the **interactive front door** to
> everything Phase 1+ produces — same `SceneIntent` shape, same evidence
> IDs, same `Demonstrative reconstruction` disclaimer.

## The five questions, answered

1. **Can Gemma4 manipulate the canvas via MCP?** Yes — but only via a
   read + intent-emission loop. The agent never writes WebGPU / WGSL /
   Three.js code, never mutates state directly. It emits validated
   intent JSON; a deterministic reducer applies the patch.
2. **How do we ingest all canvas elements?** Canonical-JSON `SceneState`
   snapshot — small enough to fit in an MCP tool result, deterministic
   enough that two snapshots of the same scene hash identically.
3. **How do we search?** Fuse.js inside a Web Worker. The main thread
   owns rendering; the worker owns the index. Index is rebuilt on
   `canvas_mutation` events, never on every frame.
4. **How do we log + autoencode?** Append-only `context_timeline` rows
   with `event_type='canvas_mutation'` (table already wired). Compact
   summaries autoencoded via `/api/embed` → embeddinggemma → 64-dim
   `gpu:karpathy:encoded` Redis hash, same path as the Karpathy GPU
   pipeline already shipped.
5. **service_worker vs web_workers?** Three-way split — they do
   different jobs, never the same one.

## The agent loop (load-bearing principle)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  WebGPU Canvas (main thread)                                            │
│   • Renders scene from canonical SceneState                             │
│   • Captures user interaction (selection, drag, drop, camera)           │
│   • On 'analyze with agent' click: snapshot → POST /api/scene/agent     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  /api/scene/agent  (server)                                             │
│   • Builds compact SceneState message + evidence index                  │
│   • Runs gemma4-agent.ts with NEW read-only scene.* MCP tools            │
│   • Streams tool calls + final intent ops via SSE                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Gemma4 (or Qwen) — read-only tool calling                              │
│   • scene.list_elements()                                               │
│   • scene.find_by_evidence_id(evidence_id)                              │
│   • scene.find_disputed_events()                                        │
│   • scene.summarize_actor(actor_id)                                     │
│   • scene.suggest_next_action()  ← returns intent op proposals          │
│   • Final answer is an array of validated SceneOp JSON                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Reducer (pure function, server + client mirror)                        │
│   • Validates each SceneOp via Zod                                      │
│   • Applies op → new SceneState (immutable)                             │
│   • Computes before_hash + after_hash (canonical-JSON sha256)           │
│   • Writes context_timeline row (event_type='canvas_mutation')          │
│   • Returns patch to canvas via SSE                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Canvas applies patch → re-render                                       │
│   • Web Worker rebuilds Fuse.js index off the new state                  │
│   • Service Worker caches the canonical state for offline review         │
│   • IndexedDB persists the state (same 7-day TTL as client-cache.ts)     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Read-only MCP tool surface (`scene.*`)

The agent **reads** the scene; the reducer **writes** it. The MCP tools
are intentionally read-only — that's the audit guarantee. Every visible
mutation flows through the SceneOp Zod schema below.

| Tool | Returns | Purpose |
|---|---|---|
| `scene.list_elements({ kind?: 'actor' \| 'event' \| 'evidence' \| 'annotation' })` | Element[] | Ingest all canvas content into the LLM context window without flooding tokens |
| `scene.find_by_evidence_id(evidence_id)` | { event_ids[], actor_ids[], anchor_pos? } | Cross-link a piece of evidence to every place it appears |
| `scene.find_disputed_events()` | EventSummary[] | "Where should the detective focus?" |
| `scene.summarize_actor(actor_id)` | { role, label, appearances[], evidence_ids[] } | Per-actor digest |
| `scene.context_at(t_seconds)` | { active_actors[], current_event, prior_events[] } | Time-anchored context — what's happening at moment T |
| `scene.suggest_next_action()` | SceneOp[] | Returns proposals — UI gates apply before commit |

These plug into `src/mcp/server.ts` (already 29 tools live) the same
way `kag.multi_lane_search` did. Lazy imports — the canvas track ships
behind a feature flag without bloating the MCP base bundle.

## The SceneOp shape (intent JSON, not code)

```ts
const SceneOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_annotation'),
    target_kind: z.enum(['actor', 'event', 'evidence', 'free']),
    target_id: z.string().optional(),
    text: z.string().min(1),
    confidence: z.enum(['high', 'medium', 'low']),
    evidence_id: z.string().optional(),
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
    proposed_by: z.enum(['user', 'gemma4', 'qwen', 'system']),
  }),
  z.object({
    op: z.literal('place_evidence'),
    evidence_id: z.string(),
    position: z.tuple([z.number(), z.number(), z.number()]),
    proposed_by: z.enum(['user', 'gemma4', 'qwen', 'system']),
  }),
  z.object({
    op: z.literal('select_event'),
    event_id: z.string(),
    proposed_by: z.enum(['user', 'gemma4', 'qwen', 'system']),
  }),
  z.object({
    op: z.literal('mark_disputed'),
    event_id: z.string(),
    reason: z.string().min(1),
    proposed_by: z.enum(['user', 'gemma4', 'qwen', 'system']),
  }),
  z.object({
    op: z.literal('camera_to'),
    keyframe: z.object({
      t: z.number().optional(),
      position: z.tuple([z.number(), z.number(), z.number()]),
      look_at: z.tuple([z.number(), z.number(), z.number()]),
    }),
    proposed_by: z.enum(['user', 'gemma4', 'qwen', 'system']),
  }),
]);
```

**Agent-proposed ops require user confirmation** for irreversible state
changes (`mark_disputed`, `place_evidence`). User-direct ops apply
immediately. Same pattern as the AGENTS.md tool allowlist in CLAUDE.md.

## Mutation log — already wired

`context_timeline` Drizzle table is already shipped (per MEMORY.md
`drizzle/0015_context_timeline.sql`, journal idx 15). Each canvas op
writes one row:

```json
{
  "event_id":     "sceneevt_<ulid>",
  "event_type":   "canvas_mutation",
  "scene_id":     "<scene_id>",
  "actor":        "user|gemma4|qwen|system",
  "op":           "add_annotation|place_evidence|...",
  "target_id":    "<element-id>",
  "before_hash":  "sha256:<canonical-json hash of pre-state>",
  "after_hash":   "sha256:<canonical-json hash of post-state>",
  "evidence_ids": ["ev-17", "ev-witness-A"],
  "confidence":   "medium",
  "case_id":      "<uuid>",
  "user_id":      "<uuid>",
  "timestamp":    "2026-05-08T..."
}
```

The hash chain (`before_hash` of op N == `after_hash` of op N-1) is the
**chain-of-custody for canvas state**. Tampering anywhere breaks the
chain visibly. Mirrors the `evidenceAuditLog` pattern from CLAUDE.md
§Evidence Pipeline.

The existing RL feedback loop (per MEMORY.md, `adaptFromAnalytics`) can
treat `canvas_mutation` events as positive/negative signals — agent ops
the user accepts boost the agent's policy weights for that op type.

## Three memory layers (L1 / L2 / L3)

Mirrors the existing client-side cache hierarchy from CLAUDE.md §Cache
Hierarchy (LokiJS → IndexedDB → Memory → Redis):

| Layer | Storage | Built by | TTL | Use |
|---|---|---|---|---|
| **L1 SceneState** | IndexedDB `scene-state` object store | Reducer (every op) | 7 days | Canonical state per scene_id; survives reload, offline review, browser refresh |
| **L2 Fuse.js index** | Web Worker memory | Worker rebuilds on canvas_mutation | session | Fuzzy search over actor labels, evidence IDs, annotation text, transcript snippets |
| **L3 Embeddings** | Redis `gpu:karpathy:encoded` (existing hash) | Server-side `/api/embed` → embeddinggemma → 64-dim autoencoded | 24h | Semantic search across cross-case scenes; feeds ACE retrieval as `scene_event` source kind |

### L1 — IndexedDB SceneState

Use the existing IndexedDB layer (`src/lib/ai/client-cache.ts`). New
object stores:

```ts
'scene-state' object store:
{
  scene_id: string,                  // primary key
  scene_intent: SceneIntent,         // Zod-validated, from Phase 1
  scene_plan?: CrimeScenePlan,       // optional projection from Phase 0B
  ops_applied: SceneOp[],            // every op since the initial extraction
  current_state_hash: string,        // sha256 of canonical-JSON state
  case_id?: string,
  saved_at: ISO,
  schema_version: 'v1',
}

'scene-assets' object store:
{
  sha256: string,                    // primary key — content-addressed
  blob: Blob,                        // GLB or .splat bytes
  source: 'trellis' | 'splat-library' | 'mixamo' | 'comfyui-still',
  evidence_id?: string,
  size_bytes: number,
  created_at: ISO,
}
```

localStorage is **not** used — caps at 5-10MB, can't hold GLBs / splats.
IndexedDB handles GBs comfortably.

### L2 — Fuse.js in a Web Worker

The worker owns the search index, never the main thread. Index is
rebuilt **only on `canvas_mutation`**, not on every frame (so 60fps
rendering is unaffected). The main thread sends a query, the worker
sends back results. Standard postMessage, no SAB needed.

```ts
// scene-search.worker.ts
import Fuse from 'fuse.js';

let index: Fuse<unknown> | null = null;

self.onmessage = (e) => {
  if (e.data.type === 'rebuild') {
    const docs = flattenScene(e.data.state); // actors + events + annotations + evidence
    index = new Fuse(docs, {
      keys: ['label', 'text', 'evidence_id', 'actor_id', 'event_id'],
      threshold: 0.4,
      ignoreLocation: true,
    });
    self.postMessage({ type: 'rebuilt', count: docs.length });
  }
  if (e.data.type === 'search' && index) {
    self.postMessage({
      type: 'results',
      query: e.data.query,
      hits: index.search(e.data.query).slice(0, 20),
    });
  }
};
```

### L3 — Autoencoded scene events

Per MEMORY.md, `gpu:karpathy:encoded` is the existing Redis hash for
64-dim autoencoded vectors keyed by `<file_path>` (Karpathy GPU
pipeline). Extending the same shape for scene events:

```
Key: gpu:scene:encoded
HSET scene:<scene_id>:event:<event_id> <64-dim CSV>
```

Each canvas_mutation triggers (background) a server call:
1. Compose a 1-paragraph summary of the post-state change ("Witness pin added at evt-002 with low confidence").
2. POST `/api/embed` (existing — Redis L1 + Bifrost L2 cached path) → 768-dim from embeddinggemma.
3. Run the existing autoencoder (768→64) — the same one from `karpathy-gpu-enrich.mjs`.
4. HSET into `gpu:scene:encoded`.

ACE retrieval gets a new source kind `scene_event` it can blend into
the existing pipeline. No new infrastructure needed — this is reusing
the Karpathy GPU memory path that already exists.

## Three workers, three jobs (do not collapse them)

| Worker type | Responsibility | What it owns | What it does NOT do |
|---|---|---|---|
| **Web Worker** | CPU-bound pure compute | Fuse.js index, canonical-JSON serialization, batched analytics POSTs, ZIP packing for export | Rendering, GPU calls, persistence |
| **Service Worker** | Offline + caching layer | The exported air-gapped scene-export ZIP, asset cache (GLB/splat blobs), background sync queue | Heavy compute, agent calls, render loops |
| **OffscreenCanvas + Worker** | Render loop relocation | The actual WebGPU draw loop when scenes exceed ~5k draw calls — keeps input thread responsive | Cross-frame state, agent ingestion, search |

**Common mistake to avoid**: putting Fuse.js in the service worker.
Service workers can be killed by the browser at any time. Search index
disappears mid-query. Fuse.js belongs in a regular Web Worker tied to
the page lifetime.

**Common mistake #2**: using OffscreenCanvas for small scenes. Below
~2-3k draw calls, the postMessage cost of shipping camera + state
deltas to the worker exceeds the cost of just rendering on main thread.
Threshold-gate it.

## Air-gapped export contract (revisited)

The same ZIP from the Phase-6 plan in `2026-05-08_detective-mode-3d-reconstruction.md`
becomes the **service-worker-cacheable artifact**:

```
exported-scene.zip
├── index.html                      ← Three.js / WebGPU viewer (single file ~200KB ESM)
├── scene.json                      ← SceneIntent + ops_applied[] + final state hash
├── canvas-mutation-log.jsonl       ← Append-only mutation log (chain-of-custody)
├── service-worker.js               ← Caches all assets for fully-offline replay
├── assets/
│   ├── characters/*.glb
│   ├── evidence/*.glb              ← TRELLIS-derived, near-exact
│   └── environment.glb (or .splat) ← curated 3DGS environment library
├── thumbnails/
└── manifest.txt                    ← SHA-256 of every file (chain-of-custody)
```

Open `index.html` in Chrome offline → service worker installs → scene
plays → search works → annotations visible. Zero network. The mutation
log JSONL lets a reviewer prove "this scene was reconstructed by these
actors via these operations in this order."

## What's already in place we can reuse

- `bifrostChat()` for the agent call (3-tier cache automatic — L1 Redis exact + L2 Bifrost semantic + L3 Ollama)
- `gemma4-agent.ts` tool-calling loop (5 round cap, JSON-only protocol)
- `src/lib/ai/client-cache.ts` (LokiJS + IndexedDB dual-tier — extend to add `scene-state` and `scene-assets` stores)
- `context_timeline` Postgres table (mutation log target, already wired)
- `gpu:karpathy:encoded` Redis hash (autoencode target, same pattern)
- `/api/embed` (existing Redis + Bifrost cached embedding path)
- Existing 4-lane hypergraph + vault store for cross-scene retrieval
- Existing WebGPU shaders: `crime-scene.wgsl` (279 LoC), `crt-postprocess.wgsl` (133 LoC)

## What's net-new (when this lane activates)

1. `src/lib/types/scene-state.ts` — `SceneState`, `SceneOp`, `Element` Zod schemas
2. `src/lib/server/canvas/reducer.ts` — pure-function `applyOp(state, op) → newState`
3. `src/lib/canvas/scene-search.worker.ts` — Fuse.js worker
4. `src/lib/canvas/scene-render.worker.ts` — OffscreenCanvas WebGPU render worker (gated by element-count threshold)
5. `src/lib/canvas/scene-state.svelte.ts` — `$state`-backed canvas store with reducer integration
6. `src/lib/canvas/canvas-service-worker.ts` — offline asset cache for export bundles
7. `src/mcp/scene-tools.ts` — read-only `scene.*` tool surface
8. `src/routes/api/scene/agent/+server.ts` — agent endpoint, SSE, returns `SceneOp[]` proposals
9. `src/routes/api/scene/op/+server.ts` — accepts a single `SceneOp`, validates, writes mutation log row, returns patch
10. `src/routes/api/scene/embed/+server.ts` — autoencode worker, fires on `canvas_mutation` (RabbitMQ-queueable for batching)

Nine new files. None depend on Blender, ComfyUI, TRELLIS, or Mixamo —
this entire layer can ship as **client-side rendering only** while
those rendering tracks mature in parallel.

## What this enables (sequenced)

| Capability | Depends on |
|---|---|
| Live AI annotation: "Gemma4, what should I look at?" | `scene.suggest_next_action()` + reducer + SSE — all of this doc |
| Cross-case search: "show me other scenes with this evidence pattern" | L3 autoencoded embeddings + ACE retrieval |
| Air-gapped legal review | Service worker + mutation log + manifest.txt |
| Detective-mode replay: scrub the timeline of agent decisions | mutation log + canvas state replay |
| Disputed-fact tracking: every disputed event flagged in the log | SceneOp `mark_disputed` + L1 state |
| Confidence-based filtering: hide low-confidence reconstructions on demand | SceneOp metadata + canvas filter UI |

## Hard gates (carry over from the .md plan)

1. **LLM emits intent JSON, never WebGPU/WGSL/Three.js code.** Reducer is the only mutator.
2. **Every mutation has a chain-of-custody hash pair** (before_hash → after_hash).
3. **Agent ops on irreversible state require user confirmation.** Reversible ones (selection, camera) apply immediately.
4. **No GPU work on the Node main thread.** Render loops in OffscreenCanvas + Worker; agent calls in `bifrostChat` over RabbitMQ-queueable workers when batched.
5. **Demonstrative-reconstruction disclaimer on the canvas at all times** — same string as `SCENE_INTENT_DISCLAIMER` from Phase 1.

## Cross-references

- Phase 0B (deterministic compiler): [README.md](./README.md), [scene-compiler.ts](../../src/lib/server/reconstruction/scene-compiler.ts), hash `2240019055…` byte-identical
- Phase 1 (`SceneIntent` extractor + 2D viewer): [phase-1-scene-intent.md](./phase-1-scene-intent.md)
- Architecture brief: [../../next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md](../../../next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md)
- 3-track architecture: CLAUDE.md §"Reconstruction 3-Track Architecture (May 8, 2026)"
- Existing client cache pattern: `src/lib/ai/client-cache.ts` (LokiJS + IndexedDB)
- Existing 4-lane hypergraph state (smoke 8/8 green): [../hypergraph-4-lanes-vault.md](../hypergraph-4-lanes-vault.md)

## When to implement

When **all four** are true:
- [ ] Phase 1 (SceneIntent extractor) is exercised on at least one real case (not just the demo fixture)
- [ ] The 2D timeline viewer has surfaced a usability gap that 3D would close
- [ ] At least one ComfyUI workflow round-trip has succeeded (Track 2)
- [ ] The user has confirmed the air-gapped export bundle is a real product requirement (it's specified in the .md but not yet validated against a real legal-review workflow)

Until then: this doc captures the architecture so it doesn't have to be
re-invented when the moment comes. **Don't pre-build any of these
nine files.**

## Open questions for product

1. **Op confirmation UX**: modal, toast-with-undo, or implicit-with-batch-undo? Affects the UI cost of `mark_disputed` and `place_evidence`.
2. **Agent action visibility**: do users want to see the agent's tool-call sequence (full transparency) or just the final proposals (curated)? Both are buildable; pick one.
3. **Mutation log retention**: per-case or per-user? `context_timeline` already supports both via `case_id` + `user_id` foreign keys; the question is which is the canonical view.
4. **OffscreenCanvas threshold**: 2k? 5k? 10k? Element count where the worker render-loop overhead pays off. Will need a one-time benchmark on RTX 3060 Ti.
5. **L3 autoencoder**: do we need a scene-specific encoder fine-tuned on canvas mutations, or does the existing `karpathy-gpu-enrich.mjs` 768→64 path generalize? Default: try the existing one first; only train a specialized encoder if downstream retrieval is poor.
