# Atlas Signal Quality — TODO

> Status: ACTIVE · 2026-05-08
> Successor to: `2026-05-08_schema-consolidation-production-ready.md` (which
> tracked the surface build-out — atlas + MCP + HTTP + screenshots + hypergraph).
> This list focuses on **signal quality**: making the ranking surface honest,
> testable, and resilient.

## Closed this session (recap)

| ID | Item | Outcome |
|---|---|---|
| #0 | AGENTS history/tools merge migration | 1,119 history rows preserved; 0 overwrites |
| #1 | 6 atlas MCP tools at `:8788` | 44/44 smoke pass |
| #2 | `/api/ace/recommendations` HTTP wrapper | full Zod + degraded contract |
| #3 | TurboQuant screenshot caption cascade + CoT stripper | 30/30 captioned, real UI descriptions |
| #4 | `hypergraph_edges` seeder Lane A | 71 cluster_context edges, 16,379 members |
| P0.1.a | PageRank cache full-200 | 200/200 entries with non-zero PR |
| P0.1.b | Risk-query attention spread | 0.05–0.96 differential (was saturated at 1.0) |
| Drizzle drift | `hypergraph_edges` 10→25 cols | svelte-check 0/0; Drizzle readers see full row |
| Hypergraph regression smoke | `npm run smoke:hypergraph` | 5/5 pass; caught a real MCP staleness on first run |
| Hit-demand pipeline | `seed-hit-demand.mjs` + `loadHitDemand()` + rank fusion | end-to-end verified with synthetic entry; surfaces in `file.hitDemand` + `reasons` |
| Startup auto-refresh | `ace:hit-demand` in `allowedOnStartup` | runs on folderOpen via existing safe lane |

---

## P0 — Operator decision (single env edit + dev restart)

### A. Promote `:5434` as canonical Postgres

The dual-DB diagnosis (`2026-05-08_dual-postgres-dbs-todo.md`) confirmed `:5434`
is **not a proxy** — it's the modern instance. `:5432` is a legacy stub. They
drifted independently, which is why Drizzle-based readers saw "column 'title'
does not exist" while psql resolved fine.

**One commit when ready:**

1. Edit `src/lib/server/env.server.ts` — remove `DATABASE_URL_FALLBACK` and
   pin `DATABASE_URL` to `:5434`.
2. Restart `npm run dev`.
3. Verify:
   ```bash
   node scripts/check-all-tools.mjs
   npm run smoke:agents
   npm run smoke:hypergraph
   curl -s http://127.0.0.1:5173/api/hypergraph/search \
     -X POST -H 'Content-Type: application/json' \
     -d '{"query":"redis","limit":3}' | jq '.totalMatched'
   ```
4. Expected: green when the dev server is up, `totalMatched: 3`, no route reads `:5432` schema.

**Why deliberate:** affects correctness app-wide. Worth doing as an explicit
operator action with a clean commit message.

---

## P1 — Signal quality

### B. Actually populate `chunk_hit_log` from the ACE retrieval path

The demand pipeline read side is wired, but `chunk_hit_log` only has 32
historical rows from April 20, all with empty `relative_path`. Until the
writer fills new rows, the demand signal stays at 0.

**Where to wire the writer:**

- ACE retrieval pass — every chunk returned by `recordChunkHits()` should
  insert a row with `chunk_id`, `relative_path` (atlas-normalized), `pipeline`
  (`'ace'`), `query_hash`, `score`, and `rerank_score`.
- The `recordChunkHits()` helper exists per CLAUDE.md G50 audit gate — the
  call path needs to actually fire. Audit which retrieval paths bypass it.

**Acceptance:** after one day of dev usage, `npm run ace:hit-demand` reports
`>0 unique files` and `contextForFile()` calls return non-zero `hitDemand.hits`
for actively retrieved files.

### C. Validate the demand-rank weight (currently 0.20)

The synthetic-entry test showed file rank moved from 0.222 → 0.284 with
`hits=7, hot_score=3.85`. That's a healthy but not dominating boost. Once
real chunk_hit_log data flows, monitor whether 0.20 over-weights or
under-weights demand vs authority/karpathy/dirty.

**Tunable in:** `src/lib/server/atlas/context-for-file.ts` (search for
`demandHotRaw` and the rank fusion).

### D. `atlas:prompt:smoke` regression smoke

Same shape as `smoke:hypergraph` (5 checks per lane):

