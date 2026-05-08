# Run 2026-05-08T09-50-21 — Vault Walker End-to-End Test

## What ran

| Step | Command | Result | Time |
|------|---------|--------|------|
| 1 | `node scripts/graphify-obsidian-vault.mjs --clean` | 100 clusters + 3,659 files + 3,759-node canvas + 100-node KG canvas + 4 indexes + manifest | **2.0 s** |
| 2 | `npx tsx scripts/tests/smoke-vault-walker.mjs` | 11/11 tools passed | **0.95 s** |
| 3 | `npm run hypergraph:seed` | dry-run, 16,181 members tracked, adaptive guard active | 2.2 s |
| 4 | `npm run graphify:obsidian:incremental` | adaptive skip (`source graph unchanged`) | <0.1 s |

## Vault walker tool latencies

| Tool | Latency | Notes |
|------|---------|-------|
| `vault.search:qdrant` | 827 ms | scans all 3,759 notes — cold cache |
| `vault.search:risk-high` | 19 ms | 12 high-risk clusters |
| `vault.read:db-client` | 1 ms | full frontmatter + edges |
| `vault.read:cluster-7` | 0 ms | cluster note |
| `vault.followLinks:cluster-contains` | 1 ms | 1 hop |
| `vault.followLinks:file-up` | 1 ms | resolved BELONGS_TO_CLUSTER |
| `vault.resolveEmbedding:vault-path` | 0 ms | qdrant://… |
| `vault.resolveEmbedding:repo-path` | 1 ms | repo-path → vault slug |
| `retrieval.qdrantLookup` | 94 ms | network round-trip to :6333 |
| `agent.explainCluster:7` | 2 ms | 6 members aggregated |
| `agent.proposeFix:db-client` | 1 ms | markdown plan generated |

**95th percentile: 94 ms (qdrant network).** All in-memory tools are <2 ms.

## Adaptive guard verification

`scripts/graphify-obsidian-vault.mjs --incremental` correctly short-circuits
when `mtime(docs/graph/codebase-graph.json) ≤ mtime(docs/obsidian-vault/agent-manifest.json)`.
Verified twice: direct invocation + npm script wrapper.

## Data updates

- **Vault rebuilt** with `--clean` — removed 300-file subset, materialized full
  3,659-file vault. All 100 cluster notes now have full member lists.
- **20 authority scores loaded** from `memory/runs/2026-05-07T20-53-22/authority_scores.json`
  (top-N persisted only — fine for high-priority files).
- **Cluster jaccard cache** computed: 879 cluster↔cluster edges with similarity ≥ 0.4.
- **No mutations** to Postgres / Qdrant / Neo4j / Redis — all read-only.

## Artifacts

- `vault-rebuild.log` — full output of step 1
- `vault-walker-smoke.json` — structured 11-tool report
- `vault-walker-smoke.md` — human-readable summary table
- `hypergraph-seed.log` — adaptive guard evidence
- `obsidian-incremental.log` — incremental skip evidence

## Next

Vault walker is production-ready. Suggested follow-ups (not done in this run):
1. Wire `mcp:intel` (FastMCP server) into a VS Code task so Claude Code / Gemma4 can connect via stdio.
2. Run `karpathy:gpu` to refresh `gpu:karpathy:scores` (24h cooldown — last run earlier today).
3. Run `graphify:authority` to refresh `authority_scores.json` topScores (currently 20 entries — may want top-200 for richer pagerank coverage).
