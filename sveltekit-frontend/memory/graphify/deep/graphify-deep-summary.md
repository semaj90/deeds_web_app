# Deep Import Graph - Phase A
Generated: 2026-05-30T05:37:55.302Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 55630 |
| Total edges | 82206 |
| Resolved edges | 9253 |
| Unresolved (local) | 8472 |
| External refs | 62778 |
| Neighborhoods computed | 100 |
| Test-covered files | 990 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 48472 |
| script | 4473 |
| test | 1468 |
| types | 1038 |
| config | 140 |
| server | 29 |
| route | 7 |
| client | 3 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 65451 |
| test_covers_file | 4937 |
| redis_dependency | 3247 |
| imports_dynamic | 2358 |
| exports_from | 1869 |
| env_dependency | 1745 |
| qdrant_dependency | 1277 |
| neo4j_dependency | 499 |
| mcp_tool_calls | 472 |
| db_dependency | 348 |
| svelte_route_uses_loader | 3 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 78 | 0 |
| 3 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 71 | 5 |
| 4 | `scripts/atlas/_atlas-utils.mjs` | script | 70 | 0 |
| 5 | `scripts/atlas/_atlas-utils.mjs` | script | 70 | 0 |
| 6 | `claude-mem/src/shared/paths.ts` | shared | 57 | 2 |
| 7 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 47 | 0 |
| 8 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/_archived/services-corrupted/nodejs-orchestrator.ts` | shared | 47 | 0 |
| 9 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/archives/unused-2026-02-14/lib/server/contradictionEngine/types.ts` | types | 43 | 0 |
| 10 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/archives/unused-2026-02-14/lib/server/contradictionEngine/types.ts` | types | 43 | 0 |
| 11 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/archives/unused-2026-02-14/lib/server/contradictionEngine/types.ts` | types | 43 | 0 |
| 12 | `sveltekit-frontend/src/lib/server/redis.ts` | shared | 43 | 0 |
| 13 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 14 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 15 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 16 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/archives/unused-2026-02-14/lib/services/error-analysis/base-service.ts` | shared | 42 | 0 |
| 17 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 40 | 0 |
| 18 | `src/lib/server/ace/context-assembler.ts` | server | 38 | 0 |
| 19 | `claude-mem/src/shared/SettingsDefaultsManager.ts` | shared | 37 | 0 |
| 20 | `deeds_labs/snapshots/2026-03-10/bucket-c-stale/archives/unused-2026-02-14/lib/components/ui/gaming/types/gaming-types.ts` | types | 27 | 0 |