1. `loadAtlas()` returns non-empty atlas
2. `buildPromptCards({ topN: 5 })` returns 5 cards
3. Top card has populated `rank`, `reasons`, `clusterKey`
4. Karpathy blend stays normalized (no card has `rank=1.0` saturation)
5. Path alias lookup resolves both `src/lib/...` and `lib/...` forms

Suggested file: `scripts/smoke/atlas-prompt-smoke.mjs`
Suggested npm: `smoke:atlas:prompt`

### E. Hypergraph seeder Lane B — `code_relations`

`code_relations` has 11,405 rows of import/call edges. Seed one hyperedge
per "well-connected" source file:

- `member_ids` = all `target_key`s from rows where `source_file = X`
- `edge_type = 'cluster_context'` (reuse existing API enum)
- `source = 'code_relations'`
- Filter: only files with ≥ 3 outgoing relations (excludes leaf files)

**Acceptance:** `hypergraph.search` returns relevant edges for keywords like
"redis", "ollama", "embedding-client" — currently only finds them via
cluster cohesion (Lane A), not direct call-graph adjacency.

### F. Hypergraph seeder Lane C — `agent_context_relations.SHARES_TAGS`

The AGENTS.md relationship graph has 10,521 edges. Seed one hyperedge per
strongly-tagged AGENTS.md group:

- Group by `target_key` where `relation = 'SHARES_TAGS'` and weight ≥ 0.4
- `member_ids` = the AGENTS.md paths that share the tag
- `edge_type = 'agents_context'` (existing enum)

**Acceptance:** querying `hypergraph.search` for a topic-shaped phrase
("authentication", "vector search") returns AGENTS.md scopes that govern
those tags, not just file-level cluster cohesion.

---

## P2 — Coverage / observability

### G. `ace:retrieval` writer audit

Track every `recordChunkHits()` call site. Verify all four lanes write:

- RAG retrieval
- KAG retrieval
- ACP cross-feed
- Graph neighbour expansion

Currently `chunk_hit_log` has only 32 rows from one (likely broken) call site.
This is a CLAUDE.md G50 gate that should be passing.

### H. `chunk_hit_log` partition strategy

Once the writer is fixed and the table starts growing, partition by
`hit_at` (monthly). Without partitioning, `seed-hit-demand`'s 24h aggregate
will slow as the table grows past ~1M rows.

### I. UI atlas-context panel

Surface `/api/ace/recommendations` in a Svelte panel — file picker → top-N
peer cards + AGENTS rules + recommended actions. Closes the visual gap
between the agent-facing surface and the operator-facing one.

---

## P3 — Architectural follow-ups (deferred, blocked on operator decisions)

### J. Lanes B/C for hypergraph seeder require Postgres canonical (P0.A)

Lane B reads from `code_relations` and Lane C from `agent_context_relations`.
Both tables exist on `:5434` but may not on `:5432`. Defer until P0.A lands.

### K. Schema consolidation (Zod source of truth)

Per `2026-05-08_schema-consolidation-production-ready.md` P3 — generate
`.proto` + JSON Schema + JSONB CHECK constraints from a single Zod schema
in `src/lib/schemas/`. Big change; defer until atlas surface is stable.

---

## Refresh / verification commands

```bash
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend

# Health
node scripts/check-all-tools.mjs           # 46+ probes
npx svelte-check --threshold error          # 0/0
npx tsgo --noEmit                           # 0 errors

# Atlas + signals
npm run ace:hit-demand                      # demand signal refresh (24h)
npm run ace:hit-demand:48h                  # wider window
npm run karpathy:gpu                        # rebuild gpu:karpathy:scores
npm run skill:codebase-todo                 # rendered top-25 doc

# Hypergraph
npm run smoke:hypergraph                    # 5-check regression smoke
npm run seed:hypergraph                     # re-seed cluster_context edges

# MCP
curl -s -X POST http://127.0.0.1:8788/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | grep -oE '"name":"[^"]+"' | wc -l
# Expect: ≥ 44 tools
```

## Recommended commit order

1. **P0.A** — operator decision; promote `:5434`. One commit.
2. **P1.B** — wire `recordChunkHits()` writer audit. One PR per missing call site.
3. **P1.D** — `atlas:prompt:smoke`. Single test file.
4. **P1.E** + **P1.F** — hypergraph Lanes B/C. One commit each (after P0.A).
5. **P2.G** — writer audit. May reveal multiple commits.
6. **P2.I** — UI panel. One feature branch.

The atlas surface is built. Everything from here forward is signal quality
and observability — sharper, but smaller in scope per change.
