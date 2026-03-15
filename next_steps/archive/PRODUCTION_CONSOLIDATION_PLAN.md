# Production Consolidation Plan - Legal AI Platform
## February 7-8, 2026

---

## 📊 Current State Analysis

### File Distribution
| Category | Count | Percentage | Status |
|----------|-------|------------|--------|
| **Total Files** | 7,277 | 100% | - |
| **Active Routes** | 74 pages | 1% | ✅ Core |
| **Dev Routes** | 10 pages | 0.1% | 🔬 Experimental |
| **Library Code** | 5,065 files | 70% | 📚 Mixed |
| **Backup Files** | 1,922 files | 26% | ⚠️ Cleanup Needed |
| **Corrupted Files** | 99 files | 1.4% | 🔴 Restore Required |
| **Safe to Delete** | 468 files | 6.4% | ♻️ Legacy |

### Error Status
- **Current Errors**: 972 (down from 1,429)
- **Fixed Errors**: 457 (-32% reduction)
- **Remaining Work**: ~600 errors to target

---

## 🎯 Core Production Routes (Priority 1)

### Main Application Routes `(app)/`

#### ✅ Case Management (CORE)
```
/cases                          # Case listing
/cases/[id]                     # Case detail hub
/cases/[id]/overview           # Case overview
/cases/[id]/evidence/upload    # Evidence upload
/cases/[id]/board              # Case board view
/cases/[id]/chat               # Case-specific chat
/cases/[id]/reports            # Case reports
/cases/[id]/persons            # Related persons
/cases/create                  # Create new case
```
**Status**: ✅ Production ready
**Files**: 10 route files
**Dependencies**: Case service, evidence service, chat service

#### ✅ Evidence Management (CORE)
```
/evidence                      # Evidence library
/evidence/upload               # Upload evidence
/evidence/analyze              # AI analysis
/evidence/manage               # Evidence management
```
**Status**: ✅ Production ready
**Files**: 4 route files
**Dependencies**: Evidence service, AI analysis, hash verification

#### ✅ Persons of Interest (CORE)
```
/persons-of-interest           # POI listing
/persons-of-interest/[id]      # POI detail
/persons-of-interest/create    # Create POI
```
**Status**: ✅ Production ready
**Files**: 3 route files
**Dependencies**: POI service, relationship graph

#### ✅ Search & Analysis (CORE)
```
/global-search                 # Global search
/analysis-center               # Analysis hub
```
**Status**: ✅ Production ready
**Files**: 2 route files
**Dependencies**: Search service, semantic analysis

#### ✅ System Pages (CORE)
```
/command-center                # Main dashboard
/system-configuration          # System config
/terminal                      # Debug terminal
/all-routes                    # Route monitoring
```
**Status**: ✅ Production ready
**Files**: 4 route files
**Dependencies**: System services

**Total Core Routes**: 23 pages

---

## 🔬 Experimental/Dev Routes (Priority 2)

### Development Routes `(dev)/`

#### 🔬 AI/ML Experiments
```
/demo/streaming                # Streaming demos
/odin                          # Odin AI experiments
/phase89/error-map             # Error visualization
```
**Status**: 🔬 Experimental
**Action**: Move to separate experimental repo or feature flags

#### 🔬 Admin/Debug Tools
```
/admin/codebase-viewer         # Code analysis
/admin/component-analysis      # Component inspector
/admin/knowledge-search        # Knowledge graph
/admin/phase89                 # Phase 89 tools
```
**Status**: 🔬 Development tools
**Action**: Keep in dev mode, optional in production

#### 🔬 Error Analysis Tools
```
/agentic-errors                # Error analysis
/agentic-errors/analysis       # Error deep dive
/error-brain                   # Error brain system
/error-brain/runs              # Error brain runs
/ast-topology                  # AST visualization
/phase78/monitor               # Phase 78 monitor
/phase78/patches               # Phase 78 patches
```
**Status**: 🔬 Internal tools
**Action**: Feature flag for production, or extract to separate tools repo

