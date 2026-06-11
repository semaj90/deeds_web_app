# Phase 17G: GPU JSON Tensor Mapping Function Tool

**Status**: DEFERRED / READY-TO-SPEC  
**Rationale**: Large JSON/NDJSON artifacts (100MB → 500MB when expanded) bypass OpenCode context limits and GPU memory constraints. Defer until LD-JSON manifests are stable and Phase 3F trace volume justifies GPU tensor mapping.  
**Owners**: (Reserved for future GPU lane)  
**Blocking**: None (parallel research track)  
**Blocked by**: None (can spec independently)

---

## Problem Statement

### Current Risk
- **Artifact scale**: NESCHROM97 registry = 6MB JSON → 8,170 cards + 14,956 packets
- **Expansion**: JSON.parse() creates intermediate objects; 100MB → 300–500MB RAM
- **Gemma4 exposure**: Passing large JSON to LLM tokenizer → bloat + cost
- **GPU naivety**: Naive tensor conversion (JSON → float32 array) → memory pressure on RTX 3060 Ti (8GB)
- **No bounds**: Unbounded JSON loading + GPU ops = OOM cascade

### Safe Boundary
- NESCHROM97 cards are **NOT** passed to Gemma4 directly
- Instead: manifest hash → deterministic indexing → bounded packet sampling → GPU actions as tools
- Gemma4 **plans** which packets to map; **tools execute** the mapping

---

## Architecture

```
Large JSON/NDJSON artifact (100MB+)
  ↓
[gpu_json.profile_artifact]
  ├─ SHA256 manifest hash
  ├─ record count + type distribution
  ├─ sample first/last N records
  └─ return bounds (no loading entire file into memory)

Bounded packet set (selected_concepts from Phase 3F)
  ↓
[gpu_json.materialize_ldjson]
  ├─ Stream LDJSON in 1MB chunks
  ├─ Extract embeddings + metadata
  ├─ MessagePack/Protobuf encoding
  └─ write to /tmp/materialized-packets.msgpack

Embeddings (768-dim)
  ↓
[gpu_tensor.train_autoencoder]
  ├─ Input: 768-dim embeddings
  ├─ Latent: 64-dim (10× compression)
  ├─ Training: 100K samples max, gradient checkpointing
  ├─ Device: CUDA (RTX 3060 Ti) or CPU fallback
  └─ Output: .pth model + projection matrix

Projected embeddings (64-dim)
  ↓
[gpu_tensor.project_manifold4]
  ├─ PCA 64→4 (for topology visualization)
  ├─ SOM clustering (existing som_bmu_col/row)
  └─ Write back to Postgres/Qdrant metadata (bounded batches)
```

---

## Function Tools (MCP Contract)

### 1. gpu_json.profile_artifact

**Purpose**: Analyze large JSON/NDJSON without loading entire file.

```json
{
  "name": "gpu_json.profile_artifact",
  "description": "Profile a large JSON/NDJSON artifact without loading it into LLM context. Returns record count, type distribution, sample records, and manifest hash.",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Absolute path to JSON or NDJSON file (e.g., /root/neschrom97-card-registry.json or .opencode/ndjson/enriched-candidates.ndjson)"
      },
      "max_sample_bytes": {
        "type": "integer",
        "description": "Maximum bytes to read for sampling (default 1MB)",
        "default": 1048576
      },
      "mode": {
        "type": "string",
        "description": "Format: 'json' (single object), 'ndjson'/'jsonl' (newline-delimited), or 'auto' (detect)",
        "enum": ["json", "ndjson", "jsonl", "auto"],
        "default": "auto"
      }
    },
    "required": ["path"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "manifest_hash": { "type": "string", "description": "SHA256 of file content" },
      "file_size_mb": { "type": "number" },
      "estimated_expanded_mb": { "type": "number", "description": "Estimated RAM after JSON.parse()" },
      "record_count": { "type": "integer" },
      "record_types": { "type": "object", "description": "Distribution of 'type' field (or first key)" },
      "sample_records": {
        "type": "array",
        "description": "First and last 3 records (JSON or stringified)"
      },
      "keys_sample": {
        "type": "array",
        "description": "Top-level keys found in records"
      }
    }
  }
}
```

**Gemma4 constraints**:
- ✅ Call to understand artifact structure
- ❌ DO NOT pass entire output to context
- Use manifest_hash + record_count only for planning

**Example output**:
```json
{
  "path": "docs/reports/neschrom97-card-registry.json",
  "manifest_hash": "a1b2c3d4...",
  "file_size_mb": 6.0,
  "estimated_expanded_mb": 25.0,
  "record_count": 8170,
  "record_types": { "card": 8170 },
  "keys_sample": ["concept_id", "evidence", "feature_ids", "som_clusters", ...],
  "sample_records": [
    { "concept_id": "auth-flow", "evidence": [...], ... },
    { "concept_id": "znode-traversal", ... }
  ]
}
```

---

### 2. gpu_json.materialize_ldjson

**Purpose**: Convert bounded packet set into streaming LDJSON, then serialize to MessagePack.

