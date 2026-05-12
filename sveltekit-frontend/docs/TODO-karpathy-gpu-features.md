# TODO — Karpathy GPU Codebase Indexing Features

> Generated: 2026-05-11 | Stack: gpu:karpathy:scores (Redis) · codebase_chunks_768 (Qdrant) · tensorrt_bridge.node (CUDA) · karpathy_wiki (CouchDB)

---

## Legend

- ✅ Done — scripts exist and are wired
- 🔧 Partial — script exists, not yet wired end-to-end  
- ☐ TODO — needs implementation
- 🔗 Depends on — blocks or is blocked by another item

---

## 1. Autoencoder Pipeline — Unlock the Encoded Prefilter (P1)

The 64-dim encoded prefilter currently uses Xavier placeholder weights. Every item below moves it toward real trained weights so `ACE_ENCODED_PREFILTER_MODE` produces meaningful cluster scores.

| # | Task | Status | Command / File |
|---|------|--------|----------------|
| 1a | Train autoencoder weights (768→256→64, Adam, reconstruction loss) | 🔧 script exists | `npm run ae:train:js` |
| 1b | Verify weights land in Redis `ace:autoencoder:weights` (W1/b1/W2/b2) | ☐ | `docker exec legal-ai-redis redis-cli EXISTS ace:autoencoder:weights` |
| 1c | Backfill Qdrant `codebase_chunks_768` with `encoded_64` payload field | 🔧 script exists | `npm run ae:backfill` |
| 1d | Recompute centroids in Redis `gpu:autoencoder:centroids_64_meta` | 🔧 script exists | `npm run ae:centroids` |
| 1e | Add `graphify:autoencoder:train` npm alias for full train→centroids→backfill pipeline | ☐ | Add to `package.json`: `ae:train:js && ae:centroids && ae:backfill` |
| 1f | Verify HMM `AUTOENCODER_WEIGHTS_TRAINED` state in `hermes-executor.ts` reads `ace:autoencoder:weights` (not null check) | 🔧 state added | `src/lib/server/ai/hermes-executor.ts` — HMM gap checker |
| 1g | Add autoencoder health column to `npm run graphify:health` output (real vs xavier placeholder) | ☐ | `scripts/graphify-health.mjs` |
| 1h | Add `ace:autoencoder:weights` check to `smoke:graphify` 5-pillar | ☐ | `scripts/tests/smoke-graphify.mjs` |

**After 1a–1e complete**: `ACE_ENCODED_PREFILTER_MODE` switches from Xavier noise to real cluster scores → cluster prefilter actually filters rather than passing everything through.

---

## 2. New Hermes Tools Backed by Karpathy GPU Scores (P2)

Wire `tensorrt_bridge.node` functions into the Hermes executor as named tools. All read-only; no mutations.

### 2A — `attention_rank_files` (analyze mode)

Rank top-N files by GPU attention score relative to a query. Uses `attentionScoreGPU(probe, 768, embeddings, n)` from `tensorrt_bridge.node`, same as `karpathy-gpu-enrich.mjs` Step 3.

**Implementation sketch** (add to `hermes-executor.ts`):
```ts
// Tool: attention_rank_files
// Args: { query: string, topN?: number }
// 1. Embed query via /api/embed (Redis L1 + Bifrost L2 cached)
// 2. Fetch top-200 file embeddings from gpu:karpathy:scores (blend order)
// 3. attentionScoreGPU(probe, 768, embeddings, n) → Float32Array scores
// 4. Sort by score desc, return top-N: [{ filePath, blend, attentionScore }]
```

Add to `TOOL_POLICY.analyze`.

### 2B — `som_topology_stats` (search/analyze mode)

Read-only stats from the trained SOM grid. Returns grid dimensions, BMU distribution, neighbor counts.

**Implementation sketch**:
```ts
// Reads Redis keys:
//   gpu:autoencoder:centroids_64_meta  (SOM grid meta)
//   gpu:karpathy:scores                 (blend scores per file)
// Returns: { gridRows, gridCols, totalBmus, bmuDistribution, topClusters }
```

Add to `TOOL_POLICY.search` and `TOOL_POLICY.analyze`.

### 2C — `language_distribution` (search/analyze mode)

