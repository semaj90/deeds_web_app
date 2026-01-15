# 📊 TypeScript Error Files Ranked for Review (Phase 99)
**Generated:** January 14, 2026
**Total Files with Errors:** ~40
**Analysis Source:** svelte-check output

---

## 🔥 CRITICAL PRIORITY (Fix First)

### 1. `src/lib/types/evidence.ts` - **32 errors**
**Primary Issues:**
- `,` expected in multiple locations (lines 183-193)
- Property or signature expected
- Declaration or statement expected
- Expression expected
- Syntax corruption in union types

**Root Cause:** Comments interfering with type syntax
```typescript
// BROKEN:
status: 'active'; // Separated 'active', output | undefined;
error | undefined;

// SHOULD BE:
status: 'active';
output?: unknown;
error?: undefined;
```

**Impact:** Blocks all evidence-related types
**Estimated Fix Time:** 10 minutes

---

### 2. `src/ToolInvoker.ts` - **4 errors**
**Primary Issues:**
- Cannot find name 'stdout' (lines 100, 108, 191)
- `,` expected (line 306)

**Root Cause:**
1. Missing variable declarations
2. Syntax error: `Math.max(0: Math.min(1, ...))` should be `Math.max(0, Math.min(1, ...))`

**Impact:** Tool invocation system broken
**Estimated Fix Time:** 5 minutes

---

### 3. `src/lib/services/goServiceClient.ts` - **3 errors**
**Primary Issues:**
- Property 'boolean' missing in return types (lines 80, 134)
- Property 'string' missing in return type (line 117)

**Root Cause:** Return type declarations have extra required properties
```typescript
// BROKEN:
return type '{ rag: boolean; upload: boolean; kratos: any; boolean: any; }'

// SHOULD BE:
return type '{ rag: boolean; upload: boolean; kratos: boolean; }'
```

**Impact:** Go service health checks fail type checking
**Estimated Fix Time:** 5 minutes

---

### 4. `src/agentic-stream.ts` - **2+ errors**
**Primary Issues:**
- `,` expected (line 146)

**Root Cause:** Syntax error in onChunk call
```typescript
// BROKEN:
await onChunk(token: tokens.slice(0, i + 1).join(' ') + ...)

// SHOULD BE:
await onChunk(token, tokens.slice(0, i + 1).join(' ') + ...)
```

**Impact:** Streaming functionality broken
**Estimated Fix Time:** 3 minutes

---

### 5. `src/lib/env/index.ts` - **1 error**
**Primary Issues:**
- Cannot find module '$env/dynamic/public'

**Root Cause:** Missing SvelteKit generated types
**Impact:** Environment variable access broken
**Estimated Fix Time:** 2 minutes (regenerate types or fix import)

---

## 🟡 HIGH PRIORITY (Fix Next)

### 6. `src/routes/(app)/codebase-index/[fileId]/+page.server.ts` - **10 errors**
**Impact:** Codebase indexing route broken
**Estimated Fix Time:** 15 minutes

### 7. `src/routes/+page.server.ts` - **5 errors**
**Impact:** Home page server logic broken
**Estimated Fix Time:** 10 minutes

### 8. `src/routes/(app)/evidence/upload/+page.server.ts` - **4 errors**
**Impact:** Evidence upload endpoint (Phase 99 testing target!)
**Estimated Fix Time:** 10 minutes

### 9. `src/routes/(app)/evidence/+page.server.ts` - **4 errors**
**Impact:** Evidence listing page
**Estimated Fix Time:** 10 minutes

---

## 🟢 MEDIUM PRIORITY

### 10. `src/routes/(app)/phase78/routes/[routePath]/+page.server.ts` - **2 errors**
### 11. `src/routes/(app)/analysis-center/+page.server.ts` - **1 error**
### 12. `src/routes/(app)/codebase-index/+page.server.ts` - **1 error**
### 13. `src/routes/(app)/cases/new/+page.server.ts` - **1 error**
### 14. `src/routes/chat/[id]/+page.server.ts` - **1 error**

---

## 🎯 Recommended Fix Order

1. ✅ **Fix `evidence.ts` first** (32 errors) - Unblocks all evidence types
2. ✅ **Fix `ToolInvoker.ts`** (4 errors) - Critical infrastructure
3. ✅ **Fix `goServiceClient.ts`** (3 errors) - Service health checks
4. ✅ **Fix `agentic-stream.ts`** (2 errors) - Streaming functionality
5. ✅ **Fix `env/index.ts`** (1 error) - Environment variables
6. ⏳ **Fix evidence routes** - Needed for Phase 99 Playwright tests
7. ⏳ **Fix remaining route files** - Lower priority

---

## 📈 Expected Impact

**Fixing Top 5 Files:**
- Removes ~45 errors (~50% of immediate blockers)
- Unblocks evidence system for Phase 99 testing
- Restores tool invocation system
- Fixes service health monitoring

**Time Investment:** ~25 minutes
**Payoff:** Most critical systems functional

---

## 🚀 Next Steps

1. Run: `code src/lib/types/evidence.ts` - Fix syntax errors
2. Run: `code src/ToolInvoker.ts` - Fix stdout references
3. Run: `code src/lib/services/goServiceClient.ts` - Fix return types
4. Verify: `npx svelte-check --threshold error | Select-String "found" `
5. Re-run Playwright tests for Phase 99 validation
