# PRODUCTION ENHANCEMENT ROADMAP — March 31, 2026
**Status**: SUPERSEDED — core stabilization done, replaced by PRODUCTION_READINESS (Mar 25) + architecture-backlog (Apr 17). Archive candidate.
## From Current Healthy Core To Full Accelerated Platform

---

## Phase 1: Stabilize The Current Healthy Core

### Objective

Keep the current app reliable while making optional services measurable and visible.

### Deliverables

- keep PostgreSQL, Redis, Qdrant, RabbitMQ, MinIO, Ollama, and LangExtract as the stable baseline
- keep CouchDB and Neo4j healthy but optional
- keep `/api/health` and `/api/health/capabilities` as the single visibility layer
- enable Langfuse in controlled production environments

### Exit Criteria

- core and data tiers remain healthy over repeated smoke tests
- model registry and service capability matrix remain populated
- CouchDB and Neo4j are visible as optional services, not confused with launch blockers

---

## Phase 2: Prove TRT-LLM In The Real Node.js Path

### Objective

Promote TRT-LLM from configured fallback target to a proven serving backend.

### Deliverables

- WSL2 Docker GPU validation complete
- `/api/ai/tensorrt` proven
- `/api/ai/tensorrt/stream` proven
- `/api/health` and `/api/health/capabilities` reflect truth
- GPU arbiter behavior benchmarked

### Exit Criteria

- TRT-LLM returns real responses on the live Node.js route path
- Ollama fallback still works when TRT-LLM is down
- no lease starvation or VRAM thrash under moderate concurrency

---

## Phase 3: Add PyTorch As The Dedicated VLM Tier

### Objective

Use PyTorch for Gemma 3 VLM and image or graph-adjacent tasks without destabilizing the main app path.

### Deliverables

- dedicated PyTorch service contract behind Node.js
- VLM request format for image + prompt inference
- document image analysis path
- optional graph-analysis acceleration path
- Langfuse tracing for VLM calls

### Exit Criteria

- PyTorch VLM is reachable via one narrow service boundary
- VLM failures degrade gracefully
- uploads and evidence analysis continue to work without VLM availability

---

## Phase 4: Promote Graph Analytics Carefully

### Objective

Use Neo4j where graph traversal clearly outperforms PostgreSQL-only logic.

### Deliverables

- case-authority graph sync hardened
- graph relationship routes benchmarked
- user interaction sync clarified
- graph centrality and recommendation paths measured

### Exit Criteria

- Neo4j adds measurable value to at least one live workflow
- PostgreSQL remains the source of truth
- graph sync failures remain non-fatal

---

## Phase 5: Expand Knowledge Side Stores Safely

### Objective

Use CouchDB for flexible document-style synthesis and tag artifacts without creating data ownership confusion.

### Deliverables

- ACE tag and synthesis stores validated
- error-brain CouchDB search path benchmarked
- retention and cleanup strategy defined

### Exit Criteria

- CouchDB has a clear role as side-store, not primary DB
- degradation paths stay clean if CouchDB is unavailable

---

## Phase 6: Native Visibility And AST Graph Program

### Objective

Make the cross-language boundary auditable before native acceleration becomes more important.

### Deliverables

- TS route graph
- TS service graph
- TS -> N-API -> C++ call map
- CUDA fallback matrix
- silent failure register
- Mermaid architecture graph

### Exit Criteria

- every native export has a documented consumer or is marked unused
- every CUDA-hard path has a documented fallback decision
- build-time native assumptions are explicit

---

## Phase 7: Concurrency, Parallelism, And Cache Hardening

### Objective

Use the existing Redis and RabbitMQ substrate to support acceleration without collapse under load.

### Deliverables

- benchmark queue backlog and retry behavior
- benchmark Redis hit rate and eviction behavior
- benchmark inference router latency under mixed TRT/Ollama traffic
- benchmark VLM queue and timeout behavior

### Exit Criteria

- system remains stable under realistic concurrent traffic
- queue backlog does not break user-facing latency budgets
- cache behavior is observable and predictable

---

## Phase 8: Final Production Language

Use these readiness labels:

- **Core platform ready**: current case-analysis, uploads, retrieval, orchestration
- **Optional graph and knowledge services ready**: CouchDB and Neo4j healthy and useful but not required
- **GPU acceleration partial**: TRT-LLM and PyTorch available only where end-to-end proof exists
- **Advanced native tooling in progress**: AST and cross-language visibility layer being hardened

---

## Bottom Line

The implementation order should be:

1. prove TRT-LLM in WSL2 behind the existing Node router
2. add PyTorch VLM as a separate serving tier
3. enable Langfuse end-to-end
4. promote Neo4j only where graph traversal adds clear value
5. keep CouchDB as a side-store
6. complete the TS -> N-API -> C++ visibility program
7. benchmark concurrency, GPU lease policy, and caching under load
# PRODUCTION ENHANCEMENT ROADMAP — March 31, 2026
## From Current Healthy Core To Full Accelerated Platform

