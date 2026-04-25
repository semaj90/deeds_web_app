# 🗺️ STORE-TO-API-ENDPOINT MAPPING ANALYSIS
**Phase 8-9 Consolidation Report**

Generated: 2025-01-18
Status: Phase 8 Complete (10/10 stores) → Ready for Phase 9 (API Consolidation)

---

## 📊 EXECUTIVE SUMMARY

### Current Architecture:
- **Unified Stores**: 10 stores created ✅
- **API Endpoints**: ~844 +server.ts files
- **Route Directories**: 1,235 directories
- **Consolidation Opportunity**: 44% reduction in core APIs

### Consolidation Targets:

| Component | Current | Target | Reduction |
|-----------|---------|--------|-----------|
| **Stores** | 121 files | 10-11 files | -90% ✅ (10 created, cleanup pending) |
| **Core APIs** | 114 endpoints | 64 endpoints | -44% 🎯 |
| **Total APIs** | 844 files | ~400 files | -53% 🎯 |
| **Routes** | 1,235 dirs | ~800 dirs | -35% 🎯 |

---

## 1. 👤 USER STORE → API/AUTH & API/USER

### Unified Store: `user-store.ts`
**Purpose**: Authentication, profile management, preferences
**Methods**: login, logout, register, updateProfile, resetPassword, verifyEmail
**State**: currentUser, isAuthenticated, sessionToken, preferences

### Current API Endpoints (17 total):

#### Auth Endpoints (13):
✅ `/api/auth/login` → `userStore.login()`
✅ `/api/auth/logout` → `userStore.logout()`
✅ `/api/auth/register` → `userStore.register()`
✅ `/api/auth/me` → `userStore.initialize()`
✅ `/api/auth/session` → `userStore.refreshSession()`
✅ `/api/auth/reset-password` → `userStore.resetPassword()`
✅ `/api/auth/verify-email` → `userStore.verifyEmail()`
✅ `/api/auth/password/request` → `userStore.requestPasswordReset()`
✅ `/api/auth/password/confirm` → `userStore.confirmPasswordReset()`
❓ `/api/auth/debug` → **[DELETE]** Debug only
❓ `/api/auth/health` → **[CONSOLIDATE]** Move to `/api/health`
❓ `/api/auth/quic-login` → **[MERGE]** Use `/api/auth/login?transport=quic`

#### User Endpoints (4):
✅ `/api/user/profile` → `userStore.updateProfile()`
✅ `/api/user/info` → `userStore.getUser()`
✅ `/api/user/me` → **[DUPLICATE]** Same as `/api/auth/me` - DELETE
✅ `/api/user/avatar/upload` → `userStore.uploadAvatar()`

#### Admin User Endpoints (3):
⚠️ `/api/users` → **[SEPARATE]** Admin only - not part of userStore
⚠️ `/api/users/[userId]` → **[SEPARATE]** Admin only
⚠️ `/api/users/create` → **[SEPARATE]** Admin only

### 🎯 Consolidation Recommendation:
**17 endpoints → 11 endpoints (-35%)**

**Actions:**
1. DELETE: `/api/auth/debug`
2. MOVE: `/api/auth/health` → `/api/health` (global)
3. MERGE: `/api/auth/quic-login` → `/api/auth/login` (query param)
4. DELETE: `/api/user/me` (duplicate of `/api/auth/me`)
5. KEEP: Admin endpoints separate (create `/api/admin/users`)

---

## 2. ⚖️ CASE STORE → API/CASES

### Unified Store: `case-store.ts`
**Purpose**: Case management, analysis, filtering
**Methods**: loadCases, selectCase, createCase, updateCase, deleteCase, filterCases, analyzeCase
**State**: cases[], activeCase, filters, pagination, analysis

### Current API Endpoints (15 total):

