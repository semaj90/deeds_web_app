# Colab Enrichment: Two Options Merged

## Quick Decision Matrix

| Aspect | Version 1 (Enrichment) | Version 2 (Summarization) | Recommendation |
|--------|------------------------|--------------------------|-----------------|
| **Clusters** | 77 (topology-based) | 100 (feature-based) | V2 (more coverage) |
| **Packets** | 0 (empty) | 12,944 (actual) | V2 (real data) |
| **Model** | Gemma4 E4B structured | Gemma4 E4B simple | V2 (faster) |
| **Output fields** | entities, actions, risks, tags, ontology_text, kag_edges | cluster_id, feature_id, summary | V2 (1-2 hrs) |
| **Time** | 26-77 min | 1-2 hrs | V1 if urgent |
| **Db import** | Full cluster_cards enrichment | Merge with existing | V2 then V1 |

**RECOMMENDATION: Use Version 2 (V2) → Optionally follow with Version 1 (V1)**

---

## OPTION 1: Version 1 (Structured Enrichment — 77 clusters)

**When:** If you want rich metadata (entities, actions, risks, ontology_text)

**File:** `colab-cluster-summary-batches.jsonl`

**Script:** `colab-enrich-clusters.py`

**In Colab:**
```python
!pip install -q transformers torch accelerate bitsandbytes
!python colab-enrich-clusters.py
```

**Output:** 77 enriched clusters with:
- cluster_title
- summary (2-3 sentences)
- entities (Lucia, session cookie, etc.)
- actions (validate session, etc.)
- risks (expired session handling, etc.)
- tags (auth, session, security, etc.)
- ontology_text (space-separated concepts for embedding)
- kag_edges (Neo4j suggestions)

**Time:** 26-77 min

**Import:** `npm run colab:import:cluster-summaries`

---

## OPTION 2: Version 2 (Simple Summarization — 100 clusters, 12,944 packets)

**When:** If you want fast packet coverage with Gemma4 summaries

**File:** `clusters-v2-100clusters.jsonl`

**Script:** `colab-summarize-v2.py`

**In Colab:**
```python
!pip install -q transformers torch bitsandbytes accelerate
!python colab-summarize-v2.py
```

**Output:** 100 clusters with:
- cluster_id
- feature_id
- feature_label
- summary (2-3 sentences)
- model ("gemma-4-E4B-it")
- timestamp

**Time:** 1-2 hrs (99 clusters instead of 77)

**Import:** Custom script (summary-only merge to cluster_cards or new table)

---

## RECOMMENDED WORKFLOW: V2 → V1 (Sequential Enrichment)

### Phase 1: Run Version 2 (Fast Coverage)
```
Upload: clusters-v2-100clusters.jsonl + colab-summarize-v2.py
Run colab-summarize-v2.py (1-2 hrs)
Download: summaries-gemma4-e4b.jsonl
```

✅ Covers 100 feature clusters with 12,944 packets
✅ Gemma4 basic summaries
✅ Fast 1-2 hour Colab run

### Phase 2: Run Version 1 (Rich Enrichment)
```
Upload: colab-cluster-summary-batches.jsonl + colab-enrich-clusters.py
Run colab-enrich-clusters.py (26-77 min)
Download: enriched-clusters.jsonl
```

✅ Deep enrichment (entities, actions, risks, tags, ontology_text, kag_edges)
✅ 77 clusters with full metadata
✅ Ready for ACE/KAG/RAG context assembly

### Phase 3: Local Import (Both)
```bash
# Import V2 results (if created a summary table or upsert to cluster_cards)
# Custom merge script needed

# Import V1 results
npm run colab:import:cluster-summaries

# Embed summaries
npm run worker:embedding:batch:apply

# Build Neo4j edges
npm run atlas:kag:ingest-from-clusters
```

---

## Hybrid Strategy: Best of Both

**If running both versions:**

1. **V2 first** (1-2 hrs) — covers 100 feature clusters, 12,944 packets
   - Provides coverage across the codebase
   - Basic Gemma4 summaries for quick context
   
2. **V1 second** (26-77 min) — enriches 77 topology clusters
   - Deep metadata extraction (entities, actions, risks, tags)
   - Ontology vectors for semantic search
   - Neo4j KAG edges for topology linking

**Total Colab time:** 2-3.5 hrs

**Result:** 
- 100 feature clusters summarized (V2)
- 77 topology clusters richly enriched (V1)
- Dual-layer retrieval (fast summaries + semantic search)

---

## File Comparison

### Version 1 Sample
```json
{
  "cluster_id": "cluster:auth-session-041",
  "cluster_title": "Authentication Session Validation",
  "summary": "Validates user sessions, cookies, and protected route access.",
  "entities": ["Lucia", "session cookie", "user_id"],
  "actions": ["validate session", "read cookie", "reject unauthorized access"],
  "risks": ["expired session handling", "cookie mismatch"],
  "tags": ["auth", "session", "sveltekit", "security"],
  "ontology_text": "authentication session cookie validation protected route Lucia",
  "kag_edges": [["belongs_to_domain", "authentication"], ["uses_entity", "Lucia"]]
}
```

### Version 2 Sample
```json
{
  "cluster_id": "feature:0:scripts.+server.ts",
  "feature_id": "scripts.+server.ts",
  "feature_label": "+server.ts.any-backup",
  "packet_count": "2397",
  "packet_keys": ["packet:804f1ddb2044", "packet:fb920cf6e638", ...],
  "sample_packets": ["packet:804f1ddb2044", "packet:fb920cf6e638", ...]
}
```

→ After Colab adds summary:
```json
{
  "cluster_id": "feature:0:scripts.+server.ts",
  "feature_id": "scripts.+server.ts",
  "feature_label": "+server.ts.any-backup",
  "summary": "Contains SvelteKit server-side route handlers for API endpoints...",
  "model": "gemma-4-E4B-it",
  "timestamp": "2026-06-30T10:45:00"
}
```

---

## Next Steps

**CHOOSE ONE:**
1. **Option A:** Start with V2 (1-2 hrs, 100 clusters, basic summaries)
2. **Option B:** Start with V1 (26-77 min, 77 clusters, rich enrichment)
3. **Option C (RECOMMENDED):** Start V2, then run V1 (2-3.5 hrs, best coverage)

**Files ready in scripts-data/:**
- `clusters-v2-100clusters.jsonl` (for V2)
- `colab-summarize-v2.py` (for V2)
- `colab-cluster-summary-batches.jsonl` (for V1)
- `colab-enrich-clusters.py` (for V1)

Upload whichever version(s) you choose to Google Colab and run.
