# Parent Atlas memory architecture — recorded design freeze (2026-08-23)

## Memory/agent ownership update — 2026-09-05

This updates the existing memory-architecture-freeze owner; no new OpenSpec change or control plane.
The accompanying design addendum and spec scenarios govern the new tasks; historical
findings below remain dated evidence, not a competing current execution queue.

This is a governance recording owner only. The operator resolved the evidence-axis
decision as layering/projection over ContextCandidate/ContextLane. There is one
ContextManifest compiler; this decision does not implement new packet classes.
Use evidenceDepth and residencyTier for new axes, leaving existing LOD APIs intact.

Keep model execution state, exact caches, ACE control, retrieval evidence, statistical
features, external observations, and durable outcomes distinct. Delegate implementation
to the existing owners listed in the reconciliation report; no new memory store,
agent controller, or cross-cutting proposal results from this decision.

Impact: planning/spec/task reconciliation only. Runtime implementation and datastore
mutation are not performed by this update. See tasks.md for pending proof gates.

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

## Addendum (2026-08-29): full data-plane restated, reconciled against a narrowly-scoped gate

Delivered inline in a review-session chat message while `parent-atlas-compiler-semantic-graph-resolution`
(CSGR) was mid-flight. Its explicit purpose: confirm that CSGR's narrow unit-of-work scoping
("CSGR-1 only: shared persistent JSON-RPC client + Atlas resolver contract... no database writes,
no graph revision yet, no 24k scaling") is a **work-boundary, not an architectural deletion** — the
components it doesn't touch this pass (simdjson, MessagePack, Arrow/mmap, BitFrost, ACE packets,
GPU tensor caching, ACP/A2A descriptors) remain part of the data plane this repo already committed
to above; narrowing one change's task list must never be read as narrowing the architecture.

**The restated layer stack** (same three-plane model as this document's "proposed model" section
above, redrawn top-to-bottom as a literal pipeline rather than a layer list):

```
SOURCE / EXTERNAL INPUT
  source files, Graphify JSON/NDJSON, LSP JSON-RPC, Qdrant payload JSON,
  Go/MCP responses, external research
        ↓
FAST PARSE / VALIDATE
  small control JSON  → native Node JSON + Zod
  large JSON/NDJSON    → Rust simd-json or C simdjson, schema-bound decode, OKF/Zod validation
        ↓
CANONICAL CONTROL PLANE
  PostgreSQL 18 (Drizzle/pgx) — sourceRevision, workspaceRevision, packetKey, symbolVersionId,
  HyperRelationV1, CandidateOrdinalMapV1, GraphNodeKeyV1, GraphOrdinalMapV1
        ↓
RETRIEVAL PLANE (vector + graph, parallel)
  pgvector (exact oracle) · Qdrant (semantic_768 projection, sparse challenger lanes) ·
  NetworkX (CPU oracle) · TurboVec (challenger) · cuDF edge list → cuGraph (CAGRA later) ·
  HyperGraph incidence projection
        ↓
FEATURE / GPU PLANE
  CandidateFeatureMatrix — presence bitmaps, semantic_768 rows, graph scores, domain
  probabilities, ontology features, centroid/SOM/topology hints — Arrow IPC/mmap → CUDA-resident
  buffers, addressed via CandidateOrdinalGpuAbi/GraphOrdinalGpuAbi. cuVS/cuGraph/PyTorch/XGBoost
  emit ordinals + scalar scores here — never giant JSON tensors.
        ↓
ACE CONTEXT PLANE
  AcePacket/ACE cards — exact evidence refs, source spans, feature summaries, graph evidence,
  ontology tuples, citations, checksums → ContextManifest → PromptPlan → Ornith synthesis →
  grounded-claim validator (read-only) → DAG mutation barrier
```

