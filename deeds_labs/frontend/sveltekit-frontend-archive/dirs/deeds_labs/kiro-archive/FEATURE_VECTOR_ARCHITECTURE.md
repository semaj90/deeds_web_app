# Multi-Modal Feature Vector Architecture

**Version**: 1.0
**Date**: November 30, 2025
**Total Dimensions**: 1024

---

## Overview

The 1024-dimensional feature vector encodes multi-modal, multi-signal state for the RL/QLoRA head to reason over.

```
[ LLM_TEXT | VLM_LAYOUT | WEB/RAG | TOOLS | GRAPH/AST | LEGAL_FLAGS | RUNTIME ]
   256d       128d         128d     128d     192d         96d          96d
```

---

## Block Layout

### Block A: LLM Text State (256d) - Offset 0
From `gemma3-legal:latest`:
- 240d: Projected hidden state (768 → 256 via learned projection)
- 16d: Scalar features
  - `mean_logprob`: Mean log probability of last 32 tokens
  - `entropy`: Entropy of last step
  - `low_confidence_fraction`: Fraction of tokens below threshold
  - `token_count`: Log-normalized token count
  - `perplexity`: Log-normalized perplexity

**Purpose**: "Is this answer confident or shaky?"

### Block B: VLM / LangExtract (128d) - Offset 256
From VLM pipeline (Gemma3-Vision, Docling+SigLIP, Granite):
- 16d: Document structure
  - Page count, words/page, tables/page, images/page
  - Signature/seal presence flags
- 16d: Block roles
  - Header/body/footnote fractions
  - Exhibits/annexes flags
- 32d: Visual embedding (projected from 512d)
- 64d: LangExtract entities
  - PERSON/ORG/LOCATION/MONEY/DATE counts (z-scored)
  - Children coded flags, minor victim probability
  - Document type probabilities (contract/statute/court_order/cps_report)

**Purpose**: "What kind of document is this? What entities matter?"

### Block C: Web / RAG Quality (128d) - Offset 384
From FastMCP web search + retrieval stack:
- 16d: Top-k scores (BM25, cosine, avg top5/top10)
- 16d: Diversity (pairwise variance, domain diversity)
- 16d: Coverage (query term coverage, snippet overlap)
- 16d: Citation quality (statute/case matches, confidence)
- 64d: RAG context embedding (projected from 768d)

**Purpose**: "Do we have enough evidence? Should we search more?"

### Block D: Tool-Call Telemetry (128d) - Offset 512
From agentic tool behavior:
- 16d: Usage counts (web_search, minio_evidence, ca_const, citation, rag, kag)
- 16d: Success/failure rates (failure, HTTP error, timeout)
- 16d: Latency stats (avg, p95, max)
- 16d: Tool graph bigrams (web→evidence, evidence→citation, etc.)
- 64d: Tool program embedding (last K tool calls encoded)

**Purpose**: "Is the agent thrashing tools? Should we simplify the plan?"

### Block E: Phase / AST / Error Graph (192d) - Offset 640
From ts-morph + Svelte/TS error graph:
- 32d: AST structure (depth, functions, components, imports, exports, generics)
- 32d: Error distribution (counts per error code: TS1005, TS2307, TS2339, etc.)
- 32d: Graph centrality (errors per file, root vs leaf, betweenness)
- 32d: Phase state (one-hot phase, retry count, time in phase, history)
- 64d: Graph embedding (from shallow GNN or graph2vec)

**Purpose**: "Phase26 + lots of TS1005 → needs Phase52 fix, not another search"

### Block F: Legal Context Flags (96d) - Offset 832
- 32d: Jurisdiction (federal/state flags, state code one-hot, court level)
- 32d: Topic clusters (contract, tort, criminal, family, etc. probabilities)
- 32d: Statute density (statute/case_law/regulation density, constitutional refs)

**Purpose**: "What legal domain are we in? What sources matter?"

### Block G: Runtime / Engine Perf (96d) - Offset 928
- 32d: TRT-LLM stats (tokens/sec, latency, batch size, tensorrt/wasm flags)
- 32d: Memory (GPU memory used/total, utilization, thermal state one-hot)
- 32d: Latency budget (budget, remaining, deadline pressure)

**Purpose**: "Are we under time pressure? Should we use WASM fallback?"

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Python (ACE Orchestrator)                     │
│                                                                  │
│  1. Collect states from all sources                              │
│  2. Assemble 1024-d feature vector                               │
│  3. Send to Go SIMD scorer                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                Go SIMD Feature Vector Scorer (:8096)             │
│                                                                  │
│  1. Parse JSON with Sonic                                        │
│  2. Score each block in parallel (SIMD-style)                    │
│  3. Compute action probabilities (softmax)                       │
│  4. Return recommended action + confidence                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RL/QLoRA Head Actions                         │
│                                                                  │
│  - continue_search    - switch_to_rag    - switch_to_kag        │
│  - web_search         - fix_ts_errors    - fallback_wasm        │
│  - escalate_gpu       - cache_result     - ask_clarification    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files

| File | Purpose |
|------|---------|
| `backend/services/feature_vector.py` | Python assembler |
| `go-microservice/feature-vector-scorer.go` | Go SIMD scorer |
| `go-microservice/BUILD-FEATURE-SCORER.bat` | Build script |

---

## Usage

### Python (Assemble Vector)
```python
from backend.services.feature_vector import assemble_feature_vector

vector = await assemble_feature_vector(
    llm_response=ollama_response,
    doc_analysis=langextract_result,
    search_results=rag_results,
    tool_history=recent_tools,
    error_report=ts_morph_errors,
    phase_info=current_phase,
    legal_context=jurisdiction_info,
    gpu_stats=nvidia_smi_stats,
    inference_stats=trt_llm_stats
)
# vector.shape = (1024,)
```

### Go (Score Vector)
```bash
curl -X POST http://localhost:8096/score \
  -H "Content-Type: application/json" \
  -d '{"vector": [...1024 floats...], "dims": 1024}'
```

Response:
```json
{
  "total_score": 0.73,
  "block_scores": {
    "llm_text": 0.65,
    "vlm_layout": 0.42,
    "web_rag": 0.81,
    "tools": 0.55,
    "phase_ast": 0.92,
    "legal_flags": 0.38,
    "runtime": 0.71
  },
  "confidence": 0.87,
  "recommended_action": "fix_ts_errors",
  "action_probs": {
    "fix_ts_errors": 0.87,
    "continue_search": 0.05,
    ...
  },
  "latency_us": 45
}
```

---

## Training

The scorer weights would be learned via:
1. **Supervised**: From human-labeled action preferences
2. **RL**: From reward signal (error reduction, search quality, latency)
3. **QLoRA**: Fine-tuning on legal domain data

Weight file: `weights.json` (loaded on startup)
