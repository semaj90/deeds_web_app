# External docs cold-ingestion proof ladder

Status vocabulary: `DONE`, `WRITTEN_UNPROVEN`, `IMPLEMENTED_UNPROVEN`, `PENDING`, `BLOCKED`.

## Ownership

- `docs/.okf/*` is the small checked-in domain/ontology/manifest surface.
- SeaweedFS S3 is the immutable bulky-artifact tier for raw HTML, normalized Markdown checkpoints, screenshots, PDFs, repository archives, Arrow archives, and Qdrant snapshots.
- Local POSIX/NVMe remains the live Qdrant storage tier.
- `external_programming_docs_768` remains the current retrieval owner until an explicit hybrid cutover receipt exists.
- `external_programming_docs_hybrid_768` is the shadow collection for `semantic_768 + lexical_bm25` migration.
- BM25 with IDF is the production lexical owner. BM42 remains an experimental challenger and does not add a second lexical evidence vote.
- Exact source/evidence promotion is required before claims, file mutations, or training-example promotion.

## Proof sequence

```text
EDC-0  external doc domain/ontology contracts             DONE
EDC-1  SeaweedFS artifact/citation/hydration contracts    WRITTEN_UNPROVEN
EDC-2  content-addressed upload + checksum hydration       WRITTEN_UNPROVEN
EDC-3  SvelteKit SeaweedFS runtime adapter                 WRITTEN_UNPROVEN
EDC-4  Firecrawl v2 multi-format capture                   WRITTEN_UNPROVEN
EDC-5  Qdrant capability + shadow collection proof         IMPLEMENTED_UNPROVEN
EDC-6  current-corpus shadow population                    PENDING
EDC-7  dense exact/top-k proof receipt                     IMPLEMENTED_UNPROVEN
EDC-8  BM25 retrieval proof receipt                        IMPLEMENTED_UNPROVEN
EDC-9  hybrid RRF retrieval proof receipt                  IMPLEMENTED_UNPROVEN
EDC-10 retrieval-owner cutover gate                        IMPLEMENTED_UNPROVEN
EDC-11 old Qdrant collection snapshot -> SeaweedFS         PENDING
EDC-12 cold hydration query fallback                       PENDING
EDC-13 deeds_lab archive upload + file-index Arrow          PENDING
EDC-14 Graphify daily incremental docs refresh             PENDING
```

`WRITTEN_UNPROVEN` means the typed contract/reference/test exists but no live execution surface is complete. `IMPLEMENTED_UNPROVEN` means a bounded executable runtime exists but has not yet produced a workstation/live PASS receipt.

## Firecrawl capture invariant

One page revision is represented by independent content-addressed artifacts:

```text
Firecrawl v2 scrape
  |
  +-- normalized Markdown --sha256--> SeaweedFS object
  +-- raw HTML -----------sha256--> SeaweedFS object
  +-- screenshot ---------sha256--> SeaweedFS object
  +-- links/change metadata -------> small receipt/manifest
```

The normalized Markdown checksum is the document-text identity used by the external-doc chunker. Screenshot-only changes do not force semantic re-embedding when Markdown text is unchanged.

Logical capture identity is deterministic over `source_id + source_revision + resolved_url + document_checksum`. Observation time (`fetched_at`) is telemetry and MUST NOT create a new logical identity for identical source content.

## Hydration invariant

```text
ColdArtifactHydrationRequestV1
  -> bounded S3 GET
  -> observed SHA-256
  -> exact equality with immutable artifact ref
  -> VERIFIED_READY
```

An S3 ETag is transport metadata only and cannot substitute for the SHA-256 evidence checksum.

## Qdrant compatibility invariant

Atlas uses Qdrant `1.10.0` as the minimum baseline for this specific production hybrid path because the path depends on sparse IDF plus Universal Query API hybrid fusion. Sparse-vector support in an older server is not sufficient by itself.

For Qdrant 1.19 and newer, the shadow collection uses per-structure memory tiers:

```text
semantic_768 vectors  -> cold
HNSW                  -> cold
lexical_bm25 index    -> pinned
payload               -> cold
```

For older supported servers, the collection builder uses the documented legacy equivalents (`on_disk` / `on_disk_payload`). Qdrant collection metadata is not used as Atlas ownership evidence; ownership/revisions live in Atlas manifests and receipts.

