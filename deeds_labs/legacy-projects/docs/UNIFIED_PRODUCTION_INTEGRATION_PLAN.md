# 🎯 Unified Production Integration Plan

**Date**: 2025-12-03
**Status**: Consolidation + Infrastructure Integration
**Goal**: Bring all systems to production-ready state

---

## 📊 Current State Assessment

### Infrastructure (From Exploration Summary)
✅ **Docker Stack Running**:
- PostgreSQL 17 + pgvector (Vector DB)
- Redis 7 (Cache, 2GB)
- MinIO (S3-compatible storage)
- Qdrant (Vector search)
- Ollama (AI service, port 11434)
- TensorRT-LLM (Optimized inference, port 8000)
- RabbitMQ (Message queue)
- FastAPI RAG Backend (port 8005)

✅ **Database Schema**:
- `legal_documents_jsonb` with pgvector
- `document_chunks` for RAG
- `evidence_vectors` for evidence board
- `case_embeddings_optimized` for cases

✅ **Services**:
- RAG Ranking System (`rag-ranking-system.ts`)
- PostgreSQL Vector Storage (`postgresql-vector-storage.ts`)
- Gemma Embedding Service

### Route Consolidation Progress
✅ **74 routes archived** (14.8% of target)
✅ Archive structure created
✅ APIs built:
- `/api/routes/all` - Route discovery
- `/api/errors/summary` - Error tracking
- `/api/consolidation/status` - Progress monitoring

### Database Migration Safety
✅ **Safe YoRHa Schema** identified (`0001_yorha_schema.sql`)
✅ **Dangerous migrations** documented
✅ Migration strategy documented

---

## 🎯 Integration Strategy: 3 Parallel Tracks

### Track 1: Database Foundation (CRITICAL)
**Goal**: Safely add YoRHa tables without breaking existing system

**Phase 90A - Safe Migration** (TODAY):
1. ✅ Backup database
   ```bash
   pg_dump -h localhost -U postgres deeds_db > backups/pre_yorha_$(date +%Y%m%d).sql
   ```

2. ✅ Apply YoRHa schema (SAFE - only creates new tables)
   ```bash
   psql -h localhost -U postgres -d deeds_db -f sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql
   ```

3. ✅ Verify new tables
   ```bash
   psql -h localhost -U postgres -d deeds_db -c "\dt yorha_*"
   ```

**Expected Tables**:
- `yorha_cases` - Case management
- `yorha_evidence_nodes` - Evidence board nodes
- `yorha_evidence_connections` - Semantic relationships
- `yorha_chat_sessions` - Chat integration
- `yorha_chat_messages` - Message history
- `yorha_system_metrics` - Performance monitoring

**Integration with Existing**:
```
Existing:                YoRHa v2:
evidence              →  yorha_evidence_nodes
legal_documents       →  yorha_cases
evidence_vectors      →  yorha_evidence_connections
                         (COEXIST - NO CONFLICT)
```

---

### Track 2: Route Consolidation (WEEK 1)
**Goal**: Archive 500 routes, reduce errors, prepare for production

**Phase 1A - Continue Archiving** (THIS WEEK):

**Status**: 74/500 routes archived (14.8%)

**Next Targets**:
1. ⏳ Game routes (~50 routes)
   ```powershell
   # Archive mario, tetris, n64, nes, game directories
   .\scripts\archive-game-routes.ps1
   ```

2. ⏳ WebGPU demos (~20 routes)
   ```powershell
   .\scripts\archive-webgpu-demos.ps1
   ```

3. ⏳ CUDA demos (~30 routes)
   - `/cuda-streaming/*`
   - `/gpu-demo/*`
   - `/tensorrt/*`

4. ⏳ Duplicate API routes (~200 routes)
   - Identify with: `npm run check:duplicates`
   - Review duplicates
   - Merge or archive

**Phase 1B - Error Reduction**:

**Current Errors** (from `/api/errors/summary`):
- Svelte: 31,777
- TypeScript: 1,234
- Total: 33,011

