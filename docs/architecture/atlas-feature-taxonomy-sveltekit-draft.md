# Atlas Feature Taxonomy: SvelteKit (DRAFT)
**Status**: proposal 2026-10-19 | **Authority**: none (`canonicalAuthority:false`); not written to any table | **Scope**: SvelteKit only; Go/Python repeat the shape later

## TL;DR
`atlas_packets.feature_label` today holds file names (40,814 distinct; top values `LLMS.md`, `+server.ts`, `+server.ts.any-backup`), not product features. This draft proposes a small controlled list mapped to routes that exist under `sveltekit-frontend/src/routes`. Each label would later bind to one ACE packet (references only: `packet_key`, `source_ref`, revisions; no inline vectors). `atlas_feature_labels` is named in CLAUDE.md but does **not exist** in the live DB (verified 2026-10-19); a new table needs schema approval.

## Proposed labels
| feature_label | Routes / APIs (verified to exist) |
|---|---|
| `chat` | `(app)/chat`, `api/chat`, `api/v1`; demos `agent-chat`, `contextual-chat`, `synthesis-chat` |
| `ai_chat` | demos `client-ai-chat`, `client-inference`, `ai-assistant`, `ask-ai` |
| `auth` | `login`, `register`, `api/auth` |
| `canvas` | demos `collab-canvas`, `evidence-canvas`; `api/collaboration` |
| `html5_visual_playground` | demos `webgpu-showcase`, `webgpu-memory-palace`, `particles`, `bento-dashboard` |
| `image_creator` | `api/comfyui`, `api/vision`, `api/vlm`, `api/reconstruction` |
| `wiki` | `(app)/codebase-wiki`, `api/wiki` |
| `user_db` | `api/user`, `api/persons`, `(app)/persons-of-interest` |
| `cases` | `(app)/cases`, `active-cases`, `api/cases`, `api/case-theory` |
| `evidence` | `(app)/evidence`, `evidence-library`, `evidence-board`, `api/evidence` |
| `search_rag` | `(app)/rag-search`, `global-search`, `api/rag`, `api/search`, `api/vector-search` |
| `knowledge_graph` | `(app)/codebase-graph`, `knowledge`, `gpu-evidence-graph`, `api/graph` |
| `recommendations` | `(app)/recommendations`, `api/recommendations` |
| `reports` | `(app)/reports`, `api/reports` |
| `reconstruction_sim` | demos `crime-reconstruction`, `scene-intent-2d`, `courtroom-sim`; `(app)/simulation` |
| `media_transcribe` | `api/video`, `api/audio`, `api/whisper` |
| `upload_ingest` | demos `ai-file-upload`, `modular-upload`; `api/ingest`, `api/ingestion` |
| `rich_text` | demos `rich-text-editor` |
| `code_intel` | `(app)/code-intel`, `codebase-index`, `api/codeintel` |
| `admin_ops` | `(app)/admin`, `system-configuration`, `cache-monitor`, `api/admin` |
| `terminal` | `(app)/terminal` |

## Requested examples with no route in this app
| Label | Finding |
|---|---|
| `forum` | no route found |
| `photo_editor` | no route found |
| `video_editor` | `api/video` exists; no editor UI seen |

## Open decisions
| Decision | Note |
|---|---|
| `chat` vs `ai_chat` | Retain both existing labels; `chat` is server messaging and `ai_chat` is assistant/client inference. Do not merge in this iteration. |
| Labels without dedicated routes | Keep the existing 21-label catalog unchanged. `forum` resolves to `chat`, `photo_editor` to `image_creator`, and `video_editor` to `media_transcribe` as aliases only; do not add canonical labels without route examples and review. This decision does not approve DB persistence or production taxonomy admission. |
| Storage | new controlled-label table requires schema approval (Drizzle Safety Rule); never mutate `atlas_packets.feature_label` in place |
| Packet binding | label → one ACE packet via `buildAcePacketV3`; join by `packet_key` + `source_ref`, never `feature_id` alone |
| Other languages | Go, Python repeat after SvelteKit is settled |

## Pipeline pieces still missing (dependency order)
| # | Item | Note |
|---|---|---|
| 1 | Approved taxonomy | this file |
| 2 | Per-feature ACE packet contract | references only; revision-qualified |
| 3 | cuDF JSON ingest | none exists (cuDF is graph-only today); JSON parsing is CPU work per repo rules, so cuDF is a challenger needing a measured case |
| 4 | Cached-token loading + NES FSM | no FSM class found under `src/lib/gpu`; "cached tokens" = approved packet text + token budget, not model KV state |
| 5 | Low-rank (Ewin Tang) wiring | exists as challenger (`python/atlas_compute/low_rank.py`, `sample-query-matrix-v1.ts`); wire, do not rebuild |
| 6 | Env/API alignment | RAPIDS env has fastapi/uvicorn; cutile and dspy envs do not. See `atlas-python-environment-routing.md` |

## Deferred (operator direction 2026-10-19; not started)
| Item | Blocker / note |
|---|---|
| BitFrost KV cache | prohibited today (AGENTS.md: no `kv_cache`/tensor persistence; CLAUDE.md: no KV cache in Redis/Valkey). Needs an explicit rule change first |
| Titans 2.0 | an earlier Titans-MIRAS plan was rejected as unverifiable; re-verify sources before any work |
| UMAP | no owner assigned; check `runtime-ownership-registry.json` before adding |
| YaRN inserts | no owner assigned; model-context feature, needs a verified llama-server/runtime path |
| DSPy prime agent / RLM | existing: `python/parent_atlas_dspy_repair.py`, `parent_atlas_dspy_community.py`; bounded RLM under `parent-atlas-ace-rlm-bitfrost-integration`; proposal-only |
| ACP / A2A / MCP tool-calling | existing: `ACPToolRegistry.ts`, A2A card `/.well-known/agent.json`, TRACE MCP `:8788`; tool selection stays `CHALLENGER_ONLY` |
| Per-query OpenCode dispatch | `api/opencode-dispatch` exists; do not expose `ops.*` write paths to models (`requireToken` is not authentication) |
