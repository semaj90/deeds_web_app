# 3-Lane Composition — Wired Into Read-Only Agent

**Run:** 2026-05-08T10-20-46
**Result:** 14/14 smoke tests passed in 2,092ms

## What landed

### New tool: `hypergraph.searchByLane`

Direct Postgres query against `hypergraph_edges` filtered by `edge_type`.
Returns ranked hyperedges with title + summary + grade + member preview.

```
hypergraph.searchByLane({ query, lane, limit })
  lane ∈ { cluster_context, shared_resource, agents_context }
```

### Upgraded tool: `agent.proposeFix`

Now composes signals from **all 3 lanes** in a single call. Multi-probe
union search (file basename + dir name + 2 cluster-topic words) — ILIKE
substring matches across title/summary/label, deduped by edge id.

Returned structure:

```json
{
  "lanes": {
    "cluster_context": [...],
    "shared_resource": [...],
    "agents_context": [...]
  },
  "proposal_markdown": "..."
}
```

The markdown plan now has dedicated `## Lane A`, `## Lane B`, `## Lane C`
sections, each listing matched hyperedges with grade + member count.

## End-to-end demonstration

**Input:** `agent.proposeFix({ file_path: "src/lib/server/db/client.ts", issue: "cache miss" })`

**Probes derived:** `["client", "db", "component"]` (filename, dir, topic word)

**Lanes returned:**

| Lane | Hits | Top edges |
|------|------|-----------|
| A — cluster_context | 3 | `gpu:8` (844 members, A), `gpu:83` (389, A), `gpu:31` (268, A) |
| B — shared_resource | 7 | `table:reports` (18, B), `table:statutes` (15, B), `redis_read:couchdb:pagerank_scores` (5, D) |
| C — agents_context | 4 | `tag_nbhd:src/lib/client/ui` (59, A), `tag_nbhd:src/lib/server/agents` (4, D) |

The proposal markdown now grounds the agent in three orthogonal signals
**before** any code change: which clusters this file lives in, which
runtime resources it couples to, and which AGENTS.md conventions apply.

## Smoke results (14 tools)

| # | Tool | Latency |
|---|------|---------|
| 1 | `vault.search:qdrant` | 841ms (cold scan of 3,759 notes) |
| 2 | `vault.search:risk-high` | 21ms (filtered) |
| 3 | `vault.read:db-client` | 0ms |
| 4 | `vault.read:cluster-7` | 1ms |
| 5 | `vault.followLinks:cluster-contains` | 0ms |
| 6 | `vault.followLinks:file-up` | 0ms |
| 7 | `vault.resolveEmbedding:vault-path` | 1ms |
| 8 | `vault.resolveEmbedding:repo-path` | 0ms |
| 9 | `retrieval.qdrantLookup` | 84ms (network) |
| 10 | `agent.explainCluster:7` | 1ms |
| 11 | `agent.proposeFix:db-client` | **60ms** (composes 3 PG queries × 3 probes = 9 SQL hits) |
| 12 | `hypergraph.searchByLane:A` | 2ms |
| 13 | `hypergraph.searchByLane:B` | 3ms (5 hits) |
| 14 | `hypergraph.searchByLane:C` | 2ms (1 hit) |

p95 = 84ms (Qdrant network). All in-memory tools <2ms. Lane queries <5ms.

## Side-fix

`getPgPool()` now lazy-loads `dotenv` if `DATABASE_URL` isn't already in
`process.env` — makes the tools self-contained when imported by smoke
runners or stdio MCP loops without explicit env preload.

## Read-only contract maintained

- All new code paths use `pool.query()` with parameterized SELECT only
- No INSERT / UPDATE / DELETE / TRUNCATE in any tool
- `agent.proposeFix` returns markdown as a STRING — no file writes
- Vault walker remains pure `node:fs/promises` reads

## What this enables

The Gemma4 read-only agent now has a single-call entry point
(`agent.proposeFix`) that:

1. Reads the file's vault note (frontmatter + Breadcrumbs typed edges)
2. Pulls cluster context (siblings + risk + topic)
3. Queries Lane A (semantic cohesion)
4. Queries Lane B (runtime coupling — DB tables, Qdrant collections, Redis keys, Neo4j labels)
5. Queries Lane C (AGENTS.md tag-overlap neighborhoods)
6. Returns assembled markdown plan with all 3 lanes

The agent can then propose a fix grounded in code semantics + runtime
state + human-authored conventions — without ever mutating the codebase.
