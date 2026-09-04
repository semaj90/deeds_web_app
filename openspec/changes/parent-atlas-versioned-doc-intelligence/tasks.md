# parent-atlas-versioned-doc-intelligence — tasks

Status legend (per this repo's runtime-ownership vocabulary): `EXISTS` (confirmed live, reuse
as-is), `EXTEND` (real thing exists, needs a specific addition), `NEW` (confirmed does not exist),
`AUDIT_FIRST` (plausible duplicate-owner risk found — resolve ownership before writing code).

Execution order matters: identity (DOC-01/02) and the canonical Postgres owner (DOC-06) come
before any semantic/GPU stage, matching this repo's own "identity before enrichment" convention
from `parent-atlas-retrieval-lineage-dag-convergence`.

## Phase 0 — Ownership resolution (blocks everything else)

- [x] **DOC-00** Resolved. Read both toolchains fully rather than inferring from names/line
  counts. Also found a **third** BeautifulSoup fetcher along the way:
  `scripts/docs-atlas/fetch-beautifulsoup.py` (32-line subprocess helper, shelled out to by the TS
  crawler) — distinct from both `atlas_external_docs.py::fetch_beautifulsoup()` and
  `langextract_service.py`'s fetcher.

  **Finding: not a duplicate-owner conflict.** The TS toolchain
  (`scripts/docs-atlas/crawl-okf-dev-docs.mts` -> `docs/.okf/dev/corpus.jsonl` ->
  `index-okf-dev-corpus.mjs` -> `docs/.okf/dev/symbol-index.jsonl`) and the Python toolchain
  (`atlas_okf_docs_pipeline.py`) serve **different consumers and different data shapes**, not the
  same capability under two names:
  - TS toolchain's `OkfDevCorpusEntrySchema` (Zod) is built around `kanban{board,lane,status}`,
    `taskboard{task_id,title,status}`, `agentic_error_fixing{symptom,likely_fix,validation}`,
    `canonical_api_recommendations[]`, and `llm_synthesis` — a **kanban/taskboard-integrated,
    LLM-synthesized corpus entry** per page. It has **no `productVersion`/`architecture` field at
    all** — structurally cannot satisfy this proposal's core version-qualified-identity
    requirement without a rewrite, because that was never its job. Its second stage
    (`index-okf-dev-corpus.mjs`) extracts TypeScript/JS code-block symbol evidence via ts-morph +
    ast-grep from the crawled markdown — genuinely useful, but again a different artifact
    (`symbol-index.jsonl`, explicitly documented in its own header as "a rebuildable docs
    artifact, never canonical storage") than this proposal's `ExternalDocChunkV1`/`semantic_768`/
    Qdrant/PageRank/SOM retrieval fabric.
  - Python toolchain already targets exactly what this proposal needs: `semantic_768` embeddings,
    Qdrant `external_programming_docs_768`, PageRank/KMeans/SOM features, real test coverage
    (`test_atlas_okf_docs_pipeline.py`, `test_atlas_external_docs.py`).

  **Classification**: neither `CANONICAL_OWNER`-vs-`DEAD` nor a merge decision applies — the TS
  toolchain is a live, legitimate, narrower tool for a different consumer (kanban/taskboard corpus
  generation + TS/JS symbol extraction from docs), out of scope for this proposal, not touched by
  it. `atlas_okf_docs_pipeline.py`/`atlas_external_docs.py` is confirmed the right foundation to
  extend for Phase A onward. No code changed by this task — audit only.

## Phase A — Identity and canonical ownership (blocking, do first)

- [x] **DOC-01** `ExternalDocSourceManifestV1` — done, live-tested, zero regression. New
  `python/atlas_doc_manifest.py`: Pydantic (frozen) `SourceConfigV1`/`PipelineManifestV1` mirroring
  `atlas_okf_docs_pipeline.py`'s `@dataclass` `SourceConfig`/`PipelineManifest` field-for-field, plus
  `parse_manifest_v1()` reproducing the exact same default-resolution rules the old hand-rolled
  loader used (per-source `output_namespace` defaulting to `docs/.okf/<source_id>`, `title`
  defaulting to `source_id`, nested `qdrant`/`embedding`/`features.som` blocks). Chose the
  "dataclass loader validates through" option from this task's own two listed approaches, not the
  parallel-`model_validate` one: `atlas_okf_docs_pipeline.load_manifest()` is now a thin front door
  that calls `parse_manifest_v1()` then converts the validated Pydantic model into the same
  `SourceConfig`/`PipelineManifest` dataclasses it always returned — every downstream pipeline
  stage (fetch/chunk/embed/Qdrant/SOM) is unaffected, confirmed by re-running its own existing test
  file unmodified. Two of the hand-rolled loader's validation helpers were shared rather than
  duplicated: `enforce_allowed_domain` (already in `atlas_external_docs.py`) and a newly-extracted
  `validate_okf_output_namespace` (moved there from a private function in the pipeline module,
  which now delegates to it) — both a leaf `atlas_external_docs.py` dependency, avoiding a circular
  import back into the pipeline module. Confirmed live: `pydantic.ValidationError` subclasses
  `ValueError` (checked `ValidationError.__mro__` against the real pydantic 2.13.5 install in the
  `miniforge-nlp-sidecar` container), so every existing `assertRaises(ValueError)` caller in
  `test_atlas_okf_docs_pipeline.py` keeps passing unchanged with no compat shim needed.
  **Live-tested inside the real container**: `python/test_atlas_doc_manifest.py`, 11/11 pass
  (valid-manifest parse, domain-allowlist rejection, missing-required-field rejection, duplicate
  source-id rejection, missing-URLs rejection, invalid-namespace rejection, output-namespace
  default resolution, frozen immutability at both manifest and per-source level, domain
  lowercasing/dot-stripping, blank-namespace normalization, and a cross-module bridge test proving
  `load_manifest()`'s dataclass output matches `parse_manifest_v1()`'s Pydantic output field-for-field).
  **Zero-regression proof, not just claimed**: ran the full pre-existing suite twice — once on this
  change (36/36 pass across `test_atlas_doc_manifest.py` + `test_atlas_okf_docs_pipeline.py` +
  `test_atlas_doc_coordinate.py` + `test_atlas_external_docs.py`), then `git stash`ed this change's
  files and re-ran the wider repo suite to find 16 pre-existing failures in unrelated test files
  (`test_atlas_structured_value_arrow.py`, `test_domain_classification_signal_parity.py`,
  `test_domain_tuple_bridge.py`, `tests/test_parent_atlas_networkx_pagerank.py` — none import
  anything this task touched) — identical 16 failures on the pre-DOC-01 baseline, confirming they
  predate this change rather than being caused by it, before restoring the stash.
- [x] **DOC-02** `DocCoordinateV1` version-qualified identity — done, live-tested. New
  `python/atlas_doc_coordinate.py`: Pydantic (frozen) `DocCoordinateV1`
  (`provider/product/product_version/architecture/language/url/section_anchor/content_hash` +
  computed `evidence_revision` = sha256 of the identity-bearing fields). Wired into
  `atlas_external_docs.py`: `ChunkRecord` gained an optional `doc_coordinate` field (default
  `None`, zero behavior change for existing callers); `chunk_document()` gained an optional
  `doc_coordinate` kwarg — when passed, each produced chunk gets its own `DocCoordinateV1` via
  `model_copy(update={content_hash: <whole-doc checksum>, section_anchor: <this chunk's heading
  path>})`, so chunks from the same page carry the same provider/product/version/url but distinct
  section-level identity. `to_dict()` serializes it when present.
  Live-tested inside the real `miniforge-nlp-sidecar` container (not simulated):
  `python/test_atlas_doc_coordinate.py`, 11/11 pass, including the core DOC-27 invariant (same URL,
  two `product_version`s -> distinct `evidence_revision`, proven not just asserted) and a real
  `chunk_document(..., doc_coordinate=...)` integration test (per-chunk section anchors, distinct
  per-chunk evidence revisions). Full existing suite re-run alongside: `test_atlas_external_docs.py`
  + `test_atlas_okf_docs_pipeline.py` + `test_atlas_doc_coordinate.py` = 25/25 pass, confirming zero
  regression on the pre-existing pipeline.
- [x] **DOC-06** PostgreSQL canonical owner — done, applied live, real bug found and fixed.
  `sveltekit-frontend/drizzle/manual/20260904_external_doc_intelligence_v1.sql`: two tables,
  `atlas_external_doc_pages` (one row per `DocCoordinateV1` at page level — `UNIQUE
  (provider, product, product_version, url)` + `UNIQUE (evidence_revision)`) and
  `atlas_external_doc_chunks` (`FOREIGN KEY page_id ... ON DELETE CASCADE`, `UNIQUE (chunk_id)`,
  `UNIQUE (evidence_revision)`, `content_embedding vector(768)` nullable until DOC-07 populates it,
  `qdrant_point_id` nullable mirror pointer). Followed the existing
  `drizzle/manual/20260506_code_retrieval_chunks.sql` GENERATED-tsvector+GIN+HNSW convention.
  **Real bug found applying it**: `array_to_string()` is `STABLE`, not `IMMUTABLE`, on this
  Postgres version (confirmed via `SELECT provolatile FROM pg_proc WHERE proname =
  'array_to_string'` -> `'s'`), so the original design (folding `heading_path`/`api_signatures`/
  `domain_tags` into the `GENERATED ALWAYS ... STORED` tsvector) failed with `generation
  expression is not immutable`. Fixed: the generated column covers prose (`text`) only;
  `heading_path`/`api_signatures`/`domain_tags`/`symbols` are separate GIN array-containment
  indexes instead (arguably more correct anyway — they're structured metadata, not prose).
  Applied directly via `docker exec legal-ai-postgres psql` (idempotent, `IF NOT EXISTS`
  throughout — safe to re-run). **Live-proven on the real database, not simulated**: inserted two
  rows for the same `(provider, product, url)` under `product_version` 13.1 vs 13.2 — both exist
  as distinct rows, no collision (DOC-27's core invariant). A third insert with an *identical*
  `(provider, product, product_version, url)` correctly raised
  `duplicate key value violates unique constraint "atlas_external_doc_pages_identity_uq"`. A
  version+architecture-filtered query (`product_version='13.2' AND architecture='sm_86'`) returned
  exactly the 13.2 row, excluding 13.1 — proves the "filter before ranking" requirement is
  enforceable at the index level. Inserted a real chunk row and confirmed full-text search finds
  it (`to_tsquery('english','Ampere')` matched via the generated `search_vector`). Confirmed
  `ON DELETE CASCADE` works (deleting the page rows cascaded chunk deletion). All test rows
  cleaned up afterward — both tables verified empty (`count(*) = 0` on both) before moving on.
- [ ] **DOC-27** stale version rejection — `NEW`, depends on DOC-02. A query for `product=X
  version=Y` must never silently fall back to a different version's chunks; fail closed (same
  fail-closed pattern as `local-llm-offload-ownership`'s model resolution) if the exact version
  isn't indexed yet. **Partial evidence only — do not mark done from this alone.** DOC-06's live
  proof covers the *write-side* half of this invariant (the DB physically cannot collide two
  versions under one row, and physically cannot store a duplicate `(provider, product,
  product_version, url)` — both proven via real unique-constraint violations against the live
  table). It does **not** cover the *read-side* half this task is actually about: an application
  query for a `product_version` that has zero indexed rows must return a fail-closed
  "not indexed yet" result, not silently substitute the nearest other version's chunks. No query
  layer exists yet to prove or disprove that behavior — this remains unstarted until one does.

## Phase B — Deterministic extraction (before any LLM touches a page)

- [x] **DOC-04** BeautifulSoup deterministic normalizer, richer structure — done, live-tested.
  Audit (recorded before implementation, still holds): two owners exist and are correctly
  classified as non-competing, not duplicates needing merging. `atlas_external_docs.py::
  fetch_beautifulsoup()` is `CANONICAL_OWNER` for this pipeline; `langextract_service.py`'s
  `_fetch_html`/`_extract_html_text` stays `COMPATIBILITY`, unrelated to and not feeding the
  versioned doc corpus. **Implementation**: new pure function `extract_structured_text()` (no
  network I/O, unit-testable directly) replaces the old flatten-everything
  `main.get_text("\n", strip=True)` with a structure-preserving pass — `<pre>`/`<code>` blocks
  become fenced code blocks with language detected from Sphinx/Pygments/MkDocs/Docusaurus-style
  `class="language-python"`/`lang-cpp`/`highlight-sql"` conventions (checked on the tag and up to 4
  ancestors), `<table>` rows become pipe-delimited lines, `<h1>`-`<h6>` become `#`-`######`-prefixed
  lines matching `_heading_sections()`'s existing regex exactly (so real HTML headings now actually
  drive heading-based chunking, not just literal markdown input), and remaining inline `<code>`
  spans keep backtick markers. `fetch_beautifulsoup()` itself is now a thin wrapper: do the HTTP
  fetch, then call `extract_structured_text()`.
  **Real bug found and fixed while implementing, not just claimed**: the final `_normalize_ws()`
  pass collapses runs of spaces/tabs, which would have destroyed Python-significant indentation
  inside fenced code blocks (confirmed live: a `def kernel(x):\n    if x:\n        return 1`
  fixture came out as `def kernel(x):\n if x:\n  return 1` before the fix). Fixed by extracting
  each `<pre>` block into a single-line null-byte placeholder before normalization, then
  substituting the real (unnormalized, indentation-intact) fence text back in afterward — verified
  live with a nested-if fixture that the exact original indentation survives round-trip.
  **Live-tested inside the real container**: `python/test_atlas_doc_structure_extraction.py`,
  8/8 pass (heading-regex compatibility incl. a real `_heading_sections()` split proof, language
  detection + indentation preservation, table serialization, inline-code backticks, a
  double-counting regression guard for `<code>` nested inside `<pre>`, relative/fragment/mailto
  link handling, title fallback, empty-page handling). Full existing suite re-run alongside:
  `test_atlas_external_docs.py` + `test_atlas_okf_docs_pipeline.py` + `test_atlas_doc_coordinate.py`
  + `test_atlas_doc_manifest.py` = 36/36 pass, zero regression.
- [x] **DOC-05** `ExternalDocChunkV1` section-chunk contract — done, live-tested. `ChunkRecord`
  gained two new fields, both additive with empty-tuple defaults (zero behavior change for any
  existing caller that doesn't pass them): `code_blocks: tuple[Json, ...]` and
  `api_signatures: tuple[str, ...]`. New `extract_code_blocks_and_signatures(text)` — deterministic
  regex extraction only (design.md's governing principle: "never let an LLM invent structure a
  parser can extract exactly"), never LLM-derived: fenced-code-block regex for `code_blocks`
  (`{language, code}` per block, `language: None` not `""` when undetected); four signature-line
  patterns (function/method defs across `def`/`function`/`fn`/`func` styles, class/interface/
  struct/enum/trait declarations, `type X =` aliases, SQL `CREATE|ALTER|DROP TABLE|INDEX|
  FUNCTION|TYPE|VIEW` DDL) plus an inline-backtick-call pattern for `` `foo(bar)` ``-shaped spans,
  all deduplicated. Wired into `chunk_document()`: called once per chunk on that chunk's own text,
  so results stay scoped to that chunk's evidence span, matching `DocCoordinateV1`'s existing
  per-chunk section-anchor binding from DOC-02 (already wired, no additional work needed for the
  "DocCoordinateV1 binding" part of this task).
  **Real interaction bug found and fixed, not just the new fields added**: `_heading_sections()`'s
  existing chunker regex (`^(#{1,6})\s+...`) matches a `# comment` line inside a *fenced code
  block* just as eagerly as a real heading — confirmed live with a fixture where a Python
  `# Load the tile` comment inside a ` ```python ` fence split the code block apart and corrupted
  the heading stack (`('Load the tile',)` appeared as its own bogus top-level heading). This bug
  did not exist before DOC-04, because the old flatten-everything extractor never produced real
  fenced code blocks for `_heading_sections()` to misparse. Fixed: `_heading_sections()` now
  tracks fence state (toggles on a line starting with `` ``` ``) and skips heading-regex matching
  while inside one — verified live that the same fixture now keeps the fence intact under its real
  `('Usage',)` section and does not produce a bogus heading.
  **Known, accepted limitation, not silently ignored**: `chunk_document()`'s char-window slicer
  (the `maximum_chars`/`overlap_chars` boundary-finding loop) is not fence-aware — a single fenced
  code block that happens to straddle a char-window boundary can still be split across two chunks,
  which would make `extract_code_blocks_and_signatures()` see an unterminated fence in one half and
  extract zero `code_blocks` for it (the raw text itself is unaffected, only the parsed
  `code_blocks` field). This is a pre-existing limitation of the char-window design in general (the
  same was already true for splitting mid-paragraph), not something DOC-04/DOC-05 introduced or
  need to fully solve — recorded here rather than left as a silent gap; a future fence-aware
  boundary search in the char-window loop would close it if it proves to matter in practice.
  **Live-tested inside the real container**: `python/test_atlas_doc_code_signatures.py`, 10/10 pass
  (fenced block + language extraction, `None`-not-`""` for missing language, multi-block ordering,
  function/class/SQL-DDL signature detection, inline-backtick-call detection, cross-source
  deduplication, empty-input handling, full `chunk_document()` end-to-end wiring proof across two
  real heading sections, and the fence-awareness regression guard above). Combined regression run
  with all prior Phase A/B test files: 54/54 pass.
- [ ] **DOC-03** Firecrawl bounded crawler — `EXISTS` (`fetch_firecrawl_v2`), verify
  bounded-crawl behavior (maxPages/maxDepth/sitemap-follow) matches the manifest's
  `maximum_pages`/`maximum_depth` fields; **blocked** on Firecrawl actually being registered
  (API key) — not required for Phase A/B, only for sources that need JS-rendering/recursive crawl
  beyond what a static BeautifulSoup fetch covers.

## Phase C — Classification and multi-representation projection

- [ ] **DOC-09** okf domain classification extension — `EXTEND`. `classify_domain`/
  `classify_ontology`/`domain_mapping.py::admit_domain_classification` exist; extend the taxonomy
  with the `kind: ExternalDocumentation` shape from design.md's `DomainClassificationV1`, keeping
  `canonicalAuthority: false` (okf classifies, does not own — per proposal.md's audit finding that
  Postgres, not okf, must be the evidence owner).
- [ ] **DOC-07** `semantic_768` representation — `EXISTS` (`embed_llama_server_768`), reuse as-is.
- [x] **DOC-06b** Postgres FTS projection — done as part of DOC-06's migration, not a separate
  step. `atlas_external_doc_chunks.search_vector` (`GENERATED ALWAYS AS
  to_tsvector('english', coalesce(text,'')) STORED`) + `aedc_fts_gin` GIN index landed in
  `20260904_external_doc_intelligence_v1.sql` and were live-proven there (`to_tsquery('english',
  'Ampere')` matched a real inserted row via the generated column). Recorded as its own line item
  here only for traceability against this task's own numbering — no further work needed.
- [ ] **DOC-08** Qdrant dense+BM25 hybrid projection — `EXTEND`. `qdrant_points()` exists (dense
  only, confirmed by reading the function); confirm/add named sparse (BM25) vector alongside dense
  `semantic_768` in the same point, per Qdrant's documented hybrid-query support — verify current
  `external_programming_docs_768` collection schema before assuming sparse is already there.

## Phase D — Semantic extraction (LangExtract/Ornith, source-grounded only)

- [ ] **DOC-11** Ornith OpenAI-compatible provider for LangExtract — `EXISTS, already default`.
  `langextract_service.py`: `LANGEXTRACT_PROVIDER` defaults to `"openai"`, `base_url` defaults to
  `http://localhost:8090/v1`. No work needed beyond confirming this path is what DOC-10 actually
  calls. `langextract_ollama.py` (358 lines, zero callers anywhere in `python/`) is dead/legacy —
  do not resurrect it, do not delete it (archive-not-delete), out of scope here.
- [ ] **DOC-10** LangExtract source-grounded extraction wired to this pipeline — `AUDIT_FIRST`.
  `langextract_service.py`/`atlas_langextract_runtime.py`/`atlas_structural_provenance.py` all
  exist; confirm which is the current canonical LangExtract entry point for *this* doc pipeline
  specifically (as opposed to code-extraction use cases) before wiring `DocumentationFactV1`
  production through it.
- [ ] **DOC-12** `ApiRuleV1` — `NEW`. Extraction target for LangExtract/Ornith on genuinely
  semantic material only (capability/constraint/deprecation/migration), per design.md.
- [ ] **DOC-13** doc↔symbol mutual index — `NEW`. Joins `ApiRuleV1.apiSymbol` /
  `DocumentationFactV1.subject` against this repo's existing AST symbol identity
  (`ast-grep-observation-adapter.ts`'s `stableSymbolId`), not a new symbol-identity scheme.

## Phase E — Graph relationships

- [ ] **DOC-14** Neo4j/cuGraph doc-relationship projection — `NEW` edges on existing graph infra:
  `API_SYMBOL -[DOCUMENTED_BY]-> DOC_SECTION`, `API_SYMBOL -[REQUIRES]-> CUDA_VERSION`,
  `API_SYMBOL -[SUPPORTS]-> ARCHITECTURE`, `EXAMPLE -[USES]-> API_SYMBOL`,
  `ERROR_PATTERN -[RELATED_TO]-> API_SYMBOL`. Reuses the existing Neo4j mirror + NetworkX/cuGraph
  parity-oracle pattern already established for code topology — no new graph store.

## Phase F — Agentic retrieval and repair loop

- [ ] **DOC-15** agentic docs retrieval fan-out — `EXTEND` the existing retrieval orchestrator
  (`src/lib/server/retrieval/orchestrator.ts` family) with the version/architecture-filtered branch
  from design.md's retrieval fan-out section — not a parallel orchestrator.
- [ ] **DOC-16** `AceRepairPacketV1` — `NEW` contract, `EXTEND` of the existing general ACE packet
  envelope pattern.
- [ ] **DOC-22** `PatchTargetV1` — `NEW`.
- [ ] **DOC-23** ast-grep repair planner — `EXTEND`. `ast-grep-observation-adapter.ts` exists for
  structural *observation*; the rewrite/patch-proposal half (pattern -> rewrite -> diff preview) is
  new, built on ast-grep's existing metavariable/YAML-rule rewrite mechanism, not a custom text
  editor.
- [ ] **DOC-24** `PatchProposalV1` — `NEW`.
- [ ] **DOC-25** compiler/test replay receipt — `EXTEND` of this repo's existing
  `ExecutionReceiptV1`-style receipt pattern (see `parent-atlas-retrieval-lineage-dag-convergence`
  for the established shape) applied to a patch-validate-test cycle.

## Phase G — Acceleration (optional, only after corpus is stable)

- [ ] **DOC-19** cuVS exact baseline — `EXISTS` (`GPU-MINI-FABRIC-01`), reuse.
- [ ] **DOC-20** CAGRA — `EXISTS` (`GPU-MINI-FABRIC-01`), reuse tuned `itopk_size` (default params
  proven insufficient at N=65536 in that gate — do not reuse default params blindly here).
- [ ] **DOC-21** IVF-PQ exact-refinement two-stage candidate generation (K0=80 -> exact refine ->
  final K=20 style) — `AUDIT_FIRST`. `GPU-MINI-FABRIC-01` tested `ivf_pq` as a CAGRA *build_algo*,
  not necessarily as a standalone two-stage generate-then-refine candidate pipeline — confirm which
  is actually needed before assuming the existing proof covers this use case.
- [ ] **DOC-17** `HotBucketDescriptorV1` BitFrost bucket warming — `NEW` contract, `EXTEND` of
  existing BitFrost. Descriptor-only (candidateOrdinals/docChunkIds/conceptIds/centroidIds), never
  the canonical documents in Valkey.
- [ ] **DOC-18** centroid routing — `EXTEND` of existing SOM/centroid infrastructure
  (`karpathy-gpu-enrich.mjs` family), applied to doc-chunk embeddings.

## Phase H — Operations

- [ ] **DOC-26** incremental version recrawl — `NEW`. Detect when a manifest source's
  `productVersion` changes and crawl only the delta, never overwrite the prior version's rows
  (depends on DOC-02/DOC-27).

## Explicitly deferred / not part of this proposal

- Registering Firecrawl as a live MCP server with a budget cap — separate follow-up, needs an API
  key provisioned first.
- A dedicated admin/search UI page for the doc corpus (mentioned in the original ask as
  "hypergraphrag admin page") — should extend the existing `/command-center/retrieval/` UI once
  Phase A-C prove the corpus is real and queryable, not be built speculatively first.
- Classifying `docs/.okf/dev/*`'s "okf.dev.manifest.v1" corpus as CANONICAL_OWNER / EXPERIMENT /
  DEAD relative to `atlas_okf_docs_pipeline.py`'s manifest lineage — flagged in proposal.md's Risks
  section, needs its own short audit before Phase A assumes they're the same generation.

## Validation gates (per phase, before moving to the next)

- Phase A: a fresh manifest source, dry-run only (no `--write-qdrant`), produces distinct
  `DocCoordinateV1`s for two different `productVersion`s of the same URL; a Postgres row exists for
  each with no collision.
- Phase B: BeautifulSoup extraction on a real page produces populated `codeBlocks`/`apiSignatures`,
  not just flattened text.
- Phase C: a query filtered by `{product, version, architecture}` returns zero cross-version
  contamination.
- Phase D: every `DocumentationFactV1`'s `[startChar, endChar)` span, read back against the
  canonical UTF-8 source bytes, matches `evidenceText` exactly.
- Phase F: one real `AceRepairPacketV1` end-to-end, measured payload size in the "1-5 KB" range
  claimed in design.md, not unbounded.
