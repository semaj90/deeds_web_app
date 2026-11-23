# Firecrawl, LangGraph, Beautiful Soup, Top-K, and Tiered Retrieval Gap Audit

Date: 2026-11-22
Scope: read-only code, manifest, OpenSpec, and official-documentation review.
Authority: diagnostic only; `canonicalAuthority=false`; no corpus, graph, database, Valkey, or Qdrant writes performed.

## Findings

### Official documentation discovery

- Firecrawl Map returned 189 URLs for the API-reference endpoint query. Results include locale variants and `.md` mirrors, so URL count is not a count of unique canonical API pages. Relevant official pages include v2 introduction, Map, Scrape, Crawl POST/GET, Batch Scrape, Parse, and Search.
- LangGraph Map returned 82 Python and 75 JavaScript documentation URLs in the scoped subtrees. Both include `.md` mirrors and repeated guide/API surfaces. Relevant pages include Graph API/state/nodes/control flow, persistence, checkpointers, interrupts, and streaming.
- The official Beautiful Soup documentation is at `https://www.crummy.com/software/BeautifulSoup/bs4/doc/`; its current search result identifies version 4.14.3. The module reference is `https://www.crummy.com/software/BeautifulSoup/bs4/doc/api/bs4.html`.
- These are documentation URL inventories, not evidence that every page was captured or admitted.

### Existing pipeline owners

- `python/atlas_okf_docs_pipeline.py` validates its manifest, selects Firecrawl v2 or the BeautifulSoup HTTP fetcher, normalizes/chunks pages, can produce relation proposals and retrieval features, and has explicit optional cluster/Qdrant stages. The manifest is the bounded source list; Map results are not automatically acquired.
- `sveltekit-frontend/src/lib/server/atlas/docs/firecrawl-v2-capture.ts` calls Firecrawl v2 Scrape and archives captures through the SeaweedFS cold-object-store adapter. The symbol search found only its implementation and tests, with no application caller. It is therefore an owner/test surface, not a proven production acquisition path.
- `docs/.okf/dev/manifest.json` lists eight Firecrawl URLs, two LangChain/LangGraph URLs for each language, and one combined Beautiful Soup/Firecrawl source with two URLs. The LangGraph entries are overview pages; the full API/map inventories are not yet represented as a reviewed, version-pinned corpus manifest.
- Earlier OpenSpec readback records 30 canonical PostgreSQL pages / 852 chunks, and a separate local published corpus of 88 pages. The 88-page publication is not canonical admission; its pages remain blocked from semantic indexing until envelope and admission checks pass. These counts were not refreshed during this audit.

### Relation extraction and ontology admission

- `python/atlas_graph_runtime/api_document_fact_v1.py` verifies document hashes and exact UTF-8 spans, but emits pending `DOCUMENTED_BY` proposals with no `objectRef` or ontology revision. Its admitted predicate set is only `DOCUMENTED_BY`, `REQUIRES`, and `USES`.
- OpenSpec DOC-14 asks for five relation types: `DOCUMENTED_BY`, `REQUIRES`, `SUPPORTS`, `USES`, and `RELATED_TO`. The ledger reports zero live observed instances of those five types in the inspected graph projection; fixture proofs do not establish live graph admission.
- Local `DOCUMENT_LINKS_TO` extraction and PageRank are discovery/ranking aids. They do not establish one of the five semantic relations or create an ontology fact.
- Missing handoff: exact official source/chunk revision + verified byte span → reviewed canonical ontology mapping → pending tuple → existing graph admission owner → graph revision/readback.

### Top-K and integer ranking

- `rank_document_chunks_for_task_v1()` is an advisory lexical recommender, not the canonical SearchRuntime fusion/ranking owner. It filters to official documents, requires two explicit identifiers or one exact API identifier, uses `3 * explicitIdentifierMatches + 2 * exactApiMatches`, sorts by score then chunk ID, diversifies by page, and defaults to `top_k=5`.
- The numeric score is stored as a float but currently has integer-valued increments. There is no evidence that it is calibrated, evaluated on a reviewed relevance set, or consumed by the live assistant/ACE path. The latest recorded DOC-SEARCH-05 run returned zero candidates; a separate HNSW positive control returned three, which is a routing control rather than a relevance benchmark.
- Keep `CandidateOrdinal` as stable identity within its pinned candidate map. Keep `rank` as a 1-based result position and score as a separately versioned relevance value. If an integer score is desired, define fixed-point scale, overflow/tie rules, and prove ordering parity against the float reference. Do not use the integer rank as identity or evidence quality.
- Acceptance should use reviewed queries and judged relevant chunks, reporting precision@K, recall@K, MRR/nDCG, citation-span validity, source-version coverage, and abstention behavior. Relation extraction needs separate predicate/entity/span precision and recall; a retrieval rank cannot validate an ontology relation.
- For production retrieval, filter/admit first, retrieve bounded lexical/FTS and semantic candidates, normalize/fuse only in SearchRuntime, then exact-check source revision/span before constructing the ContextManifest. Keep local recommendations in a review-only sidecar until evaluated and wired.

