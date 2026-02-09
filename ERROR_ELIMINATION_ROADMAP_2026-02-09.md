# Error Elimination Roadmap - February 9, 2026

## Current Status

**svelte-check Results:**
- **Total Errors**: 1,414
- **Warnings**: 225
- **Files with Issues**: 382
- **Target**: 0 errors for production deployment

**Progress from Phase 66-72:**
- Starting Errors: 19,666+ (Phase 67)
- Current Errors: 1,414
- **Reduction**: 92.8% ✅

---

## Error Distribution Analysis

### Top 5 Error Patterns (From Recent Scan)

| Pattern | Count (Est) | Example | Fix |
|---------|-------------|---------|-----|
| **CSS Syntax** | ~200 | `focus: border` | `focus:border` |
| **Ternary Operators** | ~150 | `value | undefined` | `value : undefined` |
| **XState v5 Imports** | ~100 | `import { setup }` not found | Check XState v5 API |
| **Component Props** | ~300 | bits-ui prop mismatches | Update to bits-ui v2 API |
| **Import Type** | ~50 | `import type { zod }` | `import { zod }` (runtime) |
| **Other Syntax** | ~614 | Various corruptions | Case-by-case fixes |

---

## Priority Tiers (Cascade Effect Strategy)

### Tier 1: High-Impact UI Components (Week 1)
**Goal**: Fix core components → 300+ cascading fixes

1. **Button.svelte** (50+ dependents)
   - Current Status: Unknown
   - Expected Impact: 75-100 cascading errors fixed
   - Time: 30 minutes

2. **Card Components** (40+ dependents)
   - Card.svelte, CardHeader, CardContent, CardFooter
   - Expected Impact: 80-120 cascading errors fixed
   - Time: 1 hour

3. **Select.svelte** (30+ dependents)
   - Update to bits-ui v2 Select API
   - Expected Impact: 50-75 cascading errors fixed
   - Time: 45 minutes

4. **Dialog.svelte** (25+ dependents)
   - Already partially fixed (AIDialog.svelte clean)
   - Expected Impact: 40-60 cascading errors fixed
   - Time: 30 minutes

**Tier 1 Total Impact**: ~300 errors eliminated (21% reduction)

---

### Tier 2: Automated Pattern Fixes (Week 1-2)
**Goal**: Script-based bulk corrections

1. **CSS Syntax Fixer**
   ```bash
   # Fix focus: border → focus:border
   # Fix select: dropdown → select:dropdown
   # Fix hover: color → hover:color
   ```
   - Script: `scripts/fix-css-pseudo-class-syntax.mjs`
   - Expected Impact: ~200 errors
   - Time: 1 hour (script development + testing)

2. **Ternary Operator Fixer**
   ```bash
   # Fix value | undefined → value : undefined
   # Fix result ?? error → result : error (in ternary context)
   ```
   - Script: `scripts/fix-ternary-operators.mjs`
   - Expected Impact: ~150 errors
   - Time: 45 minutes

3. **Import Statement Fixer**
   ```bash
   # Fix import type { zod } → import { zod }
   # Fix import type { superValidate } → import { superValidate }
   ```
   - Script: `scripts/fix-import-types.mjs`
   - Expected Impact: ~50 errors
   - Time: 30 minutes

**Tier 2 Total Impact**: ~400 errors eliminated (28% reduction)

---

### Tier 3: XState v5 Migration (Week 2)
**Goal**: Standardize state machine patterns

1. **Fix XState Import Patterns**
   - Pattern: `import { setup, assign, fromPromise }` not found
   - Check: XState v5 API changes
   - Files Affected: ~15 machine files
   - Expected Impact: ~100 errors
   - Time: 2 hours

2. **Update Machine Definitions**
   - Use correct XState v5 `createMachine` syntax
   - Fix actor setup patterns
   - Apply Session 12 patterns (aiAssistantMachine.ts)
   - Expected Impact: ~50 errors
   - Time: 3 hours

**Tier 3 Total Impact**: ~150 errors eliminated (11% reduction)

---

### Tier 4: Component API Updates (Week 2-3)
**Goal**: Update to bits-ui v2.15.5 patterns

1. **Update bits-ui Imports**
   ```typescript
   // Before (v1):
   import { Checkbox } from 'bits-ui';

   // After (v2):
   import * as Checkbox from 'bits-ui/components/checkbox';
   ```
   - Files Affected: ~100+ components
   - Expected Impact: ~300 errors
   - Time: 4 hours (can be partially scripted)

2. **Fix Snippet API**
   ```svelte
   <!-- Before: let: directives -->
   <Select.Root let:selected>

   <!-- After: snippet props -->
   <Select.Root>
     {#snippet children({ selected })}
     {/snippet}
   </Select.Root>
   ```
   - Files Affected: ~30 components
   - Expected Impact: ~80 errors
   - Time: 2 hours

**Tier 4 Total Impact**: ~380 errors eliminated (27% reduction)

---

### Tier 5: Manual Cleanup (Week 3-4)
**Goal**: Fix remaining edge cases

1. **Corrupted File Rewrites**
   - Files with severe compression/corruption
   - Estimated: ~50 files
   - Expected Impact: ~184 errors (remaining)
   - Time: 8-10 hours (case-by-case)

**Tier 5 Total Impact**: ~184 errors eliminated (13% reduction)

---

## Projected Timeline

