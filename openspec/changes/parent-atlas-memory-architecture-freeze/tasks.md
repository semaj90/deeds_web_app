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

- [x] 1.6 **2026-08-23 follow-up pass**: read `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md`
  (the repo's dated May/June 2026 master backlog doc, referenced from `.claude/CLAUDE.md` as
  authoritative for lane completion tracking) looking for alignment/conflicts with this proposal.
  Found the third/fourth "LOD" naming collision (recorded in proposal.md and 2.4 above) this way —
  the doc's Phase 101B section references `ace:telemetry:{id}:lod0` Redis replay directly. Most of
  the rest of that doc's content is either already superseded by later-dated work in this repo
  (it self-flags "historical notes... not current proof unless restated in a later gate table") or
  orthogonal to this proposal (NAPI-RS bridge roadmap, archive/retire promotion gates, Phase
  101A-C content) — no other direct conflicts found in the sections read.

## 2. Follow-up scoping — not started

- [x] 2.1 **Done, 2026-08-23 follow-up pass — major finding.** Read `gpu_resident_executor.py`,
  `gpu_tile_cache.py`, `pytorch_gpu_helpers.py` in full. The pinned-staging chain already exists
  almost exactly as specified (`torch.empty(..., pin_memory=True)` →
  `tensor.to(device, non_blocking=True)` → `torch.index_select`). More importantly, these files
  are part of a much larger staged, gated, partially-applied integration bundle at repo root
  (`parent_atlas_tensor_residency_integration_v2/`, plus an earlier v1) that already covers most
  of this proposal's numerical-working-set and residency-state-machine scope via gates T0-T9 in
  its own `INTEGRATION_ORDER.md`. Its Gate T1 migration (4 `atlas_tensor_*` tables) is confirmed
  **applied but empty** live in Postgres (`docker exec legal-ai-postgres psql ... \dt
  atlas_tensor_*` → 4 tables, 0 rows each) — contradicting the bundle's own `CHECKS.json` which
  claims the migration is unapplied. Full writeup in proposal.md's "Pinned-staging /
  GPU-residency: a whole staged integration bundle already exists" section. **This substantially
  changes the recommended next action for this whole area of the proposal** — see the revised
  priority ranking in section 2 below.
- [x] 2.2 **Done, 2026-08-23 follow-up pass.** Field-by-field diff of the proposal's `AcePacketV2`
  shape against `canonical-packet-envelope.ts`'s `CanonicalAcePacketEnvelope` — see proposal.md's
  new "`AcePacketV2` vs. `CanonicalAcePacketEnvelope` — field-by-field" section. Net finding: the
  existing envelope already has real SOM/domain/community routing, real (differently-shaped)
  revision tracking, and already keeps bulk vector data out-of-band via `mmap_vector_refs`
  (independently arrived at the proposal's own "reference, don't inline" rule). Genuine gaps: no
  numeric ordinal identity field, no residency/LOD field (would be a 4th LOD meaning — see 2.4),
  no explicit policy-scoring fields (`hot`/`nextTopicProbability`/`historicalUtility`). Extending
  the existing type looks more appropriate than a parallel `AcePacketV2` type, but this is still
  an operator call per 2.3, not decided here.
- [ ] 2.3 Decide (operator call, not an agent call per `CLAUDE.md`'s Duplication Prevention
  section): does the evidence-type-axis typed packet model (`SourceEvidencePacket`/
  `AstEvidencePacket`/etc.) replace, layer onto, or project from the existing lane-axis
  `ContextCandidate`/`ContextLane` model? Do not start implementation of typed packet classes
  before this is answered — this is the single highest-risk item for creating a second
  uncoordinated "the" context-compilation system.
- [ ] 2.4 Decide (same caveat): does the 7-level evidence-axis LOD scheme replace or layer onto
  the existing 4-level cache-destination-axis LOD scheme in `packet-lod-manifest.ts`? **Updated
  2026-08-23 follow-up pass**: a third, unrelated "LOD" meaning was found live —
  `parent_atlas_documents.summary_lod0/1/2` (Drizzle schema + real Postgres columns, a
  summary-verbosity axis scoped to one document row, read by `hyperrag-packet-rpc.ts`) plus a
  single-tier `ace:telemetry:{packetId}:lod0` Redis key in `telemetry-compressor.ts`. This
  decision now needs to reconcile three existing "LOD" naming schemes (cache-destination,
  summary-verbosity, telemetry-compression-tier), not two, before layering on a fourth
  (evidence-kind) meaning under the same short name. At minimum, any new LOD axis introduced by
  this proposal should use a distinct term (e.g. `residencyTier`/`evidenceDepth`) rather than
  reusing "LOD" a fourth time, given how much collision the name already has.
- [ ] 2.5 If proceeding with the candidate-ordinal-indexed membership bitmap + `BITOP AND`
  admission-mask capability (lowest-risk item, no conflict with existing `PacketBitmapCache`):
  scope as its own small change, propose a Valkey key naming convention (e.g.
  `ace:membership:{category}:{value}` vs. the existing `atlas:mask:packet:{packetId}`) that's
  unambiguously distinct from the existing per-packet gate bitmap prefix.
- [ ] 2.6 Verify PyTorch's `torch.from_file`-cannot-be-pinned constraint against the actual
  PyTorch version pinned in this repo's Python environment (`requirements*.txt`/`pyproject.toml`)
  — lower priority now that 2.1 found the pinned-staging code already avoids this exact trap
  (stages via `torch.empty(..., pin_memory=True)` + `index_select`, not `torch.from_file` mmap
  directly to pinned), but still worth confirming the version-specific constraint for anyone
  extending that code.
- [ ] 2.7 **New, 2026-08-23 follow-up pass, now the top-priority concrete next action for the
  numerical-working-set slice of this proposal.** Work through
  `parent_atlas_tensor_residency_integration_v2/INTEGRATION_ORDER.md` gates T2 onward against the
  live repo (T0/T1 effectively done — T1's migration is applied, just unpopulated; T0's ownership
  classification is implicitly satisfied by this proposal's own audit work). Start with Gate T2
  (Arrow IPC artifact proof: `feature_matrix_5`, `semantic_768`, `centroids_768`, frozen content
  hash/revision/schema-version) and Gate T3 (exact GPU tile parity against the existing exact
  oracle, before any CAGRA/approximate-index promotion). This is real, scoped, gated work with a
  defined order — prefer it over re-deriving a numerical-working-set design from scratch.
- [ ] 2.8 Reconcile `parent-atlas-tensor-residency-integration/` (v1) against
  `parent_atlas_tensor_residency_integration_v2/` — confirm v2 supersedes v1 (both share the same
  Gate T0-T9 structure and T1 migration filename; v2 adds a "Neural LOD extension order" section
  v1 doesn't have) before working from v2 as canonical, and decide whether v1 should be archived
  per this repo's archive-not-delete convention once confirmed superseded.

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
