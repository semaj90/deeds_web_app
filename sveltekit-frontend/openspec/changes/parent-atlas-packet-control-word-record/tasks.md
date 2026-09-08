## 1. Naming collision resolution

- [x] 1.1 **DONE 2026-09-08** — read `src/lib/server/atlas/residency/packet-glyph-v1.ts` directly:
      `PacketGlyphV1Schema` field layout (`projectionOrdinal`/`featureBits`/`lod`/`residency`/
      `pagerankQuantized`/`recency`/`somCell`/`flags`) confirmed unchanged; not touched by this
      change. `ACE-RADIX-01` proof gate untouched.
- [x] 1.2 **DONE 2026-09-08** — `PacketControlWordV1` Zod contract in
      `src/lib/server/atlas/packet-control-word-v1.ts`: full 64-bit feature-presence bitset via
      `PACKET_CONTROL_WORD_BIT_V1` (bigint bitset + named bit-position map, not 64 boolean fields)
      plus `lodNibble`/`residencyNibble`/`domainByte`/`routingByte`. **Real reuse finding applied**:
      `residency/packet-lod-v1.ts` already defines `PacketLodV1` (`0-5 | 'GPU'`) and
      `ResidencyStateV1` (`ABSENT/COLD/WARM/HOT_CPU/HOT_GPU/CONSUMED`) — the nibble fields encode
      these existing vocabularies (`lodToNibble`/`nibbleToLod`, `residencyToNibble`/
      `nibbleToResidency`) rather than inventing a third LOD/residency scale.
- [x] 1.3 **DONE 2026-09-08** — grepped the new contract file for any `cartridge` import: zero
      hits, confirmed.

## 2. Encoder / Decoder

- [x] 2.1 **DONE 2026-09-08, live-proven** — `encodePacketControlWordV1()` in
      `packet-control-word-v1.ts`. Deterministic (same packet+feature+schema revision -> same
      checksum, verified by test); a schema-revision bump changes the checksum with other inputs
      held fixed (verified by test).
