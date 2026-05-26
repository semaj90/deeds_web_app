# Production-Ready Schema Consolidation + Atlas Context Injection

> Status: ACTIVE · 2026-05-08
> Supersedes (in scope): runtime orchestration sections of older session logs.
> Complements (does NOT replace): existing P0/P1 todos in `next_steps/active/`.

## Current state — what is already combined ✅

The runtime layer is wired and locked:

```
VS Code folderOpen
  → AI services parallel/detached (TRACE MCP, TurboQuant llama-server, Go retrieval)
  → ACE refresh lock-protected/incremental (startup:ace:detached)
  → AGENTS.md indexing (Redis + Postgres, 24h TTL)
  → screenshot pipeline (Sharp → Gemma4 VLM → EmbeddingGemma → Qdrant)
  → 4-tier ranking (Postgres FTS + Qdrant ANN + Neo4j PageRank + Redis ACE)
  → Karpathy GPU recommendations (gpu:karpathy:scores 24h TTL)
```

| Layer | State | Verification |
|-------|-------|--------------|
| TRACE MCP `:8788` | 34 tools live, all reachable | `node scripts/smoke-trace-mcp-tools.mjs` |
| TurboQuant `:8090` | gemma4-rotorquant:latest chat-only (q8_0 KV) | `curl localhost:8090/health` |
| Postgres proxy `:5434` | 36,069 cluster_members rows, agents_md_relations applied | `npm run smoke:agents` |
| Qdrant `:6333` | codebase_chunks_768 with cluster_key payload (gpu:N namespaced) | smoke |
| Redis `:6379` | gpu:karpathy:*, ace:*, agents:dir:*, taxonomy:* hot keys | `redis-cli KEYS 'gpu:*'` |
| Neo4j `:7474` | GDS v2.13.7, 2,772 PageRank-scored nodes, 197,506 rels | `smoke-neo4j-graph-enrich.mjs` |
| Startup orchestration | two-lane (incremental + heavy GPU-gated) | `npm run startup:ace:dry` |

## What is NOT combined yet ⚠️

**Schema consolidation — Zod is not the canonical source of truth.**

The intended ladder per memory/canonical guidance:
```
Zod schema (canonical)
  → Postgres JSONB + CHECK constraints
  → proto (generate via proto-from-zod.mjs, only for stable shapes)
  → gRPC (cross-language hot paths only)
  → MCP (LLM surface, always)
  → QUIC (deferred until HTTP/2 measurably hurts)
```

Today many shapes go straight to JSONB without Zod, and the AGENTS.md envelope parser/generator are misaligned.

---

## P0 — Schema/context consolidation (blocks production atlas)

### P0.1 — Zod schemas for atlas data shapes

Add to `src/lib/schemas/`:

| Shape | File | Rationale |
|-------|------|-----------|
| `screenshotArtifactSchema` | `screenshot-artifact.ts` | Sharp/VLM/embed pipeline output; gates Postgres `screenshot_artifacts` |
| `agentContextRelationSchema` | `agent-context-relation.ts` | Used by COVERS_CLUSTER / MIRRORS_KAG_NOTE / PARENT_OF / COVERS_TOPO_CLASS edges |
| `atlasKnowledgeCardSchema` | `atlas-card.ts` | Unified record across code/screenshot/case/legal lanes |
| `contextPacketSchema` | `context-packet.ts` | What `context.build_kv_packet` returns; bounds token budget |
| `karpathyScoreSchema` | `karpathy-score.ts` | `gpu:karpathy:scores` value type (currently free-form JSON) |
| `chunkHitLogDemandSchema` | `chunk-hit-demand.ts` | Demand-weighted retrieval signal |

Each must export:
- `const xxxSchema = z.object({...})`
- `type Xxx = z.infer<typeof xxxSchema>`
- A `parse` helper with safe error path

### P0.2 — AGENTS.md envelope alignment

**Current mismatch:**
- Parser (`parse-agents-md.ts`) expects: `## Rules`, `## Tools`, `## Constraints`, `## Semantic Tags`
- Generator (`generate-agents-md.mjs`) emits: `## Audit Gates`, `## TODO — Enhancements`, `## Fix Timeline`