**Wire-format layering, restated as a hard split** (extends this document's existing "wire format
layering" section above with the specific codec-per-purpose table the chat message spelled out):

| Format | Used for |
|---|---|
| JSON | configs, receipts, manifests, API/MCP control messages, debugging, small ACE envelopes |
| MessagePack | compact binary control packets, scalar metadata, bounded arrays, ACP/A2A envelopes |
| Arrow IPC / mmap | `CandidateFeatureMatrix`, semantic matrices, edge tables, large columnar batches |
| GPU memory | semantic tensors, feature tensors, eligibility masks, ordinal maps |

The load-bearing distinction is **control serialization vs. numerical storage** — not "JSON is slow,
use MessagePack everywhere." A 2D JSON view of an `N×768` matrix can exist for diagnostics only; the
canonical storage is Arrow/mmap/GPU-resident, never JSON, never MessagePack (unpacking thousands of
scalar values back into an array defeats a compact binary format's purpose either way).

**simdjson's actual place, corrected from a possible over-read of this document's earlier
sections**: simdjson is not a semantic owner and this document never claimed it was — its real job
is bulk NDJSON/JSON streams where its On-Demand API's parse-what-you-touch model pays off (large
Graphify NDJSON, Qdrant dump/audit streams, packet-replay files, external evidence streams, bulk
receipt processing) — never a control-plane JSON hop in front of every few-KB MCP response, where
native `JSON.parse`/Zod is both simpler and not measurably slower. If a Rust sidecar for this is
ever built, name it precisely: **C simdjson** (the original C++ library) vs. **Rust `simd-json`**
(an independent Rust port with Serde compatibility, not a binding around the C library) are
different things and conflating them in code comments or package names would recreate exactly the
kind of naming confusion `CLAUDE.md`'s Duplication Prevention section exists to prevent. A plausible
future service name: `atlas-packet-codec.rs` (Rust `simd-json`, typed Atlas packet structs,
canonical validation, Arrow/MessagePack IPC) — not proposed as a task here, recorded as a naming
convention for whenever it is.

**cuGraph `GraphOrdinal` contract, concrete** — extends this document's existing `CandidateOrdinalMap`
material with the graph-side equivalent, using `cugraph.Graph.from_cudf_edgelist(..., renumber=False,
vertices=..., store_transposed=True)`. `renumber=False` is only valid when vertex IDs are already a
single dense integer column in `[0, V)` — i.e. this is a **requirement on `GraphOrdinalMapV1`**, not
an implementation detail: the ordinal map must assign every vertex (including symbols, concepts, and
relation nodes from hypergraph compilation below) a dense `0..V-1` id before any cuGraph call, or
`renumber=False` silently produces wrong results rather than erroring. The `vertices` argument is
required whenever isolated vertices exist (cuGraph cannot infer them from `src`/`dst` columns alone)
— `GraphOrdinalMapV1` must therefore explicitly enumerate all `V` vertices, not just the ones that
appear in at least one edge. `store_transposed=True` avoids cuGraph computing the transposed
adjacency internally on the first PageRank call — worth setting at graph-construction time if
PageRank is a known downstream consumer, not left as a default. None of this is implemented; this is
a contract requirement recorded before `GraphOrdinalMapV1` is built, so its first implementation
doesn't have to be redone once someone reads the cuGraph constraints.

**HyperGraphRAG n-ary facts compile to an incidence graph, not invented pairwise edges** — restates
this document's `HyperRelationV1`/hyperedge material as a concrete worked compilation example: given
the n-ary fact `(entity A, entity B, relation R17, entity C)`, do not flatten it into pairwise edges
that didn't exist in the source fact. Instead, every entity *and* every relation gets its own
`GraphNodeKey` and therefore its own `GraphOrdinal` — e.g. `symbol S9 → ordinal 0`,
`symbol S22 → ordinal 1`, `concept C7 → ordinal 2`, `relation R17 → ordinal 3` — and the incidence
edges are `(0,3)`, `(1,3)`, `(2,3)` (each entity connects to the relation node, not to each other
directly). cuGraph can then run PageRank/BFS/PPR over this projection without destroying the
original n-ary truth — the relation node itself is what's ranked/traversed, not a synthetic pairwise
fact.

**Postgres/pgvector/Qdrant split, reaffirmed with the specific default behavior that makes it
correct**: pgvector defaults to **exact** nearest-neighbor search; HNSW/IVFFlat are explicit
approximate indexes a query must opt into. That means eligibility filtering (which candidates are
even allowed to be considered) belongs on the Postgres/canonical-identity side by default — Qdrant/
cuVS/GPU are ranking and ANN speed layers on top of an eligibility set Postgres already decided, not
the deciders of eligibility themselves. Qdrant's grouped search (bounding results per parent/tile ID)
is the specific mechanism for preventing multiple tiles from one packet from flooding an ACE context
window — worth using deliberately at the retrieval-plane layer rather than de-duplicating
after the fact in ACE.

**BitFrost/Valkey tensor-residency keying, restated as a contract, not just a Redis key name**:
per this document's existing GPU-resident-executor findings above, residency state should be keyed
by `candidateSnapshotRevision` + `ordinalMapChecksum` + `featureMatrixChecksum` +
`representationRevision` + `deviceId` + `bufferId` + `leaseEpoch` — not by a bare cache-key string.
Two contract names worth freezing for whenever this is built: `ResidentArtifactV1` (the CPU-canonical
artifact once Arrow/mmap → H2D — `semanticMatrix[N×768]`, `featureMatrix[N×F]`, graph vertices/edges,
bitmaps — reusable across cuVS/cuGraph/PyTorch-reranker consumers so nothing re-serializes the same
tensor repeatedly) and `ArtifactAddressV1` (the transport descriptor — `deviceId`, `bufferId`,
`dtype`, `shape`, `checksum`, `leaseEpoch`, `representationRevision` — sent instead of resending a
50MB JSON object). This is where the tensor-residency integration bundle's Gate T4/T5 material
(already found live and gated in this document's earlier sections) should eventually connect.

**PyTorch consumes the feature fabric; it does not synthesize prose** — reaffirms this document's
existing rule-ownership hierarchy: PyTorch's role is domain classifier, query router, reranker,
low-rank heads, RL-policy experiments, dense graph feature heads — i.e. it produces
`CandidateFeatureMatrix` rows, `DecisionVector`s, ordinals, and scalar scores. Natural-language
synthesis, query decomposition, and DAG proposals stay Ornith's job, consuming ACE's already-compiled
evidence — never raw PageRank arrays, raw `semantic_768` rows, raw SOM tensors, or raw cuGraph
buffers sent to a synthesis model directly. This is the same "ACE turns numerical state into bounded
evidence-bearing context" principle this document's `AcePacketV2` section already states, restated
here because it's the reason the already-proven GPU→ACE→ContextManifest path (this document's Gate
T2/T3 findings above) is architecturally load-bearing rather than merely a performance optimization.

**CouchDB stays off the hot query path** — reaffirmed, not new: accepted-immutable-envelope archive,
offline views, MapReduce rollups are fine; adding Postgres+CouchDB+Qdrant+GPU to one query's
execution path would create a second consistency domain this repo's existing "Postgres is truth,
others are mirrors" rule already forbids.

**Correctness spine vs. performance data plane — the separation this addendum exists to make
explicit**: the immediate gate ladder (feature manifest → graph ablation replay →
`CandidateOrdinal` GPU ABI → `GraphOrdinal` GPU ABI → candidate/graph bridge → cuVS/cuGraph parity —
i.e. what CSGR and its sibling changes are actually walking through gate-by-gate right now) is the
correctness-proof sequence. The performance tranche around it (JSON-vs-simdjson profiling where
actually justified by measured volume, Arrow IPC/mmap for GPU-resident tensors, BitFrost residency
keying, compact MessagePack A2A descriptors) is real, already substantially designed and partially
built per this document's findings above, and explicitly **not deleted or deprioritized** by any
single change's narrow task list — it's simply sequenced to be built *around* a correctness spine
that has to exist first, not built instead of one.

## Addendum (2026-08-29, second pass): MODEL-CANON-01 closed, P0–P4 priority queue recorded

**MODEL-CANON-01 (EmbeddingGemma canonicalization cleanup) — verified file-by-file, not
blanket-applied.** Google's `google/embeddinggemma-300m` model card: 2048 max input tokens, 768
output dimensions, MRL options 512/256/128. Four files were checked against a claimed cleanup
list; two claims didn't match current state and were **not** acted on, two were real and fixed:

| File | Claim | Verdict | Action |
|---|---|---|---|
| `sveltekit-frontend/src/lib/server/atlas/neural-routing/encoder-manifest.ts` | Declares `all-MiniLM-L6-v2`/`ms-marco-MiniLM-L-6-v2` | **Not found** — already `google/embeddinggemma-300m` + `mixedbread-ai/mxbai-rerank-base-v2` | None (claim stale/mismatched) |
| `sveltekit-frontend/src/lib/server/ai/ollama-config.ts` | `embeddinggemma` context 8192; `nomic-embed-text` in active fallback | Context **confirmed** wrong (8192). `FALLBACK_CHAIN.embeddings` **already** `['embeddinggemma']` only — `nomic-embed-text` is a dead, unused `MODELS` registry entry, not active | Fixed `contextWindow: 8192 → 2048`. Left the dead registry entry (no active harm, out of scope to remove speculatively) |
| `scripts/launch-embed-server.ps1` | `EMBED_CTX` defaults 4096; searches embeddinggemma→nomic→all-minilm | Both **confirmed exactly** | Fixed default `4096 → 2048` (both the doc comment and the actual `$ctxLen` assignment — the doc comment alone was fixed first and would have been a no-op without the second edit); narrowed the Ollama-manifest auto-discovery loop to `embeddinggemma` only |
| `sveltekit-frontend/scripts/ensure-llama-server.mjs` | Defaults 2048 (claimed already fixed); still auto-discovers Nomic/MiniLM | Context **already correct** (2048, confirmed). No MiniLM anywhere in this file. `resolveOllamaEmbedBlob()`'s manifest scan is already embeddinggemma-only — but a hardcoded `nomic-embed-text-v1.5.Q4_K_M.gguf` local-file fallback path still sat in `EMBED_MODEL_CANDIDATES` | Removed that hardcoded fallback path |

Net state now matches the intended `MODEL-CANON-01` contract: `google/embeddinggemma-300m` is the
sole canonical dense encoder (`semantic_768`, 2048 max input, 768 output dims), no active dense
fallback, `nomic-embed-text`/MiniLM reduced to inert/removed references, `mixedbread-ai/mxbai-rerank-base-v2`
remains the separate cross-encoder reranker (never conflated with the dense encoder).

**Correction on ownership wording, recorded as stated**: EmbeddingGemma should not itself be called
the intent/domain classifier owner. Google positions it as producing vectors suitable for
classification (and ships a classification-oriented prompt), but the PyTorch routing/head layer is
what turns those vectors into actual domain/operation/retrieval/budget decisions — this document's
existing "PyTorch consumes the feature fabric" rule (first 2026-08-29 addendum, above) already
states this; this is the same rule applied specifically to the classification path.

**`GraphOrdinalGpuInputV1` contract** — already recorded in this document's first 2026-08-29
addendum ("cuGraph `GraphOrdinal` contract, concrete"); this pass adds the explicit field list and
reaffirms the hard separation: `storeTransposed`, renumber-buffer layout, cuDF chunk size, and RMM
pool size are runtime/executor choices and **must not** enter `GraphOrdinalMapV1` or canonical
graph identity — matches this document's existing wire-format-layering discipline (control/identity
vs. numeric/runtime state, never collapsed).

