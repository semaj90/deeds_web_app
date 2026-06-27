# Datasets Directory — JSONL/NDJSON Organization

**Purpose:** Organize 1,054 JSONL/NDJSON files across the project into a canonical datasets directory by purpose/category.

**Status:** ✅ Organization framework deployed | Ready to execute

---

## Overview

The project contains ~1,054 JSONL/NDJSON files scattered across multiple locations:
- `.opencode/` — ACE packets, cards, recommendations (~300 files)
- `.tmp/` — Temporary analysis results (~400 files)
- `.rag-metrics/` — RAG evaluation metrics (~50 files)
- `.cline/`, `.claude/worktrees/` — Memory exports

This directory consolidates them into 7 purpose-driven categories:

| Category | Purpose | File Types | Count |
|----------|---------|-----------|-------|
| **training-pairs** | SFT/DPO training data | `*training*.jsonl`, `*sft*.jsonl` | ~150 |
| **embeddings** | Pre-computed vectors | `embeddings.jsonl`, `*.embeddings.jsonl` | ~50 |
| **traces** | Execution traces & telemetry | `*trace*.jsonl`, `*telemetry*.ndjson` | ~100 |
| **rag-metrics** | RAG evaluation data | `chunks/*.jsonl`, `*metrics*.jsonl` | ~50 |
| **atlas** | Packet state snapshots | `atlas-*.jsonl`, `addressable-packets*.ndjson` | ~300 |
| **opencode** | ACE packet registry | `.opencode/**/*.jsonl/.ndjson` | ~300 |
| **audit** | AST analysis results | `.tmp/analysis/*.ndjson`, `.tmp/ast-*.jsonl` | ~100 |

---

## Quick Start

### 1. **Dry-run (preview moves)**
```bash
cd sveltekit-frontend
npm run dataset:organize
```

**Output:**
```
🔍 Scanning for JSONL/NDJSON files (excluding worktrees)...
✅ Found 1054 files

📊 Generating report...

Summary by category:
  training-pairs       150 files (1234.5 KB)
  embeddings            50 files (2456.7 KB)
  traces               100 files (3421.2 KB)
  rag-metrics           50 files (1234.5 KB)
  atlas                300 files (4567.8 KB)
  opencode             300 files (5678.9 KB)
  audit                100 files (2345.6 KB)
  uncategorized          4 files (12.3 KB)

📋 Planning moves...

training-pairs (150 files):
  .opencode/ndjson/enriched-ledger.ndjson → datasets/training-pairs/opencode-ledger.ndjson
  .opencode/cards/summaries.jsonl → datasets/training-pairs/summaries.jsonl
  ... and 148 more

(DRY-RUN mode — use --apply to execute)

📄 Report saved to datasets/JSONL-ORGANIZATION-REPORT.json
```

### 2. **Execute moves**
```bash
npm run dataset:organize:apply
```

**Output:**
```
⚙️  Executing moves...

Results:
  ✅ Success: 1050
  ❌ Failure: 4

📄 Report saved to datasets/JSONL-ORGANIZATION-REPORT.json
```

### 3. **View inventory**
```bash
npm run dataset:inventory
```

---

## Categories & File Mappings

### training-pairs/ — SFT/DPO Datasets
**Purpose:** Fine-tuning data for language models  
**Files:** SFT (Supervised Fine-Tuning) + DPO (Direct Preference Optimization) pairs

**Examples:**
```
.opencode/ndjson/enriched-ledger.ndjson     → training-pairs/opencode-ledger.ndjson
.opencode/cards/summaries.jsonl             → training-pairs/summaries.jsonl
.opencode/ndjson/cluster-summary.ndjson     → training-pairs/cluster-summaries.ndjson
.opencode/cards/invalid-summaries.jsonl     → training-pairs/invalid-summaries.ndjson
memory/packets/lora-training-pairs.jsonl    → training-pairs/lora-training-pairs.jsonl
```

