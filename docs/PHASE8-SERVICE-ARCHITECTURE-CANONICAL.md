# Phase 8 Service Architecture — Canonical Reference

**Date**: July 29, 2026  
**Status**: Infrastructure aligned with canonical stack  
**Last Updated**: After comprehensive audit and Python version updates

---

## Service Topology

```
Phase 8 Pipeline (Node wrapper: run-atlas-phase8-fanout.mjs)
    ↓
Step 1: LangExtract (:8090)           →  Entities, Events, Policies
Step 2: Summary Ranking                 →  Index, Rank
Step 3: Envelope Building               →  Features, Relationships
Step 4: Envelope Queuing                →  Distributed Tasks
Step 5: Feature Materialization         →  GPU Feature Extraction
Step 6: Latent Encoding (AE)            →  768→64 compression
Step 7: SOM (Self-Organizing Map)       →  Grid clustering
Step 8: GDS (Graph Data Science)        →  Neo4j topology
Step 9: Cache Warming                   →  Redis/Bifrost populations
    ↓
Progress Reporting (3 levels):
  Level 1: Python tqdm/Rich (terminal progress bars)
  Level 2: JSON events (.tmp/phase8-progress.json + .jsonl)
  Level 3: Node wrapper weighted progress (9 steps, total weight = 100)
```

---

## Infrastructure: What Runs Where

### Port Mappings (Canonical)

| Port | Service | Binary | Model | Purpose | Auth |
|------|---------|--------|-------|---------|------|
| **8090** | llama-server (TurboQuant) | llama-server.exe | gemma4-legal-iq4xs-direct.gguf | LLM synthesis (chat, reasoning, LangExtract) | None |
| **11434** | Ollama | ollama serve | embeddinggemma:latest + qwen2.5-7b | Embeddings (read-only) | None |
| **8097** | Go Embedding Service | go-embedding | (gateway to Ollama) | Embedding facade | API key |
| **6333** | Qdrant | qdrant | (vector DB) | Vector index (768-dim, 384-dim, 64-dim) | None |
| **5434** | PostgreSQL | postgres | (Postgres 18) | Canonical packet truth + summaries | User/Pass |
| **6379** | Valkey/Redis | valkey-server | (cache) | L1/L2 caching (BitFrost, progres events) | Password |
| **7474** | Neo4j | neo4j | (graph DB) | Topology, SOM, relationships | User/Pass |
| **3040** | Bifrost | go-bifrost | (semantic cache) | Semantic similarity cache (L2) | None |

### Runtime Environments

#### On Windows Host
- **Node.js 20.x+** (sveltekit-frontend)
  - Runs: npm scripts, TypeScript build, Phase 8 orchestration wrapper
  - Monitors: Python progress events, coordinates step execution
  - No GPU access (CPU-only)

#### In WSL2 Miniforge Sidecar (GPU-enabled)
- **Python 3.12+ (free-threading on 3.14)**
  - Runs: Phase 8 step scripts (LangExtract, Feature extraction, SOM, etc.)
  - Access: RTX 3060 Ti via CUDA 12.1
  - Conda env: atlas-rapids-cu13 (or custom phase8 env)
  - CPU thread config: `torch.set_num_threads()`, `torch.set_num_interop_threads()`

#### Docker Containers
- **PostgreSQL 18** (legal-ai-postgres)
- **Qdrant** (legal-ai-qdrant)
- **Redis/Valkey** (legal-ai-redis)
- **Neo4j** (legal-ai-neo4j)
- **Ollama** (legal-ai-ollama) — for embeddings only

#### Native Binaries (Windows or WSL2)
- **llama-server.exe** (TurboQuant) — Port 8090 for gemma4-legal synthesis
- **go-embedding** (Go HTTP server) — Port 8097 for embedding gateway
- **go-bifrost** (Go semantic cache) — Port 3040 for L2 cache

---

## Canonical Data Flow (Phase 8 Step 3: LangExtract)

```
1. PostgreSQL (atlas_packets)
   ↓ Fetch summaries
2. Python Worker (phase8-step3-langextract-entities.py)
   ├─ Load packets with summaries
   ├─ For each packet:
   │  ├─ Call llama-server :8090 /v1/chat/completions
   │  │  (TurboQuant Gemma4 for legal entity extraction)
   │  ├─ Parse JSON response
   │  ├─ Emit tqdm progress (Level 1)
   │  └─ Write JSON event (Level 2)
   └─ Batch update to Postgres
   ↓ Success
3. PostgreSQL (atlas_packets.metadata['langextract_entities'])
   ↓ Consumed by
4. Node Wrapper (run-atlas-phase8-fanout.mjs)
   ├─ Reports step completion
   ├─ Calculates weighted progress (langextract weight = 25/100)
   └─ Logs: [1/9] ✓ Step 1 completed in 42s
```