**Revised priority queue, recorded for the next session** (supersedes no prior sequencing in this
document — this is new, not a correction):

```
P0  DURABILITY CLEANUP     — MODEL-CANON-01                              DONE (this pass)
P1  LIVE VECTOR GPU        — :8098 CandidateOrdinal decode,               BLOCKED
    BOUNDARY                 CPU-exact ↔ cuVS-exact parity                (verified live 2026-08-29:
                                                                            curl to 127.0.0.1:8098/health
                                                                            unreachable — matches this
                                                                            doc's existing finding that
                                                                            the WSL2 RAPIDS env isn't
                                                                            standing up yet)
P2  LIVE GRAPH GPU         — GraphOrdinalGpuInputV1 → live cuGraph        BLOCKED (same :8098 dependency)
    BOUNDARY                  computation → GraphOrdinal result
P3  IDENTITY BRIDGE        — CandidateOrdinal ↔ packet/canonical          NOT STARTED
                              identity ↔ GraphNodeKey ↔ GraphOrdinal
P4  BEHAVIOR PROOF         — graph-ablation invariant (candidate          NOT STARTED
                              admission/identity fixed, ranking may
                              change) → CPU/GPU parity (tolerance,
                              top-K overlap, rank correlation)
PARALLEL                   — CSGR-2 (this session's own in-progress      IN PROGRESS
                              work, see parent-atlas-compiler-semantic-
                              graph-resolution), symbol identity,
                              feature/pass evidence, relationship
                              coverage expansion
PERFORMANCE (after P0–P4)  — JSON profiling → simdjson (where           NOT STARTED, correctly
                              justified) → Arrow IPC → mmap →             sequenced last per this
                              residency → BitFrost → MessagePack →        document's "correctness
                              ACP/A2A ArtifactAddressV1                   spine first" principle
```

