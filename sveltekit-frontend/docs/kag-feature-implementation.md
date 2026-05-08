# KAG Feature Implementation — Atlas Context, Hyperedges, and Adaptive Pipelines

**Last updated:** 2026-05-08
**Status:** Production-wired, smoke-gated, adaptive
**Companion docs:** [`ace-kag-howto.md`](./ace-kag-howto.md) (operator how-to), [`trace-kag-pipeline.md`](./trace-kag-pipeline.md) (TRACE architecture overview)

This doc covers the **implementation** side of the KAG (Knowledge-Augmented Generation) lane: what got built, where it lives, how it composes, and how to verify it stays healthy. Read `ace-kag-howto.md` first for the daily operator commands; this doc is the reference for understanding the moving parts when something needs changing.

---

## 1. What the feature does

Given any file path (or directory, cluster, topo class), the KAG lane returns a **demand-and-risk-weighted context packet** containing:

- The nearest AGENTS.md envelope rules + walk-up inheritance chain
- Topology classification (cluster, topo_class, glyph)
- Authority signals (Neo4j PageRank, Karpathy GPU blend, attention)
- Real-time demand (chunk_hit_log → Redis hot-rank)
- Sibling prompt cards from the same cluster
- Recommended actions derived deterministically from the above
- Provenance trace of every signal source consulted

The agent (Gemma4 / Claude / SvelteKit UI) calls this **before** spending tokens on a fix, so it has structural context grounded in the codebase's actual graph, demand patterns, and governance rules.

---

## 2. Architecture

