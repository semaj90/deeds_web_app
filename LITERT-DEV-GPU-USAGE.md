# LiteRT Backend Support for npm run dev:gpu

## Overview

`npm run dev:gpu` now supports two LLM backends:
- **llama-server** (TurboQuant, default) — port :8090
- **LiteRT-LM** (Google Lite Runtime, optional) — port :8070

Select the backend via the `DEV_GPU_LLM_BACKEND` environment variable.

## Usage

### Default: TurboQuant llama-server
```bash
npm run dev:gpu
# Launches on :8090 with TurboQuant KV cache (q8_0/q8_0)
```

### LiteRT-LM via system Python
```bash
DEV_GPU_LLM_BACKEND=litert npm run dev:gpu
# Launches on :8070 using system Python 3.10+
```

### Windows (PowerShell)
```powershell
$env:DEV_GPU_LLM_BACKEND="litert"
npm run dev:gpu
```

### Windows (cmd.exe)
```cmd
set DEV_GPU_LLM_BACKEND=litert
npm run dev:gpu
```

## Requirements

### For llama-server (default)
- PowerShell 7+
- AtomicBot or stock llama.cpp binary
- NVIDIA CUDA 12.1+ (GPU support)

### For LiteRT-LM
- Python 3.10+
- `litert-lm` package: `pip install litert-lm`
- Gemma4 model imported: `litert-lm import gemma-4-E2B-it.litertlm`
- CUDA DLLs in PATH (GPU support)

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DEV_GPU_LLM_BACKEND` | `llama-server` | Which backend to use: `llama-server` or `litert` |
| `CUDA_VISIBLE_DEVICES` | `0` | GPU device ID (LiteRT backend only) |
| `LOCAL_GEMMA_MODEL` | Backend-specific | Model ID (auto-selected per backend) |

### Port Mapping

| Backend | Port | Environment | URL |
|---------|------|-------------|-----|
| llama-server | 8090 | `LOCAL_OPENAI_BASE_URL` | `http://127.0.0.1:8090/v1` |
| LiteRT-LM | 8070 | `LOCAL_OPENAI_BASE_URL` | `http://127.0.0.1:8070/v1` |

## Performance

### llama-server (TurboQuant)
- Synthesis: ~25–40 tokens/sec (RTX 3060 Ti)
- Context: 65,536 tokens
- KV cache: q8_0/q8_0 (compressed)
- **Pros**: Fast, stable, MTP support
- **Cons**: Heavier binary, more VRAM per context

### LiteRT-LM
- Synthesis: ~20–30 tokens/sec (estimated on RTX 3060 Ti)
- Context: Dynamic (model-dependent)
- KV cache: Native (no explicit quantization)
- **Pros**: Lightweight, lower overhead
- **Cons**: Python dependency, slower startup

## Troubleshooting

### LiteRT launch fails with "Module not found"
```
❌ LiteRT launch failed: The specified module could not be found
```
**Fix**: Verify `litert-lm` is installed and CUDA DLLs are in PATH:
```bash
pip install litert-lm
python -c "import litert_lm; print(litert_lm.__version__)"
```

### LiteRT falls back to llama-server unexpectedly
The script catches LiteRT failures and automatically falls back to llama-server on port :8090. Check `console.log` output for error details.

### Health check shows both backends unavailable
```bash
# Verify ports are open
netstat -ano | findstr :8070
netstat -ano | findstr :8090

# Check if processes are running
tasklist | findstr python
tasklist | findstr llama-server
```

## Development Workflow

1. **Start dev:gpu with LiteRT** (lightweight):
   ```bash
   DEV_GPU_LLM_BACKEND=litert npm run dev:gpu
   ```

2. **Vite dev server starts** on :5173 (automatically)

3. **Use as normal**:
   - SvelteKit frontend: http://localhost:5173
   - LLM synthesis: http://127.0.0.1:8070/v1/chat/completions
   - Embeddings: http://127.0.0.1:8081 (ONNX)

4. **Switch backends** (without restarting):
   - Kill `npm run dev:gpu` (Ctrl+C)
   - Set `DEV_GPU_LLM_BACKEND` to the other backend
   - Re-run `npm run dev:gpu`

## Code Changes

**File**: `scripts/startup/dev-gpu-runtime.mjs`

**Key additions**:
- Backend selection via `DEV_GPU_LLM_BACKEND` environment variable
- Conditional port routing (:8070 for LiteRT, :8090 for llama-server)
- Python subprocess spawn for LiteRT via `litert-serve.py`
- Automatic fallback to llama-server if LiteRT startup fails
- Console output indicates which backend is active

**Fallback behavior**:
- If LiteRT fails to start, the script logs the error and automatically launches llama-server (:8090)
- No manual intervention required; Vite startup continues

## Notes

- Both backends expose OpenAI-compatible `/v1/chat/completions` API
- Clients (SvelteKit routes, MCP tools, etc.) connect via `LOCAL_OPENAI_BASE_URL` (auto-set)
- Backend switching is transparent to the frontend
- Model selection (Gemma4 GGUF vs LiteRT) happens automatically based on backend

---

**Last Updated**: July 29, 2026
