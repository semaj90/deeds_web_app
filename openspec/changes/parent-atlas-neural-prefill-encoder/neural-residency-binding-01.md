# NEURAL-RESIDENCY-BINDING-01

Status: **ARTIFACT_PAIR_PROVEN / PREFILL_MANIFEST_BINDING_OPEN**

This note reconciles a stale cross-ledger status without creating a new FEAT-04 owner or format.

## Existing proven owner chain

The existing CandidateFeature/tensor-residency owners already provide:

```text
CandidateFeatureSnapshotV1
  -> scripts/atlas/build-feat04-envelope-v1.mts
  -> atlas.candidate-feature-gpu-feat04-envelope.v1
  -> scripts/atlas/prove-candidate-feature-gpu-residency.py
  -> atlas.candidate-feature-gpu-residency-proof.v1
```

The bounded real-CUDA receipt `docs/reports/candidate-feature-gpu-residency-proof-v4.json` records:

- status `CANDIDATE_FEATURE_GPU_RESIDENCY_BOUNDED_PROVEN`;
- RTX 3060 Ti execution;
- owner-process residency;
- one initial H2D transfer;
- zero H2D transfers during resident reuse;
- same-process reuse of the same resident tensor objects;
- ordinal, feature-value, feature-presence, lane-mask, and degraded-identity parity;
- post-release access blocked;
- `storeWrites=false`.

The receipt is bound to the existing 15-row lineage-qualified candidate snapshot:

```text
candidateSnapshotRevision
  lineage-qualified-canary:sha256:b19b04b6b19a1fe0cfd48d2fa9507f9e7055f9f3dfed277d2e3d5dea3303f4dc:v1:15

ordinalMapChecksum
  86fee5d38619d3065d8710942068f26fb5b0d3c09992b1b523083ae0a593d297

featureSnapshotChecksum
  0c28e7b42bfe7548f26dc2f693195e3c7bc5914dd4609904e408a81821254ada

gpuPackChecksum
  41948c52f2f7844c5733b926603e5722b664e82fb4a075272ae6a1a93483d963
```

Therefore the old statement that `NEURAL-RESIDENCY-01` is blocked because a FEAT-04 envelope is absent is stale.

## Remaining seam

The live neural-prefill `ContextManifest.identity` currently carries:

```text
candidate_ordinal_set_checksum
 evidence_revision_checksum
 ordinal_map_checksum
 retrieval_policy_revision
 ace_playbook_revision
 model_revision
 prompt_template_revision
 complete
```

but does **not** yet carry the FEAT-04 cohort keys required to prove that the manifest and the resident feature pack are the same candidate-feature snapshot:

```text
candidate_snapshot_revision
feature_snapshot_checksum
```

`ordinal_map_checksum` alone is insufficient to claim that exact FEAT-04 feature values/presence/masks belong to the manifest's selected cohort.

## Reconciliation rule

Do not create another FEAT-04 schema. The admission relationship is:

```text
existing CandidateFeatureSnapshotV1
       |
       v
existing FEAT-04 envelope
  candidateSnapshotRevision
  ordinalMapChecksum
  featureSnapshotChecksum
  gpuPackChecksum
       |
       v
existing real-CUDA residency receipt
       |
       v
NEURAL-RESIDENCY-BINDING-01
       |
       +-- exact candidate snapshot revision
       +-- exact ordinal map checksum
       +-- exact feature snapshot checksum
       +-- proven owner-process residency/reuse
       +-- post-release denial
       |
       v
ContextManifest / prefill shadow receipt
```

The audit owner is `scripts/atlas/audit-neural-residency-binding-v1.mjs`.

## Status vocabulary

```text
NEURAL_RESIDENCY_BINDING_BLOCKED
  FEAT-04/residency proof itself is invalid or mismatched.

NEURAL_RESIDENCY_ARTIFACT_PAIR_PROVEN_MANIFEST_UNCHECKED
  FEAT-04 and residency are internally aligned; no manifest was supplied.

NEURAL_RESIDENCY_ARTIFACT_PAIR_PROVEN_MANIFEST_BINDING_BLOCKED
  FEAT-04/residency are proven but the supplied manifest does not carry/match
  candidateSnapshotRevision + ordinalMapChecksum + featureSnapshotChecksum.

NEURAL_RESIDENCY_BINDING_PROVEN
  the manifest explicitly carries and exactly matches all three cohort keys.
```

## Promotion policy

Even `NEURAL_RESIDENCY_BINDING_PROVEN` remains non-authoritative:

```text
PREFILL_CALLER_MODE = SHADOW_READONLY
rankingPromotion    = false
canonicalAuthority  = false
```

It does not close `PREFILL-QUALITY-01`, does not authorize retrieval/ranking changes, and does not authorize any canonical datastore write.

## Next implementation step

Extend the existing manifest identity additively with nullable/optional fields:

```text
candidate_snapshot_revision
feature_snapshot_checksum
```

Populate them only when the caller possesses an exact validated CandidateFeatureSnapshot/FEAT-04 binding. Never derive or synthesize either value from packet order, Redis keys, Qdrant IDs, or the ordinal-map checksum.

Then run the existing residency executor against the exact bound FEAT-04 artifact and run:

```powershell
node scripts/atlas/audit-neural-residency-binding-v1.mjs `
  --feat04 <feat04-envelope.json> `
  --residency docs/reports/candidate-feature-gpu-residency-proof-v4.json `
  --manifest <context-manifest.json> `
  --output docs/reports/neural-residency-binding-v1.json
```

No production caller activation is part of this gate.
