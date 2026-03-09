# Phase 73 Deployment Checklist

## Pre-Deployment

### Code Review
- [ ] All Phase 73 files created and committed
- [ ] Similarity utilities tested (`similarity.ts`)
- [ ] Guardrails tested (`guardrails.py`)
- [ ] ACE orchestrator integration verified
- [ ] Tool router aliases working
- [ ] Graph API demo/prod classification correct
- [ ] Pokémon help modal displays correctly
- [ ] UnoCSS shortcuts compiled

### Testing
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing (Playwright)
- [ ] Guardrails block low-similarity edits
- [ ] Guardrails allow high-similarity edits
- [ ] Demo mode bypasses guardrails
- [ ] Production routes use higher threshold
- [ ] Tool aliases resolve correctly
- [ ] Graph Mode filtering works
- [ ] Help modal opens/closes properly

### Configuration
- [ ] Environment variables set
  - [ ] `ACE_MODE=prod`
  - [ ] `SIMILARITY_THRESHOLD=0.92`
  - [ ] `PROD_ROUTE_THRESHOLD=0.95`
  - [ ] `MINIO_SIMD_BASE=http://localhost:8096`
  - [ ] `OLLAMA_HOST=http://localhost:11434`
- [ ] Database migrations run
- [ ] Redis cache cleared
- [ ] MinIO buckets created
- [ ] Qdrant collections initialized
- [ ] Neo4j constraints created

### Documentation
- [ ] `PHASE_73_CONSOLIDATION_COMPLETE.md` reviewed
- [ ] `QUICK_REFERENCE_PHASE73.md` reviewed
- [ ] `SYSTEM_COMPLETE_SUMMARY.md` reviewed
- [ ] API documentation updated
- [ ] Architecture diagrams current

---

## Deployment Steps

### 1. Backend Services

#### PostgreSQL + pgvector
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Run migrations
npm run migrate

# Verify
psql $DATABASE_URL -c "SELECT version();"
```
- [ ] PostgreSQL running
- [ ] pgvector extension loaded
- [ ] Migrations applied
- [ ] Test connection

#### Redis
```bash
# Start Redis
docker-compose up -d redis

# Verify
redis-cli ping
```
- [ ] Redis running
- [ ] Test connection
- [ ] Cache cleared

#### MinIO SIMD
```bash
# Start MinIO SIMD service
npm run simd:exe:start

# Verify
curl http://localhost:8096/health
```
- [ ] MinIO SIMD running on port 8096
- [ ] Health check passing
- [ ] Buckets created
- [ ] Test file upload/download

#### Qdrant
```bash
# Start Qdrant
docker-compose up -d qdrant

# Verify
curl http://localhost:6333/collections
```
- [ ] Qdrant running
- [ ] Collections created
- [ ] Test vector search

#### Neo4j
```bash
# Start Neo4j
docker-compose up -d neo4j

# Verify
cypher-shell -u neo4j -p password "RETURN 1"
```
- [ ] Neo4j running
- [ ] Constraints created
- [ ] Test graph query

#### Ollama + gemma3-legal
```bash
# Start Ollama
ollama serve

# Load model
ollama pull gemma3-legal:latest

# Verify
curl http://localhost:11434/api/generate \
  -d '{"model":"gemma3-legal:latest","prompt":"test"}'
```
- [ ] Ollama running
- [ ] gemma3-legal model loaded
- [ ] Test inference

#### ACE Agent
```bash
# Start ACE service
python -m backend.services.ace_orchestrator

# Verify
curl http://localhost:8000/health
```
- [ ] ACE running on port 8000
- [ ] Guardrails enabled
- [ ] Test plan/execute

#### FastMCP Server
```bash
# Start FastMCP
python -m mcp.legal_ai_mcp_server

# Verify
curl http://localhost:8001/tools
```
- [ ] FastMCP running
- [ ] All 15+ tools registered
- [ ] Test tool execution

### 2. Frontend

#### Build
```bash
cd sveltekit-frontend

# Install dependencies
npm install

# Build
npm run build

# Preview
npm run preview
```
- [ ] Dependencies installed
- [ ] Build successful
- [ ] No TypeScript errors
- [ ] No Svelte errors
- [ ] Preview works

#### Start Production
```bash
# With QUIC + GPU + SIMD
npm run dev:quic:full

# Or production mode
npm run start:prod
```
- [ ] Frontend running on port 5173
- [ ] All routes accessible
- [ ] Assets loading
- [ ] API calls working

### 3. Verification

#### Health Checks
```bash
# Check all services
curl http://localhost:5173/api/health
curl http://localhost:8000/health
curl http://localhost:8096/health
curl http://localhost:11434/api/tags
curl http://localhost:6333/collections
```
- [ ] All health checks passing
- [ ] No errors in logs
- [ ] Services responding

#### Feature Tests

##### Login & Auth
- [ ] Navigate to `/login`
- [ ] Login with test user
- [ ] Session created
- [ ] Redirect to dashboard

##### Dashboard
- [ ] Dashboard loads
- [ ] All widgets visible
- [ ] Stats accurate
- [ ] Navigation works

##### AI Chat
- [ ] Navigate to `/ai-chat`
- [ ] Send test message
- [ ] Response received
- [ ] Similarity score shown
- [ ] High/Medium/Low band displayed

##### Cases
- [ ] Navigate to `/cases`
- [ ] List cases
- [ ] Create new case
- [ ] View case details
- [ ] Edit case

##### Evidence
- [ ] Navigate to `/evidence`
- [ ] Upload document
- [ ] MinIO SIMD processes
- [ ] Embeddings created
- [ ] Search works

##### Evidence Board
- [ ] Navigate to `/evidence-board`
- [ ] Canvas renders
- [ ] Drag items
- [ ] Connect evidence
- [ ] Save layout

##### Command Center
- [ ] Navigate to `/command-center`
- [ ] Routes listed
- [ ] Search works
- [ ] Filter works
- [ ] Help modal opens (❓ button)
- [ ] Pokémon border displays

##### Graph Mode
- [ ] Navigate to `/graph-mode`
- [ ] Graph renders
- [ ] Nodes visible
- [ ] Edges visible
- [ ] Drag nodes
- [ ] Zoom/pan works
- [ ] Filter: All/Prod/Demo
- [ ] Click node navigates
- [ ] Export PNG works

#### Guardrails Tests

##### High Similarity (Should Allow)
```bash
curl http://localhost:8000/api/ace/execute \
  -d '{
    "tool": "rewrite_file",
    "args": {"path": "test.ts"},
    "last_rag_result": {"score": 0.95}
  }'
```
- [ ] Execution allowed
- [ ] `success: true`
- [ ] `similarity_band: "High"`

##### Low Similarity (Should Block)
```bash
curl http://localhost:8000/api/ace/execute \
  -d '{
    "tool": "rewrite_file",
    "args": {"path": "src/routes/login/+page.svelte"},
    "last_rag_result": {"score": 0.85},
    "context": {"route_path": "/login"}
  }'
```
- [ ] Execution blocked
- [ ] `blocked_by_guardrail: true`
- [ ] `similarity_band: "Medium"`
- [ ] Reason explains threshold

##### Demo Mode (Should Bypass)
```bash
# Set ACE_MODE=demo
export ACE_MODE=demo

curl http://localhost:8000/api/ace/execute \
  -d '{
    "tool": "rewrite_file",
    "args": {"path": "test.ts"},
    "last_rag_result": {"score": 0.50}
  }'
```
- [ ] Execution allowed
- [ ] `success: true`
- [ ] Guardrails bypassed

#### Tool Alias Tests
```bash
# Test FastMCP-style name
curl http://localhost:8000/api/tools/execute \
  -d '{"tool": "get_document_chunks", "args": {"doc_id": "test"}}'

# Test canonical name
curl http://localhost:8000/api/tools/execute \
  -d '{"tool": "minio_get_chunks", "args": {"doc_id": "test"}}'
```
- [ ] Both resolve to same handler
- [ ] Same result returned
- [ ] No errors

---

## Post-Deployment

### Monitoring
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Set up performance monitoring (New Relic, etc.)
- [ ] Set up uptime monitoring (Pingdom, etc.)
- [ ] Configure alerts
- [ ] Review logs

### Backups
- [ ] PostgreSQL backup scheduled
- [ ] MinIO backup scheduled
- [ ] Redis backup scheduled
- [ ] Neo4j backup scheduled
- [ ] Qdrant backup scheduled

### Security
- [ ] HTTPS enabled
- [ ] CORS configured
- [ ] Rate limiting enabled
- [ ] Firewall rules set
- [ ] Secrets rotated
- [ ] Access logs enabled

### Documentation
- [ ] Deployment notes updated
- [ ] Runbook created
- [ ] Team trained
- [ ] Support contacts documented

### Performance
- [ ] Load testing completed
- [ ] Stress testing completed
- [ ] Latency acceptable (<200ms)
- [ ] Throughput acceptable
- [ ] Resource usage normal

---

## Rollback Plan

### If Issues Detected

1. **Stop services**
   ```bash
   docker-compose down
   npm run stop:all
   ```

2. **Restore database**
   ```bash
   psql $DATABASE_URL < backup.sql
   ```

3. **Restore MinIO**
   ```bash
   mc mirror backup/ minio/legal-documents
   ```

4. **Revert code**
   ```bash
   git revert <commit-hash>
   git push
   ```

5. **Restart services**
   ```bash
   docker-compose up -d
   npm run start:prod
   ```

6. **Verify**
   - [ ] Services running
   - [ ] Health checks passing
   - [ ] Features working

---

## Success Criteria

- [ ] All services running
- [ ] All health checks passing
- [ ] All features working
- [ ] Guardrails protecting production
- [ ] Similarity scores displayed
- [ ] Demo/prod separation clear
- [ ] Tool aliases working
- [ ] Help modal functional
- [ ] No critical errors
- [ ] Performance acceptable
- [ ] Security hardened
- [ ] Monitoring active
- [ ] Backups scheduled
- [ ] Team trained

---

## Sign-Off

- [ ] **Developer**: Code reviewed and tested
- [ ] **QA**: All tests passing
- [ ] **DevOps**: Infrastructure ready
- [ ] **Security**: Security review complete
- [ ] **Product**: Features approved
- [ ] **Manager**: Deployment authorized

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Version**: Phase 73
**Status**: ☐ Success ☐ Rollback Required

---

## Notes

_Add any deployment notes, issues encountered, or lessons learned here._

---

**Phase 73 Deployment**: Ready to ship! 🚀