### Hot / warm / cold and SSR-to-CSR

- Hot bucket descriptor contract/fixture exists under DOC-17, but the OpenSpec ledger explicitly leaves Valkey write/readback open. DOC-BATCH-05 also requires full-revision keying, TTL/invalidation, dry-run selection, and cold-versus-warm equivalence before an authorized write.
- SeaweedFS cold capture is present in the TypeScript Firecrawl adapter, but that helper has no application caller. Python `.okf` capture/publication and PostgreSQL admission are separate owners; their artifacts are not yet joined into one proven lifecycle.
- The ledger's proposed tier model is: canonical PostgreSQL identity/metadata and admitted chunks; warm normalized local/intermediate artifacts; cold immutable originals in SeaweedFS. Valkey should carry only bounded, revision/checksum-qualified descriptors, not document bodies, vectors, tensors, or hidden state.
- SSR compact authorized metadata → CSR on-demand revision/hash-checked payload, cancellation/stale-response rejection, byte budgets, and final-consumer disposal is written as a requirement; end-to-end tier-equivalence/readback is still open.

### Orchestration boundary

- LangGraph documentation covers shared state, nodes, edges, persistence/checkpointers, interrupts, and streaming. Use it only for bounded orchestration over typed task/source/receipt IDs. It must call the existing authorized service layer; graph state is not a database, evidence, or task-status authority.
- Keep Beautiful Soup as an HTML parser inside the existing fetch pipeline. It does not discover URLs or crawl a site; Firecrawl Map discovers URLs, Scrape fetches a page, and Crawl collects a scoped set of pages.

## Recommended completion order

1. Reconcile a deduplicated, allowlisted Firecrawl/LangGraph/Beautiful Soup URL inventory into the existing `.okf` source manifest, pin actual release/version or dated upstream snapshot, and capture a bounded selected cohort.
2. Replay normalized pages and verify source URL, fetcher/parser versions, content hash, exact UTF-8 spans, envelope alignment, and canonical PostgreSQL admission/readback. Keep local-only publication distinct from admitted corpus rows.
3. Complete the five DOC-14 relation contracts, bind each proposal to reviewed ontology IDs and exact evidence spans, and pass only approved proposals to the existing graph admission owner.
4. Evaluate top-K against a reviewed frozen query/chunk set; keep the advisory lexical scorer out of canonical ranking until its metrics and caller integration are proven.
5. Complete DOC-17 descriptor-only Valkey warming with explicit authorization, TTL, invalidation, cold/warm equivalence, and independent readback. Verify SSR→CSR on-demand loading and eviction with real revision-bound artifacts.
6. Only after CPU/SearchRuntime and graph admission are proven, consider GPU or learned-ranking lanes as challengers with the same frozen inputs, resource admission, parity receipts, and held-out evaluation.

## Official references found

- Firecrawl [v2 API introduction](https://docs.firecrawl.dev/api-reference/v2-introduction), [Map](https://docs.firecrawl.dev/api-reference/endpoint/map), [Scrape](https://docs.firecrawl.dev/api-reference/endpoint/scrape), [Crawl start](https://docs.firecrawl.dev/api-reference/endpoint/crawl-post), [Crawl status](https://docs.firecrawl.dev/api-reference/endpoint/crawl-get), [Batch Scrape](https://docs.firecrawl.dev/api-reference/endpoint/batch-scrape), [Parse](https://docs.firecrawl.dev/api-reference/endpoint/parse), and [Search](https://docs.firecrawl.dev/api-reference/endpoint/search).
- LangGraph [Python Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api), [Python state](https://docs.langchain.com/oss/python/langgraph/graph-api-state), [Python persistence](https://docs.langchain.com/oss/python/langgraph/persistence), [JavaScript Graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api), [JavaScript state](https://docs.langchain.com/oss/javascript/langgraph/graph-api-state), and [JavaScript persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence).
- Beautiful Soup [official documentation](https://www.crummy.com/software/BeautifulSoup/bs4/doc/) and [module API](https://www.crummy.com/software/BeautifulSoup/bs4/doc/api/bs4.html).

## Status

No task checkbox was changed. No tests were run. No application, database, cache, graph, vector, or object-storage writes were performed. Official URL mapping and local source inspection are discovery evidence only; full official-document coverage, canonical admission, relation admission, production top-K quality, Valkey readback, and end-to-end hot/warm/cold behavior remain unproven.
