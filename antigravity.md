# ANTIGRAVITY.md — Parent Atlas Operational Invariants & Live Receipts

> **Operational Order**: Run the validators first, inspect what each validator writes, and make documentation corrections only with verifiable citations to their generated receipt paths.

---

## 1. Verified Diagnostic & Validation Receipts

| Validation Gate | Receipt Path | Status | Verification Summary |
| :--- | :--- | :--- | :--- |
| **HISTORICAL CHUNK 01** | `docs/reports/historical-chunk-resolver-receipt-v2.json` | **PROVEN (Read-Only)** | [`scripts/atlas/historical-chunk-resolver-v2.mjs`](file:///C:/Users/james/Videos/deeds-web-app/scripts/atlas/historical-chunk-resolver-v2.mjs) passed 6/6 tests ([`historical-chunk-resolver-v2.spec.mjs`](file:///C:/Users/james/Videos/deeds-web-app/scripts/atlas/historical-chunk-resolver-v2.spec.mjs)). Evaluates Git history attribution without modifying database records. |
| **Containment Scan** | `.tmp/atlas/historical-chunk-receipt-v1.json` | **RECORDED** | [`scripts/atlas/historical-chunk-receipt-v1.mjs`](file:///C:/Users/james/Videos/deeds-web-app/scripts/atlas/historical-chunk-receipt-v1.mjs) scanned 2,000 live chunks: **1,613 contained in current line window**, **386 not contained** (stale/historical), **1 source missing**. |
| **DIGEST SCOPE 01** | `docs/reports/historical-chunk-resolver-receipt-v2.json` | **DECLARED** | Explicit scope: `SHA256` over normalized UTF-8 bytes (`\r\n` $\rightarrow$ `\n`, boundary trim). Byte spans distinguished from LSP UTF-16 code units. |
| **SOURCE JOIN 01** | `docs/reports/historical-chunk-resolver-receipt-v2.json` | **SPECIFIED** | 5 discrete states in `evaluateChunkHistoricalLineage`: `CURRENT_SOURCE_VERIFIED`, `HISTORICAL_SOURCE_MATCH`, `SOURCE_CONTENT_MISMATCH`, `AMBIGUOUS_SOURCE_MATCH`, `UNVERIFIED_DIGEST_SCOPE`. |
| **Label Taxonomy Reconciliation** | `src/lib/server/atlas/classification/label-taxonomy-reconciliation.spec.ts` | **PASSING (8 passed, 3 todo)** | Verified 8 passing test cases; 3 reserved todos for source-level split tests. |
| **Feature Identity Derivation** | `scripts/atlas/lib/derive-feature-identityv2.test.mjs` | **PASSING (11/11)** | Stored feature label can no longer self-confirm as `CANONICAL` without independent source evidence; requires review. |
| **Parent-Atlas Symbol Smoke** | `packages/parent-atlas/test/svelte-typescript-symbol-smoke.test.mjs` | **13 passed, 3 skipped** | 13 unit tests passing; 3 live `:8095` tests skipped when `ATLAS_8095_FIXTURE_URL` is unset. |

---

## 2. Unproven Boundaries & Explicit Gaps

> [!CAUTION]
> The following items are **NOT PROVEN** for production authority. Do not claim completion or trigger database mutations based on fixture-level passes.

1. **The 3 Skipped Live :8095 Tests (`NOT PROVEN LIVE`)**:
   - In `packages/parent-atlas`, 3 live 8095 tests are marked `# SKIP` unless `ATLAS_8095_FIXTURE_URL` is explicitly configured. Passing 13/16 does not prove live `:8095` end-to-end extraction against production SvelteKit source components.
2. **Stable-File UUID Minting (`0 ROWS IN DB`)**:
   - `atlas_stable_file_identity` currently contains **0 rows**. Per-file UUIDs are not yet minted.
   - `atlas_repository_identity` holds 1 row (`01a13137-1378-7df9-9968-53738dbf0e48`, `deeds-web-app`, UUIDv7).
   - Populating file UUIDs requires explicit approval and a validated dry-run script.
3. **HyperGraph in Neo4j (`NOT EVIDENCED`)**:
   - Live probe shows **0 hyper-labelled nodes** in Neo4j. The writer in `hypergraph-store.ts` exists on disk but has never executed against the live Neo4j database.
4. **HyperGraphRAG Retrieval (`CONTRACT ONLY`)**:
   - `sveltekit-frontend/src/lib/server/atlas/retrieval/hypergraph-retrieval-v1.ts` is a Zod schema contract; it does not connect to or query Neo4j.
5. **NetworkX Live Parity (`FIXTURE ONLY`)**:
   - Zero-hop, multi-hop, and cycle BFS parity is proven only against static fixtures (`atlas-resident-bfs-proof-2026-10-13.json`). Live parity requires an admitted graph snapshot (`atlas_graph_snapshots_v2`).
6. **Workspace Binding Disambiguation**:
   - `atlas_workspace_source_bindings` holds **24,253 rows** matching commit `c63620c4` (out of 93,500 total across 5 revisions). The workspace is bound, but stable-file identity remains unpopulated.

---

## 3. Standing Architectural Rules

- **No Index Rebuilds**: Evaluators run with `readOnly: true`, `writesPerformed: false`, and `canonicalAuthority: false`. Zero mutations sent to `codebase_chunk_index` or PostgreSQL tables.
- **Agent Stale Chunk Editing Block**: Non-contained and historical chunks are quarantined into `recommendedRebuildCohort` and marked `BLOCKED_FROM_REPAIR` to prevent agents from patching files against stale code bodies.
- **Immutability of Historical Evidence**: Historical chunk bodies preserve their original stored hashes; Git commit hashes (`currentGitRevision` vs parent commits) are linked as external metadata rather than rewriting canonical fields.
- **No Self-Confirmation**: A stored feature label can no longer validate itself as `CANONICAL` when it is the only evidence; independent source evidence is required.
- **Token Identification**: Token IDs come strictly from the model tokenizer, never from symbol hashes or candidate ordinals.
- **Separation of Concerns**: Dense search keeps its current behavior until a shadow comparison proves otherwise.

---

## 4. Live Environment Surfaces (Verified 2026-10-27)

```text
PostgreSQL 18.4 (Port :5434)  -->  legal-ai-postgres (Healthy, 24,253 c63620c4 bindings)
Neo4j Mirror   (Port :7474)  -->  legal-ai-neo4j (Healthy, 165k context nodes, 0 hyperedges)
Tree-sitter    (Port :8095)  -->  provenance-v2 (Healthy, Ornith-1.5-9b, AST-grep 0.45.3)
GPU Accelerator              -->  RTX 3060 Ti 8GB (CUDA 13.0, LibTorch cu130, RAPIDS cuVS)
```

## svelte-check upgrade and fast-check lanes (2026-11-03)

- `sveltekit-frontend` `svelte-check` upgraded 4.3.4 → 4.7.8; it now supports `--incremental` (disk cache of svelte2tsx output in `.svelte-kit`/`.svelte-check`) and `--tsgo`. 4.3.4 had neither flag.
- Lanes: `npm run check` stays the authoritative full gate. `npm run check:fast` (`svelte-check --incremental`, ~62 s warm / 344 s cold, covers `.svelte`, 0 errors) is the default smoke lane; `tsgo --noEmit` (`typecheck:native`, ~67 s) is TS/JS only in `scripts/verify/smoke-validation.mjs`; set `SMOKE_FULL_CHECK=1` for the full `svelte-check` (480 s timeout). Receipt lane values: `FAST_CHECK_PASSED` / `FULL_CHECK_PASSED`.
- Benchmark (full tsconfig): `--incremental` cold 344 s / warm 62 s; `--tsgo` 96 s; identical diagnostics. Upgrade surfaced 3 latent errors, fixed: Field.svelte (`Snippet<[{ id }]>`, `$props()` annotation), DetectiveBoard.svelte (installed `svelte-dnd-action`, store import path, replaced `.subscribe` with rune mirror).
- Evidence3DModal.svelte is unified with DepthReliefViewer.svelte (single renderer; displaced-surface raycasting, draggable pins, Orbit/Place/Undo/Clear toolbar, revision-matched depth guards; 20/20 unit tests, 0 svelte-check errors).
- Open items: Playwright E2E (`tests/e2e/evidence-relief-actions-diagnostic.spec.ts`) was blocked by a `localhost:5173` timeout; depth route still lacks byte-level SHA-256 verification against `depth_sha256`; 3D pins are session-local (temporary) and must not be persisted to Postgres/board state until the E2E diagnostic passes. Do not kill backend services (turbo, bifrost, llama-server) when recovering Vite.

---

## 5. Detective Mode Scene Assistance & Reusable 3D Composition (`DETECTIVE-SCENE-COMPOSER-V1`)

> [!IMPORTANT]
> **Operational Boundary**: We are building a scene-assistance system for Parent Atlas Detective Mode, **NOT** training an AI model. The user provides a photograph, optional GPS coordinates, and a description. Parent Atlas searches its existing object catalog, places reusable 3D assets, and provides 6-DoF transformation controls via Three.js and BVH raycasting.

### 5.1 Google Earth & 3D Tiles Licensing Invariant
* **Permitted Actions**: Viewing, annotating, and displaying attributed map context. Overlaying independently created 3D objects on photorealistic 3D Tiles is permitted by Google's 3D Tiles policies, provided those objects are not extracted or derived from the tiles.
* **Prohibited Actions (Hard Block)**:
  - Do **NOT** extract or scrape Google imagery to reconstruct, derive, or save competing GLB/SPZ models.
  - Do **NOT** train machine learning models or neural representations on Google Earth / Maps imagery.
* **Georeference Scope**: User-entered or EXIF GPS coordinates locate the scene geographically. They do **NOT** infer internal room dimensions, furniture placement, or camera calibration.

### 5.2 Storage Separation: PostgreSQL 18 vs SeaweedFS
The scene composition stores references and lightweight transforms, never duplicated geometry:

| Component | Authoritative Storage | Schema / Path |
| :--- | :--- | :--- |
| **Original Evidence Photograph** | Private evidence object in SeaweedFS | `legal-evidence/photos/{sha256}.jpg` |
| **Reusable Catalog Assets (chairs, doors, stairs, cameras)** | PostgreSQL catalog metadata; GLB bytes in SeaweedFS | PostgreSQL `scene_assets` / SeaweedFS `case-assets/catalog/` |
| **Optional GPS & Accuracy** | Case scene metadata JSONB | `location: { latitude, longitude, source, verified }` |
| **Object Transforms & Composition** | Scene revision JSONB | `atlas.detective-scene-composition.v1` (`scene_document_revisions`) |
| **Evidence Markers & Sightlines** | Revisioned annotations in PostgreSQL | `scene-markers` / `SurfaceMarkerV1` |
| **Background SPZ / Streamed SOG** | Immutable derived asset object in SeaweedFS | `legal-evidence/splats/{sha256}.spz` |
| **Scene BVH Collision Trees** | In-browser transient cache | `SpatialBvhManagerV1` (`ObjectBVH` + `MeshBVH`) |
| **Procedural Destruction Fragments** | Separate derived demonstrative GLBs | SeaweedFS `case-assets/fragments/{sha256}.glb` |

### 5.3 Reference-Based Composition Contract (`atlas.detective-scene-composition.v1`)
Validated via [`sveltekit-frontend/src/lib/types/detective-scene-composition.ts`](file:///c:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src/lib/types/detective-scene-composition.ts):
```json
{
  "schema": "atlas.detective-scene-composition.v1",
  "classification": "DEMONSTRATIVE",
  "location": {
    "latitude": null,
    "longitude": null,
    "source": "USER_OPTIONAL",
    "verified": false
  },
  "objects": [
    {
      "objectId": "scene-chair-01",
      "catalogKey": "furniture.chair.standard",
      "assetRevision": "fixture-v1",
      "position": [1.2, 0, -2.4],
      "rotation": [0, 0, 0, 1],
      "scale": [1, 1, 1]
    }
  ],
  "calibration": "UNVERIFIED",
  "admission": "LOCAL_PREFLIGHT"
}
```

### 5.4 Blender Python RNA Memory Safety Invariant
> [!CAUTION]
> **RNA Pointer Reinterpretation Hazard**: Never treat `mesh.vertices[0].as_pointer()` as a contiguous `float*` XYZ buffer. Blender's RNA pointer is not guaranteed to be a flat, densely packed array; direct casting crashes Blender or corrupts geometry.
> **Mandatory Extraction Pattern**: Use `mesh.vertices.foreach_get("co", coords)`:
> ```python
> import bpy
> from array import array
>
> obj = bpy.context.active_object
> assert obj and obj.type == "MESH"
> mesh = obj.data
> coords = array("f", [0.0]) * (len(mesh.vertices) * 3)
> mesh.vertices.foreach_get("co", coords)
> ```
> Procedural bisecting (`bmesh.ops.bisect_plane()`) is an optional demonstrative helper and requires explicit cap generation and boundary validation before creating separate closed fragment meshes.

### 5.5 Implementation Matrix & Verified Components (`DETECTIVE-SCENE-COMPOSER-V1`)

| Capability | Current State | Verification Authority |
| :--- | :--- | :--- |
| **User photo → 2.5D relief → GLB** | **PROVEN** | `DepthReliefViewer.svelte` / Chromium preflight passed 1/1 |
| **SPZ v4 / Streamed SOG Rendering** | **PROVEN** | Synthetic 5-splat fixture & PlayCanvas LOD passed 1/1 |
| **MeshBVH / Skinned BVH Picking** | **PROVEN** | `SpatialBvhManagerV1` 4/4 Vitest + Chromium rigged pick 1/1 |
| **Blender MCP Primitives & Rigging** | **PROVEN** | `rubber_hose_character_v1.py` & procedural cube 3/3 passed |
| **PyTorch ATen Morton Radix Sort & AIO Bitset** | **PROVEN** | `pytorch_aten_spatial_keyframes.py` & 22/22 Vitest passed |
| **Pure Isomorphic SIMD & 30-Bit Morton Engine** | **PROVEN** | `src/lib/spatial/spatial-simd-morton.ts` 5/5 Vitest passed |
| **Server Route Spatial Enhancer & Valkey Cache** | **PROVEN** | `src/lib/server/api/route-spatial-enhancer.ts` 5/5 Vitest passed |
| **Reusable Object Catalog (5 Forensic Assets)** | **PROVEN** | `src/lib/scene-composer/detective-scene-composer.ts` 5/5 Vitest passed |
| **Keyframe Server Endpoint & Stable JSON Shape** | **PROVEN** | `/api/cases/[id]/scenes/[sceneId]/keyframes` HTTP 200/400 verified |
| **Authoritative Scene Persistence (Gate B)**| **BLOCKED (503)** | Guarded by feature gate pending isolated scratch DB approval |

### 5.6 Detective Scene Composer Architecture (`DETECTIVE-SCENE-COMPOSER-V1`)
1. **Catalog Primitives**: 5 calibrated assets (`catalog:stairwell-concrete`, `catalog:office-chair-mesh`, `catalog:security-door-heavy`, `catalog:surveillance-camera-cctv`, `catalog:evidence-marker-tent`).
2. **SIMD & Memory Alignment**:
   - `ALIGNED_KEYFRAME_CHUNK_SIZE = 64` bytes.
   - AVX2: 2 vector instructions (256-bit SIMD / 32 bytes) process 1 keyframe chunk.
   - AVX-512: 1 vector instruction (512-bit SIMD / 64 bytes) ingests 1 keyframe chunk in a single `__m512` register cycle.
   - 30-bit Morton Code: Radix sort along the Z-order curve ensures L1/L2 cache locality prior to SIMD copy.
3. **Storage Split**:
   - PostgreSQL 18: `atlas_spatial_keyframes_v1` owns `BIT(256)` active slot masks, `packed_transforms_blob` (bytea), and `jsonb` cluster metadata.
   - Valkey (`:6379`): Transient sub-millisecond packet caching (`setCachedSpatialPacket`).
   - SeaweedFS: Immutable multi-bucket S3 object store (`legal-evidence`, `legal-corpus`, `federal-law`, `state-law`, `local-law`).
