# parent-atlas-versioned-doc-intelligence

## Why

Agentic error-fixing and code-authoring work in this repo currently has no reliable way to answer
"what does the official documentation say, for the exact version/architecture this codebase
targets, about this exact API?" A generic web search or an unversioned scraped-docs vector store
answers a *similar* question, but for GPU/compiler-adjacent work (cuTile, CUDA Tile IR, cuVS,
etc.) the version and architecture qualifiers are load-bearing — CUDA 13.2 added Tile IR support
for Ampere (this dev host's RTX 3060 Ti, sm_86); a 13.1 or Hopper-only page would produce a
confidently wrong answer. This is the same "no silent selection among ambiguous options" failure
mode this repo just fixed in `local-llm-offload-ownership` (never guess a model when multiple are
observed), applied to documentation instead of models.

The fix is not a separate "docs RAG" bolted onto the side — it's a **version-qualified
documentation intelligence fabric** feeding the *same* Parent Atlas retrieval/prefill/ACE-packet
system every other capability in this repo already goes through. Crawl once, normalize once,
version-bind once, extract deterministic structure first, enrich semantically second, project to
the existing retrieval executors (Postgres FTS, Qdrant dense+BM25, Neo4j/cuGraph), assemble one
ACE packet. Never a second, parallel retrieval system.

## Duplication-prevention audit (done before writing this proposal)

Per this repo's own hard rule ("Audit Before You Build" / `runtime-ownership-registry.json`
governance), most of the foundation already exists — this is an **extension**, not a new
subsystem, for the pieces below:

| Piece | Status found | Evidence |
|---|---|---|
| Manifest-driven crawl→chunk→embed→Qdrant pipeline | **EXISTS, live** | `python/atlas_okf_docs_pipeline.py` (906 lines); CLI `--manifest`, `--write-qdrant` opt-in, `--clusters`; targets canonical `semantic_768` via `embed_llama_server_768` |
| BeautifulSoup fetcher | **EXISTS, live, IS the default** | `python/atlas_external_docs.py::fetch_beautifulsoup()`; `default_fetcher` defaults to `"BEAUTIFULSOUP_HTTP"` when unset — Firecrawl is opt-in, never required |
| Firecrawl fetcher | **EXISTS**, not currently registered as an MCP in this session/project | `python/atlas_external_docs.py::fetch_firecrawl_v2()`; needs `FIRECRAWL_API_KEY` |
| Single-page evidence endpoint, Pydantic-typed | **EXISTS, live-proven this session** | `POST :8095/evidence/web`, `WebEvidenceRequestV1`/`WebEvidenceResponseV1` in `miniforge_nlp_sidecar_v2.py`; `canonical_authority: False`, `writes_performed: False` |
| Domain classification | **EXISTS** | `atlas_external_docs.py::classify_domain/classify_ontology`, `parent_atlas_ontology/domain_mapping.py::admit_domain_classification` |
| Manifest format with per-source URL lists, allowed domains, authority class | **EXISTS as an example** | `docs/.okf/dev/atlas-doc-fabric.manifest.example.json` — no entries yet for this repo's actual stack (Postgres 18, SeaweedFS, SvelteKit 2, Drizzle ORM) |
| LangExtract, OpenAI-compatible provider targeting `:8090` | **ALREADY DEFAULT**, not something to build | `python/langextract_service.py`: `LANGEXTRACT_PROVIDER = os.getenv(..., "openai")`, `base_url` defaults to `http://localhost:8090/v1`. `langextract_ollama.py` (358 lines) exists but has **zero callers anywhere in `python/`** — dead/legacy, already superseded, not touched by this proposal (archive-not-delete, out of scope) |
| cuVS exact / CAGRA / IVF-PQ | **EXISTS, live-proven (GPU-MINI-FABRIC-01)** | `openspec/changes/parent-atlas-gpu-mini-fabric-01/` — `SEMANTIC-EXACT-PARITY-01` PASS, `GPU-GRAPH-ANN-02`/`03` PASS at tuned params |
| ast-grep structural evidence adapter | **EXISTS** | `packages/parent-atlas/src/core/ast-grep-observation-adapter.ts` (`AstGrepObservationV1`) |
| ACE packet envelope | **EXISTS** (general contract; a doc-specific `AceRepairPacketV1` variant is new) | referenced throughout `parent-atlas-retrieval-lineage-dag-convergence` |
| Postgres canonical row for external docs | **DOES NOT EXIST** — real gap | Grepped `sveltekit-frontend/drizzle/**/*.sql` for `external_doc`/`external_programming_docs` — zero hits. The pipeline currently writes **only** to Qdrant, a mirror, with no canonical Postgres owner. This is the single most important gap: per this repo's Postgres-is-truth hard rule, nothing here should be treated as promotable evidence until it has a Postgres row |
| Version-qualified document identity (`DocCoordinateV1`) | **DOES NOT EXIST** — real gap | `FetchResult`/`ChunkRecord` in `atlas_external_docs.py` carry no `productVersion`/`architecture` fields; a later crawl of the same URL under a different product version would silently collide |
| `ApiRuleV1`, `PatchTargetV1`, `PatchProposalV1` | **DO NOT EXIST** — real gap, net new contracts | — |
| Doc-corpus admin/search page | **DOES NOT EXIST** — the existing `/command-center/retrieval/` UI has no concept of `external_programming_docs_768` | — |
| Pydantic validation for the *bulk* manifest pipeline | **PARTIAL** — `WebEvidenceRequestV1` (single-page) is Pydantic; `PipelineManifest`/`ChunkRecord` (bulk pipeline) are plain `@dataclass` | `atlas_okf_docs_pipeline.py` |

