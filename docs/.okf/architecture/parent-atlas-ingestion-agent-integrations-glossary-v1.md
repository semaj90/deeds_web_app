# Parent Atlas Ingestion and Agent Integrations Glossary V1

This glossary is a navigation and terminology aid for the Parent Atlas ingestion
fabric. It does not create a second packet, identity, retrieval, graph, cache, or
agent authority. Canonical identity and promotion remain owned by the existing
PostgreSQL and Parent Atlas contracts.

## Core terms

- **Ingestion** — bounded acquisition, normalization, validation, revisioning, and admission of source or external-document evidence. Acquisition alone is not canonical admission.
- **Deep agent** — a long-running, tool-using workflow that consumes bounded evidence and receipts; it cannot promote identity or write canonical stores directly.
- **`.okf`** — the repository's schema/navigation and derived knowledge-artifact convention. `.okf` YAML/JSON is validated input or a projection, never an authority that mints packet identity.
- **JSON packet** — a versioned, schema-validated transport envelope for bounded evidence or ACE context. Packet keys, source references, revisions, checksums, and grounded spans must survive every adapter.
- **ACE** — the Context Editor boundary that selects and canonicalizes evidence into bounded cards and a `ContextManifest`. Raw retrieval hits must not be passed directly to an agent or model.

## Acquisition and schema adapters

- **Firecrawl** — optional web crawling/acquisition service that discovers and fetches pages. Its output is an observation with URL, fetch time, provider, and content digest; it does not establish source authority or admit indexed evidence.
- **BeautifulSoup** — Python HTML/XML parsing and tree-navigation library. It parses already acquired markup; it is not itself a crawler, fetcher, or source-admission mechanism. Keep parser choice and extraction recipe in acquisition provenance when relevant.
- **Crawl / parse / index** — three separate stages: acquire bytes, extract structured text/spans from those bytes, then propose a revision-qualified searchable representation. Success in an earlier stage does not imply success or admission in a later stage.
- **LangChain** — model, tool, and agent-harness integration surface. Local corpora and loaders are reference inputs until they pass existing external-document admission and readback gates.
- **Pydantic** — Python request, response, and artifact validation boundary. It validates shape and semantics but does not mint canonical identity or replace TypeScript/Zod or database ownership.
- **Mastra** — optional TypeScript agent/workflow integration surface. Workflows may orchestrate bounded tools and receipts, while respecting no-direct-canonical-write and independent-readback boundaries.
- **Integration** — an adapter between an external library/service and an existing Parent Atlas owner. Completion requires explicit input/output, revision/checksum propagation, failure behavior, and readback proof.

## Search and projection terms

- **N-gram** — a sequence of *n* adjacent characters or tokens, according to an explicit tokenizer. It is a feature/extraction method, not a ranking algorithm or a unique source identity.
- **Trigram / `pg_trgm`** — the PostgreSQL extension's three-character-based similarity and pattern-matching facilities. It is a fuzzy lexical path, separate from PostgreSQL full-text search; its score must retain its own lane identity.
- **PostgreSQL FTS / `tsvector`** — PostgreSQL's built-in tokenized full-text representation and query operators. `ts_rank`/`ts_rank_cd` are PostgreSQL ranking functions, not strict Okapi BM25.
- **BM25** — a term-frequency/inverse-document-frequency ranking function. A `pg_search` BM25 index is a distinct executor from native `tsvector` FTS and `pg_trgm`; package/index presence alone does not prove a production caller.
- **pgvector / HNSW** — PostgreSQL's vector type/operators and an approximate-nearest-neighbor index option. The stored representation, dimension, metric, normalization, source/revision eligibility, and query shape must match; an HNSW plan does not admit the rows it searches.
- **Qdrant collection / point** — a rebuildable vector projection. Point IDs and payload fields are not canonical packet/chunk identity. Qdrant upsert replaces the point payload/vector state for that ID, so a safe projection must send the complete validated payload and all required named vectors or use an isolated versioned collection.
- **Qdrant snapshot** — a recovery artifact for a collection state, not an index rebuild recipe or an incremental-change log. Reconstruct a projection from its canonical PostgreSQL/source owners, then verify counts, payload identity, vector contract, queries, and rollback before any alias/cutover or retention action.
- **Semantic lane / RRF vote** — one logical retrieval source after same-lane executor deduplication. PostgreSQL, Qdrant, and GPU executors must not earn multiple fusion votes merely because they are different physical backends.
- **Agentic dense search** — bounded dense candidate retrieval followed by canonical identity/revision resolution, eligibility checks, evidence-grounded context assembly, and permission/schema checks before tools or repair proposals. Raw hits are not model context or mutation authority.
- **KMeans / topology feature** — a revision-bound derived partition or routing signal over a frozen eligible feature cohort. It may narrow candidate discovery only after recall evaluation; it cannot mint ontology edges, canonical identity, or an additional retrieval vote.