**Auto-Fix Strategy**:
1. ⏳ Run Phase 72 auto-iterate
   ```bash
   npm run phase72:auto-iterate
   ```

2. ⏳ Fix import statements
   ```bash
   python sveltekit-frontend/scripts/fix-types-imports.py
   ```

3. ⏳ Update CUDA Cache Memory Optimizer
   - Fix syntax errors in the file you shared
   - Apply TypeScript fixes

---

### Track 3: NES Command Center (THIS WEEK)
**Goal**: Visualize consolidation progress + infrastructure health

**Phase 3A - Connect to Real Data**:

Current NES UI at `/command/routes` needs:

1. ✅ Error Dashboard (connect to `/api/errors/summary`)
   ```svelte
   <!-- Show live error counts -->
   <div class="nes-container error-panel">
     <h2>⚠️ Error Summary</h2>
     <div class="stat-box">
       <span class="nes-text is-error">{data.errors.svelte}</span>
       <span>Svelte Errors</span>
     </div>
   </div>
   ```

2. ✅ Consolidation Progress (connect to `/api/consolidation/status`)
   ```svelte
   <!-- Show Week 1-4 progress -->
   <div class="nes-container phases-panel">
     {#each data.consolidation.phases as phase}
       <progress class="nes-progress" value={phase.progress} max="100" />
     {/each}
   </div>
   ```

3. ✅ Infrastructure Health (NEW API needed)
   ```typescript
   // /api/infrastructure/health
   {
     docker: { postgres: 'healthy', redis: 'healthy', ... },
     database: { connections: 10, queryTime: 5ms },
     storage: { minio: 'healthy', used: '12GB/100GB' }
   }
   ```

**Phase 3B - Integrate with Docker Stack**:

Connect NES Command Center to existing services:
- PostgreSQL metrics (connections, query time)
- Redis cache stats (hit rate, memory usage)
- MinIO storage usage
- RabbitMQ queue depth
- Ollama model status

---

## 🔗 Cross-System Integration Points

### 1. Evidence Upload Flow (Granite-Docling Integration)

**Current Flow** (from exploration):
```
SvelteKit Upload UI
  ↓
MinIO (lawpdfs/cases/<caseId>/)
  ↓
RabbitMQ (document.process.queue)
  ↓
Granite-Docling Worker
  ↓
PostgreSQL (document_chunks + vectors)
  ↓
RAG Ranking System
  ↓
Legal Dashboard (SSE)
```

**YoRHa Integration** (NEW):
```
Evidence Upload
  ↓
MinIO + yorha_evidence_nodes
  ↓
RabbitMQ job
  ↓
Worker processing
  ↓
yorha_evidence_connections (relationships)
  ↓
NES Command Center (monitoring)
```

### 2. RAG Pipeline Integration

**Existing**:
- PostgreSQL Vector Storage (`postgresql-vector-storage.ts`)
- RAG Ranking System (`rag-ranking-system.ts`)
- Ollama embeddings (port 11434)
- Qdrant vector search (port 6333)

**YoRHa Addition**:
- `yorha_evidence_connections` for semantic relationships
- Chat sessions tied to cases
- AI reasoning stored in connections

### 3. Monitoring Integration

**Existing**:
- Legal Dashboard (`/dashboard/legal-progress`)
- SSE streaming
- Document thumbnails

**NES Command Center Addition**:
- Route health monitoring
- Error tracking dashboard
- Consolidation progress
- Infrastructure metrics
- Real-time status

---

## 📋 Immediate Action Plan (Next 3 Days)

### Day 1 (TODAY): Database Foundation
- [ ] Backup database
- [ ] Apply YoRHa schema
- [ ] Verify tables
- [ ] Update Drizzle ORM schema files
- [ ] Test basic CRUD on yorha_cases

### Day 2: Route Consolidation Sprint
- [ ] Archive game routes (+50)
- [ ] Archive WebGPU demos (+20)
- [ ] Archive CUDA demos (+30)
- [ ] Run Phase 72 auto-fix (reduce errors by ~30%)
- [ ] Update consolidation API