---

## Phase 1: Stabilize The Current Healthy Core

### Objective

Keep the current app reliable while making optional services measurable and visible.

### Deliverables

- keep PostgreSQL, Redis, Qdrant, RabbitMQ, MinIO, Ollama, and LangExtract as the stable baseline
- keep CouchDB and Neo4j healthy but optional
- keep `/api/health` and `/api/health/capabilities` as the single visibility layer
- enable Langfuse in controlled production environments

### Exit Criteria

- core and data tiers remain healthy over repeated smoke tests
- model registry and service capability matrix remain populated
- CouchDB and Neo4j are visible as optional services, not confused with launch blockers

---

## Phase 2: Prove TRT-LLM In The Real Node.js Path

### Objective

Promote TRT-LLM from configured fallback target to a proven serving backend.

### Deliverables

- WSL2 Docker GPU validation complete
- `/api/ai/tensorrt` proven
- `/api/ai/tensorrt/stream` proven
- `/api/health` and `/api/health/capabilities` reflect truth
- GPU arbiter behavior benchmarked

### Exit Criteria

- TRT-LLM returns real responses on the live Node.js route path
- Ollama fallback still works when TRT-LLM is down
- no lease starvation or VRAM thrash under moderate concurrency

---

## Phase 3: Add PyTorch As The Dedicated VLM Tier

### Objective

Use PyTorch for Gemma 3 VLM and image or graph-adjacent tasks without destabilizing the main app path.

### Deliverables

- dedicated PyTorch service contract behind Node.js
- VLM request format for image + prompt inference
- document image analysis path
- optional graph-analysis acceleration path
- Langfuse tracing for VLM calls

### Exit Criteria

- PyTorch VLM is reachable via one narrow service boundary
- VLM failures degrade gracefully
- uploads and evidence analysis continue to work without VLM availability

---

## Phase 4: Promote Graph Analytics Carefully

### Objective

Use Neo4j where graph traversal clearly outperforms PostgreSQL-only logic.

### Deliverables

- case-authority graph sync hardened
- graph relationship routes benchmarked
- user interaction sync clarified
- graph centrality and recommendation paths measured

### Exit Criteria

- Neo4j adds measurable value to at least one live workflow
- PostgreSQL remains the source of truth
- graph sync failures remain non-fatal

---

## Phase 5: Expand Knowledge Side Stores Safely

### Objective

Use CouchDB for flexible document-style synthesis and tag artifacts without creating data ownership confusion.

### Deliverables

- ACE tag and synthesis stores validated
- error-brain CouchDB search path benchmarked
- retention and cleanup strategy defined

### Exit Criteria

- CouchDB has a clear role as side-store, not primary DB
- degradation paths stay clean if CouchDB is unavailable

---

## Phase 6: Native Visibility And AST Graph Program

### Objective

Make the cross-language boundary auditable before native acceleration becomes more important.

### Deliverables

- TS route graph
- TS service graph
- TS -> N-API -> C++ call map
- CUDA fallback matrix
- silent failure register
- Mermaid architecture graph

### Exit Criteria

- every native export has a documented consumer or is marked unused
- every CUDA-hard path has a documented fallback decision
- build-time native assumptions are explicit

---

## Phase 7: Concurrency, Parallelism, And Cache Hardening

### Objective

Use the existing Redis and RabbitMQ substrate to support acceleration without collapse under load.

### Deliverables

- benchmark queue backlog and retry behavior
- benchmark Redis hit rate and eviction behavior
- benchmark inference router latency under mixed TRT/Ollama traffic
- benchmark VLM queue and timeout behavior

### Exit Criteria

- system remains stable under realistic concurrent traffic
- queue backlog does not break user-facing latency budgets
- cache behavior is observable and predictable

---

## Phase 8: Final Production Language

Use these readiness labels:

- **Core platform ready**: current case-analysis, uploads, retrieval, orchestration
- **Optional graph and knowledge services ready**: CouchDB and Neo4j healthy and useful but not required
- **GPU acceleration partial**: TRT-LLM and PyTorch available only where end-to-end proof exists
- **Advanced native tooling in progress**: AST and cross-language visibility layer being hardened

---

## Bottom Line

The implementation order should be:

1. prove TRT-LLM in WSL2 behind the existing Node router
2. add PyTorch VLM as a separate serving tier
3. enable Langfuse end-to-end
4. promote Neo4j only where graph traversal adds clear value
5. keep CouchDB as a side-store
6. complete the TS -> N-API -> C++ visibility program
7. benchmark concurrency, GPU lease policy, and caching under load
