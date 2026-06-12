# Deep Import Graph - Phase A
Generated: 2026-06-12T01:25:02.039Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 23493 |
| Total edges | 37054 |
| Resolved edges | 5165 |
| Unresolved (local) | 3025 |
| External refs | 28549 |
| Neighborhoods computed | 100 |
| Test-covered files | 896 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 16898 |
| script | 5128 |
| test | 1237 |
| types | 210 |
| config | 20 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 27559 |
| test_covers_file | 3934 |
| redis_dependency | 1608 |
| imports_dynamic | 1219 |
| qdrant_dependency | 879 |
| exports_from | 505 |
| neo4j_dependency | 405 |
| mcp_tool_calls | 357 |
| env_dependency | 356 |
| db_dependency | 231 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `scripts/atlas/_atlas-utils.mjs` | script | 88 | 0 |
| 3 | `scripts/atlas/_atlas-utils.mjs` | script | 88 | 0 |
| 4 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 5 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 77 | 5 |
| 6 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 7 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 42 | 2 |
| 8 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 39 | 0 |
| 9 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
| 10 | `scripts/atlas/_neschrom-paths.mjs` | script | 36 | 0 |
| 11 | `scripts/atlas/_neschrom-paths.mjs` | script | 36 | 0 |
| 12 | `scripts/atlas/connection-config.mjs` | script | 35 | 0 |
| 13 | `scripts/atlas/connection-config.mjs` | script | 35 | 0 |
| 14 | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | shared | 28 | 4 |
| 15 | `sveltekit-frontend/tests/e2e/route-forensic/_helpers.ts` | shared | 27 | 1 |
| 16 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 17 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 18 | `claude-mem/src/services/worker-types.ts` | types | 22 | 1 |
| 19 | `sveltekit-frontend/.docker-build/scripts/qdrant-client.mjs` | shared | 22 | 0 |
| 20 | `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts` | shared | 22 | 9 |