Fix:

1. Add a **Machine Envelope JSON** block to generator output:
   ```markdown
   <!-- AGENTS-MACHINE v1 -->
   ```json
   { "rules": [...], "tools": [...], "constraints": [...], "qdrant_tags": [...], "references_file": [...] }
   ```
   ```
2. Teach parser to read in priority order:
   1. Machine Envelope JSON (canonical)
   2. legacy `## Rules` / `## Tools` / `## Constraints` headings
   3. structural fallback (Audit Gates / TODO / Fix Timeline → derive)

3. Backfill envelope fields from existing graph data (cluster summaries, audit gates already provide `rules`-like content).

4. Rebuild relations:
   ```bash
   npm run agents:relations:dry
   npm run agents:relations
   ```

   Expected new edges: `SHARES_TAGS`, `REFERENCES_TOOL`, `REFERENCES_FILE`, `OVERRIDES`.

### P0.3 — Cluster key normalization

Existing data has both `cluster::44` (legacy double-colon) and `cluster:gpu:44` (canonical) — pick one.

```sql
UPDATE qdrant_cluster_members
   SET cluster_key = REPLACE(cluster_key, 'cluster::', 'cluster:gpu:')
   WHERE cluster_key LIKE 'cluster::%';
```

Sync to Qdrant payloads via `npm run qdrant:backfill-cluster-keys --force`.

### P0.4 — New MCP tools (atlas context API)

Add to `src/mcp/trace-mcp-server.ts`:

| Tool | Returns |
|------|---------|
| `agents_md.context_for_file(filePath)` | Walk-up AGENTS.md hierarchy + envelope rules + structural relations |
| `agents_md.peers_for_dir(dirPath)` | Sibling + cousin AGENTS.md (via `SHARES_TAGS`/`COVERS_CLUSTER`) |
| `agents_md.coverage(filePath)` | Which AGENTS.md own the file (clusters, topo_class, dir hierarchy) |
| `codebase.context_for_file(filePath)` | Full atlas card: AGENTS rules + topology + Qdrant hits + chunk_hit_log demand + Karpathy score |

Wire all 4 into `tools/list` so Gemma4 / Claude Code can call them via MCP.

---

## P1 — Claude Code context injection

### P1.1 — Skill installed

`.claude/skills/codebase-indexing-agentic-error-fixing.md` — created 2026-05-08.

Loads atlas context BEFORE proposing edits. Defines the 7-step first-action checklist, retrieval ladder, rank formula, error fixing classification, schema consolidation rule.

### P1.2 — Recommendation API endpoint

```
GET /api/ace/recommendations?filePath=...
```

Returns ranked context packet:
```json
{
  "filePath": "...",
  "agentsMd": [...],
  "topology": { "cluster": "...", "communityId": ..., "neighbors": [...] },
  "qdrantHits": [...],
  "demandSignal": { "hits24h": ..., "avgRerankScore": ... },
  "karpathyScore": { "blend": ..., "pr": ..., "attn": ..., "authority": ... },
  "recommendedActions": [...]
}
```

Backed by `codebase.context_for_file` MCP tool (P0.4) so the API is just an HTTP wrapper.

### P1.3 — Context packet builder

Standalone TS function `buildContextPacket(filePath, opts)` in `src/lib/server/ace/context-packet-builder.ts`. Used by:
- `/api/ace/recommendations` (HTTP)
- `context.build_kv_packet` (MCP)
- Claude Code skill (via MCP)

---

## P2 — Demand-weighted reranking

### P2.1 — Hit-log demand signal already wired

`scripts/karpathy-gpu-enrich.mjs --source=hit-log --hours=24` reads `chunk_hit_log` for top-N by `count × avg_rerank_score`. Already operational.

### P2.2 — RRF fusion across all lanes

Add `src/lib/server/retrieval/rrf-fuse.ts` that takes results from:
- Postgres FTS (BM25)
- pg_trgm fuzzy
- Qdrant ANN
- Neo4j graph fanout
- Redis hot-rank

