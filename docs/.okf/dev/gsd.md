# OKF Dev Corpus GSD

This directory is the repository-local export target for curated dev docs.
It is not a second source of truth. The source of truth remains the upstream
official docs pages plus the repo's canonical classification schema.

## Goal

Fetch a bounded set of official webpages, normalize them, classify them by
domain, and emit a structured corpus that downstream tasks can use for:

- `llm_synthesis`
- `llm_output`
- `kanban`
- `taskboard`
- `agentic_error_fixing`
- `canonical_api_recommendations`

This bundle is a dev corpus export target only.
Discovery remains separate from acquisition:

- `SearXNG` and OpenCode `websearch` are discovery lanes.
- `Crawl4AI` and Firecrawl are acquisition lanes.
- Graphify/Postgres remain canonical for code and runtime truth.

## Flow

1. Read `docs/.okf/dev/manifest.json`.
2. Fetch each listed webpage with Firecrawl when `FIRECRAWL_API_KEY` is set.
3. Fall back to a plain fetch only when Firecrawl is unavailable.
4. Normalize the page into markdown.
5. Classify the page into a bounded domain class.
6. Emit one Zod-validated corpus record per page.
7. Write raw markdown, JSONL records, and a summary index under `docs/.okf/dev/`.

## Guardrails

- Do not treat the corpus as canonical runtime state.
- Do not write embeddings, Qdrant points, or agent state here.
- Do not let discovery search results bypass canonical ingestion if they are
  later promoted into code or docs evidence.
- Do not widen the source manifest without adding a domain classification rule.
- Do not promote heuristic summaries to authoritative output without review.

## Canonical export fields

- `schema_version`
- `source_id`
- `source_ref`
- `url`
- `title`
- `domain_class`
- `focus_tags`
- `llm_synthesis`
- `llm_output`
- `kanban`
- `taskboard`
- `agentic_error_fixing`
- `canonical_api_recommendations`
- `content_hash`
- `fetched_at`

## Intended use

The output is meant to seed:

- domain corpus classification
- typed extraction schemas
- doc-backed API recommendations
- error-fixing playbooks
- taskboard generation
