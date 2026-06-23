# Deep Import Graph - Phase A
Generated: 2026-06-22T21:41:32.814Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 58869 |
| Total edges | 132504 |
| Resolved edges | 18871 |
| Unresolved (local) | 9114 |
| External refs | 103224 |
| Neighborhoods computed | 91 |
| Test-covered files | 1012 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 47245 |
| test | 5495 |
| script | 5032 |
| types | 993 |
| config | 104 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 92664 |
| test_covers_file | 16611 |
| redis_dependency | 5963 |
| imports_dynamic | 5459 |
| qdrant_dependency | 3697 |
| exports_from | 2294 |
| neo4j_dependency | 1750 |
| mcp_tool_calls | 1564 |
| env_dependency | 1498 |
| db_dependency | 999 |
| svelte_route_uses_loader | 5 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 327 | 0 |
| 2 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 327 | 0 |
| 3 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 327 | 0 |
| 4 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 327 | 0 |
| 5 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 276 | 25 |
| 6 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 276 | 25 |
| 7 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 276 | 25 |
| 8 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 276 | 25 |
| 9 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 276 | 25 |
| 10 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 198 | 0 |
| 11 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 198 | 0 |
| 12 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 198 | 0 |
| 13 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 198 | 0 |
| 14 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 184 | 10 |
| 15 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 184 | 10 |
| 16 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 184 | 10 |
| 17 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 184 | 10 |
| 18 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 184 | 10 |
| 19 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/env.server.ts` | shared | 179 | 0 |
| 20 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/env.server.ts` | shared | 179 | 0 |
