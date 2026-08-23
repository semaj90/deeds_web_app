# Parent Atlas memory architecture — recorded design freeze (2026-08-23)

**Status**: RECORDED, not yet implemented. This document captures an architectural design
proposal delivered inline in a review-session chat message, plus a same-session audit of what of
it already exists in the codebase. It is a governance record, not a build plan — see "What's
actually new" below for the delta worth scoping into real tasks.

## Why this exists

The proposal separates three things that were "starting to blur together": evidence semantics,
memory representation, and execution policy. It's dense (14 sub-sections) and touches nearly every
layer of Parent Atlas — recording it once, cleanly, and cross-checking it against what's live
avoids re-deriving or re-litigating it piecemeal in future sessions, and avoids the exact
duplicate-owner failure mode this repo's own `CLAUDE.md` "Duplication Prevention" section warns
about (5 competing PageRank implementations, 4 nonexistent relationship types, etc. — see that
section for the pattern this is trying to avoid repeating).

## The proposed model (verbatim structure, condensed)

**Three canonical layers**:
1. **CANONICAL EVIDENCE** — source bytes, Tree-sitter/ast-grep facts, Graphify identities,
   Postgres revisions, typed hyperedges.
2. **RETRIEVAL/ROUTING** — Go BM25 exact lexical, semantic_768, SOM, AST relations, PPR/PageRank,
   Leiden concept/domain taxonomy.
3. **NUMERICAL WORKING SET** — CPU mmap matrices, `CandidateOrdinalMap`, bounded pinned staging
   buffers, RTX tensors (PyTorch primary, cuGraph/cuTile optional/challenger).
4. **POLICY/SYNTHESIS** — `SamplingDecision`, ACE residency hints, `ContextManifest` DAG
   synthesis, RLM agent.

**Rule ownership hierarchy** (who gets to decide "is this a function / is this the caller"):
`regex` (cheap textual prefilter/fallback only) → `ripgrep` (exact source location search) →
`ast-grep` YAML rules (deterministic AST evidence, canonical decision-maker) → Tree-sitter sidecar
(complete structural extraction) → Graphify identity (durable structural facts) → model/RLM
(reasoning over evidence, never structural authority). ast-grep's own docs describe its
programmatic Node/Python API as useful for computations awkward in the YAML rule language, but
that API is explicitly labeled experimental — so the proposal's ordering is YAML-CLI-first,
programmatic-API-second.

**Memory/transfer pipeline** (the actual falsifiable technical claims, worth stating precisely
since they're checkable against PyTorch's own documented constraints):
- COLD: Arrow/raw FP32 `mmap`, ordinal gather.
- WARM: ordinary contiguous CPU tensor, copy of selected rows.
- PINNED STAGING: page-locked, bounded, reusable slab; `tensor.to(..., non_blocking=True)` on a
  CUDA stream.
- HOT: GPU-resident contiguous CUDA tensor.
- **Constraint the proposal calls out explicitly**: PyTorch's own docs state a file-backed
  `torch.from_file` mmap tensor **cannot currently be created pinned** — so a design that assumes
  `mmap(semantic_768) → direct pinned → zero-copy GPU` is not a supported PyTorch path. The
  pipeline must instead be `mmap → index_select(ordinals) → bounded CPU staging tensor → pin →
  copy into a reusable pinned slab → async H2D`. **Not independently verified against the current
  PyTorch version pinned in this repo's Python env as part of this recording pass** — flagged as
  a checkable claim for whoever implements the pinned-staging tier, not asserted as re-verified
  fact here.

**LOD as a residency contract, not a precision knob** — 7 levels (LOD0 identity-only through LOD6
fully-hydrated `ContextManifest`), each carrying more bytes: LOD0 ordinal/packetKey/revision (tens
of bytes) → LOD1 routing (SOM/domain/concept/community flags) → LOD2 latent (`latent_64`/
`latent_128`) → LOD3 semantic (`semantic_768` selected row) → LOD4 structural (AST neighborhood,
hyperedges) → LOD5 evidence (source span, diagnostics, tests) → LOD6 generation context (fully
hydrated manifest). Framed via an NES CHR/OAM analogy: ACE's hot descriptor is the OAM sprite
entry (tiny, an index into elsewhere), the actual payload (semantic_768, source, graph) is CHR
pattern memory loaded only when the descriptor is referenced. **Explicitly an architectural
analogy, not a literal encoding scheme.**

