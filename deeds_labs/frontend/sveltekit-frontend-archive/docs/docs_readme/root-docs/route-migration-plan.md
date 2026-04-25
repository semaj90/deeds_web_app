# Route Consolidation Migration Plan

## Phase 2: Route Architecture Consolidation

### Current State Analysis
- **177 route pages** scattered across **300+ directories**
- Massive duplication in functionality (ai-chat, aiassistant, ai-assistant)
- No consistent layout system
- Poor navigation structure

### Target Route Groups

#### 1. (legal) - Legal Case Management
**Move these routes:**
- `/cases` → `/(legal)/cases`
- `/evidence` → `/(legal)/evidence`
- `/documents` → `/(legal)/documents`
- `/legal/*` → `/(legal)/*`
- `/detective` → `/(legal)/detective`
- `/investigation` → `/(legal)/investigation`
- `/precedents` → `/(legal)/precedents`

#### 2. (ai) - AI Assistant Features
**Move these routes:**
- `/ai-assistant` → `/(ai)/assistant`
- `/aiassistant` → `/(ai)/assistant` (duplicate)
- `/ai-chat` → `/(ai)/chat`
- `/ai-chat-simple` → `/(ai)/chat` (merge)
- `/ai/*` → `/(ai)/*`
- `/cuda-streaming` → `/(ai)/cuda-streaming`
- `/gpu-chat` → `/(ai)/chat` (merge with GPU tag)

#### 3. (admin) - System Administration
**Move these routes:**
- `/admin/*` → `/(admin)/*` (already grouped)
- `/metrics` → `/(admin)/metrics`
- `/system` → `/(admin)/system`
- `/health*` → `/(admin)/health`
- `/dashboard` → `/(admin)/dashboard`

#### 4. (dev) - Development Tools
**Move these routes:**
- `/dev/*` → `/(dev)/*` (already grouped)
- All `/test-*` routes → `/(dev)/tests/`
- `/examples` → `/(dev)/examples`
- `/showcase` → `/(dev)/showcase`

#### 5. Keep Root Level
**Core application routes:**
- `/` (homepage)
- `/login`, `/logout`, `/register` → Keep for SEO
- `/profile`, `/settings`
- `/api/*` (consolidate but keep flat)

### API Route Consolidation

#### Current: 500+ API endpoints
#### Target: Organize by domain

```
/api/
├── legal/          # Legal operations
│   ├── cases/
│   ├── evidence/
│   ├── documents/
│   └── search/
├── ai/             # AI operations
│   ├── chat/
│   ├── analyze/
│   ├── embed/
│   └── gpu/
├── admin/          # Administration
│   ├── health/
│   ├── metrics/
│   ├── users/
│   └── system/
└── auth/           # Authentication
    ├── login/
    ├── register/
    └── session/
```

### Migration Benefits

1. **Developer Experience**
   - Clear separation of concerns
   - Consistent theming per domain
   - Easier navigation and debugging

2. **Performance**
   - Route-based code splitting
   - Lazy loading by feature area
   - Reduced bundle size per section

3. **Maintainability**
   - Logical organization
   - Easier to find and modify features
   - Clear ownership boundaries

4. **User Experience**
   - Consistent UI patterns per domain
   - Better mental models
   - Faster navigation

### Implementation Strategy

1. **Phase 2A: Core Groups** (This Phase)
   - Create route group layouts ✅
   - Migrate 20 most important routes
   - Update navigation system

2. **Phase 2B: API Consolidation**
   - Consolidate duplicate API endpoints
   - Standardize response formats
   - Add proper error handling

3. **Phase 2C: Cleanup**
   - Remove duplicate routes
   - Archive unused routes
   - Update all internal links

### Route Group Layouts Created ✅

- `(legal)/+layout.svelte` - Matrix theme (green)
- `(ai)/+layout.svelte` - Cyberpunk theme (blue)
- `(admin)/+layout.svelte` - Amber theme (orange)
- `(dev)/+layout.svelte` - Retro theme (purple)

### Next Steps

1. Create navigation update system
2. Move high-priority routes first
3. Test routing and layouts
4. Update all internal links
5. Remove duplicates

## Impact Metrics

**Before:** 177 pages / 300+ directories
**After:** ~50 organized pages / 6 route groups
**Reduction:** 70% fewer directories to manage