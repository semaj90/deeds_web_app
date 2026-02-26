# Phase 70+ Roadmap: AI Chat Wiring + TensorRT Pooling + Full Pipeline

## Overview

This roadmap updates the task structure for Phase 70+ to wire up:
1. **AI Chat Integration** (Phase 70-71)
2. **Evidence Upload + Worker Trigger** (Phase 71-72)
3. **RAG Search UI** (Phase 72-73)
4. **TensorRT Pooling Optimization** (Phase 73-74)

---

## Phase 70: AI Chat Wiring

### Objective
Wire Gemma3 legal assistant with evidence memory panel and guardrails.

### Tasks

#### 70.1: Implement AI Chat Backend Service
- Create `backend/ai_chat_service.py`
- Implement chat message storage (Postgres)
- Implement conversation context management
- Add legal guardrails (disclaimer + citation requirements)
- Implement streaming response via SSE
- Add evidence reference linking

**Requirements**:
- Chat history persistence
- Context window management (last 10 messages)
- Legal disclaimer on every response
- Citation tracking

#### 70.2: Implement Legal Guardrails
- Create `backend/legal_guardrails.py`
- Implement disclaimer injection
- Implement citation requirement enforcement
- Implement confidence scoring
- Add "verify with official sources" warnings

**Requirements**:
- Prepend disclaimer to every response
- Require citations for statute references
- Flag low-confidence answers
- Suggest official sources (.gov, DA/AG)

#### 70.3: Create Chat API Endpoints
- `POST /api/chat/message` - Send message
- `GET /api/chat/history/{case_id}` - Get conversation
- `GET /api/chat/evidence/{case_id}` - Get linked evidence
- `DELETE /api/chat/history/{case_id}` - Clear conversation

**Requirements**:
- Async message processing
- Real-time streaming responses
- Evidence linking
- Conversation persistence

#### 70.4: Implement Evidence Memory Panel
- Create `backend/evidence_memory.py`
- Track evidence referenced in chat
- Implement evidence scoring (relevance)
- Implement evidence clustering
- Add evidence timeline visualization

**Requirements**:
- Store evidence references
- Score by relevance
- Cluster by topic
- Timeline view

#### 70.5: Create Chat UI Components
- Create `sveltekit-frontend/src/routes/chat/+page.svelte`
- Implement message display (user/assistant)
- Implement streaming response rendering
- Implement evidence panel (right sidebar)
- Add disclaimer stripe

**Requirements**:
- Dark background (legal aesthetic)
- Message labels (Prosecutor/Detective/AI)
- Disclaimer always visible
- Evidence references clickable

#### 70.6: Implement Streaming Response Handler
- Create `sveltekit-frontend/src/lib/services/chatStream.ts`
- Implement SSE connection
- Implement token-by-token rendering
- Implement error handling
- Add loading indicators

**Requirements**:
- Real-time token streaming
- Graceful error handling
- Loading states
- Connection retry logic

---

## Phase 71: Evidence Upload + Worker Trigger

### Objective
Wire MinIO + RabbitMQ + Worker pipeline for evidence processing.

### Tasks

#### 71.1: Implement MinIO Client (Go QUIC)
- Create `go-services/minio_client.go`
- Implement bucket creation
- Implement file upload
- Implement file retrieval
- Add error handling + retry logic

**Requirements**:
- Create `legal-evidence` bucket
- Upload with metadata
- Retrieve with streaming
- Handle large files (> 100MB)

#### 71.2: Implement RabbitMQ Task Publisher (Go QUIC)
- Create `go-services/rabbitmq_publisher.go`
- Implement task publishing
- Implement task format standardization
- Add retry logic
- Implement dead-letter queue

**Requirements**:
- Publish to `evidence.queue`
- Include file metadata
- Retry on failure
- Track task status

#### 71.3: Create Evidence Upload Endpoint
- `POST /api/evidence/upload` - Upload file
- `GET /api/evidence/{id}/status` - Get processing status
- `GET /api/evidence/{id}/stream` - Stream progress events

**Requirements**:
- Multipart file upload
- MinIO storage
- RabbitMQ task publishing
- SSE progress streaming

#### 71.4: Implement Worker File Retrieval
- Update `backend/mlp_worker.py`
- Implement MinIO client
- Implement file download
- Add error handling
- Implement retry logic

**Requirements**:
- Download from MinIO
- Handle large files
- Retry on failure
- Stream to processing

#### 71.5: Implement Worker Result Storage
- Update `backend/mlp_worker.py`
- Store OCR results to MinIO
- Store chunks to MinIO
- Store embeddings to Redis
- Update task status in RabbitMQ

**Requirements**:
- Store OCR JSON
- Store chunk metadata
- Store embeddings (fp16)
- Update task status

#### 71.6: Create Evidence Upload UI
- Create `sveltekit-frontend/src/routes/evidence/upload/+page.svelte`
- Implement file picker
- Implement progress bar
- Implement status display
- Add error handling

