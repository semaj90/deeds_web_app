# Current Phase Status & Next Steps

## Current Position

You are currently at:

-   Phase 10A: Mostly complete
-   Phase 10B: Active phase (next work)
-   Phase 11--12: Planned (not started)
-   Phase 13: Partially started (summary cards exist, synthesis
    incomplete)
-   Phase 14: DuckDB smoke working, LangGraph/Langfuse incomplete
-   Phase 15--16: Not started

------------------------------------------------------------------------

## What Is Already Working

-   Parent Atlas / summary-card foundation
-   ACE packet structure
-   Redis / Qdrant / Postgres partially wired
-   OpenCode context guardrails added
-   SSE retrieval streaming started

------------------------------------------------------------------------

## Active Phase: Phase 10B

### Goal

Stabilize retrieval and compression before GPU acceleration.

------------------------------------------------------------------------

## Step-by-Step Tasks

### 1. Locate GGUF Model (gitignored)

``` bash
rg --files -uu | rg -i "gemma|rotor|quant|gguf"
```
### 2. Verify ACE Packet
``` bash
npm run ace:packet -- "where is auth?"
### 3. Verify Sidecars

``` bash
npm run smoke:mcp:opencode-sidecars
### 4. Fix Model Resolution

-   Update ensure-llama-server.mjs
-   Support multiple candidate paths
-   Do NOT assume a single filename
### 5. Normalize Ports

-   8791 → Atlas / OpenCode MCP
-   8792 → TurboVec rerank
-   8793 → RotorQuant helper
-   8090 → llama-server
-   4222 → NATS
-   6333 → Qdrant
-   6379 → Redis
-   5432/5434 → Postgres
### 6. TurboVec Integration

-   Add rerank lane after Qdrant
-   Do NOT replace Qdrant
-   Add fallback:

```{=html}
<!-- -->
```
    TurboVec offline → use Qdrant order
### 7. Enable Qdrant Quantization

-   Enable before any GPU work
-   Improves memory + speed safely

## Rules
-   Do NOT start cuVS / CUDA yet
-   Do NOT block retrieval on accelerators
-   System must work without TurboVec
## Next Phase (After 10B)
-   Phase 11: cuVS benchmark (Python sidecar only)
-   Phase 12: CUDA/RNN experiments (optional lane only)
## Core Principle
Accelerators improve latency, never correctness.