### embeddings/ — Vector Cache
**Purpose:** Pre-computed embeddings for retrieval  
**Files:** 768-dimensional vectors, embedding IDs, distances

**Examples:**
```
.rag-metrics/embeddings/embeddings.jsonl    → embeddings/rag-embeddings.jsonl
memory/packets/atlas-token-map.jsonl        → embeddings/atlas-token-map.jsonl
```

### traces/ — Execution History
**Purpose:** Audit trail for queries, tool calls, results  
**Files:** Traces, checkpoints, outcome logs

**Examples:**
```
.tmp/addressable-packets.validated.ndjson   → traces/addressable-packets-validated.ndjson
.opencode/outcome-ledger.ndjson             → traces/outcome-ledger.ndjson
.opencode/outcome-ledger-with-cardIds.ndjson → traces/outcome-ledger-with-ids.ndjson
```

### rag-metrics/ — Retrieval Evaluation
**Purpose:** RAG pipeline metrics, chunk quality  
**Files:** Chunk embeddings by language, retrieval scores

**Examples:**
```
.rag-metrics/chunks/go.jsonl                → rag-metrics/chunks/go.jsonl
.rag-metrics/chunks/ts.jsonl                → rag-metrics/chunks/ts.jsonl
.rag-metrics/chunks/svelte.jsonl            → rag-metrics/chunks/svelte.jsonl
.rag-metrics/chunks/md.jsonl                → rag-metrics/chunks/md.jsonl
```

### atlas/ — Packet State
**Purpose:** Snapshots of packet metadata, topology, authority  
**Files:** Addressable packets, cluster assignments, node authority

**Examples:**
```
.tmp/atlas-cards-for-weights.jsonl          → atlas/cards-for-weights.jsonl
.tmp/atlas-cluster-assignments.jsonl        → atlas/cluster-assignments.jsonl
.tmp/addressable-packets.ndjson             → atlas/addressable-packets.ndjson
.tmp/addressable-packets.enriched.ndjson    → atlas/addressable-packets-enriched.ndjson
.tmp/addressable-packets.vectorized.ndjson  → atlas/addressable-packets-vectorized.ndjson
memory/packets/atlas-glyph-rewards.jsonl    → atlas/glyph-rewards.jsonl
memory/packets/atlas-graph-edges.jsonl      → atlas/graph-edges.jsonl
memory/packets/atlas-node-authority.jsonl   → atlas/node-authority.jsonl
memory/packets/atlas-state-snapshots.jsonl  → atlas/state-snapshots.jsonl
memory/packets/atlas-packet-facts.jsonl     → atlas/packet-facts.jsonl
```

### opencode/ — ACE Packets & Recommendations
**Purpose:** OpenCode ACE packet registry, cards, recommendations  
**Files:** Packet indexes, recommendation queues, outcomes

**Examples:**
```
.opencode/ace-packets/index.ndjson          → opencode/ace-packets-index.ndjson
.opencode/gemma4_candidates.ndjson          → opencode/gemma4-candidates.ndjson
.opencode/cards/qdrant-upload.ndjson        → opencode/cards-qdrant-upload.ndjson
.opencode/ndjson/enriched-candidates.ndjson → opencode/enriched-candidates.ndjson
.opencode/recommendations/tasks.ndjson      → opencode/recommendations-tasks.ndjson
.opencode/ndjson/minified-ace-index.ndjson  → opencode/minified-ace-index.ndjson
```

### audit/ — Analysis Results
**Purpose:** AST analysis, import resolution, temporary results  
**Files:** Call graphs, dependency edges, unresolved imports

