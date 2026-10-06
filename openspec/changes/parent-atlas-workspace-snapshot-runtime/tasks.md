## 1. Incremental observation

- [x] WSR-03a Optional per-file digest cache in `workspace-revision-origin-runtime-v1.ts` (path+size+mtime ns, 2 s racy-mtime guard); capture shares one cache across scans; byte readback uncached. Evidence: `scripts/atlas/lib/workspace-snapshot-capture-v1.spec.mts` 3/3; commit `2a14a2269f`.
- [x] WSR-03b Persist the digest cache across runs in gitignored `.tmp/atlas/workspace-digest-cache-v1.json`. The v2 cache header binds policy revision, required workspace ID, repository-root fingerprint, and body checksum; malformed/mismatched entries fail open to rehash, and writes use fsync + unique temp file + atomic rename. The 2026-10-06 two-file fixture measured cold capture 1108.58 ms and warm capture 1081.35 ms; this is fixture-only overhead evidence, not a repository-scale speedup claim. Evidence: `scripts/atlas/lib/workspace-snapshot-capture-v1.spec.mts`.
- [x] WSR-03c Digest-cache ABI/fault proof: ten focused cache tests cover malformed JSON, wrong schema/policy/workspace/root fingerprint, checksum/entry corruption, successful atomic replacement, simulated interruption after temp fsync but before rename, and uncached-oracle cache invalidation on same-size/same-mtime drift. The previous valid cache survives the interruption and the abandoned temp is removed. The adjacent multi-repository snapshot test passes 1/1. No database or canonical workspace snapshot write occurred.
- [ ] WSR-01 Audit existing source/frame registry tables for an owner before adding `WorkspaceSourceRegistryV1`; extend, do not duplicate.
- [ ] WSR-02 Filesystem/git watcher marks sources dirty.
- [ ] WSR-04 Monotonic workspace generation counter.

## 2. Sealing and states

- [ ] WSR-05 Fast immutable snapshot from cached/registry digests; must reproduce the byte-readback result for the same bytes or record exactly why not.
- [ ] WSR-06 Generation-before == generation-after race check with bounded retry; test mutates a file mid-seal.
- [ ] WSR-07 Full byte-level reseal retained as independent audit (FULL_RESEAL_AUDIT).
- [ ] WSR-08 `valid` / `current` / `admitted` as independent states.

## 3. Admission and control plane

- [ ] WSR-13 Admission binds the exact workspaceRevision + manifest sha256 + sourceCount; refuses a mismatch. Operator phrase `AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1` still required.
- [ ] WSR-09 Read/control API in the existing control plane (`admit` is the only authority call).
- [ ] WSR-10 SSE status/progress stream (display only).
- [ ] WSR-11 Admin Studio initial state via SSR + SSE.

## 4. Invalidation and scheduling

- [ ] WSR-12 `ProjectionFreshnessV1` / revision-DAG invalidation (descendants of a changed source revision only).
- [ ] WSR-14 Scheduled full reconciliation (observer only, never admits).
- [ ] WSR-15 Event-driven debounced candidate sealing.

## 5. Close-out

- [ ] WSR-99 Fresh clean reseal with the new capture, shown to the operator for `AUTHORIZE_WORKSPACE_REVISION_TOURNAMENT_ADMISSION_V1`; then resume `parent-atlas-gate2-chunk-lineage-convergence` 2.2 onward.
