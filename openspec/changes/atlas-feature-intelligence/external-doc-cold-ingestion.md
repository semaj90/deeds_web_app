# External docs cold-ingestion proof ladder

Status vocabulary: `DONE`, `WRITTEN_UNPROVEN`, `PENDING`, `BLOCKED`.

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
EDC-5  shadow Qdrant semantic_768 + BM25 collection        WRITTEN_UNPROVEN
EDC-6  current-corpus shadow population                    PENDING
EDC-7  dense exact/top-k parity                            PENDING
EDC-8  BM25 retrieval evaluation                          PENDING
EDC-9  hybrid retrieval evaluation                        PENDING
EDC-10 retrieval-owner cutover receipt                     PENDING
EDC-11 old Qdrant collection snapshot -> SeaweedFS         PENDING
EDC-12 cold hydration query fallback                       PENDING
EDC-13 deeds_lab archive upload + file-index Arrow          PENDING
EDC-14 Graphify daily incremental docs refresh             PENDING
```

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

## Hydration invariant

```text
ColdArtifactHydrationRequestV1
  -> bounded S3 GET
  -> observed SHA-256
  -> exact equality with immutable artifact ref
  -> VERIFIED_READY
```

An S3 ETag is transport metadata only and cannot substitute for the SHA-256 evidence checksum.

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
                    dense parity   BM25 eval   hybrid eval
                        +------------+------------+
                                     v
                              CUTOVER RECEIPT
```

Every changed point in the shadow collection MUST be written with both `semantic_768` and `lexical_bm25` in the same point operation. Unchanged points are not rewritten during incremental refresh.

## Required live proof artifacts

Before EDC-10 can become `DONE`, record:

- Qdrant server version and collection schema probe.
- SeaweedFS S3 endpoint/version capability probe.
- Firecrawl API/version used for capture.
- source snapshot revision.
- current and shadow point counts.
- dense Top-K overlap/Recall@K against the existing owner and/or exact semantic oracle.
- BM25 lexical fixture accuracy/Recall@K.
- hybrid evaluation metrics.
- observed SeaweedFS artifact checksums after roundtrip hydration.
- retrieval owner before/after.
- rollback path.

No test, upload, Qdrant mutation, or cutover is `DONE` merely because its contract exists.
