# Semantic_768 canonical and MRL truncation alignment

Status: `IMPLEMENTED_UNPROVEN`

## Decision

`semantic_768` from EmbeddingGemma is the only canonical dense semantic representation and the only dense representation eligible for the active Qdrant semantic collection. The 512, 256, and 128 forms are deterministic Matryoshka prefixes derived from that vector and L2 re-normalized after truncation:

```text
EmbeddingGemma native output
        semantic_768 / 768
          |       |       |
      MRL 512  MRL 256  MRL 128
      prefilter routing routing
```

They are not separate model owners, do not receive independent RRF votes, and do not authorize canonical identity or source-revision changes.

## Compatibility boundary

The merged `semantic_512` graph/GPU scripts remain migration-only until rebuilt from a revision-qualified `semantic_768` corpus. Their existence does not prove the 768 live graph or Qdrant projection. No 512 collection, 512 Qdrant write, or 512 production cutover is authorized by this alignment.

## Required truncation proof

- source vector is exactly 768, finite, and L2-normalized;
- derived dimensions are exactly 512, 256, or 128;
- each derived vector is independently L2 re-normalized;
- representation lineage names `semantic_768` as the source;
- recall/overlap/MRR is measured against the 768 exact oracle;
- Qdrant, cuVS, TurboVec, KMeans, SOM, and Valkey remain executors or derived routing projections.

## Promotion state

The TypeScript contract and deterministic MRL unit tests may become `PROVEN` locally. Qdrant lineage, live graph/GPU, and production retrieval remain `NOT_PROVEN` until workstation receipts are produced.

The follow-up sweep aligned the active Qdrant scorer, admin synthesis exact-rescore path, ACE code-intel projection boundary, retrieval-router feature row, cluster feature projection, and external-document projection to `semantic_768`. Historical `semantic_512` clients and fixtures remain migration-only and are not selected by canonical retrieval.
