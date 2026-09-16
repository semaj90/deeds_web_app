## 1. Environment verification (no install)

- [x] 1.1 Confirm `AtlasAceResidencyV1` logical policy is proven before starting (per
      `parent-atlas-gpu-mini-fabric-01` section 10's own gating condition)
      **Confirmed**: `parent-atlas-bitfrost-sim-01` archived, real PASS, lift 0.53425.
- [x] 1.2 Verify Windows-native CUDA 13.0 toolkit + `nvcc.exe` availability
      **Verified**: `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0\bin\nvcc.exe` exists.
- [x] 1.3 Verify `cudaAccessPropertyPersisting` / `cudaDevAttrMaxPersistingL2CacheSize` are declared
      in this toolkit's headers
      **Verified live**: `driver_types.h` line 2021 (`cudaDevAttrMaxPersistingL2CacheSize = 108`),
      line 1365 (`cudaAccessPropertyPersisting = 2`), line 1379 (`cudaAccessPolicyWindow` struct),
      `cuda_runtime_api.h`/`cuda_runtime.h` (`cudaStreamSetAttribute` declared, signature
      `(cudaStream_t, cudaStreamAttrID, const cudaStreamAttrValue*)`).
- [x] 1.4 Record live GPU contention snapshot (free/total VRAM, other GPU processes) at proposal
      time, before writing any allocation-sizing code
      **Recorded**: `nvidia-smi --query-gpu=memory.free,memory.total` → 328 MiB free / 8192 MiB
      total. `nvidia-smi --query-compute-apps` confirms `llama-server.exe` (PID present) actively
      running, plus the usual Windows desktop/browser processes with `[N/A]` memory reporting.

## 2. Benchmark harness (atlas-bitfrost-l2-persistence-benchmark)

- [x] 2.1 Write `native/bitfrost-l2-01/l2_persist_bench.cu` — standalone, no Node/N-API bindings,
      matching `native/ace-radix-01/radix_bench.cu`'s convention (CUDA_CHECK macro, JSON-line
      stdout output)
- [x] 2.2 Implement live buffer sizing from `cudaDevAttrMaxPersistingL2CacheSize` +
      `cudaMemGetInfo`, with a safety margin and a clean `INSUFFICIENT_VRAM` abort path
      **Landed**: `bufferSizeBytes = min(4 MiB ceiling, maxPersistingL2Bytes)`; aborts with
      `RESULT: "INSUFFICIENT_VRAM"` if `2*bufferSizeBytes + 64MiB margin > freeBytesBefore`. On
      this device, `maxPersistingL2CacheSizeBytes` measured live as 2,162,688 bytes (~2.06 MiB).
- [x] 2.3 Implement the `GpuContentionSnapshotV1` recording (free/total VRAM at benchmark time;
      `otherGpuProcessesDetected` best-effort, `contentionSnapshotAvailable` disclosed honestly)
      **Landed, but with a real correction**: the `.cu` binary itself can only see
      `cudaMemGetInfo`'s view (see the discrepancy finding in task 3.1) and honestly reports
      `contentionSnapshotAvailable: false` for the OS-process-level view — the REAL contention
      snapshot is attached by the wrapper script (task 2.7, added beyond the original task list)
      via `nvidia-smi`, per design.md Decision 2's "disclosed as unavailable, never omitted or
      implied absent" requirement.
- [x] 2.4 Implement the persisting-access stream (`cudaStreamSetAttribute` with
      `accessPolicyWindow`, `hitProp=cudaAccessPropertyPersisting`) and the normal-access stream
      (no access policy window), both reading the same-sized buffer
- [x] 2.5 Implement the repeated-read-and-reduce kernel with warm-up passes excluded from timing
- [x] 2.6 Build via `nvcc` directly (no CMake/node-gyp target), matching the `ACE-RADIX-01`
      precedent
      **Built**: `nvcc -arch=sm_86 -o l2_persist_bench.exe l2_persist_bench.cu`, MSVC `cl.exe`
      14.43.34808 added to PATH for the host-compiler step. Compiled cleanly, zero warnings.
