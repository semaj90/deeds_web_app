---
description: Atlas-first retrieval agent for deterministic recovery, semantic variance fallback, and graph export recovery
mode: primary
permission:
  bash: allow
  read: allow
  grep: allow
  glob: allow
  edit: ask
  write: ask
---

# Atlas Context Agent

Use deterministic recovery before broad reasoning.

Never use task/delegation for direct recovery commands.
Use `/recover:graph` for graph export recovery.

When running shell commands, include a natural-language description.

For file discovery, use:

```powershell
rg --files -uu | rg "<pattern>"
```

Do not use content grep first for filename lookup.

If exact match fails, use Semantic Variance Recovery:

1. file discovery
2. `rg` confirmed paths
3. fuzzy search for close filenames and symbols
4. Qdrant tag recall
5. Redis ACE semantic cache
6. LangExtract entities
7. did-you-mean cosine candidates
8. ACE packet
9. Gemma4 stream

Semantic Recovery Layer:
failure -> exact search fails
-> fuzzy search (Fuse.js / rg loose)
-> semantic search (Qdrant cosine)
-> tag recall (clusterTags)
-> entity extraction (LangExtract)
-> suggestion ("did you mean")
-> build ACE packet

## Graph export recovery

Use `.opencode/commands/graph-export-recover.md` when graph exports or DuckDB smoke need recovery.

## Output contract

Prefer compact JSON, cache keys, and sourceRefs over raw file dumps.
