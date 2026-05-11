# Deep Import Graph - Phase A
Generated: 2026-05-11T05:19:04.682Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 3874 |
| Total edges | 12682 |
| Resolved edges | 7440 |
| Unresolved (local) | 821 |
| External refs | 4236 |
| Neighborhoods computed | 100 |
| Test-covered files | 697 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1119 |
| client | 982 |
| test | 922 |
| server | 726 |
| types | 125 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 5804 |
| test_covers_file | 2637 |
| server_route_depends_on | 1067 |
| db_dependency | 956 |
| env_dependency | 660 |
| imports_dynamic | 504 |
| redis_dependency | 409 |
| exports_from | 285 |
| qdrant_dependency | 167 |
| mcp_tool_calls | 112 |
| neo4j_dependency | 80 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 519 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 459 | 0 |
| 3 | `src/lib/server/redis.ts` | server | 262 | 1 |
| 4 | `src/lib/components/ui/Icon.svelte` | client | 257 | 14 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 212 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 182 | 11 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 111 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 97 | 10 |
| 9 | `src/lib/server/grpc/embedding-client.ts` | server | 95 | 7 |
| 10 | `src/lib/server/validation.ts` | server | 95 | 0 |
| 11 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 78 | 9 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 46 | 1 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 46 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 7 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/ace/context-assembler.ts` | server | 32 | 36 |
| 18 | `src/lib/server/neo4j-driver.ts` | server | 32 | 1 |
| 19 | `src/lib/ai/model-ids.ts` | client | 30 | 0 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