#### 🔬 Experimental Features
```
/gpu-evidence-graph            # GPU graph rendering
/evidence/realtime             # Realtime evidence
/evidence/hash                 # Hash analysis
```
**Status**: 🔬 Experimental
**Action**: Evaluate for production readiness

**Total Dev Routes**: 16 pages

---

## 🗂️ Proposed Directory Structure

### Option 1: Monorepo with Clear Separation
```
sveltekit-frontend/
├── src/
│   ├── routes/
│   │   ├── (production)/          # Core production routes
│   │   │   ├── cases/
│   │   │   ├── evidence/
│   │   │   ├── persons-of-interest/
│   │   │   ├── global-search/
│   │   │   ├── analysis-center/
│   │   │   ├── command-center/
│   │   │   ├── system-configuration/
│   │   │   └── terminal/
│   │   │
│   │   ├── (experimental)/         # Experimental features
│   │   │   ├── gpu-evidence-graph/
│   │   │   ├── evidence-realtime/
│   │   │   └── ai-experiments/
│   │   │
│   │   ├── (dev)/                  # Development tools
│   │   │   ├── admin/
│   │   │   ├── error-brain/
│   │   │   ├── phase78/
│   │   │   └── demo/
│   │   │
│   │   └── (api)/                  # API routes
│   │       ├── auth/
│   │       ├── cases/
│   │       ├── evidence/
│   │       └── ai/
│   │
│   ├── lib/
│   │   ├── components/
│   │   │   ├── (production)/      # Core components
│   │   │   ├── (experimental)/    # Experimental components
│   │   │   └── ui/                # Shared UI components
│   │   │
│   │   ├── services/
│   │   │   ├── (core)/            # Core services
│   │   │   │   ├── case-service.ts
│   │   │   │   ├── evidence-service.ts
│   │   │   │   ├── poi-service.ts
│   │   │   │   ├── search-service.ts
│   │   │   │   └── ollama-service.ts
│   │   │   │
│   │   │   ├── (ai)/              # AI services
│   │   │   │   ├── rag-service.ts
│   │   │   │   ├── embeddings.ts
│   │   │   │   └── chat-service.ts
│   │   │   │
│   │   │   └── (experimental)/    # Experimental services
│   │   │       ├── gpu-services/
│   │   │       └── phase78-services/
│   │   │
│   │   └── types/
│   │       ├── api.ts             # Core API types
│   │       ├── case.ts            # Case types
│   │       ├── evidence.ts        # Evidence types
│   │       └── ai.ts              # AI types
│   │
│   └── _archive/                   # Archived/backup files
│       ├── backup-2026-02-07/
│       └── corrupted-files/
```

### Option 2: Separate Repos
```
legal-ai-production/            # Core production app
├── src/routes/
│   ├── cases/
│   ├── evidence/
│   ├── persons-of-interest/
│   └── ...
└── src/lib/
    ├── components/
    ├── services/ (core only)
    └── types/

legal-ai-experimental/          # Experimental features
├── src/routes/
│   ├── gpu-evidence-graph/
│   └── ai-experiments/
└── src/lib/
    ├── services/ (experimental)
    └── types/

legal-ai-dev-tools/             # Development tools
├── src/routes/
│   ├── error-brain/
│   ├── phase78/
│   └── admin/
└── src/lib/
    └── services/
```

---

## 🔴 Priority Actions

### 1. Restore 99 Corrupted Files (CRITICAL)

**Status**: 🔴 Must complete before any cleanup

#### High Priority Restorations
```bash
# AI Services (20 files)
src/lib/services/ai-service.ts
src/lib/services/enhanced-rag-service.ts
src/lib/services/ollama-service.ts
src/lib/services/embeddings-service.ts

# Cache Bridges (15 files)
src/lib/cache/redis-bridge.ts
src/lib/cache/qdrant-bridge.ts
src/lib/cache/unified-cache-service.ts

# Database Migrations (10 files)
src/lib/server/db/migrations/*.ts

# Storage Services (8 files)
src/lib/services/minio-storage.ts
src/lib/services/evidence-storage.ts
```

