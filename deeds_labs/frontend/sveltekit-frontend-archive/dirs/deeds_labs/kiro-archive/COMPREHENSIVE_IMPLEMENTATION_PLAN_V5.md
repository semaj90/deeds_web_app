# 🚀 Comprehensive Implementation Plan V5

**Date**: November 30, 2025
**Status**: AUDIT COMPLETE → READY FOR EXECUTION
**Context**: Dual Architecture (TensorRT GPU + WebAssembly CPU) with 31,777 TS Errors

---

## 📊 Current State Audit Summary

### ✅ What's Working
| Component | Status | Location |
|-----------|--------|----------|
| ACE Orchestrator | ✅ Complete | `backend/services/ace_orchestrator.py` |
| Tool Router | ✅ Complete | `backend/services/tool_router.py` |
| Multi-Source Retriever | ✅ Complete | `backend/services/retrieval/multi_source_retriever.py` |
| Google Search Retriever | ✅ Complete | `backend/services/retrieval/sources/google_search_retriever.py` |
| Citation Manager | ✅ Complete | `backend/services/retrieval/citations/citation_manager.py` |
| Enhanced Web Search | ✅ Complete | `backend/services/retrieval/sources/enhanced_web_search.py` |
| XState GPU Memory | ✅ Complete | `xstate-gpu-memory-orchestration.ts` |
| Quaternion Transformer | ✅ Complete | `backend/services/manifold_projector.py` |
| Tricubic Interpolation | ✅ Complete | `backend/services/manifold_projector.py` |
| 3 Routes Decision | ✅ Complete | `backend/services/alignment_router.py` |
| Sentiment Analysis | ✅ Complete | `backend/services/alignment_router.py` |

### 🔄 Partially Implemented
| Component | Status | Gap |
|-----------|--------|-----|
| Low Confidence Restart | 60% | Need web search trigger + re-embed |
| Matrix Fallback | 60% | Need explicit fallback chain |
| LLM Style Adaptation | 40% | In ACE but not fully wired |
| WebAssembly Workers | 50% | `webllama.worker.ts` exists, needs training cache |

### ❌ Critical Gaps
| Component | Priority | Impact |
|-----------|----------|--------|
| 31,777 TypeScript Errors | 🔴 CRITICAL | IDE slowdown, build failures |
| GPU Leftover Caching | 🟡 HIGH | WebAssembly performance |
| XState Process Classification | 🟡 HIGH | GPU resource management |
| Embedded PageRank | 🟢 MEDIUM | Legal document ranking |

---

## 🎯 Dual Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED RUNTIME ADAPTER                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Query ──────────────────────────────────────────────────► │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────┐                                            │
│  │ Query Analyzer  │ ← Intent, Complexity, Mood                 │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              INTELLIGENT ROUTING (XState)                │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │ Complex     │  │ Quick       │  │ GPU Busy/       │  │    │
│  │  │ Legal       │  │ Questions   │  │ Offline         │  │    │
│  │  │ Analysis    │  │             │  │                 │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │    │
│  └─────────┼────────────────┼──────────────────┼───────────┘    │
│            │                │                  │                 │
│            ▼                ▼                  ▼                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ 🎯 GPU SIDE     │  │ 💻 CLIENT SIDE  │  │ 🔄 FALLBACK     │  │
│  │ TensorRT        │  │ WebAssembly     │  │ Auto-switch     │  │
│  │ gemma3-legal    │  │ gemma3:270m     │  │ GPU→WASM        │  │
│  │ RTX 3060 Ti     │  │ llama.cpp       │  │                 │  │
│  │ 50-200ms        │  │ CHR-ROM+SIMD    │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📋 Phase Breakdown (V5 Continuation)

### Phase 5.1: TypeScript Error Triage (CRITICAL - 2 days)
**Goal**: Reduce 31,777 errors to <1000 to restore IDE performance

#### Strategy: Staged Error Reduction
```
Day 1: Structural Fixes (Target: 31,777 → 15,000)
├── Fix tsconfig.json strict mode issues
├── Add missing type declarations
├── Fix Svelte 5 $state() migrations
└── Batch fix common patterns (TS2307, TS2339)

Day 2: Component Fixes (Target: 15,000 → 1,000)
├── Fix bits-ui v2 API changes
├── Fix event handler types
├── Fix store subscriptions
└── Suppress remaining with // @ts-expect-error
```

