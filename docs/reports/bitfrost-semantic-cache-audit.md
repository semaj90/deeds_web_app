# Bitfrost Semantic Cache Audit

Generated: 2026-06-15T23:40:01.298Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 1
- gpu:karpathy:encoded: 1
- bifrost keys: 112
- centroid keys: 85
- som keys: 152

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 1 | gpu:karpathy:scores | gpu:karpathy:scores:147461 |
| `gpu:karpathy:encoded` | 1 | gpu:karpathy:encoded | gpu:karpathy:encoded:85389 |
| `bifrost:*` | 112 | bifrost:packet:64090fce409bb5c9, bifrost:packet:54fb19b574528f1a, bifrost:packet:6274b1cfbc90f2e1, bifrost:packet:3edd306a02055c3a, bifrost:sem:packet:src/lib/server/cache/timeline-builder-unified.ts:de2f77e03d5a511a | bifrost:packet:64090fce409bb5c9:425581, bifrost:packet:54fb19b574528f1a:425581, bifrost:packet:6274b1cfbc90f2e1:425581, bifrost:packet:3edd306a02055c3a:425580, bifrost:sem:packet:src/lib/server/cache/timeline-builder-unified.ts:de2f77e03d5a511a:85207 |
| `centroid:*` | 85 | centroid:54, centroid:74, centroid:36, centroid:69, centroid:27 | centroid:54:-1, centroid:74:-1, centroid:36:-1, centroid:69:-1, centroid:27:-1 |
| `som:*` | 152 | som:23, som:5, som:cell:76, som:cell:20, som:26 | som:23:-1, som:5:-1, som:cell:76:-1, som:cell:20:-1, som:26:-1 |
| `bifrost:sem:packet:*` | 25 | bifrost:sem:packet:src/lib/server/cache/timeline-builder-unified.ts:de2f77e03d5a511a, bifrost:sem:packet:src/routes/api/search/citations/+server.ts:725481ffc5ba1902, bifrost:sem:packet:src/lib/server/cases/timeline-builder.ts:14672e8293b846cf, bifrost:sem:packet:src/routes/api/library/citations/[citation]/+server.ts:3ced7ebc8cc7dd60, bifrost:sem:packet:src/routes/api/library/resolve-citation/+server.ts:2ec02b34f1d14f27 | bifrost:sem:packet:src/lib/server/cache/timeline-builder-unified.ts:de2f77e03d5a511a:85202, bifrost:sem:packet:src/routes/api/search/citations/+server.ts:725481ffc5ba1902:85187, bifrost:sem:packet:src/lib/server/cases/timeline-builder.ts:14672e8293b846cf:85198, bifrost:sem:packet:src/routes/api/library/citations/[citation]/+server.ts:3ced7ebc8cc7dd60:85182, bifrost:sem:packet:src/routes/api/library/resolve-citation/+server.ts:2ec02b34f1d14f27:85185 |
| `bifrost:sem:feature:*` | 8 | bifrost:sem:feature:utils, bifrost:sem:feature:infrastructure_config, bifrost:sem:feature:saved, bifrost:sem:feature:couchdb-rollback, bifrost:sem:feature:routes | bifrost:sem:feature:utils:85194, bifrost:sem:feature:infrastructure_config:85200, bifrost:sem:feature:saved:85176, bifrost:sem:feature:couchdb-rollback:85195, bifrost:sem:feature:routes:85183 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 25 | ace:context:src/routes/api/citations/+server.ts:0e7594ca31b0e29d, ace:context:src/routes/api/citations/export/pdf/+server.ts:f1c68cfb3f94c652, ace:context:src/routes/api/citations/collections/+server.ts:b4192b86906c5810, ace:context:src/lib/utils/simd-markdown-parser.ts:cea9e616965162e5, ace:context:src/routes/api/citations/collections/[collectionId]/citations/+server.ts:02862f7dc2463cc1 | ace:context:src/routes/api/citations/+server.ts:0e7594ca31b0e29d:2375, ace:context:src/routes/api/citations/export/pdf/+server.ts:f1c68cfb3f94c652:2371, ace:context:src/routes/api/citations/collections/+server.ts:b4192b86906c5810:2368, ace:context:src/lib/utils/simd-markdown-parser.ts:cea9e616965162e5:2388, ace:context:src/routes/api/citations/collections/[collectionId]/citations/+server.ts:02862f7dc2463cc1:2363 |
| `ace:summary:*` | 25 | ace:summary:src/routes/api/citations/collections/[collectionId]/export/+server.ts:1cee26022f349f30, ace:summary:src/routes/api/rabbitmq/health/+server.ts:194a44e50a22dbb6, ace:summary:src/routes/(app)/citations/+page.svelte:343fd1d01665a95f, ace:summary:src/routes/(app)/citations/+page.svelte:38b4868560607a00, ace:summary:src/routes/api/citations/export/pdf/+server.ts:f1c68cfb3f94c652 | ace:summary:src/routes/api/citations/collections/[collectionId]/export/+server.ts:1cee26022f349f30:2364, ace:summary:src/routes/api/rabbitmq/health/+server.ts:194a44e50a22dbb6:2386, ace:summary:src/routes/(app)/citations/+page.svelte:343fd1d01665a95f:2381, ace:summary:src/routes/(app)/citations/+page.svelte:38b4868560607a00:2383, ace:summary:src/routes/api/citations/export/pdf/+server.ts:f1c68cfb3f94c652:2369 |
| `ace:feature:*` | 8 | ace:feature:search, ace:feature:scripts, ace:feature:infrastructure_config, ace:feature:citations, ace:feature:saved | ace:feature:search:2371, ace:feature:scripts:2956, ace:feature:infrastructure_config:2392, ace:feature:citations:2381, ace:feature:saved:2369 |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 1 | ace:authority:top | ace:authority:top:18365 |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
