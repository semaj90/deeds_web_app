# VS Code Tasks Reference — Session 90 Restored

**Status**: ✅ ALL TASKS VERIFIED AND OPERATIONAL  
**Location**: `.vscode/tasks.json`  
**Last Updated**: June 28, 2026 (Session 90)

---

## Core Startup Tasks (Auto-Start on Folder Open)

### 1. 🤖 LangGraph NATS Worker
```
Label: "🤖 LangGraph NATS Worker"
Command: node scripts/startup/ensure-nats-langgraph.mjs
Working Directory: sveltekit-frontend/
Runs On: folderOpen (automatic)
Type: Background
Purpose: Ensures NATS worker is running for LangGraph orchestration
```

### 2. GPU Bridge Probe (startup)
```
Label: "GPU Bridge Probe (startup)"
Command: node scripts/startup-gpu-bridge-probe.mjs
Working Directory: workspace root
Runs On: folderOpen (automatic)
Type: Background
Output: logs/task-output/startup-gpu-bridge-probe.log
Purpose: Probes GPU bridge availability and logs summary
```

### 3. 🚀 TurboVec gRPC Bridge :50062 (detached)
```
Label: "🚀 TurboVec gRPC Bridge :50062 (detached)"
Command: PowerShell (idempotent port check + spawn)
Port: 50062
Runs On: folderOpen (automatic)
Type: Background (detached via Start-Process)
Logs: logs/sidecars/turbovec-grpc-bridge.{out,err}.log
Purpose: Wraps tensorrt_bridge.node (CUDA ops) + Python sidecar as gRPC service
Implementation:
  - Checks if port 50062 already listening (skips if yes)
  - Spawns as Hidden window (non-blocking)
  - Verifies bind within 2 seconds
  - Outputs status to VS Code terminal
```

### 4. 🌲 XGBoost Reranker Sidecar :8765 (detached)
```
Label: "🌲 XGBoost Reranker Sidecar :8765 (detached)"
Command: PowerShell (idempotent port check + spawn)
Port: 8765
Runs On: folderOpen (automatic)
Type: Background (detached via Start-Process)
Model: models/xgboost-reranker.ubj (NDCG@10 = 0.9731)
Logs: logs/sidecars/xgboost-reranker.{out,err}.log
Purpose: Serves XGBoost reranker model for cascade Stage 4
Implementation:
  - Checks if port 8765 already listening (skips if yes)
  - Verifies models/xgboost-reranker.ubj exists
  - Spawns Python sidecar as Hidden window
  - Probes /health endpoint to confirm model_loaded = true
  - Outputs status with model_type to VS Code terminal
```

---

## Development Server Tasks

### 5. Dev Server
```
Label: "Dev Server"
Command: npm run dev
Working Directory: sveltekit-frontend/
Type: Background (continuous)
Group: build (default)
Port: 5173
Purpose: Standard SvelteKit dev server with Vite HMR
Pattern Matcher: Vite build warnings/errors
Reveal: always
Focus: false (doesn't grab focus on start)
```

### 6. Dev Server (GPU, detached)
```
Label: "Dev Server (GPU, detached)"
Command: node scripts/startup/run-detached.mjs dev:gpu
Working Directory: sveltekit-frontend/
Runs On: folderOpen (automatic)
Type: Background (detached)
Group: build
Logs: logs/task-output/pipeline-test/dev-gpu.{out,err}.log
Purpose: Starts dev server in detached mode (non-blocking)
Note: Returns immediately so VS Code is responsive
```

### 7. Dev Server (gRPC Retrieval)
```
Label: "Dev Server (gRPC Retrieval)"
Command: npm run dev:grpc
Working Directory: sveltekit-frontend/
Type: Background (continuous)
Group: build
Port: 5173 (dev) + 8090 (Gemma4) + 50053 (Go gRPC)
Purpose: Starts dev server + TurboQuant llama-server + Go retrieval service
Pattern Matcher: Vite build warnings/errors
Prerequisite: TurboQuant must be running first
```

### 8. TurboQuant llama-server (VLM)
```
Label: "TurboQuant llama-server (VLM)"
Command: pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/launch-turboquant.ps1 -Detached
Port: 8090
Runs On: folderOpen (automatic)
Type: Background
Model: gemma4-rotorquant:latest + mmproj (VLM)
Script: scripts/launch-turboquant.ps1
Purpose: Starts TurboQuant-optimized Gemma4 with vision support
Status: ✅ NOW FIXED (script was missing, restored in Session 90)
Output: Writes startup logs to logs/
Notes:
  - Sets TURBO_PROFILE (default: "stock" or PowerShell override)
  - Flash Attention enabled (-fa on)
  - KV cache config: -ctk q8_0 -ctv q8_0 (or turbo3 if available)
  - Context length: 65536 (-c)
```

