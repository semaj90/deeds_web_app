# WSL2 TRT-LLM READINESS CHECKLIST — March 31, 2026
## Exact Validation Steps For Deeds Web App

---

## Goal

Prove that the existing Node.js and SvelteKit inference surfaces can use a live TRT-LLM service in WSL2 Docker with correct fallback, lease handling, and production-safe routing.

This checklist is grounded in the current repo wiring:

- `sveltekit-frontend/src/lib/server/trt-llm.ts`
- `sveltekit-frontend/src/lib/server/inference/inference-router.ts`
- `sveltekit-frontend/src/routes/api/ai/tensorrt/+server.ts`
- `sveltekit-frontend/src/routes/api/ai/tensorrt/stream/+server.ts`
- `sveltekit-frontend/src/routes/api/ai/tensorrt/vlm/+server.ts`
- `sveltekit-frontend/src/routes/api/health/+server.ts`
- `sveltekit-frontend/src/routes/api/health/capabilities/+server.ts`
- `docker-compose.yml` GPU profile
- `Dockerfile.trtllm`

---

## Known Contract

The app currently expects:

- TRT-LLM public endpoint on `http://localhost:8099`
- `GET /health` to return success
- `POST /v1/completions` for text generation
- Ollama fallback when TRT-LLM is unavailable
- GPU lease coordination through the Node.js arbiter

The compose file currently maps:

- host `8099` -> container `8096`
- host `8098` -> container `8098`

That means validation must prove both:

1. the container is alive
2. the app’s expected host port and API shape are correct

---

## Phase 0: Host Readiness

### Windows

- [ ] NVIDIA driver installed and stable
- [ ] Docker Desktop using WSL2 backend
- [ ] WSL2 enabled
- [ ] RTX GPU visible in Windows and WSL2

Validation:

```powershell
wsl -l -v
docker version
docker info
```

Expected:

- WSL distro is version 2
- Docker reports WSL2 integration

---

## Phase 1: GPU Visibility Inside WSL2 and Docker

### Inside WSL2 shell

- [ ] `nvidia-smi` works in WSL2

Validation:

```bash
nvidia-smi
```

### Inside Docker

- [ ] GPU visible from a CUDA container