Version detection alone is not enough to admit BM25. `probeNativeBm25Inference()` MUST exercise an ephemeral shadow-only BM25 point/query and delete the point before the capability gate can report `READY`.

## Qdrant migration invariant

The current collection was created as a single unnamed dense-vector collection. Do not mutate it in place as the first hybrid experiment.

```text
external_programming_docs_768
          | current owner
          |
          +--------------------------+
                                     v
                    external_programming_docs_hybrid_768
                    semantic_768 (named dense, 768, cosine)
                    lexical_bm25 (named sparse, IDF)
                                     |
                        +------------+------------+
                        v            v            v
                    dense proof    BM25 proof   hybrid RRF proof
                        +------------+------------+
                                     v
                         ExternalDocsCutoverGateV1
```

Every changed point in the shadow collection MUST be written with both `semantic_768` and `lexical_bm25` in the same point operation. Unchanged points are not rewritten during incremental refresh.

## Retrieval proof invariant

EDC-7, EDC-8 and EDC-9 use one frozen `ExternalDocRetrievalFixtureSetV1`. Each query carries its expected relevant chunk IDs and source snapshot revision. Proof receipts record ranked chunk IDs, Recall@K and reciprocal rank.

All three cutover inputs MUST share:

```text
fixture_checksum
source_snapshot_revision
projection_revision
```

The executable evaluator additionally requires a `READY` capability gate, a proven hybrid shadow schema, and exact semantic query embeddings of dimension 768. It upgrades only the supplied shadow projection receipt to `VERIFIED`; it does not mutate the current retrieval owner.

The cutover gate blocks when any configured recall floor fails or when hybrid Recall@K is worse than the better single lane. The source collection remains non-deletable and must be snapshotted before any later retirement.

## Bounded runtime probes

Capability probe:

```bash
npx tsx scripts/docs-atlas/probe-external-doc-hybrid-runtime.mts
npx tsx scripts/docs-atlas/probe-external-doc-hybrid-runtime.mts --ensure-shadow
npx tsx scripts/docs-atlas/probe-external-doc-hybrid-runtime.mts --exercise-bm25
```

Modes:

```text
(no flags)          READ_ONLY
--ensure-shadow     create shadow collection only if missing
--exercise-bm25     create/verify shadow + temporary BM25 probe point
```

The script never mutates `external_programming_docs_768` and writes a revisioned JSON capability report. A blocked BM25 proof exits non-zero.

Retrieval proof, after EDC-6 emits a revision-qualified shadow projection receipt:

```bash
npm --prefix packages/parent-atlas run build

npx tsx scripts/docs-atlas/prove-external-doc-retrieval.mts \
  --fixture=docs/reports/parent-atlas/external-doc-retrieval-fixture.json \
  --projection=docs/reports/parent-atlas/external-doc-hybrid-projection.json \
  --capability=docs/reports/parent-atlas/external-doc-hybrid-capabilities-latest.json \
  --k=10 \
  --prefetch-k=50
```

The evaluator reuses the existing semantic-768 embedding endpoint/model configuration, sends exact named-dense and native BM25 queries, and sends hybrid Query API requests with dense + BM25 `prefetch[]` followed by RRF fusion. The resulting JSON contains the dense, BM25 and hybrid proof receipts plus `ExternalDocsCutoverGateV1`.

A blocked cutover is a valid evaluation result and exits with code 2. No retrieval-owner mutation occurs.

## Required live proof artifacts

Before EDC-10 can become runtime-proven, record:

- Qdrant server version and collection schema/capability probe.
- successful native BM25 shadow-only execution proof.
- SeaweedFS S3 endpoint/version capability probe.
- Firecrawl API/version used for capture.
- source snapshot revision.
- current and shadow point counts.
- dense Top-K overlap/Recall@K against the existing owner and/or exact semantic oracle.
- BM25 lexical fixture Recall@K / MRR.
- hybrid RRF Recall@K / MRR on the identical frozen fixture.
- observed SeaweedFS artifact checksums after roundtrip hydration.
- retrieval owner before/after.
- rollback path and old-collection snapshot artifact.

No test, upload, Qdrant mutation, or cutover is `DONE` merely because its contract exists.
