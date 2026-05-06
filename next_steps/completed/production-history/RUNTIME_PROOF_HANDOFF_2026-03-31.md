# Runtime Proof Handoff — March 31, 2026
**Status**: SUPERSEDED — runtime proofs completed in later sessions (evidence upload, SSE chat, infrastructure all verified). Archive candidate.

## Current Position

The codebase already contains the major integration surfaces that were previously uncertain:

- `/api/evidence/[id]/download` exists and streams from MinIO.
- `publishChatContext()` exists and is called from live chat routes.
- A server-side inference router exists.
- CouchDB and Neo4j are wired as optional or profile-gated services, not pure stubs.
- `model_registry` and `service_capabilities` already exist in schema and migration form.

The remaining uncertainty is runtime proof, not code existence.

---

## Safest Readiness Wording

- [x] Core case-analysis platform: broadly usable
- [x] Uploads, search, and orchestration: strong, but still needs runtime verification on key paths
- [x] TRT-LLM and VLM: partial, fallback-backed, not fully ready
- [x] LoRA and Unsloth: phase 2, not launch-blocking today

---

## Runtime Snapshot

### Verified During This Pass

- [x] `GET /api/health` returns `200`
- [x] `GET /api/health/capabilities` returns `200`
- [x] `GET http://127.0.0.1:8095/health` returns `200`
- [x] `GET http://127.0.0.1:9000/minio/health/live` returns `200`
- [x] Full screenshot suite passed `50/50` routes
- [x] `/api/health/gpu` responds and reports current GPU state
- [x] `/api/gpu/compute` responds for `device_info`
- [x] Frontend dev server restarted cleanly on `http://localhost:5173`
- [x] Dev runtime still injects `OLLAMA_CHAT_KEEP_ALIVE=2m`, `OLLAMA_EMBED_KEEP_ALIVE=24h`, and `ACE_CHAT_SELF_EVAL_ENABLED=false`
- [x] `GET /api/infrastructure/status` returns `200`
- [x] `/api/infrastructure/status` reports router `preferredBackend: ollama` with GPU lease free
- [x] `POST /api/ai/tensorrt` returns `backend: ollama` and `trtAvailable: false` for a valid prompt
- [x] `docker compose config --profiles` still reports `full` and `gpu` as the defined compose profiles

### Observed Runtime Truth

- [x] LangExtract is live on `8095`
- [x] MinIO is live and healthy
- [x] CouchDB is live and healthy
- [x] Neo4j is live and healthy
- [x] Qdrant is reachable by app health checks
- [x] Ollama is reachable by app health checks
- [ ] TRT-LLM is live
- [ ] Triton is live
- [ ] gRPC embeddings are live
- [ ] Go search service is live
- [ ] NATS is live

### Important Health Mismatch

LangExtract had a Docker health mismatch, not a service outage:

- container health was using `curl`
- the container image did not include `curl`
- service HTTP health still returned `200`

Source files were updated to use Python-based healthchecks instead of `curl`.
The live legacy container still needs one clean recreate to fully apply that fix.

---

## Runtime Proof Matrix

## Phase 0 — Truth Cleanup

### 1. Evidence Download In Browser

- [x] Route exists in code
- [ ] Proven in browser with a real uploaded file

Current truth:

- The route streams MinIO objects and resolves `minio://`, HTTP MinIO URLs, and bare keys.
- A proper multipart `POST /api/evidence/upload` with a real text file succeeded and returned `201` with:
  - evidence id `18b31909-e011-444b-b5ee-3288a4c3f34f`
  - job id `job-1775085343308-b1c995b3`
  - MinIO key `evidence/default/2026-04-01T23-15-43-316Z-47541611.txt`
- `GET /api/evidence/job-1775085343308-b1c995b3/status` returned `200` with `status: complete` and the final processing summary.
- `GET /api/evidence/realtime?jobId=job-1775085343308-b1c995b3` emitted `connected`, `progress`, and `complete` SSE events for the live upload job.
- `GET /api/evidence/18b31909-e011-444b-b5ee-3288a4c3f34f/download` returned `200` and streamed back the uploaded file contents exactly: `runtime proof upload test`.
- The earlier `500 Upload failed` result was caused by an invalid probe method (`Invoke-RestMethod -Form` body parse failure), not by a real application pipeline defect.
- `GET /api/evidence/[docId]/status` was also corrected in source so active in-memory upload job IDs are checked before UUID-only DB fallback.

Validation to run:

1. open the evidence detail page for a real uploaded item
2. trigger the browser download action
3. confirm the browser save/open flow matches the already-proven API stream behavior

### 2. `chat.context` Publish And Consume

- [x] Publisher method exists in RabbitMQ manager
- [x] Chat routes call it
- [x] Publish and consume proven end-to-end in runtime via `/api/chat` and `/api/sse/chat`

Current truth:

- `publishChatContext()` exists in `rabbitmq-manager-fixed.ts`
- call sites exist in `src/routes/api/sse/chat/+server.ts`
- call sites also exist in `src/routes/api/chat/+server.ts`
- a live `POST /api/chat` request succeeded and returned an Ollama response in this pass
- live dev-server output shows `RabbitMQ Manager initialized successfully`, active consumers, `Chat context update: api-chat`, and `Upserted 1 points to chat_messages` for both user and assistant messages after the `/api/chat` request
- a live `POST /api/sse/chat` request returned SSE frames (`thinking` + heartbeat), completed the Ollama chat pass, logged `Chat context update: copilot-runtime-proof`, and upserted `chat_messages`
- RabbitMQ management queue inventory remained unhelpful in this pass, but the consumer-side logs and vector upserts are enough to treat publish/consume as runtime-proven

What still needs proof:

1. no additional runtime proof required for `chat.context` unless queue-level broker screenshots are specifically wanted

### 3. Active Docker Profile

- [ ] Exact active compose profile proven

Current truth:

- the app can currently reach postgres, redis, qdrant, rabbitmq, minio, couchdb, ollama, quic, and langextract through live health endpoints
- `docker compose config --profiles` shows `full` and `gpu` are the defined profiles
- local Docker CLI calls are blocked in this session because `//./pipe/dockerDesktopLinuxEngine` is unavailable
- exact active compose project and profile selection therefore remain unproven from Docker itself in this pass

What still needs proof:

1. capture exact compose invocation or active compose project list
2. map currently running services to `essential`, `full`, or `gpu`

### 4. gRPC Live Vs Fallback

- [x] App health exposes gRPC state
- [ ] End-to-end gRPC path proven

Current truth:

- `/api/health` currently reports gRPC unavailable
- `/api/infrastructure/status` reports `tier1_grpc.enabled: false` and `tier1_grpc.available: false`
- `/api/infrastructure/status` reports HTTP/Ollama tier available at `http://127.0.0.1:11434`
- embedding transport tiers show HTTP fallback surfaces are configured
- the app is functioning with fallback behavior, not a live gRPC tier

### 5. Inference Router Backend Selection

- [x] Router exists
- [ ] Live backend selection proven with logs

Current truth:

- `/api/health` reports `trtllm: false`
- `/api/infrastructure/status` reports router `preferredBackend: ollama`
- `POST /api/ai/tensorrt` currently returns `backend: ollama` and `trtAvailable: false`
- router fallback wording is accurate: Ollama is the current dependable backend
- `getRouterStatus()` is exposed on a live route, but `routeInference()` itself is not currently wired to a confirmed live request path in this pass

---

## WSL2 TRT-LLM Readiness Checklist

Use this as a strict go or no-go list before routing heavy synthesis to TRT.

### A. Host And Docker GPU Prerequisites

- [ ] NVIDIA driver works on Windows
- [ ] WSL2 GPU passthrough works
- [ ] Docker Desktop is using the WSL2 backend
- [ ] target container can see the GPU

Validation:

