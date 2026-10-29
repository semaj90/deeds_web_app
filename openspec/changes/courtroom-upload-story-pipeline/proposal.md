## Why

The courtroom simulation (`/demos/courtroom-sim`) plays a deterministic story: timed **cues** drive Babylon characters. Today the stories are hand-written. The next product step is a user uploading documents and getting a **grounded story** from them: every dialogue cue cites an uploaded chunk, nothing is invented. This change scopes that pipeline, and records the state the courtroom is in so another session can pick it up. It is **not** a ranking or repair tournament: `parent-atlas-gpu-sidecar-patch-tournament` is a program-repair loop (18 done / 112 open) and stays separate.

## TL;DR

| Item | State |
|---|---|
| Story engine, move cue, floor plan grid, path finding, path validation, actor lock | DONE, unit-tested (29 files / 157 tests), browser-proven for the tick-200 walk |
| Upload → worker → embed → IndexedDB → grounded cues | NOT STARTED (design only) |
| `.mp3` music | NOT STARTED (no audio files in the repo) |
| Cue ranking tournament | NOT STARTED, challenger only, own change if wanted |
| bits-ui + UnoCSS page redesign | PARTIAL (action bar, timeline, cast dialog, coordinate readout done; sidebar, dialogue box, input bar not) |

## What a cue is

`{ id, tick, actorId, kind, value, requiredEvidence? }` in `src/lib/courtroom/story/engine.ts`. Fires once at its tick (30 Hz) if `requiredEvidence` is admitted. Kinds: `dialogue | emotion | animation | evidence | phase | move`. Proposed new kind: `music`.

## Pipeline (proposed)

| Stage | Owner | Rule |
|---|---|---|
| Upload + parse + chunk | Web Worker (CPU) | Progress messages drive the loading bar. No bulk work on the main thread. |
| Embed | Worker: ONNX `static/embeddinggemma_300m_onnx` (exists); fallback server `/api/embed` (Ollama `embeddinggemma:latest`) | 768-d, same text recipe both paths, or scores are not comparable. Ollama is being phased out: do not delete it. |
| Browser cache | IndexedDB | Chunks plus vectors as binary arrays, never JSON. Draft and cache only; Postgres/pgvector stays truth. |
| Inverse retrieval | Worker, cosine over cached vectors | For each cue, find the best supporting chunk; its id becomes `requiredEvidence`. |
| Story creation | Model proposes cues; `validateStory` checks them | Result is `unreviewed`. A story never self-promotes. |
| Demo mode | Existing "Play local story" preview | Creates no case or session. Test every step here before any upload is trusted. |

## Hard rules carried from the repo

- Postgres is truth; Qdrant, Redis, IndexedDB are mirrors or caches.
- No bulk numeric arrays in JSON or MessagePack. Use binary arrays or Arrow.
- No hidden thoughts, KV cache or tensors persisted.
- Status words only: CREATED, WIRED, DRY_RUN_PROVEN, APPLY_PROVEN, NOT_PROVEN. A passing unit test is not end-to-end proof.
- No database write, service restart or install without explicit approval. A bare "yes" is not write approval.

## Open decisions (owner: operator)

1. What "tournament" means here: repair tournament (existing change) or a cue/evidence ranking tournament (new change, challenger only).
2. Station occupancy: jester walks onto the stand where the witness character already stands. Refuse with a receipt, move the occupant first, or add a witness story actor.
3. Arrival wait rule for the tick 200 to 240 gap: the story waits for the move to finish, or times out after a set limit.
4. Restore `@iconify-json/lucide@1.2.93` (removed twice by package cleanups; every `i-lucide-*` icon is blank without it) or keep the YoRHa icons plus text glyphs.
5. Music: which licensed `.mp3` files, and whether `music` becomes a cue kind.
6. Whether the page's server-session flow and the local story runtime are unified.