## What Changes

Extend the existing pipeline rather than replace it. In priority order (matches the dependency
chain in tasks.md — deterministic structure and canonical identity before any semantic/GPU stage):

1. Version-qualified document identity (`DocCoordinateV1`) so `cuda-tile/13.2/page-foo` and
   `cuda-tile/13.3/page-foo` are distinct revisions, never an overwrite.
2. A canonical Postgres owner for external doc pages/chunks (closes the biggest gap — nothing here
   is promotable evidence without one).
3. Deterministic-first extraction (BeautifulSoup/lxml structure: headings, anchors, code blocks,
   tables, API signatures) before any LLM touches the page.
4. LangExtract/Ornith semantic extraction **only** for genuinely semantic material (capability,
   constraint, deprecation, migration advice) — confirmed already targeting the `:8090`
   OpenAI-compatible facade, not Ollama.
5. Multi-representation projection (Postgres FTS, `semantic_768` dense + BM25 sparse in Qdrant,
   Neo4j/cuGraph doc-relationship edges) feeding the existing retrieval executors — no new,
   parallel retrieval system.
6. `ApiRuleV1` (doc-to-code rules, e.g. "parameter X renamed to Y in version Z") and a doc↔symbol
   mutual index, so a compiler error can retrieve an exact rule instead of re-searching prose.
7. `PatchTargetV1`/`PatchProposalV1` — structural coordinates (stableSymbolId, ast-grep pattern,
   metavariables) so an agent proposes `some_api(foo, X) -> some_api(bar, X)`, never "edit around
   line 420."
8. `AceRepairPacketV1` — the actual token-saving win: compiled evidence (diagnostic, exact-version
   doc excerpt, `ApiRuleV1`, structural target, graph neighbors) in ~1-5 KB, not raw docs+source.
9. BitFrost hot-bucket descriptors and centroid routing as an optional acceleration layer over an
   already-stable corpus — descriptors only, never the canonical documents themselves.

## Non-Goals (this proposal)

- Not building a second retrieval system parallel to the existing Postgres/Qdrant/Neo4j executors.
- Not registering Firecrawl as an MCP server as a prerequisite — BeautifulSoup is the default and
  sufficient fetcher for the first phases; Firecrawl registration (API key, budget cap) is a
  separate, explicit follow-up when recursive/JS-rendered crawling is actually needed.
- Not rewriting `langextract_ollama.py` or deleting it — dead, zero callers, archived per this
  repo's archive-not-delete convention, out of scope here.
- Not attempting cuTile kernel code itself — this dev host's CUDA 13.0 toolkit only ships a
  compiler-intrinsic stub (`ACE-RADIX-01` finding); this proposal is about *documentation*
  retrieval, independent of whether cuTile kernels can be compiled here yet.
- Not replacing cuVS/cuGraph algorithms with custom cuTile kernels (explicit anti-goal from the
  source discussion — cuVS owns ANN, cuGraph owns graph algorithms, cuTile is for custom dense
  tiled kernels only, never a reimplementation of what cuVS/cuGraph already do well).

## Risks / Open Questions

- Firecrawl budget (500-1000/day mentioned) needs to actually be provisioned (API key) before any
  task depending on it can start — flagged, not assumed.
- ~~`langextract_service.py`'s own `_fetch_html`/`WebExtractionRequest` may overlap with
  `atlas_external_docs.py::fetch_beautifulsoup`~~ — **resolved during this proposal's audit** (see
  DOC-04 in tasks.md): not a duplicate, `langextract_service.py`'s fetcher backs its own narrower
  `/extract/web` ad hoc endpoint, unrelated to this pipeline. `atlas_external_docs.py::fetch_beautifulsoup()`
  is the confirmed `CANONICAL_OWNER` for the doc-intelligence pipeline.
- ~~`docs/.okf/dev/*`'s TypeScript toolchain may duplicate the Python pipeline~~ — **resolved**
  (see DOC-00 in tasks.md). Both are live, but they are not the same capability: the TS toolchain
  (`crawl-okf-dev-docs.mts` -> `index-okf-dev-corpus.mjs`) produces kanban/taskboard-integrated,
  LLM-synthesized corpus entries (Zod `OkfDevCorpusEntrySchema`, no version/architecture concept
  at all) plus a TS/JS symbol index via ts-morph+ast-grep — a different consumer and data shape
  than this proposal's version-qualified `semantic_768`/Qdrant/PageRank/SOM retrieval fabric.
  Found a **third** BeautifulSoup fetcher along the way (`scripts/docs-atlas/fetch-beautifulsoup.py`,
  a thin subprocess helper for the TS crawler) — also not a conflict, same reasoning. Neither TS
  toolchain is touched by this proposal; `atlas_okf_docs_pipeline.py`/`atlas_external_docs.py`
  remains the confirmed foundation for Phase A onward.
