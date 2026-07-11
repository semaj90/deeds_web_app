# Bitfrost Semantic Cache Audit

Generated: 2026-07-11T07:16:08.202Z
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
| `bifrost:*` | 50 | bifrost:sem:packet:packet:000e4d5a58e7, bifrost:sem:packet:packet:0003ab694534, bifrost:sem:feature:.python311.bq300-8rv, bifrost:sem:packet:packet:0003850e84ca, bifrost:sem:packet:packet:0006ca4a45e3 | bifrost:sem:packet:packet:000e4d5a58e7:63076, bifrost:sem:packet:packet:0003ab694534:63049, bifrost:sem:feature:.python311.bq300-8rv:63083, bifrost:sem:packet:packet:0003850e84ca:63047, bifrost:sem:packet:packet:0006ca4a45e3:63059 |
| `centroid:*` | 0 | none | none |
| `som:*` | 0 | none | none |
| `bifrost:sem:packet:*` | 25 | bifrost:sem:packet:packet:000e4d5a58e7, bifrost:sem:packet:packet:0003ab694534, bifrost:sem:packet:packet:0003850e84ca, bifrost:sem:packet:packet:0006ca4a45e3, bifrost:sem:packet:packet:0011712c94d1 | bifrost:sem:packet:packet:000e4d5a58e7:63074, bifrost:sem:packet:packet:0003ab694534:63048, bifrost:sem:packet:packet:0003850e84ca:63045, bifrost:sem:packet:packet:0006ca4a45e3:63058, bifrost:sem:packet:packet:0011712c94d1:63089 |
| `bifrost:sem:feature:*` | 25 | bifrost:sem:feature:.python311.bq300-8rv, bifrost:sem:feature:sveltekit-frontend.+server, bifrost:sem:feature:sveltekit-frontend.sprint5-6-monitoring.spec, bifrost:sem:feature:scripts.generate-concept-temperature-report, bifrost:sem:feature:sveltekit-frontend.launch-2026-06-25T22-12-53-881Z | bifrost:sem:feature:.python311.bq300-8rv:63080, bifrost:sem:feature:sveltekit-frontend.+server:63082, bifrost:sem:feature:sveltekit-frontend.sprint5-6-monitoring.spec:63054, bifrost:sem:feature:scripts.generate-concept-temperature-report:63085, bifrost:sem:feature:sveltekit-frontend.launch-2026-06-25T22-12-53-881Z:63056 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 0 | none | none |
| `ace:summary:*` | 0 | none | none |
| `ace:feature:*` | 0 | none | none |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