### Day 3: NES Command Center Update
- [ ] Wire error dashboard to API
- [ ] Wire phase progress to API
- [ ] Add infrastructure health API
- [ ] Test real-time updates
- [ ] Document final UI

---

## 🎯 Week 1 Success Metrics

**Route Consolidation**:
- [x] 74 routes archived (current)
- [ ] 250 routes archived (mid-week target)
- [ ] 500 routes archived (week-end target)
- [ ] Error count < 25,000 (from 33,011)

**Database**:
- [ ] YoRHa schema applied
- [ ] Test data in yorha_cases
- [ ] Foreign keys working
- [ ] Drizzle schema updated

**NES Command Center**:
- [ ] Error dashboard showing live data
- [ ] Phase progress showing 50%+
- [ ] Infrastructure health checks
- [ ] Route testing functional

---

## 🔧 Technical Debt to Address

### High Priority
1. **CUDA Cache Memory Optimizer** - Fix syntax errors (you shared this file)
2. **Route conflicts** - Resolve `/api/cases/[caseId]` vs `/api/cases/[id]`
3. **Import errors** - Run fix-types-imports.py
4. **Database migrations** - Comment out dangerous DROP statements

### Medium Priority
1. **Docker compose variants** - Consolidate multiple docker-compose files
2. **Environment variables** - Centralize in `.env.production`
3. **API versioning** - Migrate unversioned APIs to `/api/v2/`
4. **Test coverage** - Add tests for core routes

### Low Priority
1. **Documentation** - Update API docs with OpenAPI
2. **Performance** - Optimize vector search queries
3. **Monitoring** - Add Sentry/similar for error tracking

---

## 📚 Documentation Created

**Today**:
1. `docs/PHASE90_DB_MIGRATION_SAFETY.md` - Migration guide
2. `docs/PHASE90_MIGRATION_SUMMARY.md` - Quick reference
3. `docs/PHASE1_PROGRESS_UPDATE.md` - Route consolidation status
4. `docs/DEMO_ROUTES_ARCHIVAL_SUMMARY.md` - Archive details
5. `docs/NES_COMMAND_CENTER_STATUS.md` - UI integration guide
6. `docs/UNIFIED_PRODUCTION_INTEGRATION_PLAN.md` - **THIS FILE**

**Existing**:
- `docs/PRODUCTION_CONSOLIDATION_PLAN.md` - 4-week plan
- `docs/NES_COMMAND_CENTER_ROADMAP.md` - UI spec
- Codebase exploration summary (you shared)

---

## 🚀 Quick Start Commands

### Database Migration
```bash
# Backup
pg_dump deeds_db > backups/pre_yorha_$(date +%Y%m%d).sql

# Apply YoRHa schema
psql -d deeds_db -f sveltekit-frontend/drizzle/migrations/0001_yorha_schema.sql

# Verify
psql -d deeds_db -c "\dt yorha_*"
```

### Route Consolidation
```bash
# Check status
curl http://localhost:5173/api/consolidation/status | jq

# Archive more routes
.\scripts\archive-game-routes.ps1

# Check errors
curl http://localhost:5173/api/errors/summary | jq
```

### Development Server
```bash
# Start SvelteKit
npm run dev

# Start Docker stack
docker-compose -f docker-compose.full.yml up -d

# Check health
docker-compose ps
```

---

## 🎯 Long-Term Vision (4 Weeks)

### Week 1: Foundation
- Database: YoRHa schema applied
- Routes: 500 archived
- Errors: < 20,000

### Week 2: Migration
- API: Migrate to `/api/v2/`
- Database: Data migration to YoRHa tables
- Errors: < 10,000

### Week 3: Testing
- Integration tests for core routes
- Security audit
- Load testing
- Errors: < 5,000

### Week 4: Production
- Final review
- Performance optimization
- Deploy to staging
- Deploy to production
- Errors: < 1,000

---

**Status**: ✅ Foundation complete, ready to execute
**Next**: Choose Day 1, 2, or 3 tasks to begin
**Owner**: Development Team