Returns language→file count map from Qdrant `codebase_chunks_768` cluster tags. Each cluster's `topTags` already contains language tags (`ts`, `svelte`, `py`, `go`).

**Implementation sketch**:
```ts
// 1. Fetch cluster summaries from Redis cluster:summary:* keys
// 2. For each cluster, extract language tags from topTags (match ts/svelte/py/go/rs/sql)
// 3. Aggregate: { typescript: N, svelte: M, python: K, ... }
// Returns: { distribution: Record<string, number>, totalFiles, clusterCount }
```

Add to `TOOL_POLICY.search`.

### 2D — `playbook_lookup_by_language` (analyze mode)

Filter PlaybookNotes from `karpathy_wiki` where `codeAreas` overlap with the queried language's top-files list.

**Implementation sketch**:
```ts
// Args: { language: string, symptom?: string }
// 1. From gpu:karpathy:scores, get top-50 files matching language extension
// 2. listWikiNotes('playbook') from CouchDB
// 3. Filter: note.codeAreas overlaps with those file paths
// 4. If symptom given: also fuzzy-filter by note.symptom
// Returns: { notes: PlaybookNote[], language, matchedFileCount }
```

Add to `TOOL_POLICY.analyze`.

**Hermes planner system prompt additions** (update `buildPlannerSystemPrompt`):
```
- attention_rank_files: GPU attention score ranking of codebase files relative to query; args: { query, topN? }
- som_topology_stats: SOM grid dimensions + BMU distribution from trained encoder
- language_distribution: per-language file count from Qdrant cluster tags
- playbook_lookup_by_language: filter PlaybookNotes by programming language + optional symptom
```

---

## 3. Topological Encyclopedia API Route (P2)

`GET /api/research/topological-encyclopedia?q=<query>`

Encodes a query to 64-dim via trained autoencoder, finds nearest cluster centroids, returns the DYM cluster landscape — what cluster you land in, adjacent clusters, top representative files, and chunk IDs for the retrieval pipeline.

**Location**: `src/routes/api/research/topological-encyclopedia/+server.ts`

**Pipeline**:
```
query string
  → /api/embed → 768-dim probe
  → autoencoderEncode(probe, W1, b1, W2, b2) → 64-dim encoded  [tensorrt_bridge]
  → cosine similarity vs centroids_64_meta → top-K cluster IDs
  → Qdrant filter: som_cluster IN topK → representative chunk_ids + file paths
  → CouchDB karpathy_wiki by_cluster view → cluster labels + summaries
  → karpathy scores for top files (blend sort)
  → Return: { clusterId, label, summary, chunkIds[], topFiles[], didYouMean[], encoded64 }
```

**Gate**: requires `ace:autoencoder:weights` in Redis (falls back to raw 768-dim cosine if absent with `{ fallback: true }` in response).

---

## 4. CouchDB Graph JSONL Export Pipeline (P3)

`couchdb-export-graph-jsonl.mjs` already exports cluster encyclopedia + chunk→cluster edges + transcript segments. Extend it and add npm aliases.

### 4A — Add npm aliases (missing from `package.json`)

```json
"graph:export:jsonl":         "node scripts/couchdb-export-graph-jsonl.mjs",
"graph:export:jsonl:dry":     "node scripts/couchdb-export-graph-jsonl.mjs --dry-run",
"graph:export:jsonl:no-neo4j":"node scripts/couchdb-export-graph-jsonl.mjs --no-neo4j",
"graph:export:jsonl:out":     "node scripts/couchdb-export-graph-jsonl.mjs --out logs/graph-export.jsonl --no-neo4j"
```

### 4B — Add Karpathy score nodes to the export

Extend `main()` in `couchdb-export-graph-jsonl.mjs` after Step 4:

```js
// 5. Karpathy GPU authority nodes (from Redis gpu:karpathy:scores)
const karpathyScores = await redis.hgetall('gpu:karpathy:scores');
for (const [filePath, raw] of Object.entries(karpathyScores ?? {})) {
  const score = JSON.parse(raw);
  const id = `file:${filePath}`;
  lines.push(nodeLine(id, ['CodebaseFile', 'KarpathyScored'], {
    filePath,
    blend:     score.blend,
    pageRank:  score.pr,
    attention: score.attn,
    authority: score.authority,
  }));
  // BELONGS_TO_CLUSTER edge if som_cluster available in Qdrant payload
}
```