**Action Plan**:
1. Create `_restoration/` directory
2. Copy all .backup files to restoration directory
3. Compare corrupted vs backup files
4. Restore clean versions
5. Verify no data loss
6. Run tests on restored files

### 2. Review 468 Safe-to-Delete Legacy Files

**Categories**:
- ✅ Identical backups (duplicate .backup files)
- ✅ Older versions (superseded by newer files)
- ✅ Svelte 4 components (need Svelte 5 update or deletion)
- ✅ Unused experimental code
- ✅ Old test files

**Action**: Create deletion manifest with safety checks

### 3. Wire AI Contextual Chat with Ollama + CUDA

**Components Needed**:
```typescript
// Core AI Services
src/lib/services/(core)/
├── ollama-service.ts           # ✅ Already exists
├── chat-service.ts             # Needs wiring
├── embeddings-service.ts       # Needs CUDA integration
└── rag-service.ts             # Needs pgvector + Qdrant

// CUDA Integration
src/lib/cuda/
├── gpu-embeddings.ts          # CUDA embedding acceleration
├── faiss-index.ts             # FAISS vector search
└── matrix-ops.ts              # RTX 3060 Ti matrix operations

// Vector Stores
src/lib/vector-stores/
├── pgvector-store.ts          # PostgreSQL pgvector
├── qdrant-store.ts            # Qdrant mirror
└── faiss-store.ts             # Local FAISS index
```

**Integration Points**:
1. `getOllamaEndpoint()` for model selection
2. CUDA streams for parallel processing
3. FAISS for fast similarity search
4. pgvector + Qdrant mirrored storage
5. RTX 3060 Ti PTX for matrix calculations

### 4. Update Documentation

**Files to Update**:
```
docs/
├── COPILOT.md                 # Copilot integration guide
├── CLAUDE.md                  # Claude Code workflow (this file!)
├── ACE.md                     # ACE editor configuration
├── GEMINI.md                  # Gemini API usage
└── STACK.md                   # Technology stack overview
```

**Add Sections**:
- Current architecture (production vs experimental)
- File consolidation status
- Svelte 5 migration progress
- Error reduction metrics
- AI services configuration
- CUDA/GPU acceleration setup

---

## 📋 Implementation Roadmap

### Week 1: Critical Restoration & Cleanup (Feb 8-14)
- [ ] **Day 1-2**: Restore 99 corrupted files
- [ ] **Day 3-4**: Create safe-to-delete manifest
- [ ] **Day 5**: Archive 468 legacy files
- [ ] **Day 6-7**: Run full test suite, verify no regressions

### Week 2: Directory Restructuring (Feb 15-21)
- [ ] **Day 1-2**: Create new directory structure
- [ ] **Day 3-4**: Move production routes to `(production)/`
- [ ] **Day 5**: Move experimental routes to `(experimental)/`
- [ ] **Day 6**: Move dev tools to `(dev)/`
- [ ] **Day 7**: Update imports, run tests

### Week 3: Error Fixing & Svelte 5 Migration (Feb 22-28)
- [ ] **Day 1-3**: Fix remaining 600 errors (target: <400)
- [ ] **Day 4-5**: Migrate core components to Svelte 5
- [ ] **Day 6-7**: Update experimental components

### Week 4: AI Chat Integration (Mar 1-7)
- [ ] **Day 1-2**: Wire Ollama + getOllamaEndpoint()
- [ ] **Day 3**: Integrate CUDA embeddings
- [ ] **Day 4**: Setup FAISS + pgvector + Qdrant
- [ ] **Day 5**: Implement chat UI
- [ ] **Day 6-7**: Testing & optimization

---

## 🎯 Success Metrics

