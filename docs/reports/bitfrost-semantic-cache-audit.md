# Bitfrost Semantic Cache Audit

Generated: 2026-07-04T09:48:04.668Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 12430
- centroid keys: 807
- som keys: 62

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 12430 | bifrost:packet:packet:159e0f59c788, bifrost:feature:.tmp.build_config_int4.json.report.json.items.jsonl, bifrost:feature:crates.librustc_hash-b5f66e3f21703a29, bifrost:feature:llm.llm_dependencies, bifrost:packet:packet:fd23e3478cc2 | bifrost:packet:packet:159e0f59c788:570885, bifrost:feature:.tmp.build_config_int4.json.report.json.items.jsonl:570885, bifrost:feature:crates.librustc_hash-b5f66e3f21703a29:570885, bifrost:feature:llm.llm_dependencies:570885, bifrost:packet:packet:fd23e3478cc2:570885 |
| `centroid:*` | 807 | centroid:som:-338, centroid:som:-141, centroid:RetrievalAugmentedGeneration (RAG) / AI Infrastructure:Modular Service Layer, centroid:som:-212, centroid:som:-230 | centroid:som:-338:86101, centroid:som:-141:86096, centroid:RetrievalAugmentedGeneration (RAG) / AI Infrastructure:Modular Service Layer:409906, centroid:som:-212:86098, centroid:som:-230:86098 |
| `som:*` | 62 | som:98, som:3, som:87, som:69, som:37 | som:98:-1, som:3:-1, som:87:-1, som:69:-1, som:37:-1 |
| `bifrost:sem:packet:*` | 26 | bifrost:sem:packet:packet:0014edb0c6e4, bifrost:sem:packet:packet:0003ab694534, bifrost:sem:packet:packet:000db15dc8ef, bifrost:sem:packet:packet:001007058f4a, bifrost:sem:packet:packet:0003260092b1 | bifrost:sem:packet:packet:0014edb0c6e4:85378, bifrost:sem:packet:packet:0003ab694534:85345, bifrost:sem:packet:packet:000db15dc8ef:85360, bifrost:sem:packet:packet:001007058f4a:85370, bifrost:sem:packet:packet:0003260092b1:85341 |
| `bifrost:sem:feature:*` | 28 | bifrost:sem:feature:sveltekit-frontend.hypergraph-4d, bifrost:sem:feature:.tmp.0056213574662f41, bifrost:sem:feature:sveltekit-frontend.llm_synthesis_mapping, bifrost:sem:feature:.svelte-error-fixes-backup.+layout, bifrost:sem:feature:sveltekit-frontend.+server | bifrost:sem:feature:sveltekit-frontend.hypergraph-4d:409900, bifrost:sem:feature:.tmp.0056213574662f41:85352, bifrost:sem:feature:sveltekit-frontend.llm_synthesis_mapping:85339, bifrost:sem:feature:.svelte-error-fixes-backup.+layout:85346, bifrost:sem:feature:sveltekit-frontend.+server:85366 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 26 | ace:context:packet:000db15dc8ef, ace:context:packet:001007058f4a, ace:context:packet:000f10a13a57, ace:context:packet:0011a232d0b8, ace:context:packet:0014edb0c6e4 | ace:context:packet:000db15dc8ef:2552, ace:context:packet:001007058f4a:2562, ace:context:packet:000f10a13a57:2555, ace:context:packet:0011a232d0b8:2564, ace:context:packet:0014edb0c6e4:2569 |
| `ace:summary:*` | 109 | ace:summary:summary:89dd151d353e7c51, ace:summary:summary:04a7f3765ee73323, ace:summary:summary:db0ba7e8f7959ca4, ace:summary:summary:003914849fd74a2e, ace:summary:summary:1b50d504e06e9956 | ace:summary:summary:89dd151d353e7c51:205366, ace:summary:summary:04a7f3765ee73323:204456, ace:summary:summary:db0ba7e8f7959ca4:204447, ace:summary:summary:003914849fd74a2e:205355, ace:summary:summary:1b50d504e06e9956:205362 |
| `ace:feature:*` | 25 | ace:feature:sveltekit-frontend.tests__routes__auto__api__cache__metrics.test, ace:feature:neschrom97.a45aa64da8f0240c, ace:feature:sveltekit-frontend.keyboard-shortcuts.svelte, ace:feature:neschrom97.93f973562fff24ed, ace:feature:.svelte-error-fixes-backup.+layout | ace:feature:sveltekit-frontend.tests__routes__auto__api__cache__metrics.test:2532, ace:feature:neschrom97.a45aa64da8f0240c:2564, ace:feature:sveltekit-frontend.keyboard-shortcuts.svelte:2546, ace:feature:neschrom97.93f973562fff24ed:2533, ace:feature:.svelte-error-fixes-backup.+layout:2534 |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
