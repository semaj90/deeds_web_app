# Bitfrost Semantic Cache Audit

Generated: 2026-07-04T00:58:25.706Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 12430
- centroid keys: 8
- som keys: 62

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 12430 | bifrost:packet:packet:7ea52133cd5c, bifrost:feature:vscode-extension.claudePlan, bifrost:packet:packet:a8bb7fcc6a81, bifrost:feature:.svelte-error-fixes-backup.StatsCard, bifrost:feature:docs.howtogetaround_gitignore_524_26 | bifrost:packet:packet:7ea52133cd5c:602663, bifrost:feature:vscode-extension.claudePlan:602664, bifrost:packet:packet:a8bb7fcc6a81:602663, bifrost:feature:.svelte-error-fixes-backup.StatsCard:602663, bifrost:feature:docs.howtogetaround_gitignore_524_26:602663 |
| `centroid:*` | 8 | centroid:0, centroid:RetrievalAugmentedGeneration (RAG) / AI Infrastructure:Modular Service Layer, centroid:Retrieval and Inference System:Module Integration, centroid:Codebase Analysis:Basic Code Metrics, centroid:Retrieval-Augmented Generation (RAG) System:Modular Service Components | centroid:0:-1, centroid:RetrievalAugmentedGeneration (RAG) / AI Infrastructure:Modular Service Layer:441684, centroid:Retrieval and Inference System:Module Integration:440798, centroid:Codebase Analysis:Basic Code Metrics:423158, centroid:Retrieval-Augmented Generation (RAG) System:Modular Service Components:440433 |
| `som:*` | 62 | som:7, som:33, som:81, som:0, som:30 | som:7:-1, som:33:-1, som:81:-1, som:0:-1, som:30:-1 |
| `bifrost:sem:packet:*` | 26 | bifrost:sem:packet:packet:0003260092b1, bifrost:sem:packet:packet:000f10a13a57, bifrost:sem:packet:packet:0009951ee430, bifrost:sem:packet:packet:0004b466d863, bifrost:sem:packet:packet:0011712c94d1 | bifrost:sem:packet:packet:0003260092b1:66543, bifrost:sem:packet:packet:000f10a13a57:66561, bifrost:sem:packet:packet:0009951ee430:66553, bifrost:sem:packet:packet:0004b466d863:66548, bifrost:sem:packet:packet:0011712c94d1:66567 |
| `bifrost:sem:feature:*` | 28 | bifrost:sem:feature:sveltekit-frontend.tests__routes__auto__api__cache__metrics.test, bifrost:sem:feature:sveltekit-frontend.embedded-summaries, bifrost:sem:feature:.svelte-error-fixes-backup.+layout, bifrost:sem:feature:.tmp.0056213574662f41, bifrost:sem:feature:sveltekit-frontend.tests__cases-sub-routes.spec | bifrost:sem:feature:sveltekit-frontend.tests__routes__auto__api__cache__metrics.test:66543, bifrost:sem:feature:sveltekit-frontend.embedded-summaries:423071, bifrost:sem:feature:.svelte-error-fixes-backup.+layout:66546, bifrost:sem:feature:.tmp.0056213574662f41:66551, bifrost:sem:feature:sveltekit-frontend.tests__cases-sub-routes.spec:66541 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 1 | ace:context:docs/+server.ts:4c62f7025d50f175 | ace:context:docs/+server.ts:4c62f7025d50f175:170357 |
| `ace:summary:*` | 84 | ace:summary:summary:d2681a65833461a1, ace:summary:summary:8bc7f1b3588ce909, ace:summary:summary:257fd374023543ec, ace:summary:summary:896f4cb249d009c8, ace:summary:summary:36a88ce7b865dbfe | ace:summary:summary:d2681a65833461a1:236228, ace:summary:summary:8bc7f1b3588ce909:237148, ace:summary:summary:257fd374023543ec:237135, ace:summary:summary:896f4cb249d009c8:236244, ace:summary:summary:36a88ce7b865dbfe:235647 |
| `ace:feature:*` | 0 | none | none |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
