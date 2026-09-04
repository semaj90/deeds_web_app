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
- [x] **DOC-06A** `EXTERNAL_DOC_POSTGRES_ADMISSION_01` — done, live-proven. Operator-directed,
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
- [ ] **DOC-03** Firecrawl bounded crawler — `EXISTS` (`fetch_firecrawl_v2`), verify
  bounded-crawl behavior (maxPages/maxDepth/sitemap-follow) matches the manifest's
  `maximum_pages`/`maximum_depth` fields; **blocked** on Firecrawl actually being registered
  (API key) — not required for Phase A/B, only for sources that need JS-rendering/recursive crawl
  beyond what a static BeautifulSoup fetch covers.
  - Read-only owner audit added at `scripts/atlas/audit-doc-03-firecrawl-bounded-owner-v1.mjs`.
    It confirms manifest page/depth/sitemap bounds, domain scope, and disabled external links/subdomains.
    Live Firecrawl registration/API-key proof remains blocked; no crawl or persistence was attempted.

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

  Composition follow-up: `scripts/atlas/prove-doc-symbol-nlp-dag-context-v1.mjs` confirms the
  indexed symbol/version owner, existing append-only `analysis_pass_results` owner, bounded
  `ParameterArtifactV1` checksums, and Ornith `:8090` synthesis boundary compose without a
  duplicate table or datastore write. This proves owner wiring only; current-pass selection,
  ContextManifest admission, and a live SynthesisReceipt remain separate gates.

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

- [ ] **DOC-14** Neo4j/cuGraph doc-relationship projection — `NEW` edges on existing graph infra:
  `API_SYMBOL -[DOCUMENTED_BY]-> DOC_SECTION`, `API_SYMBOL -[REQUIRES]-> CUDA_VERSION`,
  `API_SYMBOL -[SUPPORTS]-> ARCHITECTURE`, `EXAMPLE -[USES]-> API_SYMBOL`,
  `ERROR_PATTERN -[RELATED_TO]-> API_SYMBOL`. Reuses the existing Neo4j mirror + NetworkX/cuGraph
  owners. A bounded read-only Neo4j → NetworkX export preflight now passes through
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
  to fixture-proven only; live Neo4j admission remains required.
  parity-oracle pattern already established for code topology — no new graph store.

## Phase F — Agentic retrieval and repair loop

- [ ] **DOC-15** agentic docs retrieval fan-out — `EXTEND` the existing retrieval orchestrator
  (`src/lib/server/retrieval/orchestrator.ts` family) with the version/architecture-filtered branch
  from design.md's retrieval fan-out section — not a parallel orchestrator. The read-only owner
  audit `scripts/atlas/audit-doc-15-retrieval-fanout-owner-v1.mjs` confirms the existing hybrid,
  Postgres FTS, Qdrant, retrieval-orchestrator, and identity-resolution surfaces are present;
  report: `docs/reports/parent-atlas/doc-15-retrieval-fanout-owner-v1.json`. Same-query live
  fan-out replay and documentation-specific version/authority filtering remain open.
- [ ] **DOC-16** `AceRepairPacketV1` — `NEW` contract, `EXTEND` of the existing general ACE packet
  envelope pattern. A descriptor-only fixture proof now binds candidate snapshot, ordinal map,
  packet/source/evidence references, diagnostic and documentation-rule references while rejecting
  hidden thoughts, KV cache and tensor fields; see
  `scripts/atlas/prove-doc-16-ace-repair-packet-fixture-v1.mjs` and
  `docs/reports/parent-atlas/doc-16-ace-repair-packet-fixture-v1.json`. Live ACE composition,
  ContextManifest admission, and repair validation remain open.
- [ ] **DOC-22** `PatchTargetV1` — `NEW`. Fixture proof now binds `sourceRef`, exact UTF-8
  byte range, `baseSourceRevision`, expected/replacement byte checksums, and evidence references;
  stale base revision rejection and mutation=false are proven by
  `scripts/atlas/prove-doc-22-patch-target-fixture-v1.mjs`.
- [ ] **DOC-23** ast-grep repair planner — `EXTEND`. `ast-grep-observation-adapter.ts` exists for
  structural *observation*; the rewrite/patch-proposal half (pattern -> rewrite -> diff preview) is
  new, built on ast-grep's existing metavariable/YAML-rule rewrite mechanism, not a custom text
  editor. A fixture proof now binds an exact UTF-8 structural match to `baseSourceRevision` and
  emits a non-authorized proposal without mutation; see
  `scripts/atlas/prove-doc-23-ast-grep-repair-planner-v1.mjs` and
  `docs/reports/parent-atlas/doc-23-ast-grep-repair-planner-v1.json`. Live ast-grep execution,
  diff validation, and explicit mutation authorization remain open.
- [ ] **DOC-24** `PatchProposalV1` — `NEW`. Fixture proof now binds proposal ID, base source
  revision, patch digest, byte hunk, reasoning/analysis evidence, model/prompt revisions, and
  `mutationAuthorized=false`; see `scripts/atlas/prove-doc-24-patch-proposal-fixture-v1.mjs` and
  `docs/reports/parent-atlas/doc-24-patch-proposal-fixture-v1.json`. Live patch application remains
  out of scope until DOC-25 validation receipt passes.
- [ ] **DOC-25** compiler/test replay receipt — `EXTEND` of this repo's existing
  `ExecutionReceiptV1`-style receipt pattern (see `parent-atlas-retrieval-lineage-dag-convergence`
  ). Fixture validation now records proposal reference, validation checks, validation checksum,
  `patchApplied=false`, and `mutationAuthorized=false`; see
  `scripts/atlas/prove-doc-25-compiler-test-replay-receipt-v1.mjs` and
  `docs/reports/parent-atlas/doc-25-compiler-test-replay-receipt-v1.json`. Live isolated
  patch/compiler/test replay remains open.
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
  - Read-only fixture added: `scripts/atlas/prove-doc-26-incremental-recrawl-fixture-v1.mjs`.
    It proves unchanged bytes with a later timestamp are skipped, changed bytes are reprocessed,
    and a changed product version creates a new revision path while preserving prior rows.
    This does not close DOC-26: live manifest/crawler integration and durable readback remain open.

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
