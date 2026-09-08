## Why

The NES/CHR97 "glyph" idea has come up in this repo's history as a novelty encoding with no
frozen layout. Re-examined 2026-09-08 (session continuation of
`parent-atlas-trace-search-joinback-proof`'s GS1.10-1.12 identity-model work) as something more
useful: a tiny, deterministic, compiled **control record** for a much larger canonical Parent
Atlas packet — a compact projection of already-canonical state (`packetKey`, `title_id`,
`sourceRevision`, feature-presence bits, LOD/residency class) that lets GPU-local scans and
human/debug tooling reason about thousands of candidates cheaply, without ever becoming a second
identity or a second retrieval-ranking vote.

**Renamed away from "CHR97"/"Glyph"/"GlyphRecord" after a real, serious naming collision was
found while drafting this proposal, not a hypothetical one**: `src/lib/server/cartridge/
glyph-record.ts` and `chr97-builder.ts` are a real, live, production system — already-fully-traced
and verified live in `openspec/changes/ace-hyperrag-chr97-graphify-audit/` (root portfolio,
2026-08-12, real callers including `/api/cartridge/export`, `/api/cartridge/search`,
`/api/glyph/search`). Its `GlyphRecord` interface has a 4-layer payload (semantic: summary/tags/
section/jsonbKeyHints; vector: 768-dim embedding; topology: `topo4d`/`somCluster`/`centroidId`;
graph: `kagNeighbors`/`dagPrev`/`grpoRewardScore`) packed into "CHR97 page" cartridges with a
3-stage staged search — almost exactly the shape this proposal's own source design essay
described, down to the layer names. **That existing system is scoped to legal evidence/case
cartridges** (`sourceId` is documented as "evidence / document / case record ID"); per
`ace-hyperrag-chr97-graphify-audit`'s own finding, "CHR97/cartridge does NOT consume graphify
output at all... a domain entirely separate from codebase-intelligence graphify." This proposal is
about Parent Atlas codebase/retrieval packets, a different domain. The two are related in spirit
(both compile a multi-layer packet into a compact cache/search record) but are NOT the same
artifact and must not be merged without a separate, explicit decision — this repo already has a
written policy for exactly this shape of collision (see root CLAUDE.md's "ACE naming collision
with NVIDIA's own ACE": *"keep the two explicitly separated in code and naming going forward"*,
not disambiguated-by-comment reuse of the same term). Renaming this proposal's contracts away from
"Glyph"/"CHR97" entirely, rather than trying to coexist under the same words, follows that
precedent directly.

This reframe only matters if it stays strictly subordinate to canonical identity and existing
retrieval lanes. Without an explicit contract, this kind of work risks re-deriving a parallel
packet identity scheme (this repo has hit that failure mode before — see root CLAUDE.md's
Duplication Prevention section, and `parent-atlas-ace-radix-residency`'s `PacketGlyphV1`, a second,
narrower, already-real collision addressed below). This change defines the vocabulary, the five
separate operations (encode/decode/materialize/assemble/validate), the coordinate-system contract
for LSP-vs-byte-offset reconciliation, and the checkpoint taxonomy — as contracts and a proof gate
only, matching this repo's established pattern (see `parent-atlas-ace-radix-residency`,
`parent-atlas-gpu-mini-fabric-01`) of proving a capability on a bounded fixture before any
production wiring.

**Explicitly out of scope for this change**: GS1.10-1.12 (the `tree_node_id` identity-model
question in `parent-atlas-trace-search-joinback-proof`) is a separate, narrower, already-resolved
problem — see that file's corrected GS1.9-1.12 entries. This change does not block on it and does
not restate its resolution; it only reuses the same lineage-edge principle (identity per layer,
connected by typed references, never merged) as prior art. Also explicitly out of scope: any
change to the existing evidence-cartridge `GlyphRecord`/`chr97-builder.ts` system — this proposal
neither extends nor depends on it.

## What Changes

- Define `PacketControlWordV1`: a deterministic 64-bit feature-presence bitset (`UTF8_VALID`,
  `AST_PRESENT`, `SEMANTIC768_PRESENT`, `GRAPH_PRESENT`, ... up to `VALIDATED`) plus small
  fixed-width fields (LOD nibble, residency nibble, domain byte, routing byte) computed from an
  already-canonical packet's current state. Same packet revision + same feature revision + same
  control-word schema revision must produce the same checksum — this is the encoder's only
  correctness contract.
- Define `PacketControlWordEncoderV1` / `PacketControlWordDecoderV1` as the only two operations
  that touch the control word's bit/nibble layout. The decoder recovers only the typed control
  values it encoded — never an embedding, AST, source file, or summary. Those remain artifact
  references (`packetKey`, `sourceRef`, `qdrantPointId`, etc.), resolved through existing canonical
  lookups, never inlined into the control word.
- Define an optional 8×8 bitmap *debug rendering* of `PacketControlWordV1` for human/debug
  visualization only. The bitmap is a projection of the word, not an alternate encoding of it — no
  code may treat pixel data as authoritative; the word is authoritative, the render is a view. No
  cartridge/tile-file format is defined by this render — it is a debug visualization only, with no
  relationship to the existing evidence-cartridge binary format.
- Define `TileMaterializerV1`: resolves artifact references named by a control word into actual
  bytes (SeaweedFS / mmap / RAM / GPU staging), matching this repo's existing GPU/CPU boundary rule
  (root CLAUDE.md: GPU accelerates tensor math only) — the materializer decides *where* bytes live,
  never *what they mean*.
- Define `ParameterAssemblyPlanV1`: query intent + candidate ordinals + requested feature sections
  + model/adapter revisions → an explicit offset table of sections (tensor references, graph
  slices, feature columns, source-span refs) with dimensions/offsets/checksums. No blind
  concatenation of heterogeneous buffers.