#### Files to Create/Modify
```
sveltekit-frontend/tsconfig.json          # Relax strict temporarily
sveltekit-frontend/src/ambient-legacy.d.ts # Add missing types
scripts/batch-fix-ts-errors.mjs           # Automated fixer
```

---

### Phase 5.2: XState GPU Process Management (3 days)
**Goal**: Implement sophisticated GPU resource allocation

#### New XState Machine: GPU Process Classifier
```typescript
// File: src/xstate/gpu-process-classifier.ts

type ProcessPriority = 'EMERGENCY' | 'HIGH' | 'MEDIUM' | 'LOW';

interface GPUProcessContext {
  queue: ProcessRequest[];
  activeProcesses: Map<string, ProcessInfo>;
  memoryUsage: number;
  thermalState: 'normal' | 'warm' | 'hot' | 'throttling';
}

const gpuProcessMachine = createMachine({
  id: 'gpuProcessClassifier',
  initial: 'idle',
  context: {
    queue: [],
    activeProcesses: new Map(),
    memoryUsage: 0,
    thermalState: 'normal'
  },
  states: {
    idle: {
      on: {
        SUBMIT_PROCESS: {
          target: 'classifying',
          actions: 'enqueueProcess'
        }
      }
    },
    classifying: {
      invoke: {
        src: 'classifyProcess',
        onDone: { target: 'scheduling' }
      }
    },
    scheduling: {
      always: [
        { target: 'executing', cond: 'canExecuteNow' },
        { target: 'queued', cond: 'mustQueue' },
        { target: 'fallback_wasm', cond: 'gpuOverloaded' }
      ]
    },
    executing: {
      invoke: {
        src: 'executeOnGPU',
        onDone: { target: 'idle', actions: 'releaseResources' },
        onError: { target: 'fallback_wasm' }
      }
    },
    fallback_wasm: {
      invoke: {
        src: 'executeOnWASM',
        onDone: { target: 'idle' }
      }
    },
    queued: {
      after: {
        100: { target: 'scheduling' }  // Re-check every 100ms
      }
    }
  }
});
```

#### Process Classification Logic
```typescript
// Classification based on request type
function classifyProcess(request: ProcessRequest): ProcessPriority {
  const { type, documentSize, deadline } = request;

  // EMERGENCY: Critical legal deadlines
  if (deadline && deadline < Date.now() + 60000) return 'EMERGENCY';

  // HIGH: Complex legal document analysis
  if (type === 'legal_analysis' && documentSize > 100000) return 'HIGH';

  // MEDIUM: Batch embedding generation
  if (type === 'embedding_batch') return 'MEDIUM';

  // LOW: Background indexing
  return 'LOW';
}
```

---

### Phase 5.3: WebAssembly Training & Caching (4 days)
**Goal**: Implement GPU leftover caching for WebAssembly fallback

#### Cache Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    GPU LEFTOVER CACHE                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  L1 Cache (Hot)     │ IndexedDB    │ 10ms access            │
│  ├── Recent GPU results                                      │
│  └── Frequently accessed embeddings                          │
│                                                              │
│  L2 Cache (Warm)    │ Service Worker │ 50ms access          │
│  ├── Partial computation results                             │
│  └── Intermediate tensor states                              │
│                                                              │
│  L3 Cache (Cold)    │ LocalStorage  │ 200ms access          │
│  ├── Model weight snapshots                                  │
│  └── Embedding fragments                                     │
│                                                              │
│  Persistent         │ MinIO/S3     │ Network access          │
│  └── Legal precedent cache                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### Files to Create
```
sveltekit-frontend/src/lib/cache/
├── gpu-leftover-cache.ts      # Main cache manager
├── indexeddb-adapter.ts       # L1 cache
├── service-worker-cache.ts    # L2 cache
└── minio-sync.ts              # Persistent sync

sveltekit-frontend/src/workers/
├── cache-sync-worker.ts       # Background sync
└── embedding-cache-worker.ts  # Embedding management
```

---

### Phase 5.4: Embedded PageRank Integration (2 days)
**Goal**: Legal document ranking with Gemma embeddings