**Bitmap intersection as CPU-side admission-mask generation**: per-category Valkey bitmaps keyed
by candidate ordinal position (`ace:domain:bitmap`, `ace:concept:bitmap`, `ace:som:bitmap`,
`ace:leiden:bitmap`, `ace:hot:bitmap`, `ace:has_ast:bitmap`, `ace:has_source:bitmap`) —
`BITOP AND` across several of these produces a candidate admission mask (e.g. "concept=CUDA AND
domain=GPU AND HOT AND has_ast") entirely on the CPU/Valkey side, before PyTorch ever sees a
candidate. Only the resulting compact ordinal/bitmask goes to the GPU.

**Wire format layering** (the core "don't couple these" argument): JSON for the logical/evolving
packet schema (`AcePacketV2` — ordinal, revision, routing (som/leiden/domain), lod
(resident/recommended), policy (hot/nextTopicProbability/historicalUtility), artifact (ordinal
references only — **not** the actual `semantic_768` vector inline)); MessagePack later, as a codec
switch on the *same* logical schema, once it's stable, for descriptors only; Arrow IPC / raw FP32
mmap / PyTorch tensors for actual numeric matrices — never MessagePack for bulk numeric data
(unpacking thousands of scalar MessagePack values back into arrays defeats the point).

**Tang-inspired low-rank sampling, named honestly**: the proposal explicitly says don't call it
"Tang's algorithm" — freeze the constant/identifier as `TANG_INSPIRED_LOW_RANK_SHORTLIST`, since
the actual cited result (efficient ℓ2-norm sampling / low-rank approximation sampling) is being
adapted as a shortlisting heuristic, not reproduced as the original paper's algorithm. Its role in
the DAG is explicitly bounded: it decides which *already-valid* candidates deserve more
computation; it never decides which evidence is true (that's ast-grep/Tree-sitter/Graphify's job,
per the rule-ownership hierarchy above).

**Query compilation as a real function pipeline** (`compile_query`): intent classify → concept
classify → lexical (Go BM25) → AST candidates (ast-grep, intent-conditioned) → semantic (KNN) →
canonical union (lexical + AST + semantic) → graph expand → feature matrix materialize →
Tang-inspired shortlist (with explicit per-lane preserve floors: semantic_top=32, lexical_top=32,
ast_exact=True, graph_frontier=32) → exact-promote → residency-recommend → next-topic predict →
`build_context_manifest`.

**Typed packet classes for the DAG synthesis stage**, replacing ad hoc string concatenation:
`IntentPacket`, `CandidateSummaryPacket`, `SourceEvidencePacket`, `AstEvidencePacket`,
`GraphEvidencePacket`, `HyperedgePacket`, `DiagnosticPacket`, `ExecutionReceiptPacket`,
`ConstraintPacket` — each with a deterministic ordering key (`packet_type_priority,
candidate_rank, canonical_id, evidence_start_byte`) so synthesis output is reproducible from the
same inputs.

**The one-line summary the proposal itself gives**: "JSON/MessagePack describe things. Bitmaps
select things. Ordinals address things. mmap stores large things. Pinned memory stages things.
CUDA tensors compute things. ACE decides which things should stay warm." — i.e. don't let
serialization, caching, retrieval, and canonical identity collapse into one coupled system.

## What already exists (audited live, 2026-08-23, this session)

This is the part that matters most for not duplicating work. Checked before writing anything else
into this document, per this repo's own "audit before you build" rule:

| Proposed concept | What's actually live | Relationship |
|---|---|---|
| `ContextManifest` / typed packet DAG | `sveltekit-frontend/src/lib/server/ace/context-compiler.parent-atlas.ts` — real, working `ContextManifest`/`CompiledContext`/`ContextCandidate` types, `compileContext()`, `scoreContextCandidate()`, `mergeDuplicateCandidates()`. Its own bridge file's header comment (`ace-context-manifest.ts`) literally says "already-designed `ContextManifest` contract... previously unwired — zero production callers" | **Adjacent, not identical.** Organizes by `ContextLane = 'exact' \| 'lexical' \| 'dense' \| 'graph' \| 'bitfrost'` (retrieval-lane axis), not by the proposal's evidence-type axis (`SourceEvidencePacket`/`AstEvidencePacket`/`GraphEvidencePacket`/etc.). Adopting the proposal's packet-class model would be a rearchitecture of an existing, working-but-underused system, not a greenfield build. |
| `CandidateOrdinalMap` / ordinal addressing | `sveltekit-frontend/src/lib/server/atlas/features/candidate-feature-*` (columnar-v1, gemm-v1, gpu-pack-v1, gpu-resident-lease-v1, row-v1, snapshot-v1, arrow-readback), `sveltekit-frontend/src/lib/server/atlas/evidence/pre-fanout-evidence-bundle-v1.ts` | **Already substantially built.** Ordinal-addressed candidate feature matrices, GPU-resident leasing, and Arrow readback already exist as a real subsystem — this is much further along than the proposal's framing suggests. |
| LOD residency contract | `sveltekit-frontend/src/lib/runtime-cache/packet-lod-manifest.ts` + `contracts.ts` (`PacketLodManifest`, `LOD_LEVELS`), `determineLod()` | **Exists, different granularity.** Current LOD is 4 levels (0-3), keyed by *cache destination* (`browser-l1`/`valkey-hot`/`valkey-warm`/`analytics-only`/`cold-archive`), not by *evidence kind* (identity/routing/latent/semantic/structural/evidence/generation). The proposal's 7-level LOD0-6 scheme is a genuinely different axis — could layer on top of or replace the existing 0-3 scheme, needs an explicit decision, not a silent parallel system. |
| **LOD naming, third and fourth instances** (found during the 2026-08-23 follow-up pass, below) | `parent_atlas_documents.summary_lod0/summary_lod1/summary_lod2` (Drizzle schema at `src/lib/server/db/schema/parent-atlas-documents.ts:39-41`, real Postgres columns with a `idx_pad_lod1` index); `hyperrag-packet-rpc.ts`'s `summary_lod0`/`summary_lod1` read/select (reads the same columns); `ace:telemetry:{packetId}:lod0` Redis key in `telemetry-compressor.ts` (single-tier "most compact" NES-style integer-coded packet, not part of a real 0-3 ladder in that file); `prompt-packet.ts`'s `opencode:file:v1:{sourceRef}` comment mentioning `lod1Summary`. | **A third, unrelated axis**, missed by the original 2026-08-23 audit pass because the grep pattern (`\bLOD\b`) doesn't match `lod0`/`lod1` as a suffix on another word. This one is a **summary-verbosity axis** (0=shortest, 2=longest/full document summary) scoped to a single `parent_atlas_documents` row — not a cache-destination axis (`packet-lod-manifest.ts`) and not an evidence-kind axis (this proposal). Three genuinely different "LOD" meanings now confirmed live in the codebase under the same short name. This raises the stakes on tasks.md 2.4 — reconciling needs to cover three existing systems, not two, before any fourth (this proposal's) is added. |
| Bitmap-based candidate filtering | `sveltekit-frontend/src/lib/server/cache/packet-bitmap.ts` (`PacketBitmapCache`) — `SETBIT`/`GETBIT`/`BITOP`/`BITCOUNT` already wired via ioredis | **Different purpose, not a duplicate.** Existing bitmaps are **per-packet gate flags** (one bitmap key per packet, 8 bits = 8 readiness gates like `featureIdPresent`/`aceCacheHit`/`embeddingExists`). The proposal wants **per-category candidate-membership bitmaps** (one bitmap key per domain/concept/SOM-cell/etc., where bit position = candidate ordinal), intersected via `BITOP AND` to generate an admission mask across a candidate set. These are orthogonal indexing axes — implementing the proposal's version is a genuinely new capability, not a rename of the existing one. Both can coexist under different key prefixes. |
| Pinned-memory / CUDA staging pipeline | `sveltekit-frontend/python/parent_atlas_tensor/gpu_resident_executor.py` (288 lines), `gpu_tile_cache.py`, `pytorch_gpu_helpers.py` | **Already substantially implements the proposal's exact chain**, read in full during the 2026-08-23 follow-up pass — see dedicated section below. |
| ast-grep as structural authority (vs. regex/NLP as classifier) | Consistent with this repo's existing `CLAUDE.md` rule ("AST corpus parity", Tree-sitter/ast-grep sections) and the whole CRLF-span-compat fix earlier this session | **Already the repo's stated direction**, not a new decision — this proposal's ownership hierarchy formalizes what the codebase's own conventions already assume. No conflict. |
| Tang-inspired low-rank sampling | No existing implementation found (grep for "tang"/"low-rank sampling"/"l2-norm sampling" turned up unrelated matches — component names containing similar substrings, not a real hit) | **Genuinely new.** Nothing to reconcile against; this is a fresh capability if built. |
| `AcePacketV2` JSON shape (ordinal/revision/routing/lod/policy/artifact) | `canonical-packet-envelope.ts`'s `CanonicalAcePacketEnvelope` (read in full during the 2026-08-23 follow-up pass) — see field-by-field comparison below | **Compared field-by-field, follow-up pass.** Substantial real overlap, some genuine gaps. |