**Requirements**:
- Drag-and-drop upload
- Progress tracking
- Status updates via SSE
- Error messages

#### 71.7: Implement Upload Progress Streaming
- Create `sveltekit-frontend/src/lib/services/uploadStream.ts`
- Implement SSE connection
- Implement progress parsing
- Implement ETA calculation
- Add cancellation support

**Requirements**:
- Real-time progress
- ETA calculation
- Cancellation support
- Error handling

---

## Phase 72: RAG Evidence Search UI

### Objective
Implement semantic search over uploaded evidence with reranking.

### Tasks

#### 72.1: Implement Search Endpoint
- `POST /api/search/evidence` - Search uploaded files
- `GET /api/search/results/{id}` - Get search results
- `POST /api/search/rerank` - Rerank results

**Requirements**:
- Query embedding generation
- Qdrant search (top-50)
- MiniLM reranking (top-5)
- Result formatting

#### 72.2: Create Search UI
- Create `sveltekit-frontend/src/routes/search/+page.svelte`
- Implement search bar
- Implement filters (jurisdiction, statute, date)
- Implement results display
- Add result detail panel

**Requirements**:
- Search input
- Filter chips
- Results list
- Detail view

#### 72.3: Implement Result Detail Panel
- Create `sveltekit-frontend/src/lib/components/ResultDetail.svelte`
- Display statute text
- Display related cases
- Display evidence references
- Add action buttons

**Requirements**:
- Statute display (serif font)
- Related cases list
- Evidence references
- Save/share buttons

#### 72.4: Implement Evidence Board
- Create `sveltekit-frontend/src/routes/evidence-board/+page.svelte`
- Implement grid layout
- Implement card display
- Implement connection lines
- Add zoom controls

**Requirements**:
- Grid layout (golden ratio)
- Card styling (manila folder)
- Connection visualization
- Zoom/pan controls

#### 72.5: Implement Search Caching
- Update `backend/redis_fp16_cache.py`
- Cache search results
- Cache reranking results
- Implement cache invalidation
- Add cache statistics

**Requirements**:
- Cache top-K results
- 24-hour TTL
- Invalidate on new uploads
- Track hit rate

---

## Phase 73: TensorRT Pooling Optimization

### Objective
Optimize embedding generation with TensorRT pooling and batch processing.

### Tasks

#### 73.1: Implement TensorRT Model Pooling
- Create `backend/tensorrt_pool.py`
- Implement model pool (2-4 instances)
- Implement load balancing
- Implement health checks
- Add metrics collection

**Requirements**:
- Pool size: 2-4 models
- Round-robin load balancing
- Health checks every 30s
- Latency tracking

#### 73.2: Implement Batch Pooling
- Create `backend/batch_pool.py`
- Implement batch queue
- Implement batch timeout (5s)
- Implement batch size optimization
- Add throughput tracking

**Requirements**:
- Max batch size: 32
- Timeout: 5 seconds
- Auto-flush on timeout
- Throughput: 320+ items/sec

#### 73.3: Implement Worker Pool Scaling
- Update `backend/supervisord.conf`
- Add dynamic worker scaling
- Implement queue depth monitoring
- Add auto-scaling rules
- Implement graceful shutdown

**Requirements**:
- Scale up if queue > 100
- Scale down if queue < 10
- Max workers: 8
- Graceful shutdown

#### 73.4: Implement Performance Monitoring
- Create `backend/performance_monitor.py`
- Track embedding latency
- Track reranking latency
- Track search latency
- Implement alerting

**Requirements**:
- Latency tracking
- Throughput tracking
- Alert on > 100ms latency
- Dashboard metrics

#### 73.5: Implement GPU Memory Optimization
- Update `backend/tensorrt_workers/`
- Implement memory pooling
- Implement gradient checkpointing
- Implement mixed precision
- Add memory profiling

**Requirements**:
- GPU memory < 2GB
- Mixed precision (fp16)
- Memory profiling
- Optimization recommendations

#### 73.6: Create Performance Dashboard
- Create `sveltekit-frontend/src/routes/admin/performance/+page.svelte`
- Display latency metrics
- Display throughput metrics
- Display GPU memory usage
- Add alert configuration

**Requirements**:
- Real-time metrics
- Historical graphs
- Alert thresholds
- Export capability

---

## Phase 74: Full Pipeline Integration

### Objective
Wire all components together for end-to-end testing.

### Tasks

#### 74.1: Implement End-to-End Test
- Create `tests/e2e_pipeline.py`
- Test upload → OCR → chunk → embed
- Test search → rerank → display
- Test chat → evidence linking
- Measure end-to-end latency

**Requirements**:
- Full pipeline test
- Latency measurement
- Error handling
- Performance validation

#### 74.2: Implement Load Testing
- Create `tests/load_test.py`
- Test 100 concurrent uploads
- Test 1000 concurrent searches
- Test 100 concurrent chats
- Measure system limits

**Requirements**:
- Concurrent upload test
- Concurrent search test
- Concurrent chat test
- Bottleneck identification