```json
{
  "name": "gpu_json.materialize_ldjson",
  "description": "Stream a large JSON/NDJSON file in bounded chunks, extract embeddings/metadata, and serialize to MessagePack for GPU processing.",
  "input_schema": {
    "type": "object",
    "properties": {
      "source_path": {
        "type": "string",
        "description": "Source JSON/NDJSON file"
      },
      "packet_keys": {
        "type": "array",
        "description": "Packet IDs to extract (e.g., from agent_traces.selected_packets)",
        "items": { "type": "string" }
      },
      "output_path": {
        "type": "string",
        "description": "Output .msgpack file (e.g., /tmp/materialized-packets.msgpack)",
        "default": "/tmp/materialized-packets.msgpack"
      },
      "chunk_size_mb": {
        "type": "integer",
        "description": "Stream chunk size (default 1MB)",
        "default": 1
      },
      "dry_run": {
        "type": "boolean",
        "default": true
      }
    },
    "required": ["source_path"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "packets_materialized": { "type": "integer" },
      "output_path": { "type": "string" },
      "output_size_mb": { "type": "number" },
      "manifest_hash": { "type": "string" },
      "extraction_time_ms": { "type": "number" }
    }
  }
}
```

**Example**:
```json
{
  "packets_materialized": 500,
  "output_path": "/tmp/materialized-packets.msgpack",
  "output_size_mb": 12.3,
  "manifest_hash": "a1b2c3d4...",
  "extraction_time_ms": 450
}
```

---

### 3. gpu_tensor.train_autoencoder

**Purpose**: Train deterministic autoencoder projection on bounded embeddings.

```json
{
  "name": "gpu_tensor.train_autoencoder",
  "description": "Train a bounded autoencoder to project 768-dim embeddings → 64-dim latent space. Gradient checkpointing for memory efficiency on RTX 3060 Ti.",
  "input_schema": {
    "type": "object",
    "properties": {
      "manifest_path": {
        "type": "string",
        "description": "Path to /tmp/materialized-packets.msgpack or embeddings CSV"
      },
      "input_dim": {
        "type": "integer",
        "description": "Input embedding dimension (default 768)",
        "default": 768
      },
      "latent_dim": {
        "type": "integer",
        "description": "Latent dimension (default 64, 12× compression)",
        "default": 64
      },
      "batch_size": {
        "type": "integer",
        "description": "Training batch size (default 256)",
        "default": 256
      },
      "max_rows": {
        "type": "integer",
        "description": "Cap training rows (default 100K)",
        "default": 100000
      },
      "device": {
        "type": "string",
        "description": "Compute device",
        "enum": ["cuda", "cpu"],
        "default": "cuda"
      },
      "gradient_checkpointing": {
        "type": "boolean",
        "description": "Enable gradient checkpointing (memory-efficient for RTX 3060 Ti)",
        "default": true
      },
      "dry_run": {
        "type": "boolean",
        "default": true
      }
    },
    "required": ["manifest_path"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "model_path": { "type": "string", "description": ".pth file path" },
      "projection_matrix_path": { "type": "string" },
      "rows_trained": { "type": "integer" },
      "final_loss": { "type": "number" },
      "training_time_ms": { "type": "number" },
      "device_used": { "type": "string" },
      "vram_peak_mb": { "type": "number" }
    }
  }
}
```

**Implementation detail** (WSL2 safety):
- Tool runs in Python subprocess in WSL2 (separate from Node)
- Returns .pth model + projection matrix to /tmp
- Node loads projection matrix (small, <1MB) for inference
- **Never** pulls full embeddings into Node process

**Example output**:
```json
{
  "model_path": "/tmp/autoencoder-a1b2c3d4.pth",
  "projection_matrix_path": "/tmp/projection-a1b2c3d4.npy",
  "rows_trained": 50000,
  "final_loss": 0.012,
  "training_time_ms": 45000,
  "device_used": "cuda",
  "vram_peak_mb": 3200
}
```

---

### 4. gpu_tensor.project_manifold4

**Purpose**: Apply trained autoencoder to bounded packets, produce manifold4 (4D topology).

```json
{
  "name": "gpu_tensor.project_manifold4",
  "description": "Apply autoencoder to embeddings, then project to 4D manifold (x, y, z, w) for visualization + SOM clustering.",
  "input_schema": {
    "type": "object",
    "properties": {
      "manifest_path": {
        "type": "string",
        "description": "Materialized packets or embeddings"
      },
      "model_path": {
        "type": "string",
        "description": "Trained .pth autoencoder"
      },
      "projection_matrix_path": {
        "type": "string",
        "description": "PCA 64→4 projection"
      },
      "batch_size": {
        "type": "integer",
        "default": 512
      },
      "som_k": {
        "type": "integer",
        "description": "SOM cluster count (default 20)",
        "default": 20
      },
      "device": {
        "type": "string",
        "enum": ["cuda", "cpu"],
        "default": "cuda"
      },
      "dry_run": {
        "type": "boolean",
        "default": true
      }
    },
    "required": ["manifest_path", "model_path", "projection_matrix_path"]
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "manifold4_path": { "type": "string", "description": "CSV: packet_id, x, y, z, w, som_cluster" },
      "rows_projected": { "type": "integer" },
      "som_clusters": { "type": "integer" },
      "projection_time_ms": { "type": "number" }
    }
  }
}
```

