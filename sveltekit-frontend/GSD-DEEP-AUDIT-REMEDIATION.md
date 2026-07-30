# GSD: Deep Audit Remediation Plan

**Objective**: Execute Phase 3 Step 1 continuation + resolve code gate failures (G4, G5, G16, G20, G8)

**Status**: PLAN_READY  
**Date Created**: 2026-07-30  
**Estimated Duration**: 8 hours (P0 + P1) + 1-2 weeks (P2)  
**Owner**: Claude + Team

---

## Executive Summary

Deep audit identified 5 code gate failures across 231 routes:
- **G4**: 25 routes missing auth guards (🔴 HIGH)
- **G5**: 10 routes missing Zod validation (🔴 HIGH)
- **G16**: 48 routes lack paired tests (🟡 MEDIUM)
- **G20**: 3 cyclic import pairs (🟡 MEDIUM)
- **G8**: 1,153 TODOs scattered (🟡 MEDIUM)

**Quick Wins**: G4 + G5 fixes = 3 hours → 95% compliance on critical gates.

---

## Phase 1: AUTH GUARD REMEDIATION (G4) — 2-3 hours

### Step 1.1: Identify Protected Routes (15 min)

**Task**: Classify the 25 auth-missing routes into:
- (A) Should be public (health checks, webhooks with signature validation)
- (B) Should be private (require `locals.user`)

**Action**:
```bash
cd sveltekit-frontend

# List all API routes
find src/routes/api -name "+server.ts" -type f | wc -l

# Find routes without explicit auth check
grep -L "locals\.user" src/routes/api/*/+server.ts | head -25
```

**Output**: Sorted list with classification notes.

---

### Step 1.2: Apply Auth Guards (1.5-2 hours)

**For each route in category (B) (private)**:

**Pattern**:
```typescript
// Before
export async function GET({ request }) {
  const data = await db.query(...);
  return json(data);
}

// After
export async function GET({ locals }) {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const data = await db.query(...);
  return json(data);
}
```

**Dry-run**: Apply to 5 routes, test with unauthenticated fetch (should return 401).

**Rollout**: Remaining 20 routes in batches of 5.

**Verification**: `npm run audit:routes:auth-coverage` (expected: 0 unprotected private routes).

---

### Step 1.3: Document Public Routes (30 min)

**For category (A) routes** that are intentionally public:

Add JSDoc comment:
```typescript
/**
 * Public endpoint — no auth required.
 * Security: Validates webhook signature via X-Signature header.
 */
export async function POST({ request }) {
  const signature = request.headers.get('X-Signature');
  if (!verifySignature(signature)) return json({ error: 'Invalid signature' }, { status: 403 });
  // ...
}
```

**Verification**: `npm run audit:routes:public-list` (expected: ~10-15 documented public routes).

---

## Phase 2: ZOD VALIDATION REMEDIATION (G5) — 1-2 hours

### Step 2.1: Identify Unvalidated Routes (15 min)

**Task**: Find routes parsing `request.json()` without Zod schema.

**Action**:
```bash
# Routes with JSON parsing but no Zod import
grep -l "request\.json()" src/routes/api/*/+server.ts | \
  while read f; do grep -L "from 'zod'" "$f" && echo "$f"; done
```

**Output**: 10 target files.

---

### Step 2.2: Add Zod Schemas (1-1.5 hours)

**For each route**:

**Pattern**:
```typescript
import { z } from 'zod';

const CreateCaseSchema = z.object({
  title: z.string().min(1, 'Title required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

type CreateCaseInput = z.infer<typeof CreateCaseSchema>;

export async function POST({ request, locals }) {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = CreateCaseSchema.safeParse(body);
  
  if (!parsed.success) {
    return json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  // Use data safely
}
```

**Dry-run**: Apply to 3 routes, test with invalid JSON (should return 400 with details).

**Rollout**: Remaining 7 routes.

**Verification**: `npm run audit:routes:zod-coverage` (expected: 0 unvalidated routes).

---

## Phase 3: TEST STUB GENERATION (G16) — 30 min auto + 2-3 hours manual

### Step 3.1: Auto-Generate Stubs (30 min)

**Action**:
```bash
cd sveltekit-frontend
npm run audit:test-stubs --dry-run        # Preview
npm run audit:test-stubs --apply          # Generate 48 test files
```

