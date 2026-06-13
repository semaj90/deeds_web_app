# Deep Import Graph - Phase A
Generated: 2026-06-13T22:33:37.621Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 40553 |
| Total edges | 83455 |
| Resolved edges | 10095 |
| Unresolved (local) | 7978 |
| External refs | 64595 |
| Neighborhoods computed | 99 |
| Test-covered files | 987 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 30147 |
| script | 6315 |
| test | 3364 |
| types | 595 |
| config | 60 |
| server | 52 |
| route | 14 |
| client | 6 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 59204 |
| test_covers_file | 10260 |
| redis_dependency | 3743 |
| imports_dynamic | 3348 |
| qdrant_dependency | 2167 |
| exports_from | 1337 |
| neo4j_dependency | 1032 |
| mcp_tool_calls | 915 |
| env_dependency | 887 |
| db_dependency | 559 |
| svelte_route_uses_loader | 3 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 2 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 156 | 15 |
| 3 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 156 | 15 |
| 4 | `sveltekit-frontend/src/lib/server/db/client.ts` | shared | 156 | 15 |
| 5 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 126 | 0 |
| 6 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 126 | 0 |
| 7 | `src/lib/server/ace/context-assembler.ts` | server | 113 | 0 |
| 8 | `src/lib/server/ace/context-assembler.ts` | server | 113 | 0 |
| 9 | `scripts/atlas/_atlas-utils.mjs` | script | 112 | 0 |
| 10 | `scripts/atlas/_atlas-utils.mjs` | script | 112 | 0 |
| 11 | `sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 108 | 0 |
| 12 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 95 | 6 |
| 13 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 95 | 6 |
| 14 | `sveltekit-frontend/src/lib/server/redis.js` | shared | 95 | 6 |
| 15 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 94 | 0 |
| 16 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 94 | 0 |
| 17 | `sveltekit-frontend/src/lib/server/env.server.ts` | shared | 94 | 0 |
| 18 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 84 | 0 |
| 19 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 84 | 0 |
| 20 | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | shared | 75 | 15 |
