# Graphify — Codebase Intelligence Pipeline

Run the Graphify codebase-intelligence pipeline at the requested tier, then surface
directory-level insights from the generated artifacts.

## Usage

`/graphify [tier] [target]`

| Slot | Default | Values |
|------|---------|--------|
| `tier` | `daily` | `smoke` · `map` · `daily` · `resume` · `tsc` · `ts7` · `bow-tiles` · `cluster` · `cluster:fast` · `semantic` · `topology` · `full` · `gpu` · `batch` · `ace-smoke` · `persist` · `dir` |
| `target` | _(tier-dependent)_ | Directory path for `dir` tier, e.g. `src/lib/server/ace` |

`$ARGUMENTS` is the raw arg string. Parse it; blank → run `daily`.

---

## Tier Definitions

| Tier | npm script | What runs | Duration | GPU |
|------|-----------|-----------|----------|-----|
| `smoke` | `smoke:graphify` | 5-pillar health check (read-only) | <1s | No |
| `map` | `graphify:map` | Fast AST scan → `codebase-graph.json` + `codebase-map.md` + Redis `code:index:*` | ~3-5s | No |
| `daily` | `graphify:daily` | `map` + `smoke:fast-ast` + `smoke:kag` | ~5-10s | No |
| `resume` | `graphify:resume` | Like `daily` but skips unchanged files via gradient checkpoint | ~1-3s | No |
| `tsc` | `graphify:tsc` | `map` + inline `tsc --noEmit`, caches per-dir error counts in Redis | ~30-60s | No |
| `cluster` | `graphify:cluster-summaries` | Gemma4 summary + embeddinggemma embed per directory → Qdrant `glyph_atlas` | ~10-30 min | Ollama |
| `cluster:fast` | `graphify:cluster-summaries:fast` | Skip Gemma4, embed existing audit summaries only | ~30s | Ollama |
| `ts7` | `check:ts7` | TypeScript 7 (tsgo) full type-check — 10× faster than tsc, Go-native goroutines | ~5-15s | No |
| `bow-tiles` | `graphify:bow-tiles` | Multi-core BoW tile builder: per-file + per-cluster tiles → Redis (worker_threads) | ~5-30s | No |
| `batch` | `graphify:batch-gpu-analysis` | GPU batch: similarity → k-means → SOM → PageRank → attention → writeback | ~5-15 min | RTX |
| `semantic` | `graphify:semantic` | `codebase:index` (Qdrant 768-dim) + ACE smoke | ~30-60s | Ollama |
| `topology` | `graphify:topology` | Hypergraph export → Redis build → Qdrant tag → digest | ~5-10 min | Optional |
| `persist` | `graphify:persist:couchdb` | Write cluster summaries + BoW tiles to CouchDB for long-term storage | ~1-3 min | No |
| `ace-smoke` | `graphify:ace-smoke` | 4-probe ACE retrieval check: BoW texture, traverse, Redis wiki notes, Qdrant glyph_atlas | <1s | No |
| `full` | `graphify:full` | `daily` + `semantic` + `topology` + `cluster` + AGENTS.md write + `smoke:ace:full` | ~15-20 min | Ollama |
| `gpu` | `graphify:gpu` | Full production-readiness test with GPU inference | ~15-20 min | RTX |
| `dir` | _(inline)_ | Directory-level analysis using existing graph artifacts | <5s | No |

---

## Execution Steps

### Step 1 — Parse arguments

```
tier = first token of $ARGUMENTS (default: "daily")
target = second token (used by "dir" tier only)
```

### Step 2 — Run the npm pipeline

For all tiers except `dir`, run from `sveltekit-frontend/`:

