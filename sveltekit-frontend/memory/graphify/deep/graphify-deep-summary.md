# Deep Import Graph - Phase A
Generated: 2026-06-20T15:18:44.511Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 58773 |
| Total edges | 132136 |
| Resolved edges | 12696 |
| Unresolved (local) | 15251 |
| External refs | 102894 |
| Neighborhoods computed | 90 |
| Test-covered files | 471 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 47209 |
| test | 5493 |
| script | 4975 |
| types | 992 |
| config | 104 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 92557 |
| test_covers_file | 16607 |
| redis_dependency | 5944 |
| imports_dynamic | 5486 |
| qdrant_dependency | 3698 |
| exports_from | 2291 |
| neo4j_dependency | 1753 |
| mcp_tool_calls | 1568 |
| env_dependency | 1444 |
| db_dependency | 783 |
| svelte_route_uses_loader | 5 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 2 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 3 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 4 | `.claude/worktrees/agent-a7203461/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 252 | 0 |
| 5 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 189 | 15 |
| 6 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 189 | 15 |
| 7 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 189 | 15 |
| 8 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 189 | 15 |
| 9 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 189 | 15 |
| 10 | `claude-mem/src/utils/logger.ts` | shared | 178 | 1 |
| 11 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 12 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 13 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 14 | `.claude/worktrees/agent-a7203461/scripts/atlas/_atlas-utils.mjs` | shared | 168 | 0 |
| 15 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/env.server.ts` | shared | 136 | 0 |
| 16 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/env.server.ts` | shared | 136 | 0 |
| 17 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/env.server.ts` | shared | 136 | 0 |
| 18 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/env.server.ts` | shared | 136 | 0 |
| 19 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 129 | 0 |
| 20 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 129 | 0 |
