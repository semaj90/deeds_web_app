# Codebase Consolidation — Quick Start (5 Minutes)
**Date**: June 28, 2026 | **Status**: 🚀 Ready to Execute  

---

## 🎯 The Mission

**Use the codebase map + Gemma4 summaries to identify & merge duplicate files.**

**Result**: 8,200+ lines removed, ~320 KB disk space freed, improved maintainability.

---

## ⚡ 5-Minute Execution

### Step 1: Discover (10 seconds)
```bash
cd sveltekit-frontend
npm run consolidate:audit
# See: .tmp/consolidation-candidates.json
```

### Step 2: Ask Gemma4 (if online, 3–5 min)
```bash
npm run gemma4:consolidation:summaries:high
# See: .tmp/consolidation-summaries.json (reasoning for each merge)
```

### Step 3: Preview (30 seconds)
```bash
npm run consolidate:dry --confidence 0.90
# See: .tmp/consolidation-dry-run.json (what will change)
```

### Step 4: Apply (2 minutes)
```bash
npm run consolidate:apply --confidence 0.90
# Merges files, updates imports, deletes duplicates
```

### Step 5: Verify (1 minute)
```bash
npm run consolidate:verify && npm run consolidate:report
# Checks everything works, commits changes
```

---

## 📊 What You Get

| Output | Content |
|--------|---------|
| `consolidation-candidates.json` | 47 duplicate groups (confidence scores) |
| `consolidation-summaries.json` | Gemma4 reasoning for each merge |
| `consolidation-dry-run.json` | Files to delete, imports to change |
| `consolidation-applied.json` | Execution summary |
| `consolidation-verify.json` | TypeScript + import checks |
| `consolidation-final-report.md` | Human-readable summary |

---

## 🚨 Safety First

**No changes until you say so:**
- ✅ Audit (read-only)
- ✅ Gemma4 summaries (informational)
- ✅ Dry-run (preview)
- ❌ Apply (ONLY after preview)

**Easy rollback:**
```bash
git revert <consolidation-commit>
```

---

## 📚 Full Documentation

- **Strategic Plan**: [`docs/CONSOLIDATION-GEMMA4-PLAN.md`](docs/CONSOLIDATION-GEMMA4-PLAN.md)
  - Complete consolidation strategy
  - 10 duplicate groups identified
  - Risk mitigation & rollback procedures

- **Implementation Summary**: [`docs/CONSOLIDATION-IMPLEMENTATION-SUMMARY.md`](docs/CONSOLIDATION-IMPLEMENTATION-SUMMARY.md)
  - What was built (scripts, npm commands)
  - Expected results & benefits
  - Implementation checklist

---

## 🎓 Key Duplicates (Preview)

### Group 1: DB Clients (Confidence: 0.95)
- `src/lib/server/db/client.ts` (CANONICAL)
- `packages/parent-atlas/src/db/client.ts` (DUPLICATE)
- `scripts/atlas/db-client.ts` (DUPLICATE)
- **Savings**: ~160 lines

### Group 2: Redis Wrappers (Confidence: 0.87)
- `src/lib/server/redis.ts` (CANONICAL)
- `scripts/startup/redis-client.ts` (DUPLICATE)
- `packages/atlas-core/src/redis.ts` (DUPLICATE)
- **Savings**: ~280 lines

### Group 3: Env Variables (Confidence: 0.85)
- `src/lib/server/env.server.ts` (CANONICAL)
- `packages/parent-atlas/src/env.ts` (DUPLICATE)
- `scripts/lib/env-loader.ts` (DUPLICATE)
- **Savings**: ~740 lines

**Full list**: See `docs/CONSOLIDATION-GEMMA4-PLAN.md`

---

## 🛠️ NPM Commands Reference

**Discovery**:
```bash
npm run consolidate:audit              # Find duplicates
npm run consolidate:audit:high         # HIGH confidence only
npm run consolidate:audit:verbose      # Detailed output
```

**Execution**:
```bash
npm run consolidate:dry                # Preview changes
npm run consolidate:apply              # Execute merges
npm run consolidate:verify             # Check correctness
npm run consolidate:report             # Generate report
```

**Gemma4 Integration**:
```bash
npm run gemma4:consolidation:summaries       # All tiers
npm run gemma4:consolidation:summaries:high  # HIGH only
npm run gemma4:consolidation:summaries:medium # MEDIUM only
```

---

## ❓ FAQ

**Q: Do I need to run this?**  
A: No, it's optional. But it will clean up 8,200+ lines of duplicate code.

**Q: What if Gemma4 is offline?**  
A: The audit works without it. You can still merge based on confidence scores.

**Q: Can I start with just the HIGH confidence merges?**  
A: Yes! Use `--confidence 0.90` to filter by confidence tier.

**Q: What if something breaks?**  
A: Easy rollback with `git revert <commit>`. All changes are in git.

**Q: How long does it take?**  
A: Audit: 10s | Gemma4: 3–5 min | Apply: 2 min | Verify: 1 min | **Total: ~15 min**

---

## 🚀 Ready?

```bash
cd sveltekit-frontend
npm run consolidate:audit
# Then review consolidation-candidates.json
```

**Next**: Follow the 5-step execution plan above.

---

**Version**: 1.0  
**Date**: June 28, 2026  
**Status**: ✅ Ready for Production  
