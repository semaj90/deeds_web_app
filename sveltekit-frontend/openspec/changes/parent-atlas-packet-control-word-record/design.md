## Context

This design follows a 2026-09-08 re-derivation of an older, never-frozen NES/CHR97 "glyph"
novelty encoding, reframed as a compact compiled control record over an already-canonical Parent
Atlas packet. It also folds in the identity-separation principle already adopted (independently,
via existing code and `parent-atlas-trace-search-joinback-proof`'s GS1.10-1.12) for the
`tree_node_id` collision: separate identity per layer, connect via typed reference/edges, never
merge two identities into one field.

## Naming collision #1 — a real, live, different-domain system (why "Glyph"/"CHR97" are avoided
entirely in this change)

While drafting this proposal, `src/lib/server/cartridge/glyph-record.ts` and `chr97-builder.ts`
were found: a real, live, production `GlyphRecord` interface with the *exact* 4-layer shape this
proposal's own source design essay described (semantic: summary/tags/section/jsonbKeyHints;
vector: 768-dim embedding; topology: `topo4d`/`somCluster`/`centroidId`; graph: `kagNeighbors`/
`dagPrev`/`grpoRewardScore`), packed into "CHR97 page" cartridges via a 3-stage staged search
(`GlyphBridge.searchCartridge`). This is not a hypothetical prior version of this proposal — it is
currently live, already fully traced in `openspec/changes/ace-hyperrag-chr97-graphify-audit/`
(2026-08-12, real callers: `/api/cartridge/export`, `/api/cartridge/search`, `/api/glyph/search`).

That system is scoped to **legal evidence/case cartridges** (`GlyphRecord.sourceId` is documented
as "evidence / document / case record ID"); this proposal is about **Parent Atlas codebase/
retrieval packets**, a different domain, confirmed separate by `ace-hyperrag-chr97-graphify-audit`
itself ("CHR97/cartridge does NOT consume graphify output at all... a domain entirely separate
from codebase-intelligence graphify"). The shapes rhyme (both compile a multi-layer packet into a
compact cache/search record) but they are not the same artifact, and this repo already has a
written policy for exactly this situation (root CLAUDE.md, "ACE naming collision with NVIDIA's
own ACE"): keep genuinely different things under genuinely different names rather than relying on
disambiguating prose to keep a shared name straight. **Resolution: this entire proposal was
renamed away from every "Glyph"/"CHR97"/"GlyphRecord" term** — `PacketControlWordV1` instead of
`GlyphControlWordV1`, no "CHR97 page" render name, directory and capability names changed from
`*chr97-glyph*` to `*packet-control-word*`. Nothing in the existing evidence-cartridge system is
touched, extended, or depended upon by this change.

## Naming collision #2 — `PacketGlyphV1` in `parent-atlas-ace-radix-residency` (same repo, adjacent
domain, resolved by containment)

`parent-atlas-ace-radix-residency` already defines `PacketGlyphV1` — a ~16-byte packed struct
(`projectionOrdinal`, `featureBits`, `lod`, `residency`, `pagerankQuantized`, `recency`, `somCell`,
`flags`) for BitFrost's GPU-local candidate-scan use case specifically, gated behind the
`ACE-RADIX-01` proof (CUB-vs-CPU determinism half `DRY_RUN_PROVEN`, cuTile half
`ENVIRONMENT_BLOCKED` — see root CLAUDE.md). Unlike collision #1, this one is a legitimate close
relative in the same Parent Atlas domain, not an unrelated system — it stays named `PacketGlyphV1`
(this change does not rename it), and the resolution is containment, not renaming.

This proposal's `PacketControlWordV1` is broader in intent (a general compiled control record for
*any* consumer — human/debug rendering, LOD/residency planning, feature-presence scanning — not
BitFrost-GPU-scan-specific) but structurally similar (a compact bitset/nibble word derived from
canonical state).

**Resolution adopted**: `PacketGlyphV1` becomes one *instantiation* of `PacketControlWordV1`,
scoped to BitFrost's GPU-local scan case, with its existing field layout unchanged (no breaking
change to the already-proof-gated `ACE-RADIX-01` contract). `PacketControlWordV1` is the general
64-bit feature-presence bitset + nibble/byte control-field contract; `PacketGlyphV1` packs a
subset of that word's fields into its specific ~16-byte GPU-scan layout. `PacketControlWordEncoderV1`
produces a `PacketControlWordV1`; a separate, thin `toPacketGlyphV1()` projection (in
`parent-atlas-ace-radix-residency`'s existing module, not duplicated here) extracts the BitFrost
subset when that specific 16-byte layout is needed. Do not implement `toPacketGlyphV1()` in this
change — it belongs with `PacketGlyphV1`'s existing owner and is called out here only so a future
implementer doesn't build a second competing extraction path.

## Five operations, kept structurally separate

| Operation | Input | Output | Cannot do |
|---|---|---|---|
| `PacketControlWordEncoderV1` | typed feature state (already resolved from canonical Postgres/Qdrant/Neo4j reads) | `PacketControlWordV1` (+ optional 8×8 debug render) | Cannot read raw source/embeddings itself — takes already-resolved typed state as input |
| `PacketControlWordDecoderV1` | `PacketControlWordV1` | typed control values (bits, LOD nibble, residency nibble, domain byte, routing byte) | Cannot recover an embedding, AST, source text, or summary — those are referenced artifacts, never inlined |
| `TileMaterializerV1` | artifact references (`packetKey`, `qdrantPointId`, `sourceRef`, etc.) named by a control word or assembly plan | resolved bytes staged in SeaweedFS/mmap/RAM/GPU | Cannot decide what the bytes mean — pure byte-residency mechanics |
| `ParameterAssemblerV1` | query intent + candidate ordinals + requested sections + model/adapter revisions | `ParameterAssemblyPlanV1` (offset table: tensor refs, graph slices, feature columns, source-span refs, each with dimensions/offset/checksum) | Cannot blind-concatenate heterogeneous buffers — every section is explicit |
| `PacketValidatorV1` | a `ParameterAssemblyPlanV1` (or any resolved buffer set) | pass/fail + reason | Cannot be skipped before an executor (CUB/cuTile/cuVS/ATen) runs — divisibility/alignment hints an executor applies are optimization info layered on top, never a substitute |

## Reuse audit (2026-09-08) — three existing primitives found, must be reused not reimplemented

Before any implementation task starts, `src/` was searched for existing implementations of the
Hilbert/Hamming/coordinate-fingerprint mechanics this design calls for (the same audit discipline
that caught the CHR97/Glyph collision above). Three real hits:

1. **`hilbertIndexND(point, bitsPerAxis)` already exists**, in
   `src/lib/server/atlas/tensors/tetris-6d-hilbert-step1.ts` — a generic, tested (has its own
   `.spec.ts`), N-dimensional (2-16 axes, 1-31 bits/axis) John Skilling-style axes→Hilbert-transpose
   implementation, already explicitly documented there as "a locality/indexing device only... not
   a physical distance metric." `AtlasLocalityKeyV1.hilbertKey` MUST call this function, not
   reimplement Hilbert encoding. Its current caller builds 6-DoF rigid-body pose keys for an
   unrelated synthetic fixture — reusing the function does not couple this design to that fixture.
2. **`hammingDistance1Bit(a, b)` / `hammingSimilarity1Bit(a, b)` already exist**, in
   `src/lib/server/search/mla-kv-compress.ts` — a tested, cached-popcount-table 1-bit Hamming
   distance/similarity pair, already used in production for exactly this design's intended
   pattern ("candidates in the same SOM cell + close 1-bit Hamming distance → likely similar",
   per that file's own comment) as a pre-filter before expensive dense reranking.
   `AtlasLocalityKeyV1.hammingSig` comparisons MUST reuse this pair, not a new popcount
   implementation. A second, storage-backed variant exists at
   `src/lib/server/cache/packet-bitmap.ts` (Redis `BITCOUNT` over a temp XOR key) — a valid
   alternate execution strategy for the same math when the operands already live in Redis, not a
   competing algorithm; document both as acceptable backends for the same `hammingSig` comparison
   rather than picking one as sole.
3. **Partial overlap with `SourceCoordinateMapV1`**: `src/lib/server/atlas/indexing/
   structural-observation-v1.ts` already defines `StructuralSourceFingerprintV1`
   (`utf8ByteLength`/`utf16CodeUnitLength` — whole-file totals only, plus `sha256`/line-ending
   counts) and `StructuralObservationV1` (per-symbol `startByte`/`endByte` — UTF-8 byte spans
   only, no UTF-16 span, no line/column). This is real, live, and already the fingerprint/byte-span
   layer this design needs — but it does NOT provide the missing piece (`SourceCoordinateMapV1`'s
   whole point): a UTF-16 code-unit span and line/column projection *per span*, for LSP
   reconciliation. **Resolution**: `SourceCoordinateMapV1` is not redundant, but it must build on
   `StructuralSourceFingerprintV1`/`StructuralObservationV1` rather than duplicate their
   `sha256`/byte-length/byte-span fields — reuse `fingerprintStructuralSource()`'s output as the
   whole-file fingerprint half of `SourceCoordinateMapV1`, and add only the missing UTF-16/line/
   column projection layer on top of `StructuralObservationV1`'s existing byte spans.

No existing checkpoint/resumability contract was found for K-means/SOM (checked
`src/lib/server/ace/features/som-clustering.ts`, `src/lib/server/ml/som-cluster.ts`,
`src/lib/server/retrieval/phase2-kmeans-clustering.ts`) — all three are plain bounded loops with a
`maxIterations` counter, no persisted convergence/checkpoint state, no `stopReason` enum. No
collision found; `AtlasPassCheckpointV1` remains genuinely new.

## Coordinate system: `SourceCoordinateMapV1`

Per-`sourceRevision`, computed once, cached, reused by every AST/CST/LSP/lexical consumer of that
revision:

```
SourceCoordinateMapV1 {
  sourceRevision: string
  sourceByteLength: number
  utf8Checksum: string
  lineStartByteOffsets: number[]
  spans: {
    utf8StartByte: number
    utf8EndByte: number
    utf16StartCodeUnit: number
    utf16EndCodeUnit: number
    line: number
    utf8ColumnByte: number
    utf16ColumnCodeUnit: number
  }[]
}
```

UTF-8 byte offsets are the authority (matches ast-grep's JSON output, Tree-sitter's raw byte
offsets, and simdjson/simdutf's own two-stage structural-scan-then-navigate architecture). UTF-16
code-unit positions (what LSP commonly uses, subject to per-session position-encoding negotiation)
are a derived, cached projection — never recomputed ad hoc per caller.

## Checkpoint taxonomy — do not conflate these four

| Kind | Owns | Example |
|---|---|---|
| ML activation checkpoint | PyTorch forward/backward memory tradeoff (recompute vs. store) | `torch.utils.checkpoint` |
| `AtlasPassCheckpointV1` (new, this change) | Bounded, resumable compute-pass state: identity + revisions + input checksum + algorithm state + derived-artifact checksum + ordinal mapping + convergence state | K-means iteration/inertia/convergence, PCA/SVD rank/tolerance/residual, SOM training epoch, Graphify AST/graph lowering pass boundary, Hilbert-range topology-enrichment batch, agent/error-fixing traversal checkpoint |
| Residency checkpoint | What's currently hot in VRAM/RAM/BitFrost/SeaweedFS | Existing ACE/BitFrost residency state — not redefined by this change |
| LLM KV cache | Ephemeral model execution state | Never persisted as durable state; explicitly excluded from `AtlasPassCheckpointV1` |

`AtlasPassCheckpointV1` shape:

```
AtlasPassCheckpointV1 {
  passId: string
  algorithmRevision: string
  inputSnapshotChecksum: string
  seed?: number
  iteration: number
  maxIterations: number
  convergenceMetric?: { previous: number; current: number; relativeImprovement: number }
  derivedArtifactChecksum: string
  ordinalMapChecksum: string
  converged: boolean
  stopReason: 'RELATIVE_TOLERANCE' | 'MAX_ITERATIONS' | 'NO_ASSIGNMENT_CHANGE' | 'NUMERIC_FAILURE' | 'BOUNDED_RANGE_COMPLETE'
}
```

Checkpoint only at meaningful pass boundaries (e.g. K-means: input-validated → sample/covariance
built → factorization complete → projection complete → quality metrics complete → artifact
admitted), not every floating-point iteration.

## `AtlasLocalityKeyV1` — physical locality, not semantic truth

```
AtlasLocalityKeyV1 {
  domainId: number        // u8
  lodClass: number        // u4
  residencyClass: number  // u4
  clusterId: number       // u16
  somCell: number         // u16
  hilbertKey: bigint      // u32/u64
  hammingSig: bigint      // u64
  packetOrdinal: number   // u32
}
```

Hilbert curves preserve locality (nearby multidimensional coordinates tend to stay nearby in the
1-D ordering) — useful for physical sort order (paging, batch partitioning, storage-range
locality), never for ranking. Hamming distance on a binary feature/routing signature
(`popcount(a XOR b)`) is a cheap pre-filter to shrink a candidate set before expensive dense work —
never a replacement vote alongside RRF fusion. Both are candidate-reduction/locality tools that
feed into, but never bypass, the existing exact retrieval lanes (cuVS ANN, cuGraph, lexical fusion)
as the ranking oracle.

## Proof gate (this change's only deliverable — no production wiring)

1. Encoder/decoder round-trip determinism: same packet + feature + schema revision → same
   checksum, across repeated runs and across a deliberate schema-revision bump (must differ).
2. `SourceCoordinateMapV1` byte↔UTF-16 round-trip against a real ast-grep/Tree-sitter output for a
   small fixture file, cross-checked against a real LSP position for at least one span.
3. `AtlasPassCheckpointV1` resume-from-boundary correctness: run a small bounded K-means to a mid
   checkpoint, kill the process, resume from the checkpoint, confirm identical final centroids to
   an uninterrupted run.
4. `PacketValidatorV1` rejects at least one deliberately malformed `ParameterAssemblyPlanV1`
   (wrong shape, bad checksum, out-of-bounds offset) before it would reach any executor.

## Non-goals

- No production wiring of any of these contracts into ACE, BitFrost, or the retrieval pipeline.
- No new canonical identity — `packetKey`/`sourceRef`/`sourceRevision`/`workspaceRevision` stay
  exactly as they are; every control-word/locality-key field is a derived, non-canonical projection.
- No cuTile kernel work — this change is TypeScript contracts + a CPU-side proof fixture only,
  consistent with `ACE-RADIX-01`'s existing `ENVIRONMENT_BLOCKED` finding for cuTile on this host.
