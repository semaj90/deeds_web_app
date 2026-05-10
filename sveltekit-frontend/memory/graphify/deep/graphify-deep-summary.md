# Deep Import Graph - Phase A
Generated: 2026-05-10T02:51:27.539Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 3729 |
| Total edges | 12208 |
| Resolved edges | 7197 |
| Unresolved (local) | 783 |
| External refs | 4045 |
| Neighborhoods computed | 100 |
| Test-covered files | 681 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1093 |
| client | 979 |
| test | 867 |
| server | 667 |
| types | 123 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 5622 |
| test_covers_file | 2509 |
| server_route_depends_on | 1033 |
| db_dependency | 913 |
| env_dependency | 623 |
| imports_dynamic | 492 |
| redis_dependency | 389 |
| exports_from | 276 |
| qdrant_dependency | 160 |
| mcp_tool_calls | 111 |
| neo4j_dependency | 80 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 496 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 424 | 0 |
| 3 | `src/lib/components/ui/Icon.svelte` | client | 254 | 14 |
| 4 | `src/lib/server/redis.ts` | server | 249 | 1 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 195 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 173 | 11 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 112 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 101 | 10 |
| 9 | `src/lib/server/validation.ts` | server | 93 | 0 |
| 10 | `src/lib/server/grpc/embedding-client.ts` | server | 90 | 7 |
| 11 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 73 | 9 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 45 | 1 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 45 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 7 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/ace/context-assembler.ts` | server | 32 | 37 |
| 18 | `src/lib/server/neo4j-driver.ts` | server | 32 | 1 |
| 19 | `src/lib/ai/model-ids.ts` | client | 30 | 0 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
