# Deep Import Graph - Phase A
Generated: 2026-06-18T23:04:18.083Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 58640 |
| Total edges | 131879 |
| Resolved edges | 12296 |
| Unresolved (local) | 15600 |
| External refs | 102688 |
| Neighborhoods computed | 87 |
| Test-covered files | 470 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 47109 |
| test | 5494 |
| script | 4941 |
| types | 992 |
| config | 104 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 92532 |
| test_covers_file | 16610 |
| redis_dependency | 5934 |
| imports_dynamic | 5507 |
| qdrant_dependency | 3698 |
| exports_from | 2291 |
| neo4j_dependency | 1752 |
| mcp_tool_calls | 1574 |
| env_dependency | 1308 |
| db_dependency | 668 |
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
| 15 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 129 | 0 |
| 16 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 129 | 0 |
| 17 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 129 | 0 |
| 18 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 129 | 0 |
| 19 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 129 | 0 |
| 20 | `.claude/worktrees/agent-a7203461/scripts/atlas/connection-config.mjs` | shared | 112 | 0 |
