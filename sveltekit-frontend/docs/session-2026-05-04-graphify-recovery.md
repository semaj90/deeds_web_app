# Session Recovery — Graphify/Karpathy Pipeline + ACE/KAG Wiring

**Date:** 2026-05-04
**Reason for this doc:** VS Code chat session hit `RangeError: Invalid string length` during `JSON.stringify` of the chat transcript (large outputs accumulated). Saved here so the work survives the chat tab.

---

## TL;DR

The full Graphify/Karpathy stack is now end-to-end wired and smoke-tested. Six pillars all green. Use **`🤫 Quiet:`** VS Code task variants going forward to avoid VS Code chat serialization blowup.

```
✓ smoke:graphify         10/10 checks (6 pillars)
✓ smoke:ace:full         14/14 gates
✓ smoke:ace:gemma4       13/13 gates  (live LLM contract)
```

---

## Commits this session (all on `main`)

```
6cf1b37f1e  feat(smoke): extend smoke-graphify with Pillar 6 — hypergraph topology
00730fc648  fix(graphify): wire hypergraph topology end-to-end via Qdrant export
5359c7d20f  fix(graphify): drop broken hypergraph step from graphify:full
744cba29e1  feat(tasks): add 📊 Graphify Live Progress task
f0b7e06818  feat(graphify): add Karpathy-style codebase map aliases
e6c6fe2167  feat(ace): smoke-tested KAG/Gemma4/llama-server pipeline + how-to guide
```

---

## What's wired (live state, verified 2026-05-04)

| Pillar | Description | Live count |
|--------|-------------|-----------|
| 1 — Fast AST graph | `docs/graph/codebase-graph.json` + `codebase-map.md` | 2,581 files / 804-line map |
| 2 — Redis fast cache | `code:index:manifest` + `code:index:tag:*` | mode=fast-ast, 120 tag keys |
| 3 — KAG wiki notes | `wiki:note:dir:*` (24h TTL) | 1,101 directory notes |
| 4 — Qdrant semantic | `codebase_chunks_768` (dual vector) | 32,753 points |
| 5 — ACE fallback contract | `FAST_AST_SCORE_CAP` static check | = 0.07 |
| 6 — Hypergraph topology | k-means centroids + Redis + Qdrant payload tags | 100 centroids, 32,753 vectors clustered, 20/20 sampled tagged |

---

## Reference docs (already on disk)

- **Operator manual:** `sveltekit-frontend/docs/ace-kag-howto.md` (403 lines)
- **Live codebase map:** `sveltekit-frontend/docs/graph/codebase-map.md` (804 lines)
- **Directory tier scoreboard:** `sveltekit-frontend/docs/CODEBASE_DIRECTORY_MAP.md` (1,711 lines)
- **This recovery doc:** `sveltekit-frontend/docs/session-2026-05-04-graphify-recovery.md`

---

## Critical files added/modified this session

```
.gitignore                                                              [/Log/ root-anchor fix]
.vscode/tasks.json                                                      [11 new tasks: 🦙 🤫 📁 📖 🗺️ 🔎 🧠 🏭 ✅ 📊]
sveltekit-frontend/package.json                                         [graphify:* aliases + smoke:graphify + smoke:kag]
sveltekit-frontend/docs/ace-kag-howto.md                                [NEW — 403-line operator manual]
sveltekit-frontend/scripts/tests/smoke-fast-ast-ace.mjs                 [NEW — 6 gates]
sveltekit-frontend/scripts/tests/smoke-kag-note-roundtrip.mjs           [NEW — 6/7 gates synthetic/live]
sveltekit-frontend/scripts/tests/smoke-graphify.mjs                     [NEW — 10 checks (6 pillars)]
sveltekit-frontend/scripts/tests/audit-gitignore-vs-indexer.mjs         [NEW — gitignore vs indexer cross-check]
sveltekit-frontend/scripts/tests/bounded-output.mjs                     [NEW — chat-safe output helpers]
sveltekit-frontend/scripts/export-embeddings-qdrant.mjs                 [FIX — cursor pagination + named vectors]
sveltekit-frontend/src/lib/server/graph/community-graph.ts              [GPU cosine + SOM coords in KAG result]
sveltekit-frontend/src/lib/server/indexer/directory-summarizer.ts       [SOM BMU lookup + summaryEmbedding (v2)]
sveltekit-frontend/src/lib/server/ace/context-assembler.ts              [render SOM(row,col) + 🔵gpu/⬜kw indicator]
sveltekit-frontend/src/routes/api/codebase-index/summarize-dirs/+server.ts  [Qdrant SOM coords → DirAuditEntry]
```

---

