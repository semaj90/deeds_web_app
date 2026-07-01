# Bitfrost Semantic Cache Audit

Generated: 2026-07-01T21:26:05.595Z
Status: PASS
Redis Container: legal-ai-valkey

## Summary

- gpu:karpathy:scores: 0
- gpu:karpathy:encoded: 0
- bifrost keys: 1130
- centroid keys: 1
- som keys: 62

## Patterns

| Pattern | Count | Sample | TTL samples |
|---|---:|---|---|
| `gpu:karpathy:scores` | 0 | none | none |
| `gpu:karpathy:encoded` | 0 | none | none |
| `bifrost:*` | 1130 | bifrost:sem:feature:turbovec.lib-equator_macro, bifrost:sem:packet:packet:009e1a7df286, bifrost:sem:feature:simd-bridge.lstm_gpu, bifrost:sem:feature:sveltekit-frontend.0010-mcp-tool-atlas-suggest-files-atlas-suggest-files, bifrost:sem:packet:packet:0057df284547 | bifrost:sem:feature:turbovec.lib-equator_macro:16740, bifrost:sem:packet:packet:009e1a7df286:16217, bifrost:sem:feature:simd-bridge.lstm_gpu:16219, bifrost:sem:feature:sveltekit-frontend.0010-mcp-tool-atlas-suggest-files-atlas-suggest-files:16699, bifrost:sem:packet:packet:0057df284547:16123 |
| `centroid:*` | 1 | centroid:0 | centroid:0:-1 |
| `som:*` | 62 | som:14, som:60, som:27, som:96, som:46 | som:14:-1, som:60:-1, som:27:-1, som:96:-1, som:46:-1 |
| `bifrost:sem:packet:*` | 614 | bifrost:sem:packet:packet:009e1a7df286, bifrost:sem:packet:packet:0057df284547, bifrost:sem:packet:packet:004719ec513f, bifrost:sem:packet:packet:02359269ec4c, bifrost:sem:packet:packet:021fa5c13fbd | bifrost:sem:packet:packet:009e1a7df286:16212, bifrost:sem:packet:packet:0057df284547:16119, bifrost:sem:packet:packet:004719ec513f:16092, bifrost:sem:packet:packet:02359269ec4c:16661, bifrost:sem:packet:packet:021fa5c13fbd:16628 |
| `bifrost:sem:feature:*` | 516 | bifrost:sem:feature:turbovec.lib-equator_macro, bifrost:sem:feature:simd-bridge.lstm_gpu, bifrost:sem:feature:sveltekit-frontend.0010-mcp-tool-atlas-suggest-files-atlas-suggest-files, bifrost:sem:feature:docs.todO_pt2_5526, bifrost:sem:feature:get_proper_metadata_retrieval_packetreader_wired_up_test_615 | bifrost:sem:feature:turbovec.lib-equator_macro:16734, bifrost:sem:feature:simd-bridge.lstm_gpu:16213, bifrost:sem:feature:sveltekit-frontend.0010-mcp-tool-atlas-suggest-files-atlas-suggest-files:16693, bifrost:sem:feature:docs.todO_pt2_5526:16283, bifrost:sem:feature:get_proper_metadata_retrieval_packetreader_wired_up_test_615:16060 |
| `bifrost:sem:intent:*` | 0 | none | none |
| `reward:zset` | 0 | none | none |
| `ace:context:*` | 26 | ace:context:packet:0011712c94d1, ace:context:packet:000db15dc8ef, ace:context:packet:000fde9311af, ace:context:packet:000f704e5207, ace:context:packet:0009a56456fc | ace:context:packet:0011712c94d1:3428, ace:context:packet:000db15dc8ef:3415, ace:context:packet:000fde9311af:3423, ace:context:packet:000f704e5207:3421, ace:context:packet:0009a56456fc:3410 |
| `ace:summary:*` | 109 | ace:summary:packet:0011712c94d1, ace:summary:summary:f73d0fc78141b854, ace:summary:summary:d7544be729eb4686, ace:summary:summary:98c80633d64e86c4, ace:summary:summary:28c92795954008de | ace:summary:packet:0011712c94d1:3426, ace:summary:summary:f73d0fc78141b854:422680, ace:summary:summary:d7544be729eb4686:422682, ace:summary:summary:98c80633d64e86c4:421791, ace:summary:summary:28c92795954008de:421785 |
| `ace:feature:*` | 25 | ace:feature:sveltekit-frontend.tests__routes__auto__api__cache__metrics.test, ace:feature:crates.libryu-555024bdb0a51304, ace:feature:.python311.bq300-8rv, ace:feature:llama-cpp-turboquant-gemma4.completion, ace:feature:sveltekit-frontend.llm_synthesis_mapping | ace:feature:sveltekit-frontend.tests__routes__auto__api__cache__metrics.test:3395, ace:feature:crates.libryu-555024bdb0a51304:3415, ace:feature:.python311.bq300-8rv:3418, ace:feature:llama-cpp-turboquant-gemma4.completion:3403, ace:feature:sveltekit-frontend.llm_synthesis_mapping:3389 |
| `ace:query:*` | 0 | none | none |
| `ace:tree:*` | 0 | none | none |
| `ace:authority:*` | 0 | none | none |
| `ace:ontology:*` | 0 | none | none |
| `ace:memory:*` | 0 | none | none |

## Next Safe Action

Use the warm planner to refresh the hot Bitfrost families from canonical Postgres rows.