### Critical: Which Port for What

| Operation | Port | Service | Why NOT the other |
|-----------|------|---------|-------------------|
| **LangExtract entity extraction** | **8090** | llama-server (TurboQuant) | 11434 (Ollama) is embeddings-only, no /chat/completions |
| **Get embeddings (768-dim)** | **11434** | Ollama embeddinggemma | 8090 is LLM-only, has no /api/embeddings |
| **Embedding gateway facade** | **8097** | Go Embedding Service | Routes internally to 11434 |
| **Vector search (ANN)** | **6333** | Qdrant | Read-only mirror of Postgres |
| **Canonical truth** | **5434** | PostgreSQL | Qdrant is mirror; Redis is cache |

---

## Python Environment Setup (WSL2 Miniforge)

### Initialization (One-time)

```bash
# 1. Install Miniforge (in WSL2)
curl -L -O https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
bash Miniforge3-Linux-x86_64.sh
source ~/miniforge3/etc/profile.d/conda.sh

# 2. Create env for Phase 8
conda create -n phase8 python=3.12 pytorch::pytorch pytorch::pytorch-cuda=12.1 -c pytorch -c conda-forge

# 3. Activate and install dependencies
conda activate phase8
pip install langextract psycopg2-binary python-dotenv tqdm torch transformers

# 4. Verify CUDA
python -c "import torch; print('CUDA available:', torch.cuda.is_available())"
# Expected: CUDA available: True
```

### Per-Session (Before Running Phase 8)

```bash
# In WSL2 terminal:
source ~/miniforge3/etc/profile.d/conda.sh
conda activate phase8

# Set CPU thread limits (important for concurrent batching)
export OPENBLAS_NUM_THREADS=2
export OMP_NUM_THREADS=2
torch.set_num_threads(2)
torch.set_num_interop_threads(1)

# Run Phase 8 step
python scripts/atlas/phase8-step3-langextract-entities.py --apply --limit 100
```

### Verify Environment
```bash
# Check Python version
python --version
# Expected: Python 3.12.x (or 3.14+)

# Check Node script validation
node scripts/dev/check-python-env.mjs
# Expected: shouldUseVenv = true
```

---

## Progress Reporting: Three Levels (Wired)

### Level 1: Python tqdm (Terminal)

**File**: Each phase8-step*.py script  
**Current Status**: ⏳ Ready to implement

```python
from tqdm import tqdm
import time

packets = [...] # 1000 packets
for i, packet in enumerate(tqdm(packets, desc="LangExtract")):
    entities = run_langextract(packet['summary'])
    # tqdm updates terminal: "LangExtract 42%|████      | 423/1000 [00:35<00:45, 12.3it/s]"
```

### Level 2: JSON Events (Structured)

**Files**:
- `.tmp/phase8-progress.json` (latest atomic snapshot)
- `.tmp/phase8-progress.jsonl` (append-only audit trail)

**Current Status**: ✅ Infrastructure ready

**Schema** (Phase8ProgressEvent):
```json
{
  "schema_version": "atlas-progress-v1",
  "run_id": "phase8_202607291430",
  "pipeline": "phase8",
  "step_id": "langextract",
  "step_index": 1,
  "step_count": 9,
  "state": "RUNNING",
  "completed": 423,
  "total": 1000,
  "percent": 42,
  "rate_per_second": 12.3,
  "elapsed_seconds": 35,
  "eta_seconds": 45,
  "last_artifact_id": "packet:auth:001",
  "heartbeat_at": "2026-07-29T14:30:42Z"
}
```

**Writer** (Node module):
```javascript
import { Phase8ProgressTracker } from './scripts/atlas/lib/phase8_progress.mjs';

const tracker = new Phase8ProgressTracker(RUN_ID);
tracker.writeEvent({
  ...event,
  completed: 423,
  total: 1000,
  state: 'RUNNING'
});
// Writes to .tmp/phase8-progress.json + .tmp/phase8-progress.jsonl
```

### Level 3: Node Wrapper Pipeline Progress (Aggregated)

**File**: `scripts/startup/run-atlas-phase8-fanout.mjs`  
**Current Status**: ✅ Implemented