…and fuses via Reciprocal Rank Fusion. Currently each lane runs independently — fusion happens client-side or implicit in rerank.

### P2.3 — Synthesis stored in context_timeline

Every Gemma4/Claude synthesis gets a row in `context_timeline` with: query, retrieved cards, final answer, rerank weights used, success/failure flag. Enables RL signal capture (already partially wired per memory).

---

## P3 — Serialization roadmap (deferred)

| Stage | When | Action |
|-------|------|--------|
| Zod canonical | NOW (P0.1) | Source of truth |
| JSONB canonical | NOW | Already done |
| proto generation | When cross-language consumers appear | `npm run proto:from-zod` |
| gRPC service | When MCP/HTTP is measurably too slow | New port, not replace MCP |
| QUIC | When HTTP/2 head-of-line blocking measured | Defer indefinitely until evidence |

---

## Comparison vs existing `next_steps/active/`

| File | Topic | Relation to this plan |
|------|-------|----------------------|
| `2026-05-03-production-readiness-master.md` | Master prod readiness checklist | Complement — this adds the schema/context layer |
| `2026-05-03-production-blockers.md` | Hard blockers | Complement — same |
| `2026-05-03-auth-gaps.md` | Auth coverage | Independent — auth on routes |
| `2026-05-03-directory-consolidation.md` | Directory cleanup | Independent — file org |
| `2026-05-05_inverted-features-build-order.md` | Feature ordering | Complement — schema consolidation enables many of these |
| `2026-05-05_unwired-features-wiring-plan.md` | Unwired component reconnection | Complement — atlas relations help find unwired components |
| `2026-05-07-dir-audit-lib-server.md` | `lib/server/` audit | Independent — directory-scoped |
| `2026-05-07_graph-glyph-ace-synthesis.md` | Graph→Glyph→ACE→Gemma4 | **Direct predecessor** — this plan extends with schema consolidation + Claude skill |
| `2026-05-08_mcp-trace-hardening-session.md` | MCP/TRACE hardening | Direct predecessor — runtime done, this is schema layer |
| `karpathy-gpu-recommendations.md` | Auto-generated GPU output | Output of this plan, not a todo |

**No conflicts.** This plan adds a new layer (schemas + Claude skill + atlas context API) on top of the wired runtime.

---

## Verification command sequence

```bash
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend

# P0 verification
npm run agents:pipeline:safe                      # AGENTS.md regen
npm run agents:relations:dry                       # preview new edges
npm run smoke:agents                               # 374 dir keys + agents:root

# P0.3 cluster key migration (after applying)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT cluster_key, COUNT(*) FROM qdrant_cluster_members GROUP BY 1 ORDER BY 2 DESC LIMIT 10;"

# P0.4 new MCP tools
node scripts/smoke-trace-mcp-tools.mjs             # should grow from 34 → 38

# P1.2 recommendation API
curl -s 'http://localhost:5173/api/ace/recommendations?filePath=src/lib/server/db/client.ts' | jq

# P2 demand-weighted
npm run karpathy:gpu --source=hit-log --hours=24

# Health
node scripts/check-all-tools.mjs                   # 47-gate
npm run typecheck:native                            # tsgo 0 errors
npm run check                                       # svelte-check 0/0
```

## Suggested commit message

```
feat(atlas): schema consolidation + Claude Code context injection skill

- Add Zod schemas for atlas data shapes (screenshot, relation, card, packet)
- Align AGENTS.md generator/parser via Machine Envelope JSON block
- Normalize cluster keys (cluster::N → cluster:gpu:N) across Qdrant + Postgres
- Add 4 new MCP tools: agents_md.context_for_file/peers_for_dir/coverage,
  codebase.context_for_file
- Add /api/ace/recommendations endpoint backed by context-packet-builder
- Install Claude Code skill so every session loads atlas context first
- Document deferred serialization roadmap (proto → gRPC → QUIC)

Schema consolidation closes the gap left by runtime orchestration:
Zod is now the canonical source, JSONB is the durable form, MCP is the
LLM-facing surface, and proto/gRPC/QUIC remain explicitly deferred until
cross-language or perf evidence justifies them.
```