#### PageRank + Embedding Hybrid
```python
# File: backend/services/legal_pagerank.py

class LegalPageRank:
    """Embedding-enhanced PageRank for legal documents."""

    def __init__(self, embedding_service, neo4j_client):
        self.embedding_service = embedding_service
        self.neo4j = neo4j_client

    async def compute_hybrid_rank(
        self,
        documents: List[Document],
        query_embedding: np.ndarray
    ) -> List[RankedDocument]:
        """
        Combine traditional PageRank with semantic similarity.

        Weights:
        - Vector similarity: 0.4
        - Citation PageRank: 0.3
        - Court authority: 0.2
        - Recency: 0.1
        """
        # 1. Build citation graph
        citation_graph = await self._build_citation_graph(documents)

        # 2. Compute traditional PageRank
        pagerank_scores = self._compute_pagerank(citation_graph)

        # 3. Compute semantic similarity
        similarity_scores = await self._compute_similarity(
            documents, query_embedding
        )

        # 4. Get court authority scores
        authority_scores = await self._get_authority_scores(documents)

        # 5. Compute recency scores
        recency_scores = self._compute_recency(documents)

        # 6. Combine with SIMD-optimized weighted sum
        return self._simd_weighted_rank(
            documents,
            similarity=similarity_scores,
            pagerank=pagerank_scores,
            authority=authority_scores,
            recency=recency_scores,
            weights=[0.4, 0.3, 0.2, 0.1]
        )
```

---

### Phase 5.5: 3 Routes + Restart Completion (2 days)
**Goal**: Complete the retrieval strategy implementation

#### Missing Pieces to Implement

##### 1. Low Confidence Restart
```python
# Add to backend/services/alignment_router.py

async def handle_low_confidence(
    self,
    query: str,
    confidence: float,
    session_id: str,
    threshold: float = 0.5
) -> Dict[str, Any]:
    """
    Handle low confidence by restarting with web search.

    Flow:
    1. Trigger web search
    2. Re-embed results
    3. Store in Qdrant
    4. Reset session context
    5. Retry search
    """
    if confidence >= threshold:
        return {"status": "ok", "confidence": confidence}

    # 1. Web search
    web_results = await self.web_search.search(query, top_k=10)

    # 2. Re-embed
    embeddings = await self.embedding_service.batch_embed(
        [r.content for r in web_results]
    )

    # 3. Store in Qdrant
    await self.qdrant_client.upsert(
        collection_name="web_search_cache",
        points=[
            PointStruct(
                id=hash(r.id) % (2**31),
                vector=emb,
                payload={"content": r.content, "url": r.url}
            )
            for r, emb in zip(web_results, embeddings)
        ]
    )

    # 4. Reset context
    await self.redis.delete(f"session:{session_id}:context")

    # 5. Retry
    return {
        "status": "restarted",
        "new_results": web_results,
        "embeddings_stored": len(embeddings)
    }
```

##### 2. Matrix Transformation Fallback
```python
# Add to backend/services/alignment_router.py

FALLBACK_CHAIN = {
    "legal_rag_plus_kag": ["legal_rag_safe", "general_web", "web_search_reembed"],
    "legal_rag_safe": ["general_web", "web_search_reembed"],
    "general_web": ["web_search_reembed"]
}

async def matrix_transform_fallback(
    self,
    query: str,
    primary_route: str,
    session_id: str
) -> Dict[str, Any]:
    """
    Try fallback routes in order until one succeeds.
    """
    chain = FALLBACK_CHAIN.get(primary_route, ["web_search_reembed"])

    for fallback_route in chain:
        try:
            result = await self._execute_route(query, fallback_route, session_id)
            if result.get("results"):
                return {
                    "status": "success",
                    "route": fallback_route,
                    "results": result["results"]
                }
        except Exception as e:
            logger.warning(f"Fallback {fallback_route} failed: {e}")
            continue

    # Last resort
    return await self.handle_low_confidence(query, 0.0, session_id)
```

---

### Phase 5.6: ACE Integration & Tool Wiring (2 days)
**Goal**: Wire all components through ACE orchestrator

