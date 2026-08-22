# Parent Atlas real aligned-snapshot corpus proof

Status: **IMPLEMENTED_UNPROVEN / READ-ONLY PROOF TRANCHE**

This tranche closes two proof-input weaknesses without adding another retrieval,
clustering, or ranking algorithm:

1. Qdrant exact eligibility now has an explicit strict path. HNSW is allowed
   only when BOTH mean PyTorch↔Qdrant exact Top-K overlap and the minimum
   per-query exact overlap meet the configured floor.
2. The real semantic_768 proof input is exported from `atlas_packets.embedding`
   only after the current workspace manifest is independently matched against
   persisted Graphify `workspace_revision` + `code_source_revision` rows.

No Postgres/Qdrant/Neo4j/Valkey/GPU state is mutated by this proof tranche.
Local NDJSON/NPY/JSON proof artifacts are the only outputs.

## Qdrant exact fail-closed rule

```text
same frozen corpus
    ↓
PyTorch FP32 exact
    +
Qdrant exact
    ↓
per-query Top-K overlaps
    ↓
mean overlap >= floor
AND
minimum query overlap >= floor
    ↓
QDRANT_EXACT_ALIGNED
    ↓
HNSW ef sweep allowed
```

A strong mean cannot hide one bad query. If the minimum query misses the floor:

```text
QDRANT_EXACT_STORE_MISMATCH
HNSW requests = 0
```

Files:

```text
python/atlas_compute/qdrant_exact_alignment_gate.py
python/atlas_compute/qdrant_scoped_ann_strict.py
python/test_qdrant_exact_alignment_gate.py
python/test_qdrant_scoped_ann_strict.py
python/prove_aligned_snapshot_experiment_strict.py
```

The older evaluator remains untouched in this proof branch; the strict proof
entrypoint explicitly binds the real-corpus run to the strict evaluator.

## Real FrozenSemanticSnapshotV2 input

The export path is:

```text
current repository bytes
    ↓
WorkspaceRevisionRecordV1 + WorkspaceSourceBindingV1[]
    ↓ exact equality
persisted graphify_runs / graphify_files
    ↓
GraphifyWorkspaceManifestReceiptV1 complete=true
    ↓
atlas_packets.embedding
  representation_revision = requested revision
  source_representation_id = semantic_768
  source_dimension = 768
    +
graphify_files.code_source_revision
    ↓
revision-qualified NDJSON
    ↓
freeze_semantic_snapshot()
    ↓
atlas.frozen-semantic-snapshot.v2
```

`canonical_revision` is always `graphify_files.code_source_revision` and must
match `sha256:<exact source bytes>`. Git commit/file provenance is not accepted
as a substitute.

The exporter refuses:

- missing Graphify v2 columns;
- ambiguous/no persisted run for the current workspace manifest;
- incomplete persisted source coverage;
- missing or mismatched `code_source_revision`;
- non-768/non-finite embeddings;
- mixed/wrong representation revision;
- duplicate packet keys;
- fewer rows than the requested frozen corpus size.

Embedding provenance is deliberately labeled:

```text
ATLAS_PACKETS_CONTRACT_ONLY_NOT_HISTORICAL_MODEL_PROVENANCE
```

A 768-dimensional row is not promoted into a historical model-provenance claim.
Qdrant/embedding writer provenance remains a separate gate.

Files:

```text
sveltekit-frontend/scripts/atlas/export-frozen-semantic-snapshot-v2-input.mts
python/freeze_real_semantic_snapshot_v2.py
python/test_freeze_real_semantic_snapshot_v2.py
```

The freeze proof independently verifies:

```text
tensor_checksum
row_identity_checksum
canonical_order_checksum
dense ordinal sequence
canonical_revision format
source_ref presence
snapshot_revision readback
representation_revision readback
```

## Workstation proof order

First prove the pure semantic gates:

```powershell
cd C:\Users\james\Videos\deeds_web_app
python -m unittest `
  python/test_qdrant_exact_alignment_gate.py `
  python/test_qdrant_scoped_ann_strict.py `
  python/test_freeze_real_semantic_snapshot_v2.py
```

Then export one real bounded corpus from the non-mutating database path. Choose
the representation revision from independently-audited `atlas_packets`
provenance; do not guess it:

```powershell
cd C:\Users\james\Videos\deeds_web_app\sveltekit-frontend
npx tsx scripts/atlas/export-frozen-semantic-snapshot-v2-input.mts `
  --representation-revision=<PROVEN_REVISION> `
  --count=5000
```

Freeze and verify all v2 identities:

```powershell
cd C:\Users\james\Videos\deeds_web_app
python python/freeze_real_semantic_snapshot_v2.py `
  --export-receipt .tmp/aligned-snapshot/semantic-768-v2-export-receipt.json
```

Only after the freeze emits:

```text
FROZEN_SEMANTIC_SNAPSHOT_V2_PROVEN
```

run the aligned experiment through the strict entrypoint:

```powershell
python python/prove_aligned_snapshot_experiment_strict.py `
  --semantic-manifest .tmp/aligned-snapshot/semantic-768-v2-manifest.json `
  --spec <REAL_ALIGNED_SNAPSHOT_SPEC> `
  --output docs/reports/aligned-snapshot-experiment-v2.json `
  --envelope docs/reports/aligned-snapshot-proof-envelope-v2.json
```

The downstream experiment remains the existing sequence:

```text
PyTorch exact
→ cuVS exact overlap
→ CAGRA Recall@K
→ strict Qdrant exact alignment
→ HNSW ef sweep
→ soft KMeans
→ binary projection (comparison still separately incomplete)
→ SOM
→ N-ary sparse softmax / SpMM
→ ordered contextual tensor
→ FeatureSignalAlignmentV1
→ immutable proof envelope
```

## Not claimed by this tranche

- no historical EmbeddingGemma model artifact provenance proof;
- no Qdrant payload backfill or mutation;
- no binary-Hamming retrieval comparison yet;
- no CAGRA/TurboVec promotion;
- no production ranking change;
- no canonical authority change;
- no workstation test/run result from the GitHub connector.

Until the commands above run on the workstation, status remains
`IMPLEMENTED_UNPROVEN`.
