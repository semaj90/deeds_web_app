# Deep AST Audit

Generated: 2026-05-06T01:03:11.041Z
Graph files: 3417

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D18 | simdjson opportunity (.mget + JSON.parse, no fast-parse) | 10 |

---

## D18 — simdjson opportunity (.mget + JSON.parse, no fast-parse)

**10** findings

- `src\lib\server\research\lane4-feedback.ts:126` — const [scoreRaw, countRaw] = await redis.mget(  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\rag\sdk.ts:48` — const [statusRaw, shardCountRaw] = await redis.mget([  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\graph\hypergraph-4d.ts:1123` — const raw = await redis.mget(hashes.map(h => HG_EDGE_KEY(h))).catch(() => [] as (string|null)[]);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\graph\codebase-cluster-detection.ts:350` — const values = await redis.mget(...keys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\cache\redis-exact-match.ts:160` — const values = await redis.mget(...cacheKeys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\lib\server\analytics\web-research-crawler.ts:396` — .mget(hashes.map(h => WEB_SUM_KEY(h)))  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\routes\api\codebase-index\topology-hits\+server.ts:52` — const blobs = await redis.mget(...keys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\routes\api\codebase-index\ingest-log\+server.ts:44` — const raws = await redis.mget(hashes.map((h) => `rag:hit:${h}`));  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\routes\api\codebase-index\agents-write\+server.ts:209` — kagVals = await redis.mget(...kagKeys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate
- `src\routes\api\codebase-index\export\bundle\+server.ts:223` — const values = await redis.mget(...keys);  → consider parseEntriesBulk for ≥10/≥5KB aggregate

---

## Recommended Claude Code skills

Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:

- /deep-audit — already clean; run for 47-gate health sweep across all tiers (Tier A code, Tier C infra, Tier H analytics)

**Composition pattern**:
1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)
2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)
3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)
4. `/wire-modules` (D10 missing-import) — fix orphan call sites
5. `/deep-audit` — 47-gate sweep including this audit's output as Tier A baseline
