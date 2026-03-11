# Directory Migration Review

**Date:** February 4, 2026
**Branch:** `feature/directory-migration-consolidation`

---

## 📊 Codebase Scale

### Current File Count
- **Active routes:** 290 files
- **Parked routes:** 1,922 files (6.6x more than active!)
- **Library code:** 5,065 files
- **Total src:** 7,277 files

### Migration Scope
- **134 route directories** to review
- **31 routes** → DELETE (disabled/archives/backups)
- **22 routes** → MIGRATE (core features + tests)
- **8 routes** → MERGE (duplicates)
- **73 routes** → REVIEW (manual inspection needed)

---

## 🎯 Review Strategy

### Phase 1: Safe Deletions (Low Risk)
**Target:** 31 routes - No impact on active codebase

```powershell
# Disabled routes (8)
Remove-Item -Recurse src/routes_parked/*_disabled/

# Archives (3)
Remove-Item -Recurse src/routes_parked/_archive-*
Remove-Item -Recurse src/routes_parked/_yorha_legacy

# Backups (1)
Remove-Item -Recurse src/routes_parked/*.old/
```

**Estimate:** 300-400 files (~15-20% of parked routes)

**Review Decision:** ✅ Safe to delete - these are explicitly marked as disabled/archived

---

### Phase 2: Demo Extraction (Medium Risk)
**Target:** 13 demo routes

**Option A - Delete:**
```powershell
Remove-Item -Recurse src/routes_parked/{demo,demos,agent-demo,field-demo,icon-demo,mcp-demo,ner-dialog-demo,nier-showcase,phase-74,phase72-demo,rag-demo,showcase-standalone,trt-llm-demo}
```

**Option B - Extract to Separate Repo:**
```bash
# Create deeds-demos repository
git subtree split -P src/routes_parked/demo -b demos-branch
git push git@github.com:semaj90/deeds-demos.git demos-branch:main
```

**Estimate:** 200-300 files

**Review Decision:** 🤔 **Recommend Option A** unless demos contain unique integration patterns

---

### Phase 3: Test Consolidation (High Value)
**Target:** 13 test routes

**Routes to review:**
- `ai-test/` - AI service tests
- `authenticated-crud-test/` - CRUD test patterns
- `rag-test/` - RAG pipeline tests
- `simple-test/`, `simple-upload-test/` - Basic integration tests
- `test/`, `test-case-notes/`, `test-grey-balance/`, `test-rag/`, `test-route-discovery/` - Various tests
- `ui-test/`, `upload-test/` - UI tests

**Action Plan:**
1. Use ripgrep to extract test code:
   ```bash
   rg "describe\(|test\(|it\(|expect\(" src/routes_parked/test* --json
   ```
2. Migrate to `src/tests/integration/`
3. Delete test routes after extraction

**Estimate:** 150-250 files of valuable test code

**Review Decision:** ✅ **High priority** - extract before deleting

---

### Phase 4: Core Feature Migration (Critical)
**Target:** 9 high-priority routes

#### Visual Evidence Board (Priority 1)
**Routes:**
- `evidence-board/` - Main board implementation
- `evidenceboard/` - Duplicate/variant
- `interactive-canvas/` - Canvas engine

**Merge Strategy:**
1. Review all 3 implementations
2. Extract best patterns from each
3. Migrate to new `src/routes/boards/` structure
4. Implement as packages (board-core, board-render-fabric)

**Estimate:** 100-200 files to review

---

#### Knowledge & Graph (Priority 1)
**Routes:**
- `graph-mode/` - Graph visualization
- `memory-palace/` - Spatial knowledge UI
- `brain/` - Knowledge processing

**Merge Strategy:**
1. Consolidate into `src/routes/knowledge/graph/`
2. Add Neo4j integration
3. Implement 3D visualization (Three.js/Babylon.js)

**Estimate:** 80-120 files

---

#### Investigation Tools (Priority 2)
**Routes:**
- `investigation/` - Investigation workflows
- `detective/` - Detective mode
- `yorha-detective/` - YoRHa theme variant

**Merge Strategy:**
1. Merge into `src/routes/investigate/`
2. Keep best UI patterns
3. Migrate YoRHa theme to lib/themes/

**Estimate:** 60-100 files

---

#### Legal AI (Priority 2)
**Routes:**
- `legal-ai/` - Original implementation
- `legal-ai-suite/` - Enhanced suite

**Merge Strategy:**
1. Compare features between both
2. Merge into `src/routes/legal/ai/`
3. Keep suite enhancements

**Estimate:** 120-180 files

---

### Phase 5: Duplicate Consolidation (Medium Priority)
**Target:** 8 routes with duplicates

#### Chat Variants
- `chat-standalone/` vs `phase72-chat/` vs `aichat/`
- **Action:** Merge into `src/routes/chat/`
- **Estimate:** 40-60 files

#### Search Variants
- `search-main/` vs `search-standalone/` vs `search.bak/`
- **Action:** Merge into `src/routes/rag-search/`
- **Estimate:** 50-80 files

#### YoRHa Theme
- `yorha/` vs `yorha-detective/` vs `_yorha_legacy/`
- **Action:** Extract theme to `src/lib/themes/yorha/`
- **Estimate:** 30-50 files

#### Terminal
- `terminal.old/` vs `terminal_disabled/`
- **Action:** Delete both (terminal is disabled)
- **Estimate:** 20-30 files

---

### Phase 6: Unknown Routes Review (73 routes)
**Requires manual inspection**

