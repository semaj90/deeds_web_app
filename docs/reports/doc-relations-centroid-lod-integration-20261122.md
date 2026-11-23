# Document Relations, Centroids, and LOD Integration

**Status:** PARTIAL — source-grounded relation candidates are now emitted with chunk evidence bindings; Graphify admission, centroid publication, and SSR-to-CSR residency remain open.

## Work completed in this pass

- `python/atlas_external_docs.py::stanza_observations()` now carries predicate and relation-envelope character spans for Stanza candidates, along with producer/model revisions.
- `chunk_document()` qualifies each valid candidate against the exact chunk ID, source ID/revision, normalized document checksum, `NORMALIZED_DOCUMENT_UTF8_BYTES` interval, evidence text/checksum, and extraction revisions. These coordinates address persisted normalized text, not raw fetched HTML or original response bytes. Candidates have empty `ontology_ids`, `PROPOSAL_ONLY`, and `canonical_authority=false`; invalid/missing spans are `UNBOUND_EVIDENCE`.
- `python/atlas_okf_docs_pipeline.py::compile_chunks()` already calls this extractor when Stanza is enabled. `write_source_artifacts()` serializes the `ChunkRecord` objects to `chunks.jsonl` and now emits a deterministic `relation-candidates.jsonl` beside it. The relation artifact records source/chunk revisions and hashes, proposal data, bound/unbound counts, and its whole-file checksum. This wires batch output only; it does not admit relations.
- `write_source_artifacts()` now preserves the fetched Markdown artifact and writes a separate normalized Markdown artifact with a URL-derived disambiguator and checksum. Before serializing proposals, it rereads those file bytes and checks page/chunk checksums, source URL and revision, UTF-8 boundaries, chunk bounds, and evidence text/checksum. It also rereads the completed relation JSONL and fails closed on byte mismatch. Mismatches are labeled `REJECTED` with a reason; only a matching span becomes `SPAN_READBACK_VERIFIED` / `PROPOSAL_ONLY`.
- Span-verified candidates now enter the existing `atlas_external_doc_hypergraph.py` proposal builder. It emits only `PROPOSAL_ONLY` output with `graph_revision=null`, deterministic tuple-scoped `mention:` participant IDs, `UNMAPPED_VERB:*` predicates, empty ontology/concept IDs, and `UNMAPPED_REVIEW_REQUIRED`. The adapter requires a caller-pinned workspace revision and verifies source page bytes and chunk identity; it does not invent a reviewed mapping or admit a graph edge.
- Chunks with extracted API signatures now also pass through the existing `atlas_graph_runtime.api_document_fact_v1` extractor into a separate `api-document-facts.jsonl`. Its `DOCUMENTED_BY` proposals carry chunk-local UTF-8 spans and remain `PENDING` with null ontology revision/object reference. Unqualified source revisions are recorded as blocked; no relation is auto-approved.
- Focused verification passed: **29 tests** across `python/test_atlas_external_docs.py`, `python/test_atlas_external_doc_hypergraph.py`, `python/test_atlas_okf_docs_pipeline.py`, and `python/tests/test_api_document_fact_v1.py`. Coverage includes non-ASCII UTF-8, multiple pages under one source revision, corrupted-span rejection, proposal-only hypergraph output, and API-fact pending status/span readback. Python syntax compilation, strict OpenSpec validation, and `git diff --check` also passed. No live Firecrawl/Stanza batch, database/cache write, Graphify admission, CUDA job, or browser run was performed.
- Read-only Atlas context lookup returned `MISSING_SOURCE_REVISION` and `UNADMITTED_RETRIEVAL_CANDIDATES`; it was used only to locate candidate owners. The integration conclusions above come from local source and focused tests, not that retrieval result.
- The owning DOC-14 and DOC-BATCH ledger now records the exact evidence boundary and the still-open downstream requirements. No checkbox was promoted.

## Observed owners and first blockers

| Stage | Existing owner | Current state | First blocker |
|---|---|---|---|
| Relation extraction | `atlas_external_docs.py::stanza_observations` | Candidate tuples with exact chunk/page span binding when Stanza is enabled | No reviewed canonical ontology-ID mapping or admitted relation type |
| Document batch output | `atlas_okf_docs_pipeline.py::compile_chunks` / `write_source_artifacts` | `chunks.jsonl`, span-verified `relation-candidates.jsonl`, proposal-only hypergraph output, and pending API-doc facts | Bounded real batch and canonical mapping/admission remain unproven; local output is not PostgreSQL admission or Graphify incidence |
| Daily Graphify | `graphify-daily-ace-packet-step-v1.mjs` and existing Graphify coordinator | Current ACE step checks admission and counts eligible packets | It explicitly reports packet composition not wired; code Graphify snapshot is not a document relation graph revision |
| Centroid calculation | `atlas_okf_docs_pipeline.py::compute_cluster_features` | Existing KMeans call returns centroids, but the pipeline discards that output (`_centroids`) | No frozen CandidateOrdinal map + durable `CentroidArtifactV1`/manifest/readback path for this document cohort |
| Centroid Valkey publication | `centroid-artifact-v1.ts`, `ace-bitfrost-cache-identity-v1.ts`, existing legacy centroid cache | Artifact and descriptor contracts exist | Revision-qualified prepare/checksum/publish/readback and cache identity reconciliation remain open; no new writer was added |
| L2/L3 residency | `context/lod-ladder-v1.ts::expandLOD` | Generic async expansion helper exists | Only a fixture caller was found; no production authorized loader, cancellation/stale-response fence, byte budget, reference-counted eviction, or SSR-to-CSR handoff |

## Validation and side effects

- No Firecrawl/Stanza batch, daily Graphify run, CUDA job, database operation, or Valkey write was run in this pass.
- `git diff --check` on the changed Python source, tests, OpenSpec ledger, and report returned no whitespace errors; Git reported only its LF-to-CRLF conversion warning for the existing ledger file.
- No ACE packet, Graphify graph revision, canonical ontology tuple, or centroid cache upsert is claimed.

## Ordered next gates

1. Extend adversarial tests for missing parser offsets, malformed candidate structures, and repeated text, then run a bounded Stanza-enabled batch against a frozen official-doc cohort. Raw-source byte mapping requires a separately pinned reversible normalizer map.
2. Add a reviewed mapping owner for supported DOC-14 predicates and participant concepts; keep current unmapped proposals pending until a mapping revision and reviewer authority are available.
3. Route admitted tuples through the existing graph admission owner and define a separate document-graph revision over PostgreSQL-admitted chunks. Do not reuse the code Graphify revision as document graph authority.
4. Preserve the current KMeans centroid output for an admitted, frozen candidate snapshot; build and independently read back centroid artifacts/manifests using the existing owner. L2 output requires a pinned and parity-qualified transform; L3 uses the exact canonical `semantic_768` revision.
5. Add only the revision-qualified cache descriptor publication path after durable artifact readback and existing write authorization. Require idempotent prepare/checksum/publish/readback and stale/invalidation behavior before daily wiring.
6. Wire SSR to compact authorized manifests/cards and CSR to on-demand, abortable L2/L3 loads. Enforce byte budgets, revision checks, single-flight loads, and disposal when the final consumer releases the resource. Keep hidden model state and KV cache out of storage.
7. Prove the full daily batch, Graphify, centroid descriptor, ACE-context, and browser-residency path before marking the related OpenSpec rows done.