- [x] 2.7 (added during implementation, not in the original task list) Write
      `scripts/atlas/bitfrost-l2-01/run-l2-persist-bench.mjs`: wraps the `.exe`, attaches a REAL
      `nvidia-smi`-derived contention snapshot before and after the run, and writes the final
      `docs/reports/bitfrost-l2-01-results.json`. Needed because the CUDA binary itself cannot
      query other OS processes (task 2.3's honest limitation).

## 3. Run and record

- [x] 3.1 Run the benchmark for real on this host, recording the actual observed contention
      (`llama-server.exe` verified live and running at proposal time)
      **Real, significant finding, not anticipated in design.md**: `cudaMemGetInfo()` inside the
      CUDA process reported **~6.68GB free**, while `nvidia-smi.exe` (queried immediately
      before/after, outside the CUDA process) reported **~330-370MB free** — a large discrepancy,
      confirmed **reproducible across 3 separate runs** (not a one-off fluke). Likely cause:
      Windows WDDM GPU-memory virtualization/oversubscription — `cudaMemGetInfo` reflects the
      driver's memory-manager budget (which can include capacity pageable to system RAM), not
      `nvidia-smi`'s physically-resident-per-process VRAM accounting. **Design consequence**:
      design.md Decision 1's "size from live `cudaMemGetInfo`" is necessary but was NOT a complete
      safety guarantee on this specific host — the run succeeded without crashing and did not
      disturb `llama-server.exe` (verified: same PID present before/after), but that was not
      something `cudaMemGetInfo`'s own number could have guaranteed on its own, given how far off
      it was from the OS-level reality. This finding is recorded in design.md and in the wrapper
      script's own comments, not just here.
- [x] 3.2 Produce `docs/reports/bitfrost-l2-01-results.json` with the full result: environment
      (device/driver/toolkit), contention snapshot, buffer size actually used, persisting vs.
      normal timing, observed lift, and `RESULT: DRY_RUN_PROVEN`
      **Result (real, 3 runs on this host, RTX 3060 Ti, CUDA 13.0, buffer=2,162,688 bytes,
      2000 timed iterations + 50 warmup, `llama-server.exe` live-confirmed running throughout)**:
      ```
      Run 1: persistingTotalMs=629.80  normalTotalMs=600.09  lift=-4.95%
      Run 2: persistingTotalMs=587.21  normalTotalMs=567.71  lift=-3.44%
      Run 3: persistingTotalMs=588.89  normalTotalMs=581.39  lift=-1.29%
      ```
      **`RESULT: DRY_RUN_PROVEN`** (the measurement itself completed successfully all 3 times, per
      design.md Decision 3's framing — this is not a PASS/FAIL correctness gate). **Observed lift
      is consistently negative** (persisting access measured *slower* than normal access) across
      all 3 runs, small in magnitude (-1.3% to -5.0%) and noisy, on this contended host with a
      tiny (~2.06MB) buffer forced by this device's `maxPersistingL2CacheSizeBytes` limit. Honest
      interpretation: on this specific RTX 3060 Ti, at this buffer scale, under this real
      concurrent `llama-server.exe` load, `cudaAccessPropertyPersisting` showed **no measurable
      benefit for this access pattern** — if anything a small, consistent-direction-but-small-
      magnitude regression, plausibly within GPU-scheduling noise given the shared/contended
      device rather than a definitive mechanism failure. This does NOT mean L2 persistence never
      helps — it means it did not help THIS specific measurement, and the result is reported as
      such rather than reframed. Full JSON: `docs/reports/bitfrost-l2-01-results.json`.
- [x] 3.3 If `INSUFFICIENT_VRAM` is hit, record that outcome honestly rather than retrying with an
      unsafe smaller margin or claiming a fabricated result
      **Not hit** — all 3 runs had sufficient headroom per `cudaMemGetInfo`'s own (possibly
      optimistic, per task 3.1's finding) view.

## 4. Documentation and handoff

- [x] 4.1 Update root CLAUDE.md's GPU-primitive-ownership section (or add a pointer) noting
      `BITFROST-L2-01`'s real result, per this repo's Status Language rules — never claim
      "production-ready" from this benchmark
- [x] 4.2 Confirm `parent-atlas-gpu-mini-fabric-01`'s section 10 gate is now closed with real
      evidence, not a placeholder
      **Confirmed**: section 10.2's benchmark ran for real, 3 times, with an honest negative/
      no-benefit result and a genuinely new finding (the `cudaMemGetInfo`-vs-`nvidia-smi`
      discrepancy) recorded rather than smoothed over.

## 5. Follow-up — FIXED (2026-09-14, post-archive review, web research + real re-run)

- [x] 5.1 **The negative lift (-1.3% to -5.0%) was never stress-tested against a working set that
      actually exceeds L2 without persistence — fixed via web research + a corrected v2 harness.**
      Web search confirmed the root cause: NVIDIA's own L2-cache-control docs and an independent
      benchmark (Lei Mao's "CUDA L2 Persistent Cache" writeup, RTX 3090) both demonstrate a real
      benefit only with a **two-buffer design** — a small persisting buffer repeatedly re-accessed
      via modulo indexing WHILE a much larger "streaming" buffer is also touched every kernel
      launch, creating genuine L2 eviction pressure. Lei Mao's reference numbers: 3MB persistent
      data + 3MB L2 set-aside + 1024MB streaming buffer → ~20% speedup (3.071ms → 2.443ms). v1's
      benchmark measured the small buffer in complete isolation — nothing ever pressured it out of
      L2, so the persisting hint had nothing to protect against.
      **Fix landed**: `native/bitfrost-l2-01/l2_persist_bench.cu` rewritten (v2) with a
      `streamingReadPersistKernel` (`streamOut[i] = persistBuf[i % persistCount]`) creating real
      write pressure across a much larger buffer every launch. Since this host's VRAM is real,
      shared, and unreliable (`cudaMemGetInfo` cannot be trusted — see 5.2 below), the streaming
      buffer size is NOT derived inside the `.cu` binary — `scripts/atlas/bitfrost-l2-01/
      run-l2-persist-bench.mjs` computes it from a REAL `nvidia-smi` reading (30% of free-minus-64MiB-
      margin, split across the two configs, floored at 4 MiB, capped at 64 MiB) and passes it as a
      CLI argument. Re-run 3 times for real on this host:
      ```
      Run 1 (streamingBufferMib=11):  persistingTotalMs=8.64   normalTotalMs=8.82   lift=+2.05%
      Run 2 (streamingBufferMib=28):  persistingTotalMs=20.79  normalTotalMs=20.81  lift=+0.07%
      Run 3 (streamingBufferMib=26):  persistingTotalMs=21.77  normalTotalMs=20.72  lift=-5.09%
      ```
      **Honest result: still inconclusive on this host, but for a real, explainable reason now
      identified rather than a methodology gap.** The corrected methodology produces small, mixed-
      sign lift (-5.1% to +2.1%) rather than v1's consistently negative result — a genuine change
      in signal character, not the same result restated. This is NOT the same as v1's flaw (a
      test with literally nothing to measure); it is a real, contention-dominated, small-buffer
      measurement on a live-shared 8GB card where the streaming buffer (11-28 MiB, sized
      conservatively from ~140-280MiB real free VRAM) is far smaller than Lei Mao's reference setup
      (1024MiB on an isolated, dedicated GPU) — this device's shared VRAM budget does not currently
      allow reproducing that scale. `RESULT: DRY_RUN_PROVEN` for all 3 v2 runs (the measurement
      completed; no crash; `llama-server.exe` remained undisturbed throughout, spot-checked via PID).
      Updated result: `docs/reports/bitfrost-l2-01-results.json` (latest run; prior runs' JSON
      values are recorded here in this file for the historical comparison).
- [x] 5.2 **The `cudaMemGetInfo`-vs-`nvidia-smi` discrepancy — root-caused (2026-09-14, web
      research against primary Microsoft documentation, not just inferred).** Two searches:
      (a) NVIDIA developer forums (Robert Crovella, a well-known NVIDIA-affiliated moderator) —
      confirms `cudaMemGetInfo` reports free memory AFTER a CUDA context is instantiated
      ("The CUDA context has overhead") versus `nvmlDeviceGetMemoryInfo`/`nvidia-smi` reporting
      free memory BEFORE — but this mechanism only accounts for typical CUDA context overhead
      (tens to a few hundred MB), nowhere near the ~6GB gap observed here. (b) Microsoft's own
      WDDM 2.0 documentation (`learn.microsoft.com/.../gpu-virtual-memory-in-wddm-2-0` and
      `IDXGIAdapter3::QueryVideoMemoryInfo`) — the actual mechanism at this magnitude: WDDM assigns
      each process an OS-controlled **`Budget`** (queried via `QueryVideoMemoryInfo`) that the
      process "should target" — Microsoft's own docs state `local.Budget represents total
      available memory (dedicated + shared)`, i.e. the budget legitimately includes memory the OS
      plans to make available via oversubscription/shared-system-memory paging, NOT a strict
      physically-free-right-now figure. `cudaMemGetInfo` on Windows derives its "free" value from
      this WDDM budget concept, while `nvidia-smi` reports direct per-process physical VRAM usage
      — explaining why `cudaMemGetInfo` can legitimately report several GB more "free" than what
      is physically resident and unused at that instant. **Conclusion**: the WDDM-oversubscription
      explanation already in design.md was correct in direction and is now backed by Microsoft's
      own documentation of the `Budget` mechanism, not just general driver-model knowledge — CUDA
      context overhead (the only NVIDIA-forum-confirmed effect found) is real but far too small to
      be the primary explanation for this magnitude of gap.
- [x] 5.3 **Variance study — done.** Ran the v2 benchmark 4 additional times (7 total v2 runs) at
      different points across this session, under this host's naturally fluctuating live
      contention (`nvidia-smi` free VRAM ranged 138-399MiB across the runs, `llama-server.exe`
      running throughout, other concurrent processes varying — each run's own conservative
      streaming-buffer size scaled with the free VRAM seen at that moment, 11-50 MiB).
      **Full 7-run dataset (real, no runs discarded)**:
      ```
      Run 1 (streamingBufferMib=11): lift=+2.05%
      Run 2 (streamingBufferMib=28): lift=+0.07%
      Run 3 (streamingBufferMib=26): lift=-5.09%
      Run 4 (streamingBufferMib=34): lift=+8.98%
      Run 5 (streamingBufferMib=46): lift=-7.07%
      Run 6 (streamingBufferMib=50): lift=+7.09%
      Run 7 (streamingBufferMib=43): lift=-11.34%
      ```
      **mean=-0.76%, min=-11.34%, max=+8.98%, n=7.** The mean is close to zero and the sign flips
      unpredictably run-to-run with no correlation to streaming-buffer size — this is genuinely
      noise-dominated at this scale on this contended host, not a hidden systematic effect masked
      by too few samples. Confirms the honest characterization from 5.1: on this specific shared
      RTX 3060 Ti, at the buffer scale its live VRAM budget allows, `cudaAccessPropertyPersisting`
      shows **no measurable net benefit or harm** — real GPU scheduling/contention noise
      (±5-11% swings) dominates whatever small effect the mechanism might have at this scale.
