# Phase 106 Implementation Roadmap — Semantic Compiler Pipeline End-to-End

**Date**: July 5, 2026  
**Status**: Deep audit complete. Implementation plan ready.  
**Target**: Stages 1-13 fully operational by end of Phase 106-108 execution.

---

## Executive Summary

**Audit Result**: 13-stage pipeline is **partially deployed** (Stages 4, 7, 8, 10 operational; Stages 1, 5, 6, 11, 12, 13 have critical gaps). To unblock Phase 106+ execution, resolve 23 next steps prioritized by dependency order.

**Critical Path**: Fix Python dependencies → Implement ast-grep Stage 1 → Wire Python orchestration (Stage 5-6) → Unify ACP dispatch (Stage 13) → End-to-end validation.

---

## NEXT STEPS (Priority Order)

### TIER 0: ENVIRONMENT & DEPENDENCIES (Must complete before any stage execution)

#### 0.1 Install Python ML libraries
**Status**: ❌ Missing
**Action**:
```bash
# In WSL2 Python 3.11 venv
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install scikit-learn  # For KMeans fallback
pip install cuml-cu12    # RAPIDS GPU KMeans (if GPU available)
pip install safetensors  # Model serialization
pip install scipy        # hierarchical clustering
pip install pandas numpy

# Verify
python3 -c "import torch; print(torch.__version__)"
python3 -c "import sklearn; print('sklearn OK')"
python3 -c "import safetensors; print('safetensors OK')"
```
**Dependency**: Phase 5 (Autoencoder), Phase 6 (KMeans), Phase 11 (Reranker)  
**Estimated time**: 15-20 minutes  
**Success gate**: All imports pass without error

---

#### 0.2 Add missing environment variables to .env.local
**Status**: ⚠️ Partial  
**Action**:
```bash
# Add to .env.local (create if missing)
LANGEXTRACT_SERVICE_URL=http://127.0.0.1:8091
GEMMA4_SERVICE_URL=http://127.0.0.1:8090
PYTORCH_PATH=/usr/bin/python3  # WSL2 Python
TURBOVEC_GRPC_PORT=50051
RERANKER_SERVICE_URL=http://127.0.0.1:5000
QDRANT_API_KEY=  # If auth required
RABBITMQ_PREFETCH=10
REDIS_PASSWORD=redis  # Valkey bundle requires auth
```
**Dependency**: All stages  
**Estimated time**: 2 minutes  
**Success gate**: `npm run env:validate` passes

---

#### 0.3 Verify Docker services are running
**Status**: ⚠️ Manual  
**Action**:
```bash
docker ps | grep -E "legal-ai-(postgres|redis|qdrant|neo4j|rabbitmq)"
# Expected: 5 containers UP

# If any are down:
docker compose -f docker-compose.yml up -d

# Health check
npm run smoke:graphify:fast  # 5-pillar check
```
**Dependency**: Stages 2, 3, 4, 7, 8  
**Estimated time**: 5 minutes  
**Success gate**: All 5 services return 200/OK

---

#### 0.4 Create missing database tables for atlas_packet_features & atlas_packet_metrics
**Status**: ✅ Verified (tables exist)  
**Action**: Run introspection to confirm
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_packet_features"
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_packet_metrics"
```
**Success gate**: Both tables exist with correct schemas

---

### TIER 1: STAGE 1 IMPLEMENTATION (AST-Grep Structural Extraction)

#### 1.1 Create phase1.5-ast-grep-extraction.mjs
**Status**: ❌ Missing  
**Action**: Create new file at `sveltekit-frontend/scripts/atlas/phase1.5-ast-grep-extraction.mjs` (350 lines)
```javascript
// Pseudocode structure
import pg from 'pg';
import { execSync } from 'child_process';

