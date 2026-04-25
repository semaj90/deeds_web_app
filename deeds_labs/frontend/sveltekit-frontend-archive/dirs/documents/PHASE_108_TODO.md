# Phase 108: Error Fixing To-Do List

**Generated:** January 20, 2026
**Total Errors:** 10,603
**Total Files with Errors:** 594
**Errors in Core Routes (`src/routes/`):** 9 (0.08%)

## 📊 Summary by Category

| Category | Files | Est. Errors | Priority |
|----------|-------|-------------|----------|
| **Database/Schema** | ~30 | ~2,000 | 🔴 HIGH |
| **Server Services** | ~80 | ~3,500 | 🔴 HIGH |
| **AI/LLM Integration** | ~25 | ~1,500 | 🟡 MEDIUM |
| **Testing/Benchmarks** | ~15 | ~500 | 🟢 LOW |
| **UI Components** | ~50 | ~800 | 🟡 MEDIUM |
| **Utilities/Storage** | ~40 | ~1,000 | 🟡 MEDIUM |
| **Other** | ~354 | ~1,303 | 🟢 LOW |

---

## 🔴 Priority 1: Database & Schema (Fix First)
These files are foundational. Fixing them will cascade fixes to dependent files.

| Rank | File | Errors | Action |
|------|------|--------|--------|
| 1 | `src/lib/server/db/pgvector-service.ts` | 92 | Manual rewrite |
| 2 | `src/lib/server/db/pgvector-utils.temp.ts` | 71 | Manual rewrite |
| 3 | `src/lib/server/db/jsonb-legal-schema.ts` | 69 | Manual rewrite |
| 4 | `src/lib/server/db/schema-phase78.ts` | 65 | ⚠️ FRAGILE - Review carefully |
| 5 | `src/lib/server/db/vector-operations.ts` | 64 | Manual rewrite |
| 6 | `src/lib/server/db/connection-manager.ts` | 58 | Manual rewrite |
| 7 | `src/lib/server/db/couchdb.ts` | 52 | Manual rewrite |
| 8 | `src/lib/server/db/postgres-knowledge.ts` | 46 | Manual rewrite |
| 9 | `src/lib/db/schema.ts` | 44 | Verify against Drizzle |
| 10 | `src/lib/server/db/seed-simple.ts` | 44 | Manual rewrite |

---

## 🔴 Priority 2: Core Server Services
Critical backend functionality.

| Rank | File | Errors | Action |
|------|------|--------|--------|
| 11 | `src/lib/server/services/grpoThinkingService.ts` | 78 | Manual rewrite |
| 12 | `src/lib/server/keyword-extractor.ts` | 77 | Manual rewrite |
| 13 | `src/lib/server/error-brain/run-tracker.ts` | 76 | Manual rewrite |
| 14 | `src/lib/server/config.ts` | 75 | Manual rewrite |
| 15 | `src/lib/server/services/unified-vector-service.ts` | 73 | Manual rewrite |
| 16 | `src/lib/server/services/statute-search.service.ts` | 67 | Manual rewrite |
| 17 | `src/lib/server/error-brain/patch-generator.ts` | 67 | Manual rewrite |
| 18 | `src/lib/server/terminalFunctions.ts` | 67 | Manual rewrite |
| 19 | `src/lib/server/context/contextual.ts` | 66 | Manual rewrite |
| 20 | `src/lib/server/llm/ollamaClient.ts` | 66 | Manual rewrite |

---

## 🟡 Priority 3: AI/LLM Integration
Important for core legal-AI features.

| Rank | File | Errors | Action |
|------|------|--------|--------|
| 21 | `src/lib/server/llm/gemmaIntake.ts` | 78 | Manual rewrite |
| 22 | `src/lib/server/acp/phase90-tools.ts` | 68 | Manual rewrite |
| 23 | `src/lib/server/services/qdrant/dual-collection-strategy.ts` | 59 | Manual rewrite |
| 24 | `src/lib/server/services/summarization/gemma-legal-summarizer.ts` | 59 | Manual rewrite |
| 25 | `src/lib/server/embedding-cache-middleware.ts` | 49 | Manual rewrite |

---

## 🟡 Priority 4: Storage & Caching
Important for performance but not blocking.

| Rank | File | Errors | Action |
|------|------|--------|--------|
| 26 | `src/lib/text/base64-fp32-quantizer.ts` | 72 | Manual rewrite |
| 27 | `src/lib/storage/unified-dimensional-store.ts` | 64 | Manual rewrite |
| 28 | `src/lib/server/vector-cache.ts` | 58 | Manual rewrite |
| 29 | `src/lib/storage/rag-storage.ts` | 49 | Manual rewrite |
| 30 | `src/lib/server/redis-cache.ts` | 39 | Manual rewrite |

---

## 🟢 Priority 5: Testing/Benchmarks (Defer)
Not blocking production.

| Rank | File | Errors | Action |
|------|------|--------|--------|
| 31 | `src/lib/testing/gpu-markdown.test.ts` | 90 | Defer or delete |
| 32 | `src/lib/testing/gpu-markdown-benchmark.ts` | 56 | Defer or delete |
| 33 | `src/lib/testing/run-json-validation-pipeline.ts` | 36 | Defer or delete |

---

## ✅ Routes Status (CLEAN!)
Core routes (`src/routes/`) have only **9 errors** across 2 files.
These are likely type mismatches from imported services, and will auto-fix once Priority 1 & 2 are complete.

---

## 📈 Estimated Impact
If we fix the **Top 30 files** (Priority 1 + 2 + 3):
- Direct Error Reduction: ~2,100 errors
- Cascade Effect Estimate: ~500-1,000 additional errors
- **Projected Total After Fix:** ~7,500 errors (-30%)

---

## 🛠️ Recommended Approach

### Phase 108.1: Database Foundation (Today)
1. Fix `pgvector-service.ts`
2. Fix `pgvector-utils.temp.ts`
3. Fix `jsonb-legal-schema.ts`
4. **CAREFULLY** review `schema-phase78.ts`
5. Run `tsc` after each file to measure cascade effect

### Phase 108.2: Server Core (Next)
1. Fix files ranked 11-20
2. Focus on services that import from database files

### Phase 108.3: AI Integration (After)
1. Fix LLM-related files
2. Ensure Ollama/Qdrant integrations work

### Phase 108.4: Cleanup (Final)
1. Delete or stub test files
2. Consolidate duplicate services
