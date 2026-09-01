## Context

ACE/BitFrost retrieval already produces ranked candidate packets via cuVS ANN, cuGraph
(PageRank/Leiden, via the NetworkX↔cuGraph parity pipeline), and lexical fusion. Once a candidate
set is fetched, BitFrost needs to reorganize it (hot/warm/cold, by LOD, by cache tier) before
handing batches to GPU tensor materialization — a step with no current contract or owner.
Root `CLAUDE.md`'s "One Canonical Runtime Owner Per Capability" rule requires any new
capability-shaped work to either extend an existing owner or be explicitly classified before
implementation; this design classifies radix-sort-based reorganization as a `BACKEND` beneath the
`ACE/BitFrost` `CANONICAL_OWNER` for residency/admission — never a peer of cuVS/cuGraph retrieval.

The closest existing contract is `PrefillReceiptV1` / `PrefillContentIdentityV1` /
`PrefillArtifactIdentityV1` in `src/lib/server/atlas/prefill/prefill-contracts-v1.ts`: Zod
`.strict()` schemas, a canonical-payload SHA-256 checksum pattern (`canonicalEncodeV1` +
`createHash('sha256')`), and revision-string fields for every axis that can change independently
(model, adapter, tokenizer, backend, quantization). New contracts in this change follow that same
pattern rather than inventing a new one.

## Goals / Non-Goals

**Goals:**
- Define `PacketGlyphV1`, `ResidencySortKeyV1`, `SomCoordinateV1` as Zod-validated, checksummed,
  revision-tagged contracts consistent with `prefill-contracts-v1.ts` conventions.
- Extend `PrefillReceiptV1`/`PrefillContentIdentityV1` with the 4 missing QLoRA/ACE/BitFrost
  boundary fields, preserving the existing checksum-of-canonical-payload behavior.
- Specify the `ACE-RADIX-01` benchmark contract precisely enough that a future implementation
  change can build the fixture + harness without further design decisions.
- Record the GPU primitive ownership table (CUB / cuTile / cuBLASLt / cuGraph / cuVS / ACE-BitFrost
  / SOM) so a future contributor doesn't reintroduce a competing ranking lane.

**Non-Goals:**
- No BitFrost production wiring, no actual CUB/cuTile kernel code, no Redis/Postgres schema changes
  in this change. Those are follow-up changes gated by `ACE-RADIX-01` passing.
- No decision here on where SOM coordinates get persisted (Redis `gpu:*` hash vs Postgres column) —
  left as an Open Question until the BMU-neighbor-prefetch experiment has a first result to justify
  a storage choice.
- No change to cuVS/cuGraph/lexical retrieval ranking logic or weights.

## Decisions

### 1. `PacketGlyphV1` is a logical Zod schema now, a packed binary layout later
For this change, `PacketGlyphV1` is defined as a Zod object with the same 8 logical fields the
proposal specifies (`projectionOrdinal`, `featureBits`, `lod`, `residency`, `pagerankQuantized`,
`recency`, `somCell`, `flags`), each with explicit bit-width bounds enforced via `z.number().int()`
`.min()`/`.max()` (not actual bit-packing). The ACE-RADIX-01 harness is responsible for packing
instances of this logical schema into the literal 16-byte binary layout for the GPU benchmark.
**Rationale**: keeps the contract testable and debuggable in TypeScript/Node without requiring a
binary codec before the proof gate even runs; the binary layout is an implementation detail of the
benchmark harness and (later) the real BitFrost materialization path, not of the logical contract.
**Alternative considered**: define the packed byte layout directly as the canonical contract
(e.g. a `DataView`-based codec class). Rejected for this change — premature, since the benchmark
hasn't yet proven radix reorganization is worth productionizing.

### 2. `ResidencySortKeyV1` never carries or derives `packetKey`
The schema explicitly excludes any packet-identity field. It carries only `projectionOrdinal`
(already established elsewhere in this repo as a non-canonical GPU-local coordinate, same
treatment as `gpuNodeId`) plus four small enumerated/bucketed fields (`tier`, `lod`,
`utilityBucket`, `recencyBucket`). A `.strict()` Zod schema enforces no extra fields can be added
later without a schema version bump. **Rationale**: mirrors this repo's existing hard rule that
representation coordinates must never be promoted to identity without a checksum-verified ordinal
map (see the PageRank/`gpuNodeId` precedent in root `CLAUDE.md`). **Alternative considered**:
include `packetKey` directly on the sort key for convenience during debugging. Rejected — that is
exactly the shortcut that turns a GPU organization primitive into an accidental identity/ranking
authority; a separate ordinal-to-packetKey lookup table (already implied by `CandidateOrdinal`
elsewhere in this repo) is the correct place for that join.

### 3. `SomCoordinateV1` fields mirror the existing PageRank-ordinal caution pattern
`representationRevision` and `somRevision` are separate fields (not one combined revision) because
the underlying embedding representation (`semantic_768`/`latent_128`/`latent_64`) can change
independently of the SOM training run itself — re-running SOM training on the same representation
revision produces a different `somRevision` but the same `representationRevision`. `x`/`y`/`z` are
`z.number()` (not integer) to allow sub-cell interpolated positions if a future consumer needs them;
`quantizationError` is required (not optional) so any consumer can immediately judge coordinate
trustworthiness without a second lookup. **Alternative considered**: a single opaque `somCell:
string` key (matching the informal `somCell` field already used in `PacketGlyphV1`). Rejected for
this contract specifically — `PacketGlyphV1.somCell` is deliberately a cheap discretized bucket for
the compact scan struct, while `SomCoordinateV1` is the full-precision representation record; they
serve different consumers and should not be collapsed into one shape.

