# DOC-14 span publication integrity

Date: 2026-11-22

## Result

The relation-candidate writer now validates the complete candidate batch against the persisted normalized-document bytes before replacing `relation-candidates.jsonl`. The trusted checksum is taken from the normalized artifact readback, not from the extracted candidate. Publication uses a same-directory temporary file, verifies its bytes, atomically replaces the JSONL, and reads the result back.

## Verified checks

- `C:\Python313\python.exe -m pytest python/test_atlas_okf_docs_pipeline.py python/test_atlas_external_docs.py -q` — **22 passed**.
- Adversarial multibyte span mutation — candidate batch rejected; prior JSONL bytes unchanged.
- Adversarial normalized-source mutation while retaining the claimed source revision — candidate batch rejected; prior JSONL bytes unchanged.
- Fetch/readback checksum mismatch — rejected before candidate publication; prior JSONL bytes unchanged.
- `node scripts/atlas/gan-validation-hook.mjs` — **PASS**, 349 ledger rows: 69 done, 62 partial, 218 open. This is the hook census, not proof of live DOC-14 admission.
- `openspec validate parent-atlas-versioned-doc-intelligence --strict` — valid.
- Follow-up direct validator coverage: `C:\Python313\python.exe -m pytest python/tests/test_atlas_doc14_span_integrity_v1.py -q` — **5 passed**; WSL2 `atlas-rapids-cu13` same test — **5 passed**. Coverage includes Unicode byte offsets, stale capture checksum, corrupt byte span preserving the previous JSONL, missing chunk boundary rejection, and successful atomic publish/readback in a temporary directory.
- Proposal-shape follow-up: Stanza relation outputs now include explicit `status=PROPOSED`, role-separated subject/object mention candidates, `extractor_version`, and noncanonical status. The fake-pipeline contract test plus publication, external-doc, and pipeline suites passed **28/28** on Windows; the proposal-shape and span-integrity suites passed **6/6** in WSL2. Pipeline artifact assertions verify these fields survive JSONL publication. The fake pipeline verifies output shape only; it is not a live Stanza model run or semantic relation validation.

## Scope and remaining proof

This is fixture-level validation and local artifact publication only. A live producer run is currently blocked: local Python 3.13 and both inspected WSL GPU environments lack the `stanza` package; the reachable `:8095/health` reports spaCy POS and LangExtract capabilities, not Stanza. No package/model was installed and no Firecrawl call was made. No canonical source-index revision readback, ontology review, Graphify admission, PostgreSQL mutation, ACE/Valkey publication/readback, centroid generation, or CUDA work was performed. DOC-14 remains open. Normalized-document byte spans must not be represented as original HTML offsets.

Changed files: `python/atlas_doc14_span_integrity_v1.py`, `python/atlas_external_docs.py`, `python/atlas_okf_docs_pipeline.py`, `python/test_atlas_okf_docs_pipeline.py`, `python/tests/test_atlas_doc14_span_integrity_v1.py`, `python/tests/test_stanza_relation_candidate_shape_v1.py`, and `openspec/changes/parent-atlas-versioned-doc-intelligence/tasks.md`.

## Follow-up contract hardening and environment clarification

- The validator now rejects candidates that self-label as admitted, claim canonical authority, omit an extractor revision, or mix subject/object mention roles. Stanza-shaped outputs carry explicit `PROPOSED` status and remain noncanonical.
- Latest focused verification: Windows Python 3.13 passed `python/tests/test_stanza_relation_candidate_shape_v1.py`, `python/tests/test_atlas_doc14_span_integrity_v1.py`, `python/test_atlas_external_docs.py`, and `python/test_atlas_okf_docs_pipeline.py` (**32 passed**). WSL2 `atlas-rapids-cu13` passed the two contract suites (**10 passed**).
- Existing `lsp_utf16_to_utf8_byte_offset` in `python/atlas_compute/ast_chunk_routing_helpers.py` converts LSP UTF-16 line/column positions to strict UTF-8 byte offsets and rejects split surrogate pairs. This is a separate source-position helper; the DOC-14 Stanza validator converts character spans against the exact normalized text. Do not conflate either with offsets into original fetched HTML.
- The taxonomy crosswalk report is `CROSSWALK_VALIDATED`, conservation passed, revision pinned, with 13 top-level and 4 child taxonomy entries. Its label crosswalk has unresolved/ambiguous labels; it does not create ontology-linked tuples or admit DOC-14 relations.
- The repository-wide source-binding observer is not a full-disk index or canonical admission. A broad filesystem inventory may count generated/vendor/ignored files; the observer binds source-like files and only emits an origin-candidate report. Current source identity remains noncanonical until the existing source-index admission and readback path publishes it.
- A bounded Stanza 1.15.1 CPU run is separately proven by `docs/reports/doc14-live-stanza-proof-20261122.json`: 8 of 56 chunks parsed, 18/18 proposal spans independently read back, deterministic JSONL replay, and adversarial offset mutation rejected while preserving the prior artifact. This is a captured Firecrawl MCP document supplied to the existing pipeline; it does not prove the current :8095 runtime provides Stanza or that local :8095 Firecrawl is configured (its `/evidence/web` returned `FIRECRAWL_NOT_CONFIGURED`).
- Configured OAK source, reviewed tuple admission, current Graphify structural edges, current admitted ACE ContextManifest, repair-worker HTTP inference, and Valkey write/readback remain unproven. The Stanza run made no canonical database or cache writes.

## OAK relation-review handoff

- Added `python/atlas_graph_runtime/doc14_relation_oak_review_v1.py` to join a span-verified relation candidate to the existing OAK label-search response. It checks OAK authority/revision consistency, binds exact subject/object mentions to bounded candidate IDs, preserves ambiguity and unresolved roles, and surfaces only existing OAK relation rows whose endpoints match the suggestions.
- The output is a review packet with an evidence checksum and proposal checksum. Parent Atlas `ontologyIds` remains empty; no Atlas predicate mapping, canonical concept, relation admission, graph write, or cache write is inferred.
- Wired the existing `write_source_artifacts()` publisher to accept supplied, per-chunk OAK responses and write/read back `relation-oak-review.jsonl`. Missing or malformed OAK responses remain explicitly unresolved/rejected. The default path makes no OAK request and no canonical write.
- OAK relation rows are also bounded and must be `PROPOSED`, noncanonical, and pinned to the same OAK ontology/producer revisions; oversized result envelopes fail closed. The OAK bridge and publisher tests use fixture OAK responses; this is integration contract proof, not live ontology mapping.
- Added an opt-in `--oak-review --oak-sidecar-url <base>` path to the existing docs pipeline. It makes bounded read-only calls to `/ontology/oaklib/search` and `/ontology/oaklib/candidates`, requires consistent ontology/producer revisions, caps terms/results, and keeps per-chunk failures unresolved. It is disabled by default and accepts no canonical write flags.
- Current sidecar probe: `GET :8095/health` returned `ok`; a bounded `POST /ontology/oaklib/search` for `Foo` returned HTTP 503 `OAKLIB_SOURCE_NOT_CONFIGURED`. Thus the live OAK resource is still not configured. Final focused verification after adding the opt-in caller: Windows **39 passed**, WSL2 `atlas-rapids-cu13` **18 passed**. Live mapping/admission remains blocked on OAK configuration and reviewer decisions.
