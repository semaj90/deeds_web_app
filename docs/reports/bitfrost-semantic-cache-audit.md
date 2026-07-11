# Bitfrost Semantic Cache Audit

Generated: 2026-07-11T01:19:30.114Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 50
- centroid keys: 0
- som keys: 0

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 50 | bifrost:sem:feature:.tmp.0056213574662f41, bifrost:sem:packet:packet:0003dda5e534, bifrost:sem:packet:packet:000db15dc8ef, bifrost:sem:packet:packet:0003260092b1, bifrost:sem:feature:simd-bridge.LLMS | bifrost:sem:feature:.tmp.0056213574662f41:84463, bifrost:sem:packet:packet:0003dda5e534:84450, bifrost:sem:packet:packet:000db15dc8ef:84471, bifrost:sem:packet:packet:0003260092b1:84443, bifrost:sem:feature:simd-bridge.LLMS:84479 |
| `centroid:*` | 0 | none | none |
| `som:*` | 0 | none | none |
| `bifrost:sem:packet:*` | 25 | bifrost:sem:packet:packet:0003dda5e534, bifrost:sem:packet:packet:000db15dc8ef, bifrost:sem:packet:packet:0003260092b1, bifrost:sem:packet:packet:0008d535a1f6, bifrost:sem:packet:packet:001375b841d0 | bifrost:sem:packet:packet:0003dda5e534:84449, bifrost:sem:packet:packet:000db15dc8ef:84471, bifrost:sem:packet:packet:0003260092b1:84442, bifrost:sem:packet:packet:0008d535a1f6:84459, bifrost:sem:packet:packet:001375b841d0:84493 |
| `bifrost:sem:feature:*` | 25 | bifrost:sem:feature:.tmp.0056213574662f41, bifrost:sem:feature:simd-bridge.LLMS, bifrost:sem:feature:sveltekit-frontend.startup-2026-05-13T00-19-01-475Z, bifrost:sem:feature:scripts.generate-concept-temperature-report, bifrost:sem:feature:sveltekit-frontend.phase76-acp-tools.property.test | bifrost:sem:feature:.tmp.0056213574662f41:84461, bifrost:sem:feature:simd-bridge.LLMS:84477, bifrost:sem:feature:sveltekit-frontend.startup-2026-05-13T00-19-01-475Z:84465, bifrost:sem:feature:scripts.generate-concept-temperature-report:84484, bifrost:sem:feature:sveltekit-frontend.phase76-acp-tools.property.test:84467 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 25 | ace:context:packet:000f704e5207, ace:context:packet:0014d8ac7795, ace:context:packet:0004b466d863, ace:context:packet:000f10a13a57, ace:context:packet:001375b841d0 | ace:context:packet:000f704e5207:1679, ace:context:packet:0014d8ac7795:1695, ace:context:packet:0004b466d863:1650, ace:context:packet:000f10a13a57:1674, ace:context:packet:001375b841d0:1692 |
| `ace:summary:*` | 25 | ace:summary:packet:0011712c94d1, ace:summary:packet:000b2df0cfdf, ace:summary:packet:0006ca4a45e3, ace:summary:packet:000e4d5a58e7, ace:summary:packet:0009951ee430 | ace:summary:packet:0011712c94d1:1688, ace:summary:packet:000b2df0cfdf:1668, ace:summary:packet:0006ca4a45e3:1656, ace:summary:packet:000e4d5a58e7:1672, ace:summary:packet:0009951ee430:1661 |
| `ace:feature:*` | 25 | ace:feature:neschrom97.93f973562fff24ed, ace:feature:sveltekit-frontend.tests__routes__auto__api__cache__metrics.test, ace:feature:sveltekit-frontend.src__routes__api__cases___id___persons___server, ace:feature:sveltekit-frontend.+server, ace:feature:sveltekit-frontend.tests__routes__auto__api__cases____id__connections.test | ace:feature:neschrom97.93f973562fff24ed:1647, ace:feature:sveltekit-frontend.tests__routes__auto__api__cache__metrics.test:1644, ace:feature:sveltekit-frontend.src__routes__api__cases___id___persons___server:1694, ace:feature:sveltekit-frontend.+server:1680, ace:feature:sveltekit-frontend.tests__routes__auto__api__cases____id__connections.test:1691 |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
