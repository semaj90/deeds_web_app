# Headroom Compression, Cryptographic Provenance, and Registry Alignment

> **Status**: APPROVED ARCHITECTURAL SYNTHESIS  
> **Date**: October 1, 2026  
> **Scope**: Synthesis of Headroom-style context compression, Parent Atlas cryptographic provenance chains, Pokémon ROM-bank / LUT presentation layers, UUID/canonical key hierarchies, and OpenSpec EVF ledger integration.

---

## 1. Executive Summary & Problem Framing

Modern LLM workflows face two competing constraints:
1. **Context Window & Token Transport Efficiency**: LLM context windows (and inference economics) demand sending as little text as possible (compressing JSON, ASTs, tool outputs, and retrieved chunks).
2. **Cryptographic Grounding & Non-Repudiation**: Enterprise and legal AI requires answering: *"Can we prove deterministically which exact source bytes and verified claims produced this model response?"*

Systems like Netflix's **Headroom** solve for transport compression through Content-Conscious Reduction (CCR) and local reversible caching. **Parent Atlas / EVF** solves for cryptographic provenance using SHA-256 content-addressed revisions across every layer.

This document establishes the formal synthesis:
> **Headroom-style compression is strictly an *admitted-context transformation stage* located downstream of the ContextManifest authority boundary.** It reduces token costs without ever becoming a canonical identity owner or mutating upstream evidence hashes.

---

## 2. The Provenance Chain vs. Context Compression

### 2.1 The 7-Layer Provenance Spine

In Parent Atlas, SHA-256 digests (`sha256:<64-hex>`) serve as immutable content fingerprints. Each layer has a distinct identity:

```text
1. Source Bytes (disk / repo)
       ↓  SHA-256 (exact file bytes)
   sourceRevision

2. Canonical Identity & Ordering
       ↓  SHA-256 (workspaceRevision + candidate identities + ordinals + source revisions)
   CandidateOrdinalMapV1 (ordinalMapChecksum)

3. Evidence Selection (ACE Gate)
       ↓  SHA-256 (ordinalChecksum + selected ordinals + source revisions + feature revisions)
   AcePacketV3 / EvidenceCards (evidenceSetChecksum)

4. Context Manifest Boundary
       ↓  SHA-256 (canonical serialization of admitted evidence)
   ContextManifestV1 (manifestChecksum)  <-- [AUTHORITY BOUNDARY]

5. Context Compression (Headroom Layer)
       ↓  Deterministic pruning / AST mini-records / schema compression
   ContextCompressionV1 (compressedChecksum, canonicalAuthority: false)

6. Content-Addressed Caching (BitFrost)
       ↓  Cache Key = sha256(manifestChecksum + compressionPolicyRevision)
   BitFrost Key

7. Prompt Plan & Synthesis
       ↓  Token-budgeted prompt layout
   PromptPlanV1 → Ornith (:8090 / llama-server)
```

### 2.2 Authority Invariants
- **`canonicalAuthority: false`**: The compression stage never promotes, invents, or alters canonical IDs.
- **Reversibility (`evidenceRef` + `inputChecksum`)**: Every compressed segment carries the pointer to the original uncompressed evidence chunk and the exact hash of the input prior to reduction.
- **Cache Invalidation by Nature**: When source bytes change, `sourceRevision` changes $\to$ `ordinalMapChecksum` changes $\to$ `manifestChecksum` changes $\to$ BitFrost key changes automatically, preventing stale context reuse.

---

## 3. Reconciliation: Pokémon ROM-Bank, LUTs, UUIDs, and Registries

### 3.1 The "Pokémon ROM-Bank" Frame in Perspective
Historically, the codebase explored "Pokémon ROM-bank" integer encoding (`scripts/atlas/build-compressed-packets.mjs`, `derive-lod-summaries.mjs`, and Addendum 9):
- **Full Object**: Warm PostgreSQL row.
- **Compressed Integer Packet**: `{ s: 4182, f: 17, t: [3, 9, 22], q: 91, k: 5 }`.
- **Dictionaries**: `feature_code` (feature_id $\to$ int), `tag_code` (tag $\to$ int), `source_id` (source_ref $\to$ int).

