# Proposal: SvelteKit 2 docs corpus analysis

## Why

The pinned SvelteKit docs under `docs/.okf/pinned/sveltekit/` (raw pages plus `chunks.jsonl`) are reference material for the app. They have no structured analysis yet: no term ranking, no section grouping, no query top-k over a hierarchy, and no reviewed domain labels. This change adds an offline analysis pipeline for that corpus only.

## What

An offline, read-only analysis pipeline that:

1. Builds a corpus manifest from the pinned raw pages, with sha256 for each file.
2. Builds the navigation hierarchy (sections, then pages) from the docs' own table of contents.
3. Extracts identifier-aware terms and n-grams, and ranks top terms per section and per page.
4. Proposes domain labels (advisory, unreviewed) and groups pages by section.
5. Serves top-k search over the chunks, with paginated results and a hierarchy filter.
6. Writes receipts with checksums under `.tmp/atlas/` or `docs/reports/`.

## Capabilities

- `sveltekit-docs-corpus-analysis`: offline manifest, hierarchy, lexical analysis, advisory grouping, and top-k retrieval over the pinned SvelteKit documentation corpus.

## Non-goals

- No Postgres, Qdrant, Valkey, or Neo4j writes.
- No embedding pass and no classifier training.
- No admission into ACE, ContextManifest, or Graphify.
- No change to the pinned corpus files.

## Authority

- Corpus files are source material. Their checksums are the identity.
- NLP entities, n-grams, and domain labels are proposals with status `PROPOSED_NOT_ADMITTED`.
- Ranking results are retrieval outputs, not canonical facts.

## Two sources, two kinds of evidence

- **Reference docs (not code evidence):** the pinned SvelteKit pages. They describe the framework and cannot prove anything about this repo's code.
- **Code evidence (external dependency):** the installed `@sveltejs/kit` 2.59.1 package, 161 files, crawled read-only into `.tmp/atlas/sveltekit2-code-analysis/manifest.json` with per-file sha256 and a corpus checksum (`sha256:c8a62cf1…`). It is pinned by package version, not by git.
- **Code AST diagnostic (separate from the docs capability):** the bounded 8095 `/ast/chunk` pass verified every file hash, analyzed 159 supported non-empty source files, and matched source path/revision on all 159 responses. The empty `conflict.js` and `package.json` were explicitly excluded; two files returned recoverable syntax diagnostics. Receipt: `.tmp/atlas/sveltekit2-code-analysis/ast-diagnostic-v1.json` (`AST_DIAGNOSTIC_COMPLETE_WITH_EXCLUSIONS_NOT_ADMITTED`). This is external-package diagnostic evidence, not workspace-bound or persisted AST evidence.

## Evidence already in hand (reference docs)

- 5 raw SvelteKit pages (`form-actions`, `hooks`, `load`, `page-options`, `state-management`), 256 KB total.
- A read-only NLP scan of those pages through the 8095 `/analyze` route: 5 of 5 succeeded, 253 entities, 0 relations. Two pages returned exactly 46 entities each, which may be an extractor cap.
- No `llms.txt` exists for SvelteKit in the repo.
