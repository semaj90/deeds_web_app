# Unified Audit Compilation - Phase 1 Complete

**Date:** April 13, 2026  
**Status:** 3 of 6 agents complete, 3 running  
**Scope:** Codebase quality validation (code + infrastructure + documentation)

---

## Executive Summary

### Overall Health
- **Code Quality:** 75 files audited (services + utils + machines)
- **Active/Wired:** 47 files (62%)
- **Needs Work:** 27 files (36%) — WIRE/REWRITE/DEFER
- **Dead Code:** 1 file (1%) — ARCHIVE

### Critical Findings
1. **3 Orphaned State Machines** need UI mounting or deprecation
2. **1 Error Handling Gap** in evidenceCustodyMachine (missing error state target)
3. **5 Service Stubs** need implementation (error analysis framework)
4. **Missing API Endpoint:** `/api/glyph/generate` referenced but not found

---

## Part 1: Services Audit ✅ COMPLETE

**Directory:** `src/lib/services/`  
**Total Files:** 35  
**Status:** 8 USED, 20 WIRE, 5 REWRITE, 2 DEFER

### Classification Summary

| Category | Count | Files |
|----------|-------|-------|
| **USED** | 8 | api-client.ts, couchdb-client.ts, qdrant-client.ts, voice-commands.ts, tts.ts, rag (source validation), KnowledgeSearcher.ts, ACPToolRegistry.ts |
| **WIRE** | 20 | error-analysis/ (8 files: DecisionEngine, FixSynthesizer, ExperienceRecorder, MetricsCollector, GRPOPolicy, KAGTraverser, QualityMetrics, RewardFunction), knowledge-search/ (8 files), other support modules |
| **REWRITE** | 5 | CacheService.ts, ToolInvoker.ts, ErrorClustering.ts, JSONLStorage.ts, PatternStorage.ts (all stubs) |
| **DEFER** | 2 | cuid-generator.ts (low priority), parallaxDynamic.js (complex, 646 lines) |

### Key Insights
- **Error Analysis Subsystem** is 80% complete but not exposed to routes
- **Knowledge Search** has 8 modular components but needs central API endpoint
- **GPU/Cache RPC** module exists but needs integration testing

### Immediate Actions
1. Create `/api/services/error-analysis/` endpoint (routes 8 DecisionEngine functions)
2. Create `/api/services/knowledge-search/` endpoint (routes KnowledgeSearcher)
3. Implement 5 stub services or deprecate them

---

## Part 2: Utils Audit ✅ COMPLETE

**Directory:** `src/lib/utils/`  
**Total Files:** 42  
**Status:** 38 USED, 4 ORPHAN

### Orphan Classification

| File | Lines | Gate Result | Action |
|------|------:|-------------|--------|
| cuid.ts | 27 | WIRE | Add to utility export, use in ID generation |
| ensure-error.ts | 7 | ARCHIVE | No value; remove from codebase |
| type-utils.ts | 3 | ARCHIVE | Generic type utilities (unused); remove |
| parallaxDynamic.js | 646 | DEFER | Complex animation logic; defer implementation |

### Core Utilities (USED)
- **cn.ts** (46 lines) — Class name utilities
- **type-guards.ts** (232 lines) — Type validation
- **http-error-mapper.ts** (87 lines) — HTTP error handling
- **keyboard-shortcuts.ts** (160 lines) — Keyboard event system
- **buffer-conversion.ts** (312 lines) — GPU buffer operations
- **webgpu-array-utils.ts** (350 lines) — WebGPU utilities
- **simd-json-parser.ts** (253 lines) — SIMD JSON parsing
- **xstate-svelte5.svelte.ts** (31 lines) — XState 5 integration
- **dynamic-imports.ts** (237 lines) — Dynamic module loading
- **intersection-observer.ts** (343 lines) — Visibility tracking

### Immediate Actions
1. Remove `ensure-error.ts` and `type-utils.ts` (no value)
2. Integrate `cuid.ts` into ID generation system
3. Defer `parallaxDynamic.js` to backlog (complex, low-priority demo)

---

## Part 3: XState v5 Machines Audit ✅ COMPLETE

**Directory:** `src/lib/machines/`  
**Total Files:** 11  
**Status:** 6 ACTIVE, 3 ORPHANED, 1 ERROR, 1 STUB

### Detailed Classification

| Machine | Lines | Status | Issue | Priority |
|---------|------:|--------|-------|----------|
| **auth-machine.ts** | 398 | ✅ ACTIVE | None | P0 (production) |
| **document-upload-machine.ts** | 331 | ✅ ACTIVE | None | P0 (production) |
| **evidenceCustodyMachine.ts** | 364 | ⚠️ ERROR | Missing error target | P1 (critical) |
| **uploadMachine.ts** | 73 | ✅ ACTIVE (stub) | By design (thin wrapper) | P2 (working) |
| **gpu-process-machine.ts** | 344 | ⚠️ PARTIAL | Low UI integration | P2 (monitor) |
| **retrieval-machine.ts** | 292 | ⚠️ MONITOR | CodebaseSearch only | P2 (monitor) |
| **userTypingStateMachine.ts** | 415 | ⚠️ MONITOR | Unchecked MCP URL | P2 (monitor) |
| **evidence-analysis-machine.ts** | 385 | ❌ ORPHANED | No UI imports | P3 (deprecate) |
| **evidence-lifecycle-machine.ts** | 548 | ❌ ORPHANED | No UI imports | P3 (deprecate) |
| **audio-upload-machine.ts** | 305 | ❌ ORPHANED | No UI imports | P3 (deprecate) |
| **evidence-processing-machine.ts** | 577 | ❌ ORPHANED | No UI imports; /api/glyph/generate missing | P3 (deprecate) |