// 1. Fetch all packets from atlas_packets
// 2. For each packet (batch of 100):
//    a. ast-grep run with rule config for code symbols
//    b. Extract: functions, classes, imports, routes, enums, types
//    c. Normalize to ast_symbols[] (camelCase → snake_case)
//    d. INSERT/UPDATE atlas_packet_features
// 3. Validation gate: ≥95% non-empty ast_symbols
// 4. Report coverage, timing, errors
```
**Dependencies**: 
- `ast-grep` CLI (must be in PATH)
- postgres `pg` npm package
- ast-grep YAML rule config
**Estimated time**: 2 hours  
**Success gate**: 55,440+ packets with ast_symbols[] populated (≥95% of 58,365)

---

#### 1.2 Create ast-grep rule config for code extraction
**Status**: ❌ Missing  
**Action**: Create `sveltekit-frontend/scripts/atlas/ast-grep-rules.yaml`
```yaml
# Define patterns for each language (TypeScript, Go, Rust, etc.)
# Examples:
# - function_declaration → extract name as ast_symbol
# - class_declaration → extract name as ast_symbol
# - import_statement → extract imported names as ast_symbol
# - export_statement → extract exported names as ast_symbol
```
**Dependencies**: ast-grep documentation  
**Estimated time**: 1 hour  
**Success gate**: ast-grep runs without errors on sample files

---

#### 1.3 Wire ast-grep extraction into npm scripts
**Status**: ⏳ Partial (phase1.5:ast-grep:* scripts may exist)  
**Action**:
```bash
# Update package.json scripts
"atlas:phase1.5:ast-grep:dry": "node scripts/atlas/phase1.5-ast-grep-extraction.mjs --dry-run --limit=100",
"atlas:phase1.5:ast-grep:apply": "node scripts/atlas/phase1.5-ast-grep-extraction.mjs --apply",
"atlas:phase1.5:ast-grep:validate": "node scripts/atlas/phase1.5-ast-grep-extraction.mjs --validate",
```
**Estimated time**: 15 minutes  
**Success gate**: `npm run atlas:phase1.5:ast-grep:dry` runs without error

---

### TIER 2: STAGE 2 IMPLEMENTATION (Lexical Extraction)

#### 2.1 Verify phase1.5-lexical-extraction.mjs exists & is wired
**Status**: ⚠️ Partial  
**Action**:
```bash
# Check if file exists
ls sveltekit-frontend/scripts/atlas/phase1.5-lexical-extraction.mjs

# If not, create it (200 lines)
# Input: ast_symbols[] + code text from source_ref
# Output: lexical_features[] (keywords, n-grams, ranked terms)
# Dependencies: ast_symbols populated by Stage 1
```
**Estimated time**: 1.5 hours  
**Success gate**: 55,440+ packets with lexical_features[] populated (≥95%)

---

#### 2.2 Add lexical extraction to npm scripts
**Status**: ⏳ Partial  
**Action**:
```bash
"atlas:phase1.5:lexical:dry": "node scripts/atlas/phase1.5-lexical-extraction.mjs --dry-run --limit=100",
"atlas:phase1.5:lexical:apply": "node scripts/atlas/phase1.5-lexical-extraction.mjs --apply",
```
**Estimated time**: 10 minutes

---

### TIER 3: STAGE 3 INTEGRATION (LangExtract Concepts)

#### 3.1 Verify LangExtract service endpoint accessibility
**Status**: ⚠️ Unknown port  
**Action**:
```bash
# Test connectivity
curl -s http://127.0.0.1:8091/health || echo "LangExtract not responding"

# If failing, check service startup
docker logs legal-ai-langextract | tail -20
# OR check if running as standalone service on Windows

# Update .env if port differs
```
**Estimated time**: 5 minutes

---

#### 3.2 Create or verify phase3-langextract-concepts.mjs
**Status**: ✅ Exists (verify wiring)  
**Action**:
```bash
# Verify file path & npm script
npm run atlas:phase3:langextract:dry --limit=100

