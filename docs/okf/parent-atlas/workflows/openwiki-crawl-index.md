---
title: OpenWiki Crawl and Index Workflow
bundle: parent-atlas
status: PARTIAL_PROVEN
owner: Parent Atlas / PostgreSQL
evidence_refs:
  - docs/.okf/schema.yaml
  - docs/.okf/dev/manifest.json
  - docs/.okf/dev/index.md
  - docs/.okf/dev/rtx-louvain-parity.md
---

# OpenWiki Crawl and Index Workflow

OpenWiki is a generated documentation layer. It can crawl, normalize, classify,
and index corpus material, but it must not become canonical truth.

## Acquisition

- Use Firecrawl when available.
- Fall back to BeautifulSoup/plain fetch when Firecrawl is unavailable.
- Keep acquisition separate from indexing and ranking.

## Normalization

- Convert HTML to stable markdown or text.
- Strip boilerplate and preserve source references.
- Keep `sourceRef`, `titleId`, and `domain_class` attached to the record.

## Classification

- Classify each record with the OKF schema first.
- Use `domain_class` and `focus_tags` as the primary routing fields.
- Keep `OpenWiki`, `LangChain`, and deep-agent orchestration optional.

## Indexing

- Write corpus records into an OpenWiki/OKF corpus index.
- Keep the index generated, not authoritative.
- Preserve provenance and revision lineage on every row.

## Ranking

- Start with rule-based and schema-based ordering.
- Add lexical scoring next: BM25/BM42, concept overlap, and domain match.
- Add PyTorch/RTX reranking only after the baseline is proven.

## Operational rule

- Do not use the OpenWiki layer to mutate Parent Atlas canonical tables.
- Do not let a neural sorter overwrite structural identity or provenance.
- Keep OpenWiki output reviewable and regenerable.
