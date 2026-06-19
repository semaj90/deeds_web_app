# Bitfrost Semantic Cache Audit

Generated: 2026-06-19T05:25:08.418Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 579
- centroid keys: 85
- som keys: 203

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 579 | bifrost:packet:nes:../scripts/api-cleanup/recovery.test.ts, bifrost:packet:nes:../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/citations/collections/[id]/+server.ts, bifrost:packet:nes:src/lib/server/wiki/LLMS.md, bifrost:packet:322b9cf893125f07, bifrost:packet:nes:../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/yorha/layout/LLMS.md | bifrost:packet:nes:../scripts/api-cleanup/recovery.test.ts:3456, bifrost:packet:nes:../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/citations/collections/[id]/+server.ts:3455, bifrost:packet:nes:src/lib/server/wiki/LLMS.md:3455, bifrost:packet:322b9cf893125f07:145675, bifrost:packet:nes:../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/yorha/layout/LLMS.md:3456 |
| `centroid:*` | 85 | centroid:78, centroid:18, centroid:33, centroid:54, centroid:17 | centroid:78:579279, centroid:18:579266, centroid:33:579270, centroid:54:579274, centroid:17:579266 |
| `som:*` | 203 | som:cell:59, som:cell:90, som:centroid:2:5, som:57, som:31 | som:cell:59:579304, som:cell:90:579302, som:centroid:2:5:3454, som:57:579301, som:31:579301 |
| `bifrost:sem:packet:*` | 0 | none | none |
| `bifrost:sem:feature:*` | 0 | none | none |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 0 | none | none |
| `ace:summary:*` | 0 | none | none |
| `ace:feature:*` | 0 | none | none |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 1 | ace:authority:top | ace:authority:top:16296 |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
