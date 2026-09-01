## Why

ACE/BitFrost currently has no defined execution primitive for reorganizing large fetched-candidate
sets (thousands of packets already returned by cuVS ANN / cuGraph / lexical fusion) into contiguous
hot/warm/cold runs before GPU tensor materialization. Radix sort is a strong fit for this job, but
without an explicit contract it risks being bolted on as an ad-hoc ranking pass — becoming a second,
uncoordinated retrieval-ranking owner alongside the existing cuVS/cuGraph/lexical lanes, which this
repo's "One Canonical Runtime Owner Per Capability" rule (root `CLAUDE.md`) forbids without an
explicit classification decision. This change defines the contracts and the required proof gate
before any radix-sort code is written, so the GPU-organization role stays confined to BitFrost
residency/cache-tier execution and never becomes retrieval truth.

## What Changes

- Define `PacketGlyphV1`: a compact fixed-size (~16 byte) packed struct per candidate packet
  (`projectionOrdinal`, `featureBits`, `lod`, `residency`, `pagerankQuantized`, `recency`,
  `somCell`, `flags`) enabling a cheap GPU-local scan over large candidate sets (e.g. 100K
  candidates in ~1.6MB) before dereferencing heavier representations along an NES-style LOD ladder
  (LOD0 identity → LOD7 prompt-ready tokens).
- Define `ResidencySortKeyV1`: a GPU-local integer sort key (`tier`, `lod`, `utilityBucket`,
  `recencyBucket`, `projectionOrdinal`) used exclusively inside BitFrost cache/tensor-materialization
  reorganization. Never substitutes for or is derived into canonical `packetKey` identity.
- Define `SomCoordinateV1`: an experimental 3D SOM topology-routing representation coordinate
  (`representationRevision`, `somRevision`, `x`, `y`, `z`, `quantizationError`). Representation-only,
  same non-canonical treatment already applied to `projectionOrdinal`/`gpuNodeId` elsewhere in this
  repo. Its only sanctioned use is measuring BMU-neighbor-prefetch lift on BitFrost cache hit rate —
  not visualization, not retrieval ranking.
- Extend the existing `PrefillReceiptV1` / `PrefillContentIdentityV1` contracts in
  `src/lib/server/atlas/prefill/prefill-contracts-v1.ts` with four fields needed at the
  QLoRA/ACE/BitFrost boundary: `acePolicyRevision`, `bitfrostRevision`, `residencyPlanChecksum`,
  `gpuExecutionIdentity`. This extends the existing `.strict()` Zod schema and checksum pattern —
  no parallel receipt type.
- Define the `ACE-RADIX-01` benchmark/proof gate: a frozen `PacketGlyphV1` fixture at
  N ∈ {256, 1K, 4K, 16K, 64K}, comparing CPU `std::sort` baseline vs CUB radix sort (oracle) vs a
  cuTile fused-kernel challenger (identical permutation + group boundaries required), measuring
  total latency, kernel latency, H2D/D2H bytes moved, cache-hit lift, coalescing/materialization
  lift, and determinism.
- **No production BitFrost wiring in this change.** Deliverable is contracts + the `ACE-RADIX-01`
  fixture/benchmark harness only. cuTile becomes eligible for a production path only after both the
  CUB baseline and the cuTile challenger pass the gate.

## Capabilities

### New Capabilities
- `ace-bitfrost-residency-glyph`: `PacketGlyphV1` / `ResidencySortKeyV1` contracts and the GPU
  execution-ownership boundary (CUB oracle vs cuTile challenger vs cuBLASLt/cuGraph/cuVS/ACE — who
  owns what) for BitFrost cache/tensor-materialization reorganization.
- `parent-atlas-som-topology-coordinate`: `SomCoordinateV1` contract for the experimental 3D SOM
  representation and its BMU-neighbor-prefetch locality experiment.
- `ace-radix-01-proof-gate`: the frozen fixture + benchmark harness (CPU baseline / CUB oracle /
  cuTile challenger) that must pass before any radix-sort code is eligible for production wiring.

### Modified Capabilities
_(none — `openspec/specs/` has no existing capability spec covering prefill receipts or BitFrost
residency; the `PrefillReceiptV1` extension is implementation-level and tracked under Impact below,
not as a spec-level requirement change to an existing capability.)_

## Impact

- **Code**: `src/lib/server/atlas/prefill/prefill-contracts-v1.ts` (extend, additive fields only —
  `.strict()` schema change is a breaking parse change for any caller constructing a payload object
  literal directly, so callers must be greped before landing).
- **New files**: contract modules for `PacketGlyphV1`, `ResidencySortKeyV1`, `SomCoordinateV1`
  (location TBD in design.md — likely alongside `prefill-contracts-v1.ts` under
  `src/lib/server/atlas/`), plus the `ACE-RADIX-01` fixture/benchmark harness (TypeScript fixture
  generator + native CUB/cuTile benchmark driver, exact layout TBD in design.md).
- **No changes** to cuVS ANN retrieval, cuGraph PageRank/Leiden pipeline, or existing BitFrost cache
  key patterns (`bitfrost:*`, `gpu:*`) — this change only adds a new internal reorganization step
  BitFrost may use after existing retrieval/admission decisions, not a replacement for them.
- **Dependencies**: none new at the contracts stage (Zod, existing `canonical-hash-v1.ts` helpers).
  CUB/cuTile native bindings are scoped to the benchmark harness only, not required by any
  production code path in this change.
