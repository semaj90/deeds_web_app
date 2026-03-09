# 🚀 Production Consolidation Plan - YoRHa Legal AI Platform

**Generated**: 2025-11-30
**Current State**: 1305 routes (262 Pages, 1025 APIs, 17 Layouts)
**Goal**: Streamline to production-ready core with <400 total routes

---

## 📊 Current Route Analysis

### By Category (from /all-routes analysis)
- **Core User Routes**: Essential user-facing pages (dashboard, search, upload, profile)
- **Legal Core**: Production legal functionality (cases, evidence, contracts)
- **Administration**: Admin panels and system management
- **Production APIs**: Stable, versioned APIs (`/api/v1/`, `/api/v2/`)
- **Testing APIs**: Unversioned or test endpoints (need review)
- **Demo Routes**: Development demos and experiments (~42% of total)
- **Infrastructure**: Health checks, metrics, monitoring

### Priority Breakdown
- ✅ **Production Ready**: Core + Versioned APIs
- ⚠️ **Need Versioning**: ~200+ unversioned APIs
- 🧪 **Testing/Demo**: ~500+ routes (candidates for archival)
- 🏗️ **Infrastructure**: ~50 routes (keep)

---

## 🎯 Phase 1: Immediate Actions (Week 1)

### 1.1 Archive Demo & Experimental Routes
**Target**: Reduce by ~500 routes

**Routes to Archive**:
```
/demo/*                    → archive/demos/
/test/*                    → archive/testing/
/experiment/*              → archive/experiments/
/prototype/*               → archive/prototypes/
/game/*                    → archive/games/
/n64/*                     → archive/games/n64/
/nes/*                     → archive/games/nes/
/tetris/*                  → archive/games/tetris/
/mario/*                   → archive/games/mario/
/gpu-demo/*                → archive/gpu-demos/
/webgpu/*                  → archive/webgpu-demos/
/ai-demo/*                 → archive/ai-demos/
```

**Action Script**:
```powershell
# Create archive structure
New-Item -ItemType Directory -Force -Path "sveltekit-frontend/src/routes/archive/demos"
New-Item -ItemType Directory -Force -Path "sveltekit-frontend/src/routes/archive/testing"
New-Item -ItemType Directory -Force -Path "sveltekit-frontend/src/routes/archive/experiments"

# Move demo routes (example)
Move-Item "sveltekit-frontend/src/routes/demo" "sveltekit-frontend/src/routes/archive/demos/"
Move-Item "sveltekit-frontend/src/routes/test" "sveltekit-frontend/src/routes/archive/testing/"
```

### 1.2 Consolidate Unversioned APIs
**Target**: Standardize ~200 APIs to `/api/v2/`

**Migration Strategy**:
1. Audit all `/api/*` routes (not `/api/v1/` or `/api/v2/`)
2. Categorize by service:
   - Authentication → `/api/v2/auth/`
   - Legal Services → `/api/v2/legal/`
   - AI Services → `/api/v2/ai/`
   - Search → `/api/v2/search/`
   - Files → `/api/v2/files/`
   - Infrastructure → `/api/v2/system/`

**Example Migrations**:
```
/api/chat              → /api/v2/ai/chat
/api/upload            → /api/v2/files/upload
/api/search            → /api/v2/search/query
/api/health            → /api/v2/system/health
/api/embeddings        → /api/v2/ai/embeddings
```

### 1.3 Remove Duplicate/Redundant Routes
**Target**: Identify and merge ~100 duplicates

**Common Patterns to Check**:
- Multiple health check endpoints → Consolidate to `/api/v2/system/health`
- Duplicate upload handlers → Single `/api/v2/files/upload`
- Multiple chat endpoints → Unified `/api/v2/ai/chat`
- Redundant test endpoints → Archive or remove

---

## 🎯 Phase 2: Core Production Routes (Week 2)

### 2.1 Essential User Pages (~30 pages)
```
/                          # Landing page
/dashboard                 # Main dashboard
/login                     # Authentication
/register                  # User registration
/profile                   # User profile
/settings                  # User settings

# Legal Core
/cases                     # Case management
/cases/[id]                # Case details
/evidence                  # Evidence board
/evidence/[id]             # Evidence details
/contracts                 # Contract management
/contracts/[id]            # Contract details
/search                    # Legal search
/upload                    # Document upload

# AI Features
/ai-chat                   # AI assistant
/ai-rag                    # RAG interface
/ai-dashboard              # AI analytics

# Admin
/admin                     # Admin dashboard
/admin/users               # User management
/admin/system              # System settings
```

### 2.2 Production API Endpoints (~150 endpoints)

#### Authentication (`/api/v2/auth/`)
```
POST   /api/v2/auth/login
POST   /api/v2/auth/register
POST   /api/v2/auth/logout
POST   /api/v2/auth/refresh
GET    /api/v2/auth/session
```

#### Legal Services (`/api/v2/legal/`)
```
GET    /api/v2/legal/cases
POST   /api/v2/legal/cases
GET    /api/v2/legal/cases/[id]
PUT    /api/v2/legal/cases/[id]
DELETE /api/v2/legal/cases/[id]

GET    /api/v2/legal/evidence
POST   /api/v2/legal/evidence
GET    /api/v2/legal/evidence/[id]

GET    /api/v2/legal/contracts
POST   /api/v2/legal/contracts
GET    /api/v2/legal/contracts/[id]
```

#### AI Services (`/api/v2/ai/`)
```
POST   /api/v2/ai/chat
POST   /api/v2/ai/embeddings
POST   /api/v2/ai/rag/query
POST   /api/v2/ai/rag/ingest
GET    /api/v2/ai/models
POST   /api/v2/ai/analyze
```

#### Search (`/api/v2/search/`)
```
POST   /api/v2/search/query
POST   /api/v2/search/vector
POST   /api/v2/search/similarity
GET    /api/v2/search/history
```

#### Files (`/api/v2/files/`)
```
POST   /api/v2/files/upload
GET    /api/v2/files/[id]
DELETE /api/v2/files/[id]
GET    /api/v2/files/list
POST   /api/v2/files/batch-upload
```

#### System (`/api/v2/system/`)
```
GET    /api/v2/system/health
GET    /api/v2/system/metrics
GET    /api/v2/system/status
GET    /api/v2/system/config
```

### 2.3 Infrastructure Routes (~20 routes)
```
GET    /api/v2/system/health/ollama
GET    /api/v2/system/health/postgres
GET    /api/v2/system/health/redis
GET    /api/v2/system/health/neo4j
GET    /api/v2/system/health/qdrant
GET    /api/v2/system/health/rabbitmq
GET    /api/v2/system/metrics/gpu
GET    /api/v2/system/metrics/memory
GET    /api/v2/system/cache/clear
GET    /api/v2/system/cache/stats
```

---

## 🎯 Phase 3: Quality & Testing (Week 3)

### 3.1 Route Testing Strategy
```bash
# Test all production routes
npm run test:routes:core
npm run test:routes:api
npm run test:routes:legal

# Health checks
npm run health:check:all

# Load testing
npm run test:load:api
```

### 3.2 Documentation Requirements
- [ ] OpenAPI/Swagger spec for all `/api/v2/` endpoints
- [ ] Route permission matrix
- [ ] Rate limiting configuration
- [ ] Error handling standards
- [ ] Response format standards

### 3.3 Security Audit
- [ ] Authentication on all protected routes
- [ ] CSRF protection
- [ ] Rate limiting
- [ ] Input validation
- [ ] SQL injection prevention
- [ ] XSS prevention

---

## 🎯 Phase 4: Deployment Preparation (Week 4)

### 4.1 Environment Configuration
```env
# Production
NODE_ENV=production
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
OLLAMA_URL=http://ollama:11434
QDRANT_URL=http://qdrant:6333

# API Configuration
API_VERSION=v2
API_RATE_LIMIT=100
API_TIMEOUT=30000

# Feature Flags
ENABLE_AI_CHAT=true
ENABLE_RAG=true
ENABLE_VECTOR_SEARCH=true
```

### 4.2 Build Optimization
```json
{
  "scripts": {
    "build:prod": "npm run check:all && npm run test:quick && vite build",
    "preview:prod": "vite preview --port 4173",
    "analyze:bundle": "vite build --mode analyze"
  }
}
```

### 4.3 Monitoring Setup
- [ ] Error tracking (Sentry/similar)
- [ ] Performance monitoring (APM)
- [ ] Log aggregation
- [ ] Uptime monitoring
- [ ] Alert configuration

---

## 📋 Consolidation Checklist

### Week 1: Cleanup
- [ ] Archive demo routes (~500 routes)
- [ ] List all unversioned APIs
- [ ] Create migration plan for APIs
- [ ] Identify duplicate routes
- [ ] Remove unused layouts

### Week 2: Migration
- [ ] Migrate APIs to `/api/v2/`
- [ ] Update frontend to use new endpoints
- [ ] Add deprecation warnings to old endpoints
- [ ] Test all migrated routes
- [ ] Update documentation

### Week 3: Testing
- [ ] Write integration tests for core routes
- [ ] Perform security audit
- [ ] Load testing
- [ ] Fix identified issues
- [ ] Update error handling

### Week 4: Production
- [ ] Final code review
- [ ] Performance optimization
- [ ] Set up monitoring
- [ ] Create deployment runbook
- [ ] Deploy to staging
- [ ] Deploy to production

---

## 🎯 Target Production State

### Final Route Count: ~350 routes
- **Pages**: 30 core user pages
- **APIs**: 150 production endpoints
- **Layouts**: 10 essential layouts
- **Infrastructure**: 20 system routes
- **Admin**: 10 admin routes

### Archived: ~950 routes
- Demo routes: ~500
- Test routes: ~200
- Experimental: ~150
- Deprecated: ~100

---

## 🚀 Quick Start Commands

```bash
# Analyze current routes
npm run routes:export

# Test route scanner
npx tsx scripts/test-route-scanner.ts

# View all routes in browser
npm run dev
# Navigate to: http://localhost:5173/all-routes

# Archive demo routes (example)
node scripts/archive-demo-routes.mjs

# Migrate APIs to v2
node scripts/migrate-apis-to-v2.mjs

# Test production routes
npm run test:routes:production

# Build for production
npm run build:prod
```

---

## 📊 Success Metrics

- ✅ Route count reduced from 1305 → ~350 (73% reduction)
- ✅ All APIs versioned and documented
- ✅ Zero duplicate endpoints
- ✅ 100% test coverage for core routes
- ✅ All security audits passed
- ✅ Build time < 2 minutes
- ✅ Bundle size < 500KB (gzipped)
- ✅ Lighthouse score > 90

---

## 🔗 Related Documentation

- `docs/API_VERSIONING_GUIDE.md` - API migration guide
- `docs/ROUTE_TESTING_STRATEGY.md` - Testing approach
- `docs/DEPLOYMENT_RUNBOOK.md` - Production deployment
- `docs/SECURITY_CHECKLIST.md` - Security requirements
- `GEMINI.md` - Overall project status

---

**Status**: Ready for Phase 1 execution
**Next Action**: Begin archiving demo routes
**Owner**: Development Team
**Timeline**: 4 weeks to production-ready state
