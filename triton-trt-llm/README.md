# Triton / TensorRT-LLM Workspace

This directory groups the local Triton and future TensorRT-LLM work for Parent Atlas.

## Current Lanes

### ONNX Gemma4 E2B q4f16

Status: scaffolded / experimental.

Purpose:
- Prove Triton can load the downloaded Gemma4 E2B ONNX graphs.
- Keep ONNX tensor serving separate from the production Gemma4 summary backend.

Files:
- `scripts/materialize-gemma4-onnx-triton-repo.mjs`
- `scripts/start-gemma4-onnx-triton.ps1`
- `scripts/download-gemma4-e2b-onnx.sh`
- `models/gemma4_e2b_onnx/`
- `model-repositories/gemma4-onnx-q4f16/`

Boundary:
- Triton ONNX Runtime can execute ONNX graphs.
- It is not yet a chat/summarization backend.
- A generation adapter still has to tokenize, call the decoder loop, sample tokens, and detokenize.

### TensorRT-LLM

Status: future lane.

Purpose:
- Serve optimized LLM generation with Triton TensorRT-LLM backend after a proper engine/model repository exists.

Boundary:
- Do not convert from GGUF to TensorRT-LLM.
- Build from supported Hugging Face/PyTorch checkpoint weights.
- Keep this separate from the current llama-server GGUF path.

## Production Summary Backend

Current production summaries should still use:

```text
Gemma4 GGUF / RotorQuant -> llama-server :8090
```

Phase7 should only switch to Triton after a live adapter produces:

```text
tokenize -> Triton ONNX or TensorRT-LLM -> decode loop -> detokenize -> summary
```

and the proof report shows `LIVE_PASS`.

## Commands

From repo root:

```powershell
npm run atlas:gemma4:onnx:triton:repo:dry
npm run atlas:gemma4:onnx:triton:repo
npm run atlas:gemma4:onnx:triton:status
npm run atlas:gemma4:onnx:triton:start
```

Direct PowerShell:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/start-gemma4-onnx-triton.ps1 -StatusOnly
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/start-gemma4-onnx-triton.ps1 -Detached
```

Adapter:

```powershell
python scripts/gemma4/gemma4_onnx_triton_adapter.py
curl http://127.0.0.1:8098/health
```

Phase7 ONNX backend:

```powershell
cd sveltekit-frontend
node scripts/atlas/phase7-triton-batch-summaries.mjs --worker --backend=gemma4-onnx --batch-size=8 --once
```

This backend calls `GEMMA4_ONNX_ADAPTER_URL` instead of calling Triton directly.

## Protocol Roles

```text
ACP / MCP JSON-RPC
  planner and tool-control messages

RabbitMQ
  summary batch queue, retries, worker orchestration

Triton HTTP/gRPC
  tensor inference protocol

Go Retrieval / TurboVec gRPC
  heavy retrieval and vector sidecars

MsgPack
  compact packet serialization, not model serving

Postgres
  canonical packet and summary truth
```

## Env Overrides

The launcher reads process env values:

```text
TRITON_ONNX_IMAGE
TRITON_ONNX_CONTAINER
TRITON_HTTP_PORT
TRITON_GRPC_PORT
TRITON_METRICS_PORT
```

`dev:gpu` and Phase7 use the shared repo env helper, with `.env` as primary and `.env.local` as override.