**Weighted Calculation**:
```
Step weights (Phase8StepWeights):
  langextract:         25
  summary_rank:        10
  envelopes_build:     8
  envelopes_queue:     4
  feature_materialize: 15
  latent:              12
  som:                 12
  gds:                 10
  cache_warm:          4
  ─────────────────────────
  TOTAL:               100

Pipeline Progress = sum(weight * step_completion_percent) / 100
```

**Terminal Output**:
```
[phase8-fanout] → atlas:phase8:step3:langextract:apply
[1/9] → atlas:phase8:step3:langextract:apply (elapsed 0.3s)
[1/9] ✓ atlas:phase8:step3:langextract:apply completed in 42.1s
progress: 1/9 steps complete
```

---

## Monitoring Dashboard (Future)

### Real-time Monitoring (Reads Level 2 events)

```javascript
// Monitor .tmp/phase8-progress.json + .jsonl
setInterval(() => {
  const latest = JSON.parse(fs.readFileSync('.tmp/phase8-progress.json'));
  
  console.log(`
    Phase 8 Pipeline Progress
    ────────────────────────────
    Run ID: ${latest.run_id}
    Step: ${latest.step_id} (${latest.step_index}/${latest.step_count})
    State: ${latest.state}
    Progress: ${latest.percent}% (${latest.completed}/${latest.total})
    Rate: ${latest.rate_per_second.toFixed(1)} items/sec
    ETA: ${latest.eta_seconds}s
  `);
}, 5000); // Poll every 5s
```

### Alert Conditions (Heartbeat-based)

- **STALLED**: No heartbeat for 120 seconds → `state = 'STALLED'`
- **TIMED_OUT**: Step exceeds STEP_TIMEOUT_MS (default 20 min)
- **FAILED**: Child process exits with non-zero code

---

## Validation Checklist

Before running Phase 8:

- [ ] **llama-server running** — `curl http://127.0.0.1:8090/v1/models`
  - Expected: `{"data": [{"id": "gemma4-legal-iq4xs-direct.gguf"}]}`

- [ ] **Ollama running** — `curl http://127.0.0.1:11434/api/tags`
  - Expected: models array includes embeddinggemma:latest

- [ ] **Python 3.12+** — `python --version`
  - Expected: Python 3.12.x or 3.14+

- [ ] **Postgres running** — `psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_packets"`
  - Expected: 58,304+ rows

- [ ] **Docker containers up** — `docker ps | grep legal-ai`
  - Expected: postgres, qdrant, redis, neo4j all running

- [ ] **Monitoring infrastructure wired** —
  - [ ] `ls scripts/atlas/lib/phase8_progress.mjs` (exists)
  - [ ] `ls scripts/startup/run-atlas-phase8-fanout.mjs` (exists)

---

## Known Issues & Workarounds

### Issue: "Connection refused :8090"
**Cause**: llama-server not running  
**Fix**: `scripts/launch-llama-server-parallel.ps1` (Windows) or start manually in WSL2

### Issue: "Cannot find Ollama :11434"
**Cause**: Ollama container not running  
**Fix**: `docker start legal-ai-ollama`

### Issue: "Python version 3.11 (not compatible)"
**Cause**: Workspace .venv uses old Python  
**Fix**: Create new .venv with Python 3.12+

### Issue: "CUDA not available in Python"
**Cause**: PyTorch CPU version installed (missing CUDA 12.1)  
**Fix**: `pip uninstall torch && pip install torch --index-url https://download.pytorch.org/whl/cu121`

---

## Reference Commands

### Run Phase 8 Full Pipeline
```bash
npm run atlas:phase8:fanout:apply
```

### Run Phase 8 Dry-Run (Preview)
```bash
npm run atlas:phase8:fanout:dry
```

### Monitor Phase 8 Progress
```bash
watch -n 1 'cat .tmp/phase8-progress.json | jq ".completed, .total, .percent, .state"'
```

### View Progress Audit Trail
```bash
tail -20 .tmp/phase8-progress.jsonl | jq '.state, .completed, .total'
```

### Check Environment
```bash
node scripts/dev/check-python-env.mjs
```

---

## Summary

✅ **Canonical Stack Aligned** (July 29, 2026):
- LLM synthesis: llama-server port 8090 (TurboQuant Gemma4)
- Embeddings: Ollama port 11434 (embeddinggemma, read-only)
- Python: 3.12+ in WSL2 Miniforge sidecar (free-threading on 3.14+)
- Monitoring: Three-level progress reporting (terminal, JSON, weighted wrapper)

⏳ **Next Phase**: Implement Level 1 Python tqdm progress bars + JSON event emission in phase8-step*.py scripts.