### 4. `PrefillReceiptV1` extension is additive-only, landed as a single schema version
The 4 new fields (`acePolicyRevision`, `bitfrostRevision`, `residencyPlanChecksum`,
`gpuExecutionIdentity`) are added directly to `PrefillContentIdentityV1Schema` (the logical-identity
layer, consistent with how `modelRevision`/`adapterRevision`/`tokenizerRevision` already live there
rather than on `PrefillArtifactIdentityV1Schema`, which is reserved for physical/backend-specific
identity). Because the schema is `.strict()`, this is a breaking change for any code constructing a
`PrefillContentIdentityV1` object literal without the new fields — `buildPrefillContentIdentityV1()`
callers must be updated in the same change that lands the schema edit (tracked in tasks.md), not
deferred. **Alternative considered**: a new `PrefillReceiptV2` type alongside V1. Rejected per the
proposal's explicit instruction and this repo's general aversion to parallel schema versions when a
straightforward additive extension is possible and call sites are few (confirmed via `rg` search
before implementation — see tasks.md).

### 5. `ACE-RADIX-01` requires CUB as the enforced oracle, cuTile gated behind it
The proof gate's pass condition is defined as: CUB radix sort output ordering matches a reference
CPU `std::sort` ordering exactly (bit-for-bit key equality, stable tie-break by `projectionOrdinal`)
at every N in {256, 1K, 4K, 16K, 64K}, AND cuTile's output ordering matches CUB's exactly at every N.
Latency/bytes-moved/cache-hit-lift numbers are recorded for analysis but are NOT pass/fail criteria
— only determinism (exact ordering match) gates eligibility for a future production change.
**Rationale**: this change is about proving mechanical correctness and collecting real numbers to
justify a later BitFrost integration decision, not about hitting a specific performance target that
could pressure someone into shipping a non-deterministic reorder under time pressure.

## Risks / Trade-offs

- **[Risk]** The `.strict()` extension to `PrefillContentIdentityV1Schema` breaks any external
  caller outside `sveltekit-frontend/src` that constructs this object shape (e.g. a Python sidecar
  serializing a matching JSON shape by hand). → **Mitigation**: tasks.md includes an explicit
  repo-wide `rg` grep for `PrefillContentIdentityV1` / `buildPrefillContentIdentityV1` /
  `prefill-content-identity.v1` (the literal schema tag) across `src/`, `scripts/`, and `python/`
  before landing the schema edit.
- **[Risk]** `PacketGlyphV1`'s bit-width bounds (e.g. `featureBits: uint16`) are asserted only via
  Zod range checks, not actual bit-packing, so a value that passes validation could still silently
  overflow when packed by the benchmark harness later (e.g. a caller passing 70000 into a
  logically-uint16 field before the packer clamps it). → **Mitigation**: Zod `.max()` bounds are set
  to the exact same numeric ceiling as the target bit width (e.g. `.max(65535)` for uint16), so a
  passing value is always representable — the harness's packer only needs to assert this invariant
  in one place (a shared bit-width constant module), not re-derive it.
- **[Risk]** Defining `SomCoordinateV1` before the BMU-neighbor-prefetch experiment has run risks
  locking in a shape that doesn't fit the eventual real usage pattern. → **Mitigation**: schema is
  versioned (`V1`) and explicitly marked experimental in its own doc comment; no persistence-layer
  commitment (Redis/Postgres) is made in this change, only the in-memory/transit contract.
- **[Trade-off]** Keeping `PacketGlyphV1` as a logical Zod schema (Decision 1) means the actual GPU
  benchmark in a follow-up change still needs a from-scratch binary packer/unpacker — this change
  does not save that work, only defers it until the logical shape is validated.

## Migration Plan

No production code path changes in this change — nothing to migrate or roll back at runtime. The
only "migration" is the `.strict()` schema extension to `PrefillContentIdentityV1Schema`, whose
call-site update is scoped and tracked in tasks.md and lands atomically with the schema edit (no
partial-deploy window where old and new shapes coexist).

## Open Questions

- Where does `SomCoordinateV1` eventually persist if the BMU-neighbor-prefetch experiment shows a
  real hit-rate lift — a new Redis `gpu:som:coordinate:*` hash (consistent with existing
  `gpu:som:packet:{id}` keys per root `CLAUDE.md`) or a Postgres column on an existing SOM-adjacent
  table? Deferred until the experiment has a result.
- Should `ResidencySortKeyV1`'s `utilityBucket` be derived from the existing Karpathy blend score
  (`0.4·PR + 0.3·attn + 0.3·authority`, already cached at `gpu:karpathy:scores`) or a new
  BitFrost-local utility signal? Leaning toward reusing the existing blend to avoid a second scoring
  lane, but not decided — flagged for the follow-up implementation change, not blocking this
  contracts-only change.
- Exact file location for the three new contract modules (`src/lib/server/atlas/` alongside
  `prefill/`, vs a new `src/lib/server/atlas/residency/` subdirectory) — left to tasks.md /
  implementation, not architecturally significant enough to block design sign-off.
