# Phase B Execution Checklist — Operator Approval Form

**Date**: June 29, 2026  
**Coordinator**: Claude Code (Anthropic)  
**Prepared**: All infrastructure verified, all scripts wired, all prerequisites met

---

## Pre-Execution Verification (✅ All Passed)

### Infrastructure Health
- [x] Postgres running, 58,304 atlas_packets present
- [x] Valkey (Redis) running on port 6379, password `redis`
- [x] Qdrant running, 40,568 points in codebase_chunks_768
- [x] Ollama running with embeddinggemma:latest and gemma4-rotorquant:latest
- [x] Disk space > 10GB available

### Code & Wiring
- [x] `scripts/phase-b/multi-pass-enrichment.mjs` present and verified
- [x] `src/lib/server/cache/embedding-cache.ts` present (P0 caching)
- [x] `src/lib/server/cache/query-result-cache.ts` present (P1 caching)
- [x] `scripts/cache/benchmark-p0-p1-caching.mjs` proven (180× speedup)
- [x] `analysis_pass_results` table exists in Postgres schema
- [x] ON CONFLICT (UPDATE) idempotency guaranteed

### Performance Baselines
- [x] P0 embedding cache: 73× speedup (365ms → 5ms)
- [x] P1 topK cache: 174× speedup (174ms → 1ms)
- [x] Combined P0+P1: 180× speedup (539ms → 3ms)
- [x] 57K packets: Estimated 9-14 hours sequential, 6 hours parallel

### Blockers Cleared
- [x] Production blocker analysis (production-blockers.md) reviewed
- [x] Confirmed: No blockers affect Phase B execution
- [x] Deferred items: npm run check, Scripts TODOs, API auth gaps
- [x] All production blockers scheduled for Phase D+

---

## Execution Authorization

### Path Selection (Choose One)

**[ ] Path A: Safe & Staged (3 days)**
```
Day 1: Pass 1 (Summarization) — 4-6 hours
Day 2: Pass 2 (Entity Extraction) — 4-6 hours
Day 3: Pass 3 (Semantic Enrichment) — 1-2 hours
Total: 9-14 hours spread over 3 days
Risk: Low (staged verification at each step)
```

**[ ] Path B: Aggressive Parallel (6 hours)**
```
All 3 passes running in parallel
Pass 1 & 2 LLM-bound (4-6 hours each)
Pass 3 parallel to Pass 2 (1-2 hours, cached)
Total: 6 hours elapsed time
Risk: Medium (simultaneous resource usage)
```

**[ ] Path C: Express Smoke Test (30 minutes)**
```
All 3 passes on 100 packets, dry-run mode
Verification only, no writes to database
Confirms everything works before full run
Risk: Minimal
Then proceed to Path A or B after test passes
```

---

## Operator Sign-Off

**I authorize Phase B execution with the following acknowledgments:**

- [ ] I have reviewed all three execution paths and selected one above
- [ ] I understand Phase B is idempotent and safe to restart if interrupted
- [ ] I understand performance will be LLM-bound (Ollama), not network-bound
- [ ] I understand cache will build during Pass 3 (slow first run, 180× speedup on rerun)
- [ ] I confirm no active `npm run dev` will interfere with execution
- [ ] I confirm disk space > 10GB is available
- [ ] I have reviewed rollback procedures and understand them
- [ ] I authorize the selected execution path to proceed

---

## Approval

**Operator Name**: ___________________________

**Date/Time**: ___________________________

**Signature/Approval Method**: ___________________________

**Selected Path** (mark one):
- [ ] Path A (Safe & Staged)
- [ ] Path B (Aggressive Parallel)
- [ ] Path C (Express Smoke Test)

**Additional Notes/Constraints**:
```
_________________________________________________________________

_________________________________________________________________
```

---

## Post-Approval Execution Instructions

Once approved, proceed with:

### For Path C (Smoke Test):
```bash
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=100 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=100 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=100 --dry-run
# All should complete without errors in ~30 minutes
```

### For Path A (Safe & Staged):
```bash
# Day 1
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=100 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000
# Verify: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key LIKE 'pass_1%';" | grep 57

# Day 2
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=100 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=57000
# Verify: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key LIKE 'pass_2%';" | grep 57

# Day 3
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=100 --dry-run
node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=57000
# Verify: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM analysis_pass_results WHERE pass_key LIKE 'pass_3%';" | grep 57
```

### For Path B (Parallel):
```bash
# Terminal 1
node scripts/phase-b/multi-pass-enrichment.mjs --pass=1 --limit=57000

# Terminal 2 (after 5 min)
sleep 300 && node scripts/phase-b/multi-pass-enrichment.mjs --pass=2 --limit=57000

# Terminal 3 (after 10 min)
sleep 600 && node scripts/phase-b/multi-pass-enrichment.mjs --pass=3 --limit=57000

# Monitor: watch -n 5 "docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \"SELECT pass_key, COUNT(*) FROM analysis_pass_results WHERE pass_status='complete' GROUP BY pass_key;\""
```

---

## Support Contacts

- **Script Issues**: Review `scripts/phase-b/multi-pass-enrichment.mjs` for debugging
- **Service Down**: Use rollback procedures in `PHASE-B-FINAL-SUMMARY.md`
- **Cache Issues**: Clear via `docker exec legal-ai-valkey redis-cli -a redis FLUSHDB`
- **Database Issues**: Check `analysis_pass_results` schema in Postgres

---

**This checklist must be completed before Phase B execution proceeds.**

**Status**: ✅ READY FOR OPERATOR APPROVAL

---

*Generated: June 29, 2026 21:50 UTC*
*Reference Docs*:
  - PHASE-B-EXECUTION-READY.md
  - PHASE-B-FINAL-SUMMARY.md
  - PHASE-B-BLOCKERS-DEPENDENCY-MAP.md
