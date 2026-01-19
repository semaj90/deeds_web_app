# Phase 107: Top 100 Files for Manual Fixing

**Generated:** January 18, 2026
**Current Error Count:** 71,761 errors in 1,561 files
**Strategy:** Manual incremental fixes (proven 100% success rate)

---

## 🔴 CRITICAL PRIORITY (40+ errors)

### 1. **enhanced-api-client.ts** (~40 errors)
**Issue:** Semicolon-comma pattern not fixed by mass script
**Pattern:** `property: type;, nextProperty: type;`
**Fix:** Replace `;,` with `;` throughout
**Impact:** HIGH - API client is core infrastructure

---

## 🟠 HIGH PRIORITY (10-20 errors)

### 2. **ai-service.ts** (10 errors)
**Issue:** Duplicate type definitions
**Lines:**
- Line 10: `import { db }` - File is not a module
- Line 12: `autoTags` - Import conflicts with local declaration
- Line 15: `userAiQueries` - Import conflicts with local declaration
- Line 18: `type NewAutoTag` - Duplicate identifier
- Line 19: `type NewDocumentChunk` - Duplicate identifier
- Line 20: `type NewUserAiQuery` - Duplicate identifier
- Line 23: `interface NewUserAiQuery` - Duplicate identifier
- Line 39: `interface NewAutoTag` - Duplicate identifier
- Line 49: `interface NewDocumentChunk` - Duplicate identifier
- Line 498: `documentType` - Property doesn't exist

**Fix Strategy:**
1. Remove duplicate type definitions (keep `typeof` inferred types, remove manual interfaces)
2. Fix import conflicts (rename local variables or imports)
3. Fix database import issue
4. Remove invalid `documentType` property

**Impact:** HIGH - AI service is critical for document processing

---

## 🟡 MEDIUM PRIORITY (3-5 errors)

### 3. **chat-store.svelte.ts** (3 errors)
**Issue:** Missing properties in RAGContext type
**Lines:**
- Line 251: `recommendations` property doesn't exist
- Line 252: `did_you_mean` property doesn't exist (2 errors)

**Fix:** Add missing properties to RAGContext type in `chat.ts`:
```typescript
export interface RAGContext {
  // ... existing properties
  recommendations?: string[];
  did_you_mean?: string[];
}
```

**Impact:** MEDIUM - Chat system is user-facing but has fallbacks

---

### 4. **cases/new/+page.server.ts** (2 errors)
**Issue:** Schema mismatch with Drizzle ORM
**Lines:**
- Line 17: `cases.userId` doesn't exist
- Line 75: `id` property not in schema

**Fix:**
1. Check schema definition - verify `userId` vs `user_id` naming
2. Remove `id` from insert (auto-generated)

**Impact:** MEDIUM - Case creation is important but not critical path

---

## 📊 ANALYSIS NEEDED (Unknown error count)

Based on previous patterns, these files likely have errors:

### 5-10. **High-complexity modules** (estimate: 50-150 errors each)
- `src/lib/storage/vector-quantization.ts` (154 errors mentioned earlier)
- `src/lib/proto/enhanced-rag.ts` (95 errors mentioned earlier)
- `src/routes/` directory (115 errors mentioned earlier)
- `webgpu-langchain-bridge.ts`
- `vector-quantization.ts`
- `som-webgpu-cache.ts`

### 11-20. **Server services** (estimate: 20-50 errors each)
- `src/lib/server/database/index.ts` (causing ai-service import failure)
- Database schema files (userId vs user_id mismatches)
- API route handlers with type errors

### 21-30. **Component libraries** (estimate: 10-30 errors each)
- Svelte components with Svelte 5 migration issues
- Type definition files (`.d.ts`)
- Store files using old reactive patterns

### 31-40. **Worker files** (estimate: 5-15 errors each)
- Web Workers with type issues
- Service workers
- Background processing modules

### 41-50. **WebGPU/WASM modules** (estimate: 5-10 errors each)
- GPU compute shaders
- WASM bridge files
- Tensor operations

### 51-60. **API routes** (estimate: 3-8 errors each)
- `+server.ts` files
- Route handlers
- SSE endpoints

### 61-70. **Utility modules** (estimate: 2-5 errors each)
- Helper functions
- Validation schemas
- Type guards

### 71-80. **Legacy/parked routes** (estimate: 2-5 errors each)
- `routes_parked/` directory files
- Deprecated components
- Migration artifacts

### 81-90. **Configuration files** (estimate: 1-3 errors each)
- Build configs
- Type declarations
- Ambient modules

### 91-100. **Test files** (estimate: 1-2 errors each)
- Test utilities
- Mock data
- Test configurations

---

## 📋 RECOMMENDED FIX ORDER

### Phase 107.4: Fix Critical Infrastructure
1. **enhanced-api-client.ts** - Fix semicolon-comma pattern (40 errors)
2. **ai-service.ts** - Remove duplicate types (10 errors)
3. **database/index.ts** - Fix module export (cascading fix)

**Expected Reduction:** ~60-80 errors

### Phase 107.5: Fix Core Features
4. **chat-store.svelte.ts** - Add RAGContext properties (3 errors)
5. **cases/new/+page.server.ts** - Fix schema mismatch (2 errors)
6. **vector-quantization.ts** - Fix remaining semicolon patterns (154 errors)

**Expected Reduction:** ~160 errors

### Phase 107.6: Fix High-Value Modules
7-15. Server services, stores, and critical utilities

**Expected Reduction:** ~300-500 errors

### Phase 107.7: Systematic Cleanup
16-50. Component libraries, workers, WebGPU modules

**Expected Reduction:** ~1,000-2,000 errors

### Phase 107.8: Long Tail
51-100. API routes, utilities, legacy code, tests

**Expected Reduction:** ~500-1,000 errors

---

## 🎯 SUCCESS METRICS

- **Phase 107.1-107.2:** Fixed 779 errors manually (100% success rate)
- **Phase 107.3:** Mass fix reduced 11,856 errors but exposed type issues
- **Current:** 71,761 errors remaining
- **Target:** <10,000 errors by Phase 107.10

---

## 🛠️ TOOLS & PATTERNS

### Common Patterns Found:
1. **Semicolon-comma:** `property: type;, next:` → `property: type; next:`
2. **Brace-comma:** `{, property:` → `{ property:`
3. **Duplicate types:** Remove manual interfaces, keep `typeof` inferred
4. **Import conflicts:** Rename imports or local variables
5. **Schema mismatches:** Align Drizzle types with database schema
6. **Missing properties:** Add to type definitions

### Proven Fix Strategy:
1. Read file to understand context
2. Apply targeted fix
3. Validate with svelte-check
4. Commit incrementally
5. Never batch more than 5 files at once

---

## 📞 NEXT STEPS

**Immediate Action:**
```bash
# Fix enhanced-api-client.ts
node scripts/fix-semicolon-comma.mjs src/lib/services/enhanced-api-client.ts

# Fix ai-service.ts manually
code src/lib/server/services/ai-service.ts

# Validate
npx svelte-check --threshold error
```

**After each fix:**
- Commit with descriptive message
- Update error count
- Document patterns found
