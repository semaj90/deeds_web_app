# Deep Import Graph - Phase A
Generated: 2026-06-10T02:00:47.205Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 23216 |
| Total edges | 36467 |
| Resolved edges | 5191 |
| Unresolved (local) | 3032 |
| External refs | 27929 |
| Neighborhoods computed | 100 |
| Test-covered files | 900 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 16718 |
| script | 4987 |
| test | 1240 |
| types | 209 |
| server | 29 |
| config | 20 |
| route | 9 |
| client | 4 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 27040 |
| test_covers_file | 3940 |
| redis_dependency | 1615 |
| imports_dynamic | 1218 |
| qdrant_dependency | 828 |
| exports_from | 501 |
| neo4j_dependency | 375 |
| mcp_tool_calls | 358 |
| env_dependency | 357 |
| db_dependency | 234 |
| svelte_route_uses_loader | 1 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `scripts/atlas/_atlas-utils.mjs` | script | 82 | 0 |
| 3 | `scripts/atlas/_atlas-utils.mjs` | script | 82 | 0 |
| 4 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 5 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 77 | 5 |
| 6 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 7 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 42 | 2 |
| 8 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 40 | 0 |
| 9 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 10 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
| 11 | `scripts/atlas/_neschrom-paths.mjs` | script | 34 | 0 |
| 12 | `scripts/atlas/_neschrom-paths.mjs` | script | 34 | 0 |
| 13 | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | shared | 28 | 4 |
| 14 | `sveltekit-frontend/tests/e2e/route-forensic/_helpers.ts` | shared | 27 | 1 |
| 15 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 16 | `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts` | shared | 24 | 9 |
| 17 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 18 | `claude-mem/src/services/worker-types.ts` | types | 22 | 1 |
| 19 | `sveltekit-frontend/.docker-build/scripts/qdrant-client.mjs` | shared | 22 | 0 |
| 20 | `claude-mem/src/services/sqlite/SessionStore.ts` | shared | 21 | 8 |