**P1/P2 are honestly blocked, not silently skipped**: confirmed live this session that
`http://127.0.0.1:8098/health` does not respond. This is a real environment gap (the WSL2 RAPIDS
sidecar this document's earlier findings already describe as "reachable... while the Windows
`.venv` PyTorch build reports `cudaAvailable: false`") — not something to fake a result for. Standing
up that environment is a prerequisite for P1/P2, tracked here rather than silently deferred.

## Addendum (2026-08-29, third pass): Ornith's model base and future QLoRA adapter merging

Recorded per operator statement, not yet independently verified against code — flagged as such
until checked in a future session:

**Ornith (this document's "ACE CONTEXT PLANE ... Ornith synthesis" role) is built on Gemma4**,
and will eventually need a **legal-domain LoRA/QLoRA adapter merged in**. That merge is future
work, not started. When it happens, it becomes part of the same stack this document already
separates by layer — not a new plane:

- **BitFrost** — adapter weights (or adapter-swap state) would be a `ResidentArtifactV1`-shaped
  GPU-resident buffer like any other tensor artifact this document already describes (§ "GPU
  cache — cache tensors, don't serialize them repeatedly"), keyed the same way
  (`representationRevision`/`deviceId`/`leaseEpoch`) — not a special case.
- **ACE / HyperGraphRAG** — the adapter changes *how* Ornith synthesizes from an `AcePacket`, not
  what an `AcePacket` contains. This document's existing rule ("ACE turns numerical state into
  bounded evidence-bearing context") is unaffected by which adapter is merged into the base model
  doing that synthesis.
- **Parent Atlas workstation / agentic error-fixing** — an adapter swap is exactly the kind of
  thing this document's memory-swap-by-domain-classification framing already anticipates (route
  to a legal-tuned Ornith instance for legal-domain context, base Gemma4 otherwise) — this is a
  routing decision at the PyTorch classifier layer this document already assigns that role to,
  not a new architectural plane.

**No action taken this pass.** This is a placeholder note so a future session doesn't have to
re-derive where adapter-merging fits from scratch — the actual QLoRA merge work, its training
data, and its promotion gate are all unscoped and unstarted.

## Addendum (2026-08-29, fourth pass): "stop building libraries horizontally — the missing piece is the vertical spine"

Recorded per operator statement, verbatim structure preserved. **No code written this pass** —
this is a governance/queue-freeze record only, same as the third pass above.

**Thesis**: every layer already has real executors (NetworkX/cuGraph, PyTorch/LibTorch/TensorRT
RTX, PostgreSQL/Qdrant/cuVS). The system doesn't need more libraries added horizontally — it needs
one vertical spine every provider obeys: **typed envelope → revision binding → canonical identity
→ ordinal coordinate → executor receipt → ACE evidence.** Without that spine, adding more
executors just adds more competing sources of truth (the exact failure mode `CLAUDE.md`'s
Duplication Prevention section already names).

**Key selectors excluded from the simdjson proof, explicitly and for now**: simdjson's own docs
label key selectors experimental and require C++20; ordinary On-Demand parsing should reach parity
first. Key selectors become a performance challenger only after that.

**`SymbolFeatureAlignmentV1` — flagged as probably the single biggest missing contract.** This is
where AST/NLP/compiler-semantic facts, candidate coordinates, and features finally meet:
`workspaceRevision, sourceRef, sourceRevision, observationId, observationRevision, treeNodeId,
stableSymbolId, symbolVersionId, packetKey, candidateOrdinal, candidateSnapshotRevision,
ordinalMapChecksum, featureRevision, evidenceRefs, alignmentStatus ∈ {SOURCE_ONLY, TREE_BOUND,
SYMBOL_BOUND, PACKET_BOUND, CANDIDATE_BOUND, FULLY_ALIGNED}, alignmentChecksum,
canonicalAuthority: false`. Load-bearing property: **absence is legal, fabrication isn't** — low
AST symbol coverage is a coverage problem, not license to invent symbol IDs. CSGR-2 (this
session's own work, see the sibling `parent-atlas-compiler-semantic-graph-resolution` change)
fills the compiler-semantic-reference-resolution slice of this same envelope.

**Graph: one artifact, multiple executors — not one pipeline per executor.**
`GraphNodeKeyV1`/`GraphOrdinalMapV1`/`GraphProjectionArtifactV1` (dense `0..V-1` ordinals, edge
list, `graphRevision` checksum) is the one canonical projection; NetworkX is the CPU oracle,
direct cuGraph (`from_cudf_edgelist(..., renumber=False, vertices=all_graph_ordinals)`) is the GPU
executor against that *same* projection — do not build a separate NetworkX graph and a separate
cuGraph graph from different pipelines. `nx-cugraph` automatic backend dispatch is explicitly
rejected as the promotion proof (unsupported ops can silently fall back to plain NetworkX,
defeating the point of a GPU/CPU parity check) — use direct NetworkX and direct cuGraph, compare
by `GraphOrdinal`. Keep `astGraphRevision` / `compilerSemanticGraphRevision` /
`relationshipGraphRevision` / `compositeGraphProjectionRevision` as separate revision fields, per
this document's pre-existing revision-binding rule.

**Filtering: `EligibilitySetV1` is the one canonical filter contract, materialized three ways —
not three separate filter systems.** `requestId, candidateSnapshotRevision, ordinalMapChecksum,
filterRevision, filterPolicyChecksum, allowedCandidateOrdinals, eligibilityChecksum`, then
materialized per-executor: Postgres → GIN/B-tree planner bitmap scan (note: Postgres 18's
async-I/O is a planner/executor optimization on top of this, not a new "PostgreSQL AIO bitmap
store" — don't invent one), Qdrant → payload filter/payload indexes, cuVS → bitmap
bitset prefilter (cuVS brute-force already supports per-query bitmap filters and bitset
prefilters natively — this is not something to build from scratch). Future gate named here:
`FILTER_PARITY_01` — same `EligibilitySetV1` must produce matching admissible-ID sets across
Postgres, Qdrant, and cuVS *before* performance is measured.

**Classifier/executor split.** `EmbeddingGemma classification_mrl_128` deterministic query
features feed a `QueryRouterTensorV1` (domain/operation/retrievalNeeds/budget) via a small PyTorch
MLP head — PyTorch is the decision model, not an ontology authority. Reference inference stays
PyTorch first; only then is PyTorch CPU/CUDA compared against LibTorch native-addon and TensorRT
RTX against the same frozen input tensor, recorded as `TensorExecutionReceiptV1`: `modelRevision,
headRevision, inputTensorRevision, executor ∈ {PYTORCH, LIBTORCH_NAPI, TENSORRT_RTX}, device,
dtype, shape, inputChecksum, outputChecksum, maxAbsError, maxRelError, canonicalAuthority: false`.
Explicit conclusion: the existing LibTorch addon is broad enough already — TensorRT RTX is an
alternate optimized executor behind the same contract, not a reason to add another RTX tensor
library in front of it.

**Ontology/hypergraph — this is where the stalled ontology work belongs, and it isn't greenfield.**
AST/LangExtract/LSP/classifier produce an `OntologyCandidateV1` → evidence → validation →
promotion gate → `HyperrelationV1` (PostgreSQL truth, incidence projection into
`GraphNodeKey`/`GraphOrdinal`/cuGraph). Hard rule restated: do not flatten an N-ary relation
(`A relation B concept C`) into invented pairwise truths — store the N-ary relation in Postgres and
create one incidence node for graph execution. Noted as already having real prior art in-repo
(hyperedge contracts, ontology hyperedge synthesis code, KAG hyperedge surfaces, incidence
projection tests) — this is a completion task, not a new capability.

**Multi-hop/SOM/top-K/ACE ordering, frozen**: initial retrieval seeds → exact canonical admission
→ bounded graph expansion → dedup by canonical identity → `CandidateFeatureMatrix` rank → optional
SOM diversity compression → final top-K → ACE `ContextManifest`/`PromptPlan` → Ornith synthesis.
SOM's role is explicitly **compression/diversity/routing, never truth**. Two new receipt contracts
named: `SomSelectionReceiptV1` (`candidateSnapshotRevision, featureMatrixChecksum, somRevision,
inputOrdinals, bmuAssignments, selectionPolicyRevision, selectedOrdinals, selectionChecksum,
canonicalAuthority: false`) and `MultiHopTraversalReceiptV1` (`seedCandidateOrdinals, graphDomain,
graphRevision, hopLimit, edgeTypes, nodeBudget, edgeBudget, visitedGraphOrdinals,
returnedCandidateOrdinals, traversalChecksum`). ACE receives only the bounded evidence these
receipts produce — never the raw SOM matrix or raw graph arrays directly. BitFrost's existing
"revision-bound residency metadata, canonical validation happens before cache registration" role
(already recorded elsewhere in this document) is confirmed as the correct conceptual fit, unchanged.

**Later challengers, explicitly sequenced after correctness, not before**: cuTile (fused numerical
kernels — normalization, projection, SOM BMU search, custom top-K — competing against an
already-proven PyTorch/cuVS/CUDA baseline, not replacing it as a correctness prerequisite; Ampere
compute-capability 8.x is a valid target); QLoRA (a *training* method — 4-bit frozen base + LoRA
adapters, NF4 double-quant, paged optimizers — belongs only after frozen training/eval data exists
and can prove actual synthesis lift; a small router MLP does not need QLoRA — this is the same
adapter-merge future-work already flagged in the third-pass addendum above, now given an explicit
ordering: after eval data, not before); Ewin Tang-style low-rank recommendation sampling (assumes
special ℓ2-sampling query access to a near-low-rank matrix — not a general top-K replacement; if a
genuinely low-rank user×concept/query-family×feature utility matrix ever exists, isolate it as a
`QuantumInspiredRecommendationChallengerV1` benchmarked against exact top-K, never placed directly
in the canonical RAG path).

**Frozen queue (P0–P4), recorded verbatim as the priority order for future sessions**:
- **P0 — Canonical completeness**: `semantic_768` population to 55,853/55,853 revision-bound; AST
  symbol coverage expansion (CSGR-2A source freshness, CSGR-2B — the 111-file manual-SQL-sidecar
  reconciliation, the 259-total/50-undeclared quarantine, remaining regex-correctness fallbacks).
- **P1 — Alignment contracts**: `SIMD_ALIGN_01` (`JsonDecodeProviderV1` ↔ `StructuralObservationV1`
  parser parity), `SYMBOL_ALIGN_01` (`StructuralObservationV1` ↔ `SymbolFeatureAlignmentV1`),
  `FILTER_ABI_01` (`EligibilitySetV1` across Postgres/Qdrant/cuVS).
- **P2 — Executor parity**: `CUVS_EXACT_01` (CPU exact vs. cuVS exact), `GRAPH_PARITY_01` (NetworkX
  direct vs. cuGraph direct), `NATIVE_EXEC_01`/`TRT_RTX_01` (PyTorch vs. LibTorch N-API vs.
  TensorRT RTX).
- **P3 — Knowledge/multi-hop**: `ONTOLOGY_01` (candidate → evidence → promotion gate),
  `HYPERGRAPH_01` (Postgres N-ary truth → incidence projection), `MULTIHOP_01` (bounded
  GraphOrdinal traversal), `SOM_01` (diversity-compression challenger), `ACE_02` (bounded
  graph/ontology facts into `ContextManifest`).
- **P4 — Performance/learning** (deliberately last): Arrow/mmap resident artifacts, RMM reuse,
  cuTile kernels, CAGRA, QLoRA adapters, Tang-style low-rank sampler, other recommendation
  challengers.

**Relationship to this document's existing content**: this addendum does not contradict anything
recorded in the base proposal or the first three addenda — it names concrete contract types
(`SymbolFeatureAlignmentV1`, `GraphNodeKeyV1`/`GraphOrdinalMapV1`/`GraphProjectionArtifactV1`,
`EligibilitySetV1`, `TensorExecutionReceiptV1`, `SomSelectionReceiptV1`,
`MultiHopTraversalReceiptV1`) for the same "typed envelope, revision-bound, canonical-identity"
spine this document already commits to, and gives that spine a frozen build order. **Nothing in
this addendum has been implemented.** The frozen P0–P4 queue supersedes any looser prioritization
implied elsewhere in this document for future planning purposes — P0 (canonical completeness) is
explicitly first, and P4 (performance/learning, including cuTile/CAGRA/QLoRA) is explicitly last.

## Addendum (2026-09-05, fifth pass): lexical/BoW/query-fingerprint layer + Ornith recurrent-state
boundary + SearXNG snapshot durability

Recorded per an inline chat proposal, delivered while `parent-atlas-retrieval-lineage-dag-convergence`
was mid-flight (RETRIEVAL-01L canary + a `combineViaRRF` call-site audit). Per that change's own
scope discipline, none of this was implemented there — recorded here instead, in the document this
repo already designates for exactly this kind of dense cross-cutting memory-architecture proposal.
**No code written this pass.** Audited what already exists before recording, per this document's
own established discipline (see every prior addendum's "what already exists" tables).

**This is a genuinely different axis from the rest of this document.** Everything above this
addendum is about the GPU/numerical working-set plane (tensors, Arrow/mmap, BitFrost residency for
*large binary artifacts*). This addendum is about a plane this document hadn't separately named
yet: **lexical/statistical evidence and external-observation provenance** — cheap, CPU-only, no
GPU involved, sitting logically *between* canonical evidence and the retrieval plane.

**Proposed memory hierarchy (L0–L6), restated as a naming frame, not a new architecture**:
```
L0  MODEL EXECUTION MEMORY   Ornith recurrent state, attention KV, prefix cache — ephemeral, opaque, never canonical
L1  EXACT COMPUTE CACHE      llama.cpp prompt cache, BitFrost/Valkey exact revision-qualified artifacts
L2  ACE CONTROL MEMORY       ContextManifest, playbook/utility/residency decisions
L3  RETRIEVAL MEMORY         PostgreSQL canonical evidence, Qdrant semantic_768, AST/graph, lexical evidence
L4  CORPUS STATISTICAL MEMORY  tsvector/ts_stat/pg_trgm — frequency, lexical clusters
L5  EXTERNAL OBSERVATION MEMORY  SearXNG snapshots, timestamped external documents
L6  DURABLE OUTCOMES         execution receipts, packet utility, analysis-pass history
```
**Mapping to what this document already names**: L1 = this document's existing `ResidentArtifactV1`/
`ArtifactAddressV1`/BitFrost-residency material (first addendum) — not a new contract, a new label
on an already-recorded one. L2 = this document's existing `ContextManifest`/`AcePacketV2` material
(base proposal + first addendum). L3 = this document's existing retrieval-plane pipeline (first
addendum's restated data-plane diagram) plus `SymbolFeatureAlignmentV1`/`EligibilitySetV1` (fourth
addendum). L6 = `TensorExecutionReceiptV1`/`SomSelectionReceiptV1`/`MultiHopTraversalReceiptV1`
(fourth addendum), generalized as a pattern rather than GPU-specific. **L0, L4, and L5 are the
genuinely new material this addendum adds** — nothing already recorded in this document covers
Ornith's recurrent-state boundary, corpus-statistical lexical memory, or search-snapshot
durability.

**L0 — Ornith recurrent state is an execution accelerator, never a knowledge store, hard rule.**
Ornith runs on Qwen3.5-family architecture; current llama.cpp work maintains an explicit hybrid
recurrent cache for Gated DeltaNet-style layers alongside ordinary attention KV state, and
llama-server already exposes `cache_prompt`/`cache_reuse N` (prompt caching, prefix reuse) as
documented, currently-usable features — this repo's CLAUDE.md already mandates `cache-prompt on` /
`cache-reuse 256` in the canonical llama-server startup contract, so the mechanism is already
turned on; what's missing is a checksum-bound identity for *what* is being reused. Hard rule,
stated precisely because it's checkable against upstream's own stated constraints: current
llama.cpp discussion of Gated DeltaNet-style recurrent state describes rewinding it as **not**
equivalent to rewinding a conventional Transformer KV cache, and describes general external
state-injection/restore as an active, unresolved implementation concern upstream — so **do not**
build a "save Ornith's recurrent state to BitFrost, restore it later" feature yet. Use
server-managed prefix reuse only; treat recurrent/KV state as opaque and never persist it as
Parent Atlas knowledge (this restates, for Ornith specifically, the base proposal's existing
"no hidden thoughts/KV cache/tensor state in any store" rule already enforced elsewhere in
CLAUDE.md and this repo's `AGENTS.md`).

**`OrnithPrefixIdentityV1` (named, not built)**: `sha256(modelRevision, chatTemplateRevision,
toolSchemaRevision, systemPromptRevision, contextManifestPrefixChecksum)`. Same exact prefix
identity → safe to let llama.cpp's own `cache_reuse` fire; any difference (different ACE context,
different tools, different template, different model) → new prefix identity, no reuse assumed.
Explicitly **not** identity: session id, wall-clock timestamp, or "similar-looking query" — those
are telemetry fields (`cacheUsed: true/false`, `cacheIdentity`) recorded for performance
observability, never part of a correctness proof. llama.cpp's own documentation already notes
prompt-caching can introduce small nondeterminism from differing batch sizes between prompt
processing and generation — another reason this stays a performance signal, not a correctness
input.

**L4 — `LexicalFingerprintV1` (named, not built) — PostgreSQL is already enough; no new sparse
subsystem needed.** Confirmed live via grep: `to_tsvector`/`websearch_to_tsquery`-based FTS already
exists across 30+ call sites (`postgres-lexical-scorer.ts`, `bm25-search.ts`, `search-lanes.ts`,
etc.) and pg_trgm-based fuzzy/DYM matching is already an established pattern per this repo's own
"Key Lessons" section. **Genuinely missing**: `ts_stat()` — PostgreSQL's per-lexeme corpus
statistics function (document frequency, total occurrence count per word) — is not used anywhere
in this repo (grep for it found zero hits, distinct from the 34-file `to_tsvector`/
`websearch_to_tsquery` hit set checked above). This is the piece that would let a cheap
IDF-style discriminative-word signal exist (`idf(word) = log((corpusDocumentCount+1) /
documentFrequency(word))`) without adding Elasticsearch, SPLADE, or any new sparse-vector service
— explicitly recorded as **not needed unless an evaluation proves value**, matching this document's
existing "don't add a 5th lane" discipline (CLAUDE.md's own Hyper-graph-RAG section already states
this for retrieval lanes generally; this addendum applies the same discipline to lexical/BoW
specifically). Proposed shape: `LexicalFingerprintV1 { candidateId, sourceRevision, lexemes,
lexemeFrequencies, documentFrequencies, topLexemes }`. Word/lexical clustering (cheap: hashed
top-N weighted lexeme vector; better: reuse the existing `semantic_768` KMeans/SOM machinery this
document already names elsewhere) is scoped as a **routing feature only** — `clusterId` selects
which region of candidate space to prefetch first, it is never candidate identity or a retrieval
vote, matching this document's existing SOM-is-routing-not-truth rule (fourth addendum).

**L5 — `SearchSnapshotV1` (named, not built) — SearXNG/LDR integration already exists extensively;
the durable snapshot contract does not.** Confirmed live via grep: SearXNG/LDR is wired across 35+
files (`ldr-orchestrator.ts`, `web-search.ts`, `research_tools.ts`, MCP tool handlers, an
ACE bridge at `ldr-ace-bridge.ts`) — this is not a capability gap, and nothing here proposes
building web search. Read `web-search.ts`'s existing `WebSearchResult`/`WebSearchResponse` types
directly: they carry `title`/`url`/`snippet`/`source`/`provider`/`searchMs` — no checksum, no
`observedAt`, no reproducibility contract, no `canonicalAuthority` marker. That absence is the real
gap: today a web-search result is a live, non-reproducible side effect, not a durable, revision-
bound observation. Proposed shape (never implemented, matching this document's naming-only
convention for unbuilt contracts): `SearchSnapshotV1 { query, normalizedQuery, queryChecksum,
categories, engines, language, timeRange, observedAt, results: [{rank, url, canonicalUrl, title,
snippet, engine, publishedAt}], resultSetChecksum, snapshotChecksum, canonicalAuthority: false }`.
**Hard rule**: a SearXNG/web-search snippet is discovery evidence, never canonical document
evidence — per this document's own existing "don't let raw external state become knowledge"
principle (restated here for external search specifically, having already been stated for GPU/
model state above): the correct path is snapshot → fetch the real source URL → content hash → the
same canonical evidence/chunk pipeline this document already describes for source files, not
"persist the SearXNG snippet text as if it were retrieved document content." Timestamps
(`observedAt`/`lastAccessedAt`/`expiresAt`) are recency/TTL/decay metadata on the observation, per
this document's existing revision-vs-recency distinction (base proposal's LOD section already
separates "cache destination" from "content identity"; this is the same separation applied to
external observations) — never part of the snapshot's own identity, which is
`queryChecksum + searchConfigRevision + resultSetChecksum` only.

**`QueryFingerprintV1` (named, not built)** — the thing that would let L3/L4/L5 actually
cooperate: `{ queryChecksum, normalizedLexemes, rareLexemes, trigramFingerprint,
lexicalClusterId, semanticVectorRef, semanticClusterId, observedAt }`. Purpose: cheap routing hint
("this looks like a Qdrant-projection question, prefetch that lexical cluster first"), explicitly
**not** an identity or authorization boundary — same fail-open/non-authoritative posture this
document already requires of `TANG_INSPIRED_LOW_RANK_SHORTLIST` and SOM clustering elsewhere.

**Explicitly not decided or built by this addendum** (same discipline as every prior addendum):
whether `OrnithPrefixIdentityV1`/`LexicalFingerprintV1`/`SearchSnapshotV1`/`QueryFingerprintV1` get
built at all, their storage location specifics beyond "BitFrost/Valkey for the exact-cache layer,
Postgres for corpus statistics," and sequencing relative to the existing frozen P0–P4 queue (fourth
addendum) — this addendum's material is additive to that queue, not a reordering of it, and the
operator should decide where it slots in rather than have that decided here.

## Addendum (2026-09-05, sixth pass): "8 convergence gates" collapse — spot-checked, not taken on
faith; one real internal contradiction found

An inline chat message proposed reading this document's entire L0–L10/P0–P4 material through a
BUILT/PARTIAL/MISSING lens and collapsing the remaining work into 8 named convergence gates,
arguing the core claim: **the architecture already exists; what's missing is one current,
revision-qualified control path connecting already-built pieces — not new machinery.** That
framing matches this document's own repeated finding across all five prior addenda (most things
"missing" turned out to already exist, just unwired/uncensused) closely enough that it was
spot-checked against live code rather than recorded on faith, per this document's own discipline.

**The 8 gates, as proposed** (kept verbatim as a reference frame, not independently re-derived):

| # | Gate | Collapses |
|---|---|---|
| 1 | Current source snapshot | `PKT-LINEAGE-08B` — **now resolved**, see `parent-atlas-retrieval-lineage-dag-convergence/tasks.md`'s `PKT-LINEAGE-08B0` section (tolerance-window selector, `CURRENT_SOURCE_EVIDENCE_AUTHORITY_PROVEN` live-proven same day) |
| 2 | RF7 fusion migration | One logical semantic vote — owned by `parent-atlas-retrieval-fusion-reachability` (`RF6`/`RF7`, already the correct owner, not new) |
| 3 | ACE feature source | domain_fit + query + structural + graph → one `CandidateFeatureSnapshot` — owned by `parent-atlas-candidate-feature-execution-fabric` |
| 4 | Residency control | ACE → BitFrost/Valkey HOT/WARM/COLD bridge — **PARTIAL_OWNER_FOUND, corrected below** |
| 5 | Current graph/tuple projection | KAG/hyperedges/ontology → Neo4j current projection — **`atlas_ontology_tuples` confirmed live at 0 rows** (see below), so this gate is real, not hypothetical |
| 6 | Representation routing | semantic_768 → latent_256 → derived 128/64 → KMeans/SOM → centroid/Topology4 — **RESOLVED**: `latent_64` confirmed a slice of `latent_256` (see below) |
| 7 | Context runtime | ContextManifest → OpenCode → Ornith prefix reuse — overlaps this document's own L0 material (fifth addendum) and `AGENT-ORCHESTRATION-BOUNDARY-01` (`parent-atlas-retrieval-lineage-dag-convergence`) |
| 8 | Agent program optimization | RouteTrace/evals → DSPy → GEPA — **FULL_OWNER_FOUND, corrected below** |

**Spot-check results (Explore agent, this session, read-only) — 3 confirmed accurate, 1 partially
wrong, 1 unverifiable-as-stated, 1 real internal contradiction found and not yet resolved**:

- **Valkey hot-vector index — CONFIRMED, but the claim overstates it.** The message says "Valkey
  natively supports HNSW/FLAT" and cites `atlas_hot_vectors_v1` as already-appropriate. Real and
  live (`scripts/atlas/ensure-valkey-hot-vector-index.mjs`, `sveltekit-frontend/scripts/atlas/
  smoke-atlas-hot-vectors.mjs`, decision doc at `openspec/changes/atlas-hot-vector-schema-decision/`)
  — but only **FLAT** is actually configured (`FT.CREATE ... VECTOR FLAT`), not HNSW; the decision
  doc deliberately chose FLAT ("small working set, no HNSW build/tuning needed"). Don't cite HNSW as
  in use here.
- **`ClusterCard` "~1,906 stored cards" — NOT FOUND, treat as unverified/possibly stale.** The
  `cluster_cards` table and `ClusterCard` contract are real
  (`sveltekit-frontend/src/lib/server/retrieval/cluster-card-contract.ts`,
  `scripts/atlas/load-cluster-cards-postgres.mjs`), but no code or report anywhere states a current
  count of 1,906 — the only "1906" grep hit was an unrelated hash key in a different JSON file. A
  live `SELECT COUNT(*) FROM cluster_cards` should replace this number before any
  `CLUSTER-CARD-CURRENTNESS-01` gate (named below) is built against it.
- **`atlas_hyperedges`/`atlas_hyperedge_members`/`atlas_ontology_tuples` — CONFIRMED to exist, and
  the ontology-empty caveat the message itself flagged turned out to be correct.** Live per
  `docs/reports/atlas-kag-persistence-v1.json` (2026-08-27): `atlas_hyperedges` = 62,802 rows,
  `atlas_hyperedge_members` = 125,604 rows, **`atlas_ontology_tuples` = 0 rows.** The message's own
  instinct ("your older state had populated hyperedges while ontology tuples were empty — re-census,
  don't assume") is confirmed still true as of this check, not stale advice.
- **AE latent stack (`latent_256` PHYSICAL → `latent_128`/`latent_64` DERIVED via slice+renormalize)
  — genuinely wrong on `latent_128`, and surfaces a real, unresolved contradiction on `latent_64`
  that predates this pass and should be resolved before building anything further on it.**
  `latent_256` is real and live (55,169 rows, matches this document's fourth-addendum material).
  **`latent_128` does not exist as a persisted column or Qdrant collection anywhere** — confirmed
  across `drizzle/schema.ts`, `schema-postgres.ts`, and the backfill script's own docstring. Calling
  it "DERIVED" implies a stored, addressable representation; it is at most a transient in-memory
  slice computed on demand, never persisted — a materially different claim from what's built for
  `latent_256`/`latent_64`. **`latent_64` is real and populated (HNSW-indexed,
  `idx_codebase_chunk_latent64_hnsw`) but this repo's own code disagrees with itself about how it's
  produced**: `sveltekit-frontend/src/lib/server/retrieval/latent-derive.ts` and the original
  migration comment (`drizzle/manual/latent_256_columns.sql`) describe it as a cheap
  slice-and-renormalize of `latent_256` computed at read time (matching the message's proposed
  lineage); a later, dated correction in `schema-postgres.ts` (~2026-09-02, citing
  "LATENT-SCHEMA-ALIGN-01") and `python/backfill_latent_256.py` instead describe it as **a
  separate, independently-learned output of the same autoencoder forward pass, persisted
  directly** — not a slice of `latent_256` at all. This also means the root `CLAUDE.md` note dated
  2026-08-30 ("latent_64 column exists but zero rows populated, autoencoder untrained") is now
  stale/superseded and should not be trusted without a fresh live row-count check. **Not resolved
  here** — flagging the contradiction is the deliverable of this spot-check, not picking a side;
  whichever story is true materially changes gate 6's invalidation semantics (a slice needs no
  separate training/backfill job when `latent_256` changes; an independently-learned output does).
- **The three named gates the message proposed (`CLUSTER-CARD-CURRENTNESS-01`,
  `NEO4J-CURRENT-PROJECTION-01`, `GLYPH-CHR97-MAPPING-01`) are genuinely novel** — confirmed via
  repo-wide grep, none exist under any name in `openspec/changes/` or elsewhere. No conflict to
  reconcile if any of them are opened later.

**Recorded, not decided**: whether to open the 3 novel gates above as their own OpenSpec changes,
whether gates 4 and 8 (residency-control bridge, agent-program optimization) need a first
audit-before-build pass the way gates 1/2/3/5/6/7 already have owners or partial owners, and how to
resolve the `latent_64` provenance contradiction (read the two disagreeing code paths directly and
pick one, or run a live check on which one actually produced the 55,169 populated rows) before any
work depends on its derivation semantics.

**`latent_64` resolution — CONFIRMED live, not just leaned (2026-09-05).** Web-researched lean:
standard Matryoshka Representation Learning is a true prefix slice of one shared encoder output —
no separate training, no per-scale head. This repo's own established convention for the *other*
nested-truncation lane already documented in this file (`semantic_768 → 512/256/128`, first
addendum + CLAUDE.md's Embedding Dimensions Policy) is plain slice + L2-renormalize — matching the
**older** `latent_64` code path (`latent-derive.ts`/original migration comment), not the newer
"LATENT-SCHEMA-ALIGN-01" separately-learned claim.

**Checked directly against live data, same day** (`scripts/atlas/check-latent64-derivation-v1.mjs`,
new, read-only, kept): sampled 10 real `codebase_chunk_index` rows with both `latent_256` and
`latent_64` populated, computed slice-and-L2-renormalize of `latent_256[:64]` in JS, compared
against the stored `latent_64` value for the same row. **Cosine similarity ≥ 0.9999999 on every
sample**, with the small residual (`maxDelta` ~1e-4 on a unit vector) matching exactly the rounding
noise expected from `halfvec`'s float16-backed storage — not a sign of a genuinely different vector
(an independently-trained encoder converging to near-identical unit vectors across 10 unrelated
samples by coincidence is not a plausible alternative explanation). **Verdict:
`LATENT_64_IS_SLICE_OF_LATENT_256`.** The newer "LATENT-SCHEMA-ALIGN-01" comment describing a
separately-learned output is incorrect (or describes a code path that isn't what actually produced
the live data) and should not be trusted for invalidation-semantics decisions; `latent_64` requires
no separate training/backfill job when `latent_256` changes — it is safe to treat as a pure
derived view.

Sources: [Matryoshka Embedding: Nested Representations](https://www.emergentmind.com/topics/matryoshka-embedding),
[Matryoshka Representation Learning, Explained — Supermemory](https://supermemory.ai/blog/matryoshka-representation-learning-the-ultimate-guide-how-we-use-it/),
[Learning Multi-Level Features with Matryoshka Sparse Autoencoders](https://arxiv.org/pdf/2503.17547)

## Addendum (2026-09-05, seventh pass): gates 4 and 8 ownership audit — "no named owner yet" was
wrong for both, per this document's own duplication-prevention discipline

The sixth addendum recorded gates 4 (residency control) and 8 (agent program optimization) as
having no named OpenSpec owner "not yet independently audited this pass." Per this repo's own hard
rule ("a file existing is not evidence it's live, check for callers... before implementing any new
owner of a capability, grep first"), that gap was checked with an Explore pass before treating
either as genuinely open. Both were wrong to leave unaudited.

**Gate 4 (ACE→BitFrost/Valkey residency control) — PARTIAL_OWNER_FOUND.** A real, live, tested
`LodPromotionDecisionV1` residency-decision contract already exists at
`sveltekit-frontend/src/lib/server/atlas/tensors/lod-promotion-contract.ts`, owned by
`openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy/tasks.md` (gates `BF-LOD-01`
through `BF-LOD-06`). It has exactly the shape this gate describes: a pure Zod-validated decision
with `from`/`to` residency+representation tiers (`COLD`/`WARM`/`HOT` ×
`FP32_MMAP`/`FP16`/`TURBO_4BIT`/etc.), reason codes (`VRAM_PRESSURE`, `LOW_REUSE`,
`POLICY_EXPIRED`, `REVISION_INVALIDATION`), utility scoring, byte accounting, and revision lineage
— `BF-LOD-01`/`BF-LOD-02` already checked off (implemented + Zod-validated), `BF-LOD-03`–`BF-LOD-06`
still open (Postgres receipt persistence, WARM↔HOT↔COLD transition proofs, utility-input
separation, packet-content bounding). Separately, `parent-atlas-tensor-residency-integration/
tasks.md` independently implements a GPU-tile-specific residency state machine
(`COLD→MMAPPED→PINNED→GPU_RESIDENT→IN_USE→DEMOTED`), and `atlas-hot-vector-schema-decision/`
documents the Valkey hot-vector-index side with "zero real consumers" as of its own writing. **What
this document's gate-4 framing still gets right**: no single artifact routes an ACE-selected
candidate across all three named stores (Valkey HOT / BitFrost WARM-exact / Qdrant-Postgres COLD)
in one decision call yet — `LodPromotionDecisionV1` is the closest real owner (representation/tier
promotion generically) but the explicit three-store routing bridge this document names is not
wired as one path. **Correct framing going forward**: extend `parent-atlas-retrieval-lod-algorithm-
taxonomy`'s `BF-LOD-03`–`06` work to close this gap — do not open a second residency-decision
contract.

**Gate 8 (Agent program optimization — RouteTrace/evals→DSPy→GEPA) — FULL_OWNER_FOUND.**
`openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/` already exists as a complete
named change (proposal.md, design.md, tasks.md, specs/) whose scope is exactly this pipeline:
validator-receipt/evidence-quality feedback → `RepairProgramV1` (DSPy `Signature`/`Module`/
`Predict`) → GEPA (`metric`, `reflection_lm`, `log_dir`, `track_stats`, `seed`) → held-out-set
promotion gate. Concrete implementation already exists (`python/parent_atlas_dspy_repair.py`,
`build_gepa_optimizer_v1()`), though most gates are `NOT_PROVEN`/blocked pending a live DSPy/GEPA
runtime (`DSPY-SIDECAR-01`, `GEPA-VERSION-01`, `GEPA-HELDOUT-01`, `GEPA-SHADOW-01`). That same
tasks.md already names `execution_utility`/RouteTrace as blocked on a missing `packet_key` column
in `trace_runs` — a real, already-tracked gap, not a new one. **This document's "no named owner
yet" claim for gate 8 was simply incorrect** — the capability was already claimed and scaffolded
before this freeze document's sixth addendum existed. Any future work on gate 8 belongs in
`parent-atlas-compute-rank-cache-eval-dspy-gepa`, not a new change.

No code written this pass; both corrections are ownership-record fixes only.
