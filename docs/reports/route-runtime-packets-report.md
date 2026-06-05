# Route Runtime Packets Report

Generated: 2026-06-05T02:49:14.695Z

## Summary

- Total packets: 26
- Last 24h: 26
- Cache hit rate: 96.2%
- Average Qdrant hits: 7.69
- Average latency ms: 4553.58
- Empty sourceRefs: 3
- Empty featureIds: 3
- Missing SOM/cluster: 25
- Low context density rows: 25
- Redis LOD0 found: 21/25

## Top SourceRefs

| source_ref | hits |
| --- | --- |
| sveltekit-frontend/unknown | 44 |
| sveltekit-frontend/scripts/ace/ask-gemma4.mjs | 5 |
| sveltekit-frontend/scripts/ace/export-transition-memory.mjs | 4 |
| sveltekit-frontend/scripts/ace/persist-authority-test.mjs | 4 |
| sveltekit-frontend/scripts/activity/log-developer-activity.mjs | 3 |
| sveltekit-frontend/src/hooks.server.ts | 3 |
| sveltekit-frontend/scripts/agent-diagnose.mjs | 2 |
| sveltekit-frontend/src/mcp-gpu-orchestrator.ts | 2 |
| sveltekit-frontend/src/app.d.ts | 1 |
| sveltekit-frontend/src/app.postcss | 1 |
| sveltekit-frontend/src/global.d.ts | 1 |
| sveltekit-frontend/.venv/Lib/python3.9/site-packages/pip/_internal/cache.py | 1 |
| sveltekit-frontend/.venv/Lib/python3.9/site-packages/pip/_internal/network/cache.py | 1 |

## Top Features

| feature_id | hits |
| --- | --- |
| shims | 65 |
| sveltekit-frontend | 7 |

## Top Redis Hot Keys

| redis_hot_key | hits |
| --- | --- |
| ace:cartridge:1:0624747c04372106 | 1 |
| ace:cartridge:1:06a30620527e665c | 1 |
| ace:cartridge:1:08ba6178c85b4d4e | 1 |
| ace:cartridge:1:10d5bad8c16deef2 | 1 |
| ace:cartridge:1:1de90d1187831008 | 1 |
| ace:cartridge:1:212c57e6f8ee6ded | 1 |
| ace:cartridge:1:3317047aa8d6fc14 | 1 |
| ace:cartridge:1:473463c5ae07ef36 | 1 |
| ace:cartridge:1:4c540e79290dd050 | 1 |
| ace:cartridge:1:4fbcd1c84abb1fd1 | 1 |
| ace:cartridge:1:546d8a871b1d0d33 | 1 |
| ace:cartridge:1:58d593fe9bc6afac | 1 |
| ace:cartridge:1:6071579337a8a887 | 1 |
| ace:cartridge:1:6a058b76b6d7100c | 1 |
| ace:cartridge:1:7e176c63a90af338 | 1 |
| ace:cartridge:1:822427c785c77753 | 1 |
| ace:cartridge:1:951e299640687e1d | 1 |
| ace:cartridge:1:97ab22166562ffbb | 1 |
| ace:cartridge:1:9ee5e54952770744 | 1 |
| ace:cartridge:1:a3383a3ada83d202 | 1 |
| ace:cartridge:1:a83063dc47fe049c | 1 |
| ace:cartridge:1:ba92e263a5793bed | 1 |
| ace:cartridge:1:d81bd490cc466dcb | 1 |
| ace:cartridge:1:ebc8cdd4145caacf | 1 |
| ace:cartridge:1:ff7501a879fa62d5 | 1 |

## Top SOM Clusters

| som_cluster | hits |
| --- | --- |
| missing | 25 |
| som:1 | 1 |

## Cache Tiers

| cache_tier | hits |
| --- | --- |
| redis | 25 |
| miss | 1 |

## Recent Low-Density Packets

| id | query_preview | source_ref_count | qdrant_hits | cache_tier |
| --- | --- | --- | --- | --- |
| 26 | context-assembler 1780627691691 | 2 | 8 | redis |
| 25 | context-assembler 1780627522904 | 1 | 8 | redis |
| 24 | context-assembler 1780627208808 | 4 | 8 | redis |
| 23 | context-assembler 1780626713928 | 4 | 8 | redis |
| 22 | context-assembler 1780626587903 | 1 | 8 | redis |
| 21 | context-assembler 1780626549728 | 2 | 8 | redis |
| 20 | context-assembler 1780626444076 | 3 | 8 | redis |
| 19 | context-assembler 1780626324763 | 2 | 8 | redis |
| 18 | auth middleware client-side caching 1780626308994 | 3 | 8 | redis |
| 17 | context-assembler 1780626253642 | 4 | 8 | redis |
| 16 | auth middleware client-side caching 1780626161024 | 0 | 8 | redis |
| 15 | context-assembler 1780625767352 | 1 | 8 | redis |
| 14 | auth middleware client-side caching 1780625767349 | 5 | 8 | redis |
| 13 | context-assembler 1780625721200 | 1 | 8 | redis |
| 12 | auth middleware client-side caching 1780625720467 | 5 | 8 | redis |
| 11 | context-assembler 1780625680593 | 5 | 8 | redis |
| 10 | auth middleware client-side caching 1780625680598 | 5 | 8 | redis |
| 9 | context-assembler 1780620702065 | 5 | 8 | redis |
| 8 | context-assembler 1780620634544 | 1 | 8 | redis |
| 7 | auth middleware client-side caching 1780620581894 | 5 | 8 | redis |
| 6 | auth middleware client-side caching 1780620540680 | 5 | 8 | redis |
| 5 | auth middleware client-side caching 1780619549033 | 5 | 8 | redis |
| 4 | auth middleware client-side caching 1780619455405 | 0 | 8 | redis |
| 3 | auth middleware client-side caching 1780619361378 | 1 | 8 | redis |
| 2 | auth middleware client-side caching 1780619337444 | 2 | 8 | redis |


## Notes

- `route_runtime_packets` is JSONB audit telemetry. It is not a GPU/matmul lane.
- Redis `ace:telemetry:{packet_id}:lod0` is the compact replay packet checked here.
- Neo4j traversal depth is not stored directly in `route_runtime_packets`; use replay smoke for traversal proof or add a later derived replay report.