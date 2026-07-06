# Production Hardening Roadmap

**Date**: July 6, 2026  
**Vision**: Self-prompting legal AI assistant with semantic intelligence, audio/visual synthesis, and network-aware agentic workflows  
**Status**: LAYER 1 ✅ COMPLETE | Export Stack ✅ READY | LAYER 2 🔴 BLOCKING | Phase 17+ 🟡 IN PROGRESS

---

## 🎯 Core Threading (Priority Order)

### THREAD 1: LAYER 2 Feature Extraction (BLOCKING) — 7-10h

**Current State**: ast_symbols 0.9%, lexical 2.4%, entities 0%

**Phase 2A** (1-2h) — Fix ast-grep synthetic keys
- Maps phase1-ast-grep output to real atlas_packets via source_ref
- Unblocks all downstream extraction
- Script: `npm run atlas:phase1:ast-grep:dry` → verify → apply

**Phase 2B** (2-3h) — Lexical extraction
- Token-level features, language-specific keywords
- Script: `npm run atlas:phase1.5:lexical:dry`

**Phase 2C** (2h parallel) — Entity extraction  
- EMAIL, PHONE, ROUTE, FUNCTION, legal entities
- LangExtract-backed with confidence scores

**Phase 2D** (6-8h) — Remaining: imports/exports, functions, classes, routes, permissions

**Unblocks**: QLoRA training dataset (once >80% coverage achieved)

---

### THREAD 2: Speculative Decoding + Token Optimization — 3-4h

**MTP Drafters** (Multi-Token Prediction)
- Parallel token generation (N tokens ahead)
- Used by Gemma4 for inference speedup
- KV cache optimization (asymmetric K/V quantization)

**Token Maxxing Strategy**
- context_length: 65536 (16K reserved for output)
- cache_prompt: true (system prompt reuse across batches)
- cache_reuse: 256 (KV reuse window)

**Implementation**:
- Wire into phase7-gemma4-worker (existing)
- Benchmark: measure tokens/sec improvement
- Target: >100 tok/sec on RTX 3060 Ti with turbo3 KV cache

---

### THREAD 3: Redis Centroid + BitFrost Buckets — 2-3h

**Centroid Strategy**
- Feature-level centroids: bitfrost:centroid:feature:{feature_id}
- SOM-level centroids: bitfrost:centroid:som:{cluster_id}  
- Packet-level cache: bitfrost:packet:{packet_key} (envelope)

**Bucket Organization**
- L1: Hot packets (cache hit rate >80%)
- L2: Warm packets (cache hit rate 20-80%)
- L3: Cold packets (cache hit rate <20%)
- TTL strategy per layer (5min, 1hr, 24hr)

**Implementation**:
- Extend phase8b-bitfrost-packet-cache.mjs
- Add bucket LRU eviction (maxmemory-policy allkeys-lru)
- Telemetry: track hit rates per bucket

---

### THREAD 4: Telemetry + Topology Routing — 4-5h

**Gate States** (Gemma4, Qdrant, TurboVec, Go Retrieval, Neo4j)
- Health probe per service (HTTP + timeout)
- Route decision tree based on availability
- Fallback cascade: Gemma4 → Ollama → ONNX

**Network Awareness**
- Latency per lane (measured via telemetry)
- Select lane based on <P95 latency
- Track divergence (why did this lane fail?)

**Topology Routing**
- Query → embed (Gemma4 or Ollama)
- SOM prefilter (4D topology)
- Qdrant ANN (dense retrieval)
- Neo4j topology expansion (k-hop neighbors)
- Rerank (GPU or CPU based on load)

**Implementation**:
- scripts/atlas/telemetry-route-selector.mjs (NEW)
- Redis cache: `telemetry:lane:{name}:latency_p95`
- Dashboard: Grafana or Redis CLI insights

---

### THREAD 5: Phase 17+ Production Hardening — 2-3 weeks

**Phase 17** — GPU hardening audit
- Check: VRAM pressure, kernel launch latency, memory leaks
- Scripts: phase17-gpu-hardening-audit-v2.mjs (existing)

**Phase 18** — Kanban task board + agentic workflows
- Track in-flight requests (Redis + CouchDB)
- Workflow state machine (XState v5)
- Self-prompting: agent asks "what should I do next?"

**Phase 19** — Adaptive task scheduling
- Prioritize by dependency + deadline
- Load-aware (CPU/GPU/IO saturation)
- Backpressure when queues exceed threshold

**Phase 20** — npm build library + GitHub integrations
- Package as monorepo: parent-atlas, parent-atlas-ingest, parent-atlas-retrieval
- npm publish to GitHub Package Registry
- CLI tool: `npx parent-atlas search "query"` + analyze results

