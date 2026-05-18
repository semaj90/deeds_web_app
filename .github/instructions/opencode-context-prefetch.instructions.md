---
description: "OpenCode context prefetch policy for Karpathy/NES/Chrom retrieval."
---

# OpenCode Context Prefetch Policy

- Before any broad read or search, call `atlas.compact_context` with the current `path` or `query`.
- If `atlas.compact_context` is unavailable, fall back to `context.prefetch_feature_context` and keep the same compact shape.
- Treat the returned compact pack as the primary admission gate.
- Prefer curated retrieval lanes: `atlas.query`, `trace.kag_search`, `wiki.search`, `wiki.status`, `graph.expand_neighborhood`, `kag.multi_lane_search`, `trace.graphrag_search`, and `search.rerank`.
- Use semantic Qdrant tags, ACE hits, Karpathy blend scores, route maps, and AGENTS.md notes before reading more files.
- If the current file is known, pass it as `path`/`file_path` so the prefetch pack stays local.
- Do not sweep entire directories, repo-wide greps, or large file lists unless the prefetch result is empty or the user explicitly asks for broad search.
- Keep tool rounds short and focused; prefer top-k summaries over bulk ingestion.
- The compact packet should favor 5 to 10 chunks max, 5 sourceRefs max, one short summary, and a retrieval trace.
