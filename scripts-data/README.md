# Cluster Enrichment Pipeline for Colab

## Files
- **colab-cluster-summary-batches.jsonl** — 77 clusters ready for enrichment
- **colab-enrich-clusters.py** — Python script for Google Colab (T4 GPU, 26-77 min)
- **import-cluster-summaries.mjs** — Import enriched results back to Postgres
- **COLAB-CLUSTER-ENRICHMENT-GUIDE.md** — Full pipeline documentation

## Quick Start

### Step 1: Google Colab Setup
1. Go to [colab.research.google.com](https://colab.research.google.com)
2. Create new notebook
3. Runtime → Change runtime type → **GPU** (T4 or better)
4. Upload `colab-cluster-summary-batches.jsonl`
5. Upload `colab-enrich-clusters.py`

### Step 2: Run Enrichment in Colab

**Cell 1:**
```python
!pip install -q transformers torch accelerate bitsandbytes
```

**Cell 2:**
```python
!python colab-enrich-clusters.py
```

**Output:** `enriched-clusters.jsonl`

### Step 3: Download & Import
1. Download `enriched-clusters.jsonl` from Colab
2. Place in workspace root: `deeds-web-app/enriched-clusters.jsonl`
3. Run: `npm run colab:import:cluster-summaries` (from sveltekit-frontend/)

## Performance
- **Colab T4**: 26-77 minutes for 77 clusters
- **Local RTX 3060 Ti**: ~5-10 minutes (if using `-ctk q8_0 -ctv q8_0`)

## What Gets Enriched
For each cluster:
- ✅ cluster_title (structured title)
- ✅ summary (2-3 sentence description)
- ✅ entities (extracted concepts: Lucia, session cookie, etc.)
- ✅ actions (extracted actions: validate session, read cookie, etc.)
- ✅ risks (identified risks: expired session handling, etc.)
- ✅ tags (semantic tags: auth, session, security, etc.)
- ✅ ontology_text (space-separated concepts for embedding)
- ✅ kag_edges (Neo4j relationship suggestions)

## After Import
```bash
npm run worker:embedding:batch:apply           # Embed summaries → Qdrant
npm run atlas:kag:ingest-from-clusters        # Create Neo4j edges
```

## Reference
See `COLAB-CLUSTER-ENRICHMENT-GUIDE.md` for full architecture, troubleshooting, and step-by-step instructions.
