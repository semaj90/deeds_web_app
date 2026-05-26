# GraphRAG Recover

description: Recover task context through file discovery, Qdrant semantic search, graph expansion, and ACE context packs without stuffing raw files into prompts.

## Run Order

1. Discover files:

```powershell
rg --files -uu | rg "ClusterCard|GlyphRecord|CHR97|graph-refresh|pathway-cards|cluster-cards|ace-context-pack|feature-map"
```

2. Search anchors:

```powershell
rg -n -uu "ClusterCard|GlyphRecord|CHR97|semantic_path_synthesis|sourceRefs|featureMap|llm_context_cache|GraphRAG|pathway" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs
```

3. Read only small windows.
4. Use Qdrant, Redis ACE packs, and sourceRefs if exact search is weak.

## Return

- confirmed_paths
- sourceRefs
- commands
- graph_phase
- next_exact_command

## Forbidden

- Do not create new `.md` files.
- Do not read full files.
- Do not run broad audits.
- Do not stuff context into prompts.

Run it with:

```txt
/graphrag-recover continue ClusterCard / GraphRAG / ACE feature-map work
```

## Mapping

Startup:

- verify graphify daily
- verify ACE context pack
- verify feature-map compiler
- verify top-N retrieval cache

GraphRAG work:

- ClusterCard generation
- pathway cards
- graph refresh manifest
- DuckDB export verification
- ACE/Hermes consumers

Semantic recovery:

- Qdrant tags
- Redis ACE packs
- TurboVec candidates
- sourceRefs only

The key rule:

Startup validates.
GraphRAG builds.
ACE compresses.
Gemma4 synthesizes.
