# Tasks — Parent Atlas memory architecture freeze

This change is a **recording pass**, not an implementation pass. Tasks below are the audit steps
already completed plus the follow-up scoping work, not feature implementation — see
`proposal.md`'s "What's actually new and worth scoping" for the actual build candidates.

## 1. Audit — done this session (2026-08-23)

- [x] 1.1 Grepped for `ContextManifest`, `CandidateOrdinal`, `AcePacket`, Valkey `SETBIT`/`BITOP`
  usage, and `LOD`/`levelOfDetail` across `sveltekit-frontend/src` — all four concepts already
  have live implementations. Findings recorded in `proposal.md`'s comparison table.
- [x] 1.2 Read `context-compiler.parent-atlas.ts` header/exports — confirmed real, working
  `ContextManifest`/`ContextCandidate`/`ContextLane` types and `compileContext()` pipeline exist,
  organized by retrieval lane not evidence type.
- [x] 1.3 Read `packet-lod-manifest.ts` — confirmed 4-level (0-3) LOD keyed by cache destination,
  not the proposal's 7-level evidence-type axis.
- [x] 1.4 Read `packet-bitmap.ts` — confirmed existing bitmaps are per-packet gate flags, not
  per-category candidate-membership bitmaps; different purpose, not a duplicate, safe to add the
  proposal's version alongside it under a different key prefix.
- [x] 1.5 Grepped for Tang/low-rank-sampling and pinned-memory/mmap-CUDA implementations —
  Tang-inspired sampling has no existing owner (genuinely new); pinned-memory code exists in
  `python/parent_atlas_tensor/*` but was not read in enough detail to say whether it already
  matches the proposal's specified chain.

## 2. Follow-up scoping — not started

- [ ] 2.1 Read `python/parent_atlas_tensor/gpu_resident_executor.py`, `gpu_tile_cache.py`,
  `pytorch_gpu_helpers.py`, and `python/parent_atlas_candidate_feature_gpu_resident.py` in full;
  determine whether the `mmap → index_select(ordinals) → bounded CPU staging → pin → async H2D`
  chain already exists there, partially exists, or is genuinely missing.
- [ ] 2.2 Field-by-field diff the proposal's `AcePacketV2` shape (ordinal/revision/routing/lod/
  policy/artifact-as-ordinal-reference) against whatever `ace-packet-writer.ts`/
  `canonical-packet-envelope.ts` currently define, to see how close the existing envelope already
  is.
- [ ] 2.3 Decide (operator call, not an agent call per `CLAUDE.md`'s Duplication Prevention
  section): does the evidence-type-axis typed packet model (`SourceEvidencePacket`/
  `AstEvidencePacket`/etc.) replace, layer onto, or project from the existing lane-axis
  `ContextCandidate`/`ContextLane` model? Do not start implementation of typed packet classes
  before this is answered — this is the single highest-risk item for creating a second
  uncoordinated "the" context-compilation system.
- [ ] 2.4 Decide (same caveat): does the 7-level evidence-axis LOD scheme replace or layer onto
  the existing 4-level cache-destination-axis LOD scheme in `packet-lod-manifest.ts`?
- [ ] 2.5 If proceeding with the candidate-ordinal-indexed membership bitmap + `BITOP AND`
  admission-mask capability (lowest-risk item, no conflict with existing `PacketBitmapCache`):
  scope as its own small change, propose a Valkey key naming convention (e.g.
  `ace:membership:{category}:{value}` vs. the existing `atlas:mask:packet:{packetId}`) that's
  unambiguously distinct from the existing per-packet gate bitmap prefix.
- [ ] 2.6 Verify PyTorch's `torch.from_file`-cannot-be-pinned constraint against the actual
  PyTorch version pinned in this repo's Python environment (`requirements*.txt`/`pyproject.toml`)
  before any pinned-staging code is written — the proposal cites this as a general PyTorch
  constraint, not something checked against this repo's specific dependency versions.

## 3. Governance-only, zero implementation cost

- [ ] 3.1 Consider adding the wire-format layering rule ("JSON/MessagePack describe things,
  bitmaps select things, ordinals address things, mmap/Arrow/tensors store and compute large
  numeric things — never MessagePack for bulk numeric arrays") to `CLAUDE.md` or a referenced
  memory doc, since it's a durable rule with no build cost and would prevent a plausible future
  mistake (reaching for MessagePack to encode a `semantic_768` vector array).

## 4. Explicitly out of scope for this change

- [ ] 4.1 Do not implement `TANG_INSPIRED_LOW_RANK_SHORTLIST`'s actual sampling math here — this
  change only records the naming/role decision (it decides which valid candidates deserve more
  compute; it never decides which evidence is true). The algorithm itself is unscoped.
- [ ] 4.2 Do not touch `context-compiler.parent-atlas.ts`, `packet-lod-manifest.ts`, or
  `packet-bitmap.ts` as part of this change — this is a recording pass; 2.3/2.4 must be answered
  by the operator before any of those files change.
