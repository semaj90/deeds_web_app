# Deep Import Graph - Phase A
Generated: 2026-05-07T04:00:08.174Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 3616 |
| Total edges | 11735 |
| Resolved edges | 6916 |
| Unresolved (local) | 756 |
| External refs | 3870 |
| Neighborhoods computed | 100 |
| Test-covered files | 670 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1063 |
| client | 956 |
| test | 845 |
| server | 632 |
| types | 120 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 5455 |
| test_covers_file | 2426 |
| server_route_depends_on | 1006 |
| db_dependency | 885 |
| env_dependency | 543 |
| imports_dynamic | 487 |
| redis_dependency | 373 |
| exports_from | 276 |
| qdrant_dependency | 159 |
| neo4j_dependency | 75 |
| mcp_tool_calls | 50 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 485 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 336 | 0 |
| 3 | `src/lib/components/ui/Icon.svelte` | client | 252 | 14 |
| 4 | `src/lib/server/redis.ts` | server | 240 | 1 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 192 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 171 | 11 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 112 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 97 | 10 |
| 9 | `src/lib/server/validation.ts` | server | 93 | 0 |
| 10 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 11 | `src/lib/server/grpc/embedding-client.ts` | server | 89 | 7 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 73 | 9 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 45 | 1 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 45 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 39 | 4 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/neo4j-driver.ts` | server | 32 | 0 |
| 18 | `src/lib/ai/model-ids.ts` | client | 30 | 0 |
| 19 | `src/lib/server/ace/context-assembler.ts` | server | 30 | 37 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
