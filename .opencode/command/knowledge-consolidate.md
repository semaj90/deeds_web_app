# Knowledge Consolidate

description: Build document knowledge cards from atlas, JSON, Redis, and NES cards, embed them, graph them, and produce prune, archive, or production recommendations without stuffing raw files into prompts.

## Mission

Use LangExtract, HyperGraphRAG, dense search, Redis exact match, and ACE context packs to consolidate repo knowledge without stuffing raw files into prompts.

## Rules

- Do not read full files by default.
- Do not load raw large JSON into prompts.
- Use cards, summaries, sourceRefs, chunkIds, and graph links.
- Redis exact match first.
- Qdrant dense search second.
- LangExtract entities third.
- Hypergraph expansion fourth.
- Gemma4 sees compact ACE/NES cards only.

## Discovery

Run:

```powershell
rg --files -uu | rg "sidecar-audit-validated.json|codebase-atlas|codebase-atlas.min|cluster-cards|pathway-cards|graph-refresh-manifest|document-knowledge|kag-notes|docstore|nes|ace|feature-map"
```

Then:

```powershell
rg -n -uu "ClusterCard|PathwayCard|FeatureMap|GlyphRecord|CHR97|sourceRefs|chunkIds|clusterTags|featureLabels|llm_context_cache|ace:ctx|semantic_path_synthesis" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs sveltekit-frontend/memory
```

## Build

Create or update:

- `sveltekit-frontend/scripts/knowledge/build-document-knowledge-layer.mjs`
- `sveltekit-frontend/scripts/knowledge/langextract-document-cards.mjs`
- `sveltekit-frontend/scripts/knowledge/graph-document-knowledge-layer.mjs`
- `sveltekit-frontend/scripts/knowledge/embed-document-knowledge-layer.mjs`
- `sveltekit-frontend/scripts/knowledge/smoke-document-knowledge-layer.mjs`
- `sveltekit-frontend/scripts/knowledge/smoke-document-knowledge-embed.mjs`
- `sveltekit-frontend/scripts/knowledge/synthesize-document-knowledge-layer.mjs`
- `sveltekit-frontend/scripts/knowledge/smoke-document-knowledge-synthesis.mjs`

Outputs:

- `sveltekit-frontend/memory/knowledge/document-knowledge-cards.jsonl`
- `sveltekit-frontend/memory/knowledge/document-knowledge-edges.jsonl`
- `sveltekit-frontend/memory/knowledge/document-knowledge-manifest.json`

## Retrieval Strategy

1. Redis exact card lookup
2. Qdrant dense vector card search
3. LangExtract entity extraction
4. Hypergraph neighborhood expansion
5. TurboVec optional rerank
6. ACE context pack synthesis

## Output

Return:

- cards_built
- qdrant_upserts
- redis_keys
- graph_edges
- prune_candidates
- archive_to_deeds_lab
- production_ready
- next_exact_command

## Implementation phases

### Phase A — Normalize cards

Input sources:

```txt
docs/atlas-index/codebase-atlas.min.json
memory/docstore/manifest.json
memory/kag-notes/manifest.json
memory/exports/cluster-cards.jsonl
memory/exports/pathway-cards.jsonl
sidecar-audit-validated.json
ACE context packs
Redis retrieval cards
```

Output:

- `memory/knowledge/document-knowledge-cards.jsonl`

### Phase B — Add LangExtract

For each card summary, extract:

- files
- routes
- tables
- env vars
- services
- commands
- models
- ports
- feature names

### Phase C — Embed to Qdrant

Collection:

- `document_knowledge_768`

Payload:

- `cardId`
- `kind`
- `featureLabels`
- `sourceRefs`
- `chunkIds`
- `clusterTags`
- `lifecycle.status`
- `commands`

Vector:

- `EmbeddingGemma 768d`

### Phase D — Redis exact cache

Keys:

- `knowledge:card:<cardId>`
- `knowledge:query:<queryHash>`
- `knowledge:feature:<featureLabel>`
- `knowledge:prune:candidates`
- `knowledge:archive:deeds_lab`

### Phase E — Hypergraph edges

Output:

- `memory/knowledge/document-knowledge-edges.jsonl`

Relations:

- `implements`
- `duplicates`
- `depends_on`
- `replaces`
- `archives_to`
- `uses_model`
- `uses_port`
- `uses_table`
- `uses_env`

### Phase F — Prune/archive decisions

Statuses:

- `active`
- `candidate_prune`
- `archive_to_deeds_lab`
- `production_ready`

Rules:

- `candidate_prune` when duplicate feature implementation, stale script replaced by newer launcher, docs point to dead ports, no sourceRefs, or no active commands/tests
- `archive_to_deeds_lab` for experimental CUDA/RNN/cuVS trials, old research docs, non-production notebooks, or deprecated launchers
- `production_ready` when it has tests, sourceRefs, startup smoke, stable port/env contract, and appears in ACE context pack

## Package scripts

Add:

```json
"knowledge:documents:build": "node scripts/knowledge/build-document-knowledge-layer.mjs",
"knowledge:documents:langextract": "node scripts/knowledge/langextract-document-cards.mjs",
"knowledge:documents:graph": "node scripts/knowledge/graph-document-knowledge-layer.mjs",
"knowledge:documents:embed": "node scripts/knowledge/embed-document-knowledge-layer.mjs",
"knowledge:documents:smoke": "node scripts/knowledge/smoke-document-knowledge-layer.mjs",
"knowledge:documents:embed:smoke": "node scripts/knowledge/smoke-document-knowledge-embed.mjs",
"knowledge:documents:report": "node scripts/knowledge/report-document-knowledge-layer.mjs",
"knowledge:documents:synthesize": "node scripts/knowledge/synthesize-document-knowledge-layer.mjs",
"knowledge:documents:synthesize:smoke": "node scripts/knowledge/smoke-document-knowledge-synthesis.mjs",
"knowledge:documents:refresh": "npm run knowledge:documents:build && npm run knowledge:documents:langextract && npm run knowledge:documents:graph && npm run knowledge:documents:embed && npm run knowledge:documents:smoke && npm run knowledge:documents:embed:smoke && npm run knowledge:documents:report && npm run knowledge:documents:synthesize && npm run knowledge:documents:synthesize:smoke"
```

## What to cache next

Redis:

- card pointer
- query hash → top card IDs
- feature label → card IDs
- prune candidates
- archive candidates

Postgres:

- llm_context_cache audit rows
- knowledge card metadata
- lifecycle decisions

Qdrant:

- card summaries
- feature-map summaries
- pathway summaries
- sidecar summaries
- document knowledge summaries

SeaweedFS/NVMe:

- full JSONL card snapshots
- full edge snapshots
- manifest snapshots

## Final mental model

- simdjson/libtorch = fast parsing + tensor/vector tooling
- LangExtract = entities
- Qdrant = semantic similarity
- Redis = exact/hot card cache
- Postgres JSONB = durable truth + schema contract
- HyperGraphRAG = multi-hop relationships
- ACE/NES = compact prompt cartridge
- Gemma4 = final synthesis and recommendations
- Document knowledge = card-based prune/archive/production triage