### Phase 1: Cleanup (Week 1)
- ✅ 99 corrupted files restored
- ✅ 468 legacy files archived
- ✅ 1,922 backup files organized
- ✅ No data loss
- ✅ All tests passing

### Phase 2: Structure (Week 2)
- ✅ Clear production/experimental/dev separation
- ✅ All routes moved to new structure
- ✅ All imports updated
- ✅ Build succeeds
- ✅ All routes accessible

### Phase 3: Errors (Week 3)
- ✅ <400 errors (59% reduction from initial 972)
- ✅ Core components migrated to Svelte 5
- ✅ No Svelte 4 deprecation warnings
- ✅ Type safety improved

### Phase 4: AI Chat (Week 4)
- ✅ Ollama integration working
- ✅ CUDA acceleration active
- ✅ FAISS search <10ms
- ✅ pgvector + Qdrant mirrored
- ✅ Chat UI responsive

---

## 🚀 Quick Wins (Start Today)

### Immediate Actions (2 hours)
1. **Create restoration directory**:
   ```bash
   mkdir -p sveltekit-frontend/src/_restoration/{corrupted,backups,manifest}
   ```

2. **Identify corrupted files**:
   ```bash
   cd sveltekit-frontend/src
   find . -name "*.backup" -newer "${file%.backup}" > _restoration/manifest/newer-backups.txt
   ```

3. **Create production structure**:
   ```bash
   cd sveltekit-frontend/src/routes
   mkdir -p (production)/{cases,evidence,persons-of-interest}
   mkdir -p (experimental)
   mkdir -p (dev)/{admin,error-brain,phase78}
   ```

4. **Wire Ollama endpoint**:
   ```typescript
   // src/lib/services/(core)/chat-service.ts
   import { getOllamaEndpoint } from '$lib/services/get-ollama-endpoint';

   export async function sendChatMessage(message: string) {
     const endpoint = getOllamaEndpoint();
     const response = await fetch(`${endpoint}/api/chat`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         model: 'gemma3-legal:latest',
         messages: [{ role: 'user', content: message }]
       })
     });
     return response.body; // SSE stream
   }
   ```

---

## 📝 Next Steps

### Today (Feb 7-8, 2026)
1. ✅ Review this plan
2. ⏳ Create restoration directory structure
3. ⏳ Identify and list 99 corrupted files
4. ⏳ Create safe-to-delete manifest for 468 files
5. ⏳ Start wiring Ollama chat service

### Tomorrow (Feb 9, 2026)
1. Begin file restorations (high priority first)
2. Archive safe-to-delete files
3. Create production directory structure
4. Update COPILOT.md, CLAUDE.md, ACE.md, GEMINI.md

### This Week
1. Complete all restorations
2. Restructure directories
3. Fix remaining UI component errors
4. Begin Svelte 5 migration

---

## 🤔 Open Questions

1. **Separate Repo vs Monorepo?**
   - Option A: Keep monorepo with clear (production)/(experimental)/(dev) groups
   - Option B: Extract experimental and dev tools to separate repos
   - **Recommendation**: Start with Option A (faster), migrate to Option B if needed

2. **Backup File Strategy?**
   - Keep all .backup files in _archive/?
   - Delete after verification?
   - **Recommendation**: Archive for 30 days, then delete

3. **Svelte 5 Migration Scope?**
   - Migrate all 468 legacy files?
   - Only migrate production routes?
   - **Recommendation**: Production first, experimental later

4. **CUDA Integration Depth?**
   - Full PTX module system?
   - Just embeddings + FAISS?
   - **Recommendation**: Start with embeddings + FAISS, expand later

---

**Status**: 📋 Plan Ready - Awaiting Approval
**Next Action**: Begin restoration of 99 corrupted files
**Estimated Completion**: March 7, 2026 (4 weeks)

**Generated**: February 7-8, 2026
**Author**: Claude Sonnet 4.5
**Repository**: feature/directory-migration-consolidation