---

## 📊 Legal AI Features (Self-Prompting Era)

### Court Case Analysis
- Upload evidence (PDF, audio, video)
- Extract: parties, claims, facts, legal authorities, citations
- Synthesize: summary, timeline, key issues, precedent connections
- Generate: mock arguments, counter-analysis, risk assessment

### Audio/Visual Synthesis
- **Audio**: Transcript annotation (who said what, objections, tone)
- **Visual**: Timeline with transcript sync, key moments highlighted
- **Synthesis**: Generate demo video of courtroom with witness positions, evidence boards

### Self-Prompting Features
- Agent asks: "Should I analyze the counterclaims?"
- User approves or refines the prompt
- Agent generates: detailed analysis with citation backing
- Feedback loop: "Is this analysis helpful?" → improve ranking

### Enhanced PII + Copyright Awareness
- Detect: SSN, credit card, attorney license numbers (legal PII)
- Redact before indexing
- Copyright check: flag copyrighted court opinions vs public domain
- Trademark: flag brand names in proper case (Nike → Nike™)

### Legal Search + Opinion Mining
- Query: "cases about X" + "federal vs state" filter
- Retrieve: cases + opinions + statute references
- Opinion mining: extract holdings, reasoning, dissents
- Precedent strength: newer cases override older (unless overruled)

---

## 🏗️ Architecture Decisions

### Identity Frozen (LAYER 1)
- packet_key, source_ref, feature_id — immutable
- Only LAYER 2/3/4 additions from now on

### Training Dataset Contract (QLoRA)
- **Input**: 384-dim embedding (from EmbeddingGemma)
- **Output**: 64-dim latent (from autoencoder)
- **Labels**: domain_class, concepts (for supervision)
- **Exclude**: qdrant_point_id (bridge only), packet_key (identity)

### Production Packaging
- Docker image: node.js + Python (for LangExtract, ONNX)
- Volumes: /data (Postgres), /cache (Redis), /models (ONNX, .pt)
- Startup: validate all services (health checks), warm cache
- Orchestration: Kubernetes or Docker Compose

### Agentic Memory
- Episodic: current session trace (Redis/CouchDB)
- Semantic: codebase/case understanding (Qdrant)
- Procedural: workflow tasks + completions (Neo4j DAG)
- Consolidated: RL policy learns from feedback across all three

---

## 📋 Immediate Action Items (Next 2 Weeks)

| Phase | Task | Effort | Blocking | Dependencies |
|-------|------|--------|----------|--------------|
| **2A** | ast-grep synthetic key fix | 1-2h | CRITICAL | LAYER 1 (done) |
| **2B** | Lexical extraction | 2-3h | Yes | Phase 2A |
| **2C** | Entity extraction | 2h | Yes | Phase 2A |
| **Token** | MTP drafters + benchmark | 3-4h | No | Gemma4 server |
| **Bitfrost** | Centroid + bucket LRU | 2-3h | No | Redis (up) |
| **Telemetry** | Gate state + routing selector | 4-5h | No | All services |
| **Phase17** | GPU hardening audit | 1-2h | No | CUDA (up) |
| **Kanban** | Task board + XState wiring | 3-4h | No | CouchDB (up) |

**Critical Path**: Phase 2A → 2B → 2C → 2D (complete LAYER 2) → QLoRA training → Autoencoder → Adapter tuning → Production packaging

---

## 🔧 npm Scripts to Add

```bash
# LAYER 2 Extraction
npm run atlas:phase2:extract:all:dry
npm run atlas:phase2:extract:all:apply

# Token Optimization
npm run gemma4:speculative-decode:benchmark
npm run gemma4:token-cache:tuning

# BitFrost Buckets
npm run bitfrost:bucket:audit
npm run bitfrost:bucket:rebalance

# Telemetry
npm run telemetry:route-selector:test
npm run telemetry:dashboard:start

# Production
npm run build:docker:production
npm run docker:compose:up
npm run health:production:full
```

---

## 🎓 Success Metrics

| Metric | Current | Target | Deadline |
|--------|---------|--------|----------|
| LAYER 2 coverage | 0.9% (ast) | >80% (all fields) | Session 110 |
| Gemma4 tokens/sec | 75 | >100 | Session 111 |
| BitFrost hit rate | 40% | >80% | Session 111 |
| Production readiness | 60% | 95% | Session 112 |
| Legal feature coverage | MVP | Full (audio+visual) | Session 113 |

---

**Updated**: July 6, 2026 (Session 109+ Continuation)  
**Next Review**: Session 110 (Phase 2A complete expected)