**Output**: `tests/routes/auto/*.test.ts` with:
- `@vitest-environment node` declaration
- `vi.hoisted()` for module mocks
- 3 baseline test cases (401, 400, 200)
- `.todo()` placeholder

**Verification**: `find tests/routes/auto -name "*.test.ts" | wc -l` (expected: 48).

---

### Step 3.2: Complete High-Priority Tests (2-3 hours)

**Priority tiers**:
- **T1** (Critical): `/api/auth/*`, `/api/cases/*`, `/api/evidence/*` (20 tests)
- **T2** (Important): `/api/rag/*`, `/api/ace/*`, `/api/retrieval/*` (15 tests)
- **T3** (Deferred): Everything else (13 tests)

**For each T1 test**:

Replace `.todo()` with real assertions:

```typescript
it('should create case with valid input', async () => {
  const response = await POST({
    locals: { user: { id: 'test-user-123' } },
    request: new Request('...', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test Case', priority: 'high' }),
    }),
  } as any);

  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.id).toBeDefined();
  expect(data.title).toBe('Test Case');
});
```

**Effort per test**: ~5-10 min (setup + assertions).

**Timeline**: 20 T1 tests = 100-200 min = 1.5-3 hours. Do T1 today, T2/T3 this week.

---

## Phase 4: CYCLIC IMPORT REMEDIATION (G20) — 1-2 hours per cycle

### Step 4.1: Identify Cycles (30 min)

**Action**:
```bash
# Manual inspection of 3 cycles
# (Would use `npm run audit:cycles` if available)

# Find circular dependencies via import trace
grep -r "from '\$lib" src/lib --include="*.ts" | \
  sort | uniq -d | head -20
```

**Output**: 3 identified cycle pairs with file paths.

---

### Step 4.2: Break Each Cycle (1-2 hours per cycle)

**General strategy** (pick best option per cycle):

**Option A**: Extract common types to neutral module
```typescript
// Before: A imports B, B imports A
// After: Create C (types only), A imports C, B imports C

// lib/types/shared.ts (types only, no logic)
export type CaseData = { id: string; title: string };

// lib/a.ts
import type { CaseData } from './types/shared';
export function createCase(data: CaseData) { ... }

// lib/b.ts
import type { CaseData } from './types/shared';
export function updateCase(data: CaseData) { ... }
```

**Option B**: Lazy-load one side
```typescript
// lib/a.ts
export async function processB() {
  const { bFunction } = await import('./b');
  return bFunction();
}

// lib/b.ts (can now safely import from a)
import { aFunction } from './a';
```

**Option C**: Restructure module boundary
- Move logic to separate module
- Reduce bidirectional dependencies

**For each cycle**: Apply Option A (safest), test with `npm run check`, proceed.

---

## Phase 5: TODO TRIAGE (G8) — 1-2 hours audit + async execution

### Step 5.1: Prioritize TODOs (1 hour)

**Classify by impact**:

```bash
# Count TODOs by directory
find src -name "*.ts" -o -name "*.svelte" | \
  xargs grep -h "TODO" | sed 's/.*TODO[: ]*//g' | \
  sort | uniq -c | sort -rn | head -20
```

**Create TODO_PRIORITY.md**:
```markdown
# P0 (Blocks Phase 3 Step 1)
- [ ] Embedding dimension validation (3 TODOs) — embedding-cache.ts, qdrant-manager.ts
- [ ] ACE context assembly (5 TODOs) — context-assembler.ts
- [ ] Graphify daily indexing (2 TODOs) — graphify-daily.mjs

# P1 (Blocks releases, security)
- [ ] Auth guard completion (8 TODOs) — from G4 remediation
- [ ] Zod schema finalization (3 TODOs) — from G5 remediation
- [ ] Error handling in routes (12 TODOs)

# P2 (Deferred to post-release)
- [ ] GPU acceleration (120+ TODOs)
- [ ] Test stubs (200+ TODOs from G16)
- [ ] Documentation (50+ TODOs)
```

### Step 5.2: Execute P0 TODOs (Today)

**Action**: For each P0 TODO:
1. Read the file + context
2. Implement the deferred work
3. Remove the TODO comment
4. Commit atomically