---

## Run log — 2026-05-08 P0.1 (codebase TODO aggregator quality fix)

Applied two fixes flagged in the prior pass:

1. **Path normalization** between `gpu:karpathy:scores` (`src/lib/...`) and
   `ace:authority:top` (`lib/...`) via `normalizeAtlasPath()` — strip
   `sveltekit-frontend/` and `src/` prefixes before merging the two HSETs.
2. **Loosened JSONB filter** on `agent_context_files`:
   `WHERE rules IS NOT NULL AND jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) > 0`.

### Before vs after (top-5 from `npm run skill:codebase-todo`)

| File | Before blend | Before authority | After blend | After authority |
|---|---|---|---|---|
| `src/lib/server/db/client.ts` | 0.288 | 0.00 | **0.510** | **0.55** |
| `src/lib/server/env.server.ts` | 0.221 | 0.00 | **0.370** | **0.37** |
| `src/lib/server/redis.ts` | 0.171 | 0.00 | **0.311** | **0.35** |
| `src/lib/server/ollama.ts` | 0.154 | 0.00 | **0.284** | **0.32** |
| `src/lib/server/middleware/cache-headers.ts` | 0.144 | 0.00 | **0.247** | **0.26** |

Cluster keys now also surface in the `Reasons` column (e.g.
`unclassified:community-2516`), giving Claude Code an immediate
graph-locality hint per file.

### Still 0 / iteration items remaining

- **PR=0.00 on most rows** — only the 24 files in `gpu:karpathy:scores`
  carry PageRank; the other 176 from authority-only have no PR cached.
  Karpathy default of 0.15 (vs Neo4j raw 7.06 for the top file) suggests
  the karpathy script's PR field is min-max normalized — should pull the
  raw PR from Neo4j into the authority HSET so all 200 entries have it.
- **Attention=0.00** — same reason; only karpathy entries store attention,
  and even there it's the cross-attention vs centroid (always near 1.0,
  not differential signal). Switch karpathy's `attentionVsRiskProbe()` to
  embed an actual risk query (`"unsafe deserialization complex import graph"`)
  for differential signal.
- **AGENTS rule rows = 0** even after filter loosening — confirms most
  rows in `agent_context_files` have `rules = NULL` or `rules = '[]'`.
  Envelope backfill needs another pass; the parser successfully filled
  `tools` (373/373) and `constraints` (373/373) but `rules` is still
  empty on most files. Next: align the AGENTS.md generator to emit a
  parseable rules array (the envelope spec was added but old generated
  AGENTS.md files don't have it yet).
- **Gemma4 rerank skipped** in latest run — VLM responded empty; debug
  with smaller `num_predict` cap and explicit prompt floor.

### Verification commands

```bash
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend

# Refresh authority + karpathy + skill
npm run graphify:gds              # rebuild ace:authority:top (200 entries)
npm run karpathy:gpu              # rebuild gpu:karpathy:scores (24 entries)
npm run skill:codebase-todo       # render top-25 doc + Redis cache

# Inspect output
head -40 next_steps/active/codebase-todo-recommendations.md
docker exec legal-ai-redis redis-cli HGETALL ace:todo:latest | head -20

# Health
node scripts/check-all-tools.mjs  # 40 PASS / 0 FAIL / 0 WARN
```

### Next P0 milestones (in order)

1. **P0.1.a** — backfill raw PR into `ace:authority:top` so all 200
   entries have non-zero PR (currently only the 24 karpathy entries do).
2. **P0.1.b** — switch karpathy attention probe to a risk query
   embedding (~50ms cost, real differential signal).
3. **P0.1.c** — regenerate AGENTS.md files with rules-array envelope
   block so the parser populates `rules` JSONB consistently.
4. **P0.2** — `codebase.context_for_file` MCP tool (single-call atlas
   packet for any file path).
5. **P0.3** — `agents_md.context_for_file` MCP tool (nearest +
   parents + tools + constraints in one query).

