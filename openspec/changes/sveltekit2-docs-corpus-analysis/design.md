## Context

The pinned SvelteKit documentation corpus consists of raw Markdown pages and a JSONL chunk projection. The analysis is offline and must not mutate canonical stores or imply admission. The installed `@sveltejs/kit` source package is a distinct code-evidence corpus and is outside this capability.

## Goals / Non-Goals

**Goals:** Produce deterministic, checksummed corpus analysis and lexical query results tied to the pinned input files.

**Non-Goals:** Embedding generation, database/vector writes, classifier training, Graphify/ACE admission, or treating external dependency code as documentation evidence.

## Decisions

- Use raw-page bytes and chunk JSONL as immutable inputs; derive a sorted manifest before analysis.
- Join pages to chunk records through validated Svelte documentation URLs and report gaps instead of guessing mappings.
- Keep navigation labels, extracted terms, and domain proposals advisory and separately identified.
- Use deterministic BM25-style lexical scoring with stable score-descending/chunk-ID ordering and opaque pagination cursors.
- Store local receipts under `.tmp/atlas/`; include checksums, counts, and zero committed datastore writes.

## Risks / Trade-offs

- Stale or partial chunks can disagree with raw pages → manifest and coverage gates fail visibly before ranking.
- Heuristic terms and domains may be wrong → mark them as proposals and report NLP agreement separately from reviewed accuracy.
- Ties can make Recall@K unstable → define tie-aware cutoff reporting and stable result ordering.

## Migration Plan

No database migration. Build and validate each offline stage from the manifest; rollback consists of discarding local diagnostic output, without changing pinned inputs.

## Open Questions

- Which small query set and relevance judgments will be used for recall evaluation?
- Which exact table-of-contents source is canonical for the requested navigation groups?