```bash
cd sveltekit-frontend

# smoke
npm run smoke:graphify

# map
npm run graphify:map

# daily
npm run graphify:daily

# resume  (skips unchanged files, ~1-3s)
npm run graphify:resume

# tsc  (map + TypeScript error counts per dir cached in Redis, ~60s)
npm run graphify:tsc

# ts7  (TypeScript 7 / tsgo — 10× faster Go-native type-check, ~5-15s)
npm run check:ts7

# bow-tiles  (multi-core BoW tile builder → Redis, worker_threads, ~5-30s)
npm run graphify:bow-tiles

# bow-tiles dry run  (preview without Redis writes)
npm run graphify:bow-tiles:dry

# bow-tiles fast  (cluster tiles only, 4 workers)
npm run graphify:bow-tiles:fast

# cluster  (Gemma4 summary → embeddinggemma → Qdrant glyph_atlas, needs Ollama)
npm run graphify:cluster-summaries

# cluster:fast  (embed existing summaries only, ~30s)
npm run graphify:cluster-summaries:fast

# cluster test run (limit 3 dirs)
npm run graphify:cluster-summaries:test

# batch  (GPU: k-means, SOM, PageRank, attention, reward, writeback, needs RTX)
npm run graphify:batch-gpu-analysis

# batch test run (limit 10 dirs)
npm run graphify:batch-gpu-analysis:test

# semantic  (Qdrant 768-dim index + ACE smoke, needs Ollama)
npm run graphify:semantic

# topology  (hypergraph export + Redis + Qdrant tag + digest)
npm run graphify:topology

# persist  (CouchDB writeback for cluster summaries)
npm run graphify:persist:couchdb

# ace-smoke  (4-probe ACE retrieval: BoW texture, traverse, Redis notes, glyph_atlas)
npm run graphify:ace-smoke

# full  (daily + semantic + topology + cluster + agents:write + smoke:ace:full)
npm run graphify:full

# gpu
npm run graphify:gpu
```

Capture stdout/stderr. If the script exits non-zero, report the first error line
and stop — do NOT proceed to Step 3.

### Step 3 — Load and display graph artifacts

After a successful run (or for `dir` tier which skips Step 2), load these files:

1. **`sveltekit-frontend/docs/graph/codebase-graph.json`** — per-file flags index
2. **`sveltekit-frontend/docs/graph/codebase-map.md`** — human-readable map

From `codebase-graph.json`, compute and display a **directory-level summary table**:

```
For each unique directory (dirname of each file entry):
  - fileCount: number of files
  - authCoverage: % of files with hasAuth=true (skip non-route dirs)
  - zodCoverage: % of files with hasZod=true (skip non-route dirs)
  - ssrRisk: count of files with ssrUnsafe=true
  - sv4Legacy: count of files with sv4Legacy=true
  - pairedTests: % of files with hasPairedTest=true
  - clusterIds: unique GPU cluster IDs present
```

Sort by `ssrRisk + sv4Legacy` descending (hottest directories first).

Cap the table at 30 rows. If more, append a note: "N more directories — run /graphify dir <path> for details."

### Step 4 — Directory deep-dive (for `dir` tier or any tier with a target)

If `target` is set, load the graph JSON, filter to files under `target`, then:

1. List every file with its flags (auth, zod, ssrUnsafe, sv4Legacy, hasPairedTest, clusterId, somBmuRow/Col)
2. Find files with `ssrUnsafe=true` and suggest the fix (add `typeof window !== 'undefined'` guard or `export const ssr = false`)
3. Find files with `sv4Legacy=true` and list which Svelte 4 patterns are present
4. Find files missing paired tests (`hasPairedTest=false`) and list them
5. Show Redis KAG notes for the directory if available:
   ```bash
   node -e "
   const {createClient}=require('redis');
   (async()=>{
     const r=createClient({url:process.env.REDIS_URL||'redis://127.0.0.1:6379'});
     await r.connect();
     const note=await r.get('wiki:note:dir:<TARGET>');
     console.log(note||'(no KAG note)');
     await r.quit();
   })()
   " 2>/dev/null
   ```
6. Show SOM cluster neighbours from `codebase-graph.json` (files at same `somBmuRow/Col`)

### Step 5 — AGENTS.md freshness check

After every tier ≥ `daily`, check whether `src/AGENTS.md` (or the nearest AGENTS.md
for the target directory) was updated in the last run:

```bash
git diff --stat HEAD -- 'sveltekit-frontend/src/**/AGENTS.md' 2>/dev/null
```

If no AGENTS.md was touched AND tier = `full`, remind: "Run `npm run agents:write` to
refresh AGENTS.md files — they are the primary LLM directory wiki."

### Step 6 — Smoke gate summary

After any tier ≥ `map`, run:

```bash
cd sveltekit-frontend && npm run smoke:graphify 2>&1 | tail -20
```

Display the 5-pillar result. If any pillar is RED, surface the exact failure message and
recommend the fix tier:

| Failing pillar | Recommended fix |
|----------------|----------------|
| graph JSON missing/stale | `/graphify map` |
| Redis KAG notes empty | `/graphify daily` |
| Qdrant chunks empty | `/graphify semantic` |
| ACE score cap exceeded | `/graphify semantic` |
| AGENTS.md stale | `npm run agents:write` |

### Step 7 — ACE retrieval probe (after `cluster`, `batch`, or `full`)

After `cluster`, `batch`, or `full` tiers succeed, run the 4-probe ACE smoke:

```bash
cd sveltekit-frontend && npm run graphify:ace-smoke 2>&1
```

This hits (requires dev server running on :5173):
- `POST /api/graph/bow-texture` — BoW tile for cluster 0
- `GET /api/graph/traverse?nodeId=<node>&mode=ego` — ego graph with label+isCenter+pageRankScore
- Redis `wiki:note:dir:*` — at least one Gemma4 summary present
- Qdrant `glyph_atlas` — ≥1 point with `{ dir, gemma4Summary, clusterId }` payload

If dev server is not running, skip this step and note: "Start dev server to run ACE probe."

---

## Output Format

```
## Graphify — <TIER> (<duration>ms)

### Pipeline result
✅ All steps passed  |  ❌ Failed at: <step>

### Directory hotspots (top 15)
| Directory | Files | Auth% | SSR Risk | Sv4 Legacy | Tests% | GPU Cluster |
...

### AGENTS.md status
✅ Updated  |  ⚠️ Stale — run `npm run agents:write`

### 5-Pillar smoke
✅ graph JSON  ✅ KAG notes  ✅ Qdrant chunks  ✅ ACE cap  ✅ AGENTS.md

### ACE retrieval probe (cluster/batch/full only)
✅ BoW texture  ✅ traverse  ✅ Redis wiki notes  ✅ glyph_atlas
```

---

## Quick Examples

```
/graphify                     → daily map + smoke (5-10s, safe to run anytime)
/graphify smoke               → health-check only (<1s)
/graphify map                 → rebuild graph JSON + map.md (~5s)
/graphify resume              → fast re-index, skips unchanged files via checkpoint
/graphify tsc                 → rebuild map + cache TypeScript errors per dir (~60s)
/graphify ts7                 → TypeScript 7 (tsgo) full check — 10× faster than tsc (~5-15s)
/graphify bow-tiles           → multi-core BoW tile builder → Redis (~5-30s)
/graphify cluster             → Gemma4 summarise every directory → Qdrant glyph (~10-30 min)
/graphify cluster:fast        → embed existing audit summaries without Gemma4 (~30s)
/graphify batch               → GPU batch analysis: k-means, SOM, PageRank (~15 min)
/graphify ace-smoke           → 4-probe ACE retrieval check (needs dev server)
/graphify persist             → write cluster summaries to CouchDB
/graphify semantic            → rebuild Qdrant embeddings (~60s, needs Ollama)
/graphify full                → full rebuild including cluster glyphs (~15-20 min)
/graphify dir src/lib/server/ace   → deep-dive a single directory (read-only)
/graphify dir src/routes/api       → coverage gaps in all API routes
```

---

## Rules

- Always `cd sveltekit-frontend` before running npm scripts — the scripts resolve paths relative to that directory.
- Never delete files — all analysis is read-only unless the tier explicitly writes to `docs/graph/`.
- If `codebase-graph.json` is older than 24h, automatically run `/graphify map` before `dir` analysis.
- Respect bounded output: cap directory tables at 30 rows, file lists at 50 files.
- If Ollama is not running and tier = `semantic`/`cluster`/`full`/`gpu`, warn before attempting and suggest `map` or `daily` instead.
- For `batch` and `gpu` tiers, warn if CUDA is unavailable (check `isCudaAvailable()` via tensorrt_bridge.node).
- `ace-smoke` requires the SvelteKit dev server on :5173. If not running, print the skip note and continue.
- `ts7` runs `tsgo` (TypeScript 7 Go-native compiler, `@typescript/native-preview`). It is 10× faster than `tsc` because it uses Go goroutines for parallel graph traversal — no GPU, no matmul. Use it as a fast pre-flight before `tsc`; both must pass for CI.
- `bow-tiles` runs `build-bow-tiles.mjs` with `worker_threads`. It writes `texture:bow:chunk:<rel>` and `texture:bow:cluster:<clusterId>` keys to Redis (1h TTL). Run this after `map` if cluster tile tooltips are stale in GraphifyViewer.