### `AcePacketV2` vs. `CanonicalAcePacketEnvelope` — field-by-field (2026-08-23 follow-up pass)

Read `sveltekit-frontend/src/lib/server/ace/canonical-packet-envelope.ts` in full. It already
exports a real, Zod-validated `CanonicalAcePacketEnvelope` type with a snake_case/camelCase dual-key
row parser (`CanonicalAcePacketEnvelopeRow`). Comparison against the proposal's `AcePacketV2` shape
(`ordinal`, `revision.{workspace,graph,representation}`, `routing.{som,leiden,domain}`,
`lod.{resident,recommended}`, `policy.{hot,nextTopicProbability,historicalUtility}`,
`artifact.{semanticOrdinal,featureOrdinal}`):

| Proposal field | Existing equivalent | Verdict |
|---|---|---|
| `ordinal` (numeric candidate ordinal) | none — identity is `packet_key`/`packet_id`/`packet_ulid` (string-keyed) | **Gap.** No numeric ordinal field on the envelope itself; ordinals live in the separate `candidate-feature-*` subsystem (see table above), not on this packet type. |
| `revision.workspace` (sha256) | none directly, but `source_revision` (string) + `representation_revision` (int) exist | **Partial.** Two revision fields exist but neither is a workspace-level hash; a `workspace` scope isn't represented at all on this envelope. |
| `revision.graph` (sha256) | none | **Gap.** |
| `revision.representation` (sha256) | `representation_id` (string) + `representation_revision` (int) — close, but an id+int-revision pair, not a sha256 | **Partial, different encoding.** |
| `routing.som` | `som_cell`, `som_row`, `som_col` | **Exists, more granular** (cell/row/col vs. a single value). |
| `routing.leiden` | `community_id` (string \| number) | **Likely the same concept under a different name** — Leiden community detection typically produces exactly this kind of community id; not confirmed the writer actually runs Leiden vs. some other community algorithm, but the field slot exists. |
| `routing.domain` | `domain`, `domain_class` | **Exists**, arguably more expressive (two fields vs. one). |
| `lod.resident` / `lod.recommended` | none on this envelope — `lane_status`/`evidence_state`/`knowledge_resolution` exist but are a different state machine (promotion/trust status, not residency tier) | **Gap**, and also the LOD-naming-collision problem from above — adding `lod` fields here would be a *fourth* "LOD" meaning on top of the three already found. |
| `policy.hot` | none directly — closest is `lane_status === 'ACTIVE'` | **Gap**, arguably already partially expressible via `lane_status`. |
| `policy.nextTopicProbability` | none | **Gap**, genuinely new. |
| `policy.historicalUtility` | `page_rank_score` (number) — a different metric, not utility/reward history | **Gap**, `page_rank_score` is graph authority, not usage-based utility. |
| `artifact.semanticOrdinal` / `featureOrdinal` (ordinal references, not inline vectors) | `mmap_vector_refs`, `columnar_tables`, `packed_arrays` — **the existing envelope already follows the proposal's own "reference, don't inline" rule** for bulk vector data | **Already aligned in spirit**, though not ordinal-typed specifically — these are string ref arrays, not typed ordinal fields. |