```
┌─ Sources ────────────────────────────────────────────────────────────────┐
│ Postgres :5434                Redis                  Qdrant   Neo4j     │
│ ─────────                     ─────                  ──────   ──────    │
│ agent_context_files     ace:authority:top (200)      codebase  CodebaseFile
│ agent_context_relations gpu:karpathy:scores (200)    _chunks   .graphPageRank
│ directory_context_      ace:rank:demand (24h hot)    _768      .graphAuthority
│   bindings              ace:rank:dirty_files                   .communityId
│ qdrant_cluster_members  agents:dir:* (374)
│ chunk_hit_log           ace:atlas:dir:* (slugs)
│ hypergraph_edges        ace:todo:latest (markdown cache)
│ hypergraph_edge_members ace:todo:meta (input_hash)
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ Builders (idempotent, adaptive) ────────────────────────────────────────┐
│ scripts/seed-hypergraph-edges.mjs        — gpu:N → cluster_context edges
│ scripts/seed-hit-demand.mjs              — chunk_hit_log → demand hash
│ scripts/karpathy-gpu-enrich.mjs          — autoencoder + attention blend
│ scripts/skills/codebase-todo-aggregator  — fused recommendations
│ scripts/screenshots/caption-screenshots- — VLM captions via TurboQuant
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ Composer ───────────────────────────────────────────────────────────────┐
│ src/lib/server/atlas/context-for-file.ts  — single typed entry point
│   contextForFile(path, opts) → CodebaseContextForFile packet
│   Composition order: atlas (cached) → dir-card → demand → karpathy →
│                       authority → peer prompt cards → recommended actions
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ Surfaces ───────────────────────────────────────────────────────────────┐
│ MCP TRACE :8788                          HTTP                            │
│ ─────────────                            ────                            │
│ codebase.context_for_file                /api/ace/recommendations        │
│ agents_md.context_for_file               (4 query modes:                 │
│ agents_md.peers_for_dir                   filePath, dirPath,             │
│ agents_md.peers_via_relations             cluster, topoClass)            │
│ agents_md.coverage                                                       │
│ agents_md.coverage_chain                                                 │
│ agents_md.shares_tags                                                    │
│ agents_md.binding_chain                                                  │
│ hypergraph.search                                                        │
│ tools.batch_call                                                         │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ Consumers ──────────────────────────────────────────────────────────────┐
│ Gemma4 agent (TurboQuant :8090)                                          │
│ Claude Code skills (.claude/skills/codebase-todo-recommendations.md)     │
│ SvelteKit UI / admin pages                                               │
│ /admin/* dashboards                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Storage layers — what lives where and why

| Store | Key/table | Owner | TTL | Purpose |
|-------|-----------|-------|-----|---------|
| Postgres :5434 | `agent_context_files` | `agents:index` | persistent | Parsed AGENTS.md envelopes (rules, tools, constraints, semantic_tags, qdrant_tags) |
| Postgres | `agent_context_relations` | `agents:relations` | persistent | SHARES_TAGS, COVERS_CLUSTER, MIRRORS_KAG_NOTE edges between AGENTS.md files |
| Postgres | `directory_context_bindings` | `agents:relations` | persistent | Walk-up inheritance: `(agent_context_key, directory_path, depth, priority)` |
| Postgres | `qdrant_cluster_members` | `qdrant:backfill-cluster-keys` + `mirror-qdrant-clusters-to-postgres` | persistent | Cluster → file mapping (gpu:N namespaced) |
| Postgres | `chunk_hit_log` | ACE retrieval pipeline (writer hooks) | persistent (append-only) | Per-retrieval log: chunk_id, relative_path, gpu_cluster, query_hash, score, rerank_score |
| Postgres | `hypergraph_edges` + `hypergraph_edge_members` | `hypergraph:seed` | persistent | Cluster cohesion edges (Lane A live; Lane B/C deferred) |
| Postgres | `screenshot_artifacts` | screenshot ingest pipeline | persistent | Sharp + VLM caption + 768-dim caption_embedding |
| Postgres | `agent_context_files_history` | `drizzle/manual/agents_md_history_and_tools_merge.sql` | persistent | Pre-merge snapshots for non-destructive ops |
| Redis | `ace:authority:top` (HASH) | `graphify:authority` | varies | Top-200 graphAuthorityScore by stable_key |
| Redis | `gpu:karpathy:scores` (HASH) | `karpathy:gpu` | 24h | `{pr, attn, authority, blend}` per file |
| Redis | `gpu:karpathy:encoded` (HASH) | `karpathy:gpu` | 24h | 64-dim compressed embeddings (memory-path mapping) |
| Redis | `gpu:karpathy:summary` (HASH) | `karpathy:gpu` | 24h | Run metadata + `input_hash` for adaptive guard |
| Redis | `ace:rank:demand` (HASH) | `ace:hit-demand` | 1h | `{hits, hot_score, avg_rerank, last_hit_at}` per file |
| Redis | `ace:rank:demand:meta:water` (string) | `ace:hit-demand` | 24h | `chunk_hit_log.id` watermark for adaptive guard |
| Redis | `ace:rank:dirty_files` (SET) | `startup:ace` | session | Files changed since last incremental startup |
| Redis | `ace:atlas:dir:*` (string per slug) | `atlas:build` | 24h | Directory cards: peers, tools, tags, top files |
| Redis | `agents:dir:*` (string per dir) | `agents:write` | 24h | Rendered AGENTS.md markdown per directory |
| Redis | `ace:todo:latest` (string) | `skill:codebase-todo` | 24h | Cached rendered markdown |
| Redis | `ace:todo:meta` (HASH) | `skill:codebase-todo` | 24h | `{input_hash, generated_at}` for adaptive guard |
| Qdrant | `codebase_chunks_768` | `codebase:index` + `qdrant:backfill-cluster-keys` | persistent | 768-dim vectors + payload (cluster_key, file_path, agents_scope) |
| Neo4j | `CodebaseFile` nodes + relationships | `graphify:gds` | persistent | Graph with PageRank, communityId, graphAuthorityScore |

---

## 4. Pipeline scripts — adaptive vs full-rebuild

Every builder is **idempotent and short-circuits when sources haven't changed**. Pass `--force` to bypass.

### 4.1 `scripts/seed-hypergraph-edges.mjs`

**Reads:** `qdrant_cluster_members` (gpu:N clusters)
**Writes:** `hypergraph_edges` (UPSERT via `edge_hash` UNIQUE) + `hypergraph_edge_members` (per-edge replace)
**Adaptive guard:** When `was_inserted=false` AND `existing_member_count === memberKeys.length`, skip DELETE/INSERT — `edge_hash = sha256(edge_type + sorted member_keys)` is collision-free, so identical hash = identical members.
**Counters surfaced:** `inserted`, `updated`, `membersRewritten`, `membersUnchanged`.

### 4.2 `scripts/seed-hit-demand.mjs`

**Reads:** `chunk_hit_log` (last 24h aggregate)
**Writes:** `ace:rank:demand` Redis HASH (atomic DEL+HSET) + watermark
**Adaptive guard:** Watermark on `max(chunk_hit_log.id)`. If new max ≤ last watermark, no new chunks landed → exit early; existing 1h-TTL hash remains authoritative.

### 4.3 `scripts/karpathy-gpu-enrich.mjs`

**Reads:** Neo4j top-N by `graphPageRank` (or chunk_hit_log via `--source=hit-log`) + Qdrant 768-dim embeddings
**Writes:** `gpu:karpathy:scores`, `gpu:karpathy:encoded`, `gpu:karpathy:summary` Redis HASHes + `next_steps/active/karpathy-gpu-recommendations.md`
**Adaptive guard:** SHA1 of `(candidateSource, LIMIT, sorted stableKey:pr pairs)` vs `gpu:karpathy:summary.input_hash`. Match → skip the entire CUDA pass.

### 4.4 `scripts/skills/codebase-todo-aggregator.mjs`

**Reads:** all 5 lanes (Redis authority + karpathy + dirty + Postgres AGENTS rules + timeline doc + karpathy doc + MCP `clusters.get_summary_lenses`)
**Writes:** `next_steps/active/codebase-todo-recommendations.md` + `ace:todo:latest` (markdown) + `ace:todo:meta` (input_hash)
**Adaptive guard:** SHA1 of `(authority count, karpathy count, dirty count, agentsRules count, top-LIMIT signature)` vs `ace:todo:meta.input_hash`. Match → return cached markdown; skip Gemma4 rerank entirely (~9× faster on warm runs: 0.8s vs 7.5s).

### 4.5 `scripts/screenshots/caption-screenshots-gemma4.mjs`

**Reads:** `screenshot_artifacts` rows where `caption IS NULL`
**Writes:** `caption` (text) + `caption_embedding` (vector(768))
**Inference cascade:** TurboQuant `:8090` `/v1/chat/completions` (mmproj VLM, KV cache) → Ollama `:11434` fallback
**Post-processor:** `stripChainOfThought()` strips leaked reasoning prefixes
**Idempotent:** Skips rows with non-NULL caption unless `--force`.

---

## 5. Composer — `src/lib/server/atlas/context-for-file.ts`

The single typed function that fuses every signal:

```ts
export async function contextForFile(
  rawPath: string,
  opts: ContextForFileOptions = {},
): Promise<CodebaseContextForFile>
```

**Composition order** (cheapest → most expensive):
1. Path normalization (strips `src/`, `sveltekit-frontend/` prefixes)
2. Atlas lookup — in-memory `atlas.files[]` row (cached, ~10ms)
3. Redis `loadDirtySet()` + `loadDirectoryCard()` + `loadHitDemand()` in parallel
4. Karpathy + authority neighbours via path aliases
5. `buildPromptCards()` filtered by `agentsDir` (or cluster fallback)
6. `buildRecommendedActions()` — pure function over the assembled signals

**Rank formula:**
```
fileRank = 0.36 × authority
         + 0.18 × min(1, PR/8)
         + 0.13 × attention
         + 0.13 × min(1, blend/3.5)
         + 0.12 × log1p(hot_score)/log1p(20)   ← demand (NEW)
         + 0.08 × dirty