- Define `PacketValidatorV1`'s control-word-specific gate additions: identity validity, revision
  validity, UTF-8 validity, ordinal-map validity, section-bounds validity, alignment, shape/stride,
  checksum, required-representation presence — run *before* any executor (CUB/cuTile/cuVS/ATen)
  sees a parameter buffer. Divisibility/alignment assumptions an executor like cuTile might apply
  are optimization hints layered on top of this validation, never a substitute for it.
- Define `SourceCoordinateMapV1`: per-`sourceRevision`, computed once and cached — UTF-8 byte
  spans (the authority, matching ast-grep/Tree-sitter/simdjson/simdutf) reconciled against UTF-16
  code-unit spans (what LSP commonly uses, subject to position-encoding negotiation), plus
  line/column projections. Prevents every consumer from re-deriving its own coordinate conversion.
- Define `AtlasPassCheckpointV1`: the common resumability contract for bounded, checkpointed
  compute passes (PCA/SVD/K-means convergence state, SOM training, Graphify AST/graph lowering,
  Hilbert-range topology enrichment batches, parameter materialization, agent/error-fixing
  traversal state). Explicitly excludes PyTorch activation-checkpoint memory optimization and LLM
  KV-cache state — those remain separate, already-well-defined mechanisms (see design.md's
  checkpoint-taxonomy table) that must not be folded into this contract.
- Define `AtlasLocalityKeyV1`: a physical/cache-locality sort key (`domain_id`, `lod_class`,
  `residency_class`, `cluster_id`, `som_cell`, `hilbert_key`, `hamming_sig`, `packet_ordinal`) for
  storage/paging/batch-partitioning locality only. Explicitly never a substitute for `packetKey`/
  `sourceRef` identity, never a semantic-similarity or KNN-truth claim, never a second retrieval
  vote (same non-canonical treatment this repo already applies to `projectionOrdinal`/`gpuNodeId`
  in `parent-atlas-ace-radix-residency`).
- Proof gate: a frozen fixture proving (1) encoder/decoder round-trip determinism across repeated
  runs and across a schema-revision bump, (2) `SourceCoordinateMapV1` byte↔UTF-16 round-trip
  against a real ast-grep/Tree-sitter/LSP fixture, (3) `AtlasPassCheckpointV1` resume-from-boundary
  correctness for at least one bounded compute pass (e.g. a small K-means run), (4)
  `PacketValidatorV1` rejecting at least one deliberately malformed parameter-assembly plan before
  it reaches an executor. No production wiring in this change.

## Capabilities

### New Capabilities
- `parent-atlas-packet-control-word-record`: `PacketControlWordV1` + encoder/decoder + optional
  debug render, strictly subordinate to canonical packet identity.
- `parent-atlas-source-coordinate-map`: `SourceCoordinateMapV1`, the UTF-8/UTF-16 reconciliation
  contract for AST/CST/LSP/lexical tooling operating on the same source revision.
- `parent-atlas-pass-checkpoint`: `AtlasPassCheckpointV1`, the shared resumability contract for
  bounded ML/graph/traversal compute passes — explicitly distinct from ML activation checkpointing
  and LLM KV-cache state.
- `parent-atlas-locality-key`: `AtlasLocalityKeyV1`, the Hilbert/Hamming/cluster physical-locality
  sort key for storage and batch partitioning only.

### Modified Capabilities
_(none yet — `ace-bitfrost-residency-glyph` in `parent-atlas-ace-radix-residency` already owns
`PacketGlyphV1`/`ResidencySortKeyV1` for the narrower BitFrost GPU-scan use case; this change's
`PacketControlWordV1` is a different, broader "compiled control record for a whole packet" concept
and is reconciled against that existing contract in design.md — `PacketGlyphV1` becomes one
instantiation of the broader word, not a duplicate. Separately, and NOT modified or extended by
this change at all: the evidence-cartridge `GlyphRecord`/`chr97-builder.ts` system, a real, live,
different-domain system this proposal must never be confused with — see Why above.)_

## Impact

- **Code**: entirely new contract modules; no existing production code path depends on any of
  these names yet (verified: `PacketControlWordV1`, `SourceCoordinateMapV1`, `AtlasPassCheckpointV1`,
  `AtlasLocalityKeyV1` do not exist anywhere in the repo as of this proposal).
- **Naming collision risk #1, resolved in design.md**: `PacketGlyphV1` (existing, in
  `parent-atlas-ace-radix-residency`) vs `PacketControlWordV1` (this change) — related concepts,
  different scope, no name overlap after this rename. `PacketGlyphV1` becomes one instantiation of
  the broader `PacketControlWordV1` concept, scoped to BitFrost's GPU-scan case; its existing field
  layout and `ACE-RADIX-01` proof gate are unchanged.
- **Naming collision risk #2, the reason for this rename**: the evidence-cartridge `GlyphRecord`/
  `chr97-builder.ts`/CHR97 system (`src/lib/server/cartridge/`) is real, live, different-domain,
  and was already fully traced in `openspec/changes/ace-hyperrag-chr97-graphify-audit/`. This
  proposal now uses zero overlapping vocabulary with it (no "Glyph", no "CHR97" anywhere in this
  change) specifically to avoid the confusion a shared name would cause.
- **No changes** to canonical Postgres identity, Qdrant/Neo4j mirrors, the evidence-cartridge
  system, or any existing retrieval lane. This is a compiled *view* over already-canonical state,
  never a new source of truth.
- **Dependencies**: none new. Zod for contracts, existing hashing helpers for checksums.