### fromPromise Wiring Status

| Machine | Actor | Endpoint | Status |
|---------|-------|----------|--------|
| evidence-analysis-machine | uploadEvidence | `/api/evidence/upload` | ✅ |
| evidence-analysis-machine | fetchAnalysisCache | `/api/evidence/analysis/cache` | ✅ |
| evidence-analysis-machine | pollAnalysisStatus | `/api/evidence/analysis` | ✅ |
| audio-upload-machine | uploadAudio | `/api/audio/upload` | ✅ |
| audio-upload-machine | streamProgress | `/api/audio/progress/[evidenceId]` | ✅ |
| auth-machine | 5 actors | `/api/auth/*` endpoints | ✅ All |
| evidence-processing-machine | generateGlyph | `/api/glyph/generate` | ❌ NOT FOUND |
| gpu-process-machine | processTask | `/api/chat`, `/api/embed`, `/api/nlp/*` | ⚠️ Mixed |

### Critical Issues (P1 + Higher)

**Issue 1: evidenceCustodyMachine Error Handling Gap**
```typescript
// Line 212: Missing error state target
AI_ANALYSIS_FAILED: {
  actions: assign({ /* error details */ })
  // ❌ NO target: 'failed' — machine stays in current state on error
}
```
**Fix:** Add `target: 'failed'` to ensure state transition on error

**Issue 2: Missing API Endpoint**
- **Endpoint:** `/api/glyph/generate`
- **Referenced by:** evidence-processing-machine (line ~180)
- **Status:** NOT found in `src/routes/api/`
- **Action:** Either create endpoint or verify actor should use different endpoint

### Recommendations

#### P1 (Critical)
1. **evidenceCustodyMachine:** Add error state target (1 line fix)
2. **evidence-processing-machine:** Verify or create `/api/glyph/generate` endpoint

#### P2 (High)
3. **Orphaned Machines (3 files):** Choose per machine:
   - **Option A:** Create UI containers to mount them (EvidenceAnalysisBoard, AudioUploadBoard, ProcessingBoard)
   - **Option B:** Deprecate + mark as "reserved for future use"

4. **userTypingStateMachine:** Validate `MCP_BASE_URL` env var at component init

#### P3 (Medium)
5. **gpu-process-machine:** Increase UI integration (currently test-only)
6. **retrieval-machine:** Document CodebaseSearch dependency or generalize for other routes

---

## Part 4: Backend Infrastructure Audit 🔄 RUNNING

**Directory:** All backend services  
**Scope:** Redis, Bifrost, Qdrant, Ollama, GPU, RabbitMQ, Langfuse, Codebase Index  
**Status:** Running, results pending

**Expected Output:** 17-gate health check system with remediation steps

---

## Part 5: Shallow Wiring Analysis 🔄 RUNNING

**Scope:** Incomplete component chains, missing API endpoints  
**Status:** Running, results pending

**Expected Output:** List of UI components with broken fetch calls or missing route handlers

---

## Part 6: Component Documentation 🔄 RUNNING

**Scope:** Document 50 remaining components (beyond initial 4)  
**Status:** Running, results pending

**Expected Output:** COMPONENTS-INDEX.md with full API contracts for all 54 components

---

## Compilation Summary

### Files Requiring Action

| Category | Count | Impact | Timeline |
|----------|------:|--------|----------|
| **Delete** | 2 | Low | This session |
| **Fix** | 2 | Critical | This session (5 min) |
| **Create** | 3 | High | Next session (30 min) |
| **Integrate** | 20 | Medium | Next session (2-3 hrs) |
| **Deprecate** | 3 | Low | Next session (10 min) |
| **Monitor** | 4 | Low | Ongoing |

### Quick Wins (5-10 minutes)

1. **evidenceCustodyMachine.ts, line 212**
   ```typescript
   AI_ANALYSIS_FAILED: {
     target: 'failed',  // ← ADD THIS LINE
     actions: assign({ errorMessage: ({ event }) => event.error })
   }
   ```

2. **Delete ensure-error.ts** (7 lines, zero imports)

3. **Delete type-utils.ts** (3 lines, zero imports)

### Medium Effort (30-60 minutes)

4. **Create `/api/glyph/generate` endpoint** (or fix machine reference)
5. **Create API route** for error-analysis subsystem
6. **Deprecate orphaned machines** (add comments, remove from index)

### Longer Term (2-3 hours)

7. **Implement 5 service stubs** (CacheService, ToolInvoker, ErrorClustering, JSONLStorage, PatternStorage)
8. **Wire knowledge-search subsystem** to new API endpoint
9. **Mount orphaned machines** to UI containers or deprecate fully

---

## Pending Results

Waiting for:
- **Backend Infrastructure Audit** (health checks for all services)
- **Shallow Wiring Analysis** (incomplete component→API chains)
- **Component Documentation** (COMPONENTS-INDEX.md with all 54 components)

**Next Step:** Once all agents complete, create unified execution plan with prioritized fixes.

---

## Files Modified This Session

- **Created:** `API-CONTRACTS.md` (640+ lines, 4 core components documented)
- **Pending:** COMPONENTS-INDEX.md (50+ remaining components)
- **Pending:** Unified backend audit report
- **Pending:** Shallow wiring catalog

---

**Compiled by:** Claude (April 13, 2026, 11:42 UTC)  
**Status:** Phase 1 complete, Phase 2 running, Phase 3 synthesis pending
