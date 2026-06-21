# Codebase Graph Plan — Fast AST (20-Gate)
> Generated: 2026-06-21T16:00:07.985Z
> Mode: `fast-ast` (CPU only)

## Stats
| Metric | Count |
|--------|-------|
| Files | 58839 |
| Routes | 155 |
| Components | 4802 |
| API handlers | 6349 |
| TODOs | 1037 |
| Dirs | 728 |

## Gate Failures (action needed)
| Gate | Fail Count |
|------|-----------|
| G4 No auth | 7 |
| G5 No Zod  | 2 |
| G11 Localhost | 2372 |
| G14 Svelte4 | 28 |
| G15 SSR unsafe | 0 |
| G16 No test | 56 |
| G20 Cyclic | 3 |

## Files with TODO/FIXME
- `docker/langgraph-synthesis/.venv/Lib/site-packages/torch/utils/model_dump/code.js` — 14 marker(s)
- `docker/langgraph-synthesis/.venv/Lib/site-packages/torch/utils/model_dump/code.js` — 14 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/services/vector-service.ts` — 13 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/services/vector-service.ts` — 13 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/services/vector-service.ts` — 13 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/services/vector-service.ts` — 13 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/services/vector-service.ts` — 13 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/enhanced/components/[slug]/+server.ts` — 11 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/enhanced/components/[slug]/+server.ts` — 11 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/evidence/[id]/ocr/+server.ts` — 7 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/timeline/[caseId]/+server.ts` — 7 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/evidence/[id]/ocr/+server.ts` — 7 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/timeline/[caseId]/+server.ts` — 7 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/server/ai/feedback-loop.ts` — 6 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/server/ai/feedback-loop.ts` — 6 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/server/ai/feedback-loop.ts` — 6 marker(s)
- `.claude/worktrees/agent-a38668f2/sveltekit-frontend/scripts/phase104-backups/src/lib/server/ai/feedback-loop.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/document/[id]/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/gallery/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ingest/[jobId]/+server.ts` — 6 marker(s)

## ACE usage
Redis `code:index:manifest`, `code:index:tag:{word}`, `code:index:gate-stats`, `wiki:note:dir:*`
Score cap: 0.07 (fast-ast), 0.08 (KAG dir notes)

## Full GPU
```bash
npm run index:codebase:full
```