```

**Output type** (excerpt):
```ts
interface CodebaseContextForFile {
  filePath: string;
  normalizedPath: string;
  directory: { path; rank; agentsDir?; topo[]; clusters[]; tags[]; tools[]; constraints[]; }
  file: {
    graphAuthorityScore?; graphPageRank?;
    karpathyBlend?; karpathyAttention?;
    hitCount?; hitDemand?: { hits; hotScore; avgRerank; lastHitAt? };
    dirty?; rank; reasons[];
  }
  promptCards: PromptCard[];
  recommendedActions: string[];
  provenance: { atlas: 'redis'|'fs'|'cache'|'empty'; sources[]; generatedAt? }
}
```

---

## 6. MCP tool surface (10 tools, sub-20ms each)

Registered in `src/mcp/trace-mcp-server.ts` (Streamable HTTP, port 8788).

| Tool | Lens | Backend | Notes |
|------|------|---------|-------|
| `codebase.context_for_file` | Full atlas packet | atlas + Redis + Postgres | Master tool |
| `agents_md.context_for_file` | Slim slice (no prompt cards) | atlas + Redis | Lighter payload |
| `agents_md.peers_for_dir` | Directory card | Redis `ace:atlas:dir:*` | O(1) read |
| `agents_md.peers_via_relations` | SHARES_TAGS edges + sibling fallback | Postgres `agent_context_relations` | DB-graph lens |
| `agents_md.coverage` | Envelope completeness probe | Postgres `agent_context_files` | Quality signal |
| `agents_md.coverage_chain` | Walk-up inheritance | Postgres `directory_context_bindings` | Priority-ordered |
| `agents_md.shares_tags` | Jaccard tag overlap (≥0.3) | Postgres | Recently added |
| `agents_md.binding_chain` | Formal binding hierarchy | Postgres | Recently added |
| `hypergraph.search` | Cluster context search (ILIKE on title/summary/label/member_ids) | Postgres `hypergraph_edges` | Free-text + path-shape forks |
| `tools.batch_call` | Parallel multi-tool dispatch | in-process registry | Denylists `ops.*` + recursion |

All tools respect the `tools.batch_call` parallel API for agent multi-step workflows.

---

## 7. HTTP surface — `/api/ace/recommendations`

Single endpoint, four query modes:

```
GET /api/ace/recommendations?filePath=src/lib/server/db/client.ts
GET /api/ace/recommendations?dirPath=src/lib/server/db&maxCards=5
GET /api/ace/recommendations?cluster=gpu:75
GET /api/ace/recommendations?topoClass=database-schema
```

**Response shape** matches `CodebaseContextForFile`. Auth-gated (`locals.user` required, 401 on miss). Degraded path: returns `EMPTY` shape with same top-level keys + `error` field on failure (clients can destructure without `?.` guards).

---

## 8. Smoke gates

### `npm run smoke:atlas` (16 probes)
**File:** `scripts/smoke-atlas-context.mjs`
**Checks:**
- P1.7 — `context_for_file` shape: filePath echo, normalizedPath strip, directory completeness, `file.rank ∈ [0,1]`, promptCards present, provenance fields
- P1.8 — `hypergraph.search` regression: 'agentic'/'redis'/'svelte' each return ≥1 hit; `edge_type=cluster_context` filter works
- HTTP `/api/ace/recommendations` parity check

**Exit codes:** 0 on all-pass, 1 on any FAIL. `--strict` flag also fails on WARN. `--json` outputs machine-readable.

### `node scripts/smoke-trace-mcp-tools.mjs` (44 tools)
Sweeps every MCP tool with safe inputs, verifies JSON-RPC envelope + non-empty `content[0].text`. Currently passes 44/44.

---

## 9. Adaptive guards summary

| Command | Guard | Speedup (warm) |
|---------|-------|----------------|
| `ace:hit-demand` | `chunk_hit_log.id` watermark | ~50ms → ~5ms (early exit) |
| `hypergraph:seed --apply` | Per-edge member-count probe (skip DELETE/INSERT when `existing_n === memberKeys.length`) | ~10s → ~2s |
| `karpathy:gpu` | Input hash on `(source, LIMIT, sorted PR pairs)` | ~3s + GPU work → ~50ms |
| `skill:codebase-todo` | Input hash on `(signal counts + top-N signature)` → return cached markdown | ~7.5s → ~0.8s (9× faster) |

Override with `--force` on any of them.

---

## 10. Verification checklist

```bash
cd sveltekit-frontend

