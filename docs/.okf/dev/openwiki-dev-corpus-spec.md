# OpenWiki Dev Corpus Spec

- schema_version: okf.dev.pipeline.v1
- owner: Parent Atlas / PostgreSQL
- status: PARTIAL_PROVEN
- purpose: executable contract for crawling, classifying, and indexing docs into the OKF dev corpus

## Canonical boundary

- Parent Atlas/Postgres stays canonical.
- OpenWiki is a generated documentation surface.
- The OKF dev corpus is a reviewable export target, not an authority store.

## Inputs

- `docs/.okf/dev/manifest.json`
- `docs/.okf/schema.yaml`
- `docs/.okf/registry.yaml`
- live source pages listed in the manifest

## Acquisition lanes

1. Firecrawl when available.
2. BeautifulSoup / plain fetch when Firecrawl is unavailable.
3. Keep acquisition read-only.

## Normalization lanes

- normalize HTML to markdown or text
- preserve `sourceRef`, `url`, `title`, and revision hints
- strip boilerplate but keep reference URLs
- keep one normalized record per source page

## Classification lanes

- apply `domain_class` from the OKF schema first
- assign `focus_tags` from the schema / bundle contract
- keep `llm_synthesis` and `llm_output` as downstream review fields
- do not let a neural sorter override the schema class

## Indexing lanes

- write corpus rows to `docs/.okf/dev/corpus.jsonl`
- write a human index to `docs/.okf/dev/index.md`
- write a summary to `docs/.okf/dev/summary.json`
- keep the output generated and reproducible

## Optional enrichment lanes

- POS tagging may be added as enrichment only
- PyTorch / RTX ranking may be added after the deterministic index is stable
- LangChain / deep-agent orchestration remains optional and non-canonical

## Recommended output fields

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

## Acceptance gates

- every listed source is fetched or explicitly marked unavailable
- every record gets a stable domain class
- every record keeps provenance
- summary and index are regenerated from the same run
- no generated record mutates Parent Atlas canonical state

## Current intended consumers

- OKF dev corpus index
- OpenWiki generated docs
- review and analysis lanes
- downstream ranking experiments after the baseline is proven
