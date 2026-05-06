# Production Blockers Plan — 2026-05-03 20:44:51

> Auto-generated from Gemma4 ACE agent analysis
> Source: `scripts/tests/test-production-readiness.mjs`

## Agent Analysis: Top Blockers

_Agent did not run — start Ollama and re-run_

## Orphan Routes Found

_Agent did not run — start Ollama and re-run_

## Duplicate Services Found

_Agent did not run — start Ollama and re-run_

## Static Scan Findings

### Hardcoded localhost URLs (96 files)

Run this to find them:
```bash
grep -rl "localhost\|127\.0\.0\.1" src/lib/server src/routes --include="*.ts" | grep -v env.server
```

### ✅ TODO/FIXME density is acceptable

### Missing Zod Validation (152 routes)

All POST/PATCH/DELETE routes need input validation. Priority: POST routes with DB writes.

## Deployment Checklist

- [ ] `npm run check` → 0 errors, 0 warnings
- [ ] `npm run build` → exit 0
- [ ] `npm run ci:all` → exit 0
- [ ] All ❌ in master plan resolved
- [ ] `node scripts/tests/test-screenshots.mjs --all` → no 500s
- [ ] Auth guard coverage ≥ 95%
- [ ] Zod validation on all JSON POST routes
- [ ] 0 hardcoded localhost URLs outside env.server.ts
- [ ] Redis + Qdrant + Ollama health endpoints return 200
- [ ] TurboQuant or Ollama inference latency < 60s
