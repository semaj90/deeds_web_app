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

## 6. Profile evidence and next optimizations (2026-10-06)

Measured with `node --cpu-prof` on one UNCACHED `observeSnapshot` (27,939 sources, 7 repos, 109 s; machine under load from other agents). Self time: `open` 32.6 s + `read` 8.8 s + `close` 2.2 s (file reads, ~44 s); `spawnSync` 26.9 s (git subprocesses); `lstat` 15.2 s + `stat` 6.1 s + `existsSync` 4.4 s (metadata syscalls, ~26 s); SHA hashing only 0.7 s. Warm captures reuse 27,932-27,937 digests (rehashed 55-60), so the file-read share is gone but git + stat work (~50 s per scan) remains and `captureStableSnapshot` runs two full scans: warm 136-196 s. Hashing is not the bottleneck; file-open cost (likely Windows Defender scanning) and git/stat dominate.

- [ ] WSR-03d Dedupe git calls per repo: `git status --porcelain`, `ls-files --cached --others`, `ls-tree`, `diff --name-only` and `ls-files --stage` are each run more than once across `state()` and the origin runtime; run each once per repo and share results. Verify the revision is byte-identical to the current output.
- [x] WSR-03e Remove the per-source `realpathSync` + `lstatSync` loop in `observeSnapshot` (symlink/escape guard): detect symlinks from `git ls-files -s` mode 120000 and check repository containment once per repo, not per file. Keep the guard semantics (violations still reported) and add a symlink-escape test.
- [ ] WSR-05a Replace the second full scan with a cheap consistency seal: re-stat (size, mtimeNs) every captured source and compare per-repo HEAD/index state; fall back to a full rescan only on a delta. Estimated to remove ~one scan (~50 s). The uncached byte readback stays the independent oracle.
- [ ] WSR-03f Operator-owned, not code: evaluate `core.untrackedCache`/`core.fsmonitor` for the repos (git status was ~4.6 s at the root) and a Windows Defender exclusion for the repo directory (file `open` was ~1.2 ms per file). Record the effect; these are machine settings and need explicit operator approval.
- Target: warm capture of a few tens of seconds with WSR-03d/03e/05a; true seconds still needs the persisted registry + watcher (WSR-01/02), which stays open until measured.

**WSR-03e result (2026-10-06):** `createSymlinkProbeV1` (one readdir per distinct directory, ancestor + junction aware) replaces the per-file `realpathSync`+`lstatSync` guard; parity test vs the legacy check on a plain tree and an outside-pointing junction passes (capture spec 11/11). Capture wall time fell to **66.9 s** (cold scan: 0 reused / 27,992 rehashed, then warm scan: 27,937 reused / 55 rehashed) from 114 s (no cache) and 136-196 s (earlier warm runs); noisy machine, single sample, not a stable benchmark. Snapshot-level revision parity with the old code was not asserted (the workspace moved between runs); the uncached byte oracle read back 27,936/27,937 with 1 `SOURCE_BYTES_CHANGED`-class violation (a live edit between capture and readback), so no new clean reseal was produced; the clean reseal remains `sha256:cfd3446a…b3cb`.
- [ ] WSR-03g Finding: the cache's repository-root fingerprint includes each repo's HEAD, so every commit discards the whole cache (cold scan above reused 0 after two commits). Per-file size+mtimeNs already guard staleness; decide whether HEAD should stay in the fingerprint (owner decision, changes the cache contract).
