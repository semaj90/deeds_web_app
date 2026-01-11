---
description: Systematic error fixing strategy for 102k svelte-check errors
---

# Error Fixing Strategy - Phase 90+

## Current State (2026-01-04)
- **Total Errors:** 102,593
- **Total Files:** 2,950
- **Parser Status:** Unblocked (true error picture visible)

## Priority Tiers

### Tier 0: Critical Blockers (IMMEDIATE - ~8,000 errors)
These files cause cascading type errors across the entire app.

| File | Errors | Action |
|------|--------|--------|
| `src/lib/db/schema/legacy.ts` | 5,183 | DELETE or REGENERATE with `drizzle-kit introspect` |
| `src/lib/server/db/schema-postgres.ts` | 2,778 | RESTORE from git or regenerate |

**Commands:**
```bash
// turbo
# Option 1: Regenerate legacy schema
npx drizzle-kit introspect

# Option 2: Delete legacy if unused
rm src/lib/db/schema/legacy.ts

# Option 3: Restore from git
git checkout HEAD~20 -- src/lib/server/db/schema-postgres.ts
```

### Tier 1: High-Impact Files (500+ errors each, ~4,000 errors)

| File | Errors | Category |
|------|--------|----------|
| `CaseScoringServiceGrpc.ts` | 1,013 | gRPC generated code |
| `NESYoRHaHybrid3D.ts` | 714 | Three.js component |
| `NESYoRHaHybrid3D_FIXED.ts` | 709 | Duplicate - DELETE? |
| `CaseScoringService.ts` | 505 | Service layer |
| `webasm-ai-adapter.ts` | 498 | WASM bindings |
| `nes-memory-architecture.ts` | 489 | Memory subsystem |

**Strategy:** Manual signature repair or regenerate gRPC stubs.

### Tier 2: Automated Fixes (~5,000 errors)

```bash
// turbo
# 1. Fix import type errors (2,712 errors)
node scripts/fix-import-type.mjs src --apply

# 2. Run colon chain fixer again (catches stragglers)
node scripts/fix-colon-chains.mjs src --apply

# 3. Fix Svelte 5 event handlers (if any remain)
node scripts/fix-svelte5-events.mjs src --apply
```

### Tier 3: Type Errors (~8,000 errors)
After Tier 0-2, many type errors will auto-resolve. Remaining:
- Missing module declarations
- Incorrect generic types
- Schema type mismatches

**Fix Pattern:**
```typescript
// Add missing type declarations in src/ambient.d.ts
declare module 'missing-module' {
  export const whatever: unknown;
}
```

### Tier 4: Unknown/Other (37,000 errors)
These require manual inspection. Use clustering to group similar errors:
```bash
// turbo
node scripts/error-graph-analyzer.mjs
cat logs/priority-files.json | jq '.[0:20]'
```

## Execution Order

1. **Commit current state** (Phase 90 fixes)
2. **Handle Tier 0** - Delete/regenerate schema files
3. **Re-run svelte-check** - Measure impact
4. **Execute Tier 2** - Automated fixes
5. **Re-run svelte-check** - Measure impact
6. **Triage Tier 1** - Manual high-impact files
7. **Iterate** until < 1,000 errors

## Verification
```bash
// turbo
npm run check
# Or: npx svelte-check --threshold error 2>&1 | tail -5
```

## Success Criteria
- [ ] Error count < 10,000 (Phase 91)
- [ ] Error count < 1,000 (Phase 92)
- [ ] `npm run dev` starts without crashes
- [ ] No blocking TypeScript errors in core routes
