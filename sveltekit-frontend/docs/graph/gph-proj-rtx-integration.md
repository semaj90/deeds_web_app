# GPH-PROJ: N-ary incidence projection and RTX/cuGraph proof

This slice extends the canonical Parent Atlas graph without making cuGraph a truth owner.

## Ownership

- `HyperRelationV1` is canonical N-ary relation semantics.
- `IncidenceProjectionV1` is a deterministic, revisioned binary projection for graph executors.
- cuGraph/NetworkX/Neo4j GDS are executors over derived projections.
- `StructuralFeatureSnapshotV1` is derived evidence for QAS; PageRank is a feature, not final relevance.

Invariant: `STRUCTURAL METRIC != STRUCTURAL TRUTH`.

## Files

- `src/lib/server/atlas/graph/hyper-relation-v1.ts`
- `src/lib/server/atlas/graph/incidence-projection-v1.ts`
- `src/lib/server/atlas/graph/incidence-projection-v1.spec.ts`
- `src/lib/server/atlas/graph/graph-projection-receipt-v1.ts`
- `src/lib/server/atlas/graph/structural-feature-snapshot-v1.ts`
- `scripts/atlas/export-gph-proj-fixture.mts`
- `../python/gph_proj_cugraph_rtx_proof.py`

## Gates

| Gate | Proof |
|---|---|
| GPH-PROJ-01 | Canonical N-ary relation -> incidence relation node + role-bearing binary edges |
| GPH-PROJ-02 | Same logical input -> identical node/edge/projection hashes |
| GPH-PROJ-03 | Dense deterministic GPU ordinals `[0..N-1]` |
| GPH-PROJ-04 | NetworkX PageRank oracle vs cuGraph PageRank on the identical projection |
| GPH-PROJ-05 | Incidence projection -> original participant tuple round-trip |
| GPH-PROJ-06 | Workspace/projection revisions and hashes in projection/receipt; mixed revisions fail closed |
| GPH-PROJ-07 | `StructuralFeatureSnapshotV1` contract for downstream QAS features |

## 1. CPU contract tests

From `sveltekit-frontend`:

```bash
npx vitest run src/lib/server/atlas/graph/incidence-projection-v1.spec.ts
```

This must pass before any GPU proof is accepted. GPU acceleration cannot repair a lossy or non-deterministic projection.

## 2. Export the frozen incidence fixture

From `sveltekit-frontend`:

```bash
npx tsx scripts/atlas/export-gph-proj-fixture.mts
```

Default artifact:

```text
docs/reports/gph-proj/incidence-fixture.json
```

The artifact contains `workspaceRevision`, `projectionRevision`, dense `gpuNodeId`, role-bearing incidence edges, and a SHA-256 `projectionHash`.

## 3. Run the proof on the RTX/cuGraph environment

RAPIDS/cuGraph should run in the existing WSL2 Linux RAPIDS environment, not native Windows Python.

Translate the repo path once if necessary:

```powershell
wsl.exe -d Ubuntu -- wslpath "C:\path\to\deeds-web-app"
```

Then run inside WSL2, substituting the resulting `/mnt/...` path:

```bash
~/miniforge3/envs/atlas-rapids-cu13/bin/python \
  /mnt/.../deeds-web-app/python/gph_proj_cugraph_rtx_proof.py \
  --projection /mnt/.../deeds-web-app/sveltekit-frontend/docs/reports/gph-proj/incidence-fixture.json \
  --receipt /mnt/.../deeds-web-app/sveltekit-frontend/docs/reports/gph-proj/rtx-proof.json
```

Expected receipt gates:

```json
{
  "GPH_PROJ_03_DENSE_ORDINALS": true,
  "GPH_PROJ_04_VERTEX_SET_PARITY": true,
  "GPH_PROJ_04_PAGERANK_PARITY": true,
  "RTX_CUGRAPH_EXECUTED": true
}
```

The default PageRank absolute tolerance is `1e-6`. Tighten only after observing stable cross-backend behavior on frozen fixtures; do not require bitwise equality between CPU and GPU floating-point reductions.

## 4. Scale progression

Do not jump from the tiny five-part relation fixture straight to production promotion. Use frozen snapshots and record the same revision/hash identity at every scale:

```text
fixture
  -> 1K projected nodes
  -> 10K projected nodes
  -> 50K projected nodes
  -> full frozen Graphify revision
```

For each scale record:

- node and edge counts;
- projection hash and ordinal-map/revision identity;
- unresolved participant count (must be zero for promotion);
- NetworkX vs cuGraph PageRank max absolute error and top-k overlap;
- graph-build time separately from kernel time;
- peak/resident VRAM through the existing GPU memory telemetry owner;
- repeated-run determinism of the projection artifact;
- executor failure behavior (cuGraph unavailable must not mutate canonical truth).

## 5. What the RTX test does and does not prove

A passing receipt proves that a concrete NVIDIA CUDA device executed cuGraph PageRank over the exact derived incidence projection and matched the CPU oracle within tolerance.

It does **not** prove that PageRank is semantic relevance, that N-ary truth belongs in cuGraph, that a GNN should be promoted, or that the result should receive an extra retrieval vote. Downstream QAS should consume the graph metrics as fields in `StructuralFeatureSnapshotV1` / `DerivedFeatureMatrixV1` under the existing `LANE != EXECUTOR` rule.