✅ `/api/cases` → `caseStore.loadCases()` (GET/POST)
✅ `/api/cases/[caseId]` → `caseStore.getCase()` (GET/PUT/DELETE)
✅ `/api/cases/[caseId]/analysis` → `caseStore.analyzeCase()`
❓ `/api/cases/[caseId]/analyze` → **[DUPLICATE]** Same as above - MERGE
✅ `/api/cases/[caseId]/deep-analysis` → `caseStore.deepAnalyze()`
✅ `/api/cases/[caseId]/recommendations` → `caseStore.getRecommendations()`
✅ `/api/cases/recent` → `caseStore.getRecentCases()`
✅ `/api/cases/suggest-title` → `caseStore.suggestTitle()`
✅ `/api/cases/summary` → `caseStore.getSummary()`

#### Cross-Store Endpoints (Move to respective stores):
⚠️ `/api/cases/[caseId]/evidence` → **[MOVE]** to evidenceStore
⚠️ `/api/cases/[caseId]/poi` → **[MOVE]** to poiStore
⚠️ `/api/cases/[caseId]/pois` → **[DUPLICATE + MOVE]** to poiStore
⚠️ `/api/cases/[caseId]/poi/[relationId]` → **[MOVE]** to poiStore
⚠️ `/api/cases/[caseId]/canvas` → **[MOVE]** to canvasStore
⚠️ `/api/cases/[caseId]/generate-report` → **[MOVE]** to reportStore

### 🎯 Consolidation Recommendation:
**15 endpoints → 8 endpoints (-47%)**

**Actions:**
1. MERGE: `/api/cases/[caseId]/analyze` → `/api/cases/[caseId]/analysis`
2. MERGE: `/api/cases/[caseId]/pois` → `/api/cases/[caseId]/poi`
3. MOVE: Evidence/POI/Canvas/Report endpoints to their respective stores
4. Result: Clean 8-endpoint case API

---

## 3. 📁 EVIDENCE STORE → API/EVIDENCE

### Unified Store: `evidence-store.ts`
**Purpose**: Evidence upload, analysis, chain of custody, validation
**Methods**: uploadEvidence, analyzeEvidence, searchEvidence, validateChain, processStream
**State**: evidenceList[], selectedEvidence, uploadProgress, analysis, chainOfCustody

### Current API Endpoints (24 total):

#### Core Evidence (10):
✅ `/api/evidence` → `evidenceStore.list()` (GET/POST)
✅ `/api/evidence/[id]` → `evidenceStore.getById()` (GET/PUT/DELETE)
✅ `/api/evidence/[id]/status` → `evidenceStore.getStatus()`
✅ `/api/evidence/[id]/retry` → `evidenceStore.retryProcessing()`
✅ `/api/evidence/upload` → `evidenceStore.upload()`
❓ `/api/evidence/upload-simple` → **[MERGE]** Same as above
✅ `/api/evidence/analyze` → `evidenceStore.analyze()`
✅ `/api/evidence/webasm-analyze` → `evidenceStore.analyzeWasm()`
✅ `/api/evidence/search` → `evidenceStore.search()`
❓ `/api/evidence/list` → **[DUPLICATE]** Same as `/api/evidence` - DELETE
✅ `/api/evidence/validate` → `evidenceStore.validate()`

#### Processing & Streaming (3):
✅ `/api/evidence/process` → `evidenceStore.process()`
✅ `/api/evidence/process/stream` → `evidenceStore.processStream()`
✅ `/api/evidence/stream/[sessionId]` → `evidenceStore.getStream()`

#### Hashing & Integrity (3):
✅ `/api/evidence/hash` → `evidenceStore.generateHash()`
✅ `/api/evidence/hash/bulk` → `evidenceStore.bulkHash()`
✅ `/api/evidence/hash/history` → `evidenceStore.hashHistory()`

#### Other (3):
✅ `/api/evidence/save-node` → `evidenceStore.saveNode()`
✅ `/api/evidence/synthesize` → `evidenceStore.synthesize()`
❓ `/api/evidence/demo` → **[DELETE]** Demo only