# Static
npm run typecheck:native               # tsgo, 0 errors
npm run check                          # svelte-check, 0/0

# Live
npm run smoke:atlas                    # 16 probes, sub-100ms each
node scripts/smoke-trace-mcp-tools.mjs # 44/44 MCP tools

# Adaptive (run twice — 2nd run should short-circuit)
npm run ace:hit-demand
npm run hypergraph:seed -- --apply
npm run karpathy:gpu
npm run skill:codebase-todo

# Force regen on demand
npm run ace:hit-demand -- --force
npm run hypergraph:seed -- --apply --force
npm run karpathy:gpu -- --force
npm run skill:codebase-todo -- --force
```

Expected: cold first run does the work; warm second run short-circuits with a friendly "no new X / inputs unchanged" message.

---

## 11. Auto-fire on VS Code folder open

`.vscode/tasks.json` chains the safe lane:

```
🤖 TRACE MCP Server (:8788)
  ↓
🩺 Service Health Check
  ↓
🗺️ graphify:daily                (1h cooldown stamp)
  ↓
🚀 ACE Incremental Refresh        (lock-protected)
  ↓
🩺 Atlas Smoke Gate (16 probes)   (30m cooldown)
  ↓
🔥 Seed Hit-Demand                (5m cooldown + adaptive watermark)
```

All detached (`isBackground: true`), all idempotent, all denylist-protected per `config/startup-ace-policy.json`. The `neverRunOnStartup` denylist refuses destructive commands (qdrant:recreate, db:reset, redis:flush, etc.) even if a future agent tries to wire them in.

---

## 12. Files changed in feature implementation (session-cumulative)

| File | Role |
|------|------|
| `src/lib/server/atlas/context-for-file.ts` | Composer (typed entry point) |
| `src/lib/server/atlas/atlas-loader.ts` | Atlas snapshot loader |
| `src/lib/server/atlas/prompt-mapper.ts` | Peer prompt card builder |
| `src/lib/server/atlas/types.ts` | AtlasFile + schema |
| `src/lib/server/agents-md/parse-agents-md.ts` | AGENTS.md envelope parser |
| `src/lib/server/agents-md/schema.ts` | Zod schema |
| `src/lib/server/hypergraph/hypergraph-search.ts` | searchHyperedges + ILIKE/path-fork |
| `src/lib/server/env.server.ts` | Canonical :5434 DATABASE_URL (fallback removed) |
| `src/mcp/trace-mcp-server.ts` | 10 MCP tools + tools.batch_call |
| `src/routes/api/ace/recommendations/+server.ts` | HTTP wrapper |
| `src/routes/api/hypergraph/search/+server.ts` | Free-text branch |
| `scripts/seed-hypergraph-edges.mjs` | Lane A seeder + adaptive guard |
| `scripts/seed-hit-demand.mjs` | Demand seeder + watermark guard |
| `scripts/karpathy-gpu-enrich.mjs` | GPU blend + input-hash guard |
| `scripts/skills/codebase-todo-aggregator.mjs` | Fused recommendations + cache guard |
| `scripts/screenshots/caption-screenshots-gemma4.mjs` | TurboQuant VLM cascade |
| `scripts/smoke-atlas-context.mjs` | 16-probe regression |
| `scripts/smoke-trace-mcp-tools.mjs` | 44-tool MCP sweep |
| `scripts/startup/ace-incremental-startup.mjs` | Two-lane orchestrator |
| `config/startup-ace-policy.json` | Denylist + heavy-lane gate + allowlist |
| `drizzle/manual/agents_md_relations.sql` | 3 tables for AGENTS.md spine |
| `drizzle/manual/agents_md_history_and_tools_merge.sql` | Non-destructive merge |
| `drizzle/schema-postgres.ts` | +15 columns to mirror live `hypergraph_edges` |
| `.vscode/tasks.json` | 6 folderOpen startup tasks |

---

## 13. Known gaps (tracked in `next_steps/active/`)

- **P0** — `chunk_hit_log` writer hooks in production retrieval paths (the demand signal infra is wired but writes only fire from synthetic tests)
- **P0** — GIN index on `unnest(member_ids)` for hypergraph search latency at scale
- **P1** — Hypergraph seeder Lanes B (`code_relations`) and C (`SHARES_TAGS`)
- **P1** — Replace centroid attention probe with risk-query embedding (z-score sigmoid already in place; further tuning optional)
- **P2** — Auto-promote dirty files into `recently_changed` hyperedges
- **P2** — Bidirectional Lane A ↔ Karpathy fusion
- **P2** — Feed `screenshot_artifacts.caption_embedding` into hypergraph as `member_kind='ui_screenshot'`

See `next_steps/active/2026-05-08_master-pipeline-todo.md` for the live priority queue.

---

## 14. Cross-references

- **Operator how-to:** [`ace-kag-howto.md`](./ace-kag-howto.md)
- **TRACE pipeline architecture:** [`trace-kag-pipeline.md`](./trace-kag-pipeline.md)
- **Karpathy GPU + Redis ACE notes:** [`memory/karpathy-gpu-redis-ace.md`](../../.claude/projects/c--Users-james-Videos-deeds-web-app/memory/karpathy-gpu-redis-ace.md)
- **Schema consolidation roadmap:** [`next_steps/active/2026-05-08_schema-consolidation-production-ready.md`](../next_steps/active/2026-05-08_schema-consolidation-production-ready.md)
- **Master pipeline todo:** [`next_steps/active/2026-05-08_master-pipeline-todo.md`](../next_steps/active/2026-05-08_master-pipeline-todo.md)
- **Claude Code skill:** [`.claude/skills/codebase-indexing-agentic-error-fixing.md`](../../.claude/skills/codebase-indexing-agentic-error-fixing.md)
