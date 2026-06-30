# After Colab Enrichment: Import & Embed

## Step 1: Download from Colab
- Download `enriched-clusters.jsonl` from Colab
- Save to: `C:\Users\james\Videos\deeds-web-app\enriched-clusters.jsonl` (workspace root)

## Step 2: Import to Postgres
```bash
cd sveltekit-frontend
npm run colab:import:cluster-summaries
```

**Output:**
- Updates `cluster_cards` table with enriched metadata
- Sets `status='enriched'`, `updated_at=NOW()`
- Stores: cluster_title, summary, entities, actions, risks, tags, ontology_text, kag_edges

## Step 3: Embed Ontology Text
```bash
npm run worker:embedding:batch:apply
```

**Output:**
- Embeds `ontology_text` via EmbeddingGemma (384-dim)
- Writes to Qdrant `cluster_cards_vectors` collection
- Creates `ontology_vector` lane for semantic search

## Step 4: Build Neo4j Edges (Optional)
```bash
npm run atlas:kag:ingest-from-clusters
```

**Output:**
- Creates Neo4j USES_ENTITY edges
- Creates BELONGS_TO_DOMAIN edges
- Links cluster entities to topology graph

## Verification

**Check Postgres:**
```bash
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT cluster_id, cluster_title, array_length(entities, 1) as entity_count
   FROM cluster_cards
   WHERE cluster_title IS NOT NULL
   LIMIT 10;"
```

**Check Qdrant vectors:**
```bash
curl -s http://127.0.0.1:6333/collections/cluster_cards_vectors | jq '.result.points_count'
```

**Check Neo4j edges:**
```bash
# At http://localhost:7474/browser:
MATCH ()-[r:USES_ENTITY]->() RETURN count(r) AS entity_edges
```

## Timeline
- Colab enrichment: 26-77 min (T4 GPU)
- Import: ~1 min (77 clusters)
- Embedding: ~3 min (EmbeddingGemma batch)
- Neo4j edges: ~2 min (Cypher ingestion)
- **Total after Colab:** ~7 min local work

## Troubleshooting

**enriched-clusters.jsonl not found**
- Verify file is in workspace root: `ls -la enriched-clusters.jsonl`
- Check file size: should be >50KB for 77 enriched clusters

**Postgres import fails**
- Check DB connection: `npm run atlas:smoke:packet-contract`
- Verify table exists: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\dt cluster_cards"`

**Embedding worker hangs**
- Verify Ollama is running: `curl http://localhost:11434/api/tags`
- Check EmbeddingGemma model available: should list `embeddinggemma:latest`
- Try with limit: `npm run worker:embedding:batch:apply --limit=10`