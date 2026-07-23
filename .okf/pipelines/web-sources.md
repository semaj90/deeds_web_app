---
type: pipeline
title: Web Sources Ingestion & Ranking
id: pipeline/web-sources
status: active
owners:
  - legal-ai-team
source_refs:
  - docs/DEEP-RESEARCH-INDEX.md
  - docs/DEEP-RESEARCH-COMPLETION-SUMMARY.md
  - docs/DEEP-RESEARCH-SEARXNG-COMPILATION-ARCHITECTURE.md
  - docs/DEEP-RESEARCH-ADMIN-SETUP.md
  - docs/architecture/retrieval-architecture.md
  - docs/architecture/local-deep-research-boundary.md
related:
  - system/deep-research
  - system/hyperrag
  - pipeline/retrieval-ranking-synthesis
  - tools/ml-ranking-sidecar
  - tools/gemma4-synthesis
  - runbook/admin-dashboard-setup
---

# Web Sources Ingestion & Ranking

## Overview

This pipeline describes how external web sources are discovered, normalized, ranked, and exported into the OKF layer for deep research and retrieval support.

It is export-only. Canonical truth stays in PostgreSQL and the operational mirrors stay in Qdrant, Neo4j, and Redis.

## Scope

Web sources in this lane include:

- SearXNG search results
- Firecrawl-fetched pages
- external admin or setup documentation
- curated web references used by deep research
- local notes and source maps derived from web discovery

## Contract

The OKF surface should store curated evidence, not raw crawl state.

Recommended fields:

- `source_url`
- `source_kind`
- `query_text`
- `discovery_engine`
- `fetch_engine`
- `title`
- `summary`
- `content_hash`
- `crawl_timestamp`
- `embedding_contract`
- `rank_score`
- `trust_tier`
- `canonical_doc_ref`
- `citation_refs`

## Discovery Lanes

### SearXNG

Use SearXNG for local web discovery and query expansion.

Use it when:

- the query needs current external information
- the corpus is incomplete locally
- you need broad search with controlled source lists

### Firecrawl

Use Firecrawl for page fetch and clean text extraction.

Use it when:

- the discovered URL needs normalized content
- the page is HTML-heavy or difficult to parse directly
- you need stable citation-friendly text for downstream ranking

### Admin Docs

Use admin docs as a curated source set for internal operational guidance.

Use them when:

- the search is about repo operations
- the answer depends on internal setup or runbooks
- the query needs provenance back to a stable local document

## Ranking Flow

1. Discover candidate sources with SearXNG.
2. Fetch and normalize content with Firecrawl or a local parser.
3. Chunk the content into citeable spans.
4. Embed the chunks with the configured embedding contract.
5. Rank against the query with lexical, dense, and authority signals.
6. Export the curated results into `.okf` for downstream use.

## Boundaries

- Do not treat `.okf` as the canonical store.
- Do not mix raw crawl output with curated evidence exports.
- Do not collapse discovery, fetch, ranking, and synthesis into one step.
- Keep source identity explicit so citations can be rebuilt later.

## Suggested OKF usage

Use this lane for:

- search-engine sourced summaries
- Firecrawl page abstracts
- documentation citations
- deep-research evidence bundles
- local source maps for agentic retrieval

Keep the exported record compact and reproducible.