### 3.2 What the ROM-Bank / LUT Frame Actually Is (and Is Not)
1. **Presentation & Cache Layer Only**:
   - `sveltekit-frontend/src/lib/server/atlas/residency/packet-class-lut-v1.ts` (`PacketClassLutV1`) proves byte/nibble look-up tables (LUTs) assign deterministic byte codes (0..255) for cache density.
   - It carries `canonicalAuthority: false` and `sourceLabelSetChecksum`.
2. **Never a Canonical Identity Authority**:
   - No code ties "Dex 0–151" to arbitrary UUIDs as primary keys.
   - Integer dictionary codes are projection addresses valid only within a specific dictionary revision (`isLutRevisionCurrent`).

### 3.3 The Four Identity Classes

| Identity Class | Example | Role | Mutability | Storage |
|---|---|---|---|---|
| **Surrogate PK** | `task_pk = 18492`, `id = 4182` | Relational join performance | System-generated, internal | Postgres serial / bigint |
| **Canonical Key** | `openspec://root/.../EVF-03A`, `repo_id`, `chunk_id` | Stable logical entity address | Immutable per entity | Ledger / Tables |
| **Claim / Content Hash** | `sha256:f52a8b...` | Content-addressed version of bytes/claim | Immutable per edit | Revision fields |
| **Projection / LUT Code** | `{ s: 4182, f: 17 }`, byte code `0x1F` | Compressed transport / token cache | Ephemeral to dictionary revision | Redis / BitFrost / Packet LUT |

---

## 4. Experiment Registry & Representation Contract

PostgreSQL `atlas_representations` defines model representations (e.g. `semantic_768`, dimension sizes, pooling, tokenizer revisions). It is **not** an artifact registry for individual chunk binaries.

To support per-packet compressed artifacts cleanly:
1. **Representation Authority**: `atlas_representations` defines the contract (`representation_id`, dimensions, upstream model).
2. **Artifact Registry**: A dedicated relation (`packet_key` $\times$ `representation_id` $\times$ `revision` $\to$ storage address / checksum) stores addresses in SeaweedFS or local scratch without polluting the core ontology.
3. **Vector Hierarchy Enforcement**:
   - `semantic_768`: Canonical dense embedding root.
   - `semantic_512` / `256` / `128`: Derived Matryoshka (MRL) prefixes referencing the parent 768 hash.
   - `latent_64` / `128`: Separate manifold/topological routing family.
   - `384` / `383`: Legacy or invalid; rejected at mutation boundaries.

---

## 5. OpenSpec Tasks Integration (`tasks.md`)

The following work items operationalize these findings across the OpenSpec task queue:

### Work Package: EVF-03 & Context Compression Integration

- [ ] **EVF-03A-ID-RECOVER**: Implement deterministic task identity recovery mapping in `scripts/atlas/audit-openspec-evidence-fabric-v1.mjs`. Emit mapping artifact classifying all 6,984 unstable tasks into `DECLARED_ID`, `LEGACY_ID_RECOVERED`, or `DERIVED_STABLE_KEY`. Ensure zero collisions.
  <!-- wfu: depends=; est=45; reads=openspec/changes/**/tasks.md; writes=docs/reports/openspec-evidence/task-identity-map-v1.json -->

