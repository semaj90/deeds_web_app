# Deep Import Graph - Phase A
Generated: 2026-05-10T18:18:40.202Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 3766 |
| Total edges | 12318 |
| Resolved edges | 7240 |
| Unresolved (local) | 791 |
| External refs | 4104 |
| Neighborhoods computed | 100 |
| Test-covered files | 681 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| route | 1133 |
| client | 950 |
| test | 873 |
| server | 686 |
| types | 124 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 5687 |
| test_covers_file | 2515 |
| server_route_depends_on | 1037 |
| db_dependency | 921 |
| env_dependency | 632 |
| imports_dynamic | 495 |
| redis_dependency | 399 |
| exports_from | 276 |
| qdrant_dependency | 164 |
| mcp_tool_calls | 111 |
| neo4j_dependency | 80 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `src/lib/server/db/client.ts` | server | 500 | 7 |
| 2 | `src/lib/server/env.server.ts` | server | 433 | 0 |
| 3 | `src/lib/server/redis.ts` | server | 256 | 1 |
| 4 | `src/lib/components/ui/Icon.svelte` | client | 255 | 14 |
| 5 | `src/lib/server/db/schema-postgres.ts` | server | 201 | 2 |
| 6 | `src/lib/server/ollama.ts` | server | 176 | 11 |
| 7 | `src/lib/server/middleware/cache-headers.ts` | server | 112 | 1 |
| 8 | `src/lib/server/db/schema.ts` | server | 99 | 10 |
| 9 | `src/lib/server/validation.ts` | server | 93 | 0 |
| 10 | `src/lib/server/grpc/embedding-client.ts` | server | 91 | 7 |
| 11 | `src/lib/components/ui/Button.svelte` | client | 89 | 0 |
| 12 | `src/lib/server/vector/qdrant-manager.ts` | server | 75 | 9 |
| 13 | `src/lib/server/gpu/libtorch-bridge.ts` | server | 46 | 1 |
| 14 | `src/lib/server/observability/langfuse.ts` | server | 45 | 2 |
| 15 | `src/lib/server/analytics/search-analytics.ts` | server | 41 | 7 |
| 16 | `src/lib/server/gpu/simdjson-bridge.ts` | server | 37 | 0 |
| 17 | `src/lib/server/ace/context-assembler.ts` | server | 32 | 36 |
| 18 | `src/lib/server/neo4j-driver.ts` | server | 32 | 1 |
| 19 | `src/lib/ai/model-ids.ts` | client | 30 | 0 |
| 20 | `src/lib/server/ai/code-intel-service.ts` | server | 29 | 12 |