**Net assessment**: the existing envelope is not a rough sketch — it already has real SOM/domain/
community routing, real revision tracking (differently shaped), and already keeps vector data
out-of-band via `mmap_vector_refs` (independently arriving at the proposal's own "don't inline
bulk numeric data" rule). The genuine gaps are: no numeric ordinal identity, no residency/LOD
field, and no explicit policy-scoring fields (`hot`/`nextTopicProbability`/`historicalUtility`).
Extending this existing type with those fields looks more appropriate than introducing a parallel
`AcePacketV2` type — but per tasks.md 2.3, this is exactly the kind of call that needs an explicit
decision, not an assumption.

### Pinned-staging / GPU-residency: a whole staged integration bundle already exists (major finding)

`sveltekit-frontend/python/parent_atlas_tensor/gpu_resident_executor.py` (a real,
checksum-verified, schema-versioned `CandidateFeatureGpuExecutor` — leases GPU buffers by opaque
ID, never returns raw CUDA pointers, deliberately no CUDA IPC export yet) already implements
**almost exactly** the proposal's specified chain:

```
torch.empty(tensor.shape, dtype=tensor.dtype, pin_memory=True)        # pinned staging tensor
tensor.to(self.device, non_blocking=True)                             # async H2D on a CUDA stream
torch.index_select(tensor, 0, indices)                                # ordinal gather
```

(same pattern repeated in `gpu_tile_cache.py` and `pytorch_gpu_helpers.py`). This is the proposal's
`mmap → index_select(ordinals) → bounded CPU staging → pin → async H2D` chain, already live code,
not aspirational.

**Bigger finding**: these three files are part of a much larger **staged, gated, unapplied
integration bundle checked into the repo root** —
`parent_atlas_tensor_residency_integration_v2/` (and an earlier `parent-atlas-tensor-residency-
integration/` v1) — delivered from an external working container (per its own
`IMPORT_STATUS.md`: "generated in the ChatGPT working container... not verified as copied into
[this repo]"). Its `INTEGRATION_ORDER.md` defines gates T0-T9 plus a "Neural LOD extension order"
that **already covers most of this proposal's scope end to end**:
- Gate T0 explicitly requires the same `CANONICAL_OWNER`/`BACKEND`/`ADAPTER`/`EXPERIMENT`/
  `COMPATIBILITY`/`DEAD` classification vocabulary as this repo's own `CLAUDE.md` Duplication
  Prevention section — this bundle was written with awareness of that governance rule.
- Gate T2/T3: Arrow IPC artifacts (`feature_matrix_5`, `semantic_768`, `centroids_768`) with frozen
  content hash/revision/schema-version, staged → GPU → exact cosine/top-k parity proof before any
  approximate-index (CAGRA) promotion — directly matches this proposal's "PyTorch is reference,
  cuTile/CAGRA is challenger" ordering.
- Gate T4: `COLD → MMAPPED → PINNED → GPU_RESIDENT → IN_USE → DEMOTED` — a **residency state
  machine that is effectively the proposal's LOD/residency contract already named and staged**,
  independently arriving at the same shape (ACE picks the logical tile, CUDA allocators pick
  physical addresses — same "ACE decides which things stay warm" principle from the proposal's own
  closing line).
- Gate T5: Valkey/BitFrost mirrors small metadata only (tile manifests, hot candidate IDs,
  centroid IDs, residency state, invalidation versions) — same "descriptors in JSON/cache, bulk
  data elsewhere" rule this proposal states as its core wire-format principle.
- Gate T9: explicitly warns NES/PS2-style glyph/LOD visualization must stay a derived debug view,
  never written back as semantic identity — directly relevant given this proposal's own NES-CHR/OAM
  analogy; this bundle's authors evidently hit the same analogy independently and already flagged
  the risk of taking it too literally.

**Live status, checked 2026-08-23**: `docker exec legal-ai-postgres psql ... \dt atlas_tensor_*`
confirms Gate T1's migration (`atlas_tensor_artifacts`, `atlas_tensor_tiles`,
`atlas_tensor_tile_members`, `atlas_tensor_residency_events`) **is applied** — all 4 tables exist —
but **all 4 have zero rows**. Per this repo's own status-language convention: **CREATED**, not
**WIRED** or further. This directly contradicts the bundle's own `CHECKS.json`, which claims
`"migration": "confirmed unapplied, as intended at that checkpoint"` — another instance of a
delivered package's self-reported status not matching live reality, consistent with this session's
recurring finding pattern from the two earlier external review packages. `gpu_tile_cache.py` and
`pytorch_gpu_helpers.py` are byte-identical between the bundle and the live tree (`diff -q`
confirmed, zero output) — i.e. **already copied in**, despite `IMPORT_STATUS.md` saying copy status
is unverified.

**This changes the recommended next step substantially**: rather than treating "candidate-ordinal
bitmap admission masking" and "pinned-staging chain" as two separate small tasks to scope fresh
(as the original 2026-08-23 audit pass assumed), the more accurate framing is that **a mature,
already-gated integration plan for most of this proposal's numerical-working-set layer already
exists**. This bundle was not found by the original audit pass because it lives at repo root under
a name (`parent_atlas_tensor_residency_integration_v2/`) that doesn't contain "LOD", "bitmap",
"pinned", or "ordinal" — only found via `find` for the specific Python filenames while completing
task 2.1.

**Correction, same-day follow-up**: the file-application state is further along than first
assessed. A full pass diffing every non-spec TypeScript file in the bundle against the live tree
found **26 of 29 byte-identical**, and the 3 that differ are **live-ahead of the bundle**, not
behind it (e.g. `tensor-artifact-contract.ts` is 124 lines live vs. 39 in the bundle — the live
repo kept developing this system past the bundle's snapshot). So this isn't "an unapplied bundle
to work through" — it's a substantially-already-merged system whose Gates T2/T3 just hadn't been
*exercised and verified* yet. Fixed that directly: ran `python -m parent_atlas_tensor.cli
build-feature` for real (Gate T2 — built and round-trip-verified a real `feature_matrix_5` Arrow
IPC artifact) and called `GpuTileCache.promote()`/`.exact_cosine()` directly for real (Gate T3 —
staged a 200×768 matrix through the actual pinned-memory→async-H2D path onto the live RTX 3060 Ti,
computed exact GPU cosine top-10, and confirmed an exact index match against an independent CPU
oracle, float diff 7.45e-9). Full receipt at
`docs/reports/tensor-residency-gate-t2-t3-proof-2026-08-23.json`; details in tasks.md 2.7.

**Gate T4 also run, same-day follow-up — PASS, with a real gap found.** Wired
`ace-residency-policy.ts`'s actual `tileUtility()`/`rankEvictionCandidates()` (confirmed zero
other production callers before writing this proof, matching the same "designed but unwired"
pattern found earlier for `ContextManifest`) to compute a real residency decision over 5 synthetic
tiles under a memory budget that fits only ~2, wrote the decision as JSON, then drove the real
`GpuTileCache` on the live RTX 3060 Ti with it. **The first attempt got the wrong answer**:
promoting tiles in ACE's utility-*descending* order (the natural reading of "promote ACE's ranked
tiles") silently kept the *lowest*-utility tiles resident and evicted the highest-utility ones —
because `GpuTileCache` is a plain LRU cache and its docstring specifies the caller must promote in
*ascending*-utility order for LRU recency to align with ACE's ranking. No exception, no warning —
just the exactly-backwards outcome. The second attempt (ascending order, per the documented
convention) matched ACE's prediction exactly on the real GPU. Full evidence for both runs:
`docs/reports/tensor-residency-gate-t4-proof-2026-08-23.json`; details in tasks.md 2.9.

**Fixed same-day (tasks.md 2.10)**: added `GpuTileCache.promote_ranked()` — takes ACE's natural
descending-utility order and performs the ascending-order LRU reversal internally, closing the
footgun rather than leaving it as a documentation-only convention. Confirmed zero other callers of
`promote()` existed, so this was a safe API addition. Added
`python/parent_atlas_tensor/test_gpu_tile_cache.py` — this module had **zero** test coverage
before; now has 3 tests, including a permanent regression guard for the exact failure mode this
proof found and a permanent version of the Gate T3 exact-cosine-vs-CPU-oracle check. 12/12 tests
pass across this Python package (up from the 9 that existed before this proof pass touched it).

**Gate T6 also run, same-day follow-up — real negative result, gate correctly blocks promotion.**
RAPIDS/cuVS is Linux-only on this workstation (per this repo's own WSL2/`atlas-rapids-cu13`
guidance); ran `python -m parent_atlas_tensor.prove_gate_t6` under WSL2 with cuVS 26.06.00.
**Step 1 (cuVS `brute_force` exact search)**: 100% recall against an independent CPU numpy oracle
at both 5,000 and 15,000 rows — the GPU exact-search path is trustworthy, matching Gate T3's own
finding. **Step 2 (CAGRA approximate, measured against that same brute-force result, never against
itself)**: recall dropped from 77% at 5,000 rows to 45% at 15,000 rows with default
`IndexParams`/`SearchParams` — *worse*, not better, with more data — and CAGRA was slower than
brute-force at both scales on this 8GB GPU (VRAM was constrained during this run, ~1.2GB free,
`llama-server.exe` holding ~5.8GB, capping the test at 15,000 rows rather than the real corpus's
40K-105K scale). Per Gate T3/T6's own stated precondition ("No CAGRA promotion before this
passes"), **CAGRA is correctly NOT cleared for promotion** with default parameters at the scales
tested — this is the gate doing its job, not a failed proof attempt. Full receipt:
`docs/reports/tensor-residency-gate-t6-proof-2026-08-23.json`.

This is a genuinely useful negative result for the roadmap: if/when CAGRA is revisited, it needs
either (a) tuned `graph_degree`/`intermediate_graph_degree`/`itopk_size` parameters (library
defaults were used here, untuned), or (b) testing at real corpus scale with a full 8GB budget
free, before it can be considered a viable `codebase_chunks_768`/`_768_v2` ANN backend — brute-force
`exact_cosine` (already proven in Gate T3) remains the trustworthy path in the meantime.

### The headline finding: this entire subsystem has zero entry point into production

Before running any more gates, audited whether the tensor-residency system this session has been
proving gate-by-gate is actually reachable from anything real. It is not, and this is the single
most important finding in this whole exploration.

**Every one of the 34 non-spec TypeScript files under `src/lib/server/atlas/tensors/`** (plus
`lod-glyph-contract.ts`) **was checked for imports from anywhere outside that directory** —
`src/routes/`, `src/lib/server/ace/`, `src/lib/server/retrieval/`, and the rest of
`src/lib/server/atlas/` — **and found zero**. `npx vitest run tests/atlas/tensor-residency/` passes
(8 files, 11 tests), but these are shallow structural tests exercising the modules in isolation,
not proof that anything in the live app calls them. Every T2/T3/T4 PASS and the T6 correctly-FAIL
result this session produced were obtained by writing bespoke proof scripts that invoke the
Python/TypeScript modules directly — **none of that machinery is wired into a real request path**.
3 files (`cache-tier-contract.ts`, `gpu-backend-contract.ts`, `metrics-registry.ts`) are pure
type/constant declarations with no runtime logic whatsoever — `CREATED` status only, per this
repo's own convention, not even minimally implemented.

**Separately confirmed there IS a real, live, production-reachable GPU path, unrelated to this
subsystem**: `src/routes/api/v1/chat/completions` (via `openai-facade.ts`) →
`attention-head-ranker.ts` → `LibTorchReranker` (`src/lib/server/ai/libtorch-reranker.ts`) → the
native LibTorch N-API bridge (`tensorrt_bridge.node`, C++, in-process, zero-copy Float32Array
handoff). This does stateless per-call candidate scoring — no persistent GPU-resident tile cache,
no residency/LOD/eviction concept at all. Architecturally different from `parent_atlas_tensor`
(which is specifically about keeping large matrices GPU-resident *across* requests to amortize
transfer cost) — plausibly complementary rather than duplicate in purpose, but **there is zero
evidence anyone has decided how, or whether, the two should connect**. Today the simpler, already-
wired path does 100% of the real production GPU reranking work, and the far more elaborate,
individually-gate-proven residency system contributes exactly nothing to any live request.

**What this means for "finishing the pipeline"**: the T2/T3/T4/T6 proofs this session ran are real
and valuable — they establish the *mechanisms* are correct (Arrow artifacts round-trip exactly,
GPU tile staging and eviction work correctly when driven correctly, CAGRA isn't ready at tested
scale). But a mechanism with no caller delivers zero user-facing value no matter how many more
gates pass. Continuing to grind through T5/T7/T8/T9 without first deciding the integration
question would be proving more mechanisms in isolation, not finishing anything. See tasks.md 2.14
for the three candidate framings of what `parent_atlas_tensor`'s relationship to the live
`LibTorchReranker` path should be — this is explicitly an operator decision, not something decided
in this document, per `CLAUDE.md`'s Duplication Prevention section (don't silently pick a
`CANONICAL_OWNER` between two systems that might both have a legitimate role).

