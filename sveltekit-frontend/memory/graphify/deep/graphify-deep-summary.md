# Deep Import Graph - Phase A
Generated: 2026-05-13T21:46:53.291Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 4970 |
| Total edges | 15950 |
| Resolved edges | 8290 |
| Unresolved (local) | 1041 |
| External refs | 6386 |
| Neighborhoods computed | 100 |
| Test-covered files | 774 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1171 |
| test | 1010 |
| client | 933 |
| script | 905 |
| server | 822 |
| types | 129 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 8094 |
| test_covers_file | 2841 |
| server_route_depends_on | 1098 |
| db_dependency | 1061 |
| env_dependency | 739 |
| imports_dynamic | 636 |
| redis_dependency | 598 |
| exports_from | 290 |
| qdrant_dependency | 273 |
| mcp_tool_calls | 183 |
| neo4j_dependency | 136 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 557 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 485 | 0 |
| 3 | `src/lib/server/redis.ts` | server | 300 | 1 |
| 4 | `src/lib/components/ui/Icon.svelte` | client | 257 | 14 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 226 | 1 |
| 6 | `src/lib/server/ollama.ts` | server | 188 | 12 |
| 7 | `src/lib/types.ts` | types | 180 | 0 |
| 8 | `src/lib/server/middleware/cache-headers.ts` | server | 110 | 0 |
| 9 | `src/lib/server/db/schema.ts` | server | 104 | 10 |
| 10 | `src/lib/server/grpc/embedding-client.ts` | server | 101 | 7 |
| 11 | `src/lib/server/validation.ts` | server | 95 | 0 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 94 | 10 |
| 13 | `src/lib/components/ui/Button.svelte` | client | 88 | 0 |
| 14 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 51 | 2 |
| 15 | `src/lib/server/observability/langfuse.ts` | server | 48 | 1 |
| 16 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 7 |
| 17 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 38 | 0 |
| 18 | `src/lib/server/neo4j-driver.ts` | server | 38 | 1 |
| 19 | `src/lib/server/ace/context-assembler.ts` | server | 33 | 36 |
| 20 | `src/lib/ai/model-ids.ts` | client | 31 | 1 |
