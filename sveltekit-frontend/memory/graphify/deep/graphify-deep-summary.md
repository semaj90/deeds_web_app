# Deep Import Graph - Phase A
Generated: 2026-06-08T03:36:57.433Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 14983 |
| Total edges | 36224 |
| Resolved edges | 5071 |
| Unresolved (local) | 3107 |
| External refs | 27731 |
| Neighborhoods computed | 100 |
| Test-covered files | 900 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 8603 |
| script | 4876 |
| test | 1237 |
| types | 208 |
| server | 29 |
| config | 20 |
| route | 7 |
| client | 3 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 26873 |
| test_covers_file | 3929 |
| redis_dependency | 1604 |
| imports_dynamic | 1217 |
| qdrant_dependency | 784 |
| exports_from | 501 |
| neo4j_dependency | 367 |
| mcp_tool_calls | 358 |
| env_dependency | 357 |
| db_dependency | 233 |
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
| 7 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 44 | 2 |
| 8 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 40 | 0 |
| 9 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 10 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
| 11 | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | shared | 28 | 4 |
| 12 | `sveltekit-frontend/tests/e2e/route-forensic/_helpers.ts` | shared | 27 | 1 |
| 13 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 14 | `sveltekit-frontend/src/lib/server/vector/qdrant-manager.ts` | shared | 24 | 9 |
| 15 | `scripts/error-resolution/types.ts` | script | 24 | 0 |
| 16 | `claude-mem/src/services/worker-types.ts` | types | 22 | 1 |
| 17 | `sveltekit-frontend/.docker-build/scripts/qdrant-client.mjs` | shared | 22 | 0 |
| 18 | `claude-mem/src/services/sqlite/SessionStore.ts` | shared | 21 | 8 |
| 19 | `sveltekit-frontend/src/routes/api/sse/chat/+server.ts` | shared | 21 | 2 |
| 20 | `scripts/api-cleanup/scanner.ts` | script | 20 | 0 |