### 4C — Obsidian vault → JSONL export (future)

Extend to also export `vault_md_index` rows (from Postgres `hyperedge_sources` where `edge_type = 'vault_link'`) as `ObsidianNote` nodes with `LINKED_TO` edges. Enables the full vault → graph → Obsidian round-trip pipeline.

---

## 5. Batch Manifold4 Backfill (P3)

`research_summaries` rows with `manifold4 IS NULL` need their 4D projection computed. Enables semantic manifold navigation in ACE Stage 2.

**Script**: `scripts/backfill-manifold4.mjs`

```js
// 1. SELECT id, content_embedding FROM research_summaries WHERE manifold4 IS NULL LIMIT $batchSize
// 2. For each row: [som_x, som_y] from nearest SOM BMU, semantic_z from PCA-1 projection, grpo_w from rl_policy weight
// 3. UPDATE research_summaries SET manifold4 = ARRAY[som_x, som_y, semantic_z, grpo_w] WHERE id = $id
// 4. Repeat until 0 rows remain
```

**npm aliases** (add to `package.json`):
```json
"manifold4:backfill":      "node scripts/backfill-manifold4.mjs",
"manifold4:backfill:dry":  "node scripts/backfill-manifold4.mjs --dry-run",
"manifold4:backfill:limit":"node scripts/backfill-manifold4.mjs --limit 100"
```

**Gate**: requires `graphify:som` to have run (SOM BMU assignments in Qdrant payload).

---

## 6. RabbitMQ Queue Registration — `media.download` + `media.transcribe` (P1)

`legal.transcribe_video` MCP tool already asserts `media.download` inline on each call. Pre-declare both queues in the queue manager so they exist from startup.

**File**: `src/lib/server/queue/rabbitmq-manager-fixed.ts`

Add to the queue definitions object:
```ts
'media.download':    { durable: true, arguments: { 'x-message-ttl': 3_600_000 } },  // 1hr
'media.transcribe':  { durable: true, arguments: { 'x-message-ttl': 3_600_000 } },  // 1hr
```

Also add exchange bindings if `media.*` routing key is used on the `legal.media` exchange (create exchange if absent):
```ts
'legal.media': { type: 'topic', durable: true }
```

---

## 7. Karpathy Wiki — Batch DirectoryNote Generation for Missing Dirs (P2)

Directories that lack a `DirectoryNote` in CouchDB `karpathy_wiki` don't benefit from the wiki lookup path. Generate them in bulk.

**Mechanism**: already exists — `npm run graphify:kag-notes` — but may skip low-activity dirs.

**Gap to close**:
```bash
# Find directories in Neo4j with no CouchDB DirectoryNote
# (requires couchdb-check-missing-dir-notes.mjs — create if absent)
npm run graphify:kag-notes:missing  # scroll CouchDB → find gaps → batch generate via Gemma4
```

**Add to `package.json`**:
```json
"graphify:kag-notes:missing": "node scripts/graphify-kag-notes-missing.mjs",
"graphify:kag-notes:missing:dry": "node scripts/graphify-kag-notes-missing.mjs --dry-run"
```

**Schedule**: already targeted by heavy lane of `ace-incremental-startup.mjs` via `ace:startup:heavy_last_run` 24h cooldown. No extra wiring needed once script exists.

---

## 8. Autoencoder Health Gate in `smoke:graphify` (P2)

The 5-pillar smoke check (`npm run smoke:graphify`) currently validates graph JSON + map.md + Redis fast cache + KAG notes + Qdrant chunks + `FAST_AST_SCORE_CAP`. Add autoencoder pillar.

**New pillar** (add to `scripts/tests/smoke-graphify.mjs`):

```js
// Pillar 6: Autoencoder weights
const weightsKey = await redis.hget('ace:autoencoder:weights', 'trained_at');
const centroidsKey = await redis.exists('gpu:autoencoder:centroids_64_meta');
const encoded64SampleCount = /* HLEN gpu:karpathy:encoded */ await redis.hlen('gpu:karpathy:encoded');

gates.push({
  name: 'autoencoder',
  ok:   !!weightsKey && centroidsKey && encoded64SampleCount > 0,
  detail: weightsKey
    ? `weights trained_at=${weightsKey} centroids=${centroidsKey} encoded_files=${encoded64SampleCount}`
    : 'xavier placeholder — run: npm run graphify:autoencoder:train',
  fatal: false,  // non-fatal: Xavier fallback still works for attention scoring
});
```

