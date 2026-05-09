# Codebase KG Vault

## Install plugins (community)
1. **Extended Graph** — `ElsaTam/obsidian-extended-graph` (primary view, tag/property coloring)
2. **Breadcrumbs** — `SkepticMystic/breadcrumbs` (typed-edge frontmatter → Juggl bridge)
3. **Juggl** — Cytoscape-backed graph view (use only on subgraphs, freezes >2k nodes)
4. **Dataview** — required by inline `key:: value` fields
5. **Graph Analysis** *(optional)* — co-citation + centrality overlays
6. **ExcaliBrain** *(optional)* — per-note relational map

## Configure Breadcrumbs
After enabling, copy `breadcrumbs.suggested.json` → `.obsidian/plugins/breadcrumbs/data.json`.
Hierarchies: `up: [up]  same: [same]  down: [contains]` and a flat `same: [imports]`.

## Open
- `index.md` — Mermaid top-N + cluster index
- `codebase.canvas` — full spatial map (cluster groups + orbiting files, JSON Canvas 1.0)
- `kg.canvas` — cluster↔cluster typed-edge subgraph (Juggl-loadable, ~100 nodes)

## Frontmatter schema (LLM-wiki 2026)
```yaml
type: file | cluster
aliases: [...]
tags: [...]
cluster_id / clusterId: <int>
pagerank: <float>          # numeric → "size by property" in Extended Graph
embedding_id: qdrant://codebase_chunks_768/<path>
last_updated_by_llm: <ISO>
ai-first: true
confidence: high | medium | low
# Breadcrumbs typed edges (rendered in Juggl):
up: ["[[Clusters/cluster-N]]"]
imports: ["[[Files/dep]]", ...]
contains: ["[[Files/member]]", ...]   # cluster notes only
```

## Dataview inline fields (in body)
- `cluster:: [[Clusters/cluster-N]]`
- `pagerank:: <float>`
- `imports:: [[Files/dep]]`
- `contains:: [[Files/member]]`