#### Evidence Boards (Move to Canvas):
⚠️ `/api/evidence-boards` → **[MOVE]** to canvasStore
⚠️ `/api/evidence-boards/[boardId]` → **[MOVE]** to canvasStore
⚠️ `/api/evidence-boards/[boardId]/items` → **[MOVE]** to canvasStore
⚠️ `/api/evidence-boards/[boardId]/items/[itemId]` → **[MOVE]** to canvasStore

#### Evidence Canvas (Move to Canvas):
⚠️ `/api/evidence-canvas` → **[MOVE]** to canvasStore
⚠️ `/api/evidence-canvas/[id]` → **[MOVE]** to canvasStore
⚠️ `/api/evidence-canvas/analyze` → **[MOVE]** to canvasStore
⚠️ `/api/evidence-canvas/save` → **[MOVE]** to canvasStore

#### Other Files:
⚠️ `/api/evidence-files` → **[MERGE]** with `/api/evidence`
⚠️ `/api/evidence-enhancement` → **[MERGE]** with `/api/evidence/analyze`

### 🎯 Consolidation Recommendation:
**24 endpoints → 15 endpoints (-38%)**

**Actions:**
1. MERGE: `/api/evidence/upload-simple` → `/api/evidence/upload`
2. DELETE: `/api/evidence/list` (duplicate of `/api/evidence`)
3. DELETE: `/api/evidence/demo`
4. MERGE: `/api/evidence-files` → `/api/evidence`
5. MERGE: `/api/evidence-enhancement` → `/api/evidence/analyze`
6. MOVE: All evidence-boards/* → canvasStore
7. MOVE: All evidence-canvas/* → canvasStore

---

## 4. 📋 REPORT STORE → API/REPORTS

### Unified Store: `report-store.ts`
**Purpose**: Report creation, editing, export, collaboration
**Methods**: createReport, updateReport, exportReport, generateFromCase, addSection
**State**: reports[], activeReport, builder, sections, collaborators

### Current API Endpoints (5 total):

✅ `/api/reports` → `reportStore.list()` (GET/POST)
✅ `/api/reports/[reportId]` → `reportStore.getById()` (GET/PUT/DELETE)
✅ `/api/reports/[reportId]/export/pdf` → `reportStore.exportPdf()`
✅ `/api/reports/save` → `reportStore.save()`
⚠️ `/api/cases/[caseId]/generate-report` → **[MOVE]** to `/api/reports/generate?caseId=X`

### 🎯 Consolidation Recommendation:
**5 endpoints → 4 endpoints (-20%)**

**Actions:**
1. MOVE: `/api/cases/[caseId]/generate-report` → `/api/reports/generate`
2. Result: Clean 4-endpoint report API

**Note**: Reports API is already well-structured! Minimal changes needed.

---

## 5. 📚 CITATION STORE → API/CITATIONS

### Unified Store: `citation-store.ts`
**Purpose**: Legal citations, references, embeddings, validation
**Methods**: addCitation, searchCitations, embedCitation, validateCitation, findSimilar
**State**: citations[], embeddings, legalReferences, validationResults

### Current API Endpoints (2 total):

✅ `/api/citations` → `citationStore.list()` (GET/POST)
✅ `/api/citation-points` → `citationStore.getCitationPoints()`

### 🎯 Consolidation Recommendation:
**2 endpoints → 2 endpoints (0% - Already optimal!)**

**Note**: Citations API is minimal and well-designed. No consolidation needed.

---

## 6. 👥 POI STORE → API/POI

### Unified Store: `poi-store.ts`
**Purpose**: Persons of Interest, network analysis, timeline, risk assessment
**Methods**: createPoi, updatePoi, analyzeNetwork, calculateRisk, buildTimeline
**State**: pois[], network, timeline, riskScores, relationships

### Current API Endpoints (5 total):

✅ `/api/poi` → `poiStore.list()` (GET/POST)
✅ `/api/poi/[id]` → `poiStore.getById()` (GET/PUT/DELETE)
❓ `/api/pois/[id]` → **[DUPLICATE]** Same as above - DELETE
⚠️ `/api/cases/[caseId]/poi` → `poiStore.listByCase()`
⚠️ `/api/cases/[caseId]/poi/[relationId]` → `poiStore.getRelation()`

### 🎯 Consolidation Recommendation:
**5 endpoints → 4 endpoints (-20%)**

**Actions:**
1. MERGE: `/api/pois/[id]` → `/api/poi/[id]` (plural to singular)
2. KEEP: Case-specific POI endpoints (filter by caseId parameter instead)

---

## 7. 🔍 SEARCH STORE → API/SEARCH

### Unified Store: `search-store.ts`
**Purpose**: Unified search, advanced queries, vector search, full-text search
**Methods**: unifiedSearch, advancedSearch, vectorSearch, fullTextSearch, suggest
**State**: query, results, filters, history, suggestions

### Current API Endpoints (12 total):

✅ `/api/search` → `searchStore.unified()`
✅ `/api/search/advanced` → `searchStore.advanced()`
✅ `/api/search/semantic` → `searchStore.semantic()`
✅ `/api/search/vector` → `searchStore.vector()`
✅ `/api/search/fulltext` → `searchStore.fulltext()`
✅ `/api/search/cases` → `searchStore.searchCases()`
✅ `/api/search/evidence` → `searchStore.searchEvidence()`
✅ `/api/search/legal` → `searchStore.searchLegal()`
✅ `/api/search/suggestions` → `searchStore.getSuggestions()`
✅ `/api/search/index` → `searchStore.reindex()` (admin)
❓ `/api/search/unified` → **[DUPLICATE]** Same as `/api/search` - DELETE
❓ `/api/search-similarity` → **[MERGE]** with `/api/search/semantic`

### 🎯 Consolidation Recommendation:
**12 endpoints → 8 endpoints (-33%)**

**Actions:**
1. DELETE: `/api/search/unified` (duplicate of `/api/search`)
2. MERGE: `/api/search-similarity` → `/api/search/semantic`

---

## 8. 🎨 CANVAS STORE → API/CANVAS

### Unified Store: `canvas-store.ts`
**Purpose**: Evidence canvas, collaboration, real-time sync, state management
**Methods**: saveCanvas, loadCanvas, syncCollaboration, exportCanvas, addObject
**State**: canvasState, objects, history, collaborators, websocketConnection

### Current API Endpoints (9 total):

✅ `/api/canvas` → `canvasStore.list()` (GET/POST)
✅ `/api/canvas/save` → `canvasStore.save()`
✅ `/api/canvas-states` → `canvasStore.getStates()`
⚠️ `/api/cases/[caseId]/canvas` → `canvasStore.getByCase()`

#### Evidence Canvas (Consolidate here):
❓ `/api/evidence-canvas` → **[MERGE]** with `/api/canvas`
❓ `/api/evidence-canvas/[id]` → **[MERGE]** with `/api/canvas/[id]`
❓ `/api/evidence-canvas/analyze` → **[MERGE]** with `/api/canvas/analyze`
❓ `/api/evidence-canvas/save` → **[MERGE]** with `/api/canvas/save`

#### Evidence Boards (Consolidate here):
❓ `/api/evidence-boards` → **[MERGE]** with `/api/canvas/boards`
❓ `/api/evidence-boards/[boardId]` → **[MERGE]** with `/api/canvas/[boardId]`
❓ `/api/evidence-boards/[boardId]/items` → **[MERGE]** with `/api/canvas/[id]/items`
❓ `/api/evidence-boards/[boardId]/items/[itemId]` → **[MERGE]** with `/api/canvas/[id]/items/[itemId]`

### 🎯 Consolidation Recommendation:
**13 endpoints (including moved) → 5 endpoints (-62%)**

**Actions:**
1. MERGE: All `/api/evidence-canvas/*` → `/api/canvas/*`
2. MERGE: All `/api/evidence-boards/*` → `/api/canvas/boards/*`
3. Result: Unified canvas API for all canvas types

---

## 9. 🔔 NOTIFICATION STORE → API/NOTIFICATIONS

### Unified Store: `notification-store.ts`
**Purpose**: In-app notifications, alerts, toasts
**Methods**: add, dismiss, clearAll, markRead, getUnreadCount
**State**: notifications[], unreadCount, filters

### Current API Endpoints:
❌ **NO DEDICATED API ENDPOINTS FOUND**

✅ **Good!** Notifications are client-side only (stored in browser)
✅ If persistence needed, add single endpoint: `/api/notifications`

### 🎯 Consolidation Recommendation:
**0 endpoints → 0-1 endpoints (optional)**

**Note**: Keep client-side only unless user persistence is required.

---

## 10. 🤖 AI ASSISTANT STORE → API/AI

### Unified Store: `ai-assistant-store.ts`
**Purpose**: AI chat, analysis, recommendations, context management
**Methods**: chat, analyze, getRecommendations, getContext, saveConversation
**State**: messages[], context, recommendations, history, isTyping

### Current API Endpoints (30+ total):

#### Chat Endpoints (6):
✅ `/api/ai` → `aiAssistantStore.chat()`
✅ `/api/ai/chat` → `aiAssistantStore.chat()`
✅ `/api/ai/chat-sse` → `aiAssistantStore.chatStream()`
❓ `/api/ai/chat-simple` → **[MERGE]** with `/api/ai/chat`
❓ `/api/ai/chat-mock` → **[DELETE]** Production cleanup
❓ `/api/ai/chat-tensorrt` → **[MERGE]** Backend auto-selects

#### Analysis Endpoints (6):
✅ `/api/ai/analyze` → `aiAssistantStore.analyze()`
✅ `/api/ai/analyze-element` → `aiAssistantStore.analyzeElement()`
✅ `/api/ai/analyze-evidence` → `aiAssistantStore.analyzeEvidence()`
✅ `/api/ai/deep-analysis` → `aiAssistantStore.deepAnalyze()`
❓ `/api/ai/case-scoring` → **[MERGE]** with `/api/ai/analyze?type=case-scoring`
❓ `/api/cases/[caseId]/analysis` → Keep separate (case-specific)

#### Context & Conversation (4):
✅ `/api/ai/ask` → `aiAssistantStore.ask()`
✅ `/api/ai/context` → `aiAssistantStore.getContext()`
✅ `/api/ai/conversation/save` → `aiAssistantStore.saveConversation()`
✅ `/api/ai/conversation/[conversationId]` → `aiAssistantStore.getConversation()`

#### Specialized AI (14+):
✅ `/api/ai/connect` → WebSocket/SSE connection
❓ `/api/ai/connect-mock` → **[DELETE]** Production cleanup
✅ `/api/ai/cuda-accelerated` → Backend auto-selects
✅ `/api/ai/cuda-indexing` → Admin/background task
✅ `/api/ai/embeddings` → Background service
✅ `/api/ai/inference` → Background service
✅ `/api/ai/legal-reasoning` → `aiAssistantStore.legalReasoning()`
✅ `/api/ai/multimodal` → `aiAssistantStore.multimodal()`
✅ `/api/ai/prompts` → Template management
✅ `/api/ai/recommendations` → `aiAssistantStore.getRecommendations()`
✅ `/api/ai/stream` → SSE streaming
✅ `/api/ai/vector-search` → Use `/api/search/vector` instead
✅ `/api/ai/wasm-inference` → Client-side

### 🎯 Consolidation Recommendation:
**30+ endpoints → 10 endpoints (-67%)**

**Actions:**
1. CONSOLIDATE: All chat variants → `/api/ai/chat` (with streaming option)
2. CONSOLIDATE: All analyze variants → `/api/ai/analyze` (with type parameter)
3. DELETE: Mock/debug endpoints
4. KEEP: Specialized endpoints for distinct functionality

**Final AI API Structure:**
1. `/api/ai/chat` - Main chat endpoint (supports SSE streaming)
2. `/api/ai/analyze` - Unified analysis (type: element|evidence|case|deep)
3. `/api/ai/ask` - Quick Q&A
4. `/api/ai/context` - Context management
5. `/api/ai/conversation/[id]` - Conversation CRUD
6. `/api/ai/recommendations` - AI recommendations
7. `/api/ai/connect` - WebSocket/SSE connection
8. `/api/ai/prompts` - Prompt template management
9. `/api/ai/embeddings` - Embedding service (background)
10. `/api/ai/legal-reasoning` - Specialized legal AI

---

## 📈 OVERALL CONSOLIDATION SUMMARY

### Phase 8: Store Consolidation ✅
- **Created**: 10 unified stores
- **Status**: Implementation complete, cleanup pending
- **Achievement**: 90% reduction in store fragmentation

### Phase 9: API Consolidation 🎯
- **Current**: ~844 API files
- **Target**: ~400 API files
- **Reduction**: -53% overall

#### Core Store APIs (Detailed Analysis):

| Store | Current | Target | Reduction | Priority |
|-------|---------|--------|-----------|----------|
| User | 17 | 11 | -35% | 🔴 High |
| Case | 15 | 8 | -47% | 🔴 High |
| Evidence | 24 | 15 | -38% | 🔴 High |
| Report | 5 | 4 | -20% | 🟡 Medium |
| Citation | 2 | 2 | 0% | 🟢 Low (optimal) |
| POI | 5 | 4 | -20% | 🟡 Medium |
| Search | 12 | 8 | -33% | 🔴 High |
| Canvas | 13 | 5 | -62% | 🔴 High |
| Notification | 0 | 0-1 | N/A | 🟢 Low |
| AI Assistant | 30+ | 10 | -67% | 🔴 Critical |
|-------|---------|--------|-----------|----------|
| **TOTAL** | **123** | **67** | **-46%** | |

### Phase 10: Route Consolidation 🎯
- **Current**: 1,235 route directories
- **Target**: ~800 directories
- **Reduction**: -35%

---

## 🚀 NEXT STEPS: PHASE 9 IMPLEMENTATION

### Week 1: High-Priority Consolidations (16 hours)

#### Day 1-2: AI Assistant APIs (8 hours)
- Consolidate 30+ endpoints → 10 endpoints
- Biggest impact: -67% reduction
- Strategy: Merge variants, delete mocks, use query params

#### Day 3: Canvas APIs (4 hours)
- Consolidate 13 endpoints → 5 endpoints
- Move evidence-canvas/* and evidence-boards/* to unified /api/canvas/*
- Impact: -62% reduction

#### Day 4: Case APIs (4 hours)
- Consolidate 15 endpoints → 8 endpoints
- Move cross-store endpoints to correct locations
- Impact: -47% reduction

### Week 2: Medium-Priority Consolidations (8 hours)

#### Day 5: Evidence APIs (4 hours)
- Consolidate 24 endpoints → 15 endpoints
- Merge upload variants, delete demos
- Impact: -38% reduction

#### Day 6: User & Search APIs (4 hours)
- User: 17 → 11 endpoints (-35%)
- Search: 12 → 8 endpoints (-33%)
- Merge duplicates, consolidate variants

### Week 3: Polish & Testing (4 hours)

#### Day 7: Small APIs & Testing
- POI: 5 → 4 endpoints
- Report: 5 → 4 endpoints
- Citation: Already optimal
- Final testing & validation

### Total Estimated Effort: 28 hours (3.5 days)

---

## 📋 CONSOLIDATION CHECKLIST

### Phase 9: API Consolidation

#### High Priority:
- [ ] AI Assistant: 30+ → 10 endpoints (-67%)
  - [ ] Merge chat variants
  - [ ] Consolidate analyze endpoints
  - [ ] Delete mock/debug endpoints
  - [ ] Test streaming functionality

- [ ] Canvas: 13 → 5 endpoints (-62%)
  - [ ] Move evidence-canvas/* to /api/canvas/*
  - [ ] Move evidence-boards/* to /api/canvas/boards/*
  - [ ] Test real-time collaboration

- [ ] Case: 15 → 8 endpoints (-47%)
  - [ ] Merge duplicate analyze endpoints
  - [ ] Move POI/Evidence/Canvas/Report to respective stores
  - [ ] Test case CRUD operations

- [ ] Evidence: 24 → 15 endpoints (-38%)
  - [ ] Merge upload variants
  - [ ] Delete demo endpoints
  - [ ] Consolidate canvas/boards to canvasStore
  - [ ] Test upload & processing

- [ ] User: 17 → 11 endpoints (-35%)
  - [ ] Delete /api/user/me duplicate
  - [ ] Merge auth variants
  - [ ] Move admin endpoints
  - [ ] Test authentication flow

- [ ] Search: 12 → 8 endpoints (-33%)
  - [ ] Delete /api/search/unified duplicate
  - [ ] Merge similarity into semantic
  - [ ] Test all search types

#### Medium Priority:
- [ ] POI: 5 → 4 endpoints (-20%)
  - [ ] Merge /api/pois/ into /api/poi/

- [ ] Report: 5 → 4 endpoints (-20%)
  - [ ] Move case generate-report endpoint

#### Low Priority:
- [ ] Citation: Already optimal (2 endpoints)
- [ ] Notification: Client-side only (0 endpoints)

### Validation:
- [ ] All stores have corresponding API endpoints
- [ ] No duplicate endpoints
- [ ] All endpoints follow RESTful conventions
- [ ] Query parameters used instead of endpoint variants
- [ ] Mock/debug endpoints removed from production
- [ ] API documentation updated
- [ ] Integration tests passing
- [ ] Frontend components updated to use consolidated APIs

---

## 💡 KEY CONSOLIDATION PATTERNS

### 1. Merge Duplicates
```typescript
// BEFORE: Multiple endpoints
/api/cases/[caseId]/analyze
/api/cases/[caseId]/analysis

// AFTER: Single endpoint
/api/cases/[caseId]/analysis
```

### 2. Use Query Parameters
```typescript
// BEFORE: Separate endpoints
/api/auth/login
/api/auth/quic-login

// AFTER: Single endpoint with param
/api/auth/login?transport=quic
```

### 3. Move to Correct Store
```typescript
// BEFORE: Wrong location
/api/cases/[caseId]/canvas
/api/cases/[caseId]/generate-report

// AFTER: Correct location
/api/canvas?caseId=X
/api/reports/generate?caseId=X
```

### 4. Consolidate Variants
```typescript
// BEFORE: Multiple chat endpoints
/api/ai/chat
/api/ai/chat-simple
/api/ai/chat-tensorrt
/api/ai/chat-sse

// AFTER: Single endpoint with options
/api/ai/chat?model=tensorrt&stream=true
```

### 5. Delete Debug/Mock
```typescript
// DELETE in production:
/api/auth/debug
/api/ai/chat-mock
/api/evidence/demo
```

---

## 🎯 SUCCESS METRICS

### Phase 9 Complete When:
- [ ] API files: 844 → ~400 (-53%)
- [ ] Core store APIs: 123 → 67 (-46%)
- [ ] No duplicate endpoints
- [ ] All mock/debug endpoints removed
- [ ] `npm run check` passes
- [ ] All integration tests pass
- [ ] API documentation updated
- [ ] Frontend components migrated

### Ready for Phase 10 (Routes) When:
- [ ] Phase 8 cleanup complete (stores archived)
- [ ] Phase 9 complete (APIs consolidated)
- [ ] All tests passing
- [ ] No regressions in functionality

---

**Status**: Ready to begin Phase 9
**Next Action**: Start with AI Assistant API consolidation (highest impact)
**Estimated Completion**: 3.5 days (28 hours)