# CUDA integration map and fix plan

Goal
- Map where Go binaries expect `cuda-worker.exe` and provide a prioritized fix plan so they can reliably use a native C++ vLLM server or the existing `cuda-worker.exe`. Includes test commands for Windows PowerShell.

Where CUDA is referenced
- `cuda-service-worker.go` (root): local HTTP API on :8096; accepts JSON and now supports base64 payloads. Recent edits added `externalWorkerPath` discovery and a `runExternalCudaWorker` adapter.
- `go-microservice/*` (examples found): `gpu-orchestrator-service.go`, `cuda-integration-service.go`, `gpu-orchestrator-service.go`, and `vector-consumer-service-v2.go` all attempt to auto-detect `cuda-worker.exe` in common paths and use `exec.Command` to run it.
- `go-chat-service/main.go`: references `CUDAWorkerScript` and toggles for `UseCUDA`.
- `production-orchestrator.ts`, `gpu-orchestrator` and SvelteKit frontend: orchestrators and router components expect `cuda-worker.exe` at `./cuda-worker/cuda-worker.exe` or via env `CUDA_WORKER_PATH`.

Problems to fix (high-level)
1. Inconsistent discovery paths and env var handling across Go services.
2. Some services spawn the worker and read whole stdout synchronously; long-running tasks may block or leak resources.
3. Many services rely on JSON over stdin/stdout (fine for lightweight jobs) but vLLM/C++ servers prefer gRPC or socket-based streaming for large tensors and efficient zero-copy.
4. Payload encoding: some front-end endpoints send base64-encoded payloads; Go services must accept and correctly decode both JSON and base64 payloads.

Concrete fix plan (prioritized)
1) Canonical discovery: centralize how services find the native worker.
   - Add a small shared helper (Go package `internal/cuda`) that exposes `FindCudaWorkerPath()` reading `CUDA_WORKER_PATH` first, then a list of sane relative paths.
   - Replace ad-hoc path checks across `go-microservice/*` with the helper.

2) Robust external invocation adapter
   - Implement `RunExternalCudaWorker(ctx, path, req, timeout)` that starts the process, streams stdin, reads stdout (with buffer limits), collects stderr into logs, and kills on timeout.
   - Use streaming (io.Pipe) if payloads exceed a few MB to avoid large memory copies.

3) Base64 / binary payload handling
   - Standardize request envelope: allow `payload` (JSON object) and `payload_b64` (base64 of either JSON or raw bytes).
   - Decode `payload_b64` early and, when raw bytes are used, marshal into a CBOR or MessagePack wrapper when sending to native worker.

4) gRPC adapter for vLLM/C++ server (medium term)
   - Implement a gRPC service (proto) that exposes Infer/Embed/VectorSearch streaming RPCs with protobuf tensors (repeated float32/bytes) to avoid stdin/stdout overhead.
   - Provide a small compatibility shim `grpc-shim` that accepts the current JSON stdin/stdout API and forwards to gRPC when the C++ server supports it.

5) Add tests and monitoring
   - Unit tests for base64 decoding and envelope handling in Go services.
   - Integration test: echo a small JSON job into `cuda-worker.exe` and assert valid JSON result.
   - Add health checks that include a `cuda_path` array and `cuda_available` boolean.

Files/services to change (example edits)
- `cuda-service-worker.go`: already updated to accept `payload_b64` and forward to external worker; reconcile user manual edits and factor out discovery + run logic into `internal/cuda/` package.
- `go-microservice/gpu-orchestrator-service.go` and `cuda-integration-service.go`: replace inline path checks with `internal/cuda.FindCudaWorkerPath()` and use `internal/cuda.RunExternalCudaWorker`.
- `go-microservice/vector-consumer-service-v2.go`: ensure `CUDAWorkerPath` comes from `getEnv` and fallback to helper; use streaming for large embeddings.

Quick local test commands (PowerShell)
```powershell
# build cuda-service-worker
go build -o cuda-service-worker.exe cuda-service-worker.go

# start the service in the background
Start-Process -FilePath .\cuda-service-worker.exe

# check health
Invoke-RestMethod http://localhost:8096/api/v1/health | ConvertTo-Json -Depth 5

# test base64 submit (small JSON)
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"type":"embedding","text":"hello world"}'))
Invoke-RestMethod -Method Post -Uri http://localhost:8096/api/v1/submit -ContentType 'application/json' -Body (ConvertTo-Json @{ type='embedding'; payload_b64=$b64 })
```

Next actions I can take now
- Reconcile any manual edits in `cuda-service-worker.go` and extract discovery/run logic to `internal/cuda` package and update usages across a few Go services (I can create the package and update 2–3 files as a follow-up PR).
- Implement `internal/cuda` small helper with test coverage for base64 and run-with-timeout.

If you want me to proceed, tell me which of the high-priority changes to make first (canonical discovery helper + adapter, or implement gRPC shim), and I will implement and test locally.
