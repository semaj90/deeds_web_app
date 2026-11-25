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
  **Hardening pass (same day, operator direction "OKF-DOC-PYDANTIC-MANIFEST-01")**: restructured
  `PipelineManifestV1`/`SourceConfigV1` to mirror the real on-disk manifest shape 1:1 with nested
  `QdrantConfigV1`/`EmbeddingConfigV1`/`FeaturesConfigV1`/`SomConfigV1` submodels (verified against
  the real `docs/.okf/dev/atlas-doc-fabric.manifest.example.json` fixture, embedded inline in the
  test file since the `miniforge-nlp-sidecar` container only mounts `python/`, not `docs/` —
  confirmed live via `docker exec ... ls /app/`) instead of the flattened
  `qdrant_collection`/`som_rows`-style fields from the first pass. Every model now sets
  `model_config = {"frozen": True, "extra": "forbid"}` at every nesting level, so a misspelled
  field (`allowd_domains`, `manifets_revision`, a typo'd nested `qdrant.colection`) is a validation
  error, not silently ignored. New `parse_manifest_json_v1(raw: bytes | str)` — real
  `model_validate_json` admission boundary, raw bytes straight to a validated model, no untyped
  dict passed through — and `atlas_okf_docs_pipeline.load_manifest()` now calls it directly on
  `Path(path).read_bytes()` instead of `json.loads()` + `parse_manifest_v1(dict)`.
  **Live-tested inside the real container**: `test_atlas_doc_manifest.py` grew from 11 to 16 tests
  (added: raw-bytes `model_validate_json` proof, three `extra="forbid"` rejection tests at
  top-level/source-level/nested-qdrant-level, and an end-to-end validation of the real fixture's
  exact embedded content) — 16/16 pass. Full combined regression: 59/59 pass across every Phase
  A/B test file, zero regression from the restructure.
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
- [x] **DOC-27** stale version rejection — moved to Phase B (see below, after DOC-06A), where
  the entry with full write-side + read-side evidence now lives — this line kept only so the
  task numbering stays discoverable from its originally-drafted position.

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
  Parser choice remains an explicit follow-up: `scripts/atlas/prove-bs4-parser-parity-v1.py`
  compares the current `html.parser` output with `lxml` when installed; it does not switch the
  production parser automatically.
  **Policy clarification:** BeautifulSoup remains the active static HTML owner. Trafilatura is a
  challenger only and is not installed in the workstation or `miniforge-nlp-sidecar`; do not add
  it without a frozen extraction-parity gate. Docling/OCR remains the separate PDF/office/image
  lane and must not replace the HTML acquisition owner.
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
  **Byte-safe span alignment (same day, operator direction)**: this repo already has a canonical
  chunk-span contract elsewhere — `CanonicalChunkV1` in
  `parent-atlas-canonical-directory-ingestion-fabric/design.md` — that uses `startByte`/`endByte`
  over exact UTF-8 bytes, not character indices; confirmed real and live via a direct read of that
  file (not assumed from the operator's description). `ChunkRecord` gained `start_byte: int = 0` /
  `end_byte: int = 0` (additive, defaulted, so the three existing direct `ChunkRecord(...)` test
  constructions are unaffected) as the new authoritative span; `start_char`/`end_char` remain but
  are now documented as secondary/diagnostic-only, never the identity/evidence-span authority.
  **Real, pre-existing bug found and fixed while implementing this, not just the new fields
  added**: the old `absolute_start = section_start + cursor` used the PRE-`.strip()` cursor
  position, so whenever a char-window's raw slice had leading whitespace — confirmed live this is
  common, not an edge case: an adversarial-but-realistic irregular-word-length fixture at
  `maximum_chars=53, overlap_chars=7` hit it on 12 of 50 chunks — `start_char` pointed one or more
  characters before `chunk_text`'s real position, so `normalized[start_char:end_char] != chunk.text`
  for those chunks. This existed before this session's DOC-05 work and was never caught because no
  prior test asserted the char span decoded back to the exact chunk text. Fixed by computing the
  real leading-whitespace trim (`len(raw_slice) - len(raw_slice.lstrip())`) and offsetting
  `absolute_start` by it. `start_byte`/`end_byte` are then derived from the (now-correct)
  `absolute_start`/`absolute_end` via UTF-8 prefix-byte-length (`len(normalized[:absolute_start]
  .encode("utf-8"))`), which is exact by construction since UTF-8 encoding is prefix-consistent.
  **Live-proven, not just asserted**: same adversarial ASCII fixture now has 0/50 char mismatches
  and 0/50 byte mismatches; a non-ASCII fixture (CJK + emoji + accented Latin, genuinely multi-byte
  UTF-8) has 0 byte mismatches across 26 chunks, and `start_byte`/`start_char` were confirmed to
  actually diverge (17 vs 14 on one sample chunk) rather than coincidentally staying equal, proving
  the byte computation is doing real work; `chunk_checksum` was confirmed to equal
  `sha256(normalized_bytes[start_byte:end_byte].decode("utf-8"))` exactly; every chunk's
  `to_dict()["canonical_authority"]` is `False` (no promotion from a chunk/plan/hash alone —
  Postgres admission, DOC-06A below, is the only promotion path); replaying `chunk_document()`
  twice on identical input produces byte-for-byte identical `(start_byte, end_byte, chunk_id)`
  tuples (determinism). New test file `python/test_atlas_doc_byte_safe_spans.py`, 8/8 pass.
  **Schema follow-through**: added `start_byte`/`end_byte` columns to the live
  `atlas_external_doc_chunks` table via a new additive migration
  (`sveltekit-frontend/drizzle/manual/20260904b_external_doc_chunks_byte_spans_v1.sql` —
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, per the Drizzle Safety Rule's "never rewrite an
  already-applied migration" convention rather than editing DOC-06's original file). Applied live
  and confirmed idempotent (second run: `NOTICE: column ... already exists, skipping`). Left
  nullable for now — `NOT NULL` is deferred until DOC-06A's admission writer (below) is the thing
  actually enforcing every row populates them, not added as a premature constraint ahead of it.
  Combined regression across all Phase A/B test files after this change: 67/67 pass.
- [x] **DOC-06A** `EXTERNAL_DOC_POSTGRES_ADMISSION_01` — done, live-proven (writer/adapter contract proven earlier; **pinned corpus admitted 2026-09-23, operator-confirmed:** 30 pages / 852 chunks committed via
  `sveltekit-frontend/scripts/atlas/run-external-doc-admission-v1.mts --apply`, `EXTERNAL_DOC_CANONICAL_ADMISSION_PROVEN`, receipt `docs/reports/external-doc-canonical-admission-v1.json`:
  852/852 rows match id, evidence revision, checksum, byte length and text; 30 unique page and 852 unique chunk revisions/ids in Postgres; generated FTS works (43 hits for `snippet`);
  no embeddings/Qdrant/Valkey/Neo4j; text = post-fidelity representation. Studio canonical FTS since proven, see STUDIO_CANONICAL_EXTERNAL_DOC_FTS; still open downstream: live embedding population for the 852 admitted chunks (DOC-07/DOC-08 are separately checked as infrastructure/projection proofs), analyses). Operator-directed,
  depends on DOC-04/05/06. The missing join: DOC-06 proved the tables and their invariants via
  hand-written SQL; nothing yet takes the real Python `chunk_document()`/`fetch_beautifulsoup()`
  output and transactionally admits it. Scope: a TypeScript admission adapter — Pydantic-validated
  manifest + BeautifulSoup page/chunk artifacts (already produced by the Python pipeline) →
  `PostgresAdmissionAdapter` → `atlas_external_doc_pages`/`atlas_external_doc_chunks` → readback
  verification → `ExternalDocAdmissionReceiptV1`. Python crawler must not write Qdrant/Postgres
  directly going forward for this lane; the order is crawl → canonical Postgres admission →
  (later) semantic/NLP enrichment → Qdrant/Neo4j/cache projections, never crawl → semantic → Qdrant
  → maybe-Postgres-later.
  **Duplication-prevention audit performed before writing any code** (per this repo's own hard
  rule, and per the earlier DOC-00 pass's own documented failure mode — CLAUDE.md's "Hard Rule:
  Audit packages/* Before Moving Anything" — of searching app-side first and missing a real
  packages/* contract). Found a real, substantial, previously-unaudited TS fabric:
  `packages/parent-atlas/src/core/external-doc-*.ts` (8 files, built 2026-08-19 — ~2 weeks before
  this session's Python DOC-01 work, and NOT caught by this change's original DOC-00 audit, which
  only checked `packages/parent-atlas/src/core/ast-grep-observation-adapter.ts` and missed this
  entire adjacent family — recorded here as the same mis-scoped-search failure mode CLAUDE.md
  already warns about, happening again). Verified directly, not assumed:
    - `external-doc-knowledge-fabric.ts` — Zod contracts (`externalDocSourceSchema`,
      `externalDocChunkSchema`, `externalDocFabricManifestSchema`, etc.) strikingly similar in
      shape to this change's Python `SourceConfigV1`/`ChunkRecord`/`PipelineManifestV1` — but
      **zero Postgres usage anywhere in the whole `external-doc-*` family** (confirmed via grep
      across all 8 files, 0 hits for postgres/drizzle/db.insert/db.execute). **This confirms
      DOC-06A is not a duplicate** — no existing owner writes validated external-doc evidence to
      Postgres anywhere in this repo.
    - `firecrawl-v2-capture.ts` (writer, → SeaweedFS cold storage via `archiveExternalDocCapture`)
      has **zero callers** anywhere in `sveltekit-frontend/src` — unwired.
    - `external-doc-retrieval-port.ts` (Qdrant hybrid reader, collection
      `external_programming_docs_hybrid_768`) has exactly one real caller:
      `scripts/docs-atlas/prove-external-doc-retrieval.mts`, a fixture-driven recall@k/MRR
      benchmark for a Qdrant-version capability-gated hybrid-migration cutover — requires external
      fixture files never checked into this repo, and no result artifact exists on disk
      (`docs/reports/parent-atlas/external-doc-retrieval-proof-latest.json` doesn't exist) —
      **never actually run**.
    - `external-doc-qdrant-hybrid.ts` confirms `external_programming_docs_768` (the exact
      collection name this change's own manifest fixture and DOC-08 already target) is that
      migration's own `source_collection` — i.e. **DOC-08's planned dense-only projection is the
      prerequisite this fabric is waiting for, not a naming collision with it.**
    - **Real staleness flag for DOC-08/DOC-09, not fixed here (out of DOC-06A's bounded scope,
      recorded so the next session doesn't miss it)**: `externalDocChunkSchema`/
      `externalDocSourceSchema` predate DOC-02's version-qualification entirely — no
      `productVersion`/`architecture`/`DocCoordinateV1` fields, no byte-safe spans, no
      `codeBlocks`/`apiSignatures`. Whoever implements DOC-08 must extend these TS contracts (or
      explicitly supersede them) rather than silently building a second, disconnected chunk shape
      on the TS side while the Python side already carries version identity.
  **Implementation**: `sveltekit-frontend/src/lib/server/atlas/docs/external-doc-admission.ts` —
  follows this repo's established raw-`pg.Pool`-injected pattern (matching
  `pagerank-promotion-gate.ts`'s `constructor(private db: Pool)` / parameterized-query style, not
  Drizzle ORM, since these two tables aren't declared in `schema-postgres.ts`). Exports
  `admitExternalDocPage(pool, input)`: recomputes every chunk's sha256 checksum server-side
  (never trusts the caller-provided checksum — the canonical-evidence-authority boundary), opens a
  transaction, upserts the page row (`ON CONFLICT (evidence_revision) DO UPDATE` — same
  evidence_revision means identical content, safe idempotent no-op-ish touch; a genuinely
  different evidence_revision under the same `(provider,product,product_version,url)` correctly
  still hits the *other* unique constraint and fails loudly, which is the right behavior — an
  operator must decide explicitly when content changes under an unchanged version/url, never a
  silent overwrite), upserts every chunk row the same way, re-**reads back** every chunk from the
  table (not trusting the `RETURNING` clause of its own `INSERT` alone) and verifies count +
  checksums before `COMMIT`; rolls back and rethrows on any mismatch. Returns
  `ExternalDocAdmissionReceiptV1` (`manifestRevision`, `sourceRevision`, `pageEvidenceRevision`,
  `pageId`, `chunkIds`, `pageCount`, `chunkCount`, `expectedChecksums`, `readbackChecksums`,
  `versionQualified`, `architectureQualified`, `transactionCommitted`, `writesPerformed`). Also
  exports `retrieveExternalDocs(pool, query)` — DOC-27's read-side (see below), same file.
  **Correction on the checksum-mismatch behavior actually implemented**: the checksum-recompute
  validation runs *before* any DB connection is opened (not a mid-transaction rollback for that
  specific case) — a stronger guarantee (never even attempts a write), verified precisely rather
  than the original task text's looser "rolls back and rethrows on any mismatch" framing; a true
  mid-transaction rollback path exists separately for the readback-count/checksum-mismatch case.
  **Live-proven against the real Postgres database, not simulated or mocked** (per this repo's own
  "integration tests must hit a real database, not mocks" convention): new
  `sveltekit-frontend/scripts/atlas/prove-doc-06a-admission-v1.mts`, connects via `pg.Pool` directly
  (`DATABASE_URL` from `.env`), run from `sveltekit-frontend/` (running from the repo root hits a
  duplicate `@types/pg` across workspaces — a real, confirmed structural TS mismatch even though
  it's the same package at runtime; documented in the script's own header comment). 14/14 checks
  pass: first admission commits with matching expected/readback checksums and
  `versionQualified`/`architectureQualified` both `true`; identical-input replay returns the same
  `pageId` with zero duplicate chunk rows (idempotent); a chunk with a deliberately wrong checksum
  is rejected (`ADMISSION_CHUNK_CHECKSUM_MISMATCH`) with zero extra page rows created; a page with
  genuinely different content under the *same* `(provider,product,productVersion,url)` fails with a
  real Postgres `duplicate key value violates unique constraint` error (not a silent overwrite —
  the original row's `content_hash` confirmed unchanged afterward); `retrieveExternalDocs` returns
  `FOUND` for an indexed version and `VERSION_NOT_INDEXED` (listing `13.2` as available, `13.3` as
  not) for a genuinely unindexed one — DOC-27's exact required behavior, live-proven, not asserted
  from the write-side alone. All test rows cleaned up and confirmed empty afterward.
- [x] **DOC-27** stale version rejection — done, live-proven (both halves). Write-side proven by
  DOC-06 (version-collision rejection via the DB's own unique constraints) and reconfirmed by
  DOC-06A's "same identity, different content" test above. Read-side — the actual subject of this
  task — is `retrieveExternalDocs(pool, {provider, product, productVersion, architecture?})` in
  `external-doc-admission.ts`: queries `atlas_external_doc_pages` filtered by the exact requested
  version (+ optional architecture); if zero rows match, returns `{status:
  'VERSION_NOT_INDEXED', requestedVersion, availableVersions}` (a second query lists what *is*
  actually indexed for that provider/product, purely informational — never returned as if it
  answered the request) instead of silently falling back to a different version's rows. Live-proven
  as part of DOC-06A's proof script above: requesting the indexed `13.2` returns `FOUND` with
  exactly one page; requesting the never-indexed `13.3` returns `VERSION_NOT_INDEXED` with
  `availableVersions: ["13.2"]` — confirms the fail-closed behavior end to end, not just at the
  database-constraint level.
- [x] **DOC-CANARY-ADMISSION-01** (opened 2026-09-23; operator-authorized and run 2026-09-23: `DOC_CANARY_ADMISSION_ROLLBACK_PROVEN`) three-page
  rollback canary: 3 of the 30 pinned pages (`docs/.okf/pinned`, envelopes from
  `scripts/atlas/build-external-doc-admission-envelopes-v1.py`) -> existing `admitExternalDocPage` (needs a small runner; the
  writer has no pipeline caller yet) -> exact page/chunk/checksum/version/byte-span readback + generated-FTS query -> ROLLBACK ->
  `atlas_external_doc_pages/chunks` back to 0 rows. No embeddings, no `:8081`, no Qdrant. Only after this passes may the 30-page
  canonical text load be authorized. Evidence baseline: `docs/reports/external-doc-chunk-evidence-identity-v1.json`
  (`EXTERNAL_DOC_CHUNK_EVIDENCE_IDENTITY_PROVEN`, 30 pages / 847 chunks, 0 duplicate chunk revisions).
  **Prerequisite: EXTERNAL_DOC_CHUNK_TEXT_INDENTATION_FIDELITY** — 23/30 pages are chunked from a second-normalized text that collapses
  code indentation; the canary must exercise the FINAL canonical text representation, not a known lossy intermediate. The runner must be
  TypeScript (calls `admitExternalDocPage`; the Python crawler must not write Postgres).
  **Frozen order (open versioned-doc tasks):** `EXTERNAL_DOC_CHUNK_TEXT_INDENTATION_FIDELITY` -> replay chunk/page hashes + uniqueness ->
  `DOC-CANARY-ADMISSION-01` (temporary transactional write, rolled back) -> real 30-page corpus admission -> `EXTERNAL_DOC_ANALYSIS_OWNER_01`
  -> derived analysis (Ornith / LangExtract). Anything whose acceptance needs actual Postgres corpus rows waits for real admission.
  `EXTERNAL_DOC_ANALYSIS_OWNER_01` (schema/owner design) is independent of admitted rows unless its own design requires them;
  `EXTERNAL_DOC_CHUNK_ID_COLLISION_AUDIT` is independent of this chain. Not started; no mutation authorized by this note.
  DOC-06A above proves the writer/adapter contract only; canonical pinned-corpus admission has NOT run.
  **Result (2026-09-23, `--apply`, receipt `docs/reports/external-doc-canary-admission-v1.json`):** baseline 0/0 -> inside the transaction 3 pages / 46 chunks
  -> exact id/evidence-revision/checksum/byte-length/text readback 0 failures, generated-FTS query returned 13 hits (token `snippet`) -> ROLLBACK -> 0/0, independently
  re-confirmed with psql. No embeddings, no :8081, no other stores. The real 30-page canonical admission then ran separately (see DOC-06A above).
  **Runner (built earlier the same day):** `admitExternalDocPage` COMMITs its own transaction, so a
  rollback canary cannot wrap it directly; `src/lib/server/atlas/docs/external-doc-canary-v1.ts` maps the writer's BEGIN/COMMIT/ROLLBACK onto
  savepoints inside one always-rolled-back outer transaction (4 no-database vitest tests incl. the real writer against a fake client).
  `sveltekit-frontend/scripts/atlas/run-doc-canary-admission-v1.mts`: default DRY RUN (validated handoff, 3 pages = first page of the first 3 sources
  by id: bits-ui, drizzle-kit, drizzle-orm; 46 chunks; 0 DB connections); `--apply` additionally requires
  `ATLAS_DOC_CANARY_AUTHORIZED=I_AUTHORIZE_ROLLBACK_CANARY`, aborts if the canonical tables are not empty, reads back id/checksum/byte-length/text
  and a generated-FTS hit, rolls back, and requires counts back to 0. Receipt path `docs/reports/external-doc-canary-admission-v1.json`
  (written only by `--apply`). Fidelity prerequisite is now met (see EXTERNAL_DOC_CHUNK_TEXT_INDENTATION_FIDELITY, 852 chunks).
- [x] **EXTERNAL_DOC_CHUNK_ID_COLLISION_AUDIT** review `chunk_id` (`doc:<source_id>:<16-hex truncated document digest>:<ordinal>`) for
  address/key collisions only; unchanged by the identity repair and does NOT redefine `chunkEvidenceRevision` (proven separately, not
  reopened); must not be combined with it. **Audit done 2026-09-23 (read-only, 0 writes; `docs/reports/external-doc-chunk-id-collision-audit-v1.json`):**
  current corpus 852 chunks / 852 unique chunk_ids, no shared (source, digest16), no duplicate page hashes. Latent finding F1: chunk_id excludes
  page URL/version, so identical normalized text under one `source_id` across two versions/aliases would violate `UNIQUE(chunk_id)` on the second
  admission (fails closed, never overwrites); 64-bit truncation risk is negligible. `chunk_id` NOT changed; if multi-version admission of identical
  text is expected, open a separate contract change (add page evidenceRevision or version+url digest) with a replay proof.
- [x] **EXTERNAL_DOC_CHUNK_TEXT_INDENTATION_FIDELITY** `chunk_document` re-normalized page text and collapsed code indentation (23 of 30 stored
  pages differed from the text the byte spans address). Scope: canonical text-buffer / UTF-8-span correctness before
  admission; blocks DOC-CANARY-ADMISSION-01. **Done 2026-09-23 (offline, 0 datastore writes, `EXTERNAL_DOC_CHUNK_TEXT_INDENTATION_FIDELITY_PROVEN`):**
  `python/atlas_external_docs.py::_normalize_ws` is now fence-aware (lines inside ``` fences keep indentation; prose still collapses;
  unterminated fence protects the remainder) and idempotent on `extract_structured_text` output. Replay
  (`docs/reports/external-doc-chunk-text-fidelity-v1.json`): stored-text-vs-chunked-text mismatches 23 -> 0; 30 pages / 852 chunks
  (was 847; windows now measure real indentation); page `contentHash` == sha256 of stored text; 0 byte-span slice mismatches;
  852 unique chunk evidence revisions and 852 unique `chunkId`s. All content hashes for the 23 code pages changed, so the earlier
  847-chunk receipt (`external-doc-chunk-evidence-identity-v1.json`) is superseded for counts only; its identity design is unchanged.
  Tests: 5 new `ChunkTextIndentationFidelityTests` (idempotence, fenced indent preserved, unterminated fence, exact byte-span slicing,
  page hash == chunk checksum); 76 focused Python tests + 38 vitest tests pass; DOC-06A handoff still `EXTERNAL_DOC_ADMISSION_HANDOFF_READY`.
  Not covered: the 7 pages without fenced code were already stable; nothing re-crawled (fix applies to stored evidence).
- [x] **EXTERNAL_DOC_ANALYSIS_OWNER_01** create `atlas_external_doc_analyses` for `ExternalDocAnalysisV1` (append-only by chunk evidence
  revision + analysis type + producer/model/prompt revision) after a fresh owner audit; `analysis_pass_results` and `atlas_summary_layers`
  are packet-keyed and not reusable. `20260923_external_doc_summaries_v1.sql` is `DRAFT_SUPERSEDED_PENDING_ANALYSIS_OWNER` and must not be applied.
  Per-chunk BitFrost/Valkey analysis warming stays blocked until canonical chunks exist. Scope: derived-analysis persistence design,
  not canonical chunk storage. **Applied and proven 2026-09-23 (operator-authorized; `EXTERNAL_DOC_ANALYSIS_OWNER_APPLY_PROVEN`, receipt `docs/reports/external-doc-analyses-owner-proof-v1.json`):** `sveltekit-frontend/drizzle/manual/20260923b_external_doc_analyses_v1.sql`
  (append-only via trigger, FK to `atlas_external_doc_chunks(evidence_revision)`, `canonical_authority=false`, contract refinements as CHECKs);
  4 static vitest tests (`external-doc-analyses-ddl.spec.ts`) pin it to `ExternalDocAnalysisV1` fields/types. DDL applied with `psql -1` (table + 3 indexes +
  trigger, table empty). Proof in one always-rolled-back transaction with a synthetic page+chunk: insert, idempotent replay (`INSERT 0 0`), new model revision appends (2 rows);
  rejected: bogus chunk FK, UPDATE, DELETE, SUMMARY without text, model without revisions, `canonical_authority=true`, bad checksum, deleting a referenced chunk; after rollback
  0 analyses / 0 chunks / 0 pages. Only the empty analyses table persists; no analysis rows were written.
- [x] **EXTERNAL_DOC_CANONICAL_ADMISSION_VERIFY** independent read-only re-verification of the admitted corpus (2026-09-23; `scripts/atlas/verify-external-doc-canonical-admission-v1.mts`, receipt `docs/reports/external-doc-canonical-admission-v1.json`, `EXTERNAL_DOC_CANONICAL_ADMISSION_PROVEN`). The earlier `--apply` outcome is confirmed SUCCEEDED from live Postgres, not from the receipt: 30 pages / 852 chunks / 0 analyses; 30 unique page and 852 unique chunk evidence revisions and ids, 0 duplicate groups, 0 unexpected rows; 852/852 checksum, byte-span, byte-length and exact-text parity with the envelopes; 8 distinct product/version identities. Canonical FTS (source `CANONICAL_POSTGRES`): `hnsw.iterative_scan` 2, `hnsw.scan_mem_multiplier` 1, `io_method` 3, `Bitmap Heap Scan` 17, `uuidv7` 3, `drizzle-kit` 26, `$derived` 29 (25 literal). Studio smoke now `DOC_INTELLIGENCE_STUDIO_READINESS_PROVEN` with the canonical corpus `PRESENT`, and live Studio search hits are all badged `CANONICAL_POSTGRES`. No embeddings, :8081, Qdrant, Valkey, Neo4j or Graphify; semantic/vector/Ornith/LangExtract/GPU tasks untouched.
- [x] **STUDIO_CANONICAL_EXTERNAL_DOC_FTS** Parent Atlas Studio searches the admitted canonical Postgres corpus (2026-09-23, `STUDIO_CANONICAL_EXTERNAL_DOC_FTS_PROVEN`, receipt `docs/reports/doc-corpus-studio-canonical-fts-v1.json`). Postgres rows are the search authority: `searchDocCorpus` queries `atlas_external_doc_chunks` through the existing generated `search_vector` GIN index (no BM25, pg_search, extra column, Qdrant or local pinned files) with optional exact-match `product` / `productVersion` filters (bounded; admin GET `/api/admin/atlas/docs-corpus/search`; plain SSR GET form `?docq=&docprod=&docver=`, no JavaScript needed). Every canonical hit carries `sourceClass: CANONICAL`, `pageId`, `chunkId`, `chunkEvidenceRevision` (chunk grain, distinct from the page revision), provider/product/productVersion, URL, `headingPath` and a snippet; local captures are `REFERENCE_ONLY`/`GENERATED_CORPUS` with null canonical ids. Live results (852 chunks, read-only): `hnsw.iterative_scan` 2, `hnsw.scan_mem_multiplier` 1, `io_method` 3, `Bitmap Heap Scan` 17, `uuidv7` 3, `drizzle-kit` 26, `$derived` 29. Direct-SQL parity is exact for all 7 queries on ordered chunkId, chunkEvidenceRevision, pageId, page revision, provider/product/productVersion, URL and headingPath; snippet source: 64 hits are exact substrings of the row text and 12 are subset-only (see finding). The 8 stored product/version identities are exposed exactly as stored (`CURRENT_UPSTREAM@2026-09-23`, `UNVERSIONED@2026-09-23`, `18`; no invented semver). A canonical zero-hit query returns an empty CANONICAL result (no reference fallback); a database failure falls back to local results labelled `LOCAL_LEXICAL` / `REFERENCE_ONLY` with a `POSTGRES_UNAVAILABLE` note, never CANONICAL. Tests: read-model, panel SSR (canonical / zero-hit / fallback), route (4) and live SSR (`ATLAS_LIVE_DOC_DB=1`); Studio smoke 4 files / 50 tests, `DOC_INTELLIGENCE_STUDIO_READINESS_PROVEN`, canonical `PRESENT`. Finding (display only, follow-up): PostgreSQL `ts_headline` treats `<...>` as markup and splices around it in the displayed snippet (e.g. `<project root>` in a code block); stored `text` and checksums are unchanged. No embeddings, :8081, Qdrant, Valkey, Neo4j, Graphify, Ornith or LangExtract; DOC-19/20/21 untouched. 0 store writes.
- [x] **EXTERNAL_DOC_ADMISSION_RUNNER_RESUMABLE_01** exact-resume reconciliation implemented through `external-doc-admission-plan-v1.ts`; existing `admitExternalDocPage()` remains the only writer. Focused classifier/replay tests prove exact pages are skipped, only missing pages reach the writer, crashes resume, and conflicts fail closed. Live read-only `--plan` receipt `docs/reports/external-doc-admission-resumability-v1.json`: 30 exact / 0 missing / 0 conflict, 30 pages / 852 chunks, 0 writer calls. Corpus supersession remains unsupported and separately gated as `EXTERNAL_DOC_CORPUS_SUPERSESSION_01`; no live apply/re-admission occurred.
- [x] **DOC-03** Firecrawl bounded crawler — live bounded proof passed
  `python/atlas_okf_docs_pipeline.py::firecrawl_crawl_v2`; keep the full indexing pipeline out of
  this proof. The request is built by `build_firecrawl_crawl_v2_request()` and unit-tested against
  manifest page/depth/sitemap settings, with external links, subdomains, and whole-domain crawl
  disabled. Live canary runner: `scripts/atlas/prove-doc-03-firecrawl-live-bounded-v1.py`;
  receipt: `docs/reports/parent-atlas/doc-03-firecrawl-live-bounded-v1.json`; owner audit:
  `docs/reports/parent-atlas/doc-03-firecrawl-bounded-owner-v1.json` (`DOC_03_LIVE_BOUNDED_CRAWL_PROVEN`).
  The 3-page/depth-1 canary returned exactly 3 same-domain Firecrawl v2 pages; requested limit,
  depth, sitemap=`skip`, domain scope, and disabled external/subdomain/domain-wide crawling all
  matched readback. The v1 `ignoreSitemap` field was replaced with the v2 `sitemap` enum after the
  first request was rejected with HTTP 400. Credentials and page bodies are absent from receipts;
  no corpus, database, Qdrant, Neo4j, or Valkey writes and no canonical promotion occurred.

## Phase C — Classification and multi-representation projection

- [x] **DOC-09** okf domain classification extension — done, live-tested. Reused, did not
  duplicate: `atlas_external_docs.classify_domain`/`classify_ontology` (rule-based label
  extraction) and `parent_atlas_ontology.domain_mapping.admit_domain_classification` (okf's
  existing classifies-does-not-own admission boundary).
  **Real gap found and fixed in the existing mapping table**: `classify_domain()`'s `DOMAIN_RULES`
  can emit `gpu`/`training`/`model_runtime`/`cache`/`protocol`/`testing`/`api` for external
  documentation, but `domain_mapping.py`'s `_DEFAULT_MAPPINGS` (built for codebase-file
  classification, a different corpus) never covered any of them — every external-doc chunk
  landing in one of those domains was silently `UNMAPPED`. Added all 7 as new
  `DomainOntologyMappingV1` entries (additive, existing entries untouched). Confirmed this doesn't
  regress anything: `mapping_revision()`'s checksum changes when this tuple changes, but nothing
  in this repo's tests pins the old checksum value — the one test that touches a related checksum
  (`test_domain_classification_signal_parity.py::test_shared_fixture_matches_typescript_checksum_contract`)
  tests a *different* function (`domain_classification_signal_checksum` from `domain_tuple_bridge.py`)
  and was already failing before this change for an unrelated reason (`FileNotFoundError` on a
  fixture path outside this container's `python/`-only mount) — re-ran the pre-existing 6-failure
  baseline in `test_domain_classification_signal_parity.py`/`test_domain_tuple_bridge.py` after
  this change and got the identical 6 failures, confirming no new regression.
  **New**: `python/atlas_doc_domain_classification.py` — `DomainClassificationV1` (Pydantic,
  frozen, `extra="forbid"`), design.md's exact `kind: 'ExternalDocumentation'` envelope
  (`metadata.{domain,provider,product,version,capabilities,architectures,languages,retrievalTags}`,
  `primary`, `subdomain`, `confidence`, `evidenceRefs`, `producerRevision`, `canonicalAuthority`
  hard-literal `false`). `classify_external_doc_domain(chunk, producer_revision=...)` builds it
  from a `ChunkRecord`: `provider`/`product`/`version`/`architecture`/`language` from the chunk's
  own `DocCoordinateV1` (DOC-02, empty strings/tuples when absent — no crash on pre-DOC-02
  callers); `confidence` from the *real* `admit_domain_classification()` result (`1.0` if
  `ADMITTED`, `0.5` otherwise) — deliberately not a bare "isn't the fallback label" heuristic, so
  it actually exercises the mapping-table extension above. **`capabilities` deliberately reuses
  the chunk's own already-extracted `api_signatures` (DOC-05) rather than a hand-curated keyword
  list** — design.md's governing principle is "extract deterministic structure first, enrich
  semantically second," and inventing a second, speculative capability taxonomy here would be
  exactly what that principle warns against.
  **Live-tested inside the real container**: `python/test_atlas_doc_domain_classification.py`,
  16/16 pass — all 7 newly-admitted labels confirmed `ADMITTED` (not just `gpu`); envelope shape
  matches design.md field-for-field including the `kind`/`canonicalAuthority` literals; confidence
  genuinely reflects the real admission result (proven with a fixture requiring a literal `CUDA`
  keyword to actually trigger the `gpu` `DOMAIN_RULES` pattern, not `tile_ir`/`sm_86` alone, which
  don't match any rule); capabilities proven to equal the chunk's own `api_signatures` exactly, not
  a separately-invented list; no-`DocCoordinateV1` case handled without crashing;
  `canonical_authority` confirmed `False` on every chunk; frozen immutability; out-of-range
  confidence and empty-evidence-refs both rejected. Combined regression across every Phase A/B/C
  test file: 83/83 pass.
- [x] **DOC-07** `semantic_768` representation — done, live-proven (was previously untested
  reuse, not just unverified). `embed_llama_server_768()` already existed and was already wired
  into `atlas_okf_docs_pipeline.py`'s real end-to-end pipeline stage (`discover_and_fetch ->
  compile_chunks -> embed_llama_server_768 -> PageRank/low-rank/cluster features ->
  build_qdrant_points -> optional explicit-opt-in `write_qdrant`), confirmed by reading the source
  — but had **zero existing tests anywhere in this repo** before this session. Confirmed the
  target embedding server is genuinely live in this environment: `curl :8081/v1/models` ->
  `n_embd: 768`, `owned_by: llamacpp` (matches memory's Session 201 "EG-GGUF" local llama.cpp
  challenger executor, not the Ollama `embeddinggemma:latest` primary path — this function targets
  whichever backend `manifest.embedding_url`/`embedding_model` point at, unchanged either way).
  **New**: `python/test_atlas_doc_semantic_768.py`, 8/8 pass — 3 real live-integration tests against
  the actual running `:8081` server (768-dim + finite + L2-normalized output; distinct texts
  produce distinct vectors, not a degenerate constant embedding; two calls on identical text are
  bit-reproducible), auto-skipped with a clear reason if the server isn't reachable in a given
  environment rather than failing hard; 4 fail-closed guard tests (mocked, since a healthy real
  server won't produce these failure shapes on demand) proving `embed_llama_server_768()` actually
  raises — never silently substitutes a zero vector — on a missing `embedding` key, an empty
  `data` array, a wrong-dimension vector (512 instead of 768), and a non-finite (`NaN`) vector; one
  static source-inspection test proving the pipeline's real call sites actually pass
  `manifest.embedding_url`/`manifest.embedding_model` through, so a future refactor that silently
  drops that wiring fails a test instead of going unnoticed. Combined regression across every Phase
  A/B/C test file: 91/91 pass.
- [x] **DOC-06b** Postgres FTS projection — done as part of DOC-06's migration, not a separate
  step. `atlas_external_doc_chunks.search_vector` (`GENERATED ALWAYS AS
  to_tsvector('english', coalesce(text,'')) STORED`) + `aedc_fts_gin` GIN index landed in
  `20260904_external_doc_intelligence_v1.sql` and were live-proven there (`to_tsquery('english',
  'Ampere')` matched a real inserted row via the generated column). Recorded as its own line item
  here only for traceability against this task's own numbering — no further work needed.
- [x] **DOC-08** Qdrant dense projection — done, live-proven. Scoped per this task's own
  reconciliation decision below: option (a), dense-only. `AUDIT_FIRST` (upgraded from `EXTEND` —
  DOC-06A's audit found real prior art this task must reconcile with before writing code, not
  just extend `qdrant_points()` in isolation). `qdrant_points()` exists (dense only, confirmed by
  reading the function). **Before implementing**: `packages/parent-atlas/src/core/
  external-doc-qdrant-hybrid.ts` already has a designed (not yet live-run) blue/green migration
  from `external_programming_docs_768` (this task's own dense-only target — confirmed to be that
  migration's own `source_collection`, not a naming collision) to a hybrid
  `external_programming_docs_hybrid_768` shadow collection, gated behind a live Qdrant-version
  capability probe (`external-doc-runtime-capabilities.ts`). **Do not build a third, disconnected
  hybrid-projection design.** Either: (a) implement DOC-08 as dense-only into
  `external_programming_docs_768` first (matches this task's original scope, and IS the
  prerequisite the existing migration plan is already waiting for), and leave the hybrid cutover
  to that existing, more mature TS design; or (b) if hybrid is wanted in the same pass, extend the
  existing `external-doc-qdrant-hybrid.ts` machinery rather than writing new sparse-vector logic
  from scratch. Also: `externalDocChunkSchema`/`externalDocSourceSchema` in
  `external-doc-knowledge-fabric.ts` predate DOC-02's version-qualification (no
  `productVersion`/`architecture`/`DocCoordinateV1`, no byte-safe spans, no
  `codeBlocks`/`apiSignatures`) — if DOC-08's payload construction imports these TS contracts,
  extend them with version-qualification first rather than silently shipping a Qdrant payload that
  can't be filtered by version/architecture.
  **Resolution taken**: option (a) — dense-only into `external_programming_docs_768`, leaving the
  hybrid (dense+BM25) cutover to the existing, more mature `external-doc-qdrant-hybrid.ts`
  machinery rather than building competing sparse-vector logic. The TS staleness flag on
  `externalDocChunkSchema` doesn't block this option — DOC-08's payload construction is Python-side
  (`qdrant_points()`/`build_qdrant_points()`), it never imports the TS contracts, so the flag
  remains open for whoever eventually builds the TS-side hybrid cutover, not resolved here.
  **Discovered during this task, not previously known**: `qdrant_points()`/`build_qdrant_points()`
  (dense-only point construction + fail-closed shape/finiteness checks + deterministic UUID
  point-id projection replacing a raw-hex string that Qdrant's point-ID format wouldn't accept)
  already had real unit test coverage before this session
  (`test_build_points_replaces_legacy_hex_projection_with_uuid`,
  `test_qdrant_projection_fails_closed_on_zero_or_wrong_vectors`) — this task's "dense only,
  confirmed by reading the function" framing undersold how complete this half already was.
  **The actual gap**: `qdrant_upsert()`/`qdrant_ensure_payload_indexes()` — the real HTTP write
  path — had zero tests, live or otherwise, anywhere in this repo. Verified live before writing
  any test that `external_programming_docs_768`'s real, currently-deployed vector schema is
  exactly the unnamed dense `{size: 768, distance: "Cosine"}` this task assumes (`GET
  /collections/external_programming_docs_768`), confirming no named-vector/hybrid conflict exists
  today (`points_count: 0` — genuinely never populated, consistent with DOC-06A's audit finding
  that this whole lane has never been run end to end).
  **New**: `python/test_atlas_doc_qdrant_projection.py`, 2/2 pass — live-proven against the real
  Qdrant instance (not mocked), using a disposable test collection
  (`external_programming_docs_768_doc08_proof`, created and torn down within the test fixture,
  never touching the real collection). Asserts, before creating the disposable collection, that
  the real collection's live vector schema still matches this task's dense-only assumption (fails
  loudly instead of silently testing a stale assumption if that ever drifts). First test:
  `build_qdrant_points()` output round-trips through a real `qdrant_upsert()` PUT and a real
  point-level `GET` readback — point ID, payload `chunk_id`, and `canonical_authority: false` all
  confirmed to match on the server, not just in the constructed payload. Second test:
  `qdrant_ensure_payload_indexes()`'s receipt shape confirmed correct, and the fields it declared
  (`source_revision`, `domain_class`) are confirmed present in the collection's own
  `payload_schema` afterward via a direct `GET`. Confirmed live afterward that the disposable
  collection was fully deleted and `external_programming_docs_768` remained untouched
  (`points_count: 0`, unchanged). Combined regression across every Phase A/B/C test file: 93/93
  pass.

## Phase D — Semantic extraction (LangExtract/Ornith, source-grounded only)

- [x] **DOC-11** Ornith OpenAI-compatible provider for LangExtract — audited, confirmed correct
  live, one non-blocking finding recorded. `langextract_service.py`'s `DEFAULT_MODEL` fallback
  string (`"gemma4-legal-iq4xs-direct"`) is stale code -- live-confirmed `GET :8090/v1/models`
  actually serves `ornith-1.5-9b`. **Confirmed NOT a live bug**: llama-server accepts a mismatched
  `model` field silently when only one model is loaded (verified live: a request with the stale
  name got a real completion back, `response.model: "ornith-1.5-9b"`), and the deployed
  `miniforge-nlp-sidecar` container has `LANGEXTRACT_MODEL_ID=ornith-1.5-9b` /
  `LANGEXTRACT_MODEL=ornith-1.5-9b` correctly set as environment variables (confirmed via `docker
  exec`), which `DEFAULT_MODEL`'s `os.getenv(...)` chain reads before ever reaching the stale
  literal. Real risk is narrower than a live bug: a *fresh* deployment without those env vars set
  would silently claim the wrong model in `run_extraction()`'s own `metadata.model_id` and
  `/health`'s `"model"` field -- a provenance-accuracy gap, not a functional one. Not fixed here
  (out of DOC-11's own "no work needed" scope, and `langextract_service.py` turned out not to be
  the live extraction path anyway -- see DOC-10 below); flagged for whoever next touches that file.
  `langextract_ollama.py` (358 lines, zero callers anywhere in `python/`) confirmed still dead/legacy
  — do not resurrect, do not delete (archive-not-delete), out of scope here.
- [x] **DOC-10** LangExtract source-grounded extraction wired to this pipeline — `DRY_RUN_PROVEN`
  as of the 2026-09-04 multi-turn-prompt fix addendum below (see for full evidence). Originally:
  `EXTEND_CANONICAL_OWNER_RESOLVED`,
  live owner is `miniforge_nlp_sidecar_oak.py` → `miniforge_nlp_sidecar_v2.py`; the existing
  generic `CONCEPT` path remains unchanged. The additive `/extract/documentation-facts` route now
  reuses the centralized Ornith controls and emits UTF-8 byte-authoritative spans, but remains
  `LIVE_FACT_PROVEN_API_RULE_COVERAGE_OPEN`: the schema/provider correction now yields a non-empty
  exact fact replay with stable normalized output checksum.
  No Postgres, Qdrant, Neo4j, or analysis-pass writes are performed by this route.
  Live boundary evidence: `docs/reports/parent-atlas/doc-10-12-live-contract-v1.json` confirms
  route registration, Ornith `ornith-1.5-9b`, controls, `canonicalAuthority=false`, and 422 on a
  mismatched SHA-256 source revision. Two identical live calls returned one fact each with equal
  output checksums and `MATCH_EXACT` byte alignment. API-rule coverage and the remaining negative
  cases are still open.
  **Audit finding, more layered than the task's own framing assumed**: `langextract_service.py` is
  NOT the live extraction path — it has no running container of its own (confirmed:
  `docker ps` shows only `miniforge-nlp-sidecar`). The real live chain, confirmed by reading
  `docker inspect miniforge-nlp-sidecar`'s actual entrypoint (not assumed from a plausible-looking
  filename) is three files deep: `miniforge_nlp_sidecar.py` (base module, defines
  `_grounded_extractions()`/`_ensure_grounded_provider_controls()` — the real, mature,
  well-guarded CONCEPT-extraction machinery, including a critical Ornith/llama.cpp-specific
  provider patch: forces `chat_template_kwargs.enable_thinking: False` and disables
  `cache_prompt`, applied by monkeypatching `OpenAILanguageModel._build_chat_completions_params`
  process-globally) → `miniforge_nlp_sidecar_v2.py` (the module that actually owns `app =
  FastAPI(...)` and registers the real live routes — `/extract`, `/extract/file`, `/extract/web`,
  etc. — some delegating to `legacy.*` names from the base module, some (`_native_grounded_extractions`)
  reimplementing natively while still reusing `legacy._ensure_grounded_provider_controls()`) →
  `miniforge_nlp_sidecar_oak.py` (the actual container entrypoint per `docker inspect`'s `Cmd`,
  imports `_v2.py`'s `app` and attaches two more routers on top).
  **A real mistake made and caught within this same investigation, not left standing**: first
  attempt added a new `/extract/documentation-facts` route (with a `DocumentationFactV1`
  Pydantic contract, a `_grounded_documentation_facts()` sibling function reusing the existing
  provider patch, and a subject/predicate/object-shaped prompt/schema per design.md) to
  `miniforge_nlp_sidecar.py` — the *base* module — and restarted the container assuming that was
  the live file. `GET /openapi.json` after restart proved the route was never registered (only the
  pre-existing `/extract`, `/extract/file`, `/extract/web` present), which is what surfaced the
  real 3-file chain above. **Confirmed zero impact from this**: the 404 proves the change never
  routed live traffic; the edit was `git checkout`-reverted cleanly (`172 insertions` removed,
  clean diff after revert) and the container restarted again to confirm it returned to its
  original, unmodified, healthy state (`GET /health` → `ornith-1.5-9b`, unchanged).
  **Second attempt, correctly targeted this time, status `WIRED` — NOT `DRY_RUN_PROVEN`, exact
  cause not yet found.** Added `_native_documentation_facts()` + `DocumentationFactRequestV1`/
  `DocumentationFactV1`/`DocumentationFactResponseV1` + `POST /extract/documentation-facts` to
  `miniforge_nlp_sidecar_v2.py` (the real `app`), mirroring `_native_grounded_extractions()`'s
  exact pattern (`factory.ModelConfig` + `OpenAISchema` strict schema, `host.docker.internal:8090`
  base URL, few-shot `ExampleData`, `legacy._ensure_grounded_provider_controls()` reuse for the
  Ornith no-thinking/no-cache_prompt patch) plus an explicit exact-match span check the CONCEPT
  path doesn't have (`text[start_pos:end_pos] != extraction_text` → reject), since design.md
  requires exact alignment for `DocumentationFactV1` specifically. Syntax-checked
  (`ast.parse`), container restarted, `GET /health` confirmed healthy, `GET /openapi.json`
  confirmed the route registered this time (the mistake above is what surfaced needing to check
  this). **Confirmed non-breaking**: re-ran the pre-existing `/extract` CONCEPT path with real
  input after the restart — still produces real `alignment_status: match_exact` grounded
  extractions (`sm_86`→`ARCHITECTURE`, `Kepler`→`GPU_GENERATION`), unaffected by the new addition.
  **The new route itself, however, returns zero facts on real input** (`{"facts":[],"error":null}`)
  for text that obviously contains extractable claims ("Tile IR kernel programming requires sm_86
  or later architecture. CUDA Tile IR is deprecated on Kepler-generation GPUs..."). Debugged
  directly in Python (bypassing HTTP) before giving up: confirmed `legacy._grounded_extraction_error`
  stays `None` (no exception, no silently-swallowed failure) and the raw
  `result.extractions` list from `langextract.extract()` itself is empty (`len() == 0`) — the
  problem is upstream of this task's own extraction/filtering logic, inside LangExtract's own
  handling of the stricter 5-required-field schema (`subject`/`predicate`/`object`/`statement`/
  `confidence`, vs `CONCEPT`'s 2-field `concept_id`/`ontology_class`, which works). Ruled out two
  specific hypotheses with real tests, not guessed: (1) the generated JSON Schema itself is
  malformed — compared side-by-side against `legacy._grounded_output_schema()`'s working shape,
  structurally identical (`additionalProperties: false`, correct `required` list); (2)
  `max_tokens: 256` is too small for a 5-field structured response — retested with `max_tokens:
  1024`, still zero extractions. **Real, open question for the next session**: why a stricter/
  larger LangExtract schema silently yields zero extractions on this model/provider combination
  even with a matching few-shot example and generous token budget — needs deeper debugging (e.g.
  inspecting the raw completion behind langextract's parsing, trying `strict=False`, or a smaller
  attribute set) before this can be marked `DRY_RUN_PROVEN`. Left deployed live (additive-only,
  confirmed non-breaking, returns a well-formed empty response rather than erroring) since removing
  it would only cost re-investigation time later for zero safety benefit. DOC-12 (`ApiRuleV1`)
  depends on DOC-10 actually producing real extractions and is not started.
- [x] **DOC-12** `ApiRuleV1` — `LIVE_NEGATIVE_MATRIX_PROVEN` as a normalized sibling output of the same
  `/extract/documentation-facts` execution. API rules require grounded symbol/version/condition/
  recommendation fields and carry the same UTF-8 byte evidence span; live non-empty extraction and
  replay evidence are still required before promotion. Boundary evidence is recorded in
  `docs/reports/parent-atlas/doc-10-12-live-contract-v1.json`; no durable writes occurred.
  Follow-up live proof: an API-symbol fixture returned one `ApiRuleV1` on each of two identical
  calls with equal normalized output checksums and `MATCH_EXACT`; a mismatched SHA-256 source
  revision returned 422, and a structure-only fixture returned zero rules. Keep open for the
  remaining admission/negative matrix and downstream indexing.
  Follow-up live proof: an API-symbol fixture returned one `ApiRuleV1` on each of two identical
  calls with equal normalized output checksums and `MATCH_EXACT`; a mismatched SHA-256 source
  revision returned 422. Keep the checkbox open for the remaining negative/admission matrix.
  **Independent third fixture, novel (2026-09-04, same day, after the multi-turn prompt fix
  landed in `_native_documentation_facts`/`miniforge_nlp_sidecar.py`'s `build_params` patch —
  see DOC-10's addendum above)**: `"cudaMalloc(size_t size) allocates size bytes on the device.
  Deprecated since CUDA 11: use cudaMallocAsync instead."`, never used in any prior DOC-12 test,
  produced one correct `ApiRuleV1` — `apiSymbol: "cudaMalloc"`, `versionRange: "CUDA 11"`,
  `condition: "deprecated since CUDA 11"`, `recommendation: "use cudaMallocAsync instead"`,
  `alignmentStatus: MATCH_EXACT`. Confirms DOC-12 benefits from the same multi-turn fix (both
  functions share `_ensure_grounded_provider_controls()`'s patch) and isn't overfit to the
  fixtures already used to debug it. The bounded live negative/admission matrix is now proven
  by `scripts/atlas/prove-doc-12-api-rule-negative-matrix-v1.mjs` with report
  `docs/reports/parent-atlas/doc-12-api-rule-negative-matrix-v1.json`: grounded rule and exact
  UTF-8 evidence bytes, stale/missing source revision rejection, and structure-only rejection.
  Downstream indexing/projection remains separately gated by DOC-14 through DOC-18.
- [ ] **DOC-13** doc↔symbol mutual index — `NEW`. Joins `ApiRuleV1.apiSymbol` /
  `DocumentationFactV1.subject` against this repo's existing AST symbol identity
  (`ast-grep-observation-adapter.ts`'s `stableSymbolId`), not a new symbol-identity scheme.
  Added the read-only exact-match adapter/proof at
  `scripts/atlas/prove-doc-symbol-mutual-index-v1.mjs`; fixture proof covers matched,
  stale-revision, ambiguous, and unmapped outcomes. Live read-only registry join/readback is
  now proven for the existing `atlas_symbol_registry` + `atlas_symbol_versions` owners via
  `scripts/atlas/prove-doc-symbol-mutual-index-live-v1.mjs` (200 active rows read; exact
  canonical-name/source-revision match; existing `stable_symbol_id` and `symbol_version_id`
  returned; no writes). Follow-up corrected the cross-artifact revision boundary: the live
  DOC-12 extraction now joins one `ApiRuleV1` to the exact existing symbol identity while
  preserving separate documentation and code source revisions (`LIVE_DOC_EXTRACTION_SYMBOL_JOIN_PROVEN`).
  Do not compare documentation `sourceRevision` to code `symbol_versions.source_revision`.
  The same read-only proof now records stale-code-revision rejection and unmapped-symbol
  rejection; no duplicate symbol version was present in the bounded live sample, so ambiguity
  is reported as `NOT_OBSERVED` rather than fabricated. Keep the gate open for broader live
  ambiguity coverage and downstream index admission.

  **Documentation repair pilot (2026-11-24):** Captured one official PostgreSQL 18 text search
  page and five Markdown pages from the SvelteKit 2.59.1 release commit using the existing .okf
  acquisition pipeline. Independent local readback matched all 114 chunk spans and the ten requested
  PostgreSQL signature spans. The admission planner matched the PostgreSQL page bytes and 14 chunks,
  then classified the page as `MISSING` in PostgreSQL with zero writer calls. The 8095 AST and ast-grep
  stages ran on ten selected working-tree files with per-file digests. Individual comparison
  disagreements are retained in their receipts. The admin runtime-error export uses the existing
  diagnostic ranking at limits 10, 100, and 1,000. A read-only database probe preserved order across
  all three limits. A separate live pgvector corpus replay reached ACE using already admitted
  documentation. The new error-to-citation path remains blocked on canonical documentation admission
  and current diagnostic source and task binding. Pilot receipt:
  `.tmp/atlas/doc-repair-pilot-v1/pilot-review.json`.

  **DOC-13 status decomposition (ledger-only, 2026-09-23 audit; verdict `MULTIPLE_GATES_COLLAPSED_INTO_ONE_TASK`; acceptance
  semantics unchanged, checkbox stays open; artifacts below re-verified present).** Only the DOC-13 bullet itself (up to the
  "DOC-10/DOC-12 root cause found" paragraph) is DOC-13; the long DOC-10/DOC-12 notes that follow (before Phase E) are separate history, not DOC-13 work.

  | Sub-gate | Purpose | Owner | Status | Mutation / runtime |
  |---|---|---|---|---|
  | 13.A | exact-match adapter + fixture outcomes (matched/stale/ambiguous/unmapped) | `prove-doc-symbol-mutual-index-v1.mjs`, receipt `doc-13-symbol-mutual-index-v1.json` | PROVEN (fixture) | no / no |
  | 13.B | live read-only join to `atlas_symbol_registry` + `atlas_symbol_versions` | `prove-doc-symbol-mutual-index-live-v1.mjs`, receipt `...-live-v1.json` | PROVEN (read-only; 402 active rows) | no writes / Postgres read |
  | 13.C | doc vs code revision-domain separation (`targetSourceRevision`) | shared exact-match helper (deterministic tests) | PROVEN | no / no |
  | 13.D | live DOC-12 extraction -> symbol join | live proof | PARTIAL: extracted rule has no target code revision -> `UNRESOLVED`; resolves only in the labeled registry-backed control | no / needs sidecar |
  | 13.E | ground a target code revision to current source authority | current-source-authority chain | BLOCKED (depends on `CURRENT_SOURCE_AUTHORITY_PROVEN`) | no / no |
  | 13.F | broader live ambiguity coverage | live proof | PROVEN (all 20 ambiguous name/code-revision groups replayed through the existing resolver; all returned AMBIGUOUS) | no / Postgres read |
  | 13.G | downstream index admission | none yet | OPEN, depends on 13.E, canonical corpus admission, DOC-14+ | yes (persistent write) / yes |
  | 13.H | owner composition with `analysis_pass_results` + Ornith `:8090` | `prove-doc-symbol-nlp-dag-context-v1.mjs` | PROVEN (wiring only); pass selection, ContextManifest admission, SynthesisReceipt are separate open gates | no / no |

  Recommendation: keep the checkbox open until 13.E and 13.G close; work 13.E first (no mutation needed), 13.D follows from it.

  Composition follow-up: `scripts/atlas/prove-doc-symbol-nlp-dag-context-v1.mjs` confirms the
  indexed symbol/version owner, existing append-only `analysis_pass_results` owner, bounded
  `ParameterArtifactV1` checksums, and Ornith `:8090` synthesis boundary compose without a
  duplicate table or datastore write. This proves owner wiring only; current-pass selection,
  ContextManifest admission, and a live SynthesisReceipt remain separate gates.

  **DOC-13 revision-domain correction (2026-09-23, read-only):** review of the live proof found
  that the prior helper incorrectly compared `ApiRuleV1.evidenceSpan.sourceRevision` (the
  documentation artifact revision) directly with `atlas_symbol_versions.source_revision` (the
  code artifact revision). Those revisions are not interchangeable. The shared exact-match
  helper now requires an explicit, separately named `targetSourceRevision`, validates both as
  SHA-256 revisions, and returns `UNRESOLVED/TARGET_CODE_SOURCE_REVISION_MISSING` when the
  extracted rule has no code-revision binding. Five deterministic tests cover distinct document
  and code revisions, absent target revision, stale target, exact-revision ambiguity, malformed
  revision, and missing symbol. The read-only live replay now scans all 402 active registry rows
  with SHA-256 source and workspace revisions (instead of a 200-row prefix that included legacy
  `workspace:0` entries); the extracted rule has no target code revision and correctly remains
  unresolved. Full-cohort duplicate-name/revision ambiguity is exercised (4 candidates), and a
  separately labeled registry-backed resolver control matches only when its code revision is
  explicit. Receipt: `docs/reports/parent-atlas/doc-13-symbol-mutual-index-live-v1.json`;
  fixture receipt: `docs/reports/parent-atlas/doc-13-symbol-mutual-index-v1.json`.
  A separate READ ONLY transaction replayed every ambiguous name/code-revision group through the
  existing resolver: 20/20 returned `AMBIGUOUS` across the 402-row active revision-qualified
  cohort. A synthetic documentation revision was used only for schema validation, never compared
  to code revision. Receipt: `docs/reports/parent-atlas/doc-13-broad-ambiguity-live-v1.json`.
  A broader read-only SQL census now finds 20 ambiguous groups each for qualified and bare names
  (max 4 symbol versions/group), and none for canonical keys; it does not claim all groups were
  individually replayed. Receipt: `docs/reports/parent-atlas/doc-13-live-ambiguity-census-v1.json`.
  **DOC-13 remains open:** extraction has not yet grounded a target code revision to current
  source authority, and no downstream index admission was performed. No persistent store writes.

**DOC-10/DOC-12 root cause found (2026-09-04, later same day as the `doc-10-12-live-contract-v1.json`
receipt above — answers that receipt's own `nextInvestigation` item 1 directly)**: the zero-extraction
result is **not** a `DocumentationFactV1`-schema-specific problem, and it is **not currently
reproducible that CONCEPT extraction works** either — both are empty right now, live-verified via
`POST /extract` with `grounded_extraction_required:true` (`grounded_extraction_used:false`,
`structure.concepts:[]`). The `sm_86`→`ARCHITECTURE`/`Kepler`→`GPU_GENERATION` result cited earlier
in this file's DOC-10 entry did not reproduce on retest with the same input; whether that citation
was a stale/prior-run observation or degraded since is unresolved, but it is not current live
behavior.

Root cause, isolated by inspecting the raw HTTP request LangExtract actually sends (patched
`OpenAILanguageModel._process_single_prompt` in-process to print `api_params`/raw completion text,
inside the live `miniforge-nlp-sidecar` container — not simulated):
- `langextract.extract(config=ModelConfig(...))` folds `prompt_description` + every few-shot
  `ExampleData` into **one single flattened `user` message** in a literal `"Examples\nQ: ...\nA:
  {...}\n\nQ: <target>\nA: "` text format (via its internal `QAPromptGenerator`), with a generic
  system message (`"You are a helpful assistant that responds in JSON format."`) — never the
  detailed instructions. Confirmed by direct reproduction: 2 well-matched examples (including one
  matching the actual compound-sentence structure) still produced `{"extractions": []}`,
  deterministically (temp=0, seed=1729), for **both** the CONCEPT and DOCUMENTATION_FACT schemas.
- The identical extraction task, sent as a **real multi-turn** chat (`system` instructions +
  `user`(example text) + `assistant`(example JSON) + `user`(target text) — not flattened into one
  message) against the same `ornith-1.5-9b` endpoint with the same schema/temperature/seed,
  correctly returns non-empty extractions every time (verified for both a raw single-fact prompt
  and the CONCEPT case: `PostgreSQL`→`DATABASE`, `Redis`→`DATABASE` from real multi-turn messages).
  A raw system+user completion (no few-shot Q/A staging at all) also succeeds cleanly.
- Also ruled out and fixed along the way, real bugs, not the root cause but confirmed genuine:
  (1) `provider_kwargs["max_tokens"]` was silently dropped — `OpenAILanguageModel.
  _build_chat_completions_params()` reads `config['max_output_tokens']`, not `max_tokens`; every
  grounded-extraction call in both `_native_grounded_extractions()` and
  `_native_documentation_facts()` was going out with no token cap at all. Fixed: renamed to
  `max_output_tokens` in `miniforge_nlp_sidecar_v2.py` (both call sites). (2) `POST
  /extract/documentation-facts` genuinely 500'd (`NameError: name 'json' is not defined`) —
  `miniforge_nlp_sidecar_v2.py` used `json.dumps(...)` at its response-construction step
  (`outputHash=hashlib.sha256(json.dumps(...)...)`) with no `import json` anywhere in the file.
  Fixed: added the import. This means the route's own "returns a well-formed empty response rather
  than erroring" claim earlier in this file, and the `doc-10-12-live-contract-v1.json` receipt's
  `documentationFactCount: 0` result, were **not actually reached on a live call** at the time they
  were written for whatever request shape produced the response those artifacts show — after this
  fix, live-verified now: `200 OK` with a genuinely well-formed empty-facts envelope.
  **Conclusion on both bugs**: neither the token-cap nor the `json` import bug explains the
  zero-extraction result itself — reproduced zero extractions with `max_output_tokens` correctly
  set, and the raw HTTP layer (bypassing both bugs entirely) already showed the model producing
  correct output when prompted the working way.
- **What does NOT explain it** (ruled out with real tests, not assumed): JSON schema malformation
  (byte-identical structure to the working shape — moot now that CONCEPT also fails), token budget,
  `use_schema_constraints`/`output_schema` top-level wiring (passing the schema explicitly at the
  top-level `extract()` kwarg per LangExtract's own `output_schema=` docstring, instead of only
  inside `provider_kwargs.openai_schema`, changes nothing — still zero), and example quality/count.

**Real fix path, not yet implemented (scope decision needed, not blocked on further diagnosis)**:
LangExtract's public `extract()` API has no supported way to request real multi-turn few-shot
prompting for the OpenAI provider — the flattening lives in `langextract.prompting.
QAPromptGenerator`, internal to the library. Two options going forward, neither attempted here
because both change the *shared* `_native_grounded_extractions()` function (used by the pre-existing
CONCEPT path, not just this proposal's DOCUMENTATION_FACT addition), which is a bigger blast radius
than this task's own scope and needs a decision, not a silent rewrite:
  1. Monkeypatch/subclass the OpenAI provider (same pattern already used for
     `_ensure_grounded_provider_controls()`'s `_build_chat_completions_params` patch) to build real
     multi-turn messages from the example list instead of calling the original flattened builder.
  2. Bypass `langextract.extract()`'s prompt construction entirely for these two call sites: build
     the multi-turn request directly (proven working shape above), call the completion ourselves,
     and feed the raw JSON through `normalize_langextract_extraction`-equivalent span-finding —
     loses LangExtract's fuzzy-alignment resolver, would need `text.find()`-based exact-match
     alignment instead (acceptable here since `_native_documentation_facts` already requires exact
     match and rejects fuzzy).
  Recommend option 1 (smaller diff, keeps the resolver) but this affects the live CONCEPT path
  used elsewhere in the NLP sidecar beyond this proposal — flagging for explicit decision before
  implementing, per this repo's own "record what you found, even when you don't fix it" rule.
  DOC-10/DOC-12 remain `IMPLEMENTED_UNPROVEN`, now with a proven, reproducible, understood cause
  instead of an open question.

**DOC-10 fixed and live-proven (2026-09-04, same session, option 1 above implemented on operator
"yes continue")**. Also **retracting one claim from the block immediately above**: "CONCEPT
extraction is not currently reproducible" was my own testing mistake, not a real regression —
`/extract`'s `structure.concepts` field is populated by an unrelated code path
(`_code_concepts()`/entity text list, `miniforge_nlp_sidecar.py` line ~2370), never by LangExtract's
grounded output; the grounded results were always in `metadata.grounded_extractions`, which I had
not checked in that pass. Re-verified against `metadata.grounded_extractions` specifically: the
pre-existing CONCEPT path's live behavior claim in the original DOC-10 entry stands, I just measured
it wrong on retest.

Implementation (`python/miniforge_nlp_sidecar.py`): `_ensure_grounded_provider_controls()`'s
existing `build_params` patch (already there for `chat_template_kwargs`/`cache_prompt`/
`response_format` conversion — those are a concurrent, unrelated edit to this same function, left
untouched) now also rebuilds real multi-turn `messages` when a new
`_grounded_extraction_context` global is set: `_set_grounded_extraction_context(description,
examples)` / `_clear_grounded_extraction_context()`, plus `_restructure_as_multiturn()`, which
deterministically recovers the current chunk's target question from LangExtract's own flattened
prompt text (`prompt.rfind("\nQ: ")` + strip the trailing `"\nA: "`) and rebuilds
`[system(description), *per-example(user, assistant-JSON), user(target)]`. Falls back to the
original flattened single-message prompt (returns `None`, patch leaves `params` untouched) if the
target text can't be recovered deterministically — never guesses.
`python/miniforge_nlp_sidecar_v2.py`: both `_native_grounded_extractions()` and
`_native_documentation_facts()` now wrap their `extract_fn.extract(**extract_kwargs)` call in
`try: legacy._set_grounded_extraction_context(...); result = ...(**extract_kwargs) finally:
legacy._clear_grounded_extraction_context()`.

**One more real bug found and fixed while wiring this in**: `_native_grounded_extractions()` was
missing its `from langextract.providers.schemas.openai import OpenAISchema` local import (present
in `_native_documentation_facts()` but absent from its sibling — root cause unclear, likely dropped
by an interleaved concurrent edit to this same file during this session; not something I removed).
Caused a live `NameError: name 'OpenAISchema' is not defined` surfaced immediately by testing after
my restart. Restored the missing import line.

**Live proof, both routes, real container, real `ornith-1.5-9b` completions** (restarted, healthy,
existing 6-test suite still green):
- `POST /extract` (`grounded_extraction_required:true`) on `"This module uses PostgreSQL for
  persistence and Redis for caching."` → `metadata.grounded_extractions`: 2 items, `PostgreSQL`→
  `DATABASE` (span 17-27, `match_exact`) and `Redis`→`CACHE` (span 48-53, `match_exact`).
- `POST /extract/documentation-facts` on the original 2-fact CUDA/Kepler fixture → 2 facts, both
  `alignmentStatus: MATCH_EXACT`, correct subject/predicate/object/statement/confidence.
- Same route on a fresh, harder 3-fact/3-sentence fixture ("PyTorch 2.13 removed CUDA 12.8
  support. The Redis client requires TLS in production. Batch size must not exceed 128 on 8GB
  GPUs.") never seen during debugging → **3/3 facts extracted, all `MATCH_EXACT`**, correct
  subject/predicate/object per sentence. Confirms this isn't overfit to the one fixture used to
  debug it.

**DOC-10: promoting to `DRY_RUN_PROVEN`.** `DOC-12` (`ApiRuleV1`) stays `IMPLEMENTED_UNPROVEN` —
`apiRules` was empty in every test above because none of the fixtures used were API-symbol-shaped
(function signature / parameter constraint text); the multi-turn fix should apply equally once
DOC-12's own extraction path is exercised with a matching fixture, but that's unverified, not
assumed. Whoever picks up DOC-12 next: reuse this same context-stash pattern if a third grounded-
extraction call site is added — do not reintroduce the flattened-prompt path.

## Phase E — Graph relationships

- [ ] **DOC-14** Parent Atlas documentation-relation projection — `NEW` typed edges on existing graph infra:
  `API_SYMBOL -[DOCUMENTED_BY]-> DOC_SECTION`, `API_SYMBOL -[REQUIRES]-> CUDA_VERSION`,
  `API_SYMBOL -[SUPPORTS]-> ARCHITECTURE`, `EXAMPLE -[USES]-> API_SYMBOL`,
  `ERROR_PATTERN -[RELATED_TO]-> API_SYMBOL`. PostgreSQL remains canonical for admitted source,
  packet and revision identity. Use the existing Graphify/graph-analysis contracts to build a
  derived, revision-bound graph; NetworkX CPU is the traversal/PageRank oracle and cuGraph/RTX is
  an optional challenger after exact input parity and resource admission. Do not require Neo4j or
  add another canonical graph owner. A bounded read-only historical Neo4j → NetworkX export
  preflight was recorded through
  `scripts/atlas/export-neo4j-concept-networkx-v1.py` and emits
  `docs/reports/parent-atlas/doc-14-neo4j-networkx-export-v1.json` with a revisioned projection,
  8,540 nodes, 10,000 bounded edges, `canonicalAuthority=false`, and no writes. This does not
  yet prove that the five documentation relationship types are present or admitted, so DOC-14
  remains open. The follow-up audit
  `scripts/atlas/audit-doc-14-relationship-export-v1.mjs` confirms only `HAS_ONTOLOGY`,
  `IN_DOMAIN`, and `USED_CONCEPT` were observed; all five requested documentation relation
  types currently count zero. No synthetic edges or projection writes were created.
  A pure fixture proof now validates all five typed relation contracts, explicit source and
  workspace revisions, evidence references, deterministic replay, and `canonicalAuthority=false`
  in `scripts/atlas/prove-doc-14-relationship-admission-fixture-v1.mjs`; report:
  `docs/reports/parent-atlas/doc-14-relationship-admission-fixture-v1.json`. This advances DOC-14
  to fixture-proven only; live admission remains required.
  **2026-11-22 local-corpus alignment:** the existing `scripts/atlas/compile-okf-docs-openspec-relations-v1.py`
  scans local `.okf/` and `docs/` files; the separately admitted Firecrawl corpus is in PostgreSQL
  and is not the same index. Its previous report counted 752 `.okf` files, 1,349 eligible `docs/`
  files, 48 parsed YAML manifests, 142 extracted strings and 4,512 explicit path references. The
  old report's `PROVEN` / `admittedTopKCount=10` did not mean Graphify admission: relation proposals
  were `TASK_RELEVANT_TO_DOCUMENT`, `PREDICTED`, and `PENDING`; no Graphify, NetworkX, PageRank,
  canonical graph write, or ACE injection was performed. The old implementation hashed only the
  ordered source paths into `graphRevision`, used a whole-file character-count span, and used a
  stable migration key where a namespaced `logicalTaskKey` was available. Its `dense` lane was
  YAML-concept token overlap; its `graph` lane was regex path mentions; its low-rank lane was
  NumPy SVD over the lexical/concept overlap matrix.
  The compiler now emits a separate review report at
  `docs/reports/okf-docs-openspec-relations-audit-20261122.json`: graph checksums include source
  content revisions and exact selected task bindings; task rows require matching current task-file
  SHA-256 plus `logicalTaskKey` / `taskRevision`; spans are labeled UTF-8 byte offsets and explicitly
  marked whole-source rather than citation excerpts; lane semantics and `graphifyIntegration=NOT_WIRED`
  are explicit. The first 16 selected open workboard tasks matched their recorded task-file hashes
  against the current checkout, but this does not refresh or qualify the entire workboard. The
  compiler's `LOCAL_CANDIDATES_VALIDATED` status is limited to local source and pre-ACE shape checks.
  It does not create Graphify edges.
  A second local-only pass now resolves explicit `DOCUMENT_LINKS_TO` mentions against the exact
  `.okf/` + `docs/` scan inventory, retains UTF-8 byte spans, and labels references outside that
  inventory unresolved instead of fabricating targets. The existing `python/atlas_graph_runtime`
  NetworkX CPU oracle ranked this frozen local graph: 2,101 nodes, 785 resolved directed links,
  and 3,727 unresolved mentions; the v2 receipt binds graph revision, executor version, and input/
  output checksums. Sampled edges include source and target SHA-256 revisions and the mention span.
  Report: `docs/reports/okf-docs-openspec-relations-audit-v2-20261122.json`. This proves local
  extraction and CPU PageRank execution only; it does not prove Graphify caller integration,
  canonical ontology mapping, external Firecrawl corpus identity, graph admission, ACE injection,
  GPU/cuGraph parity, or persistent readback. DOC-14 remains open and no store writes occurred.
  A non-promoting unresolved-target review queue now groups the 3,727 mentions into 2,325 literal
  target candidates: 2,832 mentions point to exact files present in the repository but outside
  this scan, 894 point to missing local paths, and one escapes the repository root. Ranking is
  deterministic: exact existing file first, then mention frequency, then lexical path; each row
  retains up to three source hashes and byte spans. The queue never auto-adds a node. Top candidate
  is `sveltekit-frontend/package.json` (52 mentions). The report records the full bounded review
  queue and hashes the top 100 only when each target is at most 1 MiB, under a 16 MiB total read
  budget; 96 candidates were hashed and four exceeded the per-file cap. These are local content
  hashes, not canonical workspace revisions. Expand a deliberate source cohort from reviewed
  exact-existing candidates before
  regenerating; do not crawl every path or treat frequency/PageRank as semantic truth.
  Remaining DOC-14 gates: map extracted strings to reviewed canonical ontology IDs; produce exact,
  source-byte evidence for each supported relation; reconcile local source artifacts and admitted
  external-document chunks without merging their identity domains; route proposals through the
  existing graph admission owner; then prove the same frozen graph revision through NetworkX CPU
  and optional cuGraph/RTX parity, resource admission, and independent readback. Keep the task open
  until these caller, admission, and readback gates are proven. No live Graphify refresh or store
  write was run in this pass.
  **Extractor evidence-binding follow-up (2026-11-22):** `stanza_observations()` now emits the
  predicate and relation-envelope character spans when the parser supplies them, with deterministic
  token-offset fallback. `chunk_document()` binds a valid envelope to the exact chunk ID, source ID
  and source revision, normalized document checksum, `NORMALIZED_DOCUMENT_UTF8_BYTES` interval, evidence-text hash,
  producer/model revisions, and explicit empty `ontology_ids`; unbound candidates are labeled
  `UNBOUND_EVIDENCE`. These remain `PROPOSAL_ONLY` and noncanonical. This is code-only progress:
  no focused test or real Firecrawl/Stanza batch was run, and no canonical ontology IDs, graph
  revision, Graphify incidence, ACE packet, or store write is claimed. These offsets address the
  persisted normalized document representation, not raw fetched HTML or
  original response bytes. Adversarial UTF-8/missing-offset tests remain open.
  `write_source_artifacts()` now writes a URL-disambiguated normalized Markdown artifact and
  verifies exact page-file and chunk UTF-8 byte slices, source/chunk revisions, span bounds, and
  evidence checksum before labeling a row
  `SPAN_READBACK_VERIFIED`; mismatches fail closed as `REJECTED` with a reason code. This code
  path has focused adversarial unit coverage: 21 tests passed across
  `python/test_atlas_external_docs.py` and `python/test_atlas_okf_docs_pipeline.py`, including
  non-ASCII UTF-8 boundaries, distinct pages sharing one source revision, and a corrupted span
  rejected as `EVIDENCE_SPAN_NOT_UTF8_BOUNDARY`. No bounded Firecrawl/Stanza batch was run, so
  live producer behavior and relation admission remain open.
  The existing `write_source_artifacts()` path now also emits deterministic per-source
  `relation-candidates.jsonl` rows beside `chunks.jsonl`, including source/chunk revisions,
  chunk checksum, the extracted candidate, span-validation result/reason, bound/unbound/rejected
  counts, and a checksum from the JSONL file's post-write byte readback. A byte mismatch raises a
  fail-closed error. This is a local derived proposal artifact only; it is not an ACE packet, Graphify incidence, or
  PostgreSQL admission record. Focused fixture tests now exercise its writer and readback path;
  no bounded Firecrawl/Stanza batch was run.
  **Hypergraph proposal bridge follow-up (2026-11-22):** span-verified candidate rows can now
  pass through the existing `atlas_external_doc_hypergraph.py` proposal owner using the exact
  normalized page bytes, matching chunk record, and pinned workspace revision. Participants are
  deterministic `mention:` IDs scoped to a tuple and ordinal; predicates are `UNMAPPED_VERB:*`;
  ontology/concept IDs stay empty and mapping remains `UNMAPPED_REVIEW_REQUIRED`. The resulting
  artifact is `PROPOSAL_ONLY`, has no graph revision, and performs no writes. This is a local
  proposal handoff only: no reviewed mapping, Graphify admission, ACE/Valkey publication, or live
  crawl has been demonstrated.
  **API documentation fact handoff (2026-11-22):** the batch writer also invokes the existing
  `atlas_graph_runtime.api_document_fact_v1` extractor for chunks with API signatures and writes
  separate `api-document-facts.jsonl` records with a post-write byte checksum. Facts remain
  `PENDING_ONTOLOGY_REVIEW`, with `DOCUMENTED_BY`, null ontology revision/object reference, and
  exact chunk-local UTF-8 spans. Unqualified source revisions retain the extractor's blocking
  reason instead of being upgraded. This does not complete ontology mapping, ACE/Graphify
  admission, or persistence.
  **DOC-14 pre-publication integrity gate (2026-11-22):** `atlas_doc14_span_integrity_v1.py` now
  validates every relation candidate against the normalized artifact's persisted byte readback and
  independently captured checksum before `relation-candidates.jsonl` can be replaced. It checks
  source/chunk/revision identity, chunk bounds and bytes, Stanza character-to-UTF-8-byte mapping,
  predicate and participant spans/text, evidence text and checksum, and normalized-document
  coordinate space. Any invalid/unbound row rejects the whole batch; publication uses a same-directory
  temporary file, readback, and atomic replace, preserving the prior JSONL on validation failure.
  The focused pipeline/extractor tests pass 22/22, including a corrupted multibyte span and a changed
  normalized source under the same claimed revision; both fail closed and preserve the prior artifact.
  GAN hook and strict OpenSpec validation are recorded in
  `docs/reports/doc14-span-publication-integrity-20261122.md`. This proves fixture-level code wiring
  only. A real Firecrawl/Stanza batch, independent source-index revision readback, ontology review,
  Graphify admission, ACE/Valkey write/readback, and centroid publication remain open; DOC-14 stays
  unchecked and no database or cache writes were performed.
  **Direct validator regression coverage (2026-11-22):** added
  `python/tests/test_atlas_doc14_span_integrity_v1.py` for Unicode character-to-byte offsets,
  independently expected capture checksum rejection, corrupted byte-span rejection with prior
  artifact preservation, missing chunk-boundary rejection, and valid atomic publication/readback.
  Windows Python 3.13 and WSL2 `atlas-rapids-cu13` each pass 5/5. These temporary-directory tests
  strengthen the existing publication gate; they do not admit ontology mappings or close DOC-14.
  **Typed proposal shape follow-up (2026-11-22):** Stanza extraction records now expose explicit
  `status=PROPOSED`, source-text subject/object mention candidates by participant role, and an
  `extractor_version`, while `canonical_authority=false` and empty ontology IDs remain unchanged.
  The fake-pipeline shape test and related publication/external-doc/pipeline suites pass 28/28 on
  Windows; the focused proposal-shape plus span suites pass 6/6 on WSL2. This proves contract
  output shape and byte integrity, not relation semantics, OAK mapping, Graphify admission, or ACE.
  The pipeline artifact fixture also asserts these proposal fields survive JSONL publication.
  The capture boundary now also compares the normalized file readback checksum to the checksum
  supplied by the fetch result before candidate processing. The changed-source fixture is rejected
  at this earlier boundary and leaves the prior candidate artifact byte-identical. A live producer
  run could not be performed in the inspected environments: local Python 3.13 and both configured
  WSL GPU environments lack the `stanza` package; reachable `:8095/health` advertises spaCy POS and
  LangExtract, not Stanza. No package/model was installed and no Firecrawl call was made. The next
  live proof therefore needs an approved Stanza runtime/model plus a bounded source manifest.
  **Bounded live capture-to-publication proof (2026-11-22):** after the prior environment audit,
  a separate CPU-oriented Python 3.13 environment was created outside the repository with Stanza
  1.15.1 and the English `tokenize,pos,lemma,depparse` models. Firecrawl MCP captured the official
  `https://docs.firecrawl.dev/quickstart` page (`scrapeId` `01a20557-513c-7154-944d-3b4a14646c6f`;
  normalized 77,991 bytes; content hash
  `21b4f9b4eddf12f9e697204c60078054c255f0489b11f781898da5e019a818c9`). The capture was supplied
  to the existing `PageArtifact`, `chunk_document()`, `stanza_observations()`, and
  `write_source_artifacts()` owners; only the first 8 of 56 document chunks were parsed. All 18
  generated candidates passed the span validator and remained `PROPOSAL_ONLY`. Two runs produced
  identical JSONL SHA-256 `8b016ef8ea9c6153eefe960b117cee06ca66659257d5ba6691354434d7c1575a`;
  independent readback confirmed 18 candidates bound to the captured document hash. An adversarial
  one-byte evidence-offset mutation was rejected with `EVIDENCE_CHARACTER_BYTE_MAPPING_MISMATCH`
  and preserved the previous artifact byte-for-byte. Receipt:
  `docs/reports/doc14-live-stanza-proof-20261122.json`. This is bounded live capture and local
  artifact proof, not the manifest-driven local Firecrawl fetch path: `:8095/evidence/web` returned
  503 `FIRECRAWL_NOT_CONFIGURED`, so Firecrawl MCP supplied the page. The source revision is a
  content hash, not a canonical source-index revision; no predicate/ontology review, Graphify
  admission, ACE/Valkey write/readback, or database mutation occurred. DOC-14 remains open.
  **Non-promoting semantic review handoff (2026-11-22):** the 18 verified live candidates are
  re-read into `docs/reports/doc14-relation-review-queue-20261122.json`; the handoff independently
  rechecked all 18 byte spans against the same captured normalized bytes and retains each source
  chunk, exact text, and byte interval. It records no ontology/concept IDs, reviewer decision, or
  admission. Ten of 18 candidates lack an explicit `subject` participant in Stanza's dependency
  output; the span validator deliberately does not treat participant count as semantic correctness.
  Review must assess role completeness, predicate meaning, and ontology mapping before any existing
  Graphify admission gate can run. The review packet is derived/test data only; no Graphify, ACE,
  cache, or database writes occurred.
  **Shared tuple proposal adapter (2026-11-22):** added
  `external-doc-hypergraph-tuple-proposals-v1.ts` to map the existing Python
  `atlas.hypergraph-fact-proposal.v1` wire record into the shared
  `OntologyLinkedTupleV1` shape. It rechecks the Python proposal checksum/ID, full source SHA-256,
  exact UTF-8 byte slice and evidence checksum; only mention-scoped `source_ref` participants
  with supported dependency roles are projected. Output remains `PROPOSAL_ONLY` /
  `REFERENCE_ONLY`, with empty ontology/concept IDs, unresolved participant resolution,
  `canonicalAuthority=false`, and `writesPerformed=false`. Four focused tests pass. This proves
  fixture-level contract wiring only: no actual Python producer-to-TypeScript invocation, canonical
  source-index readback, human relation decision, Graphify admission, ACE/Valkey write/readback,
  or database mutation was performed. DOC-14 remains open.

  **Official-docs MCP/PostgreSQL preflight (2026-11-22):** local `atlas-tools-mcp.mjs`
  advertises `inspect_postgres_backend` and `find_dependencies` now resolves through the
  revision-qualified Parent Atlas graph path; its read-only PostgreSQL inspector reports
  PostgreSQL 18 reachable with the required source/graph tables present. The inspection uses
  `BEGIN READ ONLY` and reports `writesPerformed=false`. The connected MCP runtime remains stale:
  its surfaced tool set omits `inspect_postgres_backend`, and live `find_dependencies` and
  `trace_database` still report `authority=neo4j_projection` / `PROJECTION_MISSING_FILE` or
  `UNRESOLVED`. Local MCP source now advertises version `0.3.0` with a source SHA-256 build
  fingerprint so a refreshed process can be identified. Focused local MCP tests pass 42/42,
  including inspector and fail-closed dependency-resolution contracts. A direct read-only lookup
  found no exact canonical external-doc row for `https://docs.firecrawl.dev/quickstart`; the
  earlier bounded Stanza capture remains a local proposal and is not canonical corpus evidence.
  No MCP process was restarted, no Firecrawl crawl was made, and no database, Graphify, ACE, or
  Valkey write occurred. **Still open:** refresh/reconnect the approved MCP process, verify its
  advertised version and fingerprint, then prove canonical official-doc retrieval and top-K
  evaluation before ACE/cache work. This note records a runtime blocker; it does not close DOC-14
  or DOC-15 and does not change task checkboxes.
  **MCP PostgreSQL tool follow-up (2026-11-22):** local `trace_database` now queries the
  PostgreSQL 18 code index's existing FTS lane and joins the latest unambiguous
  `atlas_workspace_source_bindings` revision for each candidate source. The response is capped at
  50, includes source/chunk and source/workspace revisions plus binding observation time, and labels
  results `LEXICAL_MENTION_CANDIDATE`; it makes no `USES_DB` assertion and performs no write. A
  live local MCP dispatch returned 50 candidates for `codebase chunk index` with
  `POSTGRESQL_CODE_INDEX_FTS`, `canonicalAuthority=false`, and `writesPerformed=false`. The focused
  MCP suite passes 44/44. Each returned candidate is additionally checked against the current
  workspace file's SHA-256 under a 2 MiB per-file / 16 MiB total read budget; the live result hashed
  207,372 bytes and excluded six stale or unverifiable raw rows. A true local stdio MCP initialize
  plus `tools/call` also returned version `0.3.0` and 50 candidates. In the same local checks,
  `find_dependencies` returned `SOURCE_NOT_INDEXED` for the documentation read-model and MCP server
  files. A bound file that did match the current source bytes instead failed with
  `SOURCE_INDEX_REVISION_CONFLICT` across historical workspace revisions. The existing structural
  edge plan is `CURRENT_STRUCTURAL_EDGE_PLAN_INCOMPLETE` with zero selected sources, nodes, and
  edges, and null `graphRevision`; therefore no live dependency edges or NetworkX graph answer are
  proven. The connected MCP process has not been
  refreshed and still exposes the older Neo4j behavior: a fresh connected `trace_database` call
  returned zero traces with `authority=neo4j_projection`; connected `find_dependencies` matched a
  Neo4j node but returned `NO_OUTGOING_EDGES` with a null graph revision. DOC-14/15 remain open; no
  checkboxes or canonical rows changed.

  **Graph readiness detail (2026-11-22):** local MCP version `0.4.0` extends the existing
  read-only PostgreSQL inspector with snapshot and edge-type counts. Live readback reports
  PostgreSQL 18 and present tables, but graph readiness is
  `SUPERSEDED_OR_REJECTED_ONLY`: 2 snapshots, 0 with graph/workspace/source-inventory revisions,
  0 non-superseded snapshots. All 224,764 stored edges belong to superseded snapshots and are
  `CONTAINS` (112,382), `MATERIALIZES` (58,304), or `DERIVED_FROM` (54,078); no active dependency
  edge set is available. Existing source-plan review is blocked: 0 exact current Graphify sources,
  39 missing Graphify sources, 8 ambiguous, 81 revision/content mismatches, and 4 local-byte
  mismatches. The source-authority receipt says `NO_CURRENT_SOURCE_SET`; its workspace revision
  (`ec542…`) differs from the source-plan (`c636…`) and empty structural-plan (`f476…`) revisions.
  The existing owner defers another Graphify run until a clean/current bound source pass or an
  admitted selector run. No source-binding write, graph materialization, or MCP reload was
  performed. This confirms the blocker is current source authority and graph production, not
  PostgreSQL table availability or PageRank implementation. The local `find_dependencies` graph
  resolver still requires its revision-qualified structural artifact; the Postgres snapshot
  counts are diagnostic only. This pass did not migrate remaining Neo4j-backed `find_feature`,
  `find_route`, `trace_tool_chain`, or plain-name `find_source_refs` lookups.

## Phase F — Agentic retrieval and repair loop

- [ ] **DOC-15** agentic docs retrieval fan-out — `EXTEND` the existing retrieval orchestrator
  (`src/lib/server/retrieval/orchestrator.ts` family) with the version/architecture-filtered branch
  from design.md's retrieval fan-out section — not a parallel orchestrator. The read-only owner
  audit `scripts/atlas/audit-doc-15-retrieval-fanout-owner-v1.mjs` confirms the existing hybrid,
  Postgres FTS, Qdrant, retrieval-orchestrator, and identity-resolution surfaces are present;
  report: `docs/reports/parent-atlas/doc-15-retrieval-fanout-owner-v1.json`. Same-query live
  fan-out replay and documentation-specific version/authority filtering remain open. The shared
  research/document retrieval runtime is now bounded-smoke proven by
  `scripts/atlas/prove-research-document-retrieval-v2.mjs` with report
  `docs/reports/research-document-retrieval-v2.json`; its stale container image was corrected by
  adding `COPY research_contracts.py` to `docker/langgraph-synthesis/Dockerfile` and rebuilding
  only `legal-ai-langgraph`. This proves shared runtime wiring, not DOC-15's documentation-specific
  fan-out or canonical admission. A bounded owner/fixture proof now records the existing
  same-query PostgreSQL + Qdrant fan-out, `stable_key` fusion, one semantic-lane vote, and
  version-before-fusion filtering in `scripts/atlas/prove-doc-15-same-query-fanout-v1.mjs`;
  report: `docs/reports/parent-atlas/doc-15-same-query-fanout-v1.json`. The report deliberately
  keeps live documentation fan-out/version-authority admission open and `canonicalAuthority=false`.
  **Live executor readback (2026-09-24, read-only):** `external_programming_docs_768` exists but
  reports `points_count=0`; `external_programming_docs_hybrid_768` returns HTTP 404. The hybrid
  point contract currently projects chunk/source revisions and classification fields but omits
  `product`, `product_version`, and `architecture`, so it cannot enforce the required version /
  architecture filters before semantic ranking. Receipt:
  `docs/reports/parent-atlas/doc-15-live-projection-readback-v1.json`. DOC-15 remains open pending
  a metadata-complete projection and live filtered same-query replay; no Qdrant or other store was
  written.
  **RD3 shared-owner proof (2026-09-23):** `scripts/atlas/prove-research-document-retrieval-v3.mjs`,
  receipt `docs/reports/research-document-retrieval-v3.json`, proves a valid bounded web-search
  result, deterministic BeautifulSoup fetch/normalization and exact UTF-8 chunk-span replay, the
  852-row revision-qualified/768-dimension docs corpus, live FTS hits, and exact-vs-HNSW parity on
  a stored-corpus self-query. It is explicitly `RESEARCH_DOCUMENT_RETRIEVAL_V3_PARTIAL_PROVEN`:
  no admission, MCP doc-search, TypeScript ParameterArtifact/DAG, ContextManifest, or code-fence
  ast-grep join was exercised. This does not close DOC-15 or authorize corpus/projection writes.
- [x] **DOC-16** `AceRepairPacketV1` — `NEW` contract, `EXTEND` of the existing general ACE packet
  envelope pattern. The strict runtime schema now binds candidate snapshot, ordinal map,
  packet/source/evidence references, diagnostic and documentation-rule references; it rejects
  unknown fields (including hidden thoughts, KV cache, tensor and raw prompt data), unqualified
  source revisions, duplicate ordinals and incomplete source/revision pairs. The existing fixture
  proof now parses through this schema. Contract tests:
  `packages/parent-atlas/test/ace-repair-packet-v1.test.mjs` (9/9); package TypeScript check
  passes with `npx tsc -p packages/parent-atlas/tsconfig.json --noEmit`; the fixture receipt is
  `DOC_16_ACE_PACKET_FIXTURE_PROVEN`. Live ACE composition, ContextManifest admission, and repair
  validation remain open; a separate synthetic no-write fixture composes the validated descriptor
  through the existing `buildAceContextManifestAdmissionV1` owner (5/5 focused ContextManifest
  tests), but this is not live/current-snapshot admission. This implementation is not a promotion
  or mutation authority.
- [x] **DOC-22** `PatchTargetV1` — `NEW`. **Executable fixture contract proven (2026-09-23):**
  exact source revision and UTF-8 byte slice/checksum validated, a stale base revision was rejected,
  and applying the hunk in memory produced the expected output checksum. No source file was
  modified; `canonicalAuthority=false`, `mutationAuthorized=false`. Producer/report:
  `scripts/atlas/prove-doc-22-patch-target-fixture-v1.mjs`,
  `docs/reports/parent-atlas/doc-22-patch-target-fixture-v1.json`.
- [x] **DOC-23** ast-grep repair planner — `EXTEND`. `ast-grep-observation-adapter.ts` exists for
  structural *observation*; the rewrite/patch-proposal half (pattern -> rewrite -> diff preview) is
  new, built on ast-grep's existing metavariable/YAML-rule rewrite mechanism, not a custom text
  editor. **Executable fixture proof completed (2026-09-23):** repository ast-grep CLI 0.45.3
  found exactly one structural match in an isolated temporary TypeScript fixture; its metavariable
  byte range derived the inner UTF-8 patch hunk, the CLI emitted a before/after rewrite preview,
  and the source bytes remained unchanged. Proposal base digest, hunk, and proposed digest match
  DOC-24's receipt. `canonicalAuthority=false`, `mutationAuthorized=false`, temporary directory
  cleaned. Evidence:
  `scripts/atlas/prove-doc-23-ast-grep-repair-planner-v1.mjs` and
  `docs/reports/parent-atlas/doc-23-ast-grep-repair-planner-v1.json`. This closes the planner's
  fixture contract only; reviewing/applying a real source patch remains separately gated by
  DOC-24 and explicit target-specific mutation authorization.
- [x] **DOC-24** `PatchProposalV1` — `NEW`. Fixture proof binds proposal ID, base source
  revision, patch digest, byte hunk, reasoning/analysis evidence, model/prompt revisions, and
  `mutationAuthorized=false`; see `scripts/atlas/prove-doc-24-patch-proposal-fixture-v1.mjs` and
  `docs/reports/parent-atlas/doc-24-patch-proposal-fixture-v1.json`. The isolated DOC-25 compiler
  and behavior replay now passes for this proposal. This closes proposal-contract validation only;
  no real source patch was applied, and any target-specific application still requires review and
  explicit mutation authorization.
- [x] **DOC-25** compiler/test replay receipt — `EXTEND` of this repo's existing
  `ExecutionReceiptV1`-style receipt pattern (see `parent-atlas-retrieval-lineage-dag-convergence`
  ). Fixture validation now records proposal reference, validation checks, validation checksum,
  `patchApplied=false`, and `mutationAuthorized=false`; see
  `scripts/atlas/prove-doc-25-compiler-test-replay-receipt-v1.mjs` and
  `docs/reports/parent-atlas/doc-25-compiler-test-replay-receipt-v1.json`. **Closed for the
  bounded synthetic fixture gate (2026-09-23):** the proposal's base revision and byte hunk were
  verified, the patch was applied only inside a temporary isolated directory, TypeScript strict
  compilation passed, and a Node behavior test passed against the compiled output. The temporary
  directory was removed. Receipt records repository HEAD/dirty state, input/output checksums,
  commands and results; `mutationAuthorized=false`, `canonicalAuthority=false`, workspace source
  unchanged. This does not prove live ast-grep execution or authorize/apply a real source patch;
  those remain DOC-23/DOC-24 gates.
  for the established shape) applied to a patch-validate-test cycle.

## Phase G — Acceleration (optional, only after corpus is stable)

Audit 2026-09-24 (read-only; DOC-19 exact oracle, DOC-20 CAGRA comparison, and DOC-21 IVF-PQ exact-refinement benchmark are proven on the admitted, embedded external-doc corpus):

- [x] **DOC-19** cuVS exact baseline — live read-only proof on all 852 admitted external-doc chunks and their 768-dimensional canonical vectors: `scripts/atlas/prove-doc-19-cuvs-external-doc-parity-v1.mjs`, receipt `docs/reports/parent-atlas/doc-19-cuvs-external-doc-parity-v1.json`. cuVS 26.08.00 on the RTX 3060 Ti matched the independent CPU cosine oracle at exact Top-10 set and rank for 3 deterministic queries; maximum distance delta < 1.2e-7. The Arrow snapshot is execution-only (`canonicalAuthority=false`, `logicalLaneVote=NONE`); PostgreSQL was read in a read-only transaction and no canonical/projection/cache/graph writes or rebuilds occurred. The HTTP wrapper path is explicitly NOT proven: live health reports `torchAvailable=false`, so this baseline invoked the already-running container's CuPy/cuVS library directly. Wrapper repair/rebuild is a separate runtime-integration gate, not hidden in this executor-parity result.
- [x] **DOC-20** CAGRA recall benchmark — `scripts/atlas/prove-doc-20-cagra-external-doc-recall-v1.mjs`, receipt `docs/reports/parent-atlas/doc-20-cagra-external-doc-recall-v1.json`. Reused the DOC-19 frozen 852-row/768-dimension canonical-vector artifact and existing in-container cuVS library. On 64 deterministic evenly spaced corpus-vector queries (self-hit excluded), both `itopk_size=64` and tuned `512` measured Recall@10=1.0 and Recall@20=1.0 (worst-query Recall@20=1.0) against cuVS brute-force exact. This is a bounded executor benchmark, not a natural-query recall claim or promotion: `canonicalAuthority=false`, `logicalLaneVote=NONE`, promotion false; no stores were written and no container was rebuilt. The HTTP wrapper remains separately unproven because its image reports `torchAvailable=false`.
- [x] **DOC-21** standalone IVF-PQ candidate generation followed by exact refinement — `scripts/atlas/prove-doc-21-ivfpq-exact-refinement-v1.mjs`, receipt `docs/reports/parent-atlas/doc-21-ivfpq-exact-refinement-v1.json`. This is distinct from IVF-PQ as a CAGRA build algorithm. On the DOC-19 frozen 852-row/768-dimension canonical cohort, 64 deterministic leave-one-out queries, K0=80 and final K=20, two IVF-PQ configurations (n_lists=1, pq_dim=96/192, pq_bits=8) achieved candidate-pool Recall@20=1.0 and exact-refined Recall@20=1.0 against the cuVS exact oracle (also cross-checked with NumPy cosine). The IVF-PQ approximate first-20 ordering alone was lower (0.912/0.955), demonstrating the exact-refinement stage changes ranking using original vectors. This small corpus uses one IVF list, so it proves the requested two-stage mechanism and parity only—not scaling, production latency, or promotion. Execution-only, one semantic lane, no store writes or rebuild.
- [ ] **DOC-17** `HotBucketDescriptorV1` BitFrost bucket warming — `NEW` contract, `EXTEND` of
  existing BitFrost. Descriptor-only (candidateOrdinals/docChunkIds/conceptIds/centroidIds), never
  the canonical documents in Valkey. The descriptor owner and bounded noncanonical fixture are
  now proven by `scripts/atlas/prove-doc-17-hot-bucket-descriptor-v1.mjs` with report
  `docs/reports/parent-atlas/doc-17-hot-bucket-descriptor-v1.json`; Valkey write/readback remains
  explicitly open.
- [ ] **DOC-18** centroid routing — `EXTEND` of existing SOM/centroid infrastructure
  (`karpathy-gpu-enrich.mjs` family), applied to doc-chunk embeddings. Batch construction must
  use only an admitted, frozen document candidate snapshot and its exact `semantic_768` vectors;
  record the candidate ordinal map, algorithm/configuration, assignments, vector/artifact hashes,
  and CPU reference result. L2 latent vectors are eligible only when their transform/model revision
  and source vector lineage are pinned; do not silently slice a 768-vector and call it a trained
  MRL/L2 representation. Publish only through the existing centroid artifact/manifest owner after
  independent durable readback. Any Valkey write is a revision-qualified routing descriptor and
  remains blocked until atomic publication, cache identity, invalidation, and readback gates pass.

## Phase H — Operations

- [ ] **DOC-26** incremental version recrawl — `NEW`. Detect when a manifest source's
  `productVersion` changes and crawl only the delta, never overwrite the prior version's rows
  (depends on DOC-02/DOC-27).
  - Read-only fixture added: `scripts/atlas/prove-doc-26-incremental-recrawl-fixture-v1.mjs`.
    It initially proved only a proposed decision rule: unchanged bytes/timestamp-only changes may
    be skipped, changed bytes are reprocessed, and a changed product version requires a new revision.
    The integrated code-only path below now supersedes the old statement that recrawl is not wired
    to the crawler/admission owner; live PostgreSQL preservation is still unproven.
    The receipt's former `conditional-fetch.ts` owner label was incorrect. The actual boundaries
    are `python/atlas_okf_docs_pipeline.py` (manifest/fetch/chunk orchestration) and
    `external-doc-admission.ts` (canonical PostgreSQL writer); DOC-26 remains open until an
    integrated delta plan uses those owners and a readback proves version rows are preserved.
    **Identity blocker proven:** Python `chunk_id` is currently `doc:{source_id}:{contentHash[:16]}:{ordinal}`;
    page/chunk evidence revisions change with `productVersion`, but identical bytes across versions
    keep the same globally-unique `chunk_id` (table constraint in
    `drizzle/manual/20260904_external_doc_intelligence_v1.sql`; live readback confirms
    `UNIQUE (chunk_id)` and 0 cross-version duplicate groups in the admitted corpus today).
    The focused test locks this potential collision in as a blocker; see
    `docs/reports/parent-atlas/doc-26-chunk-id-compatibility-audit-v1.json`. Do not alter V1 IDs
    here; resolve
    `DOC_CHUNK_IDENTITY_V2_OR_COMPATIBILITY_CONTRACT_REVIEW` before attempting a second-version
    admission. No crawler or durable write was run.
    **Identity compatibility review (2026-09-24):** selected an additive `atlas.external-doc-chunk-identity.v2`
    primitive in `python/atlas_doc_coordinate.py::external_doc_chunk_id_v2`, keyed by `sourceId` plus
    the already version-qualified `chunkEvidenceRevision`. It preserves the current V1 default and
    IDs; 31 focused coordinate/chunk tests pass, including V1 non-change, V2 cross-version
    separation, malformed-revision rejection, and a Python ↔ frontend canonical-hash golden vector.
    Receipt: `docs/reports/parent-atlas/doc-26-chunk-identity-v2-contract-review-v1.json`.
    This cleared only the identity-contract review subgate at that time; see the dated
    code-composition follow-up below. DOC-26 remains open pending live prior-version preservation
    proof.

    **DOC-26 code-composition follow-up (2026-09-28, no live calls/writes):** the Python delta
    planner is now consumed by `_sources_selected_by_recrawl_plan()` in `run_pipeline()`, which
    processes only selected additions/version transitions and namespaces version-transition
    artifacts separately. The TypeScript composition in
    `external-doc-versioned-recrawl-admission-v2.ts` validates the Python plan checksum, requires
    exact prior/current envelopes and V2 chunk IDs, then uses the existing resumable admission
    planner/writer. `run-external-doc-versioned-recrawl-v2.mts` defaults to repeatable-read
    `PLAN_ONLY`; `--apply` is behind the explicit `ATLAS_DOC_VERSIONED_RECRAWL_AUTHORIZED` gate.
    Focused validation: Python manifest-planner tests 4/4 and TypeScript composition tests 9/9;
    the fake-pool proof confirms SELECT-only statements and zero writer calls. No live database
    runner, crawler, or apply path was invoked. DOC-26 remains open for a real read-only plan
    against exact prior/current artifacts and independent prior-version preservation readback after
    any separately authorized admission.

## Explicitly deferred / not part of this proposal

### Temporal document/claim spine contract (supporting proof, 2026-09-21)

The existing `packages/parent-atlas/src/core/temporal-indexing-fabric.ts` owner now
exports revision-qualified `SourceArtifactV1`, `SourceCoordinateMapV1`,
`DocumentObservationV1`, `KnowledgeClaimV1`, `RunManifestV1`, and
`TemporalDocumentIndexV1` contracts. UTF-8 source bytes are the only authoritative
coordinate basis; observations and claims require non-empty evidence references;
claim freshness is classified against changed source revisions; aggregate checksums
are deterministic; and every envelope is hard-coded noncanonical. The bounded proof
`scripts/atlas/prove-temporal-document-claim-fabric-v1.mjs` produced
`docs/reports/temporal-document-claim-fabric-v1.json` with 13/13 tests passing,
`TEMPORAL_DOCUMENT_CLAIM_FABRIC_PROVEN`, `writes_performed=false`, and
`promotion_authorized=false`. This is a contract foundation only: DOC-13/14/15/16/17/18/19/20/21/26
remain open for their existing live index, graph, retrieval, cache, acceleration, and
manifest readback gates.

The downstream read-only composition was also re-run against current artifacts:
`prove-doc-symbol-mutual-index-live-v1.mjs` returned
`LIVE_DOC_EXTRACTION_SYMBOL_JOIN_PROVEN` (200 active registry rows),
`prove-doc-symbol-nlp-dag-context-v1.mjs` returned
`COMPOSITION_OWNER_WIRING_PROVEN`, `prove-parent-atlas-context-manifest-v1.mjs`
returned `CONTEXT_MANIFEST_REPLAY_PROVEN` for the 15-row lineage-qualified canary,
and `prove-ornith-agent-dag-readonly-gate-v1.mjs` returned
`ORNITH_AGENT_DAG_READONLY_GATE_PROVEN` with seven candidate ordinals and zero
mutation nodes. The current-pass selector remains blocked by separately tracked
live view drift (`success` versus `succeeded`, and missing `id DESC` tiebreak); no
DDL or source-of-truth change was applied.

- Registering Firecrawl as a live MCP server with a budget cap — separate follow-up, needs an API
  key provisioned first.
- A dedicated admin/search UI page for the doc corpus (mentioned in the original ask as
  "hypergraphrag admin page") — should extend the existing `/command-center/retrieval/` UI once
  Phase A-C prove the corpus is real and queryable, not be built speculatively first.
  **STATUS 2026-09-23 (`STUDIO-DOCS-SSR-01` + `DOC-INTELLIGENCE-READINESS-01`, NOT closed):** a read-only
  Documentation Intelligence panel extends `(app)/admin/atlas` (not `/command-center/retrieval/`; WFU-12
  names the Studio as the shell) via `doc-intelligence-read-model.ts` + `GET /api/admin/atlas/docs-corpus[/search]`,
  SSR-rendered (`DocCorpusPanel.ssr.spec.ts`). `npm run atlas:docs:studio:smoke` writes
  `docs/reports/external-doc-studio-readiness-v1.json` (supersedes `doc-corpus-studio-smoke-v1.json`).
  Result: `DOC_ADMISSION_HANDOFF_BLOCKED` (secondary `DOC_CANONICAL_CORPUS_EMPTY`). 30 pages / 847 chunks (after
  the extractor fix below; 881 before) were acquired through the existing pipeline
  (`docs/.okf/dev/pinned-docs.manifest.json` + coordinates sidecar) and never admitted: `admitExternalDocPage`
  still has no runtime caller and no database write was made. Typed blockers: (1)
  `PIPELINE_DOES_NOT_EMIT_DOC_COORDINATE` — `SourceConfigV1` forbids provider/product/version fields, so all 847
  native chunks carry `doc_coordinate=null`; (2) `CHUNK_EVIDENCE_REVISION_NOT_UNIQUE` — DocCoordinateV1's chunk
  revision hashes (url, section_anchor, document hash), so 280 of 847 chunks collide and
  `atlas_external_doc_chunks_evidence_revision_uq` would reject them; a deterministic candidate (page revision +
  chunkId + checksum + byte span) is unique for all 847 and needs an owner decision before any admission.
  Also `AST_GREP_DOC_SYMBOL_MAPPING_INCOMPLETE` (dev symbol index: no chunk id / byte span / evidence revision,
  line-based spans, 0 symbols), `LANGEXTRACT_DOC_EVIDENCE_JOIN_BLOCKED` (no coordinate / chunk id / byte
  spans, URL-only join, absolute Windows paths) and `EXTERNAL_DOC_ANALYSIS_CONTRACT_READY`
  (`ExternalDocAnalysisV1` in `external-doc-intelligence-contracts-v1.ts`, no migration; `analysis_pass_results`
  reviewed and not reused). Closure of the admin/search item still needs admitted rows, Postgres provenance and
  a live FTS hit; no ingestion, semantic/Qdrant or Ornith task is closed by this.
  **EXTRACTION FIDELITY FIX (`DOC-04` owner `atlas_external_docs.py`, 2026-09-23, evidence-backed):** root cause
  was `get_text("\n")` on the code node in `extract_structured_text` (now `_code_block_text`), which put a newline
  between every text node, so highlighted `<span>` tokens became one line each (`hnsw` / `.` / `iterative_scan`). Fixed in
  the existing owner (no second parser): source newlines now exist only where the source has them (literal
  newline, `<br>`, or a boundary between per-line `class="line"` elements with no newline text), and
  `highlight-source-<lang>` now yields the real language. 10 new regression tests (8 fail on the old extractor);
  50 focused Python tests pass. Re-acquired all 30 pinned pages: 22 normalized hashes changed (20 with identical
  raw HTML = extractor-only; 2 GitHub pages whose HTML also moved), and `hnsw.iterative_scan` /
  `hnsw.scan_mem_multiplier` are now `LITERAL_HIT`. Raw pages under `docs/.okf/pinned/*/raw` are tracked evidence
  (same convention as `docs/.okf/dev/raw`); `*.jsonl` intermediates stay ignored and the smoke rebuilds its handoff
  envelopes offline. Fresh-checkout input audit and receipt: `docs/reports/external-doc-corpus-reproducibility-v1.json`.
  Still open: DOC-06A admission, semantic embedding, LangExtract integration, and Studio admin/search closure.
  **CHUNK EVIDENCE IDENTITY (`EXTERNAL_DOC_CHUNK_EVIDENCE_IDENTITY_01`, 2026-09-23, supersedes blockers (1) and (2)
  above): `EXTERNAL_DOC_CHUNK_EVIDENCE_IDENTITY_PROVEN`.** Decisions: `DocCoordinateV1` is PAGE/VERSION identity, built
  natively by `atlas_okf_docs_pipeline.build_page_coordinate` from new optional manifest fields and carried unchanged
  into every chunk; its `content_hash` is over the same normalized text the byte spans address. A chunk's own identity
  is `ExternalDocChunkEvidenceV1` = `sha256:canonicalSha256V1{schema, pageEvidenceRevision, ordinal, startByte,
  endByte, chunkChecksum}` (headingPath/sectionAnchor/parser/chunker/model revisions are provenance, not identity);
  Python and TypeScript agree on a golden value and a committed cross-language fixture. Before: chunks under one
  heading shared a revision (78 groups / 358 rows; 280 rows the unique constraint would reject). After: 30 unique page
  and 847 unique chunk revisions, 0 duplicate groups, all 847 native chunks carry the page coordinate; the DOC-06A
  handoff validates `EXTERNAL_DOC_ADMISSION_HANDOFF_READY` with no writer call. `chunk_id` is unchanged (future gate
  `EXTERNAL_DOC_CHUNK_ID_COLLISION_AUDIT`). Finding: 23 of 30 stored pages differ from the text `chunk_document`
  normalizes (code indentation is collapsed at chunking; future gate `EXTERNAL_DOC_CHUNK_TEXT_INDENTATION_FIDELITY`).
  Analysis owner: `analysis_pass_results` and `atlas_summary_layers` are packet-keyed and not reusable ->
  `EXTERNAL_DOC_ANALYSIS_OWNER_REQUIRED` (`ExternalDocAnalysisV1` / conceptual `atlas_external_doc_analyses`, not
  created); the summary-only SQL is `DRAFT_SUPERSEDED_PENDING_ANALYSIS_OWNER`, unapplied. Receipt:
  `docs/reports/external-doc-chunk-evidence-identity-v1.json`. No canonical admission, embedding, Qdrant, LangExtract,
  Ornith or Studio canonical-search task is closed; per-chunk cache warming stays blocked until admission.
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

## Phase V — Summary claim validation spine

- [x] **VAL-01** Align the established `SummaryClaimValidationV1` Zod owner in
  `sveltekit-frontend/src/lib/server/atlas/docs/summary-claim-validation-v1.ts`; seal a content-only
  claim checksum with `canonicalSha256V1`, add typed token/value/version/span/semantic/ontology
  fields and `resolutionLayer`, and keep final ADMIT/REVIEW/REJECT handling structural only until
  VAL-09. The TypeScript fixture is validated by the Zod suite (12/12). No Pydantic parity,
  canonical-byte span readback, judge/OaK execution, decision algorithm, summary persistence, or
  promotion is implied.
- [x] **VAL-02 / VAL-02B** Add a strict Pydantic wire mirror in
  `python/atlas_summary_claim_validation_v1.py`; consume the canonical Zod fixture and prove exact
  JSON round-trip shape parity. The shape-only model validates transport; the sealed subclass
  independently recomputes TypeScript-owned checksums as a parity verifier, not a second owner.
  Proof: Python golden vectors and `validationId`/`claimChecksum`/`validationChecksum` parity pass
  (10 unittest tests); strict shape/validator fixtures pass in the focused pytest suite. No writes.
- [x] **VAL-03** Add `validate_summary_claim_technical_tokens_v1` in the existing deterministic
  faithfulness owner. It reuses its established token assessment, emits the VAL-01 technical slot,
  marks unsupported/corrupted identifiers `FAIL`, and keeps omitted source identifiers as
  non-gating `missingTechnicalTokens` observations at claim granularity; summary-wide coverage is
  separate. Numeric/version strings remain for VAL-04. Proof: exact dotted/underscored identifiers,
  unsupported/corrupted identifiers, non-gating omission cases, and numeric/version separation pass
  in the focused Python suite. No model/OaK call or persistence.
- [x] **VAL-04** Add separate exact numeric-value and named-version validators in the existing
  faithfulness owner. Version strings are preserved and compared as strings; numeric extraction
  excludes named-version spans, so `18.4` in `PostgreSQL 18.4` is not also treated as a generic
  numeric assertion. Both results match the VAL-01 slot schemas; focused tests cover unsupported
  values, exact versions, `18.04` versus `18.4`, and unqualified decimals. No inference or writes.
- [x] **VAL-05** Verify claimed byte spans independently against canonical UTF-8 chunk bytes.
  `python/atlas_summary_claim_span_v1.py` requires exact `chunkId` and
  `chunkEvidenceRevision`, rejects revision/identity mismatch, invalid UTF-8 boundaries, out-of-
  bounds ranges, and checksum mismatch. Four focused cases pass, including a bounded read-only
  replay of `doc:pgvector:ca39935f7857789b:1` at revision
  `sha256:399d4ab96dcab93bad98595bfaca281283994645de96131ed8775341177508b4`; exact bytes verified
  and a mismatched revision rejected. PostgreSQL/Qdrant/Valkey/Neo4j writes: 0.
- [x] **VAL-06** Freeze bounded `SummaryJudgeInputV1` in
  `sveltekit-frontend/src/lib/server/atlas/docs/summary-judge-input-v1.ts`. The builder requires a
  sealed validation artifact plus a chunk readback whose `chunk_id` and `evidence_revision` exactly
  match; it copies one claim and technical/numeric/version/source-span findings, includes only the
  allowlisted prompt-visible metadata, and caps chunk text at 32 KiB UTF-8. Strict unknown-field
  rejection excludes web/retrieval/neighbor/ACE/model context. Five focused tests and targeted
  TypeScript validation pass. No retrieval, model call, OaK execution, or persistence.
- [x] **VAL-07** Add `judge_claim_v1` in `python/atlas_summary_claim_judge_v1.py`; strict VAL-06
  shape/seal, exact prompt revision, approved/listed Ornith model resolution, and fail-closed
  semantic-slot output are proven. Sixteen focused adapter tests pass. The bounded live call
  receipt `docs/reports/parent-atlas/summary-semantic-judge-live-proof-v1.json` proves one sealed
  fixture claim used `ornith-1.5-9b` / `ornith-1.5-9b:hforf.gguf` and returned `SUPPORTED` with no
  retrieval, OaK, source-span claim, or persistence. Model-path basename is the resolved runtime
  revision; immutable weight digest was not read. A separate 19-chunk/51-claim replay receipt is
  exploratory evidence only; VAL-10 remains open for post-VAL-09 admission-eligibility proof.
- [x] **VAL-08** Add an OaK typed-assertion adapter; OaK does not judge ordinary prose. `python/atlas_oak_kernel.py`
  now exposes `POST /oak/assertion/check` over an exact `(subject concept ID, allowlisted predicate,
  object concept ID)` query with a hard `LIMIT 2`; results distinguish `MATCHED`, `NOT_FOUND`, and
  `AMBIGUOUS`. Strict Pydantic input rejects unknown fields/predicates, the endpoint fails closed
  for adapters without exact relation lookup, and it explicitly reports `sourceSpanVerification=NOT_PERFORMED`,
  `canonicalAuthority=false`, and `writesPerformed=false`. It does not convert results into semantic
  prose judgments or a VAL resolver decision. Focused OaK tests: 15/15. Live `atlas_ontology_relations`
  read-only census: 0 rows; therefore live positive matching is unavailable and unclaimed. No OaK writes.
- [x] **VAL-09** Add the pure TypeScript resolver `summary-claim-resolution-v1.ts`. Hard deterministic
  contradictions, rejected byte spans, and unsupported/contradicted semantic assertions reject;
  missing/unrun/partial evidence routes to review; only supported or supported-paraphrase with
  passing deterministic checks admits. Semantic evidence cannot override deterministic failure.
  Output is revalidated/resealed and remains `canonicalAuthority=false`. Ten focused resolver cases
  plus 12 contract cases pass; no model, OaK, retrieval, or store writes. VAL-08 `NOT_RUN` means an
  ordinary prose claim has no typed ontology assertion, not that prose was ontology-judged.
- [x] **VAL-10** Replay the exact 19 chunk/revision pairs through current Ornith SUMMARY generation,
  per-claim VAL-03/04/07 evidence, and the canonical VAL-09 Zod resolver. The read-only receipt
  `docs/reports/parent-atlas/val-10-summary-eligibility-replay-v1.json` records 19/19 exact source
  readbacks, 19 valid derived analysis envelopes, 49 claims (48 ADMIT, 1 REJECT, 0 judge errors),
  and 18 whole-summary candidates eligible under the 20-item bound. The rejected claim excludes its
  entire summary; no partial summary is eligible. This proves eligibility only: summary/analysis
  rows were not persisted and the separate explicitly authorized `--apply --limit 20` gate remains
  open. PostgreSQL/Qdrant/Valkey/Neo4j writes: 0.

## LangChain external-doc corpus discovery — 2026-09-26 (read-only)

- [x] `LANGCHAIN-DOC-CORPUS-CENSUS-01`: identified the existing canonical
  external-doc corpus owner rather than creating a second store. Live read-only
  PostgreSQL census: `atlas_external_doc_pages` has 30 pages and
  `atlas_external_doc_chunks` has 852 chunks; none of the 30 pages match
  LangChain provider/product/URL coordinates. All 852 existing chunks have a
  `content_embedding`; the chunk table's `qdrant_point_id` is null on all 852,
  so this field does not prove current Qdrant projection coverage.
- Current upstream discovery: `https://docs.langchain.com/llms.txt` advertises
  43 LangGraph + 40 Deep Agents + 4 Concepts Python pages (87 total). Direct
  bounded HTTP fetches returned status 200 for all three child indexes. Two
  independent fetches produced identical sorted-URL-set SHA-256 values:
  LangGraph `1146575d666587edc280f0c2b6616e237e30d13caa35bc0380637fcb6cda4cd4`
  (43 URLs), Deep Agents
  `9c00a3c08b66ec3ae7e29e2d27959f4a656fb4207608562229c21f72c69855dc` (40),
  Concepts `567a2827131c98ba64935cd736431990b072a0af23f36f2d35592b33beccef89`
  (4). Every discovered URL was within its declared section prefix; the 87-page
  set contains 87 unique URLs.
- [x] `LANGCHAIN-DOC-CORPUS-FETCH-01`: added a source-bound corpus config,
  bounded downloader, and artifact verifier at `docs/.okf/topics/langchain/corpus.json`,
  `scripts/atlas/fetch-langchain-doc-corpus-v1.mjs`, and
  `scripts/atlas/verify-langchain-doc-corpus-v1.mjs`. Two runs fetched 86/87
  pages each with identical URL-set checksum
  `sha256:b161c8ff9997954df572db6f7c0c7fe7f1122cf5d245ca0c0f16a4f3a7bbac23`
  and identical sorted page-manifest checksum
  `sha256:b835512fe039ba42cf37935a567ba4a45c3a2e9da4ebac18b8fef334659137f7`.
  The one source `https://docs.langchain.com/oss/python/deepagents/code-link.md`
  returns 404; its extensionless HTML route also returns 404. It remains a
  conserved failure (`fallbackStatus=NOT_CONFIGURED`), not a guessed URL. Both
  artifact verifications checked all 86 content hashes and the 86+1=87
  conservation equation; they intentionally exit 2 for the partial cohort.
  Four focused tests pass. Artifacts live under ignored `.tmp/atlas/`.
- Fetch remains artifact-only: no page admission, embeddings, or
  Postgres/Qdrant/Valkey/RabbitMQ/Neo4j/Graphify writes. Crawl4AI, Firecrawl,
  and BeautifulSoup fallbacks are declared in the corpus policy but disabled
  in this bounded downloader. Reuse `python/atlas_doc_manifest.py` and
  `python/atlas_okf_docs_pipeline.py` as canonical manifest/admission owners.
  Do not add this source to the active pinned ingest manifest until the
  embedding endpoint, immutable `semantic_768` revision, and write mode are
  reconciled; the current sample points at `:8081`.
- [x] `LANGCHAIN-DOC-CHUNK-ARTIFACT-01` (2026-09-27, local artifact-only): added
  `scripts/atlas/chunk-langchain-doc-corpus-v1.py` as a thin adapter over the
  existing `atlas_okf_docs_pipeline.compile_chunks` and `DocCoordinateV1` /
  chunk-ID V2 owners. It verifies the fetched manifest and every page digest,
  enforces canonical and resolved URLs remain inside the declared section,
  streams deterministic chunk JSONL into a staged local artifact directory,
  and emits a partial receipt; it does not embed or admit rows. On the pinned
  fetch snapshot: 87 discovered = 79 scope-admitted + 7 out-of-prefix redirects
  + 1 HTTP 404; 1,548 chunks, 1,548 unique IDs/evidence revisions. Two runs
  reproduce `sha256:b1feae501c9e28a3147d1ec4f73d09d3d59bcccd986133411ebb0afc7201f121`.
  During the byte-span gate this exercised and fixed a shared chunker defect:
  trimming leading blank lines after a heading previously left UTF-8 spans
  one byte/character early on affected sections. Regression coverage now
  includes blank-line headings and multibyte text. Focused tests: 15/15.
  Outputs are under ignored `.tmp/atlas/langchain-doc-corpus-v1/20260926T232349097Z/`
  (`chunks-v1-streaming/` and `chunks-v1-streaming-replay/`). This is local
  derivation proof only: `canonicalAuthority=false`; PostgreSQL/Qdrant/Valkey/
  Neo4j/Graphify writes 0; embedding and admission remain blocked on
  `EMB-PROV-01` and explicit writer authorization.

- [x] `LANGCHAIN-TYPESCRIPT-LOCAL-CORPUS-01` (2026-09-30, artifact-only): added
  a separate TypeScript/OpenWiki source config, preserved section language through
  the existing chunker and pinned viewer, and registered a bounded language filter
  on the existing KB MCP server. The fetch receipt records 178 discovered, 174
  fetched, 4 conserved failures, and 0 datastore writes; the chunk receipt records
  2,907 unique chunk IDs/evidence revisions across `typescript` and `mixed` pages.
  A redirected duplicate alias was rejected rather than weakening chunk identity.
  MCP smoke returns local `LOCAL_UNADMITTED` evidence only. This does not close
  DOC-15 dense/Qdrant retrieval, canonical admission, or the other API-catalog
  sources (RAPIDS/cuVS/cuGraph/CUDA/Go/Rust), which remain separate acquisition
  work under the existing source catalog.

## Fabric split decision — documentation corpus vs live structural search (2026-09-27)

An external architecture review proposed splitting future work into two
independent fabrics. Audited against this file's own real evidence before
accepting it — the review's specific numeric claim ("87 URLs discovered, 86
fetched, one known 404") was checked and **matches exactly**:
`LANGCHAIN-DOC-CORPUS-CENSUS-01`/`-FETCH-01` above already recorded 87
discovered / 86 fetched / 1 conserved-404. The review was grounded in this
file, not invented.

**FABRIC A — document knowledge (build now, real owners already exist)**:
Firecrawl/BeautifulSoup/llms.txt → raw immutable doc → `.okf` corpus manifest
→ stream chunker → Postgres canonical metadata → `semantic_768` (Qdrant/cuVS/
CAGRA/TurboVec as 4 co-equal executors of the same candidate identity, not 4
competing retrieval votes) → Top-K → exact-source promotion → ACE/
ContextManifest. This matches what's already partially built here
(`LANGCHAIN-DOC-CORPUS-CENSUS-01/FETCH-01`, `docs/.okf/topics/langchain/corpus.json`,
`python/atlas_doc_manifest.py`, `python/atlas_okf_docs_pipeline.py` as the
canonical manifest/admission owners) plus ARCH-TOC V2's `TemporalDocumentIndexV1`
(project memory, session 2026-09-26). **Real, incremental next step, not new
construction.**

**FABRIC B — live structural code search (new construction, confirmed absent)**:
request → domain/language classification → a structural execution owner
(Tree-sitter / ast-grep N-API / ts-morph / LSP) → canonical identity
normalization → same candidate fabric as docs/semantic/graph. This repo's own
OPS-06 census (`parent-atlas-kv-cache-adaptation-research/tasks.md`) already
proved every ast-grep/Tree-sitter/ts-morph caller is offline-script-only, zero
live SvelteKit route reachable — this fabric genuinely does not exist yet.
ASTG-01..04 (ast-grep version convergence, closed 2026-09-27, same file)
was a prerequisite hygiene fix for Fabric B, not Fabric B itself.

**Decision**: sequence Fabric A first (real owners, partial progress, bounded
remaining gates below) before starting Fabric B's STRUCT-LIVE-00..09
(declared-absent → chosen owner → StructuralCandidateV1 → bounded
worker_threads executor → per-tool adapters → identity normalization →
read-only canary), which is unstarted greenfield design. Not started here —
recording the sequencing decision only.

**Fabric A's actual next gate (not a fresh tranche list — most of DOC-CORPUS-01..05
already exist under different names in this file)**: the FETCH-01 entry above
already names the real blocker — admission is intentionally withheld until
the embedding endpoint (currently sampled at `:8081`, not reconciled against
the canonical embeddings path), an immutable `semantic_768` revision, and the
write mode are settled. That reconciliation is `EMB-PROV-01` in the
`parent-atlas-kv-cache-adaptation-research` build order — the same gate this
repo already identified as step 2 after ASTG-01. Fabric A's chunk/Postgres/
lexical/vector/ontology/grounding/retrieval/promotion/ContextManifest steps
are real remaining work, but they are sequenced *behind* EMB-PROV-01, not
independent of it — do not build DOC-SEM-01/DOC-VECTOR-01 on an
unreconciled embedding endpoint.

**Tiered storage note (accepted, not yet built)**: hot (Postgres: metadata,
chunks, FTS, small/medium text) / warm (filesystem: normalized markdown,
JSONL, Arrow) / cold (SeaweedFS S3: raw HTML, large PDFs, old crawl
generations) — consistent with this repo's existing SeaweedFS-canonical
object-store rule (root CLAUDE.md) and the Wire Format Layering Rule (bulk
numeric arrays never through JSON). Canonical Postgres rows hold
`artifact_address/checksum/byte_length/content_type/source_revision`
pointers, not raw cold bytes. Not yet implemented for this corpus — the
LangChain fetch artifacts currently sit under gitignored `.tmp/atlas/` only.

## DOC-06/DOC-06b sidecar-migration registration — CLOSED (2026-09-27)

**Verified an external audit's claims via `rg`/direct file reads before acting** —
all 6 concrete file-path claims checked exactly true: `DocCorpusPanel.svelte`
exists and is mounted at `admin/atlas/+page.svelte:960` (imported line 15);
the LangChain snapshot (`.tmp/atlas/langchain-doc-corpus-v1/20260926T232349097Z/
chunks-v1-streaming/chunks.jsonl`) is exactly 1,548 chunks; `drizzle/manual/
20260904_external_doc_intelligence_v1.sql` exists; it had **zero** entry in
`drizzle/sidecar-migrations.json` (confirmed via grep, matching the audit's claim
exactly); `doc-intelligence-read-model.ts`/`.spec.ts` exist and the read model
genuinely uses an injected raw `pg.Pool`, not Drizzle, matching the audit's
"queries the tables directly" claim.

**Fix applied (purely additive, zero schema/data risk)**: registered
`manual/20260904_external_doc_intelligence_v1.sql` in `drizzle/sidecar-migrations.json`
(same shape as the file's other 67 entries — `file`/`status`/`reason`/`appliedBy`/
`appliedAt`/`requiresJournalEntry`/`validationCommand`). This is a documentation
registry only, consumed by `scripts/atlas/audit-contract-map.mjs` to classify
manual SQL files as `documented_sidecar` (WARN) instead of
`unknown_unjournaled_sql` (FAIL) — it does not touch Drizzle's TypeScript schema,
run any migration, or alter live data.

**Verified**: `audit-contract-map.mjs` re-run — 0 `unknown_unjournaled` flags,
clean exit 0 (previously this file was undocumented and would have flagged).
`validationCommand` re-confirmed live: `atlas_external_doc_pages`=30 rows,
`atlas_external_doc_chunks`=852 rows (matches `LANGCHAIN-DOC-CORPUS-CENSUS-01`
exactly). `doc-intelligence-read-model.spec.ts` — 19/19 pass, unaffected (no
code changed).

**Still open, correctly NOT touched here** (per the audit's own "safe next
command" framing — inspection before schema registration, not a mandate to add
Drizzle table definitions): `atlas_external_doc_pages`/`atlas_external_doc_chunks`
still have no matching Drizzle TypeScript schema entries. Adding them is a
separate, deliberate decision (new Drizzle table declarations for tables that
already exist live, with hand-written GIN/HNSW indexes Drizzle can't generate —
same pattern as `code_retrieval_chunks`) — not done in this pass. A "Local
snapshots — unadmitted" viewer panel for the 1,548-chunk LangChain snapshot
(distinct from the canonical Postgres-backed `DocCorpusPanel.svelte`) is now
implemented as a separately badged read-only panel. Its exact snapshot is pinned
in `docs/.okf/topics/langchain/viewer-snapshot.json`; the reader verifies the
manifest checksum, receipt, and chunk SHA-256 before rendering; rejects changed
manifests between pages and paths outside the approved `.tmp` artifact root;
uses deterministic bounded pagination and never merges into Postgres search.
Coverage includes manifest mismatch, artifact digest mismatch, path escape,
search, pagination, and SSR. Focused snapshot/read-model/panel SSR tests passed
33/33; full Svelte check passed with 0 errors and 291 existing warnings; strict
OpenSpec validation passed. A live local read returned 1,548 chunks with corpus
revision `sha256:b1feae501c9e28a3147d1ec4f73d09d3d59bcccd986133411ebb0afc7201f121`
and manifest checksum `sha256:0f0b79c8dfe303ae76cb3bd0d5e849eb3d44ff9e3a348ecaec583bcbf48cead9`.
This closes viewability only; the artifact remains noncanonical and unadmitted.

- [x] `LANGCHAIN-LOCAL-CHUNK-SNAPSHOT-VIEWER-01`: added a pinned, checksum-verified
  read-only local snapshot reader and Admin Docs Corpus panel. It is distinct from
  canonical Postgres FTS; no database, Qdrant, Valkey, Neo4j, or Graphify writes.

## DSPy official documentation reference snapshot — 2026-09-28

- [x] `DSPY-DOC-LOCAL-SNAPSHOT-01`: Firecrawl Map v2 discovered the official
  `https://dspy.ai/current/` sitemap scope (166 URLs); the existing
  `atlas_external_docs.extract_structured_text` BeautifulSoup normalizer captured
  raw HTML and normalized text for all 166 pages under
  `.okf/docs/dspy/snapshots/20260928T203954Z-1d0dffe4ef63/`. URL-set checksum:
  `sha256:1d0dffe4ef6323154f0dc8355e954094601025b6715b4c8e8c472dd9e3b91052`.
  This is a local reference snapshot of the mutable `current` channel, not an
  immutable upstream release identity: `LOCAL_UNADMITTED`,
  `canonicalAuthority=false`. No Postgres, Valkey, Qdrant, Neo4j, Graphify, or
  embedding writes/calls occurred. Readback/checksum verification is provided by
  `py -3.13 scripts/atlas/capture-dspy-doc-corpus-v1.py --verify-dir
  .okf/docs/dspy/snapshots/20260928T203954Z-1d0dffe4ef63`.
- Existing PostgreSQL 18 canonical page/chunk tables and FTS/index definitions
  are in `sveltekit-frontend/drizzle/manual/20260904_external_doc_intelligence_v1.sql`.
  DSPy canonical admission remains separate: add Drizzle schema alignment
  before any row admission; the exact 3.4.0 release documentation is captured below.
- [x] `DSPY-DOC-RELEASE-SNAPSHOT-01`: confirmed DSPy 3.4.0 as the latest stable
  release in the official repository release list and verified the versioned
  `https://dspy.ai/3.4.0/llms.txt` and sitemap. Captured all 165 sitemap-listed
  pages into `.okf/docs/dspy/snapshots/20260928T205007Z-9bd30a9471d9/`, separate
  from the mutable `current` snapshot above. URL-set checksum:
  `sha256:9bd30a9471d9b064a5ab4b3ed80ebbaaf71cd97742a02ff4ce261fbfc6c37c2f`.
  Snapshot remains `LOCAL_UNADMITTED`; no database, vector, cache, graph, or
  embedding writes/calls. The 3.4.0 release source is pinned, but its official
  docs content checksum is the local snapshot's evidence revision, not a claim
  that the documentation site is cryptographically signed by the package tag.

- [x] `DSPY-DOC-DRIZZLE-ALIGN-01` (declaration-only): added runtime Drizzle
  declarations for the already-existing `atlas_external_doc_pages` and
  `atlas_external_doc_chunks` tables, exported from the configured schema entrypoint.
  The declarations mirror the registered manual SQL's identities, constraints,
  generated FTS column, nullable `vector(768)`, and index names. Both tables are
  explicitly excluded from drizzle-kit generation; the manual sidecar remains
  the DDL owner. Focused TypeScript compilation passed with `--types node`.
  The full `npm run check` did not complete within the bounded run and was
  stopped while consuming substantial workspace memory. The schema-export audit
  found no duplicate for either new table but exits nonzero on 23 duplicate
  declarations elsewhere in the schema. No migration was generated/applied and
  no database or other datastore was contacted or written.

## Tooling docs corpus: oaklib / ast-grep / ts-morph / trpc — 2026-10-05

Manifest `docs/.okf/dev/tooling-docs.manifest.json` (revision `okf-tooling-docs-r1`). Acquired with the existing
`atlas_okf_docs_pipeline.py --acquire-only` (run from the `deeds-miniforge-nlp-sidecar` image with the repo mounted; nothing installed on the host).
BeautifulSoup for oaklib/ast-grep/ts-morph, Firecrawl v2 for trpc. Namespaces `docs/.okf/{oaklib,ast-grep,ts-morph,trpc}` (flat, not under `pinned/`).

- [x] `TOOLING-DOCS-ACQUIRE-01`: 57 pages / 691 chunks (oaklib 17/237, ast-grep 16/196, ts-morph 15/188, trpc 9/70). `LOCAL_UNADMITTED`, `canonical_authority=false`;
      no Postgres/Qdrant/Valkey/Neo4j writes. Receipt `docs/.okf/pipeline-receipt-okf-tooling-docs-r1.json`.
- [x] `TOOLING-DOCS-VALIDATE-01`: unique chunk ids and evidence revisions, 0 empty, 0 checksum mismatch, 0 byte-span mismatch against the pipeline's own normalizer, 0 null doc coordinates,
      all four PASS. Keyword/POS analysis (spaCy en_core_web_sm) in `docs/.okf/dev/tooling-docs.analysis.json` (derived, non-canonical).
      Findings, not fixed: pipeline `domain_class` is coarse (oaklib ontology docs mostly `graph`, 56 `training`; ts-morph 123 `graph`); Firecrawl pages keep site chrome
      ("Skip to main content", iframe/widget/twitter terms); thin index pages (ts-morph `/`, `details/index`, oaklib sssom, trpc server/overview, all under ~1 KB).
- [x] pgvector read-only check: `vector` 0.8.3; `atlas_external_doc_chunks.content_embedding` is `vector(768)` with HNSW `vector_cosine_ops` (m=16, ef_construction=64);
      the 852 pinned chunks all have 768-d unit-norm embeddings, none have `qdrant_point_id`. Tables for the new sources do not exist yet (no rows).
- [x] `SEMANTIC-DOC-01` executor fallback: `populate-external-doc-embeddings-v1.mts` selects ONE executor per run (never per row): `EMBED_SERVER_URL`/:8081, then :8082 llama-server, then Ollama
      `embeddinggemma:latest` (`/api/embed`, `truncate:false`). `--apply` requires parity evidence for the SELECTED executor: the existing parity receipt covers only the :8081 GGUF, so an Ollama
      apply fails closed (`EMBED_PARITY_NOT_PROVEN_FOR_EXECUTOR`) until an Ollama parity receipt exists. :8081 and :8082 were not running on 2026-10-05; the dry run selected Ollama.
- [ ] `TOOLING-DOCS-ADMIT-01`: build admission envelopes for the four sources (`scripts/atlas/build-external-doc-admission-envelopes-v1.py --manifest ... --output ... --receipt ...`; needs a
      coordinates sidecar mirroring the manifest, and note the builder labels every `parserRevision` as `beautifulsoup4`, wrong for the Firecrawl-fetched trpc pages), then admit through
      `run-external-doc-admission-v1.mts`. That script is hard-wired to the pinned envelope file and would count the 30 pinned pages as unexpected rows; parameterize or merge first.
      `--apply` needs `ATLAS_DOC_ADMISSION_AUTHORIZED=I_AUTHORIZE_CANONICAL_ADMISSION` (operator). Not run.
- [ ] `TOOLING-DOCS-EMBED-01`: after admission, populate `content_embedding` for the new rows (`ATLAS_DOC_EMBED_AUTHORIZED=I_AUTHORIZE_SEMANTIC_DOC_01`, parity for the chosen executor). Decide and
      record whether the 852 pinned rows and the new rows share one executor/recipe before mixing in one column (same dimension is not the same representation).
- [ ] `TOOLING-DOCS-QDRANT-FANOUT-01`: after Postgres admission + embeddings, project to `external_programming_docs_768` (pipeline `--write-qdrant` or the DOC-08 projection owner), with payload
      indexes and a Postgres-joined readback. The pinned 852 chunks have no `qdrant_point_id` yet either.
- [ ] `TOOLING-DOCS-NEO4J-01`: topology mirror of docs/chunks/concepts only after admission; Neo4j is a mirror, never identity.
- [ ] `TOOLING-DOCS-NETWORKX-01`: NetworkX CPU parity oracle for any doc/concept graph metrics before a cuGraph or Neo4j result is trusted (existing graph-analysis-runner/adapters; do not add a graph owner).
- [ ] `TOOLING-DOCS-GRAPHRAG-01`: HyperRAG/GraphRAG traversal over the admitted, embedded, projected docs through the existing packet RPC owner; retrieval must join back to Postgres.
- [ ] `OAKLIB-WIRE-01`: oaklib's Postgres kernel adapter reads `atlas_ontology_concepts`/`atlas_ontology_relations`, both 0 rows. Populate only through OAKLIB-ADAPTER-01 candidates after review
      (`canonicalAuthority=false`). Also: the catalog URL `oaklib.readthedocs.io` in `library-docs-manifest-v1.json` returns 404 (current docs: `incatools.github.io/ontology-access-kit`),
      and `docker/miniforge-nlp-sidecar/docker-compose.yml` carries a default Postgres password in the `ATLAS_OAK_ADAPTER` DSN (move to an env file).

- [x] `DOC-26-TOOLING-ADD-PLAN-01` (2026-10-05, read-only): ownership rule frozen: `run-external-doc-admission-v1.mts` is the original/static first-load path; DOC-26 (`plan_manifest_recrawl_delta_v1` +
      `external-doc-versioned-recrawl-admission-v2.ts` + `run-external-doc-versioned-recrawl-v2.mts`) is the versioned corpus-evolution owner. Do NOT add `--envelopes`/`--also-expect` to v1.
      Ran: combined manifest `docs/.okf/dev/pinned-plus-tooling-docs.manifest.json` (`okf-pinned-plus-tooling-r1`) vs pinned `okf-pinned-docs-r3` -> 7 UNCHANGED, 4 ADDED (oaklib, ast-grep, ts-morph, trpc), 0 blockers
      (`docs/reports/doc-26-pinned-plus-tooling-delta-plan-v1.json`). The first runner attempt failed closed (`DOC_RECRAWL_ENVELOPE_MANIFEST_REVISION_MISMATCH`) because the envelopes carried their old manifest revision;
      the selected envelopes were rebuilt with the builder's `--prior-manifest` against the combined manifest. Live `--plan-only`: `DOC_26_VERSIONED_RECRAWL_PLAN_PROVEN`, pages classified MISSING, `safeToAdmit`, 0 writer calls,
      0 writes (`docs/reports/doc-26-pinned-plus-tooling-plan-only-v1.json`). Not applied: needs `ATLAS_DOC_VERSIONED_RECRAWL_AUTHORIZED=I_AUTHORIZE_DOC_VERSIONED_RECRAWL` from the operator.
- [ ] `DOC-26-UPDATE-POLICY-01`: freeze update policy before any pinned-page refresh: update != overwrite (old revision -> SUPERSEDED, new admitted revision; chunk identity belongs to one document revision);
      compare canonical URL, product/version/as-of, normalized and document checksums, acquisition and parser/fetch recipe revisions; classify UNCHANGED/ADDED/CONTENT_CHANGED/METADATA_CHANGED/REMOVED/AMBIGUOUS;
      REMOVED sources are retained, never deleted; after a changed admission mark derived artifacts stale by revision (FTS/trgm refresh, semantic_768 recompute, Qdrant projection, ontology proposals, PathwayCard EVIDENCE_STALE);
      keep exact / near-exact / breadth regression queries and compare old vs new (Recall@K, MRR, ranks) before a recrawl is admitted.

## Repository-driven documentation demand planning

- **Current repository-driven documentation demand replay (2026-10-09; scratch-only):** the root planner scanned 19,297 source files (2 skipped by the 2 MiB bound), ranked 31 demands, and independently read back the deterministic replay. Demand checksum `1c015e3fd24082baa8b96afb563958adb5e7596090ec9900c484e7556a3e0773`; source snapshot checksum `2b85c329c07665962a51e6271db37634e64a04538d21d13ed52865343f722eae`; receipt checksum `9ea51a22bddd3e9d87fcdae7851c48788f4bda2cdf5fee1056aba261b1449390`. Redis/Valkey ranks P0 at score `0.744569`; all 7 current catalog URLs have exact indexed-corpus matches (coverage 1.0, no missing URLs), so the bounded crawl allowlist correctly selects 0 of 31 sources rather than refetching duplicates. Demand tests pass 11/11; allowlist replay and independent readback match. No network fetch, database, embedding, vector, or cache writes occurred. This current catalog/corpus replay supersedes earlier same-day 7/9 historical Valkey coverage counts; documentation is still a noncanonical reference, not production retrieval admission.

- **DOC-DEMAND local lexical reachability (2026-10-09):** queried the existing `searchDocCorpus` with no database pool for “Qdrant hybrid queries vector search”; it returned the newly fetched official Hybrid Queries page as `LOCAL_LEXICAL` / `GENERATED_CORPUS`, not canonical evidence. The focused read-model Vitest suite passes 23/23. This proves local lexical corpus reachability only; PostgreSQL FTS admission, semantic indexing/embeddings, and canonical document admission remain unproven.
- **DOC-DEMAND Qdrant documentation promotion (2026-10-09; bounded append):** confirmed the ranked Zod and Valkey URLs already had one exact corpus entry each; appended only the two missing, allowlisted official Qdrant pages through the existing append-only crawler. The `.okf` corpus now has exactly one record per Qdrant URL; sidecars match source ID/ref, URL, and SHA-256 of the reopened raw Markdown (vectors page 63,628 bytes, `828dcda3ab5aa5e0f15998a48edc51aed51fed115593454e0f30e4d269ed5016`; hybrid queries page 67,994 bytes, `66a26fb1376fa4f6ab4457217ad748862e9ba5187c348508c595cb095222ed36`). Corpus/index/summary and raw docs updated only through the existing `.okf` crawler; no DB, embeddings, Qdrant, cache, or model writes. The incorrect Vitest invocation for two `node:test` suites was rerun with Node: crawler merge/resume 6/6; crawl readback 4/4; fetch readback 2/2. This closes only the bounded page acquisition/readback step; DOC-DEMAND-03B remains open for durable failure receipts and promotion/admission validation.
- **DOC-DEMAND bounded fetch replay (2026-10-09; scratch only):** fresh inventory scanned 19,288 source files and ranked 31 demands; checksum `d4ba9fe455d15e43951a848fefa8aa348863099d19bceacf3ffd83797d52e63a`. Exact manifest intersection selected 4 official pages: Zod, Valkey topics, and two Qdrant pages. Existing crawler fetched only those pages under `.tmp/atlas/documentation-fetch-v1-20261009T045000000Z`; `ALLOWLIST_READBACK_MATCH` verified all four raw Markdown files, JSON sidecars, URLs, and content hashes, with independent receipt readback. Receipt checksum `a3677d6c052de76cebb783769ede764207916a84c408c5c722d225030b441789`. Demand, allowlist, and fetch/readback tests passed 9/9, 3/3, and 2/2 respectively. No tracked `.okf` corpus, database, vector, or cache was changed; this remains scratch acquisition, not indexing or admission. `DOC-DEMAND-03B` remains open for resumable failure receipts and validated promotion through the existing documentation owner.
- **DOC-DEMAND fresh inventory replay (2026-10-09):** reran the existing root planner after current worktree changes. It scanned 19,290 source files (2 skipped for the 2 MiB bound), ranked 31 documentation demands, and independently read back the scratch receipt at `.tmp/atlas/documentation-demand-continuation-20261009T051223Z.json`. Demand checksum `992833020bfb459fbe7d359788972e54087cbf96bc1f528bcc0815011b7684f7`, replay `MATCH`, receipt readback `MATCH`; `fetchPerformed=false`, `datastoreWritesPerformed=false`. The nine planner tests pass 9/9. Rank remains an uncalibrated lexical/dependency heuristic; this does not prove relevance quality or production documentation admission.
- **DOC-DEMAND ranking-gap correction (2026-10-09):** corrected the 0.04 signal to reward missing indexed documentation rather than existing corpus coverage; added a regression proving an otherwise identical unindexed source ranks above the indexed one. The root planner tests pass 10/10. Fresh scratch receipt `.tmp/atlas/documentation-demand-gap-weighted-20261009T051341Z.json`: 19,290 source files, 31 demands, replay/readback `MATCH`, checksum `dafee1992ba5535d0d0ee4e5a90520bd30747974e50ffd01fb469250ec767f4d`, no fetch or datastore writes. This repairs ranking direction only; the heuristic is still uncalibrated and `DOC-DEMAND-02` manual review remains open.
- **DOC-DEMAND exact URL coverage and Valkey docs fetch (2026-10-09):** coverage now counts only exact normalized catalog URLs (not any sibling page on the same host), reports requested/indexed/missing URL counts, and scores a proportional documentation gap. Regression tests cover trailing-slash equivalence, partial coverage, and an unrelated page from the same source. The current manifest/catalog added official Valkey JSON, Streams, Pub/Sub, Keyspace, Search Queries, and configuration pages; existing root crawler appended the six missing pages into `docs/.okf/dev` (the Topics index page was already present). Independent verification reopened all seven Markdown files and sidecars, matched each corpus row and SHA-256, and read back receipt `.tmp/atlas/valkey-docs-corpus-append-readback-v1.json` (`ALL_REQUESTED_PAGES_READBACK_MATCH`, 7/7; `canonicalAuthority=false`; no DB/cache/vector writes). Corpus merge/recovery/resume/root-index and demand tests passed 25/25; strict OpenSpec and scoped whitespace checks passed. A fresh post-fetch planner receipt `.tmp/atlas/documentation-demand-post-valkey-fetch-20261009T051740Z.json` reports 7/9 exact catalog URLs indexed (0.777778); remaining catalog URLs are broad Redis documentation root and Valkey command index. The Valkey Search page documents an optional module and does not prove that module is installed or used by Atlas. This is documentation-corpus reachability/readback only—not semantic indexing, OpenWiki retrieval, production admission, or approved Atlas cache design. `DOC-DEMAND-02` and failure-receipt/atomic-publication/admission portions of `DOC-DEMAND-03B` remain open.
- **DOC-DEMAND catalog scope review (2026-10-09):** repository source references confirm the app uses `ioredis` against its Valkey/RESP cache lane; the generic Redis docs root and full Valkey commands directory were judged too broad for this bounded doc plan. Removed those two URLs instead of crawling them and bumped catalog revision to `library-api-doc-catalog-v1-2026-10-09`; retained seven exact Valkey topics targeted to JSON, Streams, Pub/Sub, keyspace/expiry, optional Search, and cache configuration. Fresh deterministic planner receipt `.tmp/atlas/documentation-demand-valkey-catalog-reviewed-20261009T051920Z.json` reports 7/7 exact URLs indexed, `coverageRatio=1`, no missing URLs, receipt replay/readback `MATCH`, and no fetch/store writes. The 7/9 preceding receipt remains historical and was superseded by this scope decision. Full ranking calibration/manual reviewer labels (`DOC-DEMAND-02`) remain open; full-coverage-for-selected-URLs does not claim comprehensive Redis/Valkey documentation coverage.
- [x] `DOC-DEMAND-01` — use the existing root planner and catalog, not a second crawler/index owner. A fresh run scanned 19,276 source files, parsed dependency manifests and indexed-document records, ranked 31 documentation sources, replayed deterministically (`replay=MATCH`), and independently verified its scratch receipt. Demand checksum: `d4ba9fe455d15e43951a848fefa8aa348863099d19bceacf3ffd83797d52e63a`; receipt checksum: `19054686ce809e6e2399e81454ae0b8470925d793dadb65d3667902677760904`; report: `.tmp/atlas/documentation-demand-continuation-20261009.json`. No fetch or datastore write occurred. The ranking is explicitly an uncalibrated lexical/dependency heuristic, not production relevance truth.
- [ ] `DOC-DEMAND-02` — evaluate ranking against a manually reviewed sample; add centrality/current-task need signals only if that evaluation demonstrates value. Preserve the planner’s source snapshot and version evidence; do not treat import counts or catalog priority as runtime call-graph proof.
- **DOC-DEMAND fetch-status correction (2026-10-09):** planner output now distinguishes `ALREADY_INDEXED`, `PLANNED_MISSING_URLS`, and `NO_CATALOG_URLS`; fully covered sources are no longer mislabeled `PLANNED_NOT_FETCHED`. Added regression coverage for complete, partial, and absent URL catalogs. The focused suite passes 11/11. Fresh deterministic plan `.tmp/atlas/documentation-demand-v1-2026-10-09T052109184Z.json` scanned 19,290 source files, produced 31 demands, and independently replayed with checksum `d063aa1e5e97788f447c33c52b719f8d5a891e7c7804ef42aa3326ad9cc70351`; no fetching or datastore writes occurred. Lexical source counts remain usage signals, not call-graph evidence, and `DOC-DEMAND-02` manual ranking calibration remains open.
- **DOC-DEMAND P0 documentation append/readback (2026-10-09):** added exact official SvelteKit, Svelte, Bits UI, TypeScript, and Drizzle URLs to the existing crawler manifest. The demand plan selected only missing URLs; the allowlist now skips `ALREADY_INDEXED` sources and intersects normalized exact missing URLs while preserving manifest URLs. This fixed a trailing-slash mismatch that would otherwise have omitted TypeScript docs. The existing append crawler added eight Svelte/Bits UI/Drizzle pages, then one TypeScript page, to `docs/.okf/dev`; the independent root verifier reopened markdown and sidecars and matched all nine selected URLs (`ALLOWLIST_READBACK_MATCH`, 8/8 and 1/1) with receipt readback `MATCH`. Fresh plan `.tmp/atlas/documentation-demand-post-typescript-crawl-v1.json` marks Zod, Svelte/TypeScript/Bits UI, Valkey, and Drizzle fully indexed; Qdrant points and other missing catalog URLs remain planned. No database, embedding, Qdrant, Valkey, or model writes occurred. Documentation acquisition/readback does not prove semantic indexing, OpenWiki retrieval, production admission, or ranking calibration.
- **DOC-DEMAND next ranked gaps (2026-10-09):** added the exact official Qdrant Concepts/Points URL and the MCP docs/spec URLs to the existing crawler manifest. A fresh plan selected only these three missing URLs; append and independent markdown/sidecar/corpus readback passed 3/3 (`ALLOWLIST_READBACK_MATCH`, receipt readback `MATCH`). Latest plan `.tmp/atlas/documentation-demand-post-next-p0-crawl-v1.json` reports Zod, Svelte/TypeScript/Bits UI, Valkey, Drizzle, Qdrant, and MCP at `ALREADY_INDEXED`. Next ranked gaps are LangChain/LangGraph Python and PostgreSQL 18; catalog presence is not proof of runtime installation or semantic admission.
- **DOC-DEMAND graph/agent documentation continuation (2026-10-09):** appended the next exact catalog-missing official pages through the existing bounded allowlist and append crawler: LangChain/LangGraph Python (2), PostgreSQL 18 reference (1), LangChain/LangGraph JavaScript (2), Tree-sitter/ast-grep/N-API (3), and NetworkX (1). Independent corpus readback matched 3/3, 5/5, and 1/1 for these batches; the earlier Qdrant/MCP and P0 receipts are recorded above. The latest planner receipt `.tmp/atlas/documentation-demand-post-networkx-v1.json` covers 31 sources, scanned 19,291 source files, replayed/read back deterministically, and now ranks Rust workspace, PyTorch/NumPy/Arrow, FastAPI/Pydantic/LangExtract, ONNX Runtime, and Go gRPC as remaining documentation gaps. These are fetched documentation references only; no semantic index, external-doc admission, datastore or model writes occurred. `DOC-DEMAND-02` remains open for reviewed ranking calibration.
- **DOC-DEMAND runtime/data stack docs (2026-10-09):** the planner selected the remaining Rust workspace pages (Rust Book, Rayon, Tokio, Serde) and PyTorch/NumPy/Arrow pages (C++, Python, and reference APIs): 9 exact URLs across 2 sources. Existing crawler append and independent readback matched 9/9; receipt `.tmp/atlas/documentation-crawl-rust-pytorch-readback-v1.json` is `ALLOWLIST_READBACK_MATCH` with receipt checksum readback `MATCH`. Fresh plan `.tmp/atlas/documentation-demand-post-rust-pytorch-v1.json` replays across 31 demands and now ranks FastAPI/Pydantic/LangExtract next, followed by ONNX and Go gRPC; RAPIDS/cuVS/cuGraph docs remain later lower-count gaps. Documentation is reference material only, not evidence that a runtime/dependency is installed or admitted.
- **DOC-DEMAND grounding and accelerator docs (2026-10-09):** fetched the exact catalog URLs for FastAPI, Pydantic, and LangExtract (3/3 readback: `.tmp/atlas/documentation-crawl-fastapi-grounding-readback-v1.json`), then selected the cuVS Python and cuGraph Python docs because those CPU/GPU parity executors are on the project path (3/3 readback: `.tmp/atlas/documentation-crawl-rapids-readback-v1.json`). The latest deterministic 31-source plan is `.tmp/atlas/documentation-demand-post-rapids-v1.json`; ONNX Runtime, Go gRPC, OaKlib, and Firecrawl/BeautifulSoup are the next higher gaps. RAPIDS docs are reference-only and do not prove GPU execution or parity; no GPU job, semantic indexing, or persistent-store write was run.
- **DOC-DEMAND ingestion and native/GPU continuation (2026-10-09):** fetched ONNX Runtime and Go gRPC/protobuf/pgx (4/4 independent readback: `.tmp/atlas/documentation-crawl-onnx-go-readback-v1.json`), OAKlib plus BeautifulSoup/Firecrawl (3/3: `.tmp/atlas/documentation-crawl-oaklib-crawl-readback-v1.json`), and cuDF/libcudf/cuGraph C++ plus cuBLAS (9/9: `.tmp/atlas/documentation-crawl-rapids-cpp-readback-v1.json`). The post-crawl 31-source plan `.tmp/atlas/documentation-demand-post-rapids-cpp-v1.json` replayed/read back successfully; remaining exact catalog gaps include cuML, RAFT, cuVS C++ integrations, RMM, OpenWiki, and simdjson. These pages were added to the existing `.okf/dev` corpus, not semantically indexed or admitted. No GPU execution or persistent data-store writes occurred. The Atlas/Trace/OpenWiki MCP tools requested in the objective are unavailable in this execution environment, so no MCP workboard/ACE packet retrieval is claimed. `DOC-DEMAND-02` ranking review and GPU parity remain open.
- **DOC-DEMAND remaining accelerator/agent docs (2026-10-08):** added the seven catalog-owned sources to the existing `.okf/dev/manifest.json`, generated a deterministic 7-source exact-URL allowlist from a fresh 31-demand plan, and appended its 12 missing pages through the existing crawler (cuML, OpenWiki, RAFT, cuVS C++ integrations, libcuml, RMM, simdjson). Independent corpus/sidecar/Markdown readback passed 12/12 at `.tmp/atlas/documentation-crawl-append-readback-20261008-v1.json`; no model synthesis, semantic/vector indexing, admission, or persistent-store writes occurred. The documentation symbol indexer initially hit an AST-grep API mismatch (`node.startPosition`); it now uses the existing `node.range().start.line` API and reruns cleanly across all 75 source pages / 43 code blocks, emitting 21 symbols with `ast_grep_parsed_blocks=43`. Added a live-repository local lexical retrieval regression: query `coding-agent integrations` reaches `openwiki-agent-docs` as `GENERATED_CORPUS` (24/24 read-model tests pass); this is not PostgreSQL FTS, semantic retrieval, or canonical admission. Fresh demand plan `.tmp/atlas/documentation-demand-final-20261008-v1.json` covers 31 demands, scans 19,291 source files, and independently verifies deterministic replay/readback. `DOC-DEMAND-02` ranking calibration, semantic indexing/admission, and GPU parity remain open.
- [x] `DOC-DEMAND-03A` — added a root allowlist adapter that intersects planner `officialUrls` with the existing crawler manifest by exact source ID and URL; it rejects a modified demand checksum and never broadens the crawler URL set. A bounded existing-crawler dry run selected exactly the pages in the allowlist. The four-page scratch fetch (`zod`, `redis-valkey`, two `qdrant` pages) independently read back against corpus JSONL, per-page sidecars, and exact markdown byte hashes: `ALLOWLIST_READBACK_MATCH`, 4/4 pages, no missing pages. Allowlist checksum `36d3f4c419b251f3297471f1b8c7664ec595ee5074d41d8cf1680015ca0b1c58`; readback checksum `4c65270ccc8eb927e65bde2503383d3969233490841f7488ad4e6d6a0aee6c14`. All output remained under `.tmp/atlas`; canonical corpus and persistent stores were untouched.
- [ ] `DOC-DEMAND-03B` — prove resumable fetch/failure-state receipts and validated promotion into the existing `.okf` documentation corpus; keep the demand planner read-only and preserve the existing versioned documentation admission owner. Scratch crawl/readback is not canonical indexing or admission.
  Partial implementation: append mode now recovers only a complete raw-markdown/JSON-sidecar pair after verifying source ID, source ref, exact URL, expected relative path, and SHA-256 content hash; incomplete pairs, identity conflicts, and checksum mismatches fail closed. Focused recovery/merge/root-path/allowlist/readback/demand suites pass 31/31, including a scratch-only crawler integration test that exercises restart recovery without fetching. This does not yet provide per-run failure receipts, atomic publication of corpus/index/summary, or admission-owner validation; DOC-DEMAND-03B remains open. No canonical corpus mutation was run for this change.
- **DOC-DEMAND-03B publication protocol (2026-10-09; implementation and fixture proof):** the existing root crawler now publishes immutable generation artifacts plus one atomically renamed `published-current.json` receipt pointer after validating exact allowlist identity/URL, markdown and sidecar checksums, duplicate constraints, generation readback, and receipt pointer readback. Failures emit readback-checked receipts under `.tmp/atlas/documentation-crawl-failures/` and do not replace the prior pointer. The SvelteKit documentation read model and root append verifier follow the pointer and reject damaged generations; the crawler retains legacy-corpus fallback when no pointer exists. Publication suite passes 9/9, crawl-resume integration 1/1, and documentation read-model Vitest 25/25; root verifier `node --check` passes. This is fixture/application-reader validation only: no real crawl was run, no current `.okf` corpus was promoted by this change, and the canonical PostgreSQL documentation admission/indexing owner remains independently unverified. Keep `DOC-DEMAND-03B` open until the existing admission owner validates a published generation and independent corpus/index readback is proven. Filesystem artifacts were written only in tests' temporary directories; no database/vector/cache writes occurred.
- **DOC-DEMAND-03B publication/admission alignment (implementation and fixture proof):** added `scripts/atlas/validate-okf-dev-publication-admission-alignment-v1.mts` and its pure helper. It compares admission envelopes to a verified published generation by exact `sourceId + URL + contentHash`, then invokes the existing DB-free `validateExternalDocAdmissionHandoff`; it never calls the writer or infers product/version/fetcher/parser provenance. Four helper tests pass. A later fresh run against the current active pointer verified the published generation but initially used an envelope report object instead of the required envelope array; that attempt was invalid and is superseded by the correctly shaped run below. Persisted admission, canonical corpus readback, and DOC-DEMAND-03B remain open.
- **DOC-DEMAND-03B fresh exact-cohort check:** active pointer and generation readback resolve to 76 published pages, run `20261009T065136796Z-346cab161989bd32`, manifest checksum `sha256:00d6e8bca241aff027e387aafd995f50cce7233f4cf5729d1b7f40fd7f478751`. The correct pinned admission envelope is a 30-item array, but exact `(sourceId, URL)` overlap is `0/30`; the verifier reports 30 `PUBLISHED_PAGE_NOT_FOUND_FOR_ENVELOPE` blockers while the independent DB-free admission handoff reports `EXTERNAL_DOC_ADMISSION_HANDOFF_READY`. This establishes a cohort/source-manifest mismatch, not missing publication and not a content-hash mismatch. Do not refresh envelopes by inference or weaken identity matching; reconcile through the owning source/admission-manifest path. No database/vector/cache writes occurred. Scratch report: `.tmp/atlas/okf-dev-admission-publication-alignment-current-v2.json`.
- **Version-qualified crawler manifest adapter (2026-10-09; dry-run only):** the existing crawler expected legacy `kind/domain_class/focus_tags` entries and failed on the reviewed versioned manifest. Added `okf-dev-source-manifest-adapter-v1.mjs` to preserve source/manifest revisions and publisher/product/version metadata, validate every explicit HTTPS page against `allowed_domains`, enforce `maximum_pages`, reject duplicate URLs/unsupported fetchers, and try `default_fetcher` first while retaining legacy-manifest compatibility. Five focused adapter tests pass. The real versioned manifest dry-run selected exactly one Oaklib URL (`processed=1`) under `.tmp/atlas`; no network fetch, corpus publication, database, vector, cache, or model write occurred. This closes format compatibility only; DOC-DEMAND-03B and admission remain open.
- **Root crawler TypeScript diagnostics (2026-10-09):** `scripts/tsconfig.json` used include globs rooted one directory too deep, yielding “No inputs were found” and cascading unresolved Node builtin/`process`/implicit-any diagnostics for `scripts/docs-atlas/crawl-okf-dev-docs.mts`. Scoped the script project to the docs-atlas TypeScript entrypoints; installed `@types/node` was already available, so no package install was needed. `npx --no-install tsc --project scripts/tsconfig.json --noEmit --pretty false` passes. Crawler publication/resume tests pass 13/13. No crawl/network fetch or canonical corpus publication was run; DOC-DEMAND-03B remains open.
- **Bounded versioned-manifest publication (2026-10-09; one official page):** after confirming the exact Oaklib introduction URL was absent from the active 75-page generation, the adapter/crawler fetched only that manifest-listed page and published a new 76-page immutable generation. Pointer and generation readbacks pass; the record preserves `source_revision=oaklib-docs-2026-10-05`, `authority_class=OFFICIAL_PRIMARY`, the declared BeautifulSoup preference, actual `fetched_via=firecrawl` fallback, content hash, and `llm_synthesis="No model synthesis was run..."`. No database/vector/cache/GPU/model write occurred. The admission alignment verifier remains `OKF_ADMISSION_ALIGNMENT_BLOCKED`: the matching Oaklib envelope has a different content hash and 56 other exact envelope URLs are absent. Do not refresh envelopes by inference or weaken exact checksum matching; obtain source-owner review and regenerate only through the existing admission-envelope owner. Receipt: `.tmp/atlas/okf-dev-admission-publication-alignment-v1.json`; active pointer: `docs/.okf/dev/published-current.json`.

## Post-index documentation execution batch

Run this batch only after a published documentation generation has passed DOC-DEMAND-03B validation and the existing documentation admission/index owner has independently read back the admitted corpus. A local `.okf/dev` record or `llm_synthesis` text stating that no model synthesis ran is acquisition/reference evidence only; it is not an indexed, admitted, or synthesized result. Reuse the existing corpus, SearchRuntime, ACE/ContextManifest, DAG, BitFrost, cuVS, graph-analysis, and model-resolution owners. Do not create a parallel document store, vector lane, graph owner, cache authority, queue owner, or synthesis service.

- [ ] `DOC-BATCH-01` — freeze the indexed-document artifact/readback contract. Treat each source page and chunk as immutable revision-qualified records; publish JSON/JSONL manifests with schema/version, source ID, exact canonical URL, product/documentation version, source content hash, parser/normalizer revision, page/chunk IDs and evidence lineage. Keep raw Markdown/page files as immutable source artifacts and JSONL as bounded control/index transport; do not duplicate full page bodies into packet envelopes. Reopen artifacts independently and verify counts, uniqueness, hashes, source/version identity, and manifest-to-corpus joins before downstream work. No packet identity may be minted from a filename, ordinal, URL, or content hash alone.
- [ ] `DOC-BATCH-02` — benchmark the existing simdjson typed-evidence/JSONL bridge against the standard parser on the same frozen admitted corpus. Measure throughput, peak memory, malformed-record isolation, deterministic ordering, schema-validation parity, and independent checksum/readback. Require CPU fallback parity and bounded batches. simdjson remains a parser/transport adapter, not identity, admission, or storage authority; no native path promotion from a microbenchmark alone.
- [ ] `DOC-BATCH-03` — create a bounded batch manifest over admitted document chunks and their exact `semantic_768` vectors. Freeze cohort checksum, CandidateOrdinal mapping, exact model artifact/runtime digest, formatted document input and prompt revision, pooling/normalization recipe, vector checksums, query set, and CPU exact-cosine oracle; verify the query embedder uses a compatible, parity-proven recipe. A 768-dimension match or mutable model tag alone is insufficient. Reuse DOC-19/DOC-20/DOC-21 cuVS owners for exact, CAGRA, and IVF-PQ-plus-exact-refinement comparisons; report Recall@K, rank parity, latency, memory, and failure states. Do not mix document vectors with code vectors or permit a new retrieval vote. Existing 852-chunk executor receipts do not prove current wrapper/service reachability or a newly indexed cohort.
  - **Read-only live PostgreSQL refresh (2026-10-09):** `atlas_external_doc_chunks` contains 852 chunks; all 852 have non-null `content_embedding`, and all 852 report 768 dimensions. Live schema is `vector(768)` with the existing HNSW `vector_cosine_ops` index. The existing cohort verifier independently recomputed and matched the frozen Q8 cohort checksum `354fdd73836dd7be9f61ab27950f140f961dcc50ea41f6ffd4b6b87cb05b29cb` (`COHORT_UNCHANGED`), proving stored vector-text readback against that old cohort manifest. This still does not prove fresh EmbeddingGemma generation/current serving-runtime parity, and the cohort excludes the recently crawled `.okf` pages. No database writes, embedding calls, or Qdrant writes occurred. Keep DOC-BATCH-03 and new-page embedding/indexing open pending exact runtime receipt, CandidateOrdinal mapping, CPU cosine query parity, and current runtime binding.
  - **Executor dry-run refresh (2026-10-09):** `:8081/health` was unavailable; Ollama reported resident `embeddinggemma:latest` digest `82f094e4c0e19bc4208c692996d4f1ecf14e82a8dee579ee1d2ca1175260058e` (BF16). The existing external-doc embedder selected Ollama but found 852/852 already populated, so considered/prepared/written were all 0 and no embedding request ran. Its available external-doc parity receipt is still for the distinct Q8_0 GGUF at `:8081` (SHA-256 `4a2f0fe9...`), not this Ollama digest; do not use that receipt to authorize an Ollama write. The separate general embedding provenance receipt names an F16 GGUF, which is also not the external-doc Q8 receipt. Exact selected-runtime ↔ persisted-vector lineage therefore remains unproven; no writes occurred.
  - **ONNX failure-isolation diagnostic (2026-10-09; local CPU, scratch-only):** added `scripts/atlas/prove-embeddinggemma-onnx-failure-isolation-v1.mjs` and ran it against the exact first model/tokenizer directory selected by production `onnx-embed.ts` (`sveltekit-frontend/static/embeddinggemma_300m_onnx`). The ONNX SHA-256 is `e416365eaf7224cd490c508ea3b42f10855332dd8317015d2344577f73788772`, matching the prior parity report; the resolved tokenizer SHA-256 is `6852f8d561078cc0cebe70ca03c5bfdd0d60a45f9d2e0e1e4cc05b68e9ec329e`. The ignored `/models` ONNX weights match, but its tokenizer file has a different hash; on this six-input fixture the token IDs, masks, and output-vector checksums nevertheless matched the production-resolved copy. Direct ONNX output is `[1, sequence, 768]`, mean-pooled over the attention mask and L2-normalized; the six outputs are finite 768-vectors with unit norms. Cosines: exact duplicate `1.0000`, paraphrase `0.9357`, related `0.9012`, unrelated `0.8528` and `0.8604`. This small fixture suggests a high-cosine/narrow-separation concern but is not an admission threshold or a Q8 comparison. The local Q8_0 artifact hash matches the frozen cohort manifest (`4a2f0fe9...`), but `:8081` was unavailable and no local `llama.cpp` CLI was present, so the runner made zero Q8 embedding calls and reports `NOT_MEASURED_NO_ARTIFACT_BOUND_LIVE_REFERENCE`; prior Q8 parity numbers use different inputs and are not presented as a fresh comparison. Receipt `.tmp/atlas/embeddinggemma-onnx-failure-isolation-v1-runtime-resolved.json`, checksum `sha256:8956b8bef534a02dcac8c67f62eaba307ad12aaa38e238bd3f1600b5f0ae97f6`; independent readback `MATCH`. No vector/store writes or promotion occurred; keep ONNX `NOT_ADMITTED` and DOC-BATCH-03 open pending identical-input, artifact-bound Q8 comparison and broader semantic/retrieval evaluation.
  - **Prompt-corrected diagnostic follow-up (2026-10-09; scratch-only):** the initial six raw-text inputs above omitted EmbeddingGemma's documented task prefix, so their narrow cosine separation is not sufficient evidence of a model/export defect. Re-ran the same fixed semantic-similarity fixture using `task: sentence similarity | query: {text}`; duplicates remained exactly `1.0000`, paraphrase `0.9144`, related `0.8336`, unrelated `0.7490` and `0.7298`. This shows measurable ordering on the bounded fixture, but it does not resolve comparison against the Q8_0 reference or retrieval fitness. Google's EmbeddingGemma model card recommends task prefixes and documents the retrieval query/document formats; the exporter emits `last_hidden_state` and does not pool inside ONNX, while current runtime applies masked mean pooling and L2 normalization externally. The local pinned `modules.json` independently declares Transformer → mean Pooling → `2_Dense` (768→3072) → `3_Dense` (3072→768) → Normalize, with checksummed projection weights. The exporter uses `AutoModel` and exports only `last_hidden_state`, and the runtime has no projection step; this is the leading source-level pipeline mismatch, not yet a proven cause of the earlier degenerate report because no same-input full-SentenceTransformer-versus-ONNX comparison has run. The latest prompt-corrected receipt including source pipeline module/config/weight checksums is `.tmp/atlas/embeddinggemma-onnx-failure-isolation-v1-2026-10-09T164921479Z.json`, checksum `sha256:bcbf1710b27b72d3a308ea90aa876eb11033c25c9202f664d26200c4653dff86`; independent readback `MATCH`. The current runtime still lacks an artifact-bound Q8 executor at `:8081`, so quantization/export damage cannot yet be isolated. Keep ONNX `NOT_ADMITTED`; next compare identical retrieval-formatted inputs against both the full local SentenceTransformer pipeline and exact Q8_0 GGUF once the required reference executor is available, then evaluate frozen retrieval rankings before any promotion.
- **ONNX same-input comparison gate (2026-10-09; scratch-only):** reran `node scripts/atlas/prove-embeddinggemma-onnx-failure-isolation-v1.mjs --output .tmp/atlas/embeddinggemma-onnx-failure-isolation-v1-20261009-current.json` against the production-resolved ONNX artifact. Receipt checksum `sha256:fc3b9a871bef8012ca68e6843306b6e68918bac23d15391d89dc436dcca9088e`; independent readback `MATCH`. The six prompt-prefixed outputs are finite 768-vectors with unit norms and non-degenerate ordering on this fixture (duplicate 1.0000, paraphrase 0.9144, related 0.8336, unrelated 0.7490/0.7298), so this rerun does not reproduce a collapse. Source inspection still shows a pipeline mismatch: ONNX exports raw `[1, sequence, 768]` hidden states and runtime masked-mean-pools/normalizes, while local SentenceTransformer metadata includes two learned dense projections before normalization. Exact Q8_0 GGUF checksum matches the cohort manifest, but `:8081` is unavailable; same-input Q8 comparison was not measured. Full SentenceTransformer-versus-ONNX stage comparison has not run. Windows Python 3.13 has the required `torch`, `transformers`, `sentence-transformers`, `onnxruntime`, `onnx`, and `safetensors` packages, but the last read-only resource check showed about 2.49 GiB free physical memory against a 1,211,486,072-byte base model weight file; assess safe bounded loading before attempting inference. Next gate: compare tokenization, hidden states, masked pooling, both dense projections, normalization and final vectors on identical retrieval-formatted inputs in a resource-qualified local environment. No embedding-store writes, Q8 reference calls, or promotion occurred.
- **Fresh ONNX failure-isolation receipt (2026-10-09; local CPU, scratch-only):** reran the root diagnostic with a unique `.tmp/atlas` path; artifact SHA-256 remains `e416365eaf7224cd490c508ea3b42f10855332dd8317015d2344577f73788772`, equal to the ONNX artifact in the prior `NOT_ADMITTED` cross-executor report. The fresh six-input query-prefixed fixture again produced finite, nonzero, unit-norm vectors and measurable within-ONNX ordering (duplicate 1.0000, paraphrase 0.9144, related 0.8336, unrelated 0.7490/0.7298); this does not reproduce within-model collapse and does not invalidate the prior poor ONNX-vs-Q8 cosine results (`min -0.0860`, 32 pairs), which used a separate comparison. The exact Q8_0 artifact matches the frozen cohort manifest, but `http://127.0.0.1:8081` was unavailable, so zero Q8 inference calls occurred and no fresh cross-model comparison was measured. Receipt `.tmp/atlas/embeddinggemma-onnx-failure-isolation-v1-2026-10-09T171852959Z.json`, checksum `sha256:effe79e491c09298db2bc984195f1d12a891c4cb0be4631c8bbdee9f7d392336`; independent readback `MATCH`. The leading source-level mismatch remains omission of the source SentenceTransformer's two learned Dense projections. **Environment correction (2026-10-09):** Windows Python 3.13 has `torch 2.8.0+cu128`, `transformers 5.5.0`, `sentence-transformers 5.0.0`, `onnxruntime`, `onnx`, and `safetensors`; the earlier claim that Windows lacked `torch`/`transformers` is stale. The source model weights are present (base `model.safetensors` is 1,211,486,072 bytes; Dense projection files are present), but no full-pipeline comparison was run. A read-only resource check showed about 2.49 GiB free physical memory, so do not load the full model until a safe bounded execution/resource check is available. No dependencies, model files, vector stores, or services were changed; ONNX remains `NOT_ADMITTED`.
- **Full SentenceTransformer-versus-ONNX pipeline diagnostic (2026-10-09; local CPU, scratch-only):** executed `scripts/atlas/prove-embeddinggemma-full-pipeline-parity-v1.py` with a 2,987,192,320-byte physical-memory preflight, local-only model loading, six identical retrieval-formatted inputs, tokenizer-ID/mask comparison, all five SentenceTransformer module stages, and independent receipt checksum readback. Token IDs and masks matched for all six. The loaded SentenceTransformer pipeline separated duplicate/paraphrase/related/unrelated pairs at `1.0000/0.8644/0.6199/0.3830/0.3079`; current ONNX masked-mean vectors produced `1.0000/0.9144/0.8336/0.7490/0.7298`. Cross-pipeline cosine ranged `-0.04803` to `0.05805`, so these ONNX outputs are not numerically compatible with the local full SentenceTransformer outputs on this fixture. This does not isolate causality or qualify the reference runtime: metadata expects SentenceTransformers `5.1.0` and Transformers `4.57.0.dev0`, but installed versions were `5.0.0` and `5.5.0`. Receipt `.tmp/atlas/embeddinggemma-full-pipeline-parity-v1-goal-20261009.json`, checksum `sha256:9b560946fc8ac78ba4ee5992777b8de9a14bb24b54a3911a1724b95c7e3301bc`; independent readback `MATCH`. No Q8 calls, embedding-store writes, or admission occurred. Keep ONNX `NOT_ADMITTED`; next use a version-matched source environment and artifact-bound Q8 reference, then compare pooling/projection stages before changing or exporting model artifacts.
- **Projection-stage isolation follow-up (2026-10-09):** extended the same diagnostic runner to replay ONNX hidden states through the source model's existing pooling, Dense, and normalization modules and record per-stage checksums/cosines; `py_compile` passes. The attempted rerun failed closed at its unchanged memory preflight (`1,872,404,480 < 2,500,000,000` bytes) before model load or inference, and produced no receipt. The prior final-vector incompatibility remains the only executed comparison; stage attribution is still unproven. Retry only when the runner's resource preflight passes, then use a framework-version-matched environment before interpreting parity.
- [ ] `DOC-BATCH-04` — reuse the existing NetworkX CPU graph-analysis owner as the oracle for document/concept graph metrics, then compare only supported algorithms with the existing RAPIDS/cuGraph executor on the same frozen, admitted graph artifact and relation revision. Record artifact checksums, graph revision, algorithm/configuration, CPU/GPU result parity, resource preflight, and whether a CUDA kernel actually executed. A GPU library import, planner, or cuTile capability result is not GPU-execution proof. Keep cuTile/SIMT work challenger-only until a measured kernel has CPU-oracle parity and an independent execution receipt; do not reinterpret vector ANN topology as typed document or ontology relations.
- [ ] `DOC-BATCH-05` — finish DOC-17 using the existing BitFrost/Valkey owner: materialize only a bounded `HotBucketDescriptorV1` of admitted IDs/revisions/checksums, never document bodies, vectors, tensors, or canonical evidence. First prove dry-run selection, full-revision cache keying, TTL/invalidation behavior, and cold-versus-warm result equivalence; then require explicit authorization for a Valkey write and independent readback. Cache warming must not alter rank, identity, admission, or retrieval-vote ownership. Keep DOC-18 centroid routing separate and optional. For SSR→CSR expansion, SSR should provide the authorized compact card/manifest; CSR may request L2/L3 payloads on demand through authorized revision/hash-bound loaders, with byte budgets, cancellation on case/query changes, stale-response rejection, and disposal/eviction after the final consumer releases a buffer. Keep vector payloads out of Valkey descriptors and never cache model KV/hidden state.
- [ ] `DOC-BATCH-06` — compile one bounded, read-only DAG synthesis request from the existing admitted retrieval result through the existing ACE/ContextManifest and Atlas DAG owners. Bind the request to the indexed-document manifest, selected source/chunk evidence, `semantic_768`/graph revisions when used, validated DAG checksum, runtime/tool revisions, and execution receipt. Verify deterministic replay, evidence coverage, token/context budget, no-write state, and independent receipt readback. Do not send raw search results directly to a model; no synthesis or promotion unless the canonicalized ContextManifest is accepted.
- [ ] `DOC-BATCH-07` — decide whether RabbitMQ is needed for this batch by auditing the existing outbox/queue owner and workload requirements. `amqplib` availability and legacy summarizer scripts do not establish a need for a new queue. If an existing queue is required, reuse it with bounded messages containing immutable manifest/page IDs and checksums, idempotency keys, retry/dead-letter policy, consumer fencing, and receipt-backed completion; never make RabbitMQ canonical state or bypass the durable journal/outbox gate. Otherwise record `NO_NEW_QUEUE_REQUIRED` and keep the batch synchronous/bounded.
- [ ] `DOC-BATCH-08` — optional, only after DOC-BATCH-01/06 pass: run a bounded source-grounded documentation summary using the runtime-resolved active model from the existing model resolver (verify `/v1/models`; do not assume a model name or start/restart `:8090`). Record model binary/artifact digest, active model ID, prompt/template revision, input ContextManifest checksum, selected source refs, output checksum, latency/token usage, and validator results. Keep the fetched-page record's `llm_synthesis: "No model synthesis was run..."` unchanged; emit a separate summary artifact with explicit model provenance. Summary text is derivative/non-authoritative and must not create local-repository facts, ontology admission, or canonical identity. If the active server is unavailable or resource preflight fails, emit an unavailable receipt rather than silently using a different model or client-side Gemma path.
- [ ] `DOC-BATCH-09` — end-to-end acceptance: independently replay one bounded indexed batch from published manifest through parser, exact candidate/vector readback, CPU oracle and eligible accelerator comparisons, cache dry-run/readback (only if authorized), ContextManifest, and read-only DAG receipt; include all failure/unavailable states and prove unchanged source generation and zero unauthorized writes. Mark no production-ranking, cache-warming, model-synthesis, or GPU gate complete from fixture-only evidence.
- [ ] `DOC-BATCH-10` — establish the post-index packet/file boundary using the existing PostgreSQL documentation admission and packet owners. Verify what is stored as immutable source files versus JSON/JSONL packet/control envelopes; envelopes may carry admitted IDs, revisions, checksums, sourceRefs, and bounded metadata, but must not duplicate full page bodies or mint identity from paths, URLs, ordinals, or hashes. Independently read back one admitted document packet and its file/chunk references, then emit a revision-qualified receipt. A published `.okf` generation alone is not PostgreSQL indexing or packet admission.
- [ ] `DOC-BATCH-11` — define the daily Graphify refresh as a bounded, idempotent pass over PostgreSQL-admitted documentation packets only. Pin the input admission generation, packet/chunk identities, source/documentation revisions, parser/Graphify revisions, and output graph revision/checksum; reconcile additions, unchanged members, stale members, and removals without inferring identity or refreshing canonical Graphify facts from crawler output. Require independent snapshot readback and an unchanged-input deterministic replay before any downstream graph feature use. Keep this separate from the existing code Graphify snapshot and do not promote document-derived edges without the ontology/evidence admission gate. A daily code-Graphify receipt alone is not the document-relation graph revision; join only through a separately pinned document cohort and the existing graph admission owner.
- [ ] `DOC-BATCH-12` — align repository search helpers and NLP extraction to the same evidence envelope. Use `rg` for bounded lexical discovery, the existing UTF-8 byte reader for exact source spans, Tree-sitter/ast-grep for syntax observations, and the existing FastAPI/LangExtract owner only for source-grounded proposals. `sed` output is diagnostic context, never canonical byte-span evidence. Record producer/extractor revisions and exact source digest/span; reject out-of-range or stale spans. Compare any `trace`/Atlas-tools MCP observations with direct repository and receipt evidence by exact identity/revision; MCP availability or tool output alone cannot establish admission. If MCP tools are unavailable, record `UNAVAILABLE` rather than claiming alignment.
- **DOC-BATCH-12 evidence update (2026-11-23):** live `/extract/documentation-facts` on `:8095` called Gemma 4 at `:8090`, returned exact spans, and remained proposal-only. A fresh read-only PG18 source binding verifies the canonical NVIDIA page/chunk and exact quote at page bytes 9290..9358. Replaying the full page returned six exact-span facts but omitted the reviewed NVRTC quote; replaying the canonical chunk returned an unrelated fact; a targeted sentence window abstained. Thus source binding passes but relation extraction recall does not. The input content digest is kept distinct from canonical page/chunk evidence revisions. The connected MCP URL lookup returns `NO_PACKET`, and no graph revision/tuple/relation rows exist. `DocumentationFactV1`'s stale `LANGEXTRACT_ORNITH` source default is corrected to `LANGEXTRACT_OPENAI_COMPATIBLE` and its focused test passes, but the running sidecar has not reloaded the edit. Keep DOC-BATCH-12/13 open; see `docs/reports/doc14-nvidia-cuda-ptx-canonical-source-binding-v1.json` and `docs/reports/parent-atlas-nlp-retrieval-cleanup-review-2026-11-23.md`.
- [ ] `DOC-BATCH-13` — close the packet-to-execution integration after DOC-BATCH-10..12: feed only independently read-back, admitted packet IDs and checksums to the existing bounded retrieval/ACE/ContextManifest/DAG path; verify SearchRuntime and Trace/Atlas tool identities, selected evidence, revisions, and execution receipt agree. No direct raw crawler JSON, unadmitted NLP facts, cache contents, or model summaries may enter synthesis. Preserve the fetched record's `llm_synthesis: "No model synthesis was run..."`; any later Ornith summary is a separate, runtime-identity-bound derivative artifact under DOC-BATCH-08. <!-- wfu: depends=DOC-BATCH-10,DOC-BATCH-11,DOC-BATCH-12 -->
- **DOC-DEMAND-03B retained-row publication fix (2026-10-09; fixture-only):** found that append publication validated only newly fetched pages while copying retained corpus rows into the published JSONL without reopening their raw Markdown/sidecars; an entry could also be published with no page readback. The existing publisher now requires a verified page readback for every published row, applies the current exact allowlist to newly selected pages, and independently revalidates retained pages' HTTPS URL, identity, sidecar and content hash. Added regressions for retained rows outside the current fetch allowlist, missing retained artifacts, and unverified entries. Publication and restart/resume integration suites pass 12/12. No live crawl or canonical publication was performed; current alignment verifier still reports `PUBLISHED_GENERATION_MISSING`, so DOC-DEMAND-03B remains open pending a real validated generation and admission-owner readback.

- [ ] DOC-OPENWIKI-01 Reuse the existing OpenWiki/.okf retrieval owners to fetch and index only version-qualified documentation demanded by repository inventory; preserve official URL, content digest, package/runtime version, bounded fetch policy, publication receipt, and independent lexical/semantic readback.

**2026-10-11 WSL and documentation alignment recheck (read-only; gate remains open):** the current catalog contains 32 source records and 81 official URL candidates; the dev crawl manifest contains 39 sources. Six manifest sources (`mastra`, `trpc`, `acp`, `a2a`, `opencode`, `rapids`) have no matching catalog record, and no captured raw pages for their listed URLs were found under `docs/.okf/dev/raw`. `firecrawl` is separately listed in the manifest but is represented by the existing combined `beautifulsoup-firecrawl` catalog record and raw capture; identity-level reconciliation still needs to make that relationship explicit. Current publication summary reports 79 pages, `canonical_authority=false`, and no persistent-store writes; this does not prove these six sources were captured or admitted. The current WSL `atlas-rapids-cu13` environment imports NumPy 2.4.6, PyTorch 2.13.0, NetworkX 3.6.1, FastAPI 0.141.1, Pydantic 2.13.4, LangExtract 1.6.0, Tree-sitter 0.26.0, PyArrow 24.0.0, cuGraph/cuVS 26.6.0; BeautifulSoup, Python SIMDJSON, LangChain, Deep Agents, DSPy, and the checked `cutile` module are not importable. The WSL base environment has none of those queried packages. These are environment-specific import probes, not production-caller proof. `docs/MASTER-TOC.md` remains a generated navigation projection and does not provide a per-WSL-environment package inventory; `openwiki/quickstart.md` contains a link to a workflow page absent from the current `openwiki/` listing. Do not hand-edit generated OpenWiki pages or install packages to close this audit. Next: reconcile source IDs through the existing catalog/crawl owners, capture/read back the missing official pages under the bounded fetch policy, and independently verify publication before semantic indexing/admission. No task is marked complete by this inventory.

**Correction (2026-10-11; corpus-owner crosswalk):** the preceding raw-directory-only comparison overstated missing documentation. Exact current source-ID readback shows `trpc` has 96 chunks in `docs/.okf/dev/tooling-docs.chunks.jsonl` and 9 matching envelopes in `pinned-plus-tooling-tooling-docs.admission-envelopes-v2.json`; `rapids` is represented by 19 published corpus rows under specific `rapids-*` source IDs, and Firecrawl has both a standalone and combined-source row. `mastra`, `acp`, `a2a`, and `opencode` have zero exact source-ID rows in the checked corpus/tooling outputs; they remain candidates for a version-qualified source plan, not yet confirmed crawl gaps because other aliases/owners still need reconciliation. Keep the catalog-vs-manifest ID mismatch as an alignment finding only; do not duplicate-fetch tRPC or RAPIDS pages. The current 79-page publication is a different cohort from the tooling chunk/envelope artifacts, so its count cannot prove those artifacts' admission.

**2026-10-11 bounded source-plan addition:** added official source records for Mastra workflows, ACP, A2A, and OpenCode tools/MCP to the existing catalog and versioned tooling manifest (`okf-tooling-docs-r3`). These records are capped at nine official URLs total and use the Node HTTP fallback; this is a source plan only. No pages have been fetched into the canonical corpus, no embeddings/Valkey/PostgreSQL/Qdrant writes occurred, and no ontology or evidence admission is claimed. Next gate is a bounded scratch-only fetch/readback against the four exact hosts, then review content/revisions before any published-corpus merge.

**2026-10-11 scratch fetch/readback:** executed the existing `.okf` crawler against the four-source filtered manifest with `--no-firecrawl --limit=9` and output rooted only at `.tmp/atlas/okf-agent-docs-capture-v1`. Dry-run enumerated exactly 9 allowlisted HTTPS pages; fetch used `HTTP_FALLBACK` for all 9. The publication owner reports 9 staged/validated/published scratch records, 0 failures, `canonical_authority=false`, and `persistent_store_writes_performed=false`. Independent `verifyOkfDevPageArtifactReadbackV1()` reopened all 9 Markdown/JSON pairs and matched source identity and SHA-256 checksums. Generation `20261011T194242987Z-9c165e46202bac54`, manifest checksum `sha256:5790a6740db536758097022c8110486c9b78919bc2d0f468d6de78cd02aaca70`. This proves bounded scratch capture/readback only; pages have not been merged into the tracked `.okf/dev` corpus, reviewed/admitted, chunked into the versioned tooling corpus, semantically indexed, or promoted. No datastore, embedding, GPU, OpenWiki, or canonical corpus write occurred.

**2026-10-11 bounded dev-corpus append:** after source/content review, ran the same exact 9-page allowlist through the existing publisher with `--append`, `--no-firecrawl`, and no semantic/indexing executors. Current pointer resolves run `20261011T194437578Z-b51cff2ae704ad26`: 88 corpus rows, 88/88 independent page artifact readbacks, pointer/generation checksum `MATCH`; all 79 previous source refs and content hashes are unchanged, and 9 new source pages are present across the four versioned source IDs. `canonical_authority=false`; local filesystem publication writes are true, persistent store writes are false. The root-level legacy `corpus.jsonl` remains a 75-row artifact; use `published-current.json` and its immutable generation manifest for the active 88-row set. The new pages have no reviewed admission envelopes and remain blocked from semantic ingestion, packet admission, ontology claims, and canonical retrieval. No PostgreSQL, Qdrant, Valkey, GPU, or OpenWiki writes occurred. The 79→88 page-count update does not close `DOC-DEMAND-03B` or any evidence-admission gate.

**2026-10-11 current-generation admission alignment readback:** `.tmp/atlas/okf-dev-admission-alignment-current-20261011.json` independently verified all 88 published pages and the immutable generation artifacts, but returned `OKF_ADMISSION_ALIGNMENT_BLOCKED`. The 57-envelope cohort has one exact source-identity match, one content-hash mismatch, 87 published pages without matching envelopes, and 56 envelopes without published pages; `matchedPages=0`. The DB-free handoff evaluator reports 57 pages/717 chunks as structurally ready, which does not override the exact publication/envelope alignment failure or grant admission. `canonicalAuthority=false`; no persistent writes. Keep `DOC-DEMAND-03B` and `DOC-OPENWIKI-01` open; do not refresh envelopes by inference or treat publication as semantic/index admission.
- [ ] DOC-OPENWIKI-02 Verify one retrieved documentation section flows through existing packet identity and ContextManifest selection with exact URL/hash/version provenance; documentation claims cannot establish local implementation behavior or ontology relations.

- **DOC-DEMAND / store-map refresh (2026-10-11):** documented existing canonical and derived store ownership in `docs/architecture/atlas-store-ownership-and-derived-representations-v1.md`; tRPC and TensorRT-RTX 1.6 references already exist locally, and simdjson/cuVS/cuGraph are in the current `.okf/dev` corpus/catalog. Added three official NVIDIA cuTile/CUDA Tile/SIMT pages to the reviewed `.okf/dev` source catalog and published generation through the bounded existing crawler with `--no-firecrawl`; generation/pointer readback reports 79 pages, 3 selected, 0 failures, and the source records explicitly say `llm_synthesis="No model synthesis was run..."`. The runtime used the ordinary HTTP fallback because this Python lacks both NumPy (now lazily required only by numeric routines) and `beautifulsoup4`; no dependencies were installed. This is acquisition/publication only: no OCR was needed, no semantic/vector/database admission or model summary was run, and docs-based relations remain non-evidence. `DOC-DEMAND-03B` exact-envelope admission alignment and downstream retrieval remain open.
- **DOC-DEMAND / OpenSpec search and runtime census (2026-10-11):** the existing `scripts/atlas/openspec-task-fts-index-v1.mjs` built a database-free lexical/BM25-style preview for 101 changes, 96 proposals, 11,316 task rows, and 11,412 text records; query `simdjson` returned task-ledger hits. Receipt is `.tmp/atlas/openspec-task-fts-index-v1.json`. This is not PostgreSQL indexing: its generated-column/GIN DDL is proposal text only; no migration, database write, or PostgreSQL readback occurred. Existing OpenSpec Drizzle owners should be reused; no generic key/value table is warranted. Windows Python 3.14 lacks the checked scientific/NLP packages; WSL `atlas-rapids-cu13` has NumPy, Pydantic, FastAPI, LangExtract, Tree-sitter, PyTorch, NetworkX and cuVS, but not BeautifulSoup, Python simdjson, LangChain or Deep Agents. The app-local Node installation resolves LangChain core/LangGraph and tRPC. Windows Tesseract is installed; no evidence establishes app use of Windows.Media.Ocr. Master TOC generation now includes AGENTS.md directory scopes and `atlas:docs:toc:check` passes. No packages installed; no OCR/model synthesis or database/cache/vector/GPU writes occurred.
- **DOC-DEMAND-03B bidirectional admission coverage reconciliation (2026-10-11):** the current published generation (`20261011T172624437Z-4652ac774e9efacc`, 79 pages; manifest `sha256:6be3387a…`) was compared against the existing 57-item reviewed `tooling-docs.admission-envelopes-v1.json`. Only 1 source-ID/URL identity overlaps; its published hash `b28e7105…` differs from envelope hash `e0a453a6…`. The other 78 published pages have no matching envelope, and 56 envelope identities have no page in this generation. The DB-free handoff shape itself reports `EXTERNAL_DOC_ADMISSION_HANDOFF_READY`; overall exact alignment remains `OKF_ADMISSION_ALIGNMENT_BLOCKED`, with `canonicalAuthority=false` and no persistent-store writes. Fixed the alignment helper's prior one-sided coverage gap: it now also rejects published pages lacking envelopes and returns both unmatched sets plus hash mismatches. Five focused tests pass. Fresh readback receipt `.tmp/atlas/okf-dev-admission-coverage-current-20261011T111732232.json`, checksum `sha256:10d4ec0e…`. Do not regenerate/alias envelopes from crawler output or mark `DOC-DEMAND-03B` complete; resolve the reviewed source-ID/URL cohort with the existing admission-manifest owner first.
- **DOC-DEMAND-03B source-level reconciliation follow-up (2026-10-11):** extended `alignOkfPublishedPagesToAdmissionEnvelopesV1` to return deterministic per-source counts for published pages, reviewed envelopes, exact identities, hash mismatches and both unmatched directions. Added a regression proving identical URLs under different source IDs remain distinct and are not aliased. Focused suite passes 6/6. Fresh runner/readback against the current pointer reproduces 79 published pages, 57 envelopes, one exact source-ID/URL identity, one content-hash mismatch, 78 published pages without envelopes and 56 envelopes without published pages. Source census: reviewed envelope IDs are `oaklib` (17), `ast-grep` (16), `ts-morph` (15), and `trpc` (9); the published generation has only one exact shared identity, under `oaklib`, and that page's digest mismatches. This confirms the mismatch is principally an older/different reviewed source cohort, not an alias-resolution problem. Receipt `.tmp/atlas/okf-dev-admission-source-coverage-current-v1.json`, SHA-256 `d872b72bff4ab67c2f2f28d4c7647e505402af37df24757d233d12cae111bc46`. Overall status remains `OKF_ADMISSION_ALIGNMENT_BLOCKED`, `canonicalAuthority=false`, `persistentStoreWritesPerformed=false`. Keep admission blocked; the source/admission-manifest owner must review whether to acquire the old reviewed cohort or review a new envelope set before any admission. No aliases, envelope regeneration, canonical-store writes, or crawler changes were made.
- **DOC-DEMAND-03B final adversarial fixture gate for this slice (2026-10-11):** GAN adversarial runner returned `ADVERSARIAL_FIXTURES_PROVEN`, 16/16 probes and all five harness self-tests passed; receipt `.tmp/atlas/gan-adversarial-proof-v1-20261011-doc-source-coverage.json`, SHA-256 `1e55dd0e4cfa845561130ee48c322a32fd81a308ec57ed3564e485162d76f60b`. This establishes fixture-level rejection behavior only; it does not alter the published/envelope cohort mismatch or close external-document admission.
- **DOC-DEMAND-03B three-way source cohort diagnosis (2026-10-11):** independently verified the active generation-manifest checksum against `published-current.json`, then reconciled current source catalog, generation page readbacks, and the 57 reviewed envelopes by exact `(source_id, URL)` and content hash. Current catalog has 39 source definitions; 78/79 published URLs exactly match it. None of the 57 envelope URLs exactly matches a current catalog URL; one envelope matches a published URL under `oaklib`, but its hash is stale. `trpc` shares a source ID but has no exact current URL match. `ast-grep` shares a host with `tree-sitter-ast-grep` only; this is a review candidate, not an approved alias. `ts-morph` is absent from the current catalog. Scratch diagnostic `.tmp/atlas/okf-source-cohort-reconciliation-current-v2.json`, SHA-256 `74a6276bc274ebd5a8826e23a2e37ee7c92d391679b43901adf28fefe6040ed1`. This narrows the owner action to reviewing/rebuilding the source envelope cohort against the current reviewed source manifest; no mapping, envelope regeneration, fetching, or admission was performed. GAN fixture gate rerun last: `ADVERSARIAL_FIXTURES_PROVEN`, 16/16, receipt `.tmp/atlas/gan-adversarial-proof-v1-20261011-doc-cohort-v2.json`, SHA-256 `03ae8da77df3bcb70a8526718876e6fb90fd1b317c1d4816b1443dcfb9c0f79b`. Both receipts are diagnostic/fixture evidence, not canonical admission. Persistent stores were untouched; DOC-DEMAND-03B remains open.
- **DOC-DEMAND-03B envelope-owner cohort clarification (2026-10-11):** the 57-item envelope artifacts belong to the distinct `okf-tooling-docs-r2` four-source manifest, not the broad 39-source `docs/.okf/dev/manifest.json`. Reconciled them against their actual owner `tooling-docs.manifest.json`: 53/57 source-ID/URL pairs match exactly; the four differences are three trailing-slash variants for `ts-morph` and the `trpc` `/docs/client` versus `/docs/client/vanilla` page. The separately rebuilt combined-manifest v2 contains the same 57 identities, content hashes, and chunk digests as v1, with only the declared manifest revision changed to `okf-pinned-plus-tooling-r1`. The existing read-only `SEMANTIC_DOC_02` validator passes for both copies: 57 pages, 717 chunks, exact acquired raw/chunk readback, and `EXTERNAL_DOC_ADMISSION_HANDOFF_READY`; receipts `.tmp/atlas/semantic-doc-02-tooling-cohort-current-v1.json` (SHA-256 `28f5a2533fb8eef532b5047d6706d6c74a1ff424c7ba1e2631f24d7deea9f441`) and `.tmp/atlas/semantic-doc-02-combined-tooling-delta-current-v1.json` (SHA-256 `0c6f76bd9f396f6887ce585b595cb892e7aa79596f4c063fa5c473ce1e2b28fc`). The pinned 30-item cohort separately matches 29/30 URLs; the combined 87-page manifest therefore has 82 exact manifest/envelope identities. Full three-way report `.tmp/atlas/okf-admission-cohort-reconciliation-current-v1.json`, SHA-256 `63f23681b5a2583feb38ff00f1c2556a49017a39f6ada98c196cd57b44efd089`. Keep these cohort-local validation results separate from the active 79-page dev publication: it is a distinct broader cohort (78/79 URLs match its own catalog), remains unadmitted, and still has only one URL overlap with the tooling envelopes, with a stale hash. No DB/vector/cache writes or canonical admission occurred. Strict OpenSpec validation passed; GAN ran last and returned `ADVERSARIAL_FIXTURES_PROVEN` 16/16, receipt `.tmp/atlas/gan-adversarial-proof-v1-20261011-doc-envelope-cohorts.json`, SHA-256 `ad162df47297bc394806ba0cabb9d283b196ca29bba42daa40c73ae5bb67ce37`. This is diagnostic/fixture proof only; DOC-DEMAND-03B remains open.
- **DOC-DEMAND-03B exact redirect-lineage correction (2026-10-11):** independently verified all 57 tooling envelopes against their owning `okf-tooling-docs-r2` source manifest and raw acquisition records. All 57 resolved URLs map uniquely to raw artifacts whose exact `requested_url` is listed in the source manifest; all 57 raw, manifest, and envelope source revisions match. The earlier four URL differences (three `ts-morph` trailing-slash resolutions and tRPC `/docs/client` → `/docs/client/vanilla`) are recorded acquisition redirects/canonicalizations, not missing source coverage; exact URL-pair counts remain distinct from verified request→resolution lineage. Strengthened `scripts/atlas/validate-tooling-doc-admission-envelopes-v1.mts` to require this chain and added a stale-source-revision negative fixture in `scripts/atlas/validate-tooling-doc-admission-envelopes-negative-v1.mjs`. Positive `SEMANTIC_DOC_02_PASS`: 57 pages/717 chunks, zero unbound requests or source-revision mismatches; negative fixtures pass 8/8; strict OpenSpec validation passes. GAN-last fixture receipt `.tmp/atlas/gan-adversarial-doc-source-lineage-v1.json`, SHA-256 `1e98eaadfc66bf6f79b15a49cc077cd71f5822b8033e5bd8f20994569f785f0a`, `ADVERSARIAL_FIXTURES_PROVEN` 16/16. Read-only validation only; no fetching, database/cache/vector writes, or canonical admission. This correction applies only to the reviewed 57-page tooling cohort: the separate current 79-page dev publication still lacks its own admitted envelopes and remains open under DOC-DEMAND-03B.

- **DOC-DEMAND-03B digest/identity comparator correction (2026-10-12; tests paused):** the tooling envelope owner emits `page.contentHash` from normalized Markdown (`DocCoordinateV1`), while the dev publisher's `content_hash` is SHA-256 over published Markdown bytes. The envelope also has no canonical `sourceRef`. Updated `alignOkfPublishedPagesToAdmissionEnvelopesV1()` so `(sourceId, URL)` overlap is reported only as a candidate locator; it requires equal canonical source refs and explicit matching `contentHashKind` before asserting either a hash match or mismatch. Missing/different digest grains now produce `CONTENT_DIGEST_GRAIN_UNQUALIFIED`, not a false content-mismatch claim. Updated focused regression cases but did not run them per operator request. Current publication remains blocked; no artifacts were regenerated and no stores were written.

- **DOC-DEMAND-03B canonical page identity correction (2026-10-12; tests paused):** refined the comparator to match the existing `atlas_external_doc_pages_identity_uq` / `DocCoordinateV1` owner: canonical page identity is `(provider, product, product_version, url)`, not local publisher `source_ref`. The comparator now requires the complete matching document coordinate and explicit equal digest-kind metadata before reporting hash equality/mismatch; local `(sourceId, URL)` overlap remains locator-only. Current dev corpus entries do not carry the complete DocCoordinate tuple or digest-kind declaration, so the gate remains blocked without falsely asserting identity/content drift. No source or publication artifacts were synthesized; tests remain unrun.

## 2026-10-12 domain classification and agentic indexing gates (tests paused)

These gates reuse the existing `.okf` proposal adapter, external-document page/chunk schema, domain taxonomy, packet/source owners, EmbeddingGemma `semantic_768`, symbol TOC, SearchRuntime, ACE, and ContextManifest. They do not authorize production writes or close any existing admission gate.

- [ ] **DOC-AUTHOR-METADATA-01** Define source-qualified author metadata for external documentation using the existing acquisition and page-admission owners. Preserve author value, extraction method/source (for example HTML meta, JSON-LD, or publisher metadata), raw evidence reference or span, parser revision, and explicit missing/ambiguous status. Do not infer author from publisher, page title, or an LLM; no schema migration, crawl, corpus publication, embedding, or Qdrant write is authorized by this task. Require bounded fixture coverage and independent page/readback validation before proposing storage changes.

- [ ] **DOC-CLASS-01** Reconcile `.okf` classification proposal arrays with the canonical domain taxonomy and preserve `featureLabel`, summary, `domain_class`, ontology IDs, packet identity, and admission as distinct fields. Keep unknown/unsupported labels unresolved; do not rewrite stored taxonomy labels or approve aliases from lexical similarity.
- [ ] **DOC-UPSERT-02** Resolve the `feature_domain_facts` persistence contract before writing: its current conflict key is `(packet_key, classifier_version, content_hash)`, while proposal rows carry subject/source/taxonomy revisions. Map exact packet identity, source/workspace/taxonomy/classifier/producer revisions and same-grain digest semantics; only then propose a reviewed additive migration/upsert with independent transactional readback. Do not create a generic key/value table or execute DDL/DML from this task.
- [ ] **DOC-EMBED-03** For reviewed, source-qualified document chunks only, reuse the canonical EmbeddingGemma `semantic_768` model artifact, task prefix, tokenizer, pooling/normalization, and existing embedding writer. Bind model/recipe/input/output revisions and checksums; reconcile PostgreSQL vectors with the existing Qdrant `content` projection before any authorized batch indexing.
- [ ] **DOC-SYMBOL-04** Build a scratch-only symbol/document reverse LUT from an integrity-checked CandidateOrdinalMap, canonical symbol/version join, exact UTF-8 span readback, and independently qualified document coordinates. Preserve one-to-many/ambiguous matches and separate code/document revisions; do not publish a TOC or add a second fusion/ranking owner.
- [ ] **DOC-SEARCH-05** Evaluate query classification and existing lexical/FTS, AST/LSP, semantic, and admitted graph lanes against one frozen cohort. Preserve SearchRuntime as the sole normalization/fusion/ranking owner; compare inverse lookup and any recommendation output without changing candidate rank or admitting graph edges.
- [ ] **DOC-AGENT-06** Route retrieved, verified evidence through the existing MCP registry/Viterbi proposal, ACE packet, and ContextManifest owners. Validate tool schemas and permissions independently; summaries from Ornith 1.5 bind model/prompt revisions to selected evidence. Missing admitted ontology tuple or independent manifest readback remains `BLOCKED`.
- [ ] **DOC-COMPUTE-07** Establish bounded CPU-worker and deterministic NetworkX/PyTorch reference behavior on a qualified frozen batch before optional accelerators. Measure parser, AST/NLP, embedding, retrieval, fusion, and summarization separately; N-API/SIMDJSON, DuckDB, radix sort, PCA/SVD, low-rank recommendations, and four-dimensional topology are measured/derived options, never identity or evidence.
- [ ] **DOC-GPU-08** Compare cuVS/cuGraph/RAPIDS or LibTorch CUDA with the same CPU-qualified candidate/graph snapshot only after GPU resource admission and numerical/identity readback. Valkey/BitFrost centroid keys may cache revision-qualified routing descriptors; they must not become canonical packets, citations, ontology facts, or an additional retrieval vote.
- [ ] **DOC-ROUTE-09** Connect `/api/retrieval/search-unified` to the existing request-scoped SearchRuntime/ContextManifest shadow only after canonical ordinal-map, authorized source-byte, complete profile, and revision-qualified supplement providers are available. The current route calls `runSemanticSearchWorkflow()`, whose caller uses `adapter.search()` and passes optional shadow configuration; absent configuration correctly returns `UNAVAILABLE`. Do not insert placeholder rows, default revisions, or a parallel ranking path.

**Provider census:** `atlas_observation_feature_rows` is keyed by `(packet_key, feature_revision)` and has source/workspace lineage and evidence refs, but does not persist the three required supplement metrics. A pure classification compiler can derive `process_fit` from caller-supplied observations, but does not itself provide a candidate-bound persisted supplement. `compileExecutionUtility()` is a pure aggregator over caller-supplied trace events and has no production caller in the inspected source tree. `atlas_retrieval_events` records query/card/source-ref observations without candidate packet/revision bindings, while `atlas_feature_profiles` is keyed by `feature_label`, not a candidate profile. Thus the complete three-metric, revision-qualified supplement and profile readback providers remain unavailable; do not elevate any one partial producer into that role.

**AST binding seam (code-only; tests paused):** `makeAstHandlerV1()` now accepts either a synchronous or asynchronous `resolveSourceBinding` callback, so a future composition can call the existing async `resolveAdmittedSourceRevisionV1()` without a duplicate binding authority. The handler still requires request-scoped workspace identity and independently hashes reopened bytes before AST-grep. No production DAG caller, candidate-to-path provider, symbol-registry join, or route-to-ContextManifest proof was added by this change.

**Admitted AST-grep provider seam (code-only; tests intentionally paused):** `makeAdmittedAstGrepRefinementHandlerV1()` now requires a `CandidateOrdinalMapV1`, runs the existing schema and integrity verifier, checks the request workspace revision, and exact-matches lexical paths against candidate `sourceRef` values before resolving the existing admitted source binding. Conflicting path/source-revision identities fail closed; reopened bytes remain repository-root-contained and are independently hashed by the AST handler. It remains uncalled by production and emits no admitted symbol/evidence. No candidate-map producer is wired to a DAG caller, and no canonical symbol-registry join, published TOC, ContextManifest, tests, typechecks, OpenSpec validation, or live store operations were performed.

**ORF mapping/authority owner census (source inspection only; tests remain paused):** reuse `scripts/atlas/lib/orf-ast-kind-crosswalk-v1.mjs` and `scripts/atlas/lib/ast-prefill-observation-bridge-v1.mts` for the existing AST node → `FUNCTION_DECL`/`CLASS_DECL`/`INTERFACE_DECL`/`TYPE_ALIAS`/`VARIABLE_DECL` mapping and byte-grounded observation adapter. The five checked-in feature definitions and their ast-grep mapping are in `scripts/atlas/lib/orf-ast-feature-definition-proposal-v1.mjs`; `docs/.okf/registries/orf-ast-feature-registry-proposal-v1.json` records all mappings as `REVIEW_REQUIRED`, `PROPOSAL_ONLY_REQUIRES_REVIEW`, with `reviewer_id`/`review_receipt` null and `runtime_eligible=false`. Do not create a duplicate mapper or treat root-prefill proposal-row compilation as feature-row admission. Remaining implementation is a verified production candidate-map/source provider → existing bridge/crosswalk → independently approved registry loader → downstream feature-row admission; existing root-prefill scripts are diagnostic/proposal producers, not the production caller. No test, typecheck, runtime, or persistent-store operation was run for this census.

**Root AST DAG harness ownership note (source inspection only; tests remain paused):** `scripts/atlas/run-live-ast-refinement-dag-shadow-v1.mts` currently resolves source identity from its supplied proof and reopens a repository-contained file itself; it calls `makeAstHandlerV1()` with that proof-derived binding and does not load/verify `CandidateOrdinalMapV1` or use `makeAdmittedAstGrepRefinementHandlerV1()`. Treat its receipt as a bounded proof harness, not the canonical candidate/source provider. Future reuse must supply the exact request-scoped ordinal map to the provider, independently verify source binding/readback, then feed its declarations to the existing ORF observation bridge; do not add this harness to the SvelteKit request path or equate proof-supplied fields with independent authority.

This ledger update is a plan, not completion evidence. The `.okf` cohort remains subject to its existing admission reconciliation, the feature-row schema mismatch blocks persistence design, and the production shadow caller lacks authoritative providers. No tests, typechecks, OpenSpec validation, embeddings, GPU execution, migrations, database/cache/vector writes, or model calls were performed for this update.
- **DOC-DEMAND-03B published-page independent readback (2026-10-11):** added `verifyOkfDevPageArtifactReadbackV1()` to the existing publication owner and integrated it into the existing admission-alignment verifier. It reopens each referenced Markdown/JSON sidecar under the repository root, validates containment, byte checksums and source/page identity, normalizes contained legacy absolute sidecar paths, and binds each readback to the exact corpus row. Publication regression suite passes 19/19, including post-publication Markdown/sidecar tampering; strict OpenSpec validation passes. Live read-only verification of current generation `20261011T172624437Z-4652ac774e9efacc` independently reads back 79/79 page artifacts with zero byte/identity failures. Admission remains `OKF_ADMISSION_ALIGNMENT_BLOCKED`: 78 published pages lack reviewed envelopes, 56 envelopes are outside this generation, and the single exact oaklib match has a stale content hash. Receipt `.tmp/atlas/okf-dev-publication-readback-current-v1.json`, SHA-256 `b012818f8ff230aa47432de28fde37f072d521e704d5a75be6d640ea74b2c000`. GAN ran last before this ledger update: `ADVERSARIAL_FIXTURES_PROVEN` 16/16, receipt `.tmp/atlas/gan-adversarial-okf-page-readback-v1.json`, SHA-256 `aa4f748f6a16ec0aa1270870985e1033422710bb057928deaedf941c2bb783b5`. The verified publication is still proposal/reference material, not canonical admission; no persistent database/cache/vector writes occurred.
- **DOC-DEMAND-03B refreshed alignment gate (2026-10-11):** reran the existing read-only publication/envelope verifier against active generation `20261011T194437578Z-b51cff2ae704ad26`. Independent artifact readback is complete at 88/88; exact admission alignment remains `OKF_ADMISSION_ALIGNMENT_BLOCKED` with 88 published pages, 57 reviewed envelopes, 1 exact identity, 1 hash mismatch, 87 published pages without envelopes, and 56 envelopes without published pages. Scratch receipt `.tmp/atlas/okf-dev-admission-alignment-refresh-20261011.json`, SHA-256 `534ad63c5e078b56b55fe09fb09957a743dc097dd3f456e3a3a2f9cab8e7501e`; `canonicalAuthority=false`, persistent-store writes false. Alignment unit tests pass 6/6. Do not fetch pages, regenerate reviewed envelopes, create source aliases, or admit/index this cohort to clear the gate; the reviewed source/admission owner must decide whether to review the current 88-page cohort or republish the matching reviewed cohort.

### DOC-DEMAND-03B one-page Firecrawl admission pilot (2026-11-21)

- **Created and wired:** the Python envelope builder reads the manifest output root, can export a verified normalized UTF-8 page, and checks the captured Markdown checksum and every chunk span. The existing admission command accepts `--envelopes` and `--normalized-page` for one page, validates before connecting, and scopes database reconciliation to that page. Its optional FTS proof emits only canonical citation coordinates for the exact admitted revision.
- **Proven scope:** at base `d29e4e95149fa0cfddba211a572e00a217e67bf6` with these working copy changes, the Python Firecrawl v2 acquisition produced one official SvelteKit load page and 101 chunks, with zero acquisition failures. Artifacts are in `.tmp/atlas/okf-sveltekit-pilot-15892a0e/` (`manifest.json`, `coordinates.json`, `builder-receipt.json`, `normalized.md`, and `envelopes.json`). The source catalog labels the page current upstream, so the recorded version is a dated upstream snapshot.
- **Live read-only command** from `sveltekit-frontend`: `node_modules/.bin/tsx.cmd scripts/atlas/run-external-doc-admission-v1.mts --envelopes ../.tmp/atlas/okf-sveltekit-pilot-15892a0e/envelopes.json --normalized-page ../.tmp/atlas/okf-sveltekit-pilot-15892a0e/normalized.md --plan --query load`. `plan.jsonl` records `PILOT_CAPTURE_MATCH`, `MISSING`, `writerCalls: 0`, and `citation: null`. Adding one byte to the normalized page produced `exit=1 output=PILOT_PAGE_HASH_MISMATCH` before database access (`tamper.txt`).
- **Replay and negative validation:** rebuilding from the saved capture without `--acquire` reproduced both SHA-256 hashes (`PILOT_REPLAY_HASH_MATCH`). Replacing one chunk evidence revision produced `exit=1 output=HANDOFF_NOT_READY:CHUNK_EVIDENCE_REVISION_MISMATCH` (`stale-chunk.txt`). The three focused admission, contract, and read-model Vitest suites passed 61/61.
- **Open:** the staging database URL and existing admission authorization were absent. Staging apply, independent admitted-row and FTS replay, and ACP context admission remain unproven. The published cohort reconciliation remains open independently of this scratch pilot. No checkbox changed.

### OpenSpec documentation context preview (2026-11-21)

- The read-only `sveltekit-frontend/scripts/atlas/prepare-openspec-doc-context-v1.mts` command resolves an exact open task against the current workboard source hash, queries official PostgreSQL FTS at the requested product version, independently checks each selected chunk's hash/span/revision, and emits a bounded JSON preview pinned to the DSPy workboard contract. A checksum-pinned low rank artifact can supply advisory helper routing through the existing recommender.
- Local PostgreSQL 18.4 reported 30 admitted pages and 852 chunks with 852 embeddings present. The indexed SvelteKit snapshot `CURRENT_UPSTREAM@2026-09-23` provides live context for this preview. The newer Firecrawl scratch capture remains a separate, unadmitted revision.
- Use the existing workboard builder with scratch output paths before invoking the preview with `--workboard <snapshot> --task parent-atlas-versioned-doc-intelligence:DOC-DEMAND-03B --product sveltekit --version CURRENT_UPSTREAM@2026-09-23 --query load`. The receipt is `.tmp/atlas/okf-sveltekit-pilot-15892a0e/doc-context.json`. An absent version yields zero citations and a mismatched routing artifact digest is rejected.
- ACE admission, model execution, GEPA optimization and OaK promotion remain open. This preview supplies documentation context for review and leaves existing task checkboxes unchanged.

### DSPy, GEPA, and upstream ACE capture (2026-11-21)

- Added the bounded source manifest `docs/.okf/dev/dspy-gepa-ace.manifest.json` and its coordinate mirror. The four URLs cover DSPy 3.1.0 JSONAdapter and GEPA overview, standalone GEPA's optimizer API as a dated upstream snapshot (`CURRENT_UPSTREAM@2026-11-22`, capture UTC), and the ACE authors' README at commit `82709de050e1db6e6ef2f07bcb0393560b94992a`.
- **Proven capture and read-only planning:** at base `d29e4e95149fa0cfddba211a572e00a217e67bf6` with the current working tree, the existing Python Firecrawl builder captured 4 pages and verified 135 UTF-8 chunk spans. Each run used a single-page copy of the manifest with an isolated scratch root. Rebuilding offline produced byte-identical normalized Markdown and envelope JSON for all four. The admission CLI returned `PILOT_CAPTURE_MATCH` and `MISSING` on all four pages, with `writerCalls: 0` and `citation: null`. The per-page manifests, builder/replay receipts, live `plan.jsonl` outputs, and page/envelope hashes are in `.tmp/atlas/okf-dspy-gepa-ace-v1/`; `verification.json` summarizes the four runs.
- **Reproduction:** use `python scripts/atlas/build-external-doc-admission-envelopes-v1.py --acquire --manifest <scratch-manifest> --coordinates docs/.okf/dev/dspy-gepa-ace.coordinates.json --output <envelopes.json> --receipt <builder-receipt.json> --normalized-page <normalized.md>`. Repeat with separate output paths and without `--acquire` for replay. From `sveltekit-frontend`, run `node_modules/.bin/tsx.cmd scripts/atlas/run-external-doc-admission-v1.mts --envelopes <envelopes.json> --normalized-page <normalized.md> --plan --query <API-term>`.
- **Still open:** staging URL and admission authorization are absent. Canonical save/readback, a positive FTS hit for this corpus, and ACE admission for `DOC-DEMAND-03B` await staging proof. The upstream ACE capture is reference material. No checkboxes changed.

## Firecrawl version probe and package-version validation (2026-10-20)
- Added `probeFirecrawlVersionV1` (read-only, no writes, no installs) in `sveltekit-frontend/src/lib/server/retrieval/optional-firecrawl-provider.ts`. Spec `optional-firecrawl-provider.spec.ts`: 4/4 pass. Live run: `UNAVAILABLE` (client package not installed; configured `http://127.0.0.1:3002/` down). It never claims a service version because no version endpoint is verified in the repo.
- Did not create a `master_domain_package_version_validation` table. Live `atlas_external_doc_pages` (30 pages, 852 chunks) already has `product`, `product_version`, `source_authority`, and `crawl_revision`.
- Read-only validation `sveltekit-frontend/scripts/atlas/external-doc-package-version-validation-v1.sql` (run in `BEGIN READ ONLY`): 1 of 8 provider/product/version groups is a concrete version (`postgresql` `18`, 6 pages). 6 are `CURRENT_UPSTREAM@2026-09-23` snapshot labels, which are not releases. 1 is `UNVERSIONED`. Do not cite the other packages as version-qualified until real versions are recorded.
- Open, not started: MCP tool and skill (need the validation owner decided), README, and any DDL (not approved).

## Firecrawl lexical task recommendation review slice (2026-11-22)

- Repaired the existing read-only recommender and runner. It now resolves exactly one open task from `taskInventory`, pins its `taskRevision`, verifies the workboard's source-file hash against disk, filters canonical documentation to `source_authority='OFFICIAL'`, requires exact page/chunk revisions and checksums plus a valid UTF-8 byte span, and emits API/import mention spans and bounded excerpts with citation coordinates. Weak single-word matches are suppressed; task and document identity remain separate from the advisory score.
- Focused tests: `python/tests/test_firecrawl_lexical_api_recommender_v1.py`, 6/6 passed. Live read-only run against the freshly built workboard selected `parent-atlas-versioned-doc-intelligence:1644` (`DOC-SEARCH-05`, task revision `sha256:0051b8da6f57084463cadad5793bf90c5b3584c7b51d8fec58c1a115c627c2cb`), read 833 official chunks, skipped 0 for missing citation coordinates, and returned 0 recommendations after the precision threshold. The earlier five weak matches were generic terms and are no longer presented.
- Receipt: `docs/reports/firecrawl-lexical-task-recommendations-v2.json`. It is a review-only packet (`canonicalAuthority=false`, `writesPerformed=false`); no Firecrawl crawl, database/cache/vector write, RLM/DSPy execution, model training, SearchRuntime rank change, or live assistant integration occurred. The zero-hit result is honest coverage evidence, not proof of recommendation quality. **DOC-SEARCH-05 remains open** pending evaluation on a reviewed frozen cohort and any separate assistant/ACE integration proof.
- **Positive/negative retrieval controls:** tightened scoring to use explicit technical identifiers and API matches; ordinary word overlap is now diagnostic only, and results are diversified by page. On an open REC-14 task containing `HNSW`, the read-only run returned three official, revision-qualified pgvector/Drizzle references, each with a matching `hnsw` API signal and excerpt span (`docs/reports/firecrawl-lexical-positive-control-v2.json`). DOC-SEARCH-05 still returns zero for its unrelated identifiers. Six focused tests pass, including generic-only/product-only rejection and exact-API acceptance. These controls show expected routing behavior, not a reviewed relevance benchmark; no task was marked complete.

## DOC-14 live canonical citation readback slice (2026-11-22)

- Added `external-doc-citation-readback-v1.ts` as a read-only adapter over the existing canonical `atlas_external_doc_chunks` / `atlas_external_doc_pages` owners. It re-reads selected official chunk IDs from PostgreSQL and verifies page/chunk revisions, authority, UTF-8 byte length, SHA-256, and the existing `chunkEvidenceRevisionV1` contract. Any invalid/missing row blocks the citation set; the FTS headline excerpt is never returned as source evidence.
- Wired the existing A2A `external-doc-admitted-context` route to expose only verified chunk text and a separate `citationReadbackStatus` / blocker list. It remains a noncanonical read-only artifact: no ContextManifest admission, model inference, ACE/Valkey write, graph admission, or task promotion is implied.
- Proof: four adapter tests and nine A2A route tests passed; the live PostgreSQL 18.4 DocCorpusPanel read-only test passed with exact official-chunk citation readback, including Unicode byte-length checks. `npm run check` was started but produced no diagnostics before it was interrupted; it is not a passing check. The bounded top-K script remains `DIAGNOSTIC_SELF_MATCH_SMOKE` over 200 code chunks and is explicitly `qualityBenchmarkEligible=false`; it is not the requested reviewed documentation benchmark.
- Remaining: a frozen reviewed official-doc question/relevance set and real Recall@10/MRR/NDCG/citation-support evaluation; a valid existing ACE candidate snapshot/ContextManifest admission and independent manifest readback for these external-doc chunk IDs; actual DSPy inference (the current helper contains no `dspy.RLM` import/call); answer-claim-to-citation support validation; and any separately authorized Valkey packet write/readback. DOC-14, DOC-SEARCH-05, and DOC-AGENT-06 remain open.
- Detailed receipt: `docs/reports/doc14-live-citation-readback-20261122.md`. No database, graph, cache, or object-store writes occurred.
- **DOC-SEARCH-05 evaluator hardening:** `scripts/atlas/eval-doc14-topk-lanes-v1.py` now accepts `--corpus`, `--reviewed-queries`, and `--output`. The reviewed-set contract requires at least 30 unique questions, explicit chunk relevance grades, reviewer reference, an exact candidate-corpus checksum, per-chunk UTF-8 content-hash verification, and a query-set revision checksum. It reports Recall@K, precision@K, MRR, and NDCG@K for the existing exact-ID, lexical, corpus-order diagnostic, and hybrid lanes. Fixture coverage is 3/3 tests. A fixture-shaped review attestation is not independently authenticated, so `qualityBenchmarkEligible` remains false; generated-answer citation support and abstention are not evaluated. No reviewed official-doc cohort or FTS/AST/LSP/semantic/Graphify/SearchRuntime capture was supplied, and the present 200-row corpus is repository code. DOC-SEARCH-05 remains open.

## Graph relation and learning-input integrity correction (2026-11-22)

- `python/atlas_graph_runtime/graphrag_oak_matrix_compiler_v1.py` now rejects relation rows unless the existing admission state is `GRAPH_ADMITTED`, `canonicalAuthority` is true, the row's graph revision matches the selected graph revision, and source/evidence/endpoints are present. Pending proposals cannot affect PageRank or candidate graph features.
- The CLI no longer feeds `sampleDoc14RelationProposals` into the graph as if admitted, assigns invented OAK concepts to all chunks, or uses a fixed placeholder graph revision. It produces an explicitly noncanonical local input checksum and reports `DERIVED_LOCAL_INPUT_CHECKSUM_NOT_CANONICAL` / `NO_ADMITTED_MAPPINGS`.
- Heuristic feature-score pairs are now labeled `atlas.doc14-ranking-pair-diagnostic.v1`, `FIXED_FEATURE_HEURISTIC`, and `trainingEligible=false`. The preference diagnostic loader rejects those rows; it accepts only preference pairs with an independent reward receipt, evidence references, and explicit training eligibility. Its output schema is `mcts-preference-diagnostic`, with `trainingRunPerformed=false` and `policyUpdated=false`: this MCTS score diagnostic is not a PPO/GRPO trainer. Heuristic ranking scores therefore cannot be mislabeled as externally verified rewards or policy updates.
- Focused tests: `python/tests/test_graphrag_oak_matrix_compiler_v1.py` and `python/tests/test_mcts_grpo_array_queue_v1.py`, 6 passed. This is a local contract hardening proof only: no admitted live DOC-14 edge, actual DPO/PPO training, DSPy inference, GEPA optimization, ACE manifest, or datastore write was performed. DOC-14, DOC-SEARCH-05, DOC-AGENT-06, and the separate training gates remain open.
- Report: `docs/reports/doc14-relation-and-learning-input-integrity-20261122.md`.

## DOC-14 OAK candidate review handoff (2026-11-22)
- Added `build_doc14_oak_mapping_review_v1` in `python/atlas_graph_runtime/api_document_fact_v1.py`. It consumes the existing `search_oaklib_label_candidates_v1` bundle and a previously extracted API-document fact; verifies the independently supplied document hash, exact UTF-8 byte span, source/document identity, pending `DOCUMENTED_BY` shape, OAK ontology/producer revisions, and matched candidate identities.
- Output is a checksummed `atlas.doc14-oak-mapping-review.v1` suggestion. Candidate ambiguity is retained; `ontologyIds` stays empty, `reviewRequired=true`, `canonicalAuthority=false`, and `writesPerformed=false`. No graph or database admission occurs.
- Added a composed producer-to-review test using the existing OAK adapter contract, plus ambiguity, stale source hash, and OAK revision mismatch tests. Focused verification: 11 tests passed across API fact/OAK join, graph matrix admission, and preference-diagnostic guards.
- Extended the join to consume the exact `atlas.oaklib-label-search-response.v1` sidecar envelope (`candidateBundle` plus top-level `matches`), checking status, authority flags and duplicate revisions. Sanitized the server-pinned ontology selector in both metadata and OAK evidence references; a test first exposed the local path leak, and the corrected service-envelope tests pass.
- Integration verification: OAK route, API-fact, and OKF pipeline tests: 35 passed. This is mocked/fixture contract proof; the live :8095 endpoint was not called.
- Live service probe: :8095 `/health` is reachable, but POST `/ontology/oaklib/search` returns 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. The runtime reports OAK search route exists, but the operator-pinned ontology file is not configured. No service configuration was changed; the live proposal/admission gate remains open.
- Added an optional `make_dspy_predict_synthesizer_v1` adapter to the bounded DOC-14 recommender. It lazily imports DSPy, declares typed question/evidence/answer/supporting-chunk fields, passes only source-span-verified evidence, bounds evidence/output bytes, and rejects model-selected chunk IDs outside the verified set. The historical recommender function name remains for caller compatibility but is now explicitly documented as not executing RLM.
- Focused fixture verification after this addition: 17 tests passed. DSPy itself is absent in the Windows Python and WSL RAPIDS environments; the tests inject a fake DSPy surface, so actual Predict execution, model connection, current ACE ContextManifest handoff and citation claim-support evaluation remain open. No task checkbox is marked done.
- This closes only a local proposal-to-review adapter contract. It does not prove live OAK service availability, canonical ontology relation review/admission, Graphify readback, ACE ContextManifest/Valkey publication, actual DSPy inference, GEPA evaluation, or DPO/PPO training. No checkbox is marked done from this test evidence.

## ContextManifestV2 to bounded DSPy handoff adapter (2026-11-22)
- Added `run_bounded_dspy_recommendation_with_ace_manifest_v1` in `python/atlas_graph_runtime/doc14_bounded_rlm_recommender_v1.py`. It verifies the existing ContextManifestV2 identity checksum using the shared canonical encoding, enforces exact query equality, joins selected manifest node keys to `PROVEN`/`INDEX_ELIGIBLE` chunk rows, checks chunk content hashes, evidence-ref allowlists, source-revision-set checksum, and the manifest token budget before invoking the typed DSPy `Predict` adapter.
- Tightened the Python-side V1/V2 manifest contract check to require the V1 schema, identifiers, query, producer revision, bounded counts and all six evidence-revision fields before interpreting the manifest. It rejects incomplete manifest bindings rather than treating a structurally similar dict as a valid ACE manifest.
- Tests: `python/tests/test_doc14_bounded_rlm_recommender_v1.py` passed 6/6, including manifest checksum/query tampering, missing required producer revision, row/evidence join failures, and fixture-injected Predict execution. The manifest checksum fixture was generated by the existing TypeScript canonical encoder, providing one cross-language identity parity case.
- This is a Python adapter contract, not production caller wiring. `dspy` is absent in the Windows Python environment; Predict execution is faked in tests. No live manifest admission/readback, current Postgres authorization, model call, claim-to-citation entailment check, ACE packet write, Valkey cache write/readback, or task promotion was performed. No task checkbox is marked done.
- Latest scoped checks: recommender plus API fact/GraphRAG matrix/preference-diagnostic tests, 18 passed; strict OpenSpec validation passed; GAN hook PASS (349 rows: 69 done, 62 partial, 218 open). Repository-wide `git diff --check` is blocked by pre-existing trailing whitespace in `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`.

## DSPy claim-to-span guard and runtime review (2026-11-22)
- DSPy structured output now requires an atomic claim list with a `chunkId` and exact source quote per claim. The adapter derives quote byte offsets from the already verified UTF-8 span, and the recommender independently rechecks the quote, source reference, revision, offsets, and exact claim/answer coverage.
- Receipts label this `EXACT_QUOTE_MATCH_REVIEW_REQUIRED`: an exact quote match proves text presence, not semantic entailment. No output is represented as a verified finding, and no task checkbox was changed.
- The pasted runtime trace showed the default XML adapter failing to parse free-form llama-server output. A previous temporary probe used DSPy's LiteLLM engine; no LiteLLM call is being used for current verification. Repo configuration has `LITELLM_ENABLED=false` and Docker Compose identifies Bifrost as the replacement, while `docker/atlas-dspy-repair-worker/requirements.lock.txt` still pins `litellm==1.105.1`; that separate lock remains to be audited before claiming complete removal.
- Verification: WSL2 `atlas-rapids-cu13` pytest 9.1.1 ran the bounded recommender and API-fact/OAK tests: 13 passed. This uses fixture-injected DSPy, not actual model inference, and does not prove live OAK source configuration, ACE persistence, or relation admission.
- Follow-up structured-output correction: the DSPy signature had represented `supporting_claims_json` as a string even though the contract requires a list of claim objects. It now declares `supporting_claims: list[Doc14SupportingClaimV1]` with a typed `TypedDict` schema; the adapter accepts parsed mappings and retains the existing exact quote, chunk allowlist, source revision, and UTF-8 offset checks. The typed record lives at module scope so DSPy/Pydantic can resolve the schema under postponed annotations.
- Verification: the bounded recommender and API-fact/OAK tests passed again in WSL2 `atlas-rapids-cu13` (13 passed). A separate DSPy 3.5.0 + `DummyLM` probe exercised the actual DSPy JSONAdapter and typed signature without making a model/network call; it returned the allowed chunk and expected byte offset. This is parser/signature proof only, not live inference, ACE admission, claim entailment, GEPA, or promotion. No task checkbox changed.

## DSPy repair worker native model wiring (2026-11-22)
- `python/parent_atlas_dspy_repair.py` now resolves the active model from the configured OpenAI-compatible `/v1/models` endpoint only when a repair is requested, verifies an optional model override against that live list, and constructs `dspy.LM(..., engine="lm15")`. The repair program runs both structured Predict calls in an explicit JSONAdapter context; `/health` remains model-free. The Dockerfile no longer pins the stale `ornith-1.5-9b` model ID.
- Added tests for dynamic model discovery, strict native-engine selection, and rejection of a stale model override. Exact focused command: WSL2 `atlas-rapids-cu13` Python 3.14.6 pytest 9.1.1, `python/tests/test_parent_atlas_dspy_repair.py`: **70 passed in 2.29s**. GAN hook: **PASS**, census 349 total / 69 done / 62 partial / 218 open.
- This is source-level wiring and mocked endpoint proof only. The running Docker image was not inspected or rebuilt (Docker is operator-only); actual container package versions, native LM request, response parsing, and a real `/v1/repair` model call remain unproven. Worker lock remains DSPy 3.4.1 with LiteLLM 1.105.1 pending a separately generated and validated lock update. No task checkbox changed.
- Report: `docs/reports/doc14-dspy-native-worker-wiring-20261122.md`.

## DOC-14 ACE Predict native LM handoff (2026-11-22)
- Wired `make_dspy_predict_synthesizer_v1` to the existing ACE recommender's live model-discovery/configuration owner. Without an injected test LM, the adapter now resolves the active `/v1/models` ID and explicitly constructs `dspy.LM(..., engine="lm15")`; model discovery is deferred until synthesis runs, after manifest, source-row, and token-budget validation. A resolver injection remains available for deterministic tests.
- The existing ACE resolver now honors `DSPY_LM_API_BASE`, accepts either a base URL or a `/v1` URL, honors an optional `DSPY_LM_MODEL` only when it matches the served model, and preserves the native `lm15` engine. No worker image, service, database, ACE packet, or cache was changed.
- Windows Python 3.13 reports DSPy 3.5.0 and LiteLLM 1.78.7 installed; this is the host interpreter only and does not establish the running repair-worker image's package versions. A read-only model discovery/configuration probe returned `gemma4-legal-iq4xs-direct.gguf` and constructed the `lm15` client for `http://127.0.0.1:8090/v1`; no inference request was sent.
- Verification: `python/tests/test_doc14_bounded_rlm_recommender_v1.py` passed 8/8; `python/tests/test_dspy_predict_ace_recommender_v1.py` passed 3/3; combined 11 passed. Strict OpenSpec validation passed; GAN hook PASS (349 rows: 69 done, 62 partial, 218 open). The read-only indexing audit receipt is `tmp/atlas-indexing-surfaces-live-doc14-20261122.json`.
- Still open: real inference over an independently admitted, current ACE manifest; semantic claim-support review; live OAK source configuration and reviewed Graphify admission; authorized ACE/Valkey write/readback; reviewed eval labels and utility; GEPA held-out promotion. No task checkbox changed.
- Reconciled an older ledger statement: Windows `C:\Python313` currently has DSPy 3.5.0 (and LiteLLM 1.78.7); the earlier claim that DSPy was absent from Windows is stale. This does not establish worker-container versions. A fresh read-only index-surface audit confirmed PostgreSQL 18.4, with 274,428/274,465 `content_embedding_768` rows; that does not establish source packet identity or revision bindings. The live `build_agentic_rag_context` query returned `MISSING_SOURCE_REVISION`, `UNADMITTED_RETRIEVAL_CANDIDATES`, and `proofUsable=false`, while exact `find_source_refs` lookups returned `NO_PACKET` for the recommender modules and task ledger. Raw ranked cards were not sent to DSPy. Production inference remains gated on canonical admission.
- Ran the existing `observe-workspace-source-binding.mts` owner over the current tree in read-only mode. It bound 37,748 sources, skipped 233, and recorded the worktree as dirty. The DOC-14 recommender, ACE resolver, and recommender test are untracked at the base commit; the task ledger is tracked but modified. Their per-file SHA-256 source revisions are in `.tmp/atlas/doc14-ace-source-binding-observation-20261122.json`. This is an origin candidate observation (`canonicalAuthority=false`), not persisted packet identity or admission; it explains why packet lookup cannot yet resolve the working-copy code revision.
- Report: `docs/reports/doc14-dspy-native-ace-lm15-wiring-20261122.md`.

## DOC-14 repair worker follow-up verification (2026-11-22)
- Added a focused test that exercises `RepairProgramV1.forward` with an injected resolver and verifies both DSPy `Predict` calls run inside the explicit `lm15` and JSONAdapter context. Windows Python 3.13 focused worker + ACE adapter suites: 75 passed.
- Re-ran the worker suite in WSL2 `atlas-rapids-cu13`: 71 passed. This verifies the source contract in the existing Linux Python environment; it does not identify the running container's installed package set.
- Read-only `GET http://127.0.0.1:8122/health` was refused. The repair worker is not reachable at that endpoint, so live `/v1/repair` inference remains unproven; no Docker lifecycle action was taken.
- This does not close the existing gates for current admitted ACE evidence, claim support review, OAK relation admission, authorized cache readback, or reviewed GEPA/ranker data. No OpenSpec checkbox changed.
- Report: `docs/reports/doc14-dspy-native-worker-wiring-20261122.md`.

## DOC-14 source-span and proposal contract follow-up (2026-11-22)
- Hardened pre-publication checks so a relation candidate cannot self-promote: `GRAPH_ADMITTED`, `canonical_authority=true`, missing extractor revision, or swapped subject/object mention roles are rejected. Stanza-shaped outputs remain `PROPOSED` and noncanonical.
- Latest focused tests: Windows Python 3.13 **32 passed** across span integrity, proposal shape, external-doc extraction, and OKF publication; WSL2 `atlas-rapids-cu13` **10 passed** across span integrity and proposal-shape suites.
- Existing `lsp_utf16_to_utf8_byte_offset` handles LSP UTF-16 positions and UTF-8 byte offsets, including surrogate-pair boundary rejection. The taxonomy crosswalk is validated (13 top-level + 4 child IDs, conservation passed) but includes unresolved/ambiguous label mappings and is not DOC-14 relation admission.
- A source-binding observation over source-like files is an origin-candidate inventory, not a canonical index. It does not need to hash every ignored/generated/vendor file in the broad working tree. Canonical status still requires the existing source-index admission and readback path.
- A bounded Stanza 1.15.1 CPU run is proven separately in `docs/reports/doc14-live-stanza-proof-20261122.json`: 8/56 chunks parsed, 18/18 proposal spans independently read back, deterministic replay, and an adversarial offset mutation rejected while preserving the prior artifact. This used a separate Windows CPU environment and a Firecrawl MCP capture; it does not establish Stanza or Firecrawl configuration in the current :8095 runtime (`/evidence/web` returned `FIRECRAWL_NOT_CONFIGURED`).
- Configured OAK source, human-reviewed/admitted relation rows, current Graphify structural graph, current admitted ACE ContextManifest, live repair-worker inference, and authorized Valkey write/readback remain open. No checkbox changed and no canonical store was written.
- Report: `docs/reports/doc14-span-publication-integrity-20261122.md`.

**OAK relation review handoff (2026-11-22):** added `python/atlas_graph_runtime/doc14_relation_oak_review_v1.py` to join the existing OAK label-search envelope to source-span-verified Stanza relation candidates. It binds subject/object mention text to OAK external-ID suggestions, preserves unresolved/ambiguous mappings, and includes matching existing external ontology relations as review context without translating their predicates into Atlas predicates. Parent Atlas `ontologyIds` stays empty; no relation is admitted.
`write_source_artifacts()` now accepts optional per-chunk OAK responses and writes/readbacks `relation-oak-review.jsonl`; missing/rejected responses remain explicit. The opt-in CLI path queries `/ontology/oaklib/search` and `/ontology/oaklib/candidates` using bounded read-only requests and enforces a single ontology/producer revision. Current :8095 health returned `ok`, but a bounded OAK label query returned HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`, confirming the live resource remains unconfigured. Final focused suites: Windows 39 passed; WSL2 bridge + span suite 18 passed. Tests use fixture OAK responses. No checkbox changed and no canonical write occurred. Report: `docs/reports/doc14-span-publication-integrity-20261122.md`.

## DOC-14 workspace-source observer digest-cache integration (2026-11-22)
- Updated `sveltekit-frontend/scripts/atlas/observe-workspace-source-binding.mts` to reuse the existing checksummed workspace digest-cache owner. It reuses only unchanged, clean, tracked files; dirty and untracked inputs are re-read and hashed. `ATLAS_WORKSPACE_SOURCE_BINDING_DIGEST_CACHE=off` forces uncached reads. Cache metadata remains derived and noncanonical; source admission still requires independent exact-byte readback.
- Full-workspace observer cold/warm proof produced the same `workspaceRevision` (`sha256:14a5003b8076e6eae9e1b501e1fb2e7cc04d5dd8e522abfee56af6ca6cb284cc`) and the same 37,765 eligible source count. Cold run rehashed 37,765; warm run reused 37,479 and rehashed 286 dirty/untracked sources. This is the source observer's filtered Git-visible cohort, not the 1.3M ignored/generated filesystem paths.
- Shared workspace snapshot/cache suite: 16/16 passed. Live Atlas `trace_database` query for the task/source-index identity returned `NO_MATCH` with 0 traces and 0 unqualified rows; this does not constitute a table census. No canonical index, Graphify, ACE, Valkey, or task-status write occurred. No checkbox changed.
- Current report: `docs/reports/workspace-source-binding-observation.json`; run output was `ORIGIN_CANDIDATE_OBSERVED`, not canonical admission.
- Fresh task-source census was explicitly diagnostic (`15,839` rows across `157` changes; `6,855` unchecked tasks; `promotionEligible=false`). The existing locator-only publisher's bounded dry run found all `6,855` rows valid, and the exact snapshot `sha256:6b0146ec4adfcb97739133b08eeb52fb2fef9fb9ee7bcb573e079c86c1522fa3` was applied to PostgreSQL 18 with post-commit readback (`SOURCE_INDEX_READBACK_PROVEN`, 6,855 rows). This publishes task locators/hashes only; it does not promote task identities/status or source-code chunks. The independent Atlas packet lookup still returned `NO_PACKET` for the current observer, this task ledger, and the DOC-14 OAK adapter. Source-code indexing/admission and ACE remain open. Receipt: `.tmp/openspec-task-source-index-current/apply-receipt.json` (local, ignored artifact).

## DOC-14 bounded source-scope observer (2026-11-22)
- Added `ATLAS_WORKSPACE_SOURCE_REFS_FILE` to the existing workspace source observer. The manifest accepts 1–64 exact repository-relative, source-extension paths and uses literal Git pathspecs for file membership, tracked blob IDs, and dirty-state checks. Explicit-scope observations hash only those selected files and bypass the full-workspace digest cache.
- Scoped output uses `atlas.workspace-source-scope-observation.v1`, `workspaceRevision: null`, `completeWorkspaceInventory: false`, and a separate `sourceScopeRevision`; it cannot be mistaken for a full workspace revision. Full-workspace behavior remains the existing observer path.
- Smoke on the OAK relation adapter and this task ledger returned two exact source hashes that independently matched disk bytes. A `../AGENTS.md` path was rejected and produced no receipt. The output remains `SOURCE_SCOPE_CANDIDATE_OBSERVED`, canonical authority false; no source-index, graph, ACE, or cache write occurred. Source-index admission and exact readback remain open.
- Focused command: `ATLAS_WORKSPACE_SOURCE_REFS_FILE=.tmp/atlas/doc14-source-scope-smoke.json ATLAS_WORKSPACE_SOURCE_BINDING_OUT=.tmp/atlas/doc14-source-scope-smoke-receipt.json npx tsx scripts/atlas/observe-workspace-source-binding.mts` (run from `sveltekit-frontend/`).

## DOC-14 bounded Graphify refresh planning (2026-11-22)
- A fresh full observer pass completed in 48 seconds over the observer's filtered Git-visible source cohort: 37,768 sources, 239 skipped, 37,475 digest-cache hits, and 293 rehashed sources. It returned `ORIGIN_CANDIDATE_OBSERVED`, `dirty: true`, and workspace revision `sha256:8d49623eb0ccd48ab548e268434e18874caee08d475be65057933b2b0cb165dc`. This is a local candidate observation, not canonical admission or the ignored/generated filesystem inventory.
- The Graphify planner revalidated local bytes for its bounded 52-source cohort: 0 current exact Graphify matches, 52 revision/content mismatches (all workspace-revision mismatches), 0 local byte mismatches, and 0 missing Graphify sources. It returned `CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_REVIEW` with next gate `EXPLICIT_GRAPHIFY_BATCH_REVIEW`; no Graphify or database writes occurred. Report: `.tmp/atlas/current-source-graphify-batch-plan-current-20261122-rerun.json`.
- Added planner CLI overrides for an explicit observation/cohort and a custom report path restricted to `.tmp/atlas/`; the default tracked report location remains unchanged. Negative check confirmed an out-of-scratch custom report path exits before creating its target.
- No task checkbox changed. The next gate is a reviewed, operator-authorized Graphify refresh/reconciliation, followed by a new current structural graph snapshot; the stale revision must not be relabeled current.
- Follow-up live preflight: `find_source_refs` returned `NO_PACKET` for the task ledger, OAK review adapter, and DSPy ACE recommender; `trace_database` returned PostgreSQL FTS `NO_MATCH` for the task-ledger/source-index query. A bounded read-only POST to `:8095/ontology/oaklib/search` returned HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. These confirm that current working-copy source chunks and the OAK vocabulary still cannot enter the canonical proposal→ACE path; no rows were written and no relation was admitted.
- Exact-file indexer dry runs used the existing `index-full-repo-for-search.mjs` owner with database-backed reuse checks: the modified OAK adapter would produce 14 chunks and the 267 KB task ledger 50 paragraph chunks; all 64 were `STORED_ROW_MISSING`. Its apply path writes general `codebase_chunk_index` metadata and Qdrant projections, while the code explicitly says this broad indexer cannot establish admitted workspace/source lineage. Therefore the dry run is useful for bounded chunk planning, but applying it would not close source-index admission; no embeddings, index writes, or Qdrant writes were performed.

## DSPy repair-worker native engine alignment (2026-11-22)
- Updated `docker/atlas-dspy-repair-worker/requirements.lock.txt` to DSPy 3.5.0 and GEPA 0.1.4, removing LiteLLM and OpenAI SDK from this worker's dependency set. Updated the Dockerfile version comment to match the lock. The repair program already resolves the active model lazily from `/v1/models` and invokes `dspy.LM(..., engine="lm15")` inside the request context, so `/health` remains model-free and no compatibility fallback is needed.
- Clean Windows Python 3.13 venv installed from the lock-equivalent resolution and verified `dspy=3.5.0`, `gepa=0.1.4`, `litellm_available=False`, successful native `lm15` LM construction, and `pip check` with no broken requirements. Focused repair/recommender tests passed 75/75.
- This is host/lock/source proof only: no Docker build or container restart was run, and no live `/v1/repair` call was made. The worker's live HTTP availability, admitted ContextManifest, current canonical source chunks, and independent citation-support review remain open. No task checkbox changed and no canonical store was written.

## DOC-14 current-source and graph-revision gate (2026-11-22)
- Hardened `task-to-ace-vertical-slice-v1.ts` to stop minting `graph:live-pg18-v1` and `semantic_768:embeddinggemma-v1` placeholders. It now requires the current task-source-index row to match exact task source, change ID, line, block hash, and a non-ambiguous declared/derived identity. It then requires a validated `atlas_graph_snapshots_v2` row with exact workspace match, source-inventory revision, graph revision, checksum, and non-empty topology; graph revision is read from that row. All admitted chunks must share a SHA-256 workspace revision and one SHA-256 representation revision before building the ACE manifest. Candidate/feature snapshot revisions are content-derived. Missing or stale lineage returns an explicit blocker and prevents replay/proposal generation.
- Added pure resolver coverage for stale, mismatched, unsealed, and empty graph snapshots. The focused task-to-ACE Vitest file passed 3/3; it checks the live database path when reachable and otherwise returns no canonical or write claims. Strict OpenSpec validation and scoped `git diff --check` passed.
- Fresh local audit of `docs/reports/doc14-admitted-chunks.jsonl`: all 200 rows carry `pgReadbackStatus=PROVEN` / `admissionStatus=INDEX_ELIGIBLE`, but only 75 source revisions match current file bytes; among those, only 43 chunk texts occur exactly in the current source file. These rows must be revalidated at request time; the JSONL export alone is not a current ACE context. The current structural-edge report remains `CONTRACT_INCOMPLETE` with 0 nodes, 0 edges, and null graph revision.
- No OpenSpec checkbox changed. Relation review/admission, a current revision-qualified graph snapshot, a current canonical ACE manifest, live repair-worker availability, and independent citation-support validation remain open. No Postgres, Graphify, Qdrant, Valkey, or Docker writes/restarts occurred.

## DOC-14 DSPy ACE boundary hardening (2026-11-22)
- Replaced the `canonicalized: true` Boolean trust path in `dspy_predict_ace_recommender_v1.py` with the existing checksum-valid `atlas.context-manifest.v2` owner and exact `PROVEN`/`INDEX_ELIGIBLE` evidence-row join. The call now requires a bounded selected-node set, source revisions, token counter, and explicit/inferred model revision before DSPy Predict can run.
- The OAK HyperGraphRAG prefill no longer promotes its own sealed prefill manifest into an ACE context. It returns `CANONICAL_ACE_CONTEXT_REQUIRED` until the caller supplies an admitted V2 manifest and exact readback rows; missing source/workspace/graph revisions now return `PREFILL_LINEAGE_REQUIRED` instead of invented defaults. Hydration no longer fabricates `pg18:unversioned` source revisions.
- Reclassified `prove-doc14-lm15-live-v1.py` as a transport/DSPy capability probe only; removed its hand-built manifest from a stale JSONL chunk and its unsupported citation-verification claim. Live Windows Python verification passed with DSPy 3.5.0, native `lm15`, no LiteLLM, and the active Gemma 4 server; structured `Predict` returned successfully. Receipt `.tmp/atlas/doc14-lm15-capability-v1.json` explicitly records `aceContextProvided=false`, `citationVerified=false`, `canonicalAuthority=false`, and `writesPerformed=false`. This proves model-call capability only, not the DOC-14 ACE/citation path.
- Adversarial and focused verification: 39 tests passed across span integrity, relation proposals/OAK review, ACE/DSPy recommender, and OAK prefill; Python compilation and scoped `git diff --check` passed. Strict OpenSpec validation passed. No live canonical ACE manifest, Graphify admission, OAK ontology source, database/cache write, or relation review was established; no task checkbox changed.
- Relation-proposal source-readback follow-up (2026-11-22): `relation_proposal_verifier_v1.py` now distinguishes the parent `contentSha256` from `chunkSha256`, rejects malformed hashes and invalid UTF-8, verifies chunk hashes, and optionally re-reads the current repository file to validate its full content hash and locate a unique chunk occurrence before emitting full-file byte offsets. The production BOW CLI enables that fail-closed mode and now supplies the real parent content hash—not `sourceRevision`—to the feature-matrix identity contract. Read-only evaluation of the current 200-row export accepted 15 import proposals with full-file hash readback and rejected 157 rows (125 stale parent hashes, 32 chunks absent from current file bytes); 28 rows had no import candidate. The report stores all 15 proposals and 157 reindex/review candidates for inspection. Output remains proposal-only, with zero database/Graphify/cache writes. Windows Python focused suites: 9 passed; strict OpenSpec validation passed. Report: `docs/reports/doc14-relation-source-readback-v1-20261122.json`.
- Live integration recheck (2026-11-22): `POST :8095/ontology/oaklib/search` returned HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`; Atlas `build_agentic_rag_context` returned zero cards with `LIVE_RETRIEVAL_UNAVAILABLE`. Therefore no current OAK suggestions, canonical ACE manifest, relation admission, or cache publication was proven. These live gates remain open; the 15 local source-verified imports are proposal evidence only.
- Rejected-source reconciliation (2026-11-22): the 157 failed chunk rows reduce to two source files. `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` has 125 records whose stored `sourceRevision` (`9e4e…`) and `contentSha256` differ from current working-copy bytes (`695d…`), so it needs authorized source-revision rebinding. `packages/atlas-core/src/retrieval/feature-registry-search.ts` has 32 records with a matching full-file revision but an 800-character excerpt not found verbatim in the file; these need the canonical chunker/source-span mapping, not guessed offsets. The 15 valid imports originate from three other files. The report groups these actions without applying them; no source index or Graphify writes occurred.
- Existing indexer diagnostic for `feature-registry-search.ts`: the current `INDEX_FULL_REPO_SLIDING_WINDOW_V1` owner reproduced 11 of its 43 stored text rows exactly; 32 differ, although all 43 carry the matching source revision. Only 11 have a unique source occurrence and none carry a stored source span. `scripts/atlas/lib/chunk-source-attribution-diagnostic-v1.mjs` marks these results `canonicalAuthority=false` and `evidenceAdmitted=false`; reproduction does not establish which producer emitted the historical rows. The detailed counts are in the source-readback report. This confirms the next step is canonical chunk lineage/span reconciliation rather than creating another chunker.
- Canonical indexer/Postgres dry-run (2026-11-22; `--no-redis`, no `--apply`): `index-full-repo-for-search.mjs` selected 43 chunks for `feature-registry-search.ts` and classified 32 `CHUNK_CONTENT_HASH_MISMATCH` plus 11 `SOURCE_REVISION_MISMATCH`; for `context-assembler.ts` it selected 23 chunks and classified 21 `CHUNK_CONTENT_HASH_MISMATCH` plus 2 `STORED_ROW_MISSING`. This is the existing PostgreSQL reuse classifier's read-only result and a concrete targeted refresh plan. No embedder, Qdrant, PostgreSQL, or Redis/Valkey writes occurred; the explicit backfill authorization gate remains intact. Report records both command receipts.

## DOC-14/15 recommendation admission boundary recheck (2026-11-22)
- Replay source-byte gate (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): the existing verifier now also requires independent chunk byte bounds, rehashes the exact source slice for every candidate, binds each citation span to exactly one candidate, and rejects non-integer masks and grades. The GEPA adapter forwards independent spans, supplies all verified candidate texts as inputs, and selects the expected quote from the graded candidate's own span. With `PYTHONPATH=python`, `C:\Python313\python.exe -m pytest python/tests/test_doc14_versioned_replay_export_v1.py python/tests/test_gepa_frozen_corpus_adapter_v1.py -q` returned `4 passed in 2.37s`. A missing distractor span and a same-length byte substitution outside the cited chunk both fail closed. Strict OpenSpec validation passed. This is fixture proof; the real labeled cohort, split leakage audit, and offline optimization remain open.
- Live pgvector proposal citation check (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): from `sveltekit-frontend` with `PYTHON_PATH=C:\Python313\python.exe` and `LLAMA_SERVER_URL=http://127.0.0.1:8090`, `node --env-file=.env.local --import tsx scripts/atlas/prove-doc14-pgvector-relation-ace-v1.mts ../docs/reports/doc14-pgvector-relation-ace-proof-retry-v1.json` emitted `{"status":"PROPOSAL_SPAN_NOT_CITED","chunkId":"doc:pgvector:fe883c75f323441d:24","staleRevisionProbe":"CANONICAL_PAGE_OR_CHUNK_REVISION_CHANGED","recommendationStatus":"BLOCKED","reason":"DOC14_DSPY_RUNTIME_AdapterParseError"}` and exited nonzero. Live read-only PostgreSQL matched the exact proposal source and chunk revisions, content checksum and UTF-8 span. An injected stale revision returned no citation. Two attempts at structured Gemma 4 Predict returned an adapter parse error. The report preserves both the passed evidence check and failed citation check. No admitted edge was used. This does not prove the recommendation for this proposal.
- Source-backed relation review draft (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): `C:\Python313\python.exe scripts/atlas/prove-doc14-pgvector-relation-proposal-v1.py --output docs/reports/doc14-pgvector-relation-review-v1.json` emitted `{"status": "PENDING_HUMAN_AND_ONTOLOGY_REVIEW", "chunkId": "doc:pgvector:fe883c75f323441d:24", "adversarialReadback": "NORMALIZED_CAPTURE_READBACK_CHECKSUM_MISMATCH"}`. The script cross-checks the previously exported PostgreSQL citation against the pinned admission envelope, independently normalizes and hashes the captured pgvector document, and rebuilds the typed proposal and exact byte spans through the existing bridge. The extract is labeled manual and the proposal stays unmapped. A modified source byte is rejected before review output. The report pins the envelope and exported pool digests. This proves one real source-backed proposal against frozen readback, with no new live database query, ontology mapping, review decision, or graph revision.
- Proposal-to-hypergraph evidence gate (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): the existing bridge now reuses the independent normalized-source readback validator, including predicate and participant spans and chunk evidence revision, before building a proposal. The pipeline passes the existing capture readback instead of forwarding only bytes. With `PYTHONPATH=python`, `C:\Python313\python.exe -m pytest python/test_atlas_okf_docs_pipeline.py python/test_atlas_external_doc_hypergraph.py python/tests/test_doc14_relation_oak_review_v1.py python/tests/test_atlas_doc14_span_integrity_v1.py -q` returned `42 passed, 3 warnings in 14.61s`. Adversarial coverage substitutes a participant label while leaving the evidence and verification status unchanged, and the bridge rejects it with `PARTICIPANT_TEXT_SPAN_MISMATCH`. The existing Firecrawl review queue still has 18 pending proposals. Live read-only OAK label lookup returned HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. This verifies proposal construction and rejection in fixtures. Live reviewed edge admission and relation-to-ACE retrieval remain open.
- Dataset and runtime inventory (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): repo JSONL census found 455 records marked reviewed in the existing domain-calibration gold export (its receipt reports 46 double-reviewed and `revisionQualifiedOnly=false`), 120 pending domain-queue rows, 36 pending task-eval rows, 200 DOC-14 chunk rows and three GRPO seed pairs. They are separate input cohorts. Live OAK label search on :8095 returned HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. Live :8098 `GET /health` identified execution-only `atlas-gpu-8098` with `cudaAvailable=true`, RTX 3060 Ti and `torchAvailable=false`. `GET /v1/capabilities` on that port returned 404, so no RAPIDS/cuVS capability is inferred. `node scripts/atlas/check-simd-json-runtime.mjs` reported `active_backend=native` on Windows Node v22.23.3. An independent `node --import tsx --input-type=module -` probe from the frontend invoked `fastJsonParseWithBackend` with a valid object containing an 8192-character string and a second input missing its closing brace. Output: `{"backend":"SIMDJSON_NAPI","validParity":true,"malformedRejected":true}`. This proves native JSON dispatch and rejection for the fixture. Review JSONL ingestion and RTX retrieval were not benchmarked.
- Human judgment handoff (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): from `sveltekit-frontend`, `node --import tsx scripts/atlas/review-doc14-gold-pool-v1.mts prepare ../docs/reports/doc14-official-gold-review-pool-v1.json ../docs/reports/doc14-official-gold-review-decisions-v1.json` emitted `{"status":"PENDING_HUMAN_REVIEW","queries":30}`. Running the same command with `evaluate` in place of `prepare` emitted `{"status":"PENDING_HUMAN_REVIEW","pendingQueries":30,"metrics":null}` and exited 2. A temporary copy with a substituted candidate revision was rejected with `DOC14_REVIEW_CANDIDATE_BINDING_MISMATCH`. A separate temporary synthetic decision file exercised Recall@5, MRR@5, NDCG@5 and candidate citation support on 13 scorable held-out questions with one marked needs more evidence and `promotionAllowed=false`; these scores are fixture behavior, not ranking quality evidence. The permanent decision file retains blank grades, reviewer identity, and answerability. The scorer uses the original question FTS ordering and excludes reviewer hint rankings. Pool and decision digests bind evaluated inputs. Reviewer identity and approval still require independent verification.
- Language vocabulary recheck (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): local OBO has 104 terms. The detector returns `cpp` for `.cu` and `UNKNOWN_EXTENSION` for `.cuh` and `.ptx`. With `PYTHONPATH=python`, `C:\Python313\python.exe -m pytest python/tests/test_okf_language_lsp_term_expander_v1.py -q` returned `2 passed, 4 warnings in 16.15s`. The test generates the vocabulary in a temporary directory and calls the real label search handler, checking the pinned ontology digest, the `.cu` mapping, and an empty match for an unknown term. Live POST `:8095/ontology/oaklib/search` returned HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. Local handler proof is available. Service configuration, reviewed mappings, and tuple admission remain open.
- Fresh official documentation review pool (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): from `sveltekit-frontend`, `node --env-file=.env.local --import tsx scripts/atlas/build-doc14-gold-review-pool-v1.mts ../docs/reports/doc14-official-gold-review-pool-v1.json` emitted `{"status":"PENDING_HUMAN_REVIEW","queries":30,"candidateOccurrences":102,"queriesWithoutCandidates":4,"poolChecksum":"sha256:0698d3196775abc0ea9a616ea792a973bbffdf6e420946e2f370148cb774bd52"}`. A single repeatable-read, read-only PostgreSQL snapshot backed the question FTS and reviewer hint queries. All exported rows passed exact citation readback. Independent artifact checking recomputed all chunk text checksums and byte lengths, counted 75 distinct chunks and found zero shared chunks across 16 train and 14 held-out questions grouped by product. Four empty results remain retrieval coverage gaps, with no judgment of answerability. Reviewer hints only discover candidates. Dense and graph lanes remain unrun, and labels remain blank. From the same directory `npm exec vitest run src/lib/server/atlas/docs/external-doc-citation-readback-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Tests 6 passed (6)`, including stale and substituted row rejection. This proves live pool construction and fixture failure handling. It does not close DOC-14 or DOC-15.
- Golden label review draft (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): `docs/reports/doc14-golden-label-review-draft-v1.json` (SHA-256 `7119f963e79b5287cfcaa004a7f87a07d716ad28d4e0bda297d6de53dd32438a`) pins the input exports and carries two questions with four proposed grades, source revisions, and exact UTF-8 quote spans. Review fields remain blank. The 36 task groups have zero reviewed groups. Of 108 candidate occurrences, 43 passed local byte readback, 51 had stale source revisions, and 14 had missing or nonunique chunk spans. Local byte readback does not establish current canonical corpus admission. Build the reviewed cohort from a fresh admitted corpus, pool candidates across the comparison lanes, and freeze source groups, candidate identities and labels before evaluation. The read-only command `C:\Python313\python.exe scripts/atlas/build-reviewed-task-eval-set-v1.py --evaluate docs/reports/reviewed-task-eval-set-v1.jsonl` returns `UNREVIEWED_EVAL_SET` with 12 unreviewed held-out groups. The evaluator now measures pooled recall and NDCG against the full judged candidate list and blocks incomplete judgments and task-source overlap across splits. `C:\Python313\python.exe -m pytest python/tests/test_build_reviewed_task_eval_set_v1.py -q` returned `1 passed in 0.60s`, including a top-1 hit with recall 0.5 and a rejected overlapping split. No rankings were trained or promoted.
- Mirror/runtime recheck: GitHub PR #141 is `MERGED` to main at `0e596c676b4e26021e1fb04998af07daca62ad34`. GitHub's native smoke blob matches the working copy, and the mirrored DOC-14 review adapter blob differs from the current working copy. Local Qdrant returned version `1.19.0`, commit `74f3e85b9473c62560006c043e13737ce6b48412`.
- Synthetic ontology fixture (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): added `python/tests/fixtures/doc14-software-review-fixture.obo` with two test terms and one relationship. The in-process sidecar handlers used real OAK label and relationship lookup, then fed JSON-shaped output through the DOC-14 span and mapping reviewer. The test verifies the ontology SHA-256, proposed IDs, and relationship with no admission. With `PYTHONPATH=python`, `C:\Python313\python.exe -m pytest python/tests/test_doc14_relation_oak_review_v1.py python/tests/test_atlas_doc14_span_integrity_v1.py -q` returned `21 passed, 3 warnings in 14.08s`. The fixture is scoped to tests. A production vocabulary and independent review remain required.
- Mirror and native checks: `git ls-remote origin refs/heads/main` returned `c20463ae5368bd2e5db5440496c3c4d3dcb9cd19`. The DOC-14 review adapter and the 21-line TensorHandle/Mode-7 native smoke addition are absent from that revision. `node packages/atlas-native-core/tests/native_addon_smoke.cjs packages/atlas-native-core/build/Release ./packages/atlas-native-core/build/Release/atlas_native_core_smoke.exe` returned `node_api_smoke=PASS` on Node v22.23.3. This covers the Release addon and its fixture, with no GPU or retrieval dispatch.
- OAK review evidence (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): the review record now carries exact normalized-document UTF-8 byte spans for each mapped mention and the predicate, plus the extractor version. It accepts the producer's merged 64-term limit (four requests at 16 terms each) and rejects duplicate concept IDs. With `PYTHONPATH=python`, `C:\Python313\python.exe -m pytest python/tests/test_doc14_relation_oak_review_v1.py python/tests/test_atlas_doc14_span_integrity_v1.py -q` returned `20 passed in 0.79s`, covering multibyte slices, over-budget responses, duplicate IDs and stale source rejection. Live read-only POST `:8095/ontology/oaklib/search` with `{"terms":["API symbol"],"maxCandidatesPerTerm":1}` still returned HTTP 503 `{"detail":"OAKLIB_SOURCE_NOT_CONFIGURED"}`. Live OAK suggestions require an approved local ontology selected by `ATLAS_OAKLIB_ONTOLOGY_ROOT` and `ATLAS_OAKLIB_ONTOLOGY_FILE` in the sidecar process. Review records remain proposal-only.
- Live official-document Predict handoff (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): the authenticated A2A document skill accepts an opt-in `docQuery.recommend` flag. It sends only the server-built manifest and verified rows to the private Python stdin bridge. The serving adapter uses the configured Python and llama-server URLs, a 45-second timeout and bounded input/output. DSPy uses native lm15 with response caching disabled and llama-server tokenizes the bounded question/evidence input. The displayed answer is assembled from claims after quote validation. TypeScript independently rechecks the quote bytes and rebases offsets to the canonical document. Earlier live output was rejected as `DSPY_CLAIM_QUOTE_NOT_IN_VERIFIED_CONTEXT`; keeping the byte gate and prompting for short verbatim spans yielded a passing live check. The returned status remains `EXACT_QUOTE_MATCH_REVIEW_REQUIRED` because byte agreement alone does not establish entailment.
- Exact live command from `sveltekit-frontend` after setting `ATLAS_LIVE_DOC_DB=1`, `ATLAS_LIVE_DOC_DSPY=1`, `PYTHON_PATH=C:\Python313\python.exe` and `LLAMA_SERVER_URL=http://127.0.0.1:8090`: `node --env-file=.env.local node_modules/vitest/vitest.mjs run 'src/routes/(app)/admin/atlas/DocCorpusPanel.live.spec.ts' src/routes/api/ai/agent/a2a-error-fix-proposal.route.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism`. Result: `Test Files 2 passed (2)`, `Tests 12 passed (12)`, including real PostgreSQL and local Gemma Predict for `hnsw.iterative_scan`. Focused Python suites returned `12 passed in 3.15s` using `C:\Python313\python.exe -m pytest python/tests/test_dspy_predict_ace_recommender_v1.py python/tests/test_doc14_bounded_rlm_recommender_v1.py -q` with `PYTHONPATH=python`. This proves the shared serving adapter live and the A2A route with fixtures. A deployed authenticated HTTP run, human claim review, OAK relation admission and held-out GEPA remain open.
- Official document manifest binding (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): the authenticated A2A document handler now builds ContextManifestV2 from its own complete PostgreSQL citation readback. The selection binds ordered chunk IDs, evidence revisions, source revisions, byte spans and hashes. It records a 2,048-token manifest budget for the later consumer and leaves graph/model revisions unset. Blocked batches return a null manifest and zero citation bodies. From `sveltekit-frontend`, `npm exec vitest run src/lib/server/atlas/docs/external-doc-citation-readback-v1.spec.ts src/routes/api/ai/agent/a2a-error-fix-proposal.route.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned 16 tests passed, including the blocked route. With `ATLAS_LIVE_DOC_DB=1`, `node --env-file=.env.local node_modules/vitest/vitest.mjs run 'src/routes/(app)/admin/atlas/DocCorpusPanel.live.spec.ts' --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned 1 test passed. That read-only live check searched PostgreSQL for `hnsw.iterative_scan`, verified the citation bytes, and checked the manifest selection checksums. The authenticated route is fixture-proven. A serving bridge from its scoped readback to Python DSPy, live claim verification and reviewed ontology admission remain open.
- Authenticated A2A official-document readback (base `74ac7d8983ebffce9b170c4fcac031964f0aca5e`): the existing PostgreSQL citation reader now rejects duplicate selections, unexpected or duplicate database rows, and provider/product/version mismatches. If any selected citation fails, the reader and the A2A serving boundary withhold all citation bodies. From `sveltekit-frontend`, `npm exec vitest run src/lib/server/atlas/docs/external-doc-citation-readback-v1.spec.ts src/routes/api/ai/agent/a2a-error-fix-proposal.route.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` reported `Test Files 2 passed (2)`, `Tests 15 passed (15)`, including a valid row alongside a mismatched product version. This covers fixture behavior only. A live read-only POST to `:8095/ontology/oaklib/search` with `{"terms":["API symbol"],"maxCandidatesPerTerm":1}` returned HTTP 503 `{"detail":"OAKLIB_SOURCE_NOT_CONFIGURED"}`. The stored manifest reader still returns `READBACK_MATCH_NOT_ADMITTED`; the authenticated official-document path still needs an exact manifest/selection binding and a DSPy consumer. DOC-14/15 remain open.
- The caller-controlled `canonicalized=true` shortcut is already rejected by `run_dspy_predict_ace_recommender_v1`; raw context returns `REJECTED_RAW_CONTEXT`. Its downstream helper recomputes the ContextManifestV2 identity checksum, binds selected nodes and evidence refs to supplied rows, checks `PROVEN` / `INDEX_ELIGIBLE`, chunk SHA-256, query equality, and the source-revision-set checksum. Focused recommender suites passed 11/11 on Windows Python 3.13.
- This is not yet an authoritative readback boundary: `context_manifest_v2` and `ace_records` are ordinary caller-supplied mappings. Their self-consistent checksum and status strings do not prove a fresh PostgreSQL read, authorization scope, canonical admission, or current source revision. The positive test uses a fabricated manifest/row and a fake DSPy module; it proves fixture wiring only. `run_sealed_oak_hypergraph_rag_v1` invokes the recommender only when these values are provided by its caller and otherwise fails with `CANONICAL_ACE_CONTEXT_REQUIRED`.
- Keep DOC-14/15 open. Next implementation gate is to make the serving caller obtain an authenticated/current readback through the existing ACE/PostgreSQL admission owner, then pass a verified server-side result to DSPy. Add adversarial coverage for forged PROVEN rows, scope mismatch, substituted membership, stale source revisions, and failure before any model call. Do not use manifest hashing alone as authorization or admission evidence. No task checkbox or canonical store changed in this recheck.
- Geometry remains a separate follow-up: PyTorch stabilized normalization and a WASM forward/backward pair exist and their focused checks pass, but neither has a facial-fitting caller. Do not route the 22D physical geometry descriptor through embedding normalization or claim a facial fit from the WASM smoke.
- Detailed evidence: `docs/reports/doc14-context-admission-and-normalization-audit-20261122.md`.
- Follow-up implementation (working tree based on `4fe5ebf63e07d57bcfc3f002c3537215d5011f79`): the Python Predict entry point rejects caller-provided rows and obtains the manifest and exact selected rows through a server-bound scoped readback callable. OAK prefill requires that callable for synthesis, and the local AST/regex card CLI explicitly rejects its obsolete live-DSPy flag. Extra nodes and duplicate chunk IDs fail closed in the strict join. Model resolution runs only after the evidence and token checks. Windows PowerShell verification with `$env:PYTHONPATH='python'; C:\Python313\python.exe -m pytest python/tests/test_dspy_predict_ace_recommender_v1.py python/tests/test_doc14_bounded_rlm_recommender_v1.py python/tests/test_oak_hypergraph_rag_pipeline_v1.py python/tests/test_ast_regex_ace_cards_v1.py -q` returned `15 passed in 5.01s`. Adversarial fixtures cover forged row labels, denied readback, mismatched checksum, extra selection rows and a changed source revision. This proves adapter behavior. A deployed authenticated caller still needs to bind the existing PostgreSQL manifest and evidence readers to produce the scoped result. DOC-14/15 remain open.

## DOC-14 compute handoff and glue-gap correction (2026-11-23)
- Audited the proposed outbox, RRF, envelope, WebGPU alignment, and transport gaps against current owners. The transactional outbox already exists in `action-writer.ts`/`outbox-worker.ts`; RRF and identity normalization owners already exist; ARPC already carries magic/version/codec/length/SHA-256 and LZ4 codec ID; WebGPU pitch/uniform alignment helpers exist. No duplicate owner or custom UDP/QUIC layer was added. Remaining integration concern is convergence of legacy RRF callers and live consumer proof, not absence of these contracts.
- Hardened the local PG18↔Arrow replay helper: removed its false `verifiedClaim=true` and PUCT reward reuse; ranks finite supplied feature scores deterministically; disabled its unqualified PG18 scan because it fabricated missing source revisions and a constant score; added an ordinal-map checksum covering candidate UUID, source revision, and task ID; rejoin rejects sidecar identity drift, duplicate candidate IDs, and non-dense ordinal maps.
- Focused proof: `C:\Python313\python.exe -m pytest python/tests/test_pg18_arrow_roundtrip_v1.py python/tests/test_step1_ast_obo_nibble_rpc_v1.py -q` → 6 passed in 2.11s. Existing-owner regression checks for ARPC, transactional action/outbox, RRF fusion, and canonical identity → 50 passed across 4 Vitest files in 7.29s. This is fixture/replay proof only. Strict OpenSpec validation and `git diff --check` passed. Read-only candidate audit remains blocked: 15/15 candidate vectors/chunks present, but 0/15 authority-qualified (no matching producer/source/workspace/representation lineage). Live `:8095` OAK search still returns `OAKLIB_SOURCE_NOT_CONFIGURED`; live RAG context is unadmitted and missing source revisions.
- Report: `docs/reports/parent-atlas-glue-gap-review-v2-20261123.md`. No database/cache/graph/GPU writes, ontology admission, training, ACE publication, or task checkbox changes occurred. DOC-14/15 remain open.

## DOC-14 OAKLib source configuration (2026-11-23)
- Configured the existing miniforge sidecar Compose service with `ATLAS_OAKLIB_ONTOLOGY_ROOT=/workspace/.okf/ontologies` and `ATLAS_OAKLIB_ONTOLOGY_FILE=atlas-domain-and-language-terms-v1.obo`. The mounted repository is read-only. The OBO has 110 terms and 3 typedefs; pinned content SHA-256 is `8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`.
- Local OAKLib 0.7.4 read the exact OBO and resolved four labels to the expected IDs as proposal-only suggestions. `docker compose -f docker/miniforge-nlp-sidecar/docker-compose.yml config --quiet` passed. Focused sidecar/local OBO/relation review tests: 28 passed, 4 dependency deprecation warnings.
- Live :8095 still returns HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED` because the running service has not loaded the new Compose environment. Docker/sidecar lifecycle is operator-controlled; no container was restarted. No OAK mapping was admitted and no DB/cache/graph write occurred.
- OAK API alignment recheck: the adapter consumes `SearchInterface.basic_search()` as a bounded iterator, passes an OAK `SearchConfiguration.limit`, and enforces its own `islice` cap. The local OBO/Pronto adapter remains case-sensitive even with OAK's `force_case_insensitive` option; the current route therefore makes no case-insensitive guarantee. Batched `labels()`/`definitions()` calls are a future improvement only if the pinned local source is replaced by a remote/high-latency backend. Windows Python 3.13 focused suites returned 30 passed, 4 dependency warnings. This does not change the live 503 or authorize tuple admission.
- Iterator-cap regression: a 1,000-item generator with a two-candidate request consumed exactly the bounded 16-item prefix, and the real OAKLib `SearchConfiguration.limit` was 16. The four focused OAK/relation suites now return 31 passed, 4 dependency warnings; strict OpenSpec validation passes. Official OAK best-practice docs confirm iterator-first use and caution against eager list conversion for large remote results. Live `:8095` remains HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`; no ontology admission or data-store write occurred.
- Bounded ontology relationship read: the shared OAK candidate adapter now consumes at most 512 relationship rows plus one sentinel and fails closed with `OAKLIB_RELATION_RESULT_LIMIT_EXCEEDED`, rather than fully materializing an arbitrarily large iterator. It also rejects more than 32 subjects. The local synthetic OBO integration confirms an existing ontology relation appears in the source-bound review artifact while the Atlas proposal remains unmapped/noncanonical. The focused suites now return 32 passed, 4 dependency warnings; strict OpenSpec validation passes. OAK docs show the `relationships()` iterable pattern. This remains fixture/local adapter proof; live sidecar activation and human/Graphify admission are open.
- GEPA split integrity follow-up: source grouping now includes every source in each inference-time candidate context, not just the top-graded source; overlapping queries remain in one connected split group. The promotion check re-hashes `train`/`val`/`held_out` against an independently supplied expected corpus checksum, verifies source isolation, unique query IDs, split counts, and noncanonical/no-hidden-state flags. A free-form reviewer string no longer approves promotion: a dataset/program/metric/score-bound approval receipt plus an independent verifier callback is required. Windows Python 3.13 replay/GEPA suites: 7 passed; strict OpenSpec validation and scoped diff check passed. This is adapter/fixture proof only; reviewed production labels, an actual GEPA optimization run, held-out metrics, and production approval-verifier integration remain open.
- Fresh review-data readback: `reviewed-task-eval-set-v1.jsonl` has 36 rows and 0 reviewed/labeled rows; `doc14-official-gold-review-decisions-v1.json` has 30 rows and 0 reviewed rows; `doc14-golden-label-review-draft-v1.json` is empty. This confirms the correct next GEPA action is reviewer labeling, not an optimizer run; no synthetic labels were added.
- Source-bound OAK review packet v2: `scripts/atlas/prove-doc14-pgvector-relation-proposal-v1.py` now performs bounded proposal-only OAK lookups against the pinned local OBO, binds its exact ontology and adapter revisions, and explicitly records unresolved participants / skipped relation lookup when no concepts match. Generated `docs/reports/doc14-pgvector-relation-review-v2-20261123.json` for the source sentence “Iterative scans can use strict or relaxed ordering.” The packet is `PENDING_HUMAN_AND_ONTOLOGY_REVIEW`, `reviewDecision=null`, `graphRevision=null`, `canonicalAuthority=false`, and `writesPerformed=false`; live :8095 remains 503 and was not represented as working. Focused source/OAK/span suites returned 23 passed; strict OpenSpec validation passed. No admission was attempted.
- Current PG18 candidate admission remains blocked. Corrected read-only audit `.tmp/atlas/lineage-semantic-768-cohort-live-refresh-v5-20261123.json` found 15/15 exact source-ref/chunk-hash rows and 15/15 matching `PROVEN` packet/source-revision lineage identities. `CandidateOrdinalMap.identityAuthority=false` is intentional and is not the blocker. The requested workspace revision matched 0/60 existing source bindings; denormalized chunk-row source/workspace revisions, producer metadata, and representation revisions also remain absent or mismatched (0/15). The legacy live extractor remains fail-closed; do not route its output to ACE.
- Fresh read-only structural-edge audit returned `CONTRACT_INCOMPLETE`, `nodeCount=0`, `edgeCount=0`, `graphRevision=null`; only its diagnostic report was updated.
- Status remains PARTIAL and no task checkbox changed. Details: `docs/reports/doc14-oaklib-config-and-continuation-20261123.md`; the broader overlap correction is `docs/reports/parent-atlas-glue-gap-review-v2-20261123.md`.
- OAK readiness follow-up: live `/health` reports general status `ok` while live `/ontology/oaklib/search` returns 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. Added a read-only `oaklibSource` readiness field to the sidecar health contract so the configured ontology SHA or exact configuration error is visible independently of general liveness; canonical authority remains false. Focused sidecar/OAK/relation suites: 33 passed; Python compilation passed. This source change is not loaded in the running service until its operator-controlled reload. No task checkbox changed and no datastore write occurred. See `docs/reports/doc14-oaklib-config-and-continuation-20261123.md`.
- Live ACE context gate: the read-only Atlas context tool returned 7 cards from 10 hits, but labeled them `MISSING_SOURCE_REVISION` and `UNADMITTED_RETRIEVAL_CANDIDATES`; `proofUsable=false`, all workspace revisions were `0`, and evidence byte spans were null. Results were mostly CUDA build logs and local code, not admitted official docs. Recorded in `docs/reports/doc14-live-ace-context-gate-20261123.json`; do not promote these cards to relation evidence or ACE proof.
- Fresh 2026-11-23 recheck: Windows Python reports `oaklib==0.7.4`; focused adapter/relation/local-ontology suites returned 31 passed, 4 warnings; strict OpenSpec validation passed. Official OAK docs confirm iterator-first behavior; the adapter supplies `SearchConfiguration.limit` and enforces a matching `islice` bound. Live `:8095` `/health` reports general `ok` but has no `oaklibSource` field; `/ontology/oaklib/search` remains HTTP 503. Compose contains the read-only OBO mount and source env values, but the running service has not loaded them. This confirms the iterator API is aligned while live OAK remains unconfigured. No task checkbox changed; no store writes occurred.
- Direct local route proof: Windows Python 3.13 with OAKLib 0.7.4 loaded the real repository OBO through the sidecar route and returned `ATLASPLAT:cuda`, `ATLASISA:ptx`, and `ATLASLANG:cuda_cpp` for exact labels at ontology SHA-256 `8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`. The response stayed `PROPOSAL_ONLY`, `canonicalAuthority=false`, `writesPerformed=false`. This proves local real-source adapter/API behavior, not live :8095 configuration or relation admission.
- Runtime freshness check: live `:8095` `/health` reports sidecar module `sha256:dd77bcfec41e0e1ce638315b340aee59fb148bbdd276d5b21c45998075f74c52`, while the checkout source is `sha256:5c2a08fd7606b6472072f43ab284f8b7c9e6cc4ae9f3eecdbc15561e85c6ada7`. The live response lacks `oaklibSource` and OAK search remains 503. Direct local OAK Mapping Provider returned no SSSOM mappings for the three custom CUDA concepts; local `relationships()` returned four asserted triples. This distinguishes a stale live runtime and absent cross-ontology assertions from the already-proven local bounded iterator/search code. No service lifecycle/database action or task checkbox change occurred.
- DOC-14 OAK Mapping Provider continuation (2026-11-23): the existing OAK adapter now uses bounded `sssom_mappings()` when supported and emits revision-bound, proposal-only mapping candidates. The review packet verifies mapping endpoint binding, ontology/producer revisions, evidence bounds, and confidence; outputs remain `SUGGESTED_REQUIRES_REVIEW` and never admit graph edges. Local OAK 0.7.4 route returned 3 concepts and 4 asserted relations; its Mapping Provider was available but yielded 0 mappings in the current custom vocabulary. Focused suites: 46 passed; py_compile and strict OpenSpec passed. Live :8095 still returns 503 `OAKLIB_SOURCE_NOT_CONFIGURED` with a stale runtime hash. No task checkbox or datastore changed.
- DOC-14 source-backed review proposal (2026-11-23): added `COMPILES_TO` / `TARGETS_PLATFORM` proposal support and generated `docs/reports/doc14-nvidia-cuda-ptx-relation-proposal-v1.json` from NVIDIA’s official CUDA guide. The exact normalized evidence span is bound to the capture hash and source revision; local OAK suggests `ATLASLANG:cuda_cpp` and `ATLASISA:ptx`, and reports the corresponding local ontology relation. This remains `PROPOSAL_ONLY`: the URL has no canonical packet (`find_source_refs` returned `NO_PACKET`), the live :8095 process is stale/503, human review is pending, and no PostgreSQL/Graphify admission, ACE readback, cache write, or task checkbox change occurred. Regression suites: 9 passed; Python compilation and strict OpenSpec validation passed. `git diff --check` reports one pre-existing trailing whitespace line in root `docker-compose.yml:167`; no cleanup was made.
- Reviewer follow-up (2026-11-23): the user explicitly approved the CUDA C++ `compiles_to` PTX relation for the review workflow. The decision is separately checksum-bound in `docs/reports/doc14-nvidia-cuda-ptx-human-review-v1.json`; it is not source-index admission, graph admission, ACE authorization, or permission to write canonical stores. DOC-14 remains open.
- Source-index gate recheck (2026-11-23): fresh Firecrawl capture of NVIDIA CUDA Programming Guide returned HTTP 200 and the exact NVRTC statement, but a read-only PostgreSQL 18 query found zero page rows for its URL. The existing external-doc writer is the canonical source admission owner and requires acquisition/extraction lineage plus transactional readback. No database write was attempted. With no current admitted source row or revision-qualified graph snapshot, graph admission and ACE use remain blocked; DOC-14 stays open.
- Live goal revalidation (2026-11-23): the running :8095 service now reports `SOURCE_CONFIGURED` for the pinned OBO revision and its module hash matches the checkout; live bounded OAK search/candidate calls return the CUDA C++ concept and `compiles_to` PTX ontology relation as proposal-only. This supersedes earlier notes that the current service remained `OAKLIB_SOURCE_NOT_CONFIGURED`. A fresh 12,893-byte NVIDIA capture was passed through live LangExtract 1.6.0 with explicit model ID `gemma4-legal-iq4xs-direct.gguf`; six output facts had exact UTF-8 byte alignment, but the requested CUDA C++→PTX relation was not among them. Separate live DSPy 3.5.0 `engine=lm15` Predict/JSON-schema capability succeeded against :8090 without ACE context. Live Atlas context still returns unadmitted candidates with missing source revisions and `proofUsable=false`. The approved review receipt remains `APPROVED_FOR_REVIEW_WORKFLOW` only; PostgreSQL source admission, graph admission and ACE proof remain open. Review data is still 36 pending/0 labels, 30 official pending decisions, empty golden draft, and three unreviewed preference seeds. Focused relation/OAK/DSPy/GEPA/recommender tests: 40 passed, 3 dependency warnings. No datastore writes, training, or task checkbox changes.
- Detailed current-state evidence: `docs/reports/doc14-live-oak-extraction-dspy-goal-audit-20261123.md`.
- Canonical source admission recheck correction (2026-11-23): a new PostgreSQL 18 read-only query finds one NVIDIA page and 12 canonical chunks (so the earlier `0 page rows` result is stale and superseded). The page `content_hash` equals the fresh normalized capture hash. The NVRTC sentence is present in canonical chunk `doc:nvidia-cuda-guide-doc14:494ef3b6ef26403:8`; complete chunk bytes match the normalized page slice, `chunk_checksum` matches, and the exact sentence matches both page bytes `[9290,9358)` and chunk-relative bytes `[1332,1400)`. Canonical page/chunk `evidence_revision` values differ from the normalized page content hash on the original review packet and must be carried as distinct revisions in the source-binding receipt. `atlas_ontology_relations` and `atlas_ontology_linked_tuples` remain 0 rows; `atlas_graph_snapshots_v2` has 2 `SUPERSEDED` snapshots, 0 non-null graph revisions, and no current revision-qualified graph for admission. Thus source page/chunk admission is proven; relation/graph admission and ACE proof remain open. No writes or task-checkbox changes occurred.
- DOC-14 canonical source-binding proof: added `python/atlas_graph_runtime/doc14_canonical_source_binding_v1.py` and `scripts/atlas/build-doc14-canonical-source-binding-v1.py`. The builder uses a PostgreSQL read-only transaction and binds the checksum-pinned user review to the exact page and chunk readbacks while preserving separate content/page/chunk revisions; it cannot authorize or admit the tuple. Its receipt is `docs/reports/doc14-nvidia-cuda-ptx-canonical-source-binding-v1.json`, status `CANONICAL_SOURCE_BINDING_VERIFIED`, graph revision count 0, tuple rows 0, relation rows 0. Focused tests: `python/tests/test_doc14_canonical_source_binding_v1.py` → 3 passed. The binding receipt is not Graphify admission or ACE proof; no task checkbox changed.
- DOC-14 continuation gate recheck (2026-11-23): the current structural-edge audit still returns `CONTRACT_INCOMPLETE` (`nodeCount=0`, `edgeCount=0`, `graphRevision=null`). A live ACE context request returns seven code-index cards, but `proofUsable=false`, `UNADMITTED_RETRIEVAL_CANDIDATES`, and `MISSING_SOURCE_REVISION`, so those cards are rejected before DSPy. Confirmed the existing DSPy path rejects caller `canonicalized=true` and requires server-owned manifest readback. The combined relation/OAK/DSPy/GEPA/RLM/source-binding suites pass 43 tests; strict OpenSpec validation passes. DOC-14/15 remain open; no graph/database/cache writes or task-checkbox changes.
- Graphify lifecycle readiness recheck (2026-11-23): `node scripts/atlas/audit-graphify-lifecycle-owner-v1.mjs` reports `OWNER_ROLES_IDENTIFIED` / `RECEIPTS_CONSISTENT`, but `eligibleForFreshRun=false`, 19 stale runs, 0 current runs, and blockers `CURRENT_RUN_NOT_ESTABLISHED` / `REPOSITORY_REVISION_NOT_CURRENT`. The opener is a PostgreSQL writer; it was not invoked. DOC-14 graph admission and ACE remain blocked on current revision-qualified graph evidence.
- Graphify revision reconciliation (2026-11-23): the read-only execution-owner plan found one completed candidate but `safeToApply=false` / no preferred execution. `plan-current-source-graphify-batch-v1.mjs` found 0 exact matches among 128 sources (110 revision/content mismatches, 17 ambiguous, 1 missing, 9 local-byte mismatches; source bytes not revalidated). Resolve and independently verify those bindings/current workspace revision before any lifecycle open or graph materialization. No Graphify or datastore writes occurred.
- DOC-14 goal resumption recheck (2026-11-23): reran the read-only graph/lifecycle/source-binding gates. The reviewed source remains byte-bound, but graph materialization remains unavailable (0 nodes/edges, null revision; 19 stale/0 current Graphify runs; 0/128 exact source matches). The user was asked for explicit authorization before running the full-workspace lifecycle writer; no write was performed and no checkbox changed.
- Dependency candidate safety follow-up (2026-11-23): `cli_find_dependencies_v1.py` no longer turns an unresolved or external import into an internal file edge, refuses ambiguous extension matches, and no longer fabricates a workspace revision by hashing the repository path. It emits lexical `importObservations`; graph edges require one unique workspace-local target and a caller-supplied SHA-256 workspace revision. Dependency results now include the target file's `dependencySourceRevision`. The focused Python suite passes 8/8. This local graph is still derived and noncanonical: no current Graphify snapshot or PG18 admission is proven, and no OpenSpec task checkbox changed.
- CSGR-2 relative import resolution follow-up (2026-11-23): the production structural-edge planning script now checks local relative import targets inside the workspace, reads back source and target hashes, rejects stale source bytes/missing revisions/ambiguous targets, and reports successful resolution as `REPO_TARGET_RESOLVED_LOCAL_ONLY` with `canonicalAuthority=false`. The report records at most 25 detailed resolution samples. Five focused Node tests pass, and a temporary synthetic-plan integration probe resolved `./target` to one in-workspace `.ts` file. The artifact's `workspaceRevision` is explicitly marked as supplied by the upstream plan and not independently reverified here; the current source plan still has 0 exact matches, so this does not prove a live current-corpus edge or Graphify admission. No task checkbox changed.
- Source-ref resolver integrity follow-up (2026-11-23): `findSourceRefs` now treats contradictory source/workspace revisions or content checksums under the same packet key as `IDENTITY_CONFLICT`, and only reports revision-qualified identity when every matched row has both source and workspace revisions. Identical duplicate packet readbacks remain acceptable. Added three regressions; `node --test scripts/mcp/atlas-tools-mcp.test.mjs` passes 47/47. A fresh live `find_source_refs` call resolves `scripts/mcp/atlas-tools-mcp.mjs` to one canonical packet with a source revision but `workspaceRevision=0`; test/report refs return `NO_PACKET`, so aggregate provenance remains `UNRESOLVED`. The connected MCP process has not reloaded the local patch; no packet/graph/database/cache write or task-checkbox change occurred.
- ACE/RAG boundary follow-up (2026-11-23): live ranked retrieval no longer constructs a model-ready `promptPacket` from unadmitted candidate cards. `buildGroundedRecommendationV1` now requires both explicit source and workspace revisions and returns both separately; source-revision-only candidates yield no evidence or patch targets. The focused MCP suite passes 48/48. Live packet readback still has `workspaceRevision=0`; no live ACE manifest, graph admission, service reload, or canonical/cache write was proven, so OpenSpec task states remain unchanged.
- Source-binding cohort classifier correction (2026-11-23): fixed the read-only classifier to count ambiguity only within the requested admitted workspace revision, while checking source revision and content digest on that exact row. Regression suite: 5/5 passed. Bounded live read-only classification of 20 source-plan rows against the admitted frame yielded 19 `REVISION_BOUND`, 1 `WORKSPACE_IDENTITY_ONLY`, 0 `AMBIGUOUS`; the cohort remains blocked because the source plan revision (`sha256:1c7fed...`) differs from the admitted workspace revision (`sha256:c63620...`), and local-byte reconciliation/current Graphify proof is still absent. No canonical writes or checkbox changes occurred.
- Admitted-snapshot Graphify comparison (2026-11-23): the read-only plan for 20 snapshot sources independently revalidated all current local bytes but found 0 current Graphify rows and 20 missing sources. A targeted `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts` query found a Graphify row matching the admitted snapshot identity but a local byte mismatch. The old Graphify row and admitted snapshot therefore do not represent the current checkout. The next graph gate remains a fresh operator-admitted workspace snapshot followed by the existing Graphify refresh/reconciliation. Receipts under `.tmp/atlas/current-admitted-source-graphify-plan-20-20261123.json` and `.tmp/atlas/current-admitted-orchestrator-graphify-plan-20261123.json`; no canonical writes/task completion.
- Live retrieval identity assessment follow-up (2026-11-23): `buildLiveAtlasContext` now detects same-key conflicting source/workspace revisions and checksums, makes missing packet keys explicit, and separately reports revision completeness. Regression covers a canonical same-key packet response with contradictory source revisions. MCP suite: 49/49 passed. Local patch is not loaded in connected MCP; live source revision/workspace and Graphify gates remain unresolved. No datastore writes or task checkbox changes.
- Workspace source handoff refresh (2026-11-24): the first candidate snapshot became stale for two files before derivation and correctly failed readback. A stable recapture then passed exact readback for 32,708/32,708 sources across 6 repositories; the existing workspace revision derivation produced candidate `sha256:cd24fdeaee38dcd3e1ad1b414ac3b48b1ea75ad57fe7f25904d9cf9343fe5b1f`. Read-only inventory hygiene selected 32,486 canonical-source candidates, and Graphify source selection returned `SOURCE_SELECTION_PLAN_READY_NOT_ADMITTED` with matching snapshot/revision/checksums. Final source-authority preflight passed all content, plan, inventory, and recurrence checks but blocked on `SNAPSHOT_MANIFEST_NOT_IN_CANONICAL_ADMISSION_STORE`; the candidate remains under `.tmp/atlas`, with null workspace revision, `authority=false`, and zero writes. The prior frame audit still has 0 current matches and structural Graphify has 0 nodes/edges. No snapshot was published, no graph/store write or task-checkbox change occurred. Receipts are under `.tmp/atlas/*20261124b.json`; see the production hardening scorecard and E2E plan for details.
- Domain-classifier request-path readback (2026-11-24): current live `/classify` returns `SHADOW_ONLY` with backend `sklearn-lr` and checkpoint revision `domain-classifier-nblr-v1-1788454983`; live `/health` module hashes match the mounted v2 and v1 checkout files. The synthetic auth/database sample is predicted `ui` with LR probability `0.5485384886535657`, so this proves execution only and is a counterexample to quality. A request without `sourceRef` returns HTTP 422. A fresh in-container `miniforge_nlp_sidecar.classify()` call agrees with the HTTP output. The checkpoint still warns of sklearn 1.7.0→1.7.2 version mismatch. Keep it shadow-only; no task checkbox changed, no training or persistent writes occurred. Details are in `docs/reports/production-hardening-todo-2026-11-23.md`.
- Domain-label review workbench repair (2026-11-24): `scripts/atlas/build-domain-review-sheet-v1.mjs` had duplicate `TOP_LEVEL`/`CHILDREN`/`OUTPUT` declarations and a duplicate `const have`, so Node could not parse it. Removed duplicate declarations, made explicit-input browser review state key off the full input SHA-256, and made explicit-input exports dataset-specific. `node --check` passed; the offline builder generated `docs/reports/domain-calibration-gold-v2-review-sheet-v1.html` from 455 rows (114 exact source-revision-bound). The source JSONL still has 455 legacy `REVIEWED` rows whose notes require independent human confirmation (114 `BINDING_EXACT`, 341 `UNRESOLVED`); the 120-row domain queue remains pending, and ranking labels remain blank. The generated HTML is a review aid only; no labels were approved, no canonical/database/cache/model writes occurred, and no task checkbox changed. Readiness and label semantics are detailed in `docs/reports/parent-atlas-e2e-production-plan-2026-11-23.md`.
- Gold-label trust gate correction (2026-11-24): the domain evaluator previously counted legacy rows with a reviewer name/timestamp as gold despite their notes requiring confirmation. `_has_human_review_provenance` now also requires explicit `reviewStatus=REVIEWED` and `reviewMethod=BLIND_HUMAN_REVIEW_V1`; the OKF exporter rejects legacy/visible-mode labels, and the review sheet records blind mode at the time of each decision. Fresh in-memory evaluation of the existing 455-row file now reports `NO_GOLD_LABELS`, 0 gold, 455 unverified. Focused classifier/symbol suites pass 28/28; OKF export tests pass 16/16; JS syntax checks and review-sheet generation pass. This enables trustworthy future review but does not create labels: all 455 rows remain pending independent blind human decisions, with 341 source revisions unresolved. No canonical/store/model writes or task-checkbox changes.
