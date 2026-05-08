# Lane C — Agents-Context Hyperedges (SHARES_TAGS)

**Run:** 2026-05-08T09-50-21
**Source:** `agent_context_relations` WHERE `relation = 'SHARES_TAGS'` (2,422 pairwise edges, 232 source AGENTS.md scopes, jaccard 0.3-1.0)
**Algorithm:** SQL 3-pass min-of-neighbors label propagation (connected components via min-vertex labelling)
**Threshold:** jaccard ≥ 0.4

## Apply sequence

| Step | Result |
|------|--------|
| 1. Dry-run | 12 components eligible, 197 members |
| 2. Apply (1st) | 12 updated, 197 members unchanged (Lane C was previously seeded) |
| 3. Apply (2nd) | 12 updated, 197 members unchanged ← **idempotent** ✓ |

## Components produced (12 total)

| # | Centroid (component_id) | Members | Grade |
|---|-------------------------|---------|-------|
| 1 | `src/lib/client/ui` | 59 | A |
| 2 | `src/lib/ai` | 44 | A |
| 3 | `src/lib/components/admin` | 41 | A |
| 4 | `src/lib/components/agentic` | 21 | B |
| 5 | `src/lib/client` | 6 | C |
| 6 | `src/lib/server/langextract` | 5 | D |
| 7 | `src/routes/(app)/codebase-graph/fast-ast` | 4 | D |
| 8 | `src/lib/components/case` | 4 | D |
| 9 | `src/lib/server/agents` | 4 | D |
| 10 | `src/lib/components/cache` | 3 | D |
| 11 | `src` | 3 | D |
| 12 | `src/lib/server/phase72` | 3 | D |

## 3-lane retrieval surface (live)

| Lane | edge_type | Edges | Member refs | Source signal |
|------|-----------|-------|-------------|---------------|
| A | `cluster_context` | 42 | 16,181 | GPU k-means cohesion |
| B | `shared_resource` | 83 | 1,056 | Postgres/Qdrant/Redis/Neo4j coupling |
| **C** | **`agents_context`** | **12** | **197** | **Tag-overlap (qdrant_tags jaccard)** |

**Total:** 137 hyperedges across 3 retrieval lanes.

## Search API verification

```
GET /api/hypergraph/search?q=ai&edge_type=agents_context

→ tag_nbhd:src/lib/ai  (grade A, 44 members, weight 1)
  "Tag-neighborhood centered on src/lib/ai"
```

EDGE_TYPE_VALUES already includes `agents_context` in
`src/routes/api/hypergraph/search/+server.ts:9`. Filter parameter validates
via Zod enum.

## What this enables

Gemma4 / vault-walker now has three orthogonal retrieval signals:

1. **`cluster_context`** — "files in the same GPU k-means cluster" (semantic cohesion)
2. **`shared_resource`** — "files that all touch the same Postgres table / Qdrant collection / Redis key / Neo4j label" (runtime coupling)
3. **`agents_context`** — "AGENTS.md scopes that share substantial tag vocabulary" (semantic AGENTS.md neighborhoods)

When the agent investigates a file:
- Lane A says: which other files are *semantically similar*
- Lane B says: which other files *share runtime state* (the actual blast radius)
- Lane C says: which AGENTS.md docs *describe related conventions*

Together: this is the foundation the read-only Gemma4 agent needs before proposing fixes — context that combines code, runtime, and human-authored conventions.

## Adaptive guards confirmed

- `edge_hash` collision check: hashes are deterministic from sorted member keys
- `member count match` check: skips DELETE/INSERT when membership unchanged
- Redis archive: `hypergraph:edges:archive:2026-05-08` (137 edges, 30d TTL)
- Idempotent re-runs: 0 rewrites, 197 members unchanged

## Logs

- `lane-c-apply-1.log` — first apply
- `lane-c-apply-2.log` — idempotency proof