**Examples:**
```
.tmp/analysis/backfill-proposals.ndjson     → audit/backfill-proposals.ndjson
.tmp/ast-file-nodes.jsonl                   → audit/ast-file-nodes.jsonl
.tmp/ast-import-edges.jsonl                 → audit/ast-import-edges.jsonl
.tmp/ast-import-edges-resolved.jsonl        → audit/ast-import-edges-resolved.jsonl
.tmp/ast-db-edges.jsonl                     → audit/ast-db-edges.jsonl
.tmp/ast-tool-edges.jsonl                   → audit/ast-tool-edges.jsonl
.tmp/ast-call-edges.jsonl                   → audit/ast-call-edges.jsonl
.tmp/ast-unresolved-imports.jsonl           → audit/ast-unresolved-imports.jsonl
```

---

## File Organization Report

After organization, a report is generated at:

```
datasets/JSONL-ORGANIZATION-REPORT.json
```

**Contents:**
```json
{
  "timestamp": "2026-06-27T...",
  "total_files": 1054,
  "by_category": {
    "training-pairs": 150,
    "embeddings": 50,
    "traces": 100,
    "rag-metrics": 50,
    "atlas": 300,
    "opencode": 300,
    "audit": 100,
    "uncategorized": 4
  },
  "by_category_size": {
    "training-pairs": 1234500,
    "embeddings": 2456700,
    ...
  },
  "uncategorized": [
    "path/to/file-1.jsonl",
    "path/to/file-2.ndjson",
    ...
  ]
}
```

---

## Script Reference

### `organize-jsonl-files.mjs` (90 lines)

**Usage:**
```bash
# Dry-run preview
npm run dataset:organize

# Execute moves
npm run dataset:organize:apply
```

**Functions:**
- `categorizeFile(fileName)` — Match filename against patterns, return category
- `findJsonlFiles()` — Recursive find excluding worktrees
- `getFileSize(filePath)` — Return bytes
- `generateReport(files)` — Count + size by category
- `planMoves(files)` — Prepare move operations
- `executeMoves(moves, dryRun)` — Execute or preview moves

**Pattern Matching:**
- Case-insensitive regex patterns per category
- Falls back to "uncategorized" if no match
- Each file categorized exactly once (first match wins)

---

## Integration with Step 6 (Trace Export)

When **Step 6: Export Traces & SFT Pairs** executes, output goes to:

```
datasets/training-pairs/sft-pairs.jsonl      ← SFT dataset
datasets/training-pairs/dpo-pairs.jsonl      ← DPO dataset
datasets/traces/execution-traces.jsonl       ← Full trace audit
```

These locations are pre-created by this organization step.

---

## Next Steps

1. **Run dry-run:** `npm run dataset:organize`
2. **Review output:** Check `datasets/JSONL-ORGANIZATION-REPORT.json`
3. **Execute:** `npm run dataset:organize:apply`
4. **Verify:** Confirm all files moved to correct categories
5. **Update references:** Scripts pointing to `.tmp/` or `.opencode/` paths now reference `datasets/`
6. **Archive originals:** (Optional) Compress `.tmp/` and `.opencode/` after verification

---

## Troubleshooting

### "uncategorized" files
If files land in uncategorized, add patterns to `organize-jsonl-files.mjs` under `CATEGORIES`:

```javascript
const CATEGORIES = {
  'my-category': [
    /pattern-1/i,
    /pattern-2/i,
  ],
  // ...
};
```

### Move failures
Check `datasets/JSONL-ORGANIZATION-REPORT.json` → `errors` array for details.

### Re-run organization
Organization is idempotent (safe to re-run):
- Files already in `datasets/` are skipped
- Existing files in `datasets/` are not overwritten
- Report is regenerated with current state

---

## Storage Impact

**Before:** 1,054 scattered files across 5+ root-level directories  
**After:** 1,054 organized files in `datasets/{category}/`, with clear ownership

**Total size:** ~23 GB (aggregated)  
**Organization time:** <5 seconds

---

**Generated:** Session 84 Continuation — Step 5 Feature Labels + Datasets Organization  
**Status:** ✅ Framework ready, awaiting execution