**Example**:
```bash
# embedding-cache.ts: TODO "add TTL expiration"
# → Implement Redis SETEX with 3600s TTL
# → Remove TODO
# → Commit: "fix(cache): add TTL expiration to embedding cache"
```

**Timeline**: 3-5 min per TODO × 13 P0 items = 1-1.5 hours.

---

## Phase 6: RE-AUDIT & VERIFICATION — 1 hour

### Step 6.1: Run Full Code Audit (30 min)

**After all P0 + P1 fixes**:

```bash
cd sveltekit-frontend
npm run deep-audit all code report
```

**Expected results**:
- ✅ G4: 0 auth failures (was 25)
- ✅ G5: 0 validation failures (was 10)
- ✅ G16: 48 test stubs generated (was 0)
- ✅ G20: 0 cyclic pairs (was 3)
- ⚠️ G8: P0 TODOs cleared (1,153 → ~1,140)

**Target**: 95%+ compliance on all code gates.

### Step 6.2: Commit & Tag (30 min)

```bash
git add -A
git commit -m "fix(audit): resolve code gate failures G4, G5, G16, G20

- G4: Add auth guards to 25 routes (25/25 protected)
- G5: Add Zod validation to 10 routes (10/10 validated)
- G16: Generate test stubs for 48 routes (48/48 generated)
- G20: Break 3 cyclic import pairs (3/3 resolved)
- G8: Clear P0 TODOs (13 items completed)

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"

git tag v26.07.30-audit-remediation
```

---

## Timeline & Execution

| Phase | Task | Duration | Sequence | Owner |
|-------|------|----------|----------|-------|
| **1** | G4 Auth remediation | 2-3h | Today | Claude |
| **2** | G5 Zod validation | 1-2h | Today | Claude |
| **3** | G16 Test stubs (T1) | 1.5-3h | This week | Claude + Team |
| **4** | G20 Cyclic imports | 2-6h | This week | Claude |
| **5** | G8 P0 TODO cleanup | 1-1.5h | Today | Claude |
| **6** | Re-audit + commit | 1h | End of day | Claude |

**Total P0 + P1**: **8 hours** → 95%+ compliance

**Total P2**: **1-2 weeks** → 100% compliance

---

## Success Criteria

| Gate | Current | Target | Status |
|------|---------|--------|--------|
| G4 (Auth) | 25 failures | 0 failures | ✅ Fixable |
| G5 (Zod) | 10 failures | 0 failures | ✅ Fixable |
| G16 (Tests) | 48 missing | 48 stubs | ✅ Fixable |
| G20 (Cycles) | 3 pairs | 0 pairs | ✅ Fixable |
| G8 (TODOs) | 1,153 total | P0 cleared | ⏳ Deferred |
| **Overall** | **69.6%** | **95%+** | ✅ ACHIEVABLE |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Auth guard breaks webhooks | Medium | Verify category (A) routes first; use signature validation |
| Zod schemas too strict | Medium | Test with valid payloads; adjust constraints post-test |
| Test stubs incomplete | Low | T1 priority; T2/T3 can be deferred; CI won't enforce yet |
| Cyclic imports hard to untangle | Medium | Extract types first (Option A); test after each change |
| TODOs block Phase 3 Step 1 | High | Execute P0 TODOs today (13 items, 1-1.5h) |

---

## Dependencies & Blockers

**None identified.** All work is scoped to the frontend codebase; no backend service changes required.

**Optional accelerators**:
- Parallel execution: G4 + G5 can run independently (split between Claude + team member)
- Automation: `npm run audit:test-stubs --apply` auto-generates 48 test files

---

## Next Action

**Start immediately with Phase 1 (G4 Auth)**:

```bash
cd sveltekit-frontend

# 1. List routes missing auth
grep -L "locals\.user" src/routes/api/*/+server.ts | head -5

# 2. Review first 5 routes for classification (public vs private)
# 3. Apply auth guard pattern to private routes
# 4. Test with curl -H "Cookie:" (unauthenticated)
# 5. Commit: "fix(auth): add guards to routes [1-5/25]"
```

**Expected completion**: Today (3 hours) → 95% compliance achieved.

---

**Prepared by**: Claude Haiku 4.5  
**Date**: 2026-07-30  
**Status**: READY FOR EXECUTION
