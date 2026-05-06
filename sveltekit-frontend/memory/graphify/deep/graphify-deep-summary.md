# Deep Import Graph - Phase A
Generated: 2026-05-06T23:11:45.918Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 3590 |
| Total edges | 11623 |
| Resolved edges | 6874 |
| Unresolved (local) | 752 |
| External refs | 3804 |
| Neighborhoods computed | 100 |
| Test-covered files | 666 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1061 |
| client | 956 |
| test | 837 |
| server | 617 |
| types | 119 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 5412 |
| test_covers_file | 2389 |
| server_route_depends_on | 1003 |
| db_dependency | 884 |
| env_dependency | 543 |
| imports_dynamic | 476 |
| redis_dependency | 363 |
| exports_from | 275 |
| qdrant_dependency | 157 |
| neo4j_dependency | 72 |
| mcp_tool_calls | 49 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 484 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 336 | 0 |
| 3 | `src/lib/components/ui/Icon.svelte` | client | 252 | 14 |
| 4 | `src/lib/server/redis.ts` | server | 237 | 1 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 192 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 170 | 11 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 112 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 97 | 10 |
| 9 | `src/lib/server/validation.ts` | server | 93 | 0 |
| 10 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 11 | `src/lib/server/grpc/embedding-client.ts` | server | 88 | 7 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 71 | 9 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 45 | 1 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 45 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 39 | 4 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/neo4j-driver.ts` | server | 32 | 0 |
| 18 | `src/lib/ai/model-ids.ts` | client | 30 | 0 |
| 19 | `src/lib/server/ace/context-assembler.ts` | server | 29 | 39 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
