# Deep Import Graph - Phase A
Generated: 2026-06-10T17:22:44.745Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 23250 |
| Total edges | 36583 |
| Resolved edges | 5202 |
| Unresolved (local) | 3031 |
| External refs | 28035 |
| Neighborhoods computed | 100 |
| Test-covered files | 898 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 16727 |
| script | 5013 |
| test | 1238 |
| types | 210 |
| server | 29 |
| config | 20 |
| route | 9 |
| client | 4 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 27146 |
| test_covers_file | 3936 |
| redis_dependency | 1612 |
| imports_dynamic | 1204 |
| qdrant_dependency | 848 |
| exports_from | 508 |
| neo4j_dependency | 380 |
| mcp_tool_calls | 358 |
| env_dependency | 356 |
| db_dependency | 234 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `scripts/atlas/_atlas-utils.mjs` | script | 84 | 0 |
| 3 | `scripts/atlas/_atlas-utils.mjs` | script | 84 | 0 |
| 4 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 5 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 77 | 5 |
| 6 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 7 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 42 | 2 |
| 8 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 39 | 0 |
| 9 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 10 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
| 11 | `scripts/atlas/_neschrom-paths.mjs` | script | 34 | 0 |
| 12 | `scripts/atlas/_neschrom-paths.mjs` | script | 34 | 0 |
| 13 | `scripts/atlas/connection-config.mjs` | script | 28 | 0 |
| 14 | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | shared | 28 | 4 |
| 15 | `scripts/atlas/connection-config.mjs` | script | 28 | 0 |
| 16 | `sveltekit-frontend/tests/e2e/route-forensic/_helpers.ts` | shared | 27 | 1 |
| 17 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 18 | `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts` | shared | 24 | 9 |
| 19 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 20 | `claude-mem/src/services/worker-types.ts` | types | 22 | 1 |