---

## 9. Attention-Rank Tool — Full End-to-End Wire Checklist (P2)

Once `attention_rank_files` tool is added to `hermes-executor.ts`, verify this chain:

```
POST /api/ai/hermes-run { aceMode: "analyze", userQuery: "what handles authentication?" }
  → runHermesPlanner() → plan includes { name: "attention_rank_files", arguments: { query, topN: 10 } }
  → executeHermesPlan() → runAttentionRankFiles()
    → /api/embed (Redis L1 hit expected on second call)
    → gpu:karpathy:scores HGETALL (768-dim embeddings already fetched during karpathy:gpu)
    → attentionScoreGPU(probe, 768, embeddings, n) via tensorrt_bridge.node
    → returns [{ filePath: "src/lib/server/auth/lucia.ts", blend: 3.2, attentionScore: 0.94 }]
  → assembleContext() formats: [attention_rank_files] top files: src/lib/server/auth/lucia.ts (attn=0.94)...
  → synthesize('gemma4', query, context) → final answer cites auth files
```

---

## 10. Priority Order

| Priority | Task | Effort | Value | Blocker |
|----------|------|--------|-------|---------|
| **P1** | 6 — RabbitMQ media.download queue registration | 15 min | Unblocks video ingest | — |
| **P1** | 1e — `graphify:autoencoder:train` alias | 5 min | Discoverability | — |
| **P1** | 1f — verify HMM AUTOENCODER_WEIGHTS_TRAINED reads Redis | 15 min | Honesty fix | — |
| **P2** | 2A — `attention_rank_files` Hermes tool | 1h | ACE context quality | tensorrt_bridge loaded |
| **P2** | 2B — `som_topology_stats` Hermes tool | 30 min | Topology transparency | graphify:som run |
| **P2** | 2C — `language_distribution` Hermes tool | 30 min | KAG rapid proto | cluster:summary:* in Redis |
| **P2** | 4A — graph:export:jsonl npm aliases | 5 min | Pipeline discoverability | — |
| **P2** | 4B — Karpathy nodes in JSONL export | 1h | Cross-pipeline traceability | karpathy:gpu run |
| **P2** | 8 — autoencoder smoke:graphify pillar | 30 min | Health visibility | — |
| **P3** | 3 — topological encyclopedia API route | 2h | DYM search quality | 1a–1e complete |
| **P3** | 5 — manifold4 backfill script | 1h | ACE Stage 2 search | graphify:som run |
| **P3** | 7 — batch DirectoryNote generation script | 1h | Wiki coverage | Gemma4 up |
| **P3** | 2D — `playbook_lookup_by_language` | 45 min | Language-aware fixes | 2C done |
| **P4** | 4C — Obsidian vault JSONL export | 1.5h | Vault↔graph round-trip | vault indexed |
| **P4** | 9 — attention-rank end-to-end smoke test | 30 min | CI gate | 2A done |

---

## Quick Wins (< 10 min each)

These can be done in a single edit session:

```bash
# 1. Add graphify:autoencoder:train alias to package.json
"graphify:autoencoder:train": "npm run ae:train:js && npm run ae:centroids && npm run ae:backfill"

# 2. Add graph:export:jsonl aliases
"graph:export:jsonl":          "node scripts/couchdb-export-graph-jsonl.mjs",
"graph:export:jsonl:dry":      "node scripts/couchdb-export-graph-jsonl.mjs --dry-run",
"graph:export:jsonl:no-neo4j": "node scripts/couchdb-export-graph-jsonl.mjs --no-neo4j",

# 3. Add manifold4:backfill aliases (script pending)
"manifold4:backfill":      "node scripts/backfill-manifold4.mjs",
"manifold4:backfill:dry":  "node scripts/backfill-manifold4.mjs --dry-run",

# 4. Add graphify:kag-notes:missing alias (script pending)
"graphify:kag-notes:missing": "node scripts/graphify-kag-notes-missing.mjs"
```

---

*Living document — update `[x]` checkboxes as tasks complete.*
