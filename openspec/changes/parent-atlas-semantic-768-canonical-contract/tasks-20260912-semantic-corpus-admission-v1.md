# Temporal addendum — semantic corpus admission vs evaluation QRELS

Date: 2026-09-12
Owner: `parent-atlas-semantic-768-canonical-contract`
Policy: append-only temporal evidence; do not rewrite historical ledgers.

## Finding

`docs/reports/current-semantic768-corpus-manifest-plan-v1.json` is schema
`atlas.evaluation-corpus-manifest-v1`. It contains `querySetHash`,
`judgmentSetHash`, `queryCount`, and a human-grading next step. Therefore it is
an evaluation/promotion manifest, not the representation-lineage artifact ACE
needs merely to consume a revision-qualified semantic score in read-only
shadow mode.

The two gates are now explicitly separated:

```text
CURRENT SEMANTIC REPRESENTATION ADMISSION
  current CandidateOrdinalMap
    -> exact atlas_packet_chunk_lineage
    -> exact atlas_workspace_source_bindings
    -> codebase_chunk_index.content_embedding
    -> deterministic input/vector checksums
    -> SemanticCorpusManifestV1
    -> semantic-bound CandidateOrdinalMap
    -> ACE shadow

EVALUATION / PROMOTION
  frozen query set
    -> reviewed human grades
    -> judgmentSetHash
    -> nDCG/MRR/recall/repair/token-cost evaluation
    -> explicit ranking/promotion decision
```

Human relevance judgments remain mandatory for quality promotion. They are
not required to identify an existing semantic representation revision for a
bounded read-only ACE shadow proof.

## Superseded assumptions

The historical `SEM768-ADMISSION-DRY-01` report remains immutable evidence, but
several of its structural blockers are no longer current:

- canonical chunk identity is now available through
  `atlas_packet_chunk_lineage` at `revision_status='PROVEN'`;
- exact source/workspace revision binding is now available through
  `atlas_workspace_source_bindings`;
- `SemanticRepresentationV1` now recognizes both full `sha256` and the proven
  repo convention `sha256(content).slice(0,16)` (`sha256_16`) as qualified
  input-digest algorithms.

Do not edit or delete the historical report. Re-run admission through the new
current-lineage auditor instead.

## New implementation

- `sveltekit-frontend/src/lib/server/atlas/embedding/semantic-corpus-manifest-v1.ts`
  - representation-only manifest;
  - deterministic `representationRevision` derived from workspace, ordinal-map,
    identity, source-revision, input-digest, and vector checksums;
  - `coverageScope = FULL_ORDINAL_MAP | BOUNDED_SUBSET`;
  - `qualityJudgmentsRequired=false`;
  - `qualityPromotionEligible=false`;
  - model/tokenizer provenance remains independently reportable.

- `sveltekit-frontend/src/lib/server/atlas/embedding/semantic-bound-ordinal-map-v1.ts`
  - derives a new ordinal-map snapshot without renumbering candidates;
  - preserves canonical IDs and ordinals;
  - populates `semanticRevision` only for admitted corpus members;
  - original ordinal map remains immutable.

- `scripts/atlas/audit-current-semantic-corpus-v1.mts`
  - repeatable-read, read-only Postgres audit;
  - joins the current ordinal map to proven packet/chunk lineage and exact
    workspace/source bindings;
  - validates 768 dimensions, finite vector, nonzero/L2-normalized norm,
    `sha256` / `sha256_16` content digest, and deterministic Float32LE vector
    checksum;
  - emits members + semantic-bound ordinal map only as local artifacts;
  - no Postgres/Qdrant/Neo4j/Valkey/model/projection writes.

- `semantic-corpus-manifest-v1.spec.ts`
  - deterministic manifest proof;
  - bounded/full scope semantics;
  - semantic-bound ordinal preservation;
  - mismatched canonical identity rejection.

## Gate semantics

A successful bounded audit may report:

`CURRENT_SEMANTIC_CORPUS_BOUNDED_SHADOW_READY`

This authorizes only a bounded read-only ACE shadow using selected ordinals
that belong to the admitted semantic cohort. It does **not** authorize ranking
promotion, corpus mutation, Qdrant ownership changes, or production caller
migration.

A full-map result may report:

`CURRENT_SEMANTIC_CORPUS_FULL_SHADOW_READY`

Even this remains `qualityPromotionEligible=false` until the separate QRELS
quality gate is completed.

Any row with missing/mismatched current lineage, source/workspace revision,
input digest, vector dimension/norm, or vector evidence remains excluded and
is reported as a blocker. Missing evidence is never synthesized.

## Current status

```text
ACE query selection / ServerFeatureBundleV2    IMPLEMENTED / workstation proof pending
current semantic corpus manifest contract      IMPLEMENTED / workstation proof pending
semantic-bound ordinal derivation              IMPLEMENTED / workstation proof pending
current semantic corpus live auditor           IMPLEMENTED / live run pending
human QRELS                                    STILL REQUIRED FOR QUALITY PROMOTION
ontology current-workspace evidence             PARALLEL / NOT ACE SEMANTIC SHADOW BLOCKER
```

No canonical datastore, vector store, graph store, cache, model, ranking, or
projection mutation was performed by this implementation.