- [x] 2.2 **DONE 2026-09-08, live-proven** — `decodePacketControlWordV1()`: returns only
      `presentBits`/`lod`/`residency`/`domainByte`/`routingByte` — no artifact-content field exists
      on the return type at all (asserted directly via `Object.keys()` in the test, not just "we
      didn't add one").
- [x] 2.3 **DONE 2026-09-08, live-proven** — `renderPacketControlWordDebugGrid()` in
      `packet-control-word-v1.ts`: renders `featureBits` as an 8x8 grid of `#`/`.` (bit 0 = row 0
      col 0, bit 63 = row 7 col 7, row-major), debug/visualization only — explicit doc comment
      states it is not an alternate encoding and must never be parsed back into a
      `PacketControlWordV1`. Test confirms bit-position mapping at both edges of the 64-bit word
      and exact set-bit count.

## 3. Coordinate map

- [x] 3.1 **DONE 2026-09-08** — `SourceCoordinateMapV1` contract + `buildSourceCoordinateMap()`
      builder in `src/lib/server/atlas/indexing/source-coordinate-map-v1.ts`. Builds on
      `fingerprintStructuralSource()` for whole-file `sha256`/`utf8ByteLength` (not recomputed
      independently, per design.md's Reuse audit finding #3). Per-span UTF-16/line/column
      projection computed via a single forward pass over the source iterated by codepoint
      (handles surrogate pairs correctly), with a byte-offset→boundary `Map` for O(1) span lookup.
      Throws a clear error if a requested byte offset doesn't land on a real codepoint boundary
      rather than silently coercing.
- [x] 3.2 **DONE 2026-09-08** — `getOrBuildSourceCoordinateMap()` / `clearSourceCoordinateMapCache()`
      in the same file: a bounded (200-entry) in-process `Map` keyed by `sourceRevision`, not a new
      Redis layer — appropriate here since the value is a pure, deterministic function of
      `(sourceRevision, source, spans)` with no cross-process sharing requirement at this
      contracts-only stage (see design.md's non-goals).

## 4. Checkpoint taxonomy

- [x] 4.1 **DONE 2026-09-08, live-proven** — `AtlasPassCheckpointV1` Zod contract in
      `src/lib/server/atlas/pass-checkpoint-v1.ts`: `passId`/`algorithmRevision`/
      `inputSnapshotChecksum`/optional `seed`/`iteration`/`maxIterations`/optional
      `convergenceMetric`/`derivedArtifactChecksum`/`ordinalMapChecksum`/`converged`/`stopReason`
      (nullable 5-value enum). Two `.refine()` invariants enforced at the schema boundary:
      `iteration <= maxIterations`, and `stopReason` must be non-null once `converged` or
      `iteration >= maxIterations`. `createAtlasPassCheckpointV1()` builder +
      `canResumeAtlasPassCheckpointV1()` guard (refuses resume across a different
      `algorithmRevision`/`inputSnapshotChecksum`, and refuses resuming an already-converged
      checkpoint).
- [x] 4.2 **DONE 2026-09-08** — the 4-way checkpoint taxonomy distinction (ML activation /
      `AtlasPassCheckpointV1` / residency / LLM KV cache) is documented directly in the module's
      header doc comment in `pass-checkpoint-v1.ts`, not only in design.md.

## 5. Locality key

- [x] 5.1 **DONE 2026-09-08, live-proven** — `AtlasLocalityKeyV1` contract in
      `src/lib/server/atlas/locality-key-v1.ts`: `domainId`/`lodClass`/`residencyClass`/
      `clusterId`/`somCell`/`hilbertKey`/`hammingSig`/`packetOrdinal`, `.strict()`. `lodClass`/
      `residencyClass` reuse the same `PacketLodV1`/`ResidencyStateV1` vocabularies as
      `PacketControlWordV1` (no third LOD/residency scale); `somCell` bounded to uint16 matching
      `PacketGlyphV1`'s existing convention; `hammingSig` stored as a validated lowercase-hex
      string (serializable through JSON/Postgres) with `hammingSigToBytes()`/`bytesToHammingSig()`
      round-trip helpers.
- [x] 5.2 **DONE 2026-09-08, live-proven** — `computeAtlasHilbertKeyV1()` delegates directly to
      the existing `hilbertIndexND(point, bitsPerAxis)`. Test asserts byte-for-byte equality
      (`toBe`, bigint) between the wrapper's output and calling `hilbertIndexND` directly on the
      same input — proves delegation, not reimplementation.
- [x] 5.3 **DONE 2026-09-08, live-proven** — `compareAtlasHammingSigV1()` delegates directly to
      the existing `hammingDistance1Bit`/`hammingSimilarity1Bit`
      (`src/lib/server/search/mla-kv-compress.ts`); test asserts identical distance/similarity
      values vs. calling those functions directly. `hammingPrefilterCandidatesV1()` implements the
      "pre-filter, not an RRF vote" requirement explicitly: it only applies a boolean radius cut
      and preserves input order — test confirms candidates are returned unranked (input order
      preserved, not sorted by distance). The Redis-`BITCOUNT` storage-backed path
      (`cache/packet-bitmap.ts`) is documented as the alternate backend when operands already live
      in Redis but not wrapped here — no new call site needed one this session.

## 6. Materializer / Assembler / Validator

- [x] 6.1 **DONE 2026-09-08, live-proven** — `TileMaterializerV1` interface in
      `src/lib/server/atlas/tile-materializer-v1.ts`: pure byte-residency mechanics only
      (`materialize(ref, backend) -> MaterializedTileV1`), 4 backends
      (SEAWEEDFS/MMAP/RAM/GPU). `createFixtureTileMaterializerV1()` is an explicit FIXTURE-ONLY
      in-memory implementation (doc comment states it must never be wired into production) used
      solely by this change's tests. 3/3 tests pass.
- [x] 6.2 **DONE 2026-09-08, live-proven** — `ParameterAssemblyPlanV1` contract +
      `assembleParameterPlanV1()` in `src/lib/server/atlas/parameter-assembly-plan-v1.ts`: explicit
      offset table over 4 section kinds (TENSOR_REF/GRAPH_SLICE/FEATURE_COLUMN/SOURCE_SPAN), each
      with `offset`/`byteLength`/optional `dimensions`/`checksum`; sections laid out sequentially
      with each offset aligned up to `alignmentBytes`; a deterministic `planChecksum` over the
      laid-out sections. 3/3 tests pass (sequential-layout/alignment math, checksum determinism,
      empty-packetKeys rejection).
- [x] 6.3 **DONE 2026-09-08, live-proven** — `PacketValidatorV1` gate in
      `src/lib/server/atlas/packet-validator-v1.ts` (`validatePacketAssemblyPlanV1()`): all 9 named
      checks implemented — identity (duplicate/empty packetKeys), revision (caller-expected vs.
      plan-pinned revisions), UTF-8 (SOURCE_SPAN sections decoded with a fatal `TextDecoder` against
      a resolved buffer), ordinal-map (expected vs. actual sequence equality), bounds (section end
      vs. `totalByteLength` and vs. the real resolved-buffer length), alignment (offset modulo
      `alignmentBytes`), shape/stride (declared `dimensions` vs. `byteLength`, float32 convention
      via `expectedTensorByteLength()`), checksum (per-section + whole-plan, recomputed against
      the resolved buffer), and required-representation presence (named sections must exist).
      Byte-level checks (UTF-8/checksum/buffer-bounds) are skipped, not failed, when no
      `resolvedBuffer` is supplied — documented explicitly, not a silent gap.

## 7. Proof gate

- [x] 7.1 **DONE 2026-09-08, live-proven** — `packet-control-word-v1.spec.ts` (8/8 pass):
      determinism, schema-revision-bump changes checksum, decoder recovers exactly the encoded
      bits/LOD/residency, decoder exposes no artifact-content field, individual bit-test helper
      agrees with the decoded presence list, the top bit (`VALIDATED`, position 63) round-trips
      correctly at the edge of the 64-bit word, an unencodable LOD/residency value is rejected
      at the schema boundary, and (added with task 2.3) the debug-grid renderer places bit 0 and
      bit 63 at the correct opposite corners with exactly the expected count of set cells.
- [x] 7.2 **DONE 2026-09-08, live-proven** —
      `src/lib/server/atlas/indexing/source-coordinate-map-v1.spec.ts` (5/5 pass). Real, live
      ast-grep invocation (not hardcoded byte offsets) against a fixture containing a 4-byte UTF-8
      astral character (🎉, a UTF-16 surrogate pair) before the span under test, so byte and UTF-16
      offsets genuinely diverge: ast-grep reported byte offset 22 for `function greet()`'s start;
      the coordinate map's UTF-16 offset for the same position is 20 — confirmed by slicing the
      raw UTF-8 bytes and the native JS (UTF-16) string independently and asserting identical
      text, which is exactly what an LSP UTF-16 position would need to agree with a byte-offset
      tool. Also proves: whole-file fields come from `fingerprintStructuralSource()` (not
      independently recomputed), a non-codepoint-boundary span is rejected with a clear error, and
      the builder is deterministic. Windows-specific note recorded in the test file: `execFileSync`
      cannot invoke a `.cmd` npm shim directly (`EINVAL`) and `execFileSync(..., {shell:true})`
      with an array of args does not quote them for `cmd.exe` (mangled `$$$`/`{`/`}` into separate
      tokens) — fixed by resolving the `.cmd` path via `where` and invoking through `execSync` with
      a manually double-quoted single command string.
- [x] 7.3 **DONE 2026-09-08, live-proven** — `pass-checkpoint-v1.spec.ts`'s "resume-from-boundary
      proof" describe block: a small deterministic fixture K-means (12 points, k=3, fixed initial
      centroids, no RNG) run uninterrupted to convergence as the reference; a second run stopped
      after exactly 1 iteration, checkpointed via `createAtlasPassCheckpointV1()`, its in-memory
      state discarded and rebuilt purely from the checkpoint's serialized centroids
      (`JSON.parse(JSON.stringify(...))`, simulating a real process kill), then resumed via
      `runKMeans(..., checkpoint.iteration, ...)`. Resumed run's final centroid-set checksum
      (sha256 of the JSON) is asserted equal to the uninterrupted reference's checksum. 7/7 tests
      pass total in this file (6 contract-validation tests + this proof).
- [x] 7.4 **DONE 2026-09-08, live-proven** — `packet-validator-v1.spec.ts` (11/11 pass): one
      well-formed plan passing all 9 checks simultaneously (positive control), plus one
      deliberately malformed variant per failure code — bad checksum, out-of-bounds offset,
      misaligned offset, shape/stride mismatch, invalid UTF-8 in a source span, duplicate
      packetKeys, revision mismatch, ordinal-map mismatch, and a missing required representation
      — each asserted to produce exactly its expected failure code, plus a final test confirming
      byte-level checks are skipped (not falsely failed) when no resolved buffer is supplied.
- [x] 7.5 **DONE 2026-09-08** — proof status recorded using this repo's status-language rules:
      **CREATED** — all 7 contract modules exist
      (`packet-control-word-v1.ts`, `source-coordinate-map-v1.ts`, `pass-checkpoint-v1.ts`,
      `locality-key-v1.ts`, `tile-materializer-v1.ts`, `parameter-assembly-plan-v1.ts`,
      `packet-validator-v1.ts`). **DRY_RUN_PROVEN** — every contract has a passing `.spec.ts`
      (44 tests total across the 7 files, all green in one combined run — 8+5+7+7+3+3+11;
      `tsc --noEmit` clean repo-wide after every addition; `openspec validate --strict` clean)
      exercising real behavior against fixture data,
      including one genuine live external-tool invocation (`SourceCoordinateMapV1`'s ast-grep
      proof). **NOT_PROVEN / explicitly out of scope** — no `APPLY_PROVEN` claim is made or
      warranted: none of these 7 contracts are wired into ACE, BitFrost, the retrieval pipeline, or
      any executor (CUB/cuTile/cuVS/ATen) — see design.md's Non-goals. This change is contracts +
      fixture proof only; do not cite it as "production-ready" for any of the five operations.

## Status

**21/21 tasks done (2026-09-08) — CHANGE COMPLETE.** Proposal + design drafted the same day as part of reviewing
`parent-atlas-trace-search-joinback-proof`'s GS1.10-1.12 identity-model question — this change is
the separate, larger initiative that question's design direction (lineage edges, not ID reuse)
motivated, not a dependency of it. GS1.10-1.12 itself was resolved independently in that other
change without needing any of this.

**Done, live-proven**:
- Section 1 (naming-collision confirmation, 1.1-1.3): `PacketGlyphV1` layout confirmed unchanged
  (read directly, not touched); zero cartridge imports confirmed.
- Section 2 (2.1/2.2/2.3 — CLOSED) + section 1.2's contract + proof-gate 7.1: `PacketControlWordV1`
  — the full 64-bit feature-presence bitset (bigint + named bit-position map, not 64 boolean
  fields), `encodePacketControlWordV1()`/`decodePacketControlWordV1()`/
  `isPacketControlWordBitSet()`/`renderPacketControlWordDebugGrid()`. Real reuse finding applied
  while implementing: the LOD/residency nibbles encode the *already-existing*
  `PacketLodV1`/`ResidencyStateV1` types from `residency/packet-lod-v1.ts` rather than inventing a
  third vocabulary. Code: `src/lib/server/atlas/packet-control-word-v1.ts` + `.spec.ts` (8/8 pass).
- Section 3 (3.1/3.2) + proof-gate 7.2: `SourceCoordinateMapV1` — see the entry higher in this file
  for full detail (real live ast-grep invocation, real byte↔UTF-16 divergence proof, 5/5 pass).
  Code: `src/lib/server/atlas/indexing/source-coordinate-map-v1.ts` + `.spec.ts`.
- Section 4 (4.1/4.2 — CLOSED) + proof-gate 7.3: `AtlasPassCheckpointV1` — the full contract with
  `.refine()`-enforced invariants (`iteration <= maxIterations`; `stopReason` non-null once
  converged/terminated), `createAtlasPassCheckpointV1()`, `canResumeAtlasPassCheckpointV1()` (
  refuses resume across a different algorithm/input snapshot or an already-converged checkpoint).
  The 4-way taxonomy (ML activation / this contract / residency / LLM KV cache) is documented
  inline in the module, not just design.md. Proof-gate 7.3 is a real deterministic K-means
  kill/resume test: interrupted after 1 iteration, checkpointed, in-memory state discarded and
  rebuilt only from the serialized checkpoint, resumed, and its final centroid checksum matches an
  uninterrupted reference run bit-for-bit. Code:
  `src/lib/server/atlas/pass-checkpoint-v1.ts` + `.spec.ts` (7/7 pass).
- Section 5 (5.1/5.2/5.3 — CLOSED): `AtlasLocalityKeyV1` — a physical locality key
  (`domainId`/`lodClass`/`residencyClass`/`clusterId`/`somCell`/`hilbertKey`/`hammingSig`/
  `packetOrdinal`) that reuses `PacketLodV1`/`ResidencyStateV1` (same vocabulary as
  `PacketControlWordV1`) and the uint16 `somCell` convention from `PacketGlyphV1`.
  `computeAtlasHilbertKeyV1()` and `compareAtlasHammingSigV1()` are thin delegating wrappers over
  the existing `hilbertIndexND()` and `hammingDistance1Bit`/`hammingSimilarity1Bit` — proven by
  tests asserting byte-for-byte/value-for-value equality against calling those functions directly,
  not just "no throw". `hammingPrefilterCandidatesV1()` enforces the "pre-filter, not an RRF vote"
  requirement structurally (boolean radius cut only, preserves input order — tested). Code:
  `src/lib/server/atlas/locality-key-v1.ts` + `.spec.ts` (7/7 pass).
- Section 6 (6.1/6.2/6.3 — CLOSED) + proof-gates 7.4/7.5: `TileMaterializerV1` (interface + a
  clearly-labeled FIXTURE-ONLY in-memory implementation for tests, never production),
  `ParameterAssemblyPlanV1` + `assembleParameterPlanV1()` (explicit 4-kind offset table with
  per-section alignment and a deterministic plan checksum), and `PacketValidatorV1`'s
  `validatePacketAssemblyPlanV1()` implementing all 9 named gates (identity, revision, UTF-8,
  ordinal-map, bounds, alignment, shape/stride, checksum, required-representation presence).
  Proof-gate 7.4 exercises one well-formed positive control plus one deliberately malformed
  variant per failure code (9 negative cases) — every single one produced exactly its expected
  failure code on the first implementation attempt, no debugging needed. Code:
  `src/lib/server/atlas/tile-materializer-v1.ts`, `parameter-assembly-plan-v1.ts`,
  `packet-validator-v1.ts` + their `.spec.ts` files (3 + 3 + 11 = 17/17 pass).

`tsc --noEmit` clean repo-wide (checked after each addition), `openspec validate --strict` clean.
**44/44 tests pass across all 7 contract modules in this change, confirmed in one combined
`vitest run` invocation (not just per-file).**

**Nothing left open.** All 7 sections and all 5 proof-gate items are done. See task 7.5 above for
the final recorded proof status (CREATED + DRY_RUN_PROVEN; explicitly not APPLY_PROVEN — no
production wiring exists or was in scope). Any follow-on work (wiring these contracts into ACE,
BitFrost, or an executor) is new, separate work requiring its own OpenSpec change per this
change's own Non-goals section.

**Verification commands**:
```bash
cd sveltekit-frontend
npx openspec validate parent-atlas-packet-control-word-record --strict
npx openspec list  # confirm task count before trusting this file's numbers
npx vitest run src/lib/server/atlas/packet-control-word-v1.spec.ts src/lib/server/atlas/indexing/source-coordinate-map-v1.spec.ts src/lib/server/atlas/pass-checkpoint-v1.spec.ts src/lib/server/atlas/locality-key-v1.spec.ts src/lib/server/atlas/tile-materializer-v1.spec.ts src/lib/server/atlas/parameter-assembly-plan-v1.spec.ts src/lib/server/atlas/packet-validator-v1.spec.ts
```