**Output file** (manifold4.csv):
```
packet_id,x,y,z,w,som_cluster
nes:card:auth-flow,0.123,-0.456,0.789,0.012,3
nes:card:znode-traversal,0.234,-0.567,0.890,0.123,7
...
```

---

## Gemma4 Interaction Pattern

### Allowed

```
Gemma4: "I need to analyze NESCHROM97 cards for authority ranking.
  1. profile_artifact(docs/reports/neschrom97-card-registry.json)
  2. Extract cards with som_cluster in {0,1,2}
  3. materialize_ldjson(selected_packets=[...])
  4. train_autoencoder(manifest_path=/tmp/materialized-packets.msgpack)
  5. project_manifold4(...)"

→ Each step returns SMALL report (counts, hashes, times)
→ Gemma4 reads bounds, makes next decision
→ Gemma4 does NOT read full manifold4.csv into context
```

### Forbidden

```
❌ Gemma4: "Load the entire NESCHROM97 registry into context"
❌ Gemma4: "Run unbounded GPU training loop"
❌ Gemma4: "Materialize all packets from all NDJSON files"
❌ Gemma4: "Write directly to Postgres/Qdrant/Neo4j"
```

---

## Implementation Sequence (Post Phase 3F)

### Gate 1: LD-JSON Manifests Stable
- **Check**: `.opencode/ndjson/*.ndjson` all valid (smoke test ✅)
- **Output**: 5 NDJSON files, 3,238 records total

### Gate 2: Phase 3F Trace Volume
- **Check**: `agent_traces` > 1,000 rows
- **Output**: `selected_concepts` populates from retrieval/repair context

### Gate 3: QLoRA Export Sufficient
- **Check**: `qlora_examples` > 100 rows with outcome='success' + reward ≥ 0.5
- **Output**: High-quality training examples exist

### Then: Phase 17G GPU JSON Tensor Mapping
- **Goal**: Reduce 768-dim embeddings → 64-dim latent space
- **Reason**: Efficient topic modeling, SOM clustering, manifold visualization
- **Tool**: autoencoder(768→64) + PCA(64→4)
- **Output**: manifold4 + som_cluster updates to Postgres/Qdrant

---

## Windows 10 / WSL2 / Docker Rules

**Do NOT** put CUDA training in SvelteKit request path.

```
Windows Node/TypeScript
  ├─ orchestration (Gemma4 planning)
  ├─ MCP tools (gpu_json.*, gpu_tensor.*)
  └─ CALLS → Python subprocess

WSL2 Python/PyTorch
  ├─ CUDA compute (training, projection)
  ├─ Temporary files (/tmp)
  └─ Returns .pth model + CSV results

Docker
  ├─ Postgres/Qdrant/Neo4j/Redis services
  ├─ SeaweedFS cold artifact storage
  └─ Receives bounded updates (manifold4 batches, not raw embeddings)

Gemma4 (Ollama)
  ├─ Plans which packets to map
  ├─ Calls gpu_json.* to understand structure
  ├─ Calls gpu_tensor.* to delegate compute
  └─ DOES NOT load embeddings/JSON directly
```

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| 100MB JSON → 500MB RAM | Profile only, stream in chunks, materialize selectively |
| GPU OOM (RTX 3060 Ti 8GB) | Gradient checkpointing, batch size 256, max_rows 100K |
| Unbounded Gemma4 context | Tool returns reports (counts, hashes), not data blobs |
| Data corruption (JSON → tensor) | Manifest hash validation, deterministic projection matrices |
| WSL2/Docker boundary issues | Python subprocess isolated, results via CSV/NPY files |

---

## Success Criteria

- [ ] Phase 3F gates pass (>1,000 traces, >100 QLoRA examples)
- [ ] LD-JSON manifests all valid (smoke test)
- [ ] gpu_json.profile_artifact returns correct metadata
- [ ] gpu_tensor.train_autoencoder trains on 50K samples in <5 minutes
- [ ] manifold4 projection matches existing som_bmu_col/row within 0.1 units
- [ ] No GPU OOM on RTX 3060 Ti (VRAM peak < 7GB)
- [ ] Postgres/Qdrant updates batched (not unbounded)

---

## References

- **NESCHROM97 registry**: docs/reports/neschrom97-card-registry.json (8,170 cards, 100% source_ref coverage)
- **LDJSON pipeline**: .opencode/ndjson/ (5 files, 3,238 records, validated)
- **Phase 3F traces**: agent_traces table (target >1,000 rows)
- **Existing SOM**: codebase_chunk_index.som_bmu_col/row (topology already seeded)
- **Postgres 18 optimizations**: AIO + skip-scan indexes for manifold4 updates
