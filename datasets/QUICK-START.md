# Datasets Quick Start

## Commands

```bash
cd sveltekit-frontend

# 1. Preview what will be organized (dry-run)
npm run dataset:organize

# 2. Actually organize files
npm run dataset:organize:apply

# 3. View inventory guide
npm run dataset:inventory

# 4. Check organization report
cat ../datasets/JSONL-ORGANIZATION-REPORT.json
```

## Directory Structure (After Organization)

```
datasets/
  ├── training-pairs/          # SFT/DPO fine-tuning data (150 files)
  ├── embeddings/              # Pre-computed vectors (50 files)
  ├── traces/                  # Execution traces & telemetry (100 files)
  ├── rag-metrics/             # RAG evaluation metrics (50 files)
  ├── atlas/                   # Packet state snapshots (300 files)
  ├── opencode/                # ACE packet registry (300 files)
  ├── audit/                   # AST analysis results (100 files)
  ├── README.md                # Full documentation
  ├── QUICK-START.md           # This file
  ├── JSONL-INVENTORY.md       # Inventory reference
  ├── organize-jsonl-files.mjs # Organization script
  └── JSONL-ORGANIZATION-REPORT.json  # Generated report
```

## Files Summary

| Category | Count | Size | Purpose |
|----------|-------|------|---------|
| training-pairs | 150 | ~1.2 GB | LLM fine-tuning (SFT/DPO) |
| embeddings | 50 | ~2.5 GB | Vector cache |
| traces | 100 | ~3.4 GB | Audit trail |
| rag-metrics | 50 | ~1.2 GB | Retrieval eval |
| atlas | 300 | ~4.6 GB | Packet state |
| opencode | 300 | ~5.7 GB | ACE packets |
| audit | 100 | ~2.3 GB | Analysis |
| **TOTAL** | **1,054** | **~23 GB** | Organized |

## Step 6 Integration

When Step 6 (Trace Export) runs, it will write to:

```
datasets/training-pairs/sft-pairs.jsonl      ← SFT dataset (good traces)
datasets/training-pairs/dpo-pairs.jsonl      ← DPO dataset (preference pairs)
datasets/traces/execution-traces.jsonl       ← Full trace audit
```

## Troubleshooting

**Q: Why dry-run first?**  
A: Preview ~1,054 moves before executing. Safer, no risk of data loss.

**Q: Can I re-run organization?**  
A: Yes, it's idempotent. Files already in `datasets/` won't move twice.

**Q: What if a file isn't categorized?**  
A: Check `JSONL-ORGANIZATION-REPORT.json` → `uncategorized` array. Add pattern to `organize-jsonl-files.mjs` and re-run.

**Q: Is it safe to delete original files?**  
A: After verifying all files moved successfully (check report), yes. But keep backups.

## See Also

- [Full Documentation](README.md)
- [Inventory Reference](JSONL-INVENTORY.md)
- [Step 5: Feature Labels](../docs/reports/production-hardening-step5-feature-labels-complete.md)
- [Step 6: Trace Export](../docs/reports/production-hardening-step6-trace-export.md) (coming soon)
