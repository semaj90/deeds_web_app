## Context

`RetrievalRouterFeatureRowV1` is produced in TypeScript and may be consumed by Python/PyTorch or XGBoost challengers. The row is revision/evidence metadata plus optional numeric signals; it is not itself a dense model tensor. The existing workboard explicitly assigns tensor flattening to Python and says no stable field order currently exists.

## Goals / Non-Goals

**Goals:** Freeze one deterministic, cross-language numeric field order; keep identity and evidence metadata out of model features; distinguish a missing nullable value from a real zero; provide a pure Python flattening adapter and fixture tests.

**Non-Goals:** No training, GPU execution, model promotion, SearchRuntime lane changes, database writes, migrations, or canonical feature-authority changes.

## Decisions

1. Store the ordered field-path contract as JSON beside the Python compute package. Python consumes it directly; the TypeScript contract test reads the same file and checks every declared path against a real row built by the production builder. This avoids maintaining two independent order lists.
2. Encode nullable numeric scalars as `(value-or-zero, present-bit)`. Encode the optional `latent.vector` as its fixed 64 values (zero-filled when absent) followed by one presence bit. This preserves fixed tensor width without conflating missing data with a measured zero.
3. Encode booleans and bit masks as numeric 0/1 values. Exclude canonical identity, revision strings, categorical IDs/text, free-form tags, digests, and receipt references; these remain metadata and must not become model features by accidental JSON traversal.
4. The Python adapter is a CPU pure function returning a fixed-width tuple. It validates types, finite numbers, and declared array lengths and performs no tensor allocation or device selection.
5. The field-order contract is a challenger input-layout contract, not representation authority. Its revision/checksum must accompany any downstream experiment receipt; this task does not authorize training or promotion.

## Risks / Trade-offs

- A fixed layout requires a new contract revision for field additions/reordering; mitigate by making the JSON revision explicit and testing cross-language agreement.
- Zero-fill alone would hide missingness; mitigate with a presence bit for every nullable field.
- A contract-valid flattened row is not evidence that the source observations are eligible or current; keep existing lineage admission gates upstream.

## Migration Plan

No database or cache migration. The contract and adapter can be rolled back as local code/artifacts without changing persisted rows. Future field changes require a new contract revision and parity fixtures before use.

## Open Questions

- Which downstream challenger (PyTorch or XGBoost) first consumes this layout, and what receipt schema will bind its input checksum?
- Should categorical ontology/community fields later receive a separately versioned encoding, rather than being added to this numeric-only layout?
