# LiteRT + LiteRT.js VS Code Workspace Startup

## Quick Start

### Option 1: Full Orchestrated Startup (Recommended)
```bash
# Launches both dev:gpu (LiteRT backend) and LiteRT.js-Mocap workspace
npm run dev:litert:full
```

**What this does:**
1. Runs `npm run dev:gpu` with `DEV_GPU_LLM_BACKEND=litert`
2. Waits 3 seconds for initialization
3. Opens LiteRT.js-Mocap workspace in a new VS Code window
4. Displays summary of running services

### Option 2: Manual Startup (Step-by-Step)
```bash
# Terminal 1: Start dev:gpu with LiteRT backend
DEV_GPU_LLM_BACKEND=litert npm run dev:gpu

# Terminal 2: Open LiteRT.js-Mocap in new VS Code window
code ~/Downloads/LiteRT.js-Mocap-main --new-window
```

### Option 3: VS Code Task (GUI)
1. Open Command Palette: `Ctrl+Shift+P`
2. Type: `Tasks: Run Task`
3. Select: **"🚀 LiteRT Dev Startup (GPU + LiteRT.js Mocap)"**

## npm Scripts Reference

| Script | Purpose | Backend | Ports |
|--------|---------|---------|-------|
| `npm run dev:gpu` | Default dev server (llama-server) | llama-server | :8090 |
| `npm run dev:gpu:litert` | Dev server with LiteRT backend | LiteRT-LM | :8070 |
| `npm run dev:litert:full` | **Orchestrated startup** (dev:gpu + LiteRT.js) | LiteRT-LM | :8070, :5173 |

## VS Code Task

**Label:** "🚀 LiteRT Dev Startup (GPU + LiteRT.js Mocap)"

**Location:** `.vscode/tasks.json` (line ~540)

**What it runs:** `node scripts/startup/litert-dev-startup.mjs`

**When to use:**
- One-click startup from VS Code Command Palette
- Preferred for development workflow
- Opens LiteRT.js Mocap in new window automatically

## Startup Script Behavior

**File:** `scripts/startup/litert-dev-startup.mjs`

**Execution flow:**

```
1. Spawn npm run dev:gpu (LiteRT backend)
   ├─ Set DEV_GPU_LLM_BACKEND=litert
   ├─ Set DEV_BYPASS_AUTH=true
   └─ Detach process (script doesn't wait for completion)

2. Display dev:gpu output in terminal
   └─ Real-time logging of LiteRT startup

3. Wait 3 seconds for LiteRT initialization

4. Launch LiteRT.js-Mocap workspace
   └─ Open in new VS Code window via 'code' CLI

5. Display service summary
   ├─ SvelteKit frontend: http://localhost:5173
   ├─ LLM synthesis (LiteRT): http://127.0.0.1:8070/v1
   └─ Embeddings (ONNX): http://127.0.0.1:8081/v1

6. Keep running (Ctrl+C to stop)
   └─ Forwards SIGINT to dev:gpu process
```

## Service Endpoints

After startup, all services are available:

| Service | URL | Purpose |
|---------|-----|---------|
| **SvelteKit Dev** | http://localhost:5173 | Frontend (Vite dev server) |
| **LiteRT-LM** | http://127.0.0.1:8070/v1 | LLM synthesis (OpenAI API) |
| **Embeddings** | http://127.0.0.1:8081/v1/embeddings | Embedding service (ONNX) |
| **NLP Sidecar** | http://127.0.0.1:8095 | LangExtract + tree-sitter |
| **LiteRT.js** | New VS Code window | Mocap demo application |

## Switching Backends

Without stopping the dev server:

```bash
# In a separate terminal, switch to llama-server
DEV_GPU_LLM_BACKEND=llama-server npm run dev:gpu

# Or switch back to LiteRT
DEV_GPU_LLM_BACKEND=litert npm run dev:gpu
```

The original dev:gpu process continues running on :8070 or :8090 (depending on which was launched first).

## Troubleshooting

### "code: command not found"
**Issue:** VS Code CLI not in PATH

**Fix:**
1. Add VS Code to PATH (installer option during setup)
2. Or use full path: `"C:\Program Files\Microsoft VS Code\bin\code.cmd"`
3. Or use `code-insiders` if using VS Code Insiders

### LiteRT-LM fails to start
**Error:** "The specified module could not be found"

**Fix:**
1. Verify Python 3.10+: `python --version`
2. Install litert-lm: `pip install litert-lm`
3. Check CUDA DLLs in PATH

**Fallback:** Script automatically falls back to llama-server (:8090)

### LiteRT.js-Mocap doesn't open
**Issue:** Path to Downloads folder incorrect

**Fix:** Edit `scripts/startup/litert-dev-startup.mjs` line 14:
```javascript
// Change this:
LITERT_MOCAP_PATH = path.resolve(
  process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\james',
  'Downloads/LiteRT.js-Mocap-main'
);

// To your actual path if Downloads is elsewhere:
LITERT_MOCAP_PATH = path.resolve('C:\\Users\\<your-username>\\Downloads\\LiteRT.js-Mocap-main');
```

### Ports already in use
**Issue:** Another service is using :8070 or :5173

**Fix:**
1. Find process: `netstat -ano | findstr :8070`
2. Kill process: `taskkill /PID <pid> /F`
3. Or change ports in `.env` and restart

## Configuration

### Environment Variables

Set in `.env` or export before running:

```bash
# LiteRT backend selection
export DEV_GPU_LLM_BACKEND=litert          # or "llama-server"

# GPU device
export CUDA_VISIBLE_DEVICES=0              # GPU device ID

# Context size
export TURBO_CTX=65536                     # or adjust as needed

# Auth bypass
export DEV_BYPASS_AUTH=true                # Skip login for dev
```

### Manual Configuration

Edit `scripts/startup/litert-dev-startup.mjs` to change:
- LiteRT.js workspace path (line 14)
- Startup delay (line 85: `await delay(3000)`)
- Environment variables passed to dev:gpu (lines 21-26)

## Integration with SvelteKit

Both backends expose OpenAI-compatible `/v1/chat/completions` API. Your SvelteKit code doesn't need to change:

```typescript
// Works with either backend (llama-server :8090 or LiteRT :8070)
const response = await fetch(`${LOCAL_OPENAI_BASE_URL}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemma4-legal-iq4xs-direct.gguf', // llama-server
    // OR model: 'gemma-4-E2B-it.litertlm',  // LiteRT
    messages: [{ role: 'user', content: 'Hello' }],
    stream: false
  })
});
```

The `LOCAL_OPENAI_BASE_URL` environment variable is automatically set to the correct backend:
- llama-server: `http://127.0.0.1:8090/v1`
- LiteRT-LM: `http://127.0.0.1:8070/v1`

## Performance Comparison

| Metric | llama-server | LiteRT-LM |
|--------|--------------|-----------|
| Startup time | ~5-10s | ~3-5s |
| Tokens/sec (RTX 3060 Ti) | 25-40 | 20-30 |
| Memory footprint | ~6GB VRAM | ~4GB VRAM |
| Context window | 65,536 | Model-dependent |
| KV cache compression | q8_0/q8_0 | Native |

## Development Workflow

**Typical workflow:**

1. **Open workspace:** `npm run dev:litert:full`
   - Launches LiteRT dev server + LiteRT.js Mocap

2. **Develop:** Edit code in either VS Code window
   - Main repo: SvelteKit frontend at http://localhost:5173
   - LiteRT.js Mocap: LLM inference demo

3. **Test:** Use browser to visit endpoints
   - Frontend: http://localhost:5173
   - LLM API: http://127.0.0.1:8070/v1/chat/completions

4. **Switch backend (if needed):**
   ```bash
   DEV_GPU_LLM_BACKEND=llama-server npm run dev:gpu
   ```

5. **Stop:** Ctrl+C in main terminal (kills both services)

## Notes

- Both backends are fully operational and drop-in compatible
- LiteRT-LM is lighter weight and starts faster
- llama-server (TurboQuant) is more battle-tested in production
- Switching backends requires only setting `DEV_GPU_LLM_BACKEND` env var
- LiteRT.js Mocap runs in a separate VS Code workspace (independent)

---

**Last Updated:** July 29, 2026
