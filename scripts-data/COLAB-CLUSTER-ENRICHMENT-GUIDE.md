# Google Colab Cluster Enrichment Pipeline

## Goal
Enrich cluster cards with structured metadata (summary, entities, actions, risks, tags) using Gemma-4-E4B-it on Google Colab's free T4 GPU.

## Architecture

```
Local:
  ├─ graphify:cluster-cards:generate
  │  └─ cluster-cards.jsonl (~77 clusters)
  ├─ export-cluster-summary-batches.mjs
  │  └─ colab-cluster-summary-batches.jsonl (structured for Colab)
  │
Colab (T4 GPU):
  ├─ Load google/gemma-4-E4B-it (4-bit, ~3.8GB)
  ├─ Enrich 77 clusters in parallel
  │  └─ For each cluster:
  │     ├─ Extract domain, ontology_terms, sample_texts
  │     ├─ Call Gemma4 E4B: generate title + summary + entities + actions + risks
  │     └─ Validate JSON output
  ├─ Output: enriched-clusters.jsonl
  │
Local:
  ├─ import-cluster-summaries.mjs enriched-clusters.jsonl
  │  └─ Update cluster_cards table with:
  │     ├─ cluster_title
  │     ├─ summary
  │     ├─ entities (Lucia, session cookie, etc)
  │     ├─ actions (validate session, read cookie, etc)
  │     ├─ risks (expired session handling, etc)
  │     ├─ ontology_text (space-separated for embedding)
  │     └─ kag_edges (Neo4j suggestions)
  │
  ├─ worker:embedding:batch:apply
  │  └─ Embed ontology_text via EmbeddingGemma
  │     └─ Qdrant ontology_vector + summary_vector
  │
  ├─ atlas:kag:ingest-from-clusters
  │  └─ Create Neo4j KAG edges from entities/actions
  │
Ready: ACE/KAG/DAG agent workflows
```

## Step 1: Generate Cluster Cards (Local)

```bash
cd /c/Users/james/Videos/deeds-web-app

# Generate clusters from existing topology/Neo4j
npm run graphify:cluster-cards:generate

# Validate clusters
npm run graphify:cluster-cards:validate

# Count clusters
grep -c "cluster_id" sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl
# → ~77 clusters expected
```

**Output:** `sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl`

## Step 2: Export for Colab (Local)

```bash
cd /c/Users/james/Videos/deeds-web-app

node sveltekit-frontend/scripts/atlas/export-cluster-summary-batches.mjs \
  --input sveltekit-frontend/memory/cluster-cards/cluster-cards.jsonl \
  --output colab-cluster-summary-batches.jsonl
```

**Output:** `colab-cluster-summary-batches.jsonl` (structured JSONL for Colab)

**Format per line:**
```json
{
  "cluster_id": "cluster:auth-session-041",
  "member_packet_ids": ["p1", "p2", "p3"],
  "source_refs": ["src/lib/server/auth/session.ts:44-91"],
  "directory_paths": ["src/lib/server/auth"],
  "feature_ids": ["auth.session.validation"],
  "domain": "authentication",
  "ontology_terms": ["session", "cookie", "Lucia"],
  "sample_texts": ["..."],
  "member_count": 42
}
```

## Step 3: Colab Setup & Enrichment

### 3a. Open Google Colab