- [ ] **EVF-03B-RECEIPT-TYPING**: Implement deterministic typing of the 1,042 receipt candidates (`STATIC_AUDIT`, `UNIT_TEST`, `INTEGRATION_TEST`, `DRY_RUN`, `CONTROLLED_APPLY`, `READBACK`, `UNKNOWN`). Require payload schema validation before promoting `CANDIDATE_TYPE`.
  <!-- wfu: depends=EVF-03A-ID-RECOVER; est=30; reads=docs/reports/**,scripts/atlas/**; writes=docs/reports/openspec-evidence/receipt-types-v1.json -->

- [ ] **EVF-03C-ORPHAN-BINDING**: Execute ranked multi-pass binding for the 886 orphan receipts against recovered canonical task keys and claim revisions (`sha256(scope + change + claim)`).
  <!-- wfu: depends=EVF-03B-RECEIPT-TYPING; est=45; reads=docs/reports/openspec-evidence/**; writes=docs/reports/openspec-evidence/receipt-binding-v1.json -->

- [x] **CTX-COMPRESS-01**: Defined `ContextCompressionV1` schema in `sveltekit-frontend/src/lib/server/atlas/context/context-compression-v1.ts`. Enforces `canonicalAuthority: false`, input `manifestChecksum`, and per-segment `evidenceRef` + `inputChecksum`. Evidence: `context-compression-v1.spec.ts` passes (strict schema, SHA-256 digests).
  <!-- wfu: depends=; est=30; reads=sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts; writes=sveltekit-frontend/src/lib/server/atlas/context/context-compression-v1.ts -->

- [x] **CTX-COMPRESS-02**: Wired `ContextCompressionV1` into `fanout-context-compiler-v1.ts` via `compressFanoutContextV1`. Verified compressed prompt retains links to original source spans for LOD expansion. Evidence: `context-compression-v1.spec.ts` passes (preserves evidenceRefs and reversibleRefs).
  <!-- wfu: depends=CTX-COMPRESS-01; est=40; reads=sveltekit-frontend/src/lib/server/atlas/context/**; writes=sveltekit-frontend/src/lib/server/atlas/context/fanout-context-compiler-v1.ts -->

- [x] **BITFROST-CACHE-01**: Updated BitFrost L2 cache key generator `buildCompressedContextCacheKeyV1` to use `sha256(manifestChecksum + ":" + compressionPolicyRevision)`. Proved automatic cache invalidation upon source revision bump. Evidence: `context-compression-v1.spec.ts` passes (hash drift triggers clean cache miss).
  <!-- wfu: depends=CTX-COMPRESS-01; est=25; reads=sveltekit-frontend/src/lib/server/atlas/**; writes=sveltekit-frontend/src/lib/server/cache/bitfrost-context-cache.ts -->

- [x] **LUT-REGISTRY-ALIGN-01**: Verified `PacketClassLutV1` integrates with `build-compressed-packets.mjs` strictly as a presentation projection without substituting UUIDs or canonical packet keys. Evidence: `compressed-packets-lut-align.spec.ts` passes (dictionary round-trip, drift detection, non-canonical authority).
  <!-- wfu: depends=; est=20; reads=scripts/atlas/build-compressed-packets.mjs,sveltekit-frontend/src/lib/server/atlas/residency/packet-class-lut-v1.ts; writes=scripts/atlas/build-compressed-packets.mjs -->

---

## 6. OpenCode Skill Contract

```yaml
likely_cause: Created architectural alignment document synthesizing Headroom context compression, SHA-256 provenance chains, Pokémon ROM-bank LUT presentation, and OpenSpec EVF ledger tasks.
evidence:
  - "memory/reference_pokemon_rombank_lod_frame.md"
  - "openspec/changes/parent-atlas-memory-architecture-freeze/tasks.md"
  - "openspec/changes/parent-atlas-kv-cache-adaptation-research/tasks.md"
  - "scripts/atlas/build-compressed-packets.mjs"
  - "sveltekit-frontend/src/lib/server/atlas/residency/packet-class-lut-v1.ts"
  - "docs/architecture/UNIFIED-ID-HIERARCHY-AND-RETRIEVAL.md"
patch_targets:
  - "docs/architecture/HEADROOM-COMPRESSION-CRYPTO-PROVENANCE-ALIGNMENT.md"
safe_next_command: "node --check scripts/atlas/audit-openspec-evidence-fabric-v1.mjs"
smoke_command: "npx tsx scripts/atlas/audit-openspec-evidence-fabric-v1.mjs --check-only"
report_path: "docs/architecture/HEADROOM-COMPRESSION-CRYPTO-PROVENANCE-ALIGNMENT.md"
```
