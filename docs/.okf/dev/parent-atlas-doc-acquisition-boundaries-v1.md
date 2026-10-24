# Parent Atlas documentation acquisition boundaries (v1)

Status: `REFERENCE_ONLY`; this note is not a source-admission, corpus-index, or production-readiness receipt.
Reviewed: 2026-10-23.

## Existing owners and fetch parameters

- Interactive official-document lookup is available through the Firecrawl MCP `firecrawl_search` and `firecrawl_scrape` tools. There is no repository Firecrawl skill file to update.
- The repository acquisition owner is `python/atlas_okf_docs_pipeline.py`; it already supports `FIRECRAWL_V2`, bounded `FIRECRAWL_CRAWL`, and `BEAUTIFULSOUP_HTTP`, with domain allowlists, an explicit page list, `maximum_pages`, and `maximum_depth`. The checked-in research manifests currently choose BeautifulSoup and one page per source. Use that existing manifest and owner rather than adding a second crawler.
- For a single official reference page, keep `maximum_pages: 1`, `maximum_depth: 0`, `follow_sitemap: false`, an exact `pages` URL, and a narrow `allowed_domains` list. Firecrawl crawl `limit` is the page-count bound; the current Firecrawl guide says its default is 10,000, so always set the limit explicitly. The frequently mentioned 1,000 is a credit allowance, not an established 1,000-item JSON response ceiling. Firecrawl JSON extraction documents a maximum prompt length of 10,000 characters; it is a structured extraction format, not the preferred transport for full documentation pages. Use Markdown for page capture.
- `8095` is the local NLP/parser sidecar (Tree-sitter/AST and related analysis), not a Firecrawl fetcher and not the web/PDF OCR owner. Firecrawl documents image OCR and PDF `auto` mode (text extraction with OCR fallback) plus explicit `ocr` and `maxPages` controls. No Tesseract invocation was found in the inspected acquisition/parser owners; whether Windows Tesseract is installed is not established. HTML documentation does not need OCR.

## Captured official references

The existing `docs/.okf/engineering-acquisition/utf8-v2/` captures already include Firecrawl scrape API, Langfuse–Mastra, Langfuse OpenTelemetry, Mastra tracing, OpenTelemetry JavaScript, and PostgreSQL 18 multicolumn-index documentation. Do not duplicate these pages merely to change the fetcher. If a refresh is required, update the existing source manifest through its acquisition owner and preserve raw/normalized digests and parser/fetcher metadata.

Official references checked for this note:

- Firecrawl crawl and scrape: https://docs.firecrawl.dev/api-reference/endpoint/crawl and https://docs.firecrawl.dev/api-reference/endpoint/scrape
- Firecrawl PDF/image parsing and OCR: https://docs.firecrawl.dev/features/parse and https://github.com/firecrawl/firecrawl-docs/blob/main/advanced-scraping-guide.mdx
- PostgreSQL 18 multicolumn indexes: https://www.postgresql.org/docs/18/indexes-multicolumn.html
- PostgreSQL text-search indexes: https://www.postgresql.org/docs/18/textsearch-indexes.html
- PostgreSQL bitmap index scans: https://www.postgresql.org/docs/18/indexes-bitmap-scans.html
- Langfuse Mastra integration: https://langfuse.com/integrations/frameworks/mastra
- OpenTelemetry JavaScript: https://opentelemetry.io/docs/languages/js/
- Mastra tracing bridge: https://mastra.ai/reference/observability/tracing/bridges/otel

## Architecture alignment and missing proof

- PostgreSQL B-tree composite indexes must follow observed predicates/order and be checked with `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` on a qualified workload. PostgreSQL 18 can use B-tree skip scans in some cases, but this does not make column order irrelevant. GIN over `tsvector` is a separate full-text retrieval structure; PostgreSQL may combine indexes through bitmap scans. None of these facts proves the current corpus or index is populated, selective, or correctly sized.
- The repository evidence supplied for this review says `public.keyword_corpus` is absent, the `.okf` corpus is reference material, and the domain crosswalk remains semantically unreviewed. Therefore classification-to-corpus population and retrieval-index readiness remain open. No database read/write or index build was performed for this note.
- SearchRuntime remains the single fusion owner. PageRank Top-K and KMeans/SOM clusters are candidate-expansion or diagnostic features, not relevance truth or independent semantic votes. A qualified source/workspace/feature snapshot and reviewed relevance set are still prerequisites before recommendations can be promoted.
- XGBoost reranking remains disabled; reinforcement learning/training is not authorized by this documentation review. PyTorch/N-API tensor construction and any manifold recommendation remain separate execution/evaluation gates, not prerequisites for fetching docs.
- Current workspace authority remains the first failing runtime boundary from the supplied smoke evidence. Documentation acquisition, a healthy MCP tool, and a populated taxonomy table cannot replace current source and feature-snapshot admission.

## Next bounded action

Refresh only the existing official source pages whose freshness or coverage is demonstrably missing, through `python/atlas_okf_docs_pipeline.py --acquire-only` with explicit one-page source bounds. Keep fetched content untrusted until its existing schema, digest, source metadata, and admission/readback owners pass. Do not run embedding, clustering, Qdrant projection, Graphify, or production index creation as part of acquisition.