## Three-layer architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 1 — Fast Graphify map (CPU only, no LLM, no GPU, ~10s)       │
│    src/  →  imports/exports/routes/handlers/components/Drizzle/TODOs│
│          →  docs/graph/codebase-graph.json + codebase-map.md        │
│          →  Redis code:index:* (manifest + tag keys)                │
│          →  Redis wiki:note:dir:* (24h TTL)                         │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 2 — Semantic search (EmbeddingGemma + Qdrant, embedding pass)│
│    code chunks  →  embeddinggemma:latest 768-dim                    │
│                 →  Qdrant codebase_chunks_768 (dual vector)         │
│                 →  ACE retrieval                                     │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│  Layer 3 — Hypergraph topology (k-means, ~3 min)                    │
│    Qdrant export  →  tmp/*.ndjson (597MB, 32,753 vectors, 768d)     │
│                   →  hypergraph-build.mjs k-means → 100 centroids   │
│                   →  Redis hypergraph:v1:* checkpoints              │
│                   →  hypergraph-tag-qdrant writes som_cluster       │
│                       payload to all 32,753 Qdrant points           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## VS Code tasks added (11 new)

### Graphify aliases (5)
- 🗺️ Graphify: Daily Map (fast AST + smoke)         ~10s no LLM
- 🔎 Graphify: Semantic Index (Qdrant)               embedding pass (~30 min)
- 🧠 Graphify: Full ACE Index                        weekly/pre-deploy
- 🏭 Graphify: Full GPU + TurboQuant                 hour+ deep run
- ✅ Graphify: 5-Pillar Smoke                        ~3s, 10 checks

### llama-server / TurboQuant prompts (6)
- 🦙 Start Gemma4 VLM (TurboQuant :8090)
- 🦙 Prompt Gemma4 — Directory Analysis
- 🦙 Prompt Gemma4 — KAG Wiki Note (single dir)
- 🦙 Audit + KAG Ingest + Gemma4 Summary (full pipeline)
- 🦙 Interactive Chat with Gemma4 (terminal REPL)
- 🦙 Prompt Gemma4 — 4D SOM Topology Report

### Quiet (output → log file, chat-safe) — USE THESE
- 🤫 Quiet: Dir Audit (lib/server) → log file
- 🤫 Quiet: Prompt Gemma4 → log file
- 🤫 Quiet: Full pipeline (audit + KAG + Gemma4) → log file
- 📊 Graphify: Live Progress (latest log)
- 📁 Open latest log file
- 📖 Open ACE/KAG/Gemma4 how-to guide

---

## npm script reference (canonical commands)

```bash
# Indexing
npm run index:codebase:fast           # ~5s, writes JSON + Redis (no GPU)
npm run index:codebase:fast:plan      # also writes codebase-graph.md
npm run codebase:index                # Qdrant semantic indexing (embedding pass)
npm run codebase:search               # query against Qdrant

# Graphify aliases
npm run graphify:map                  # = index:codebase:fast:plan
npm run graphify:semantic             # codebase:index + smoke:ace
npm run graphify:topology             # export → build → tag (full hypergraph)
npm run graphify:daily                # fast AST + smoke (~10s)
npm run graphify:full                 # daily + semantic + topology + smoke:ace:full
npm run graphify:gpu                  # full-GPU production-readiness
npm run graphify:gpu:turbo            # turbo:start:detached + full-gpu:turbo

# Hypergraph (used by graphify:topology)
npm run hypergraph:export             # Qdrant codebase_chunks_768 → tmp/*.ndjson
npm run hypergraph:build:redis        # k-means → centroids + Redis hypergraph:v1
npm run hypergraph:tag                # tag som_cluster on Qdrant points

# Smoke tests
npm run smoke:fast-ast                # 6 gates (graph JSON, Redis, JSONC)
npm run smoke:gitignore               # 1 gate (gitignore vs indexer)
npm run smoke:kag                     # 6 gates (KAG synthetic)
npm run smoke:kag:gemma4              # 7 gates (KAG live Gemma4)
npm run smoke:ace                     # 12 gates combined synthetic
npm run smoke:ace:gemma4              # 13 gates combined live
npm run smoke:ace:full                # 14 gates (gitignore + ace:gemma4)
npm run smoke:graphify                # 10 checks (6 pillars)

# Inference
npm run turbo:start:detached          # llama-server.exe :8090, idempotent
npm run turbo:start:text:detached     # text-only (3.4GB VRAM)
```

---

## Known issues / future work

### Not blocking
1. `karpathy-tag.mjs` returns 0 tags on dry-run — `gemma4-legal-fast:latest` may not match the prompt's expected JSON shape. Separate from the Graphify pipeline.
2. The two `generate-route-test-stubs.mjs` files (one in `scripts/`, one in `scripts/tests/`) solve similar problems differently — consolidate later.
3. Lint diagnostics flag `process`/`fetch`/`AbortSignal` in `smoke-graphify.mjs` — false positives, those are Node.js 18+ globals.

### Cleanup recommendations
- `tmp/codebase_chunks_768-embeddings.ndjson` is 597MB — already gitignored, fine to delete after each `graphify:topology` run.
- `logs/task-output/*.log` accumulate — already gitignored, prune occasionally.

---

## How to recover from this session

1. `git log --oneline -10` — see all session commits
2. Read `docs/ace-kag-howto.md` for the full operator manual
3. Run `npm run smoke:graphify` from `sveltekit-frontend/` — confirms current state in 3 seconds
4. For any new chat session, paste this doc's path: `docs/session-2026-05-04-graphify-recovery.md`