```powershell
nvidia-smi
wsl -l -v
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

Pass if GPU is visible in Windows and inside Docker.

### B. Container Profile And Routing Truth

- [ ] identify whether `essential`, `full`, or `gpu` profile is active
- [ ] verify TRT or Triton services are actually started
- [ ] verify target ports are bound and reachable

Validation:

```powershell
docker compose --profile gpu config
docker ps
curl http://localhost:8099/health
curl http://localhost:8000/v2/health/ready
```

### C. Model Artifact Readiness

- [ ] confirm model repository exists
- [ ] confirm tokenizer, config, checkpoint, and engine artifacts exist
- [ ] confirm inference router expects the same model/backend naming

### D. Runtime API Health

- [ ] run one heavy query with TRT up
- [ ] run one heavy query with TRT down
- [ ] confirm fallback to LiteLLM or Ollama is clean

### E. Streaming And Response Shape

- [ ] stream one long answer from TRT path
- [ ] verify response shape matches existing client expectations
- [ ] confirm no backend-specific parsing hacks remain on the live route

### F. Resource Isolation

- [ ] set explicit memory, `shm`, and GPU constraints
- [ ] verify coexistence with Qdrant, LangExtract, RabbitMQ, Postgres, and Redis
- [ ] confirm no GPU starvation or OOM during retrieval plus synthesis load

### G. Final TRT Verdict Rule

Declare TRT ready only if all of the above pass and:

- [ ] router chooses TRT when intended
- [ ] fallback works when TRT is down
- [ ] one real app route uses TRT successfully
- [ ] streaming works
- [ ] no manual container-only workaround is required after boot

---

## TS -> N-API -> C++ AST Graph Audit Checklist

This is the concrete audit plan for the cross-language map.

### A. TypeScript Route Graph

Collect:

- `src/routes/**/+server.ts`
- `src/routes/**/+page.ts`
- `src/routes/**/+layout.ts`

Record for each route:

- imports from `$lib/server/**`
- queue publishes
- DB calls
- Redis, Qdrant, and MinIO usage
- inference client usage
- native bridge usage

Output:

- route -> service map
- dead route or service references
- circular import report

### B. TypeScript Service Graph

Scan:

- `src/lib/server/**`
- inference router
- RabbitMQ manager
- env and config clients
- graph services
- upload pipeline services

Output:

- service -> infra graph
- optional vs required dependency map

### C. N-API Boundary Inventory

Identify every TS file that loads the addon bridge.

Already verified:

- `src/lib/server/gpu/libtorch-bridge.ts`
- `src/lib/server/gpu/simdjson-bridge.ts`
- built artifact at `simd-bridge/cpp/build/Release/tensorrt_bridge.node`

Record:

- loader file
- exported wrapper methods
- fallback behavior
- PATH or env injection logic
- whether errors bubble or are swallowed

### D. C++ Addon Export Graph

Trace:

- `binding.cc`
- `libtorch_graph.cc`
- CUDA `.cu` files
- helper files and linked libs

Output:

- N-API export -> C++ implementation map

### E. CUDA And LibTorch Path Audit

For each exported native op, record:

- LibTorch CPU path
- `torch::cuda::is_available()` behavior
- required DLLs and runtime deps
- what happens under dev server runtime versus ad hoc shell runtime

### F. Cross-Language Call Map

Build a merged graph with nodes for:

- TS routes
- TS services
- queue names
- native wrapper functions
- N-API exports
- C++ files
- CUDA kernels
- Docker services
- DB tables and Qdrant collections

### G. Deliverables

Produce:

- Mermaid graph skeleton
- CSV or JSON edge list
- hot paths list
- dead or stale wiring list
- environment-sensitive native paths list

---

## Production Enhancement Roadmap

## Phase 0 — Runtime Proof And Truth Cleanup

Goal: prove what already exists.

Tasks:

- [ ] verify `/api/evidence/[id]/download` in browser with a real uploaded file
- [ ] verify `chat.context` publish and consume with a real SSE chat session
- [ ] confirm active Docker profile and which optional services are truly up
- [ ] verify gRPC live vs fallback
- [ ] verify current inference router backend selection under live conditions

Exit criteria:

- [ ] all five runtime proofs documented with pass/fail and logs

## Phase 1 — Production Hardening

Goal: make the current core platform safer.

Tasks:

- [ ] unify health wording by live vs future vs optional
- [ ] add stronger observability around backend chosen by inference router
- [ ] add RabbitMQ publish-failure handling and alerting where needed
- [ ] add DLQ visibility if missing
- [ ] tighten upload and retrieval status semantics across evidence and library flows
- [ ] fix runtime discrepancies discovered in phase 0

## Phase 2 — Inference Routing Maturity

Goal: make backend selection explicit and observable.

Tasks:

- [ ] formalize server-side routing policy: light -> Ollama, heavy -> TRT-LLM, multimodal -> PyTorch VLM
- [x] central `model_registry` schema exists
- [x] central `service_capabilities` schema exists
- [ ] extend capability flags and operational usage policy if needed
- [ ] add per-backend health and readiness probes where still missing

Exit criteria:

- [ ] backend selection is data-driven and observable

## Phase 3 — WSL2 TRT-LLM Bring-Up

Goal: activate the heavy inference path.

Tasks:

- [ ] bring up GPU compose profile
- [ ] validate TRT container and routing checklist
- [ ] mount model artifacts correctly
- [ ] verify streaming and structured outputs
- [ ] test fallback to LiteLLM or Ollama
- [ ] document Windows vs WSL2 vs container runtime expectations

## Phase 4 — PyTorch VLM Path

Goal: make Gemma 3 VLM the multimodal backbone.

Tasks:

- [ ] stand up PyTorch multimodal container
- [ ] connect image and document analysis routes to it
- [ ] define when YOLO, Docling, or LangExtract feed into VLM vs bypass it
- [ ] verify POI photo, screenshot, and document-page flows
- [ ] add result caching and graph enrichment hooks

## Phase 5 — Graph And Knowledge Expansion

Goal: decide the live role of optional graph services.

Tasks:

- [ ] decide whether CouchDB is needed live or remains optional
- [ ] decide whether Neo4j becomes active or Postgres graph remains primary
- [ ] wire graph enrichment earlier into retrieval where justified
- [ ] add graph sync observability

## Phase 6 — Native And GPU Bridge Maturity

Goal: turn environment-sensitive native code into a dependable subsystem.

Tasks:

- [ ] complete the TS -> N-API -> C++ graph audit
- [ ] prove addon behavior inside real app runtime and container runtime
- [ ] document DLL and library path handling
- [ ] add startup diagnostics for CUDA and native readiness
- [ ] decide which ops stay native vs move to TRT or PyTorch

## Phase 7 — LoRA, Unsloth, And Adapter Platform

Goal: phase-2 training and deployment layer.

Tasks:

- [ ] add Python worker for Unsloth and PEFT
- [ ] dataset loader and checkpoint management
- [ ] adapter merge and load strategy
- [ ] model-registry integration
- [ ] job tracking and artifact storage
- [ ] inference-time adapter selection rules

---

## Ready-To-Do List For The Next Sync

### Immediate

- [ ] prove evidence download in browser
- [ ] prove `chat.context` publish and consume
- [ ] capture active Docker profile
- [ ] capture actual backend selection from inference router
- [ ] capture gRPC live vs fallback behavior

### Next

- [ ] write server-side inference routing policy doc
- [ ] prepare WSL2 TRT compose validation
- [ ] generate TS -> N-API -> C++ edge list

### After That

- [ ] bring up TRT-LLM GPU path
- [ ] bring up PyTorch VLM path
- [ ] decide CouchDB and Neo4j live role
- [ ] start adapter and trainer phase

---

## Mermaid Starter Graph

```mermaid
flowchart LR
  subgraph Browser
    B1[Evidence UI]
    B2[Chat UI / SSE]
    B3[App Routes]
  end

  subgraph SvelteKit_Routes
    R1[/api/evidence/[id]/download]
    R2[/api/sse/chat]
    R3[/api/chat]
    R4[/api/health]
    R5[/api/health/capabilities]
    R6[/api/gpu/compute]
    R7[/api/health/gpu]
  end

  subgraph Server_Services
    S1[minio-client]
    S2[rabbitmq-manager-fixed]
    S3[inference-router]
    S4[grpc embedding client]
    S5[libtorch-bridge]
    S6[simdjson-bridge]
  end

  subgraph Infra
    I1[(Postgres)]
    I2[(MinIO)]
    I3[(RabbitMQ)]
    I4[(Qdrant)]
    I5[(Redis)]
    I6[(Ollama)]
    I7[(TRT-LLM)]
    I8[(CouchDB)]
    I9[(Neo4j)]
    I10[(LangExtract)]
    I11[(gRPC)]
  end

  subgraph Native
    N1[tensorrt_bridge.node]
    N2[binding.cc]
    N3[libtorch_graph.cc]
    N4[CUDA kernels]
  end

  B1 --> R1
  B2 --> R2
  B2 --> R3
  B3 --> R4
  B3 --> R5
  B3 --> R6
  B3 --> R7

  R1 --> S1 --> I2
  R2 --> S2 --> I3
  R3 --> S2 --> I3
  R2 --> S3
  R3 --> S3
  R4 --> I6
  R4 --> I4
  R4 --> I2
  R4 --> I10
  R4 --> I8
  R4 --> I9
  R4 --> I7
  R5 --> I7
  R6 --> S5 --> N1
  R7 --> S5 --> N1
  S6 --> N1
  S3 --> I7
  S3 --> I6
  S4 --> I11
  S4 -. fallback .-> I6

  N1 --> N2 --> N3
  N2 --> N4
```

---

## Best Next Artifact After This

The highest-value next artifact is still the TS -> N-API -> C++ edge list, because it will make the TRT, native, and PyTorch routing work much easier to reason about once phase 3 and phase 6 begin.