### Week 1 (Feb 9-15, 2026)
- **Day 1-2**: Tier 1 (High-impact components) → 300 errors fixed
- **Day 3-4**: Tier 2 (Automated fixes) → 400 errors fixed
- **Day 5**: Testing + validation
- **End of Week**: **700 errors eliminated** (714 remaining)

### Week 2 (Feb 16-22, 2026)
- **Day 1-2**: Tier 3 (XState v5) → 150 errors fixed
- **Day 3-5**: Tier 4 (Component APIs) → 380 errors fixed
- **End of Week**: **530 errors eliminated** (184 remaining)

### Week 3 (Feb 23-Mar 1, 2026)
- **Day 1-5**: Tier 5 (Manual cleanup) → 184 errors fixed
- **End of Week**: **0 errors** ✅

---

## Success Metrics

| Milestone | Target Errors | % Complete | ETA |
|-----------|---------------|------------|-----|
| Current | 1,414 | 92.8% | - |
| Week 1 Complete | 714 | 96.4% | Feb 15 |
| Week 2 Complete | 184 | 99.1% | Feb 22 |
| **Production Ready** | **0** | **100%** | **Mar 1** |

---

## Production Deployment Checklist

### Critical Systems (Must Pass Before Production)

- [ ] **Zero svelte-check errors** (Target: Mar 1, 2026)
- [ ] **Playwright E2E tests** (All critical flows passing)
  - [ ] Authentication (login, register, logout)
  - [ ] Chat system (message send, AI response, SSE reconnection)
  - [ ] Evidence upload (file upload, OCR, AI analysis)
  - [ ] Case management (create, update, delete, search)
  - [ ] Vector search (semantic similarity, Qdrant + pgvector)
- [ ] **Database Migrations** (All migrations applied)
- [ ] **Docker Containers** (All services healthy)
  - [ ] PostgreSQL + pgvector
  - [ ] Redis (caching)
  - [ ] Qdrant (vector DB)
  - [ ] RabbitMQ (message queue)
  - [ ] Ollama (AI models: embeddinggemma:latest, gemma3-legal:latest)
  - [ ] MinIO (object storage)
- [ ] **Performance Benchmarks**
  - [ ] Chat response time <2s
  - [ ] Vector search <500ms
  - [ ] File upload + OCR <10s
  - [ ] GPU utilization 70-90%
- [ ] **Security Audit**
  - [ ] Authentication + authorization working
  - [ ] CSRF protection enabled
  - [ ] Input sanitization (SQL injection, XSS prevention)
  - [ ] Rate limiting configured
- [ ] **Monitoring**
  - [ ] Error tracking (Sentry or equivalent)
  - [ ] Performance monitoring (APM)
  - [ ] Health check endpoints responding

---

## Phase 66-72 Integration: AST → CouchDB → PyTorch → Qdrant

### Architecture Overview

```
TypeScript/Svelte Files
         ↓
    svelte-check (extract AST errors)
         ↓
    CouchDB (document store for AST analysis)
         ↓
    PyTorch GPU (semantic clustering of errors)
         ↓
    Qdrant + pgvector (indexed error embeddings)
         ↓
    AI-powered error analysis & auto-fix suggestions
```

### Components Required

1. **CouchDB Setup**
   - Purpose: Store AST error documents
   - Schema: `{ file, line, error, context, embedding }`
   - Docker: `couchdb:latest` (port 5984)

2. **PyTorch GPU Pipeline**
   - Purpose: Generate error embeddings + clustering
   - Model: BERT-based code embedding model
   - GPU: CUDA 12.0+ (RTX 3060 Ti)

3. **Qdrant Integration**
   - Purpose: Semantic search over errors
   - Collection: `ast_errors` (vector dim: 768)
   - Mirror: pgvector for redundancy

4. **Auto-Fix Generator**
   - Purpose: AI-powered patch generation
   - Model: Ollama gemma3-legal:latest
   - Input: Similar error patterns from Qdrant
   - Output: TypeScript/Svelte patches

### Implementation Steps (Week 4)

- [ ] Install CouchDB container (`docker-compose.yml`)
- [ ] Create AST extraction script (`extract-ast-errors.ts`)
- [ ] Set up PyTorch embedding pipeline (`gpu-error-embedder.py`)
- [ ] Index errors in Qdrant (`index-ast-qdrant.ts`)
- [ ] Build auto-fix CLI (`ai-error-fixer.ts`)

---

## Quick Start Commands

```bash
# Check current error count
cd sveltekit-frontend && npx svelte-check --threshold error

# Run automated CSS fixer
node scripts/fix-css-pseudo-class-syntax.mjs

# Run automated ternary fixer
node scripts/fix-ternary-operators.mjs

# Test production build
npm run build

# Run Playwright tests
npx playwright test

# Check Docker services
docker ps
docker-compose ps

# Verify Ollama models
ollama list | grep -E "(embeddinggemma|gemma3-legal)"
```

---

## Contact & Resources

- **Session Documentation**: [SESSION_12_PROGRESS_2026-02-08.md](SESSION_12_PROGRESS_2026-02-08.md)
- **Memory**: [MEMORY.md](C:/Users/james/.claude/projects/c--Users-james-Videos-deeds-web-app/memory/MEMORY.md)
- **CLAUDE.md**: [CLAUDE.md](c:\Users\james\Videos\deeds-web-app\CLAUDE.md)

**Last Updated**: February 9, 2026
**Current Errors**: 1,414
**Target**: 0 errors by March 1, 2026