## What's actually new and worth scoping (the real delta)

Ranked by how clearly novel vs. how much rearchitecture of working systems it implies:

1. **Candidate-ordinal-indexed membership bitmaps + `BITOP AND` admission masking** — genuinely
   new, doesn't conflict with the existing per-packet gate bitmap, clear scope (new Valkey key
   prefix, new module alongside `packet-bitmap.ts`, not a rewrite of it).
2. **`TANG_INSPIRED_LOW_RANK_SHORTLIST`** — genuinely new, no existing owner, but needs its actual
   math/heuristic worked out (this proposal names the *role* in the DAG, not an implementation).
3. **Evidence-type-axis typed packet classes for DAG synthesis** — real value (deterministic
   ordering, reproducible synthesis) but requires deciding whether it *replaces* the existing
   lane-axis `ContextCandidate`/`ContextLane` model in `context-compiler.parent-atlas.ts`, sits
   alongside it, or is expressed as a projection/view over it. This is the highest-risk item to
   get wrong (two competing "the" context-compilation systems is exactly the failure mode
   `CLAUDE.md`'s Duplication Prevention section exists to prevent) and should not be started
   without an explicit `CANONICAL_OWNER` decision per that section's classification vocabulary.
4. **7-level evidence-axis LOD vs. existing 4-level cache-destination-axis LOD** — needs the same
   explicit reconciliation as #3, same reasoning.
5. **Pinned-staging mmap→CPU→pin→H2D chain** — may already substantially exist in
   `gpu_resident_executor.py`/`gpu_tile_cache.py`; read those before writing anything new.
6. **The wire-format layering rule itself** (JSON for descriptors, MessagePack as a later codec
   swap on the same schema, Arrow/mmap/tensors for numeric bulk data, never MessagePack for
   matrices) — this is a **governance rule**, not a build task. Worth adding to `CLAUDE.md` or a
   referenced doc so future sessions don't reach for MessagePack as a numeric-array format by
   habit. Zero implementation cost, real ongoing value.

## Explicitly not decided by this document

This document records the proposal and the audit; it does **not** rule on:
- Whether the evidence-type-axis packet model replaces or layers onto the existing lane-axis
  `ContextManifest`.
- Whether the 7-level LOD scheme replaces or layers onto the existing 4-level cache-destination
  LOD scheme.
- Implementation priority/sequencing beyond the informal ranking above.

Those are exactly the kind of consequential, hard-to-reverse-if-wrong decisions this repo's own
`CLAUDE.md` says should get an explicit `CANONICAL_OWNER` classification before code is written —
deferred to whoever scopes the actual implementation tasks, informed by this record.
