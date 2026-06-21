# Deep Import Graph - Phase A
Generated: 2026-06-21T01:11:17.388Z

## Stats
| Metric | Value |
|--------|-------|
| Nodes | 58833 |
| Total edges | 132338 |
| Resolved edges | 18850 |
| Unresolved (local) | 9113 |
| External refs | 103080 |
| Neighborhoods computed | 91 |
| Test-covered files | 997 |

## Zone Breakdown
| Zone | Count |
|------|-------|
| shared | 47216 |
| test | 5495 |
| script | 5025 |
| types | 993 |
| config | 104 |

## Edge Type Breakdown
| Type | Count |
|------|-------|
| imports_static | 92516 |
| test_covers_file | 16611 |
| redis_dependency | 5953 |
| imports_dynamic | 5456 |
| qdrant_dependency | 3695 |
| exports_from | 2291 |
| neo4j_dependency | 1749 |
| mcp_tool_calls | 1564 |
| env_dependency | 1498 |
| db_dependency | 1000 |
| svelte_route_uses_loader | 5 |

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
| 1 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 327 | 0 |
| 2 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 327 | 0 |
| 3 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 327 | 0 |
| 4 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/tests/helpers/env-ports.ts` | shared | 327 | 0 |
| 5 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 277 | 25 |
| 6 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 277 | 25 |
| 7 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 277 | 25 |
| 8 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 277 | 25 |
| 9 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/db/client.ts` | shared | 277 | 25 |
| 10 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 198 | 0 |
| 11 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 198 | 0 |
| 12 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 198 | 0 |
| 13 | `.claude/worktrees/agent-a38668f2/scripts/atlas/_atlas-utils.mjs` | shared | 198 | 0 |
| 14 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 185 | 10 |
| 15 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 185 | 10 |
| 16 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 185 | 10 |
| 17 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 185 | 10 |
| 18 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/redis.js` | shared | 185 | 10 |
| 19 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/env.server.ts` | shared | 180 | 0 |
| 20 | `.claude/worktrees/agent-a38668f2/sveltekit-frontend/src/lib/server/env.server.ts` | shared | 180 | 0 |
