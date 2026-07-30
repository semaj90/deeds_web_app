# Infrastructure Update Summary — July 29, 2026

## Overview
Updated all Phase 8 Python scripts and configuration to reflect canonical architecture:
- **LLM synthesis**: llama-server (TurboQuant) on port **8090** (NOT Ollama :11434)
- **Embeddings**: Ollama still on port :11434 (unchanged)
- **Python runtime**: 3.12+ in Miniforge WSL2 sidecar (3.14+ with free-threading)

## Changes Made

### 1. Python Scripts Updated

#### `scripts/atlas/phase8-step3-langextract-entities.py`
- ✅ Updated docstring: "llama-server (TurboQuant) on port 8090 — NOT Ollama :11434"
- ✅ Updated requirements: "Python 3.12+ in Miniforge WSL2 sidecar"
- ✅ LLAMA_URL uses 8090 (canonical, correct)
- ✅ Model name: gemma4-legal-iq4xs-direct.gguf (correct)
- ✅ Endpoint: /v1/chat/completions (llama-server OpenAI-compatible)
- Added `import threading` for progress event threading (Phase 8 monitoring infrastructure)

#### `scripts/langextract/langextract-gemma4-bridge.py`
- ✅ Already correct: Uses llama-server on port 8090
- ✅ Already correct: Uses gemma4-legal-iq4xs-direct.gguf model
- ✅ Comment: "llama-server.exe running locally with gemma4-legal-iq4xs-direct.gguf"

#### `scripts/gemma4/offline_summary_worker.py`
- ✅ Already correct: Uses llama-server :8090/v1/completions endpoint

### 2. Node Scripts Updated

#### `scripts/dev/check-python-env.mjs`
- ✅ Updated version check: `/^3\.(1[2-4]|14)/.test(venvVersion)`
- ✅ Updated note: "Workspace should use .venv (Python 3.12+)"
- Allows Python 3.12, 3.13, 3.14 (free-threading)

### 3. Documentation Updated

#### `docs/PHASE-85-P9-LANGEXTRACT-AGENTIC-INTEGRATION.md`
- ✅ Updated dependency: "Python 3.12+ (Miniforge WSL2) ... free-threading on 3.14+"
- ✅ Confirmed llama-server at :8090 for LangExtract

## Architecture Clarification

### Three Service Tiers (Phase 8)

| Service | Port | Purpose | Model | Protocol |
|---------|------|---------|-------|----------|
| **Ollama (Embeddings)** | 11434 | Vector embeddings (read-only) | embeddinggemma:latest | `/api/embeddings` |
| **llama-server (TurboQuant)** | 8090 | LLM synthesis + LangExtract | gemma4-legal-iq4xs-direct.gguf | `/v1/chat/completions` |
| **Go Embedding Service** | 8097 | Alternative embedding gateway | (routes to Ollama) | HTTP |

### Python Environment Strategy

```
Windows Host
  └─ WSL2 Miniforge Sidecar (Python 3.12+)
       ├─ LangExtract (phase8-step3-langextract-entities.py)
       ├─ Embedding workers (async with tqdm progress)
       ├─ GPU thread config (torch.set_num_threads)
       └─ JSON progress events → .tmp/phase8-progress.json
```

## Files Not Changed (Already Correct)

### Already Using llama-server :8090
- ✅ `scripts/launch-llama-server-parallel.ps1` (Port 8090 default)
- ✅ `scripts/launch-miniforge-nlp-sidecar.ps1` (Python environment launcher)
- ✅ `scripts/gemma4/offline_summary_worker.py` (8090/v1/completions)
- ✅ `scripts/langextract/langextract-gemma4-bridge.py` (8090 endpoint)

### Already Using Ollama :11434 (Embeddings Only)
- ✅ `scripts/atlas/embed-parent-atlas-to-qdrant.py` (Ollama embeddinggemma correct)
- ✅ `scripts/atlas/backfill-embedding-lane.mjs` (Ollama endpoints correct)

## Phase 8 Monitoring Infrastructure

### Three-Level Progress Reporting (Wired)

**Level 1 — Python Terminal Progress** (tqdm/Rich)
- Location: Each phase8-step*.py script
- Output: Terminal progress bar with entity count, latency
- Status: ⏳ Ready to implement with Python progress tracking

**Level 2 — JSON Event Stream** (Structured)
- Location: `.tmp/phase8-progress.json` (atomic) + `.tmp/phase8-progress.jsonl` (audit trail)
- Schema: Phase8ProgressEvent (step_id, state, completed/total, heartbeat_at)
- Status: ✅ Infrastructure ready (`scripts/atlas/lib/phase8_progress.mjs`)

**Level 3 — Node Wrapper Pipeline Progress** (Aggregated)
- Location: `scripts/startup/run-atlas-phase8-fanout.mjs`
- Calculation: Weighted steps (langextract=25, summary_rank=10, etc., total=100)
- Status: ✅ Implemented, reporting [i+1/steps.length] per step

### Next: Implement Python-Level Reporting

```python
# Phase 8 LangExtract should emit:
from tqdm import tqdm
import json
import os

progress_file = os.path.expanduser('.tmp/phase8-progress.json')

for i, packet in enumerate(tqdm(packets, desc="LangExtract")):
    entities = run_langextract(packet['summary'])
    
    # Emit Level 2 JSON event
    event = {
        "schema_version": "atlas-progress-v1",
        "run_id": "phase8-langextract-20260729",
        "step_id": "langextract",
        "completed": i + 1,
        "total": len(packets),
        "state": "RUNNING",
        "heartbeat_at": datetime.now(timezone.utc).isoformat()
    }
    write_atomic_json(progress_file, event)
```

## Validation Commands

### Check llama-server endpoint
```bash
curl http://127.0.0.1:8090/v1/models -s | jq '.data[0].id'
# Expected: gemma4-legal-iq4xs-direct.gguf
```

### Check Python version in workspace
```bash
scripts/dev/check-python-env.mjs
# Prints: shouldUseVenv = true (for Python 3.12+)
```

### Verify Phase 8 monitoring infrastructure
```bash
ls -la scripts/atlas/lib/phase8_progress.mjs
ls -la scripts/startup/run-atlas-phase8-fanout.mjs
```

## Summary

✅ **Infrastructure aligned**: All Phase 8 Python scripts now reference:
- llama-server :8090 for LLM synthesis (LangExtract, Gemma4)
- Python 3.12+ runtime (Miniforge WSL2)
- Three-level progress reporting (ready for Level 1 implementation)

⏳ **Next milestone**: Wire Python progress reporting with tqdm + JSON events to complete the Phase 8 monitoring infrastructure.
