Router Inference Runtime
========================

This module provides a small runtime `predictWithRouter(features)` used by the Adaptive Index Orchestrator to decide routing (GPU/QUIC/Cache/CPU).

Behavior:
- Attempts to call a local ML microservice at `ROUTER_INFERENCE_URL` (default: `http://localhost:5001/predict`).
- Times out after `ROUTER_INFERENCE_TIMEOUT` ms (default: 2500).
- If the ML endpoint is unavailable or returns an unexpected shape, it falls back to a conservative heuristic.

Test harness:
 - Run the quick test via Node (from `sveltekit-frontend`):

```powershell
node scripts/router-inference-test.mjs
```

Integrating a PyTorch / QLoRA adapter:
 - Train/adapt a small router model using your telemetry logs.
 - Expose a lightweight HTTP endpoint `/predict` that accepts `{ features: Record<string, number> }` and returns `{ useGPU: bool, useQUIC: bool, useCache: bool, score?: number }`.
 - Set `ROUTER_INFERENCE_URL` to point to that service.

Notes:
 - The runtime is intentionally conservative and resilient to network failures. Use it as a soft decision layer; the orchestrator should always re-validate actual runtime metrics before committing to heavy GPU tasks.