#### 74.3: Implement Integration Tests
- Create `tests/integration/`
- Test MinIO ↔ Worker
- Test Worker ↔ Qdrant
- Test Search ↔ Rerank
- Test Chat ↔ Evidence

**Requirements**:
- Component integration
- Error scenarios
- Retry logic
- Timeout handling

#### 74.4: Create Deployment Guide
- Create `PHASE_70_DEPLOYMENT.md`
- Document all components
- Document configuration
- Document troubleshooting
- Document scaling

**Requirements**:
- Setup instructions
- Configuration guide
- Troubleshooting guide
- Scaling recommendations

#### 74.5: Implement Monitoring Dashboard
- Create `sveltekit-frontend/src/routes/admin/monitoring/+page.svelte`
- Display system health
- Display component status
- Display error logs
- Add alerting

**Requirements**:
- System health view
- Component status
- Error log viewer
- Alert configuration

#### 74.6: Create Production Checklist
- Create `PHASE_70_PRODUCTION_CHECKLIST.md`
- Document all requirements
- Document testing procedures
- Document deployment steps
- Document rollback procedures

**Requirements**:
- Pre-deployment checklist
- Testing procedures
- Deployment steps
- Rollback procedures

---

## Task Dependencies

```
Phase 70 (AI Chat):
  70.1 → 70.2 → 70.3 → 70.4 → 70.5 → 70.6

Phase 71 (Upload + Worker):
  71.1 → 71.2 → 71.3 → 71.4 → 71.5 → 71.6 → 71.7

Phase 72 (Search):
  72.1 → 72.2 → 72.3 → 72.4 → 72.5

Phase 73 (TensorRT Pooling):
  73.1 → 73.2 → 73.3 → 73.4 → 73.5 → 73.6

Phase 74 (Integration):
  74.1 → 74.2 → 74.3 → 74.4 → 74.5 → 74.6

Cross-Phase Dependencies:
  Phase 70 → Phase 71 (chat needs evidence)
  Phase 71 → Phase 72 (search needs uploaded evidence)
  Phase 72 → Phase 73 (search needs fast embedding)
  Phase 73 → Phase 74 (optimization before integration)
```

---

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 70 | 2-3 days | Ready |
| Phase 71 | 2-3 days | Ready |
| Phase 72 | 2-3 days | Ready |
| Phase 73 | 1-2 days | Ready |
| Phase 74 | 1-2 days | Ready |
| **Total** | **8-13 days** | **Ready** |

---

## Success Criteria

### Phase 70
- [ ] Chat interface working
- [ ] Legal guardrails enforced
- [ ] Evidence linking functional
- [ ] Streaming responses working

### Phase 71
- [ ] File upload working
- [ ] MinIO storage functional
- [ ] Worker triggered via RabbitMQ
- [ ] Progress streaming working

### Phase 72
- [ ] Search endpoint working
- [ ] Reranking functional
- [ ] Results displayed correctly
- [ ] Evidence board rendering

### Phase 73
- [ ] TensorRT pooling working
- [ ] Batch processing optimized
- [ ] Worker scaling functional
- [ ] Performance metrics collected

### Phase 74
- [ ] End-to-end pipeline working
- [ ] Load test passing
- [ ] Integration tests passing
- [ ] Production ready

---

## Next Steps

1. **Start Phase 70**: AI Chat Wiring
   - Implement chat backend service
   - Add legal guardrails
   - Create chat UI

2. **Then Phase 71**: Evidence Upload
   - Implement MinIO client
   - Wire RabbitMQ task publishing
   - Create upload UI

3. **Then Phase 72**: RAG Search
   - Implement search endpoint
   - Create search UI
   - Add evidence board

4. **Then Phase 73**: TensorRT Pooling
   - Implement model pooling
   - Optimize batch processing
   - Add performance monitoring

5. **Finally Phase 74**: Full Integration
   - End-to-end testing
   - Load testing
   - Production deployment

---

## Resources

- **AI Chat**: Gemma3 legal model + guardrails
- **Evidence Upload**: MinIO + RabbitMQ
- **Search**: Qdrant + MiniLM reranker
- **TensorRT**: Model pooling + batch optimization
- **Monitoring**: Prometheus + Grafana

---

## Estimated Effort

- **Phase 70**: 40 hours (backend + frontend)
- **Phase 71**: 40 hours (Go + Python + frontend)
- **Phase 72**: 30 hours (search + UI)
- **Phase 73**: 20 hours (optimization)
- **Phase 74**: 20 hours (testing + deployment)

**Total**: ~150 hours (~4 weeks at 40 hrs/week)

---

## Ready to Start?

All phases are ready for implementation. Choose your starting point:

**Option 1**: Start with Phase 70 (AI Chat) - Fastest to MVP
**Option 2**: Start with Phase 71 (Upload) - Foundation first
**Option 3**: Start with Phase 73 (Optimization) - Performance first

**Recommendation**: Phase 70 → 71 → 72 → 73 → 74 (sequential)

Let me know which phase you want to start with! 🚀
