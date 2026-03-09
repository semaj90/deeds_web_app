# Route Architecture Consolidation Plan

## Current State Analysis
- **600+ API endpoints** with significant duplication
- **177 page routes** across scattered directories
- **Authentication patterns**: Already using (auth) and (public) groups ✅
- **Version sprawl**: v1, v2, v3, v4 API endpoints with overlapping functionality

## Phase 2 Consolidation Strategy

### 1. **Route Groups (SvelteKit Patterns)**
```
src/routes/
├── (public)/           # Public pages (landing, docs, etc.)
├── (auth)/            # Authenticated pages ✅ DONE
├── (admin)/           # Admin-only pages
├── (demo)/            # All demo/showcase pages
└── api/
    ├── v1/            # Stable public API
    ├── internal/      # Internal/development APIs
    └── auth/          # Authentication endpoints
```

### 2. **Page Route Consolidation**
**Current Issues:**
- `ai-assistant` vs `aiassistant` vs `ai/dashboard` (3 similar routes)
- `evidence/analyze` vs `evidence-analysis` vs `evidence-canvas` (scattered evidence routes)
- `cases/[id]` vs `cases/[caseId]` (inconsistent param naming)
- Multiple test/demo pages scattered throughout

**Proposed Structure:**
```
(auth)/
├── dashboard/+page.svelte           # Main authenticated dashboard
├── cases/
│   ├── +page.svelte                # Case list
│   ├── [id]/+page.svelte           # Case detail
│   ├── [id]/canvas/+page.svelte    # Case canvas
│   └── create/+page.svelte         # New case
├── evidence/
│   ├── +page.svelte                # Evidence list
│   ├── upload/+page.svelte         # Evidence upload
│   ├── analyze/+page.svelte        # Evidence analysis
│   └── [id]/+page.svelte           # Evidence detail
├── ai/
│   ├── assistant/+page.svelte      # AI Assistant (consolidate all variants)
│   ├── chat/+page.svelte           # AI Chat
│   └── summary/+page.svelte        # AI Summarization
└── legal/
    ├── research/+page.svelte       # Legal research
    ├── documents/+page.svelte      # Legal documents
    └── precedent/+page.svelte      # Precedent search

(demo)/
├── +layout.svelte                  # Demo-specific layout
├── [slug]/+page.svelte            # Dynamic demo routing
└── showcase/+page.svelte          # Demo showcase

(admin)/
├── +layout.svelte                  # Admin-specific layout
├── dashboard/+page.svelte          # Admin dashboard
├── users/+page.svelte             # User management
├── system/+page.svelte            # System monitoring
└── gpu/+page.svelte               # GPU/CUDA management
```

### 3. **API Consolidation Priority**
**Immediate Actions:**
1. **Merge duplicate endpoints:**
   - `api/ai/chat` vs `api/ai/chat-simple` vs `api/ai/chat-mock`
   - `api/evidence/upload` vs `api/evidence/upload-simple` vs `api/upload`
   - `api/health` vs `api/health/all` vs `api/system/health`

2. **Version consolidation:**
   - Keep `api/v1/` for stable public API
   - Move dev/test APIs to `api/internal/`
   - Archive `api/v2/`, `api/v3/`, `api/v4/` duplicates

3. **Protocol buffer candidates:**
   ```
   HIGH TRAFFIC (Convert to Protocol Buffers):
   - api/v1/vector/search
   - api/v1/evidence/analyze
   - api/v1/ai/chat
   - api/v1/rag/enhanced

   KEEP JSON (Simple CRUD):
   - api/v1/cases
   - api/v1/users
   - api/auth/*
   ```

### 4. **Implementation Steps**

#### Week 1: Route Group Migration
- [ ] Move scattered routes into proper groups
- [ ] Create group-specific layouts
- [ ] Update navigation components

#### Week 2: API Consolidation
- [ ] Merge duplicate API endpoints
- [ ] Implement API versioning strategy
- [ ] Archive unused endpoints

#### Week 3: Demo/Test Cleanup
- [ ] Consolidate all demo routes under (demo)/
- [ ] Implement dynamic [slug] routing for demos
- [ ] Archive unused test routes

#### Week 4: Protocol Buffer Integration
- [ ] Identify high-traffic endpoints
- [ ] Implement protobuf for vector operations
- [ ] Performance benchmarking

### 5. **Expected Benefits**
- **Route reduction**: 177 → ~80 organized routes
- **API consolidation**: 600+ → ~150 focused endpoints
- **Bundle size**: Reduced by eliminating duplicate components
- **Developer experience**: Clear route organization and conventions
- **Performance**: Protocol buffers for high-traffic vector operations

### 6. **Route Naming Conventions**
```
Pages: kebab-case (legal-research)
Params: camelCase ([caseId], not [case_id])
Groups: lowercase ((auth), (demo))
API: RESTful with versions (api/v1/cases/[id])
```

## Next Action Items
1. Start with route group migration ((demo) consolidation)
2. Implement dynamic demo routing with [slug]
3. Begin API endpoint consolidation
4. Setup protocol buffer endpoints for vector operations