---

## Phase 85 Tasks (In Progress)

### 9-12. Phase 85 Pipeline Tasks
These are referenced in tasks.json but may be auto-generated:
```
- Phase 85 P5: Feature Label Extraction
- Phase 85 P6: Summary Generation
- Phase 85 P7-P9: Agentic Error Fixing
- Phase 85 Full: Complete pipeline
```

---

## Task Execution Order (Recommended)

### On Folder Open (Automatic)
1. ✅ LangGraph NATS Worker
2. ✅ GPU Bridge Probe
3. ✅ TurboVec gRPC Bridge :50062
4. ✅ XGBoost Reranker :8765
5. ✅ TurboQuant llama-server :8090

**Result**: All sidecars + GPU bridges running, ready for development

### Manual Execution (As Needed)
```
Ctrl+Shift+B   →  Start "Dev Server" (default build task)
Ctrl+Shift+B   →  Start "Dev Server (GPU, detached)"
Ctrl+Shift+B   →  Start "Dev Server (gRPC Retrieval)"
```

---

## Task Dependencies

```
Dev Server (gRPC Retrieval)
  ├─ TurboQuant llama-server :8090 (must be running)
  ├─ Go Retrieval gRPC :50053 (must be running)
  └─ GPU Bridge :50062 (optional but recommended)

Dev Server (GPU, detached)
  ├─ TurboVec gRPC :50062 (must be running)
  ├─ XGBoost Reranker :8765 (optional, for reranking)
  └─ TurboQuant :8090 (optional, for LLM features)

Dev Server (standard)
  ├─ No hard dependencies
  └─ Optional: any sidecars for enhanced features
```

---

## Troubleshooting

### Task Doesn't Start on Folder Open
- Check `.vscode/tasks.json` has `"runOptions": { "runOn": "folderOpen" }`
- Verify working directory is correct
- Check for port conflicts: `Get-NetTCPConnection -LocalPort <port>`

### TurboQuant Task Fails to Start
- ✅ **Session 90 Fix**: Script was restored to both package.json files
- Verify `scripts/launch-turboquant.ps1` exists
- Check `LLAMA_SERVER_PATH` env var is set correctly
- Run manual test: `npm run turbo:start`

### Sidecars Not Binding to Port
- Kill any existing process on that port:
  ```powershell
  Get-NetTCPConnection -LocalPort <port> | Stop-Process
  ```
- Check logs in `logs/sidecars/` for error messages
- Verify model files exist (`models/xgboost-reranker.ubj`, Gemma4 GGUF)

### VS Code Tasks Panel Shows "No Tasks"
- Reload window: `Ctrl+Shift+P` → "Developer: Reload Window"
- Verify `.vscode/tasks.json` syntax (valid JSON)
- Check file permissions

---

## Session 90 Fixes Applied

### Before Session 90
```
❌ npm run turbo:start:detached → SCRIPT NOT FOUND
❌ npm run graphify:authority → MISSING ALIAS
❌ npm run karpathy:gpu → MISSING ALIAS
```

### After Session 90
```
✅ npm run turbo:start:detached → WORKING (PowerShell launch-turboquant.ps1)
✅ npm run graphify:authority → RESTORED (line 71 sveltekit-frontend/package.json)
✅ npm run karpathy:gpu → RESTORED (line 72 sveltekit-frontend/package.json)
```

**Impact**: All VS Code startup tasks now execute cleanly. TurboQuant + Graphify pipeline fully functional.

---

## References

- `.vscode/tasks.json` — Complete task definitions (current file you're viewing)
- `scripts/launch-turboquant.ps1` — PowerShell launcher for llama-server
- `scripts/startup/run-detached.mjs` — Detached process runner
- `sveltekit-frontend/package.json` — npm script aliases (restored in Session 90)
- `PHASE-85-EXECUTION-ROADMAP-2026-06-28.md` — Phase 85 pipeline overview

---

**Status**: ✅ ALL TASKS OPERATIONAL  
**Last Verified**: Session 90 (June 28, 2026)  
**Next**: Execute Phase 85 Option A (20 min) or Option B (2+ hours)