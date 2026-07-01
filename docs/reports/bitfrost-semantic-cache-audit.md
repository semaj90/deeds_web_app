# Bitfrost Semantic Cache Audit

Generated: 2026-07-01T02:22:07.810Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 1130
- centroid keys: 0
- som keys: 0

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 1130 | bifrost:sem:packet:packet:0141fd3854b1, bifrost:sem:packet:packet:023deb8570b2, bifrost:sem:packet:packet:0242eca5b9f3, bifrost:sem:feature:scripts.load-packets-neo4j, bifrost:sem:feature:neschrom97.30e6b5d0c6a8f393 | bifrost:sem:packet:packet:0141fd3854b1:85023, bifrost:sem:packet:packet:023deb8570b2:85313, bifrost:sem:packet:packet:0242eca5b9f3:85317, bifrost:sem:feature:scripts.load-packets-neo4j:85009, bifrost:sem:feature:neschrom97.30e6b5d0c6a8f393:84724 |
| `centroid:*` | 0 | none | none |
| `som:*` | 0 | none | none |
| `bifrost:sem:packet:*` | 614 | bifrost:sem:packet:packet:0141fd3854b1, bifrost:sem:packet:packet:023deb8570b2, bifrost:sem:packet:packet:0242eca5b9f3, bifrost:sem:packet:packet:0224aacdd67e, bifrost:sem:packet:packet:0003260092b1 | bifrost:sem:packet:packet:0141fd3854b1:85021, bifrost:sem:packet:packet:023deb8570b2:85310, bifrost:sem:packet:packet:0242eca5b9f3:85315, bifrost:sem:packet:packet:0224aacdd67e:85281, bifrost:sem:packet:packet:0003260092b1:84638 |
| `bifrost:sem:feature:*` | 516 | bifrost:sem:feature:scripts.load-packets-neo4j, bifrost:sem:feature:neschrom97.30e6b5d0c6a8f393, bifrost:sem:feature:.python311.entry2, bifrost:sem:feature:scripts.legal-corpus, bifrost:sem:feature:neschrom97.e46d6187de1edbd6 | bifrost:sem:feature:scripts.load-packets-neo4j:85005, bifrost:sem:feature:neschrom97.30e6b5d0c6a8f393:84720, bifrost:sem:feature:.python311.entry2:85095, bifrost:sem:feature:scripts.legal-corpus:84796, bifrost:sem:feature:neschrom97.e46d6187de1edbd6:84988 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 614 | ace:context:packet:00bacf58384b, ace:context:packet:0194484feed4, ace:context:packet:01c26f2c1882, ace:context:packet:001d9f093944, ace:context:packet:016584fd707a | ace:context:packet:00bacf58384b:2079, ace:context:packet:0194484feed4:2297, ace:context:packet:01c26f2c1882:2356, ace:context:packet:001d9f093944:1879, ace:context:packet:016584fd707a:2256 |
| `ace:summary:*` | 697 | ace:summary:packet:00615b1a7515, ace:summary:packet:000b2df0cfdf, ace:summary:packet:007e489e8e2e, ace:summary:packet:01630dcae75d, ace:summary:summary:2ee79ea9a56e40c7 | ace:summary:packet:00615b1a7515:1971, ace:summary:packet:000b2df0cfdf:1850, ace:summary:packet:007e489e8e2e:1998, ace:summary:packet:01630dcae75d:2253, ace:summary:summary:2ee79ea9a56e40c7:491345 |
| `ace:feature:*` | 516 | ace:feature:simd-bridge.lib-cfg_if, ace:feature:.svelte-error-fixes-backup.LLMS, ace:feature:sveltekit-frontend.gaming-types, ace:feature:neschrom97.e60e5d78cdd9ddfb, ace:feature:neschrom97.e1a884a6c504bbdc | ace:feature:simd-bridge.lib-cfg_if:2123, ace:feature:.svelte-error-fixes-backup.LLMS:2578, ace:feature:sveltekit-frontend.gaming-types:2043, ace:feature:neschrom97.e60e5d78cdd9ddfb:1963, ace:feature:neschrom97.e1a884a6c504bbdc:2486 |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
