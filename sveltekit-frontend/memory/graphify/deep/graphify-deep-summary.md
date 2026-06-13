# Deep Import Graph - Phase A
Generated: 2026-06-13T06:50:25.319Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 23731 |
| Total edges | 37761 |
| Resolved edges | 5232 |
| Unresolved (local) | 3027 |
| External refs | 29187 |
| Neighborhoods computed | 100 |
| Test-covered files | 896 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 16979 |
| script | 5279 |
| test | 1238 |
| types | 215 |
| config | 20 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 28139 |
| test_covers_file | 3937 |
| redis_dependency | 1649 |
| imports_dynamic | 1234 |
| qdrant_dependency | 917 |
| exports_from | 507 |
| neo4j_dependency | 426 |
| mcp_tool_calls | 363 |
| env_dependency | 357 |
| db_dependency | 231 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `scripts/atlas/_atlas-utils.mjs` | script | 98 | 0 |
| 3 | `scripts/atlas/_atlas-utils.mjs` | script | 98 | 0 |
| 4 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 5 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 77 | 5 |
| 6 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 7 | `scripts/atlas/connection-config.mjs` | script | 47 | 0 |
| 8 | `scripts/atlas/connection-config.mjs` | script | 47 | 0 |
| 9 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 42 | 2 |
| 10 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 40 | 0 |
| 11 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
| 12 | `scripts/atlas/_neschrom-paths.mjs` | script | 36 | 0 |
| 13 | `scripts/atlas/_neschrom-paths.mjs` | script | 36 | 0 |
| 14 | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | shared | 28 | 5 |
| 15 | `sveltekit-frontend/tests/e2e/route-forensic/_helpers.ts` | shared | 27 | 1 |
| 16 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 17 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 18 | `claude-mem/src/services/worker-types.ts` | types | 22 | 1 |
| 19 | `sveltekit-frontend/.docker-build/scripts/qdrant-client.mjs` | shared | 22 | 0 |
| 20 | `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts` | shared | 22 | 9 |