# Expected: 5-100 packets processed with used_concepts[] extracted
```
**Success gate**: ≥80% coverage (46,688+ packets with used_concepts[])

---

### TIER 4: PYTHON ORCHESTRATION WRAPPER (Stages 5-6 Bridge)

#### 4.1 Create Python orchestration wrapper for PyTorch workloads
**Status**: ❌ Missing  
**Action**: Create `sveltekit-frontend/scripts/atlas/python-orchestrator.mjs` (300 lines)
```javascript
// Wrapper that:
// 1. Spawns Python subprocess
// 2. Passes args (--stage, --limit, --dry-run, --apply)
// 3. Captures stdout/stderr with graceful error handling
// 4. Validates output schema
// 5. Updates Postgres with results
// 6. Reports coverage metrics

import { spawn } from 'child_process';
import pg from 'pg';

async function runPythonStage(stage, limit, isDryRun) {
  return new Promise((resolve, reject) => {
    const python = spawn(process.env.PYTORCH_PATH || 'python3', [
      `scripts/atlas/phase${stage}-${stageName}.py`,
      `--limit=${limit}`,
      isDryRun ? '--dry-run' : '--apply'
    ]);
    // ... capture output, parse JSON results, update DB
  });
}
```
**Dependencies**: Child process spawning, JSON parsing, Postgres client  
**Estimated time**: 1.5 hours  
**Success gate**: Successfully runs a Python script with output validation

---

#### 4.2 Create Python Stage 5 trainer (Autoencoder 768→64)
**Status**: ⚠️ Partial (train-autoencoder-768-64.mjs exists but no Python training)  
**Action**: Create `sveltekit-frontend/scripts/atlas/phase5-autoencoder-train.py` (400 lines)
```python
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
import pg as psycopg  # or psycopg3
import safetensors.torch
import sys

class Autoencoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(768, 256),
            nn.ReLU(),
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 64)
        )
        self.decoder = nn.Sequential(
            nn.Linear(64, 128),
            nn.ReLU(),
            nn.Linear(128, 256),
            nn.ReLU(),
            nn.Linear(256, 768)
        )
    
    def forward(self, x):
        return self.decoder(self.encoder(x))

# 1. Load embeddings from Postgres (768-dim)
# 2. Train AE with MSE loss
# 3. Validate reconstruction (≥0.95 similarity)
# 4. Save model to safetensors
# 5. Encode all packets, write latent64 to DB
```
**Dependencies**: torch, safetensors, psycopg  
**Estimated time**: 2 hours  
**Success gate**: Latent64 vectors written to 95%+ of packets

---

#### 4.3 Wire Stage 5 into npm scripts
**Status**: ⏳ Partial  
**Action**:
```bash
# Update package.json
"atlas:phase5:ae:dry": "node scripts/atlas/python-orchestrator.mjs 5 --dry-run --limit=100",
"atlas:phase5:ae:train": "python3 scripts/atlas/phase5-autoencoder-train.py --apply",
"atlas:phase5:ae:apply": "node scripts/atlas/python-orchestrator.mjs 5 --apply",
```
**Estimated time**: 15 minutes

---

#### 4.4 Create Python Stage 6 runner (KMeans clustering)
**Status**: ⚠️ Script exists (cuml-kmeans-clustering.py) but dependencies missing  
**Action**: Update or create `sveltekit-frontend/scripts/atlas/phase6-kmeans-clustering.py` (250 lines)
```python
# Try cuml first (GPU), fallback to sklearn (CPU)
try:
    from cuml.cluster import KMeans as cuMLKMeans
    use_gpu = True
except ImportError:
    from sklearn.cluster import KMeans as SKLearnKMeans
    use_gpu = False

