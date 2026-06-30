# Parent Atlas GPU Enrichment — Colab Workflow

**Status**: ✅ Export complete (398MB, 58,304 packets + 7,530 summaries)

## Quick Start (30 seconds)

### Step 1: Upload to Google Drive
```
Local: C:\Users\james\Videos\deeds-web-app\.tmp\colab-parent-atlas\
       ├─ atlas_packets.ndjson (104MB)
       ├─ atlas_summary_layers.ndjson (82MB)
       ├─ packet_features.ndjson (26MB)
       ├─ atlas_feature_envelopes.ndjson (38MB)
       ├─ atlas_tree_nodes.ndjson (104MB)
       └─ parent-atlas-selected.dump (48MB, optional)

To Google Drive:
1. Open drive.google.com
2. Create folder: MyDrive/colab-parent-atlas/
3. Upload all NDJSON files
```

### Step 2: Use Colab Notebook
```
1. Download: colab-parent-atlas-notebook.ipynb (from workspace root)
2. Go to colab.research.google.com
3. File → Upload notebook
4. Select the notebook file
5. Runtime → Change runtime type → GPU (T4)
```

### Step 3: Run Enrichment
**Cell 1:** Install dependencies
```python
!pip install -q pandas numpy transformers torch bitsandbytes accelerate duckdb
```

**Cell 2:** Mount Google Drive
```python
from google.colab import drive
drive.mount('/content/drive')
```

**Cell 3:** Load data (updates DATA_DIR path if needed)
```python
# Edit path if your folder structure differs
DATA_DIR = Path('/content/drive/MyDrive/colab-parent-atlas')
```

**Cell 4:** Load model
```python
# Loads google/gemma-4-E4B-it (4-bit, ~3.8GB)
```

**Cell 5:** Enrich packets
```python
# Generates summaries for batch of packets
# Times: ~5-10 sec per packet on T4
```

**Cell 6:** Save results
```python
# Outputs: parent-atlas-enriched.ndjson
```

**Cell 7:** Download
```python
# Downloads results back to local machine
```

## Expected Results

**Input**: 58,304 packets
**Processing**: Batch enrichment with Gemma4
**Output**: `parent-atlas-enriched.ndjson`

Schema:
```json
{
  "packet_key": "ace:packet:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "feature_id": "auth.sessions",
  "summary": "Handles Lucia session validation and cookie-based auth flows...",
  "model": "gemma-4-E4B-it",
  "enriched_at": "2026-06-30T10:45:00"
}
```

## Time Estimates

- **First 10 packets (test)**: ~2-3 min (includes model loading)
- **100 packets**: ~10-15 min
- **1,000 packets**: ~100-150 min (1.5-2.5 hrs)
- **Full 58,304 packets**: ~5-8 hours (break into batches)

**Recommendation**: Process in batches of 1,000-5,000 packets per Colab run to avoid timeouts.

## Local Import (After Download)

```bash
cd sveltekit-frontend

# Dry-run
npm run atlas:colab:import:dry parent-atlas-enriched.ndjson

# Apply (merges enrichment back to Postgres)
npm run atlas:colab:import parent-atlas-enriched.ndjson
```

This updates `atlas_packets` with Colab-generated summaries while keeping Postgres as canonical truth.

## File Reference

| File | Size | Rows | Purpose |
|------|------|------|---------|
| atlas_packets.ndjson | 104MB | 58,304 | Core packet identity |
| atlas_summary_layers.ndjson | 82MB | 7,530 | Pre-computed summaries |
| packet_features.ndjson | 26MB | 58,304 | Feature vectors (384-dim) |
| atlas_feature_envelopes.ndjson | 38MB | 58,304 | Feature metadata |
| atlas_tree_nodes.ndjson | 104MB | 105,404 | Topology hierarchy |
| parent-atlas-selected.dump | 48MB | Full DB | PostgreSQL backup (optional) |

## Tips

1. **Batch processing**: Split 58K packets into 5-10K chunks
2. **Save checkpoints**: Download intermediate results every 1K packets
3. **Monitor GPU**: Colab notebooks show GPU/RAM usage in runtime
4. **Timeout protection**: Set max iterations to avoid session timeout
5. **Cache model**: Load model once, reuse across batches (model will be unloaded between cells — reload at top)

## Architecture Notes

**Postgres = Truth**
- All enrichment derived from local Postgres
- Colab outputs are **derived only**
- No writes to Postgres from Colab

**Colab as GPU Worker**
- Loads packets + summaries from NDJSON exports
- Uses GPU for Gemma4 inference
- Produces enrichment (summaries, embeddings, scores)
- Downloads results as new NDJSON

**Local Import**
- Merges Colab results into Postgres
- Updates relevant tables (atlas_packets, atlas_summary_layers)
- Maintains audit trail

## Troubleshooting

**Model download fails**
- Check internet connection in Colab
- Verify HuggingFace token if needed: `huggingface-cli login`
- Fallback: Use Ollama gemma4:latest (slower)

**GPU out of memory**
- Reduce batch size (e.g., 10 → 5 packets per call)
- Clear cache between batches: `torch.cuda.empty_cache(); gc.collect()`
- Split into separate notebook runs

**Data not loading**
- Verify file paths in DATA_DIR
- Check Google Drive permissions
- Ensure all NDJSON files are uploaded

## Next Steps

1. ✅ Export complete → files in `.tmp/colab-parent-atlas/`
2. → Upload NDJSON files to Google Drive
3. → Run Colab notebook (use template provided)
4. → Download `parent-atlas-enriched.ndjson`
5. → Run local import: `npm run atlas:colab:import parent-atlas-enriched.ndjson`

---

**VS Code Google Colab Extension** (Optional)
```
1. Install: Extensions → Search "Google Colab"
2. Open .ipynb file in VS Code
3. Click Colab kernel selector (top right)
4. Sign in with Google account
5. Run cells directly from VS Code
```
