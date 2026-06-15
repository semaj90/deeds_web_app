# Quick Reference: P1 Error Fixing (Session 66+)

**P0 Status**: ✅ **COMPLETE** (Identity frozen, all gates pass)  
**P1 Status**: 🚀 **READY** (Infrastructure ready, scripts created)

---

## One-Line Summary

P0 locked the packet identity chain (directory_path → source_ref → feature_id → packet_key). P1 automates error fixing within that frozen identity via 5-script pipeline: audit → plan → apply → verify → trace.

---

## Start P1 (Weekly)

```bash
cd sveltekit-frontend

# Step 1: Audit errors
npm run atlas:error:audit

# Step 2: Generate fix plan
npm run atlas:error:plan

# Step 3: Apply fixes (when P1.3 ready)
# npm run atlas:error:apply --dry-run
# npm run atlas:error:apply --apply

# Step 4: Verify fixes (when P1.4 ready)
# npm run atlas:error:verify

# Step 5: Trace root causes (when P1.5 ready)
# npm run atlas:error:trace
```

---

## Current P1 Status

| Script | File | Status | Next |
|--------|------|--------|------|
| P1.1 Audit | `audit-error-fixes.mjs` | ✅ DONE | Run weekly |
| P1.2 Plan | `plan-error-fixes.mjs` | ✅ DONE | Wait for errors |
| P1.3 Apply | (not created) | ⏳ TODO | Create fixer strategies |
| P1.4 Verify | (not created) | ⏳ TODO | Create validation gates |
| P1.5 Trace | (not created) | ⏳ TODO | Create attribution report |

---

## Error Collection Checklist

- [ ] Wire error collection into API routes
- [ ] Test error logging (post 1-2 test errors)
- [ ] Verify P1.1 audit finds them
- [ ] Decide on fixer strategies (pattern/ast/semantic)
- [ ] Create P1.3 apply script
- [ ] Create P1.4 verify script
- [ ] Create P1.5 trace script

---

## Key Tables

**error_logs** — Main error tracking table
- Columns: error_category, severity, message, stack, context_key, route_path, file_path, packet_key, created_at, fixed_at, resolved, fix_strategy, fix_confidence
- Indexes: category, severity, created_at, route_path, packet_key, resolved, fix_strategy
- Views: v_error_logs_summary, v_error_logs_fixable

**Linked to**: atlas_packets (via packet_key), source_refs

---

## Hard Rules

1. **Do NOT change packet identity** — P0 froze it. All fixes must preserve: directory_path, source_ref, file_path, feature_id, feature_label, packet_key
2. **Error fixes must maintain Postgres as truth** — Qdrant/Redis/Neo4j are mirrors
3. **Trace errors back to sources** — Document root cause, not just symptoms
4. **Always dry-run first** — Pattern/AST fixers have regressions risk

---

## Completion Target

- **Week 1** (Jun 17-21): Audit + Plan + Start Apply
- **Week 2** (Jun 24-28): Complete Apply + Verify + Trace
- **Target**: Jun 28, 2026

---

## Files Reference

**P0 Scripts**: `sveltekit-frontend/scripts/atlas/verify-*.mjs`  
**P1 Scripts**: `scripts/atlas/audit-error-fixes.mjs`, `plan-error-fixes.mjs`  
**Reports**: `docs/reports/error-audit-*.json`, `error-plan-*.json`  
**Documentation**: `docs/P0-P1-TRANSITION-CHECKPOINT.md`, `docs/P1-AGENTIC-ERROR-FIXING-PLAN.md`

---

Last updated: 2026-06-15 (Session 66)