# Load latent64 vectors from DB
# Run KMeans(n_clusters=1000)
# Write cluster assignments to atlas_packets.kmeans_cluster
```
**Dependencies**: cuml or sklearn  
**Estimated time**: 1 hour  
**Success gate**: 99%+ coverage of kmeans_cluster

---

#### 4.5 Wire Stage 6 into npm scripts
**Status**: ⏳ Partial  
**Action**:
```bash
"atlas:phase6:kmeans:dry": "python3 scripts/atlas/phase6-kmeans-clustering.py --dry-run --limit=1000",
"atlas:phase6:kmeans:apply": "python3 scripts/atlas/phase6-kmeans-clustering.py --apply",
```
**Estimated time**: 10 minutes

---

### TIER 5: STAGE 7 VALIDATION (SOM Topology)

#### 5.1 Verify SOM 20×20 training script
**Status**: ✅ Exists  
**Action**:
```bash
npm run atlas:phase7:som:dry --limit=100
# Expected: som_row, som_col, som_index assigned to ≥95% of packets
```
**Success gate**: Coverage ≥99% with valid grid coordinates (0-19 for row/col)

---

### TIER 6: STAGE 8 VALIDATION (Neo4j GDS)

#### 6.1 Verify Neo4j GDS scripts
**Status**: ✅ Exists  
**Action**:
```bash
npm run atlas:phase8:gds:dry --limit=100
# Expected: PageRank, Louvain, K-Core scores computed
```
**Success gate**: ≥95% coverage for page_rank and community_id

---

### TIER 7: STAGES 9-11 INTEGRATION (ANN + RRF + Reranker)

#### 7.1 Wire TurboVec ANN into retrieval pipeline
**Status**: ⚠️ Consumer-only (no training stage)  
**Action**: Verify integration in retrieval orchestrator
```bash
npm run atlas:retrieval:turbovec:test --limit=10
# Expected: Top-K candidates returned via GPU ANN
```
**Success gate**: Response time <100ms per query

---

#### 7.2 Verify RRF fusion library
**Status**: ✅ Exists  
**Action**:
```bash
# Test the RRF library
node -e "const { fuseWeightedRRF } = require('./scripts/atlas/lib/phase89-rrf.mjs'); console.log(typeof fuseWeightedRRF);"
# Expected: 'function'
```
**Success gate**: Import succeeds without error

---

#### 7.3 Wire PyTorch Reranker service
**Status**: ⚠️ Python-only (no JS bridge)  
**Action**: Create `sveltekit-frontend/scripts/atlas/reranker-bridge.mjs` (200 lines)
```javascript
// HTTP bridge to reranker service
// POST /rerank with top-50 candidates
// Receive repair_probability scores
// Return ordered top-10