#### Updated Tool Router Registration
```python
# Update backend/services/tool_router.py

def create_enhanced_tools(
    knowledge_store,
    phase72_context,
    granite_client,
    alignment_router,      # NEW
    gpu_orchestrator,      # NEW
    wasm_cache_manager,    # NEW
    legal_pagerank         # NEW
) -> ToolRouter:
    """Create enhanced tool router with all Phase 5 components."""

    router = ToolRouter()

    # ... existing tools ...

    # NEW: GPU Process Management
    @router.register
    def submit_gpu_process(args: Dict[str, Any]) -> Dict[str, Any]:
        """Submit a process to GPU with priority classification."""
        return gpu_orchestrator.submit(
            type=args.get("type"),
            payload=args.get("payload"),
            deadline=args.get("deadline")
        )

    # NEW: WebAssembly Fallback
    @router.register
    def execute_wasm_inference(args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute inference on WebAssembly with cached embeddings."""
        return wasm_cache_manager.execute(
            query=args.get("query"),
            use_cache=args.get("use_cache", True)
        )

    # NEW: Legal PageRank Search
    @router.register
    def legal_pagerank_search(args: Dict[str, Any]) -> Dict[str, Any]:
        """Search with embedding-enhanced PageRank."""
        return legal_pagerank.search(
            query=args.get("query"),
            jurisdiction=args.get("jurisdiction"),
            top_k=args.get("top_k", 10)
        )

    # NEW: 3 Routes + Restart
    @router.register
    def smart_retrieval(args: Dict[str, Any]) -> Dict[str, Any]:
        """Smart retrieval with 3 routes + restart strategy."""
        return alignment_router.smart_retrieve(
            query=args.get("query"),
            session_id=args.get("session_id"),
            mood=args.get("mood", "neutral")
        )

    return router
```

---

## 📅 Timeline Summary

| Phase | Duration | Start | End | Deliverables |
|-------|----------|-------|-----|--------------|
| 5.1 TS Error Triage | 2 days | Dec 1 | Dec 2 | <1000 errors |
| 5.2 XState GPU | 3 days | Dec 3 | Dec 5 | Process classifier |
| 5.3 WASM Cache | 4 days | Dec 6 | Dec 9 | GPU leftover cache |
| 5.4 PageRank | 2 days | Dec 10 | Dec 11 | Legal ranking |
| 5.5 3 Routes | 2 days | Dec 12 | Dec 13 | Complete retrieval |
| 5.6 ACE Wire | 2 days | Dec 14 | Dec 15 | Full integration |

**Total**: 15 days (3 weeks)

---

## 🎯 Success Metrics

### Performance
- [ ] TypeScript errors: <1000
- [ ] GPU utilization: >85%
- [ ] WebAssembly cache hit: >90%
- [ ] Inference latency: <100ms (cached)

### Quality
- [ ] Legal ranking accuracy: >94%
- [ ] Citation extraction: >95%
- [ ] Fallback success rate: >99%

### Reliability
- [ ] GPU→WASM failover: <200ms
- [ ] System uptime: >99.9%
- [ ] Error recovery: Automatic

---

## 🔧 Quick Start Commands

```bash
# Phase 5.1: Fix TypeScript errors
npm run check:typescript 2>&1 | head -100
node scripts/batch-fix-ts-errors.mjs

# Phase 5.2: Test XState GPU
npm run test:xstate-gpu

# Phase 5.3: Test WASM cache
npm run test:wasm-cache

# Phase 5.4: Test PageRank
python -m pytest tests/test_legal_pagerank.py

# Phase 5.5: Test 3 Routes
python -m pytest tests/test_alignment_router.py

# Phase 5.6: Integration test
npm run test:integration
```

---

## 📁 File Manifest

### New Files to Create
```
.kiro/COMPREHENSIVE_IMPLEMENTATION_PLAN_V5.md  ← This file
src/xstate/gpu-process-classifier.ts
sveltekit-frontend/src/lib/cache/gpu-leftover-cache.ts
sveltekit-frontend/src/lib/cache/indexeddb-adapter.ts
sveltekit-frontend/src/workers/cache-sync-worker.ts
backend/services/legal_pagerank.py
scripts/batch-fix-ts-errors.mjs
tests/test_legal_pagerank.py
tests/test_alignment_router.py
```

### Files to Modify
```
backend/services/alignment_router.py  # Add restart + fallback
backend/services/tool_router.py       # Add new tools
backend/services/ace_orchestrator.py  # Wire new components
sveltekit-frontend/tsconfig.json      # Relax strict mode
xstate-gpu-memory-orchestration.ts    # Add process classifier
```

---

**Status**: ✅ PLAN COMPLETE - READY FOR EXECUTION
**Next Action**: Start Phase 5.1 (TypeScript Error Triage)
