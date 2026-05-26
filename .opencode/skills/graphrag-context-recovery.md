---
description: GraphRAG context recovery using rg, glob, Qdrant, ACE packets, and sourceRefs
mode: subagent
temperature: 0.1
---

# GraphRAG Context Recovery Skill

## Core Rule

Do not stuff raw context into prompts.

Recover semantic meaning through:

1. file discovery
2. exact lexical search
3. small line windows
4. Qdrant semantic retrieval
5. graph expansion
6. ACE context pack synthesis

## Do Not Do

- Do not create a new `.md` planning file unless explicitly requested.
- Do not read full files by default.
- Do not load giant JSON/atlas/graph maps into the prompt.
- Do not use `read` on guessed paths.
- Do not summarize the whole repo.
- Do not claim completion without sourceRefs and commands.

## Retrieval Order

Always use this order:

```txt
glob / rg --files
→ rg -n exact anchors
→ awk / PowerShell small line window
→ Qdrant semantic search
→ graph/neighborhood expansion
→ ACE context pack
→ Gemma4 synthesis
```

## File Discovery

Use filename discovery before content grep:

```powershell
rg --files -uu | rg "ClusterCard|GlyphRecord|CHR97|graph-refresh|pathway-cards|cluster-cards|ace-context-pack|feature-map"
```

Fallback:

```powershell
Get-ChildItem -Recurse -Force -File -Include *.ts,*.mjs,*.md,*.json | Select-Object -ExpandProperty FullName
```

## Exact Search

After paths are known:

```powershell
rg -n -uu "ClusterCard|GlyphRecord|CHR97|semantic_path_synthesis|sourceRefs|featureMap|llm_context_cache" sveltekit-frontend/src sveltekit-frontend/scripts sveltekit-frontend/docs
```

## Small Context Windows

PowerShell:

```powershell
Get-Content path\to\file.ts | Select-Object -Skip 120 -First 80
```

Bash/awk:

```bash
awk 'NR>=120 && NR<=200 {print NR ":" $0}' path/to/file.ts
```

## Semantic Recovery

If exact search fails:

1. use Qdrant tags
2. use Redis ACE context packs
3. use codebase atlas summaries
4. use feature labels
5. use did-you-mean cosine retrieval
6. only then propose next steps

## Knowledge Consolidation

When the task is fuzzy, cross-cutting, or archive-oriented:

1. build compact knowledge cards from JSON cards, atlas summaries, NES cards, and Redis cards
2. recover entities with LangExtract instead of stuffing raw documents into prompts
3. use exact Redis lookup for known cards and query hashes
4. use Qdrant dense search for related cards, features, and pathways
5. expand across graph and hypergraph links before synthesizing
6. return prune, archive-to-deeds-lab, or production-ready recommendations only from sourceRefs-backed cards

Card inputs should be compact:

- parent atlas cards
- sidecar audit cards
- Redis exact-match cards
- NES cards
- JSON cards
- cluster cards
- pathway cards
- feature-map cards

Preferred outputs:

- knowledge card summaries
- graph links
- prune candidates
- archive candidates
- production-ready candidates

## ACE Packet Requirements

Every final answer should return:

- sourceRefs
- chunkIds
- summaryIds
- commands
- nextActions
- degraded

## Startup Rule

VS Code startup may run smokes and refreshes, but must not do heavy rebuilds unless stale.

Allowed on startup:

- service health
- graphify:daily with cooldown
- ACE context-pack smoke
- top-N retrieval smoke
- feature-map smoke
- sidecar health

Not allowed on every startup:

- full graph rebuild
- manual roadmap creation
- large markdown consolidation
- DuckDB promotion
- schema migration

## GraphRAG Phase Discipline

Use these phases:

1. structural path search
2. semantic/vector hydration
3. SOM/topology expansion
4. pathway/cluster card materialization

## Output Contract

Return:

- status
- confirmed_paths
- sourceRefs
- retrieval_method
- graph_phase
- files_changed
- tests_run
- next_exact_command
