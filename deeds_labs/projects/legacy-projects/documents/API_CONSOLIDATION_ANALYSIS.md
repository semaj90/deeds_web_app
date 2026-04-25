# API Consolidation Analysis

## Current State: 1,157 API Endpoint Files (762+ Endpoints)
**Status**: 🔴 **CRITICAL** - This is unsustainable sprawl and MUST be addressed
**Audit Date**: October 16, 2025

### Quick Facts
```
Total API files:      1,157 (verified Oct 16, 2025)
Estimated endpoints:  762+ (conservative estimate)
Actual endpoint dups: Unknown (needs audit)
Test/dev endpoints:   300+ (should be archived)
Version variants:     v1, v2, v3, v4 (should be v1 only)
Reduction target:     1,157 → ~100 files (91% reduction)
```

## Critical APIs (Keep & Optimize) - ~50 endpoints

### **Authentication & Security**
- `api/auth/login` ✅
- `api/auth/logout` ✅
- `api/auth/me` ✅
- `api/auth/register` ✅

### **AI & Inference (High Traffic - Protocol Buffer Candidates)**
- `api/ai/inference` ✅ **[CONTRACT IMPLEMENTED]**
- `api/legal/analysis` ✅ **[CONTRACT IMPLEMENTED]**
- `api/ai/chat` (primary chat endpoint)
- `api/v1/vector/search` (vector operations)
- `api/v1/vector/protobuf` ✅ **[PROTOCOL BUFFER READY]**

### **Core Business Logic**
- `api/cases/[id]` (case management)
- `api/evidence/[id]` (evidence management)
- `api/evidence/upload` (file uploads)
- `api/evidence/analyze` (evidence analysis)
- `api/search/semantic` (semantic search)

### **System Health & Monitoring**
- `api/health` (system health)
- `api/health/database` (database health)
- `api/system/status` (system status)

### **Data Management**
- `api/documents/[id]` (document CRUD)
- `api/users/[id]` (user management)
- `api/reports/[id]` (report generation)

## Duplicate/Redundant APIs (Archive) - ~500+ endpoints

### **AI Endpoint Duplicates**
**Problem**: 15+ similar chat endpoints
- `api/ai/chat-mock` → **Archive** (use mock mode in main chat)
- `api/ai/chat-simple` → **Archive** (merge into main chat)
- `api/ai/chat-sse` → **Archive** (use streaming in main chat)
- `api/ai/chat-tensorrt` → **Archive** (use backend selection in main chat)
- `api/ai/redis-optimized-chat` → **Archive** (optimization should be middleware)

### **Health Check Duplicates**
**Problem**: 8+ health endpoints
- `api/ai/health/local` → **Archive** (merge into main health)
- `api/ai/health/cloud` → **Archive** (merge into main health)
- `api/ai/health-mock` → **Archive** (use mock mode in main health)

### **Test/Dev Endpoints**
**Problem**: 100+ test endpoints
- All `api/test-*` endpoints → **Archive**
- All `api/dev/*` endpoints → **Move to development folder**
- All `api/benchmark/*` endpoints → **Archive**

### **Version Duplicates**
**Problem**: v1, v2, v3, v4 sprawl
- Keep `api/v1/*` for stable public API
- Archive `api/v2/*`, `api/v3/*`, `api/v4/*` (merge into v1)

## Consolidation Strategy

### **Phase 1: Critical Path (Week 1)**
1. **Implement missing critical APIs**:
   - Unified chat endpoint with model selection
   - Semantic search with vector integration
   - Evidence upload with processing pipeline

2. **Fix existing endpoints**:
   - Complete `/api/ai/inference` contract compliance
   - Enhance `/api/legal/analysis` with proper validation
   - Add protocol buffer support to high-traffic endpoints

### **Phase 2: Deduplication (Week 2)**
1. **Archive duplicate endpoints**:
   - Move 500+ redundant endpoints to `api/_archive/`
   - Update any references to use consolidated endpoints
   - Document migration path for any external consumers

2. **Organize remaining endpoints**:
   - Group by functionality (`ai/`, `legal/`, `system/`, `data/`)
   - Implement consistent error handling
   - Add proper TypeScript types

### **Phase 3: Optimization (Week 3)**
1. **Protocol buffer implementation**:
   - Convert high-traffic endpoints to binary protocols
   - Implement batch processing for vector operations
   - Add streaming support for large data operations

2. **Performance optimization**:
   - Add Redis caching middleware
   - Implement request rate limiting
   - Add comprehensive monitoring

## Target Architecture

```
api/
├── v1/                 # Stable public API
│   ├── auth/          # Authentication
│   ├── ai/            # AI inference & chat
│   ├── legal/         # Legal analysis
│   ├── vector/        # Vector operations (protobuf)
│   ├── cases/         # Case management
│   ├── evidence/      # Evidence management
│   ├── search/        # Search operations
│   └── system/        # System health
├── internal/          # Internal/development APIs
└── _archive/          # Archived endpoints
```

## Expected Results
- **762 → ~50 endpoints** (93% reduction)
- **Faster builds** (less TypeScript compilation)
- **Better performance** (protocol buffers, consolidation)
- **Easier maintenance** (clear API surface)
- **Better documentation** (focused endpoint contracts)

## Integration with Route Architecture
This consolidation aligns with our **Phase 2 route consolidation**:
- APIs match the new `(auth)`, `(demo)`, `(admin)` route groups
- Protocol buffer endpoints complement our vector search client
- Consolidated structure supports the demo showcase system

## Next Steps
1. ✅ **Contracts implemented** (`/api/ai/inference`, `/api/legal/analysis`)
2. 🔄 **Create unified chat endpoint** with model selection
3. 🔄 **Archive redundant endpoints** to `_archive/` directory
4. 🔄 **Update references** to use consolidated endpoints
5. 🔄 **Add protocol buffer support** to remaining high-traffic APIs