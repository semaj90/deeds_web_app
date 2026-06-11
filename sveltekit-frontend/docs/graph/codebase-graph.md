# Codebase Graph Plan — Fast AST (20-Gate)
> Generated: 2026-06-11T16:04:21.123Z
> Mode: `fast-ast` (CPU only)

## Stats
| Metric | Count |
|--------|-------|
| Files | 23335 |
| Routes | 1089 |
| Components | 915 |
| API handlers | 3216 |
| TODOs | 777 |
| Dirs | 770 |

## Gate Failures (action needed)
| Gate | Fail Count |
|------|-----------|
| G4 No auth | 1 |
| G5 No Zod  | 0 |
| G11 Localhost | 717 |
| G14 Svelte4 | 4 |
| G15 SSR unsafe | 0 |
| G16 No test | 94 |
| G20 Cyclic | 1 |

## Files with TODO/FIXME
- `docker/langgraph-synthesis/.venv/Lib/site-packages/torch/utils/model_dump/code.js` — 14 marker(s)
- `docker/langgraph-synthesis/.venv/Lib/site-packages/torch/utils/model_dump/code.js` — 14 marker(s)
- `sveltekit-frontend/scripts/phase104-backups/src/lib/services/vector-service.ts` — 13 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/enhanced/components/[slug]/+server.ts` — 11 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/enhanced/components/[slug]/+server.ts` — 11 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/evidence/[id]/ocr/+server.ts` — 7 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/timeline/[caseId]/+server.ts` — 7 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/evidence/[id]/ocr/+server.ts` — 7 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/v1/timeline/[caseId]/+server.ts` — 7 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/document/[id]/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/gallery/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ingest/[jobId]/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/intake/case/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/document/[id]/+server.ts` — 6 marker(s)
- `sveltekit-frontend/scripts/phase104-backups/src/lib/server/ai/feedback-loop.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/document/[id]/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/gallery/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ingest/[jobId]/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/intake/case/+server.ts` — 6 marker(s)
- `scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/document/[id]/+server.ts` — 6 marker(s)

## ACE usage
Redis `code:index:manifest`, `code:index:tag:{word}`, `code:index:gate-stats`, `wiki:note:dir:*`
Score cap: 0.07 (fast-ast), 0.08 (KAG dir notes)

## Full GPU
```bash
npm run index:codebase:full
```
