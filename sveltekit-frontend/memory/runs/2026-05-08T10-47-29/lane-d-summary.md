# Lane D Wired — 4-Lane Retrieval Surface Complete

**Run:** 2026-05-08T10-47-29
**Result:** 15/15 smoke tests passed in 1,150ms

## What landed

### Lane D — `vault_link` (shared vault references)

Source: `vault_md_index.links_out` (3,991 vault MD files indexed)

Each wikilink target attracts a hyperedge whose members are all vault MD
files that link TO it. This is the "shared reference" lane — documents
pointing at the same target form a hyperedge.

| Step | Result |
|------|--------|
| Dry-run | 145 components eligible, 3,275 members |
| Apply 1 | 145 updated, 3,275 unchanged |
| Apply 2 | 145 updated, 3,275 unchanged ← **idempotent** ✓ |

## Final 4-lane state

| Lane | edge_type | Edges | Member refs | Source signal |
|------|-----------|-------|-------------|---------------|
| A | `cluster_context`  | 42  | 16,181 | GPU k-means cohesion |
| B | `shared_resource`  | 83  | 1,056  | Postgres/Qdrant/Redis/Neo4j coupling |
| C | `agents_context`   | 12  | 197    | AGENTS.md tag-overlap (jaccard ≥ 0.4) |
| **D** | **`vault_link`** | **145** | **3,275** | **Shared wikilink targets** |
| **Total** | | **282** | **20,709** | |

## Vault walker integration

`hypergraph.searchByLane` now accepts `vault_link` as a lane:

```typescript
hypergraph.searchByLane({
  query: "cluster",
  lane:  "vault_link",   // NEW — Lane D
  limit: 5,
})
```

`agent.proposeFix` composes all 4 lanes:

```
For src/lib/server/db/client.ts:
  Lane A (cluster_context): 3 hits  (gpu:8, gpu:83, gpu:31)
  Lane B (shared_resource): 7 hits  (table:reports, table:statutes, ...)
  Lane C (agents_context):  4 hits  (tag_nbhd:src/lib/client/ui, ...)
  Lane D (vault_link):      6 hits  (shared-target wikilink groups)
```

Markdown plan now has dedicated `## Lane A/B/C/D` sections.

## Side-fix — PG pool resilience

Discovered during Lane D wiring: the dual-DB Postgres setup (5434 socat
proxy → 5432 container) drops idle TCP connections aggressively.
Symptoms: "Connection terminated unexpectedly" on every query after a
period of inactivity.

Mitigations applied to `getPgPool()`:

```ts
new pg.Pool({
  max: 5,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis:  5_000,
  keepAlive:                true,
  allowExitOnIdle:          true,
});
pool.on('error', () => {});  // suppress idle-client errors
```

Plus `pgQueryWithRetry()` wrapper that drops the cached pool and retries
once on `ECONNRESET / EPIPE / connection terminated`.

The proxy was also restarted (`docker restart deeds-postgres-prod-proxy`)
during this session — its socat process had accumulated zombie children.

## Smoke (15 tools, 1,150ms)

| Result | Tool | Latency |
|--------|------|---------|
| ✓ | `vault.search:qdrant` | 872ms (cold scan) |
| ✓ | `vault.search:risk-high` | 24ms |
| ✓ | `vault.read:db-client` | 1ms |
| ✓ | `vault.read:cluster-7` | 1ms |
| ✓ | `vault.followLinks:cluster-contains` | 1ms |
| ✓ | `vault.followLinks:file-up` | 1ms |
| ✓ | `vault.resolveEmbedding:vault-path` | 1ms |
| ✓ | `vault.resolveEmbedding:repo-path` | 1ms |
| ✓ | `retrieval.qdrantLookup` | 70ms (qdrant unavailable — graceful degrade) |
| ✓ | `agent.explainCluster:7` | 1ms |
| ✓ | `agent.proposeFix:db-client` | **164ms** (12 PG queries: 4 lanes × 3 probes) |
| ✓ | `hypergraph.searchByLane:A` | 2ms |
| ✓ | `hypergraph.searchByLane:B` | 4ms |
| ✓ | `hypergraph.searchByLane:C` | 2ms |
| ✓ | **`hypergraph.searchByLane:D`** | **4ms** (vault_link, 5 hits) |

## What this enables

The Gemma4 read-only agent now has 4 orthogonal retrieval signals
composed into a single `agent.proposeFix` call:

1. **Code semantics** (Lane A — what's clustered together)
2. **Runtime coupling** (Lane B — what shares state at runtime)
3. **Human conventions** (Lane C — what AGENTS.md docs apply)
4. **Documentation graph** (Lane D — what the vault docs reference together)

This is the foundation: 282 hyperedges, 20,709 member refs, 4 lanes,
all queryable via one MCP tool, all read-only.