async function rerank(candidates) {
  const response = await fetch(`${RERANKER_URL}/rerank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidates })
  });
  return response.json();
}
```
**Estimated time**: 1 hour  
**Success gate**: Bridge service returns valid probabilities [0-1]

---

### TIER 8: STAGE 12 INTEGRATION (HMM Semantic Compiler)

#### 8.1 Wire real ast-grep extraction into HMM evidence
**Status**: ⚠️ Currently uses placeholder ngrams  
**Action**: Update `phase8.8-hmm-semantic-compiler.mjs` to call real ast-grep
```javascript
// Before: simple ngram split
// const keywords = astSymbols.join(' ').split(/\s+/);

// After: use actual ast_symbols[] from database
const { ast_symbols, lexical_features, used_concepts } = await db.query(
  'SELECT ast_symbols, lexical_features, used_concepts FROM atlas_packet_features WHERE packet_key = $1',
  [packetKey]
);
```
**Estimated time**: 30 minutes  
**Success gate**: HMM dry-run shows evidence fields populated from database

---

#### 8.2 Validate HMM error state distribution
**Status**: ✅ Script exists  
**Action**:
```bash
npm run atlas:phase8.8:hmm:dry --limit=58365
# Expected: Mixed error state distribution
# - StructureError: 55,440 (ast_symbols missing)
# - SemanticError: 2,925 (concept_ids missing)
# - VectorError: 0 (embeddings not yet generated - expected)
# - Others: 0
```
**Success gate**: Distribution shows dependency chain working correctly

---

### TIER 9: STAGE 13 IMPLEMENTATION (ACP Action Control Plane)

#### 9.1 Create centralized ACP dispatcher
**Status**: ❌ Missing  
**Action**: Create `sveltekit-frontend/scripts/atlas/acp-action-control-plane.mjs` (400 lines)
```javascript
// Centralized dispatcher that:
// 1. Reads HMM recommendations from Postgres
// 2. Groups by error_state & repair_lane
// 3. Queues jobs to RabbitMQ
// 4. Tracks completion via NATS events
// 5. Re-runs HMM to detect next layer of errors
// 6. Emits audit trail

class ACP {
  async dispatch(hmm_recommendations) {
    for (const rec of recommendations) {
      switch (rec.error_state) {
        case 'StructureError':
          await this.queue_job('atlas:phase1.5:ast-grep:apply', rec.packet_keys);
          break;
        case 'SemanticError':
          await this.queue_job('atlas:phase3:langextract:apply', rec.packet_keys);
          break;
        // ... more cases
      }
    }
  }
  
  async queue_job(tool_call, packet_keys) {
    // Publish to RabbitMQ or use npm scripts directly
  }
}
```
**Dependencies**: NATS, RabbitMQ, or direct npm script execution  
**Estimated time**: 2 hours  
**Success gate**: ACP processes 100 recommendations without error

---

#### 9.2 Wire ACP into pipeline orchestration
**Status**: ⏳ Partial  
**Action**:
```bash
# Update package.json
"atlas:acp:dry": "node scripts/atlas/acp-action-control-plane.mjs --dry-run",
"atlas:acp:apply": "node scripts/atlas/acp-action-control-plane.mjs --apply",
"atlas:acp:monitor": "node scripts/atlas/acp-action-control-plane.mjs --monitor",
```
**Estimated time**: 15 minutes

---

### TIER 10: END-TO-END INTEGRATION & VALIDATION

#### 10.1 Create pipeline orchestrator script
**Status**: ⏳ Partial (exists but needs unification)  
**Action**: Update or create `sveltekit-frontend/scripts/atlas/orchestrate-phases-1-13.mjs` (500 lines)
```javascript
// Master orchestrator that:
// 1. Runs stages 1-13 in order (with parallelization where possible)
// 2. Validates each gate before proceeding
// 3. Logs metrics & timing
// 4. Handles failures gracefully
// 5. Produces summary report

async function main() {
  for (const stage of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
    console.log(`\n🚀 Stage ${stage}: ${stageName}`);
    const result = await executeStage(stage);
    if (!result.pass_gate) {
      console.error(`❌ Stage ${stage} failed gate. Halting.`);
      process.exit(1);
    }
  }
  console.log('\n✅ All 13 stages complete!');
}
```
**Estimated time**: 2 hours  
**Success gate**: Script runs all stages without crashing, produces summary report

---

#### 10.2 Create validation gate suite
**Status**: ⏳ Partial (scattered across scripts)  
**Action**: Create `sveltekit-frontend/scripts/atlas/validation-gates.mjs` (300 lines)
```javascript
// Reusable gate validators for all 13 stages
export const gates = {
  ast_symbols_coverage: (count, total) => (count / total) >= 0.95,
  lexical_features_coverage: (count, total) => (count / total) >= 0.95,
  used_concepts_coverage: (count, total) => (count / total) >= 0.80,
  embedding_coverage: (count, total) => (count / total) >= 0.99,
  latent64_coverage: (count, total) => (count / total) >= 0.95,
  kmeans_coverage: (count, total) => (count / total) >= 0.99,
  som_coverage: (count, total) => (count / total) >= 0.99,
  pagerank_coverage: (count, total) => (count / total) >= 0.95,
  identity_preservation: (packets) => validateLineage(packets),
  hmm_entropy: (distribution) => calculateEntropy(distribution) < 2.0,
};
```
**Estimated time**: 1 hour  
**Success gate**: All gates can be called and return boolean results

---

#### 10.3 Create end-to-end test suite
**Status**: ❌ Missing  
**Action**: Create `tests/atlas-pipeline/e2e-stages-1-13.spec.ts` (400 lines)
```typescript
describe('Atlas Pipeline Stages 1-13 E2E', () => {
  it('Stage 1: ast-grep extracts symbols', async () => {
    // Load 10 sample packets from DB
    // Run ast-grep on their source_ref files
    // Verify ast_symbols[] populated
  });
  
  it('Stage 2: lexical extracts features from Stage 1', async () => {
    // Depends on Stage 1 output
    // Verify lexical_features[] populated
  });
  
  // ... 11 more tests
  
  it('Stage 13: ACP emits repair jobs for each error_state', async () => {
    // Run full pipeline
    // Verify ACP processed N recommendations
  });
});
```
**Estimated time**: 3 hours  
**Success gate**: All 13 tests pass (allow for Stage 9-11 optional, Stages 5-6 may be offline)

---

#### 10.4 Create integration documentation
**Status**: ❌ Missing  
**Action**: Create `docs/PHASE-1-13-INTEGRATION-GUIDE.md` (300 lines)
- System architecture diagram (ASCII)
- Dependencies matrix (what each stage needs)
- Error handling strategy
- Recovery procedures
- Performance baselines
- Monitoring & alerting
**Estimated time**: 1.5 hours

---

### TIER 11: CONFIGURATION & DEPLOYMENT

#### 11.1 Update docker-compose.yml for Python services
**Status**: ⚠️ Services may not be containerized  
**Action**:
```yaml
# Add services if running standalone:
pytorch-orchestrator:
  image: pytorch/pytorch:2.1-cuda-12.1-runtime-ubuntu22.04
  volumes:
    - ./scripts/atlas:/app/scripts
    - ./models:/app/models
  environment:
    - PYTORCH_PATH=/usr/local/bin/python3
  networks:
    - atlas
```
**Estimated time**: 30 minutes (optional if running on host)

---

#### 11.2 Create .env.example with all required vars
**Status**: ⏳ Partial  
**Action**: Update `.env.example` with new vars
```bash
# Phase 1-13 Pipeline Configuration
LANGEXTRACT_SERVICE_URL=http://127.0.0.1:8091
GEMMA4_SERVICE_URL=http://127.0.0.1:8090
PYTORCH_PATH=/usr/bin/python3
TURBOVEC_GRPC_PORT=50051
RERANKER_SERVICE_URL=http://127.0.0.1:5000
ATLAS_BATCH_SIZE=100
ATLAS_DRY_RUN=true
```
**Estimated time**: 15 minutes

---

#### 11.3 Create CI/CD pipeline for Phase stages
**Status**: ❌ Missing  
**Action**: Create `.github/workflows/atlas-pipeline.yml` (200 lines)
```yaml
name: Atlas Pipeline Validation
on: [push, pull_request]
jobs:
  stage-1-ast-grep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run atlas:phase1.5:ast-grep:validate
      
  stage-2-lexical:
    needs: stage-1-ast-grep
    runs-on: ubuntu-latest
    steps:
      - run: npm run atlas:phase1.5:lexical:validate
      
  # ... stages 3-13
```
**Estimated time**: 1.5 hours

---

### TIER 12: DOCUMENTATION & HANDOFF

#### 12.1 Create implementation checklist
**Status**: ⏳ In-progress (this document)  
**Action**: Create interactive checklist at `docs/PHASE-106-IMPLEMENTATION-CHECKLIST.md`
```markdown
## Phase 1-13 Implementation Checklist

### Tier 0: Environment
- [ ] 0.1 Install Python ML libraries
- [ ] 0.2 Add .env variables
- [ ] 0.3 Verify Docker services
- [ ] 0.4 Verify database tables

### Tier 1: Stage 1
- [ ] 1.1 Create phase1.5-ast-grep-extraction.mjs
- [ ] 1.2 Create ast-grep rule config
- [ ] 1.3 Wire ast-grep npm scripts

... (all 48 items with checkboxes)
```
**Estimated time**: 1 hour

---

#### 12.2 Create runbook for Phase 106 execution
**Status**: ❌ Missing  
**Action**: Create `docs/PHASE-106-EXECUTION-RUNBOOK.md` (400 lines)
- Pre-flight checklist
- Stage execution order with timing estimates
- Expected gate values
- Rollback procedures
- Troubleshooting guide
**Estimated time**: 2 hours

---

#### 12.3 Write summary report
**Status**: ⏳ In-progress  
**Action**: Finalize `PHASE-106-IMPLEMENTATION-ROADMAP.md` (this file)
**Estimated time**: 1 hour

---

## Summary Table: 23 Next Steps by Tier

| Tier | Count | Total Time | Dependencies |
|------|-------|-----------|--------------|
| 0: Environment | 4 | 30 min | None |
| 1: Stage 1 (AST-Grep) | 3 | 3.5 h | ast-grep CLI, Node.js |
| 2: Stage 2 (Lexical) | 2 | 1.5 h | Stage 1 |
| 3: Stage 3 (LangExtract) | 2 | 30 min | LangExtract service |
| 4: Python Orchestration | 5 | 5 h | torch, sklearn, safetensors |
| 5: Stage 7 (SOM) | 1 | 15 min | latent64 vectors |
| 6: Stage 8 (Neo4j GDS) | 1 | 15 min | Neo4j |
| 7: Stages 9-11 (ANN+Reranker) | 3 | 2 h | GPU/Python services |
| 8: Stage 12 (HMM) | 2 | 1 h | Database |
| 9: Stage 13 (ACP) | 2 | 2.5 h | NATS/RabbitMQ |
| 10: E2E Integration | 4 | 8 h | All stages |
| 11: Config & Deployment | 3 | 2 h | Docker, CI/CD |
| 12: Documentation | 3 | 4 h | All stages |
| **TOTAL** | **36** | **33 hours** | **Cumulative** |

---

## Critical Path (Minimum to Unblock Phase 106)

1. **0.1-0.4**: Environment setup (30 min)
2. **1.1-1.3**: Implement ast-grep Stage 1 (3.5 h)
3. **2.1-2.2**: Verify lexical Stage 2 (1.5 h)
4. **3.1-3.2**: Verify LangExtract Stage 3 (30 min)
5. **4.1-4.2**: Implement Python wrapper + AE training (3.5 h)
6. **4.3-4.5**: Implement KMeans Stage 6 (1.5 h)
7. **8.1-8.2**: Wire HMM to real data (1 h)
8. **10.1**: Create pipeline orchestrator (2 h)

**Critical Path Duration**: ~14.5 hours (can be parallelized to ~6 hours with 3 workers)

---

## Success Criteria (Phase 106 Complete)

✅ All 13 stages implemented and integrated  
✅ Validation gates pass for stages 1-8  
✅ HMM runs end-to-end with real feature data  
✅ ACP dispatcher processes recommendations  
✅ 58,365 packets have complete lineage (identity → concepts → embeddings → topology)  
✅ E2E test suite passes (13/13 stages)  
✅ CI/CD pipeline validates all stages on pull requests

---

## Phase 106+ Roadmap

| Phase | Focus | Duration | Blockers |
|-------|-------|----------|----------|
| Phase 106 | Stages 1-13 implementation | 2 weeks | Python setup, ast-grep rules |
| Phase 107 | GPU optimization (Stages 5-7) | 1 week | CUDA/cuVS tuning |
| Phase 108 | Ranking optimization (Stages 10-11) | 1 week | Reranker training data |
| Phase 109 | Production hardening | 1 week | Error handling, retries, monitoring |
| Phase 110+ | Inference optimization & scaling | Ongoing | Load testing, perf tuning |

---

**Status**: Ready for Phase 106 implementation.  
**Next Action**: Start with Tier 0 (30 min), then Tier 1 (Stage 1 ast-grep implementation).