Validation:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-runtime-ubuntu22.04 nvidia-smi
```

Expected:

- GPU name shown
- driver visible
- no CUDA init error

Stop here if this fails. The app is not the problem yet.

---

## Phase 2: Repo GPU Profile Readiness

### Validate configured GPU service

The repo already defines a GPU profile in `docker-compose.yml` and a separate `Dockerfile.trtllm`.

- [ ] Inspect `docker-compose.yml` GPU profile
- [ ] Confirm host port `8099` is the intended TRT-LLM HTTP port
- [ ] Confirm health probe succeeds on `8098` or `8096`
- [ ] Confirm model and engine directories exist

Validation:

```powershell
Get-ChildItem .\docker\tensorrt-llm -Force
Get-ChildItem .\.cache\tensorrt-llm -Force -ErrorAction SilentlyContinue
```

Expected:

- model directory present
- engine directory present or intentionally empty before build

---

## Phase 3: Start GPU Profile Cleanly

The repo notes say to stop Ollama first when enabling the TRT-LLM GPU profile because of VRAM pressure.

- [ ] Stop Ollama or ensure it is not occupying the GPU
- [ ] Start only the TRT-LLM GPU profile

Validation:

```powershell
docker compose --profile gpu up -d tensorrt-llm
docker ps --filter "name=legal-ai-tensorrt-llm"
```

Expected:

- container running
- no restart loop

If it crashes, inspect:

```powershell
docker logs legal-ai-tensorrt-llm --tail 200
```

---

## Phase 4: Container Health Validation

- [ ] Validate internal health endpoint
- [ ] Validate host-facing health endpoint

Validation:

```powershell
curl http://localhost:8098/health
curl http://localhost:8099/health
```

Expected:

- at least one health endpoint returns `200`
- app-facing host port `8099` is reachable

If `8098` is healthy but `8099` is not, the service is running but the public contract is still broken.

---

## Phase 5: OpenAI-Compatible API Validation

The app client calls `POST /v1/completions`.

- [ ] Validate exact request shape expected by `src/lib/server/trt-llm.ts`

Validation:

```powershell
node -e "fetch('http://localhost:8099/v1/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Say hello in five words.',max_tokens:32,temperature:0.2,stream:false})}).then(r=>r.text()).then(console.log).catch(console.error)"
```

Expected:

- HTTP `200`
- JSON with `choices[0].text`

If this fails, TRT-LLM may be alive but not exposing the API shape the Node app expects.

---

## Phase 6: App-Level Health Validation

- [ ] `/api/health` reports TRT-LLM accurately
- [ ] `/api/health/capabilities` reports `tensorrt: true`

Validation:

```powershell
node -e "fetch('http://localhost:5173/api/health').then(r=>r.json()).then(d=>console.log(JSON.stringify({trtllm:d.checks.trtllm,inference:d.tiers.inference},null,2)))"
node -e "fetch('http://localhost:5173/api/health/capabilities').then(r=>r.json()).then(d=>console.log(JSON.stringify({tensorrt:d.tensorrt,models:d.modelRegistry},null,2)))"
```

Expected:

- `trtllm.ok === true`
- `tensorrt === true`

---

## Phase 7: Route-Level Validation

### Non-streaming route

- [ ] `/api/ai/tensorrt` returns `backend/model` from TensorRT, not Ollama

Validation:

```powershell
node -e "fetch('http://localhost:5173/api/ai/tensorrt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Return only the word READY',maxTokens:16,temperature:0,fallbackToOllama:false})}).then(async r=>console.log(r.status, await r.text())).catch(console.error)"
```

Expected:

- HTTP `200`
- JSON includes `model: 'tensorrt'` or `backend` semantics tied to TensorRT

### Streaming route

- [ ] `/api/ai/tensorrt/stream` returns chunked data without forced Ollama fallback

### VLM route

- [ ] `/api/ai/tensorrt/vlm` is tested only after text route is proven
- [ ] if VLM parsing is placeholder or model-specific, classify as partial

---

## Phase 8: GPU Lease Validation

The app already uses the GPU arbiter.

- [ ] Verify lease acquired before TensorRT request
- [ ] Verify lease released after request
- [ ] Verify conflict path returns `409` when another backend holds lease

Validation surfaces:

- `sveltekit-frontend/src/routes/api/gpu/lease/+server.ts`
- `sveltekit-frontend/src/lib/server/inference/gpu-arbiter.ts`

Suggested validation:

1. acquire a manual lease for `ollama`
2. call `/api/ai/tensorrt`
3. confirm `409`
4. release lease
5. retry and confirm success

---

## Phase 9: Fallback Validation

TRT-LLM is only production-safe if fallback is proven.

- [ ] stop TRT-LLM container
- [ ] call `/api/ai/tensorrt` with `fallbackToOllama: true`
- [ ] confirm response returns Ollama output
- [ ] call again with `fallbackToOllama: false`
- [ ] confirm `503`

Validation:

```powershell
docker stop legal-ai-tensorrt-llm
```

Then repeat the route test.

Expected:

- fallback path proven
- hard-fail path proven

---

## Phase 10: Production Readiness Gates

Mark TRT-LLM production-ready only when all are true:

- [ ] WSL2 GPU visible
- [ ] Docker GPU visible
- [ ] TRT-LLM container healthy
- [ ] `POST /v1/completions` works on `8099`
- [ ] `/api/health` reports TRT-LLM healthy
- [ ] `/api/health/capabilities` reports `tensorrt: true`
- [ ] `/api/ai/tensorrt` returns TensorRT result
- [ ] streaming route proven
- [ ] GPU lease conflict path proven
- [ ] Ollama fallback proven
- [ ] latency and memory acceptable under concurrency

---

## Final Verdict Rule

Use this wording:

- **Not ready**: container down or API contract mismatched
- **Partial**: health works and route works, but streaming, VLM, lease, or fallback not fully proven
- **Ready for limited production**: all text inference validations pass and fallback works
- **Fully ready**: text, streaming, VLM, lease behavior, concurrency, and Langfuse tracing all validated end-to-end

Current repo state before validation:

- Router exists
- health surfaces exist
- fallback exists
- GPU lease exists
- TRT-LLM runtime still unproven in the active deployment path
# WSL2 TRT-LLM READINESS CHECKLIST — March 31, 2026
## Exact Validation Steps For Deeds Web App

---

## Goal

Prove that the existing Node.js and SvelteKit inference surfaces can use a live TRT-LLM service in WSL2 Docker with correct fallback, lease handling, and production-safe routing.

This checklist is grounded in the current repo wiring:

- `sveltekit-frontend/src/lib/server/trt-llm.ts`
- `sveltekit-frontend/src/lib/server/inference/inference-router.ts`
- `sveltekit-frontend/src/routes/api/ai/tensorrt/+server.ts`
- `sveltekit-frontend/src/routes/api/ai/tensorrt/stream/+server.ts`
- `sveltekit-frontend/src/routes/api/ai/tensorrt/vlm/+server.ts`
- `sveltekit-frontend/src/routes/api/health/+server.ts`
- `sveltekit-frontend/src/routes/api/health/capabilities/+server.ts`
- `docker-compose.yml` GPU profile
- `Dockerfile.trtllm`

---

## Known Contract

The app currently expects:

- TRT-LLM public endpoint on `http://localhost:8099`
- `GET /health` to return success
- `POST /v1/completions` for text generation
- Ollama fallback when TRT-LLM is unavailable
- GPU lease coordination through the Node.js arbiter

The compose file currently maps:

- host `8099` -> container `8096`
- host `8098` -> container `8098`

That means validation must prove both:

1. the container is alive
2. the app’s expected host port and API shape are correct

---

## Phase 0: Host Readiness

### Windows

- [ ] NVIDIA driver installed and stable
- [ ] Docker Desktop using WSL2 backend
- [ ] WSL2 enabled
- [ ] RTX GPU visible in Windows and WSL2

Validation:

```powershell
wsl -l -v
docker version
docker info
```

Expected:

- WSL distro is version 2
- Docker reports WSL2 integration

---

## Phase 1: GPU Visibility Inside WSL2 and Docker

### Inside WSL2 shell

- [ ] `nvidia-smi` works in WSL2

Validation:

```bash
nvidia-smi
```

### Inside Docker

- [ ] GPU visible from a CUDA container

Validation:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-runtime-ubuntu22.04 nvidia-smi
```

Expected:

- GPU name shown
- driver visible
- no CUDA init error

Stop here if this fails. The app is not the problem yet.

---

## Phase 2: Repo GPU Profile Readiness

### Validate configured GPU service

The repo already defines a GPU profile in `docker-compose.yml` and a separate `Dockerfile.trtllm`.

- [ ] Inspect `docker-compose.yml` GPU profile
- [ ] Confirm host port `8099` is the intended TRT-LLM HTTP port
- [ ] Confirm health probe succeeds on `8098` or `8096`
- [ ] Confirm model and engine directories exist

Validation:

```powershell
Get-ChildItem .\docker\tensorrt-llm -Force
Get-ChildItem .\.cache\tensorrt-llm -Force -ErrorAction SilentlyContinue
```

Expected:

- model directory present
- engine directory present or intentionally empty before build

---

## Phase 3: Start GPU Profile Cleanly

The repo notes say to stop Ollama first when enabling the TRT-LLM GPU profile because of VRAM pressure.

- [ ] Stop Ollama or ensure it is not occupying the GPU
- [ ] Start only the TRT-LLM GPU profile

Validation:

```powershell
docker compose --profile gpu up -d tensorrt-llm
docker ps --filter "name=legal-ai-tensorrt-llm"
```

Expected:

- container running
- no restart loop

If it crashes, inspect:

```powershell
docker logs legal-ai-tensorrt-llm --tail 200
```

---

## Phase 4: Container Health Validation

- [ ] Validate internal health endpoint
- [ ] Validate host-facing health endpoint

Validation:

```powershell
curl http://localhost:8098/health
curl http://localhost:8099/health
```

Expected:

- at least one health endpoint returns `200`
- app-facing host port `8099` is reachable

If `8098` is healthy but `8099` is not, the service is running but the public contract is still broken.

---

## Phase 5: OpenAI-Compatible API Validation

The app client calls `POST /v1/completions`.

- [ ] Validate exact request shape expected by `src/lib/server/trt-llm.ts`

Validation:

```powershell
node -e "fetch('http://localhost:8099/v1/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Say hello in five words.',max_tokens:32,temperature:0.2,stream:false})}).then(r=>r.text()).then(console.log).catch(console.error)"
```

Expected:

- HTTP `200`
- JSON with `choices[0].text`

If this fails, TRT-LLM may be alive but not exposing the API shape the Node app expects.

---

## Phase 6: App-Level Health Validation

- [ ] `/api/health` reports TRT-LLM accurately
- [ ] `/api/health/capabilities` reports `tensorrt: true`

Validation:

```powershell
node -e "fetch('http://localhost:5173/api/health').then(r=>r.json()).then(d=>console.log(JSON.stringify({trtllm:d.checks.trtllm,inference:d.tiers.inference},null,2)))"
node -e "fetch('http://localhost:5173/api/health/capabilities').then(r=>r.json()).then(d=>console.log(JSON.stringify({tensorrt:d.tensorrt,models:d.modelRegistry},null,2)))"
```

Expected:

- `trtllm.ok === true`
- `tensorrt === true`

---

## Phase 7: Route-Level Validation

### Non-streaming route

- [ ] `/api/ai/tensorrt` returns `backend/model` from TensorRT, not Ollama

Validation:

```powershell
node -e "fetch('http://localhost:5173/api/ai/tensorrt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'Return only the word READY',maxTokens:16,temperature:0,fallbackToOllama:false})}).then(async r=>console.log(r.status, await r.text())).catch(console.error)"
```

Expected:

- HTTP `200`
- JSON includes `model: 'tensorrt'` or `backend` semantics tied to TensorRT

### Streaming route

- [ ] `/api/ai/tensorrt/stream` returns chunked data without forced Ollama fallback

### VLM route

- [ ] `/api/ai/tensorrt/vlm` is tested only after text route is proven
- [ ] if VLM parsing is placeholder or model-specific, classify as partial

---

## Phase 8: GPU Lease Validation

The app already uses the GPU arbiter.

- [ ] Verify lease acquired before TensorRT request
- [ ] Verify lease released after request
- [ ] Verify conflict path returns `409` when another backend holds lease

Validation surfaces:

- `sveltekit-frontend/src/routes/api/gpu/lease/+server.ts`
- `sveltekit-frontend/src/lib/server/inference/gpu-arbiter.ts`

Suggested validation:

1. acquire a manual lease for `ollama`
2. call `/api/ai/tensorrt`
3. confirm `409`
4. release lease
5. retry and confirm success

---

## Phase 9: Fallback Validation

TRT-LLM is only production-safe if fallback is proven.

- [ ] stop TRT-LLM container
- [ ] call `/api/ai/tensorrt` with `fallbackToOllama: true`
- [ ] confirm response returns Ollama output
- [ ] call again with `fallbackToOllama: false`
- [ ] confirm `503`

Validation:

```powershell
docker stop legal-ai-tensorrt-llm
```

Then repeat the route test.

Expected:

- fallback path proven
- hard-fail path proven

---

## Phase 10: Production Readiness Gates

Mark TRT-LLM production-ready only when all are true:

- [ ] WSL2 GPU visible
- [ ] Docker GPU visible
- [ ] TRT-LLM container healthy
- [ ] `POST /v1/completions` works on `8099`
- [ ] `/api/health` reports TRT-LLM healthy
- [ ] `/api/health/capabilities` reports `tensorrt: true`
- [ ] `/api/ai/tensorrt` returns TensorRT result
- [ ] streaming route proven
- [ ] GPU lease conflict path proven
- [ ] Ollama fallback proven
- [ ] latency and memory acceptable under concurrency

---

## Final Verdict Rule

Use this wording:

- **Not ready**: container down or API contract mismatched
- **Partial**: health works and route works, but streaming, VLM, lease, or fallback not fully proven
- **Ready for limited production**: all text inference validations pass and fallback works
- **Fully ready**: text, streaming, VLM, lease behavior, concurrency, and Langfuse tracing all validated end-to-end

Current repo state before validation:

- Router exists
- health surfaces exist
- fallback exists
- GPU lease exists
- TRT-LLM runtime still unproven in the active deployment path
