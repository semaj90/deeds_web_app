# Tasks: NES LUT single owner (Track A)

Scope: one owner for the domain-to-byte palette used by the AST router, the ACE compiler, and the Node palette.
Status vocabulary: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN / BLOCKED. Nothing here is done from aspiration.

## Audit baseline (2026-10-23, read-only)

| Owner | Role | Field | Current values |
|---|---|---|---|
| `scripts/atlas/lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs` (`NES_LUT_DOMAIN_PALETTE`) | Palette definition owner | `lutByte`, `nesHex` | 10 domains; `lutByte` 0x01–0x0A, `general` = 0x0A; zero reserved |
| `python/atlas_compute/ast_chunk_routing_helpers.py` (`NES_DOMAIN_LUT`) | AST router | `lut_byte` | `auth`..`ml` = 0x01–0x09, `svelte5_runes` = 0x2A, `unresolved` = 0x00 |
| `python/parent_atlas_learning/ace_compiler.py` (`NES_LUT_PALETTES`) | Duplicate owner | `byte` (= NES hex) | 10 domains; agrees with the .mjs on 2 of 10 `nesHex` (`auth` 0x16, `ui` 0x2A) |

Historical collisions found and corrected:
- `general` and `UNRESOLVED` both used 0x00 (`.mjs` palette vs router); `general` is now 0x0A.
- `retrieval` is 0x21 in the .mjs and 0x1A in `ace_compiler.py`. Eight of ten hex values disagree.
- `ace_compiler.py` `byte` also feeds a Redis key, `bitfrost:centroid:lru:cuml-kmeans-k16-{byte}`, so changing it is a cache-key migration.

## Tasks

- [x] **NLUT-01 Decide the byte map.** `0x00` is unresolved only; `general` is `0x0A`. `svelte5_runes` is a `ui` sub-label: its domain byte is `0x02`, while its NES color remains `0x2A`.
- [x] **NLUT-02 Generate the canonical artifact.** The `.mjs` owner generates `scripts/atlas/data/nes-domain-palette-v1.json` with `lutByte`, `nesHex`, `label`, `priorWeight`, revision and a payload checksum. Current artifact checksum: `sha256:e1b8ccdc6661a3faed3316cf276f01dd16a1edf80a9aba2d465def40461b9b0f`.
- [x] **NLUT-03 Router reads the artifact.** Both AST router versions load the generated map. The Python fixture verifies unresolved `0x00` and rune `ui/0x02` plus separate `nes_hex=0x2A`.
- [x] **NLUT-04 ACE compiler reads the artifact.** ACE returns distinct `lut_byte` and `nes_hex`; OaK tuple uses the canonical NES color. Centroid keys are palette-revision-namespaced; existing Redis keys are not migrated or written.
- [x] **NLUT-05 Drift gate.** Node checks the generated artifact against the source owner; Python router/ACE tests consume that same artifact and assert expected values. Node 5/5 and focused Python 23/23 pass.
- [ ] **NLUT-06 Descriptor encoding (MsgPack).** MsgPack carries only the descriptor: `(domain, lutByte, nesHex, uuidRef, tier flags)`. It never carries embeddings or matrices. Evidence: a size and shape test on the encoded descriptor, and no float arrays longer than 16 in the payload. Existing codec to check first: `sveltekit-frontend/src/lib/server/serialization/packet-msgpack-codec.ts`.
- [ ] **NLUT-07 AVX2 LUT filtering (CPU only, challenger).** AVX2 byte filtering over `lutByte` lanes is a CPU optimization only. Evidence: output identical to the scalar path on a frozen fixture, with the scalar fallback exercised. No GPU claim. Owner for the AVX2 proof: `parent-atlas-retrieval-lod-algorithm-taxonomy` (CPU-AVX2-01).

## Out of scope

- Tricubic scoring and tiered residency: owned by the prefill DAG track (Phase 12 there).
- QLoRA adapters: gated by the tournament track.

## Integration boundary (2026-10-23)

This closes palette definition and local routing/ACE parameter emission only. It does not wire trusted workspace authority, admitted ContextManifest-to-agent execution, tournament packets, multi-hop graph authorization, or cache writes. MsgPack descriptor/ordinal-bitmap parity, AVX2 filtering and residency replay remain open under their existing owners.