## Data structures and compute terms

- **Hash map / dictionary** — an in-memory key-to-value lookup structure. It can accelerate a qualified lookup but does not provide durable identity, uniqueness, revision control, or admission by itself.
- **Set / bag of words** — a set discards repeated terms; a bag-of-words representation retains term counts, often as a sparse vector. Tokenizer and normalization revisions are part of the feature contract; neither form is source identity.
- **Tuple** — an ordered record of typed fields. An ontology tuple must include its owner-defined subject/predicate/object types, source evidence, and revision/admission receipt; an untyped triple is not automatically an admitted edge.
- **Linked list / graph** — a linked list encodes a sequence of node references; a graph encodes typed nodes and edges. Graph projections are derived, and semantic-neighbor links must not be promoted as `CALLS`, `IMPORTS`, or ontology relations without evidence.
- **Matrix / tensor / GEMM** — dense numeric containers and general matrix multiplication (`GEMM`). They support feature transforms and scoring, but dimensions, dtype, layout, normalization, and representation revision must be explicit and separate from source identity.
- **`rg` / `sed`** — ripgrep and stream-editor command-line tools for source discovery or text transformation. They are not parsers, canonical indexers, or evidence-admission mechanisms; AST-grep/Tree-sitter are the structural syntax-aware owners.
- **RAPIDS / cuVS / cuGraph** — NVIDIA GPU libraries for data processing, vector search, and graph algorithms respectively. They are optional executors over frozen, qualified inputs, not canonical storage or admission owners.
- **cuBLAS** — NVIDIA CUDA library for dense linear algebra/GEMM. It accelerates numeric kernels; it does not establish candidate identity, retrieval quality, or GPU/CPU parity.
- **Agentic LUT / feature-token map** — a revisioned mapping from validated query/domain features to bounded registered tool or retrieval candidates. It may recommend routing; live permissions, tool schemas, source evidence, and mutation approval remain independently enforced.

## Authority and proof vocabulary

- **Source reference** — the stable pointer to source bytes or external-document capture used by a packet/chunk; it is not path-only identity.
- **Revision** — an immutable version dimension such as `sourceRevision`, `workspaceRevision`, `representationRevision`, or `producerRevision`.
- **Receipt** — machine-readable evidence of a bounded operation, including inputs, outputs, revisions, checksums, and status. It proves that operation, not downstream promotion.
- **Projection** — a rebuildable derived representation such as Qdrant, graph, cache, or local `.okf` corpus output. Projections cannot become canonical by being complete or byte-compatible.
- **Readback** — independent verification from the receiving owner that admitted identity, revision, checksum, and payload shape match the receipt.

## Safe integration flow

```text
acquire -> normalize -> validate (Pydantic/Zod) -> bind source/revision
  -> emit versioned JSON packet -> canonical admission/readback
  -> bounded retrieval -> ACE cards -> ContextManifest -> agent/tools
```

Any failed identity, revision, checksum, grounding, or readback gate remains fail-closed. LangChain, Mastra, Firecrawl, `.okf`, and agent runtimes are replaceable integration surfaces, not additional truth stores.