1. Go to [colab.research.google.com](https://colab.research.google.com)
2. Create new notebook
3. Runtime → Change runtime type → **GPU** (T4 or better)
4. Upload `colab-cluster-summary-batches.jsonl`
5. Upload `sveltekit-frontend/colab-enrich-clusters.py`

### 3b. Cell 1: Install Dependencies

```python
!pip install -q transformers torch accelerate bitsandbytes
```

### 3c. Cell 2: Run Enrichment

```bash
!python colab-enrich-clusters.py
```

**What it does:**
1. Loads google/gemma-4-E4B-it (4-bit quantized, ~3.8GB)
2. For each cluster:
   - Generates: title, summary, entities, actions, inputs, outputs, risks, tags
   - Validates JSON output
3. Outputs: `enriched-clusters.jsonl`

**Time:** ~10-45 minutes for 77 clusters on T4
- Depends on sample text size (short prompts = faster)
- ~30 seconds per cluster = ~35 min for 77 clusters

### 3d. Download Results

- Download `enriched-clusters.jsonl` from Colab

**Format per line:**
```json
{
  "cluster_id": "cluster:auth-session-041",
  "cluster_title": "Authentication Session Validation",
  "summary": "Validates user sessions, cookies, and protected route access.",
  "domain": "authentication",
  "feature_label": "Auth Session Validation",
  "entities": ["Lucia", "session cookie", "user_id"],
  "actions": ["validate session", "read cookie", "reject unauthorized access"],
  "inputs": ["request cookies"],
  "outputs": ["session user", "401 response"],
  "risks": ["expired session handling", "cookie mismatch"],
  "tags": ["auth", "session", "sveltekit", "security"],
  "ontology_text": "authentication session cookie validation protected route Lucia user session",
  "kag_edges": [["belongs_to_domain", "authentication"], ["uses_entity", "Lucia"]],
  "model": "google/gemma-4-E4B-it"
}
```

## Step 4: Import Enriched Clusters (Local)

```bash
cd /c/Users/james/Videos/deeds-web-app

# Copy enriched-clusters.jsonl to sveltekit-frontend/
cp enriched-clusters.jsonl sveltekit-frontend/

# Import (dry-run first)
npm run colab:import:cluster-summaries:dry

# Apply
npm run colab:import:cluster-summaries
```

**What it does:**
1. Updates `cluster_cards` table with:
   - cluster_title, summary, entities, actions, risks, tags
   - ontology_text (space-separated concepts)
   - kag_edges (Neo4j suggestions)

## Step 5: Embed Summaries (Local)

```bash
# Embed ontology_text via EmbeddingGemma
npm run worker:embedding:batch:apply
```

**Output:**
- Qdrant: new vector lane `ontology_vector` (384-dim)
- Stored in `cluster_cards_vectors` collection

## Step 6: Build KAG Edges (Local)

```bash
# Create Neo4j edges from cluster entities/actions (TODO)
npm run atlas:kag:ingest-from-clusters
```

**Output:**
- Neo4j: edges like `USES_ENTITY`, `HAS_ACTION`, `BELONGS_TO_DOMAIN`

## Step 7: Verify & Test

```bash
# Check cluster cards
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT cluster_id, cluster_title, array_length(entities, 1) as entity_count
   FROM cluster_cards
   WHERE cluster_title IS NOT NULL
   LIMIT 10;"

# Check embeddings
curl -s http://127.0.0.1:6333/collections/cluster_cards_vectors | jq '.result.points_count'
```

## Performance

| Stage | Local Time | Colab Time | Notes |
|-------|-----------|-----------|-------|
| Generate clusters | ~5 min | — | graphify:cluster-cards:generate |
| Export batches | ~1 min | — | local JSONL generation |
| Enrich (77 clusters) | — | ~10-45 min | Depends on sample text size |
| Import enriched | ~1 min | — | Postgres update |
| Embed ontology | ~3 min | — | EmbeddingGemma batch |
| Build Neo4j edges | ~2 min | — | Cypher ingestion |
| **Total** | **~12 min** | **~10-45 min** | **~22-57 min end-to-end** |

## Troubleshooting

### Colab Model Download Fails
- Use local Ollama fallback: `gemma4:latest` via Ollama HTTP API
- Script auto-detects and falls back

### JSON Parse Error
- Script validates JSON before import
- Malformed lines are skipped with warning
- Check `enriched-clusters.jsonl` manually for syntax errors

### Postgres Import Fails
- Verify DB connection: `npm run atlas:smoke:packet-contract`
- Check table exists: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt cluster_cards"`

### Embeddings Don't Match Clusters
- Ensure `ontology_text` is not empty: `SELECT cluster_id, ontology_text FROM cluster_cards LIMIT 5`
- Re-run embedding worker: `npm run worker:embedding:batch:apply --limit=10`

## Architecture Notes

**Truth lives locally:**
- `cluster_cards.cluster_id` (Postgres)
- `cluster_cards.directory_paths` (Postgres)
- `cluster_cards.feature_ids` (Postgres)

**Colab enriches only:**
- `cluster_cards.summary` (Colab → Local)
- `cluster_cards.entities` (Colab → Local)
- `cluster_cards.actions` (Colab → Local)
- `cluster_cards.ontology_text` (Colab → Local)

**Local mirrors for search:**
- Qdrant: `ontology_vector` + `summary_vector` multivectors
- Neo4j: `USES_ENTITY`, `HAS_ACTION`, `BELONGS_TO_DOMAIN` edges
- Redis: hot cluster cards for ACE context

## Next: ACE/KAG/DAG Workflows

Once enriched, cluster cards feed into:

```
query → ACE context assembly
  ├─ Find relevant clusters (semantic search)
  ├─ Load cluster entities/actions
  ├─ Expand via Neo4j KAG edges
  └─ Compile context for Gemma4

→ Gemma4 reasoning
  ├─ Analyze cluster entities
  ├─ Determine agent actions
  └─ Generate task plan

→ DAG execution
  ├─ Parallel cluster-scoped subtasks
  ├─ Use cluster features for routing
  └─ Aggregate results
```

Ready for agentic workflows! ✅