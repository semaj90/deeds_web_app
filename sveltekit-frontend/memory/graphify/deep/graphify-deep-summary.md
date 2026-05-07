# Deep Import Graph - Phase A
Generated: 2026-05-07T17:03:34.397Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 3652 |
| Total edges | 11890 |
| Resolved edges | 7012 |
| Unresolved (local) | 766 |
| External refs | 3919 |
| Neighborhoods computed | 100 |
| Test-covered files | 681 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1070 |
| client | 956 |
| test | 862 |
| server | 643 |
| types | 121 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 5495 |
| test_covers_file | 2500 |
| server_route_depends_on | 1015 |
| db_dependency | 890 |
| env_dependency | 543 |
| imports_dynamic | 491 |
| redis_dependency | 383 |
| exports_from | 276 |
| qdrant_dependency | 161 |
| neo4j_dependency | 80 |
| mcp_tool_calls | 56 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 489 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 336 | 0 |
| 3 | `src/lib/components/ui/Icon.svelte` | client | 253 | 14 |
| 4 | `src/lib/server/redis.ts` | server | 247 | 1 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 193 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 171 | 11 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 112 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 97 | 10 |
| 9 | `src/lib/server/validation.ts` | server | 93 | 0 |
| 10 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 11 | `src/lib/server/grpc/embedding-client.ts` | server | 89 | 7 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 73 | 9 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 45 | 1 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 45 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 6 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/neo4j-driver.ts` | server | 32 | 0 |
| 18 | `src/lib/server/ace/context-assembler.ts` | server | 31 | 37 |
| 19 | `src/lib/ai/model-ids.ts` | client | 30 | 0 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
