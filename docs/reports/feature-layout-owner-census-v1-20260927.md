# Feature layout owner census v1 — 2026-09-27

Status: read-only source audit; no feature order, model, database, or cache was changed.

## Finding

There is not one universal feature-column ABI. At least five distinct layouts are present, and they must remain separately revisioned:

| Layout | Owner / evidence | Width | Meaning |
|---|---|---:|---|
| Static packet `FeatureVector5` | `sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts` and `contracts/feature-vector-5.ts` | 5 | authority/domain/AST/entropy/execution packet values |
| Retrieval candidate matrix | `sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts` | 25 | ephemeral `[C,25]` float32 values plus `[C,25]` presence mask; not the 12-column CandidateFeatureSnapshot |
| CandidateFeatureSnapshot scalar ABI | `sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-columnar-v1.ts` | 12 | semantic/retrieval scalar features in `CANDIDATE_SCALAR_FEATURES` |
| Retrieval-router flatten ABI | `python/atlas_compute/retrieval_router_feature_order_v1.json` + `router_feature_flatten.py` | 29 typed descriptors → 173 numeric slots | mixed scalar, vector, bit-array, and nullable value/presence encoding |
| XGBoost Python sidecar ABI | `xgboost-sidecar-feature-admission-v1.ts` mirrors the Python sidecar | 16 | legacy/model-specific inputs; explicit projection task remains open |

The existing `retrieval-router-to-candidate-feature-snapshot-v1.ts` is an explicit router-row → snapshot adapter. It checks row count, ordinal uniqueness, packet/canonical identity, workspace and graph revisions, and lane masks; unavailable snapshot fields are currently emitted as `null`. This is a layout-specific adapter, not evidence that all layouts share semantics or that a universal tensor ordinal exists.

## Ownership decision

- Preserve each layout's ordered columns and revision independently.
- Feature semantic identity and producer/normalization/missing-policy metadata belong in a shared feature-definition contract, if one is established.
- Consumer-specific order belongs to each `LayoutRevision`; adapters must name source and target revisions and explicitly define every mapped, derived, or unavailable field.
- No positional coercion, implicit aliasing, or default-zero substitution across layouts.
- The source search found no shared `FeatureDefinitionV1` registry in the relevant Atlas/retrieval/compute owners. This is a scoped census finding, not proof that no similarly purposed metadata exists anywhere in the repository.

## Evidence / validation

- `CANDIDATE_SCALAR_FEATURES.length = 12`.
- `CANDIDATE_FEATURE_NAMES.length = 25`; matrix builder declares `F = 25`.
- `STATIC_PACKET_FEATURE_NAMES.length = 5` and the builder materializes `FeatureVector5`.
- Router order JSON has 29 descriptors. Recomputing its declared flatten widths and nullable presence slots gives 173 numeric dimensions.
- Sidecar ABI list has 16 names; existing admission rejects feature-order/checksum mismatch. Snapshot-to-sidecar projection remains an open task.
- No data-store access, model inference/training, or writes were performed.

Next bounded gate: define and test a semantic feature-definition contract without changing any existing layout; then add only explicitly needed layout adapters with exact source/target revision bindings.