**High-Priority Unknowns to Review:**
```
admin/          - Admin panel (might be active)
agentic/        - Agentic workflows
api/            - API routes (likely important)
auth/           - Auth routes
brain/          - Knowledge processing
cache/          - Caching layer
command/        - Command interface
copilot/        - Copilot integration
cuda-streaming/ - GPU streaming
documents/      - Document viewer
enhanced/       - Enhanced UI
error-brain/    - Error analysis
errors/         - Error tracking
intelligence/   - Intelligence features
mcp/            - MCP integration
metrics/        - Metrics dashboard
monitor/        - System monitoring
persons/        - Persons of interest
prosecutor/     - Prosecutor mode
security/       - Security features
settings/       - User settings
storage/        - Storage management
system/         - System tools
tools/          - Utility tools
```

**Review Method:**
```bash
# For each unknown route, check:
# 1. Recent git activity
git log --oneline --since="2025-01-01" -- src/routes_parked/ROUTE_NAME/

# 2. Import usage
rg "from.*routes_parked/ROUTE_NAME" src/ --json

# 3. API dependencies
rg "fetch\(/api/ROUTE_NAME" src/ --json

# 4. TODO/FIXME markers
rg "TODO|FIXME" src/routes_parked/ROUTE_NAME/ --json
```

---

## 🔧 Implementation Plan

### Week 1: Safe Operations
- [x] Create feature branch
- [x] Generate audit report (134 routes)
- [ ] Delete 31 obsolete routes
- [ ] Delete 13 demo routes
- [ ] Extract tests from 13 test routes

**Expected reduction:** ~500-700 files

---

### Week 2: Core Feature Migration
- [ ] Implement Visual Evidence Board packages
- [ ] Create Drizzle schema + migrations for boards
- [ ] Migrate evidence-board routes
- [ ] Consolidate graph/knowledge routes
- [ ] Merge legal-ai routes

**Expected migration:** ~400-600 files

---

### Week 3: Duplicate Consolidation
- [ ] Merge chat variants
- [ ] Merge search variants
- [ ] Extract YoRHa theme
- [ ] Review investigation routes
- [ ] Delete terminal variants

**Expected reduction:** ~150-250 files

---

### Week 4: Manual Review & Cleanup
- [ ] Review 73 unknown routes (categorize each)
- [ ] Migrate valuable routes
- [ ] Delete confirmed obsolete routes
- [ ] Final cleanup of routes_parked
- [ ] Update documentation

**Expected final state:** routes_parked/ empty or <10 routes

---

## 📋 Review Checklist

### Before Deleting Any Route
- [ ] Check git log for recent activity
- [ ] Search for imports in active code
- [ ] Check for API endpoint usage
- [ ] Review for unique patterns/features
- [ ] Extract valuable test code
- [ ] Document decision in migration log

### Before Migrating Any Route
- [ ] Identify target location
- [ ] Review for Svelte 5 compatibility
- [ ] Check dependencies
- [ ] Plan integration with existing code
- [ ] Create migration task
- [ ] Test after migration

### Before Merging Duplicates
- [ ] Compare features across variants
- [ ] Identify best implementation
- [ ] Extract unique features from each
- [ ] Plan unified API
- [ ] Test merged result

---

## 🚨 Risk Assessment

### Low Risk Operations
✅ Delete disabled routes (8)
✅ Delete archives (3)
✅ Delete backups (1)
✅ Delete demos (13) - if no unique patterns

**Total:** 25 routes, ~400-500 files

---

### Medium Risk Operations
⚠️ Merge duplicates (8 routes)
⚠️ Extract tests (13 routes)
⚠️ Migrate investigation tools (3 routes)

**Total:** 24 routes, ~300-450 files

**Mitigation:** Branch workflow + thorough testing

---

### High Risk Operations
🔴 Migrate core features (9 routes)
🔴 Review unknown routes (73 routes)

**Total:** 82 routes, ~1,000+ files

**Mitigation:**
- Create feature branch for each core feature
- Manual review + approval for unknowns
- Comprehensive testing after each migration

---

## 🎯 Success Metrics

### Week 1 Target
- Routes deleted: 25-31
- Files reduced: 400-700
- Tests extracted: 50+ test cases

### Week 2 Target
- Core features migrated: 4-6
- Files migrated: 400-600
- New packages created: 3 (board-core, board-render-fabric, board-ui-svelte)

### Week 3 Target
- Duplicates merged: 8
- Files consolidated: 150-250
- Theme extraction: YoRHa complete

### Week 4 Target
- Unknown routes reviewed: 73
- Routes_parked remaining: <10
- Documentation updated: 100%

---

## ❓ Open Questions

1. **Demos:** Extract to separate repo or delete?
   - **Recommendation:** Delete unless demos show unique integration patterns

2. **Unknown routes:** How to prioritize 73 routes?
   - **Recommendation:** Use git activity + import analysis to prioritize

3. **Tests:** Playwright or Vitest format?
   - **Recommendation:** Keep existing format, organize by feature

4. **Feature branches:** One branch or multiple?
   - **Recommendation:** One branch for deletions, separate branches for each core feature migration

5. **Svelte 5:** Migrate during consolidation or after?
   - **Recommendation:** Migrate during consolidation (cleaner result)

---

## 📝 Next Steps

### Immediate (Today)
1. Review this document
2. Decide on demo strategy (delete vs extract)
3. Start Phase 1 deletions (low risk)
4. Extract test code from test routes

### This Week
1. Complete Phase 1 & 2 (deletions + test extraction)
2. Start Visual Evidence Board package structure
3. Begin Drizzle schema for boards
4. Review top 10 unknown routes

### Next Week
1. Migrate evidence-board routes
2. Consolidate knowledge/graph routes
3. Merge legal-ai variants
4. Continue unknown route review

---

**Status:** Draft - Awaiting Review & Approval
**Reviewer:** @semaj90
**Next Update:** After Phase 1 completion
