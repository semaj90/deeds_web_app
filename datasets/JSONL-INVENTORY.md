# JSONL/NDJSON File Inventory

**Scan Date:** 2026-06-27  
**Total Files:** 1,054 (excluding worktrees)  
**Primary Locations:**
- `.opencode/` — OpenCode ACE packets, cards, recommendations
- `.tmp/` — Temporary analysis files (atlas, ast, addressable packets)
- `.rag-metrics/` — RAG evaluation metrics (chunks, embeddings)
- `.cline/` — Cline memory export
- Various project-specific analysis directories

## Organization Strategy

### By Purpose

**1. Training Data** (for SFT/DPO datasets)
- Location: `datasets/training-pairs/`
- Files: `*training-pairs*.jsonl`, `*sft*.jsonl`, `*dpo*.jsonl`
- Purpose: LLM fine-tuning datasets

**2. Embeddings Cache** (vector data)
- Location: `datasets/embeddings/`
- Files: `embeddings.jsonl`, `*embedding*.jsonl`, `*.embeddings.jsonl`
- Purpose: Pre-computed embeddings for retrieval

**3. Traces & Telemetry** (execution history)
- Location: `datasets/traces/`
- Files: `*trace*.jsonl`, `*telemetry*.jsonl`, `*log*.ndjson`
- Purpose: Trace audit trail, telemetry events

**4. RAG Metrics** (retrieval evaluation)
- Location: `datasets/rag-metrics/`
- Files: `chunks/*.jsonl`, `*metrics*.jsonl`
- Purpose: RAG pipeline metrics & chunk quality

**5. Atlas Snapshots** (state history)
- Location: `datasets/atlas/`
- Files: `atlas-*.jsonl`, `*snapshot*.ndjson`, `addressable-packets*.ndjson`
- Purpose: Packet state, topology, authority scores

**6. OpenCode** (ACE packets, cards, recommendations)
- Location: `datasets/opencode/`
- Files: `.opencode/**/*.jsonl`, `.opencode/**/*.ndjson`
- Purpose: ACE packet registry, recommendations, outcome ledger

**7. Audit & Analysis** (temporary analysis results)
- Location: `datasets/audit/`
- Files: `.tmp/analysis/*.ndjson`, `.tmp/ast-*.jsonl`
- Purpose: AST analysis, call graphs, import resolution

## Example File Mappings

### Training Pairs
```
.opencode/ndjson/enriched-ledger.ndjson → datasets/training-pairs/opencode-ledger.ndjson
.opencode/cards/summaries.jsonl → datasets/training-pairs/summaries.jsonl
.opencode/ndjson/cluster-summary.ndjson → datasets/training-pairs/cluster-summaries.ndjson
```

### Embeddings Cache
```
.rag-metrics/embeddings/embeddings.jsonl → datasets/embeddings/rag-embeddings.jsonl
```

### Traces
```
.tmp/addressable-packets.validated.ndjson → datasets/traces/addressable-packets-validated.ndjson
```

### Atlas
```
.tmp/atlas-*.jsonl → datasets/atlas/
.opencode/ndjson/temporal-index.ndjson → datasets/atlas/temporal-index.ndjson
```

### Audit
```
.tmp/analysis/*.ndjson → datasets/audit/
.tmp/ast-*.jsonl → datasets/audit/
```

## Next Steps

1. **Inventory Report** — Generate per-type file count and size
2. **Move Strategy** — Batch move files to datasets/ by purpose
3. **Create Manifests** — Index files by category with metadata
4. **Link References** — Update scripts to point to new paths
5. **Archive Old** — Compress .tmp/ originals after verification

## File Count by Category (Estimate)

- `.opencode/` — ~300 files
- `.tmp/` — ~400 files
- `.rag-metrics/` — ~50 files
- `.cline/` — ~5 files
- Project-specific — ~300 files

**Total: ~1,055 files**

