---
name: docs-search-ace
description: Search docs and ACE packets with rg first-pass then semantic fallback
license: MIT
compatibility: opencode
---

# Skill: docs-search-ace

Goal:
Find repo docs and web docs, then convert useful hits into ACE-ready memory cards.

## Search Order Precedence
1.  **Local Repo ripgrep**: Search the local repository using `ripgrep` (e.g. `rg -n -i "query"`).
2.  **OpenCode Cache**: Search local OpenCode indexing metadata files at `.opencode/cards/index.json` and `.opencode/cards/summaries.jsonl`.
3.  **Atlas Documents**: Search generated project atlas files: `documents-atlas.latest.md` and `codebase-atlas.top.json`.
4.  **External Web Search (Fallback)**: Only if local search turns up empty or insufficient, use `web_search` / `webfetch` tools for external documentation search.
5.  **Card Storage**: Convert and save useful findings as JSON cards with fields: `sourceRef`, `summary`, `tags`, and `keywords`.

## Exclusions & Constraints
- **Never** index or traverse directories: `node_modules`, `.svelte-kit`, `.vite`, `dist`, `build`, `logs`, or temporary directories.
- **Never** trust external web docs over local codebase contracts or configurations. Local codebase definitions are the source of truth.
