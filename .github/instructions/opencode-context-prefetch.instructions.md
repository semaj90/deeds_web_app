---
description: "OpenCode context prefetch policy for Karpathy/NES/Chrom retrieval."
---

# OpenCode Context Prefetch Policy

- Before any broad read or search, call `atlas.compact_context` with the current `path` or `query`.
- If `atlas.compact_context` is unavailable, fall back to `context.prefetch_feature_context` and keep the same compact shape.
- Treat the returned compact pack as the primary admission gate.
- Prefer curated retrieval lanes: `atlas.query`, `trace.kag_search`, `wiki.search`, `wiki.status`, `graph.expand_neighborhood`, `kag.multi_lane_search`, `trace.graphrag_search`, and `search.rerank`.
- Use semantic Qdrant tags, ACE hits, Karpathy blend scores, route maps, and AGENTS.md notes before reading more files.
- Do not load entire `.md`, `.json`, `.jsonl`, `.log`, or generated graph files into context.
- Treat `.md` files as search targets, not raw context blobs. Prefer `rg -n` or section search helpers to find relevant headings, matched snippets, and local line windows.
- For large files:
  1. Use `rg -n "<query terms>" <path>` first.
  2. Read only the matched line window, max 40–80 lines.
  3. Summarize into: goal, relevant file, line ranges, chunk_ids, errors, and primary docs.
- Only read full markdown or large document content when the user explicitly asks for the document or a specific section.
- Avoid embedding entire `.md` files; summarize matched sections with sourceRefs instead.
- If the current file is known, pass it as `path`/`file_path` so the prefetch pack stays local.
- Do not sweep entire directories, repo-wide greps, or large file lists unless the prefetch result is empty or the user explicitly asks for broad search.
- For repo navigation, use `ripgrep` first.
- Before reading or editing any file:
  1. Run `pwd`.
  2. Run `rg --files | rg "<filename>$"`.
  3. If searching content, use:
     `rg "<pattern>" <known-active-root>`.
  4. Prefer active app root: `sveltekit-frontend/`.
  5. Do not assume `src/` exists at repo root.
  6. Do not ask the user for a path until `rg` confirms no match.
- Examples:
  - `rg --files | rg "context-assembler\.ts$"`
  - `rg "buildACEPromptCached|getAdaptiveTopK|ACP_MAX_RESULTS|top_k" sveltekit-frontend/src/lib/server/ace`
- Retrieval + cache discipline:
  - RedisVL SemanticCache → exact/semantic answer cache
  - Qdrant Hybrid Query API → dense + sparse candidate retrieval
  - FlagEmbedding / BGE reranker → top 40 candidates → final top 3–5
  - LangExtract → legal/entity/citation grounding
  - ACE prompt bundle → compiled system prompt cache for the current day
  - OpenAI prompt/completion cache → 24h replay keyed by stable prefix + user intent + day bucket
  - OpenAI route surface → `sveltekit-frontend/src/routes/api/v1/chat/completions/+server.ts`, `sveltekit-frontend/src/lib/server/ai/openai-facade.ts`, `sveltekit-frontend/src/lib/server/ai/cached-stream.ts`
- Best immediate docs to read first:
  1. Qdrant Hybrid Queries
  2. RedisVL SemanticCache
  3. BGE-Reranker docs
  4. Google LangExtract GitHub
- Keep tool rounds short and focused; prefer top-k summaries over bulk ingestion.
- The compact packet should favor 5 to 10 chunks max, 5 sourceRefs max, one short summary, and a retrieval trace.
