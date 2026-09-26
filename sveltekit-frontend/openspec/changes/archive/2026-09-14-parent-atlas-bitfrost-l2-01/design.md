## Context

`AtlasAceResidencyV1`'s HOT/WARM tiers are a logical policy (which candidate is "worth" keeping
close) — `BITFROST-L2-01` asks a distinct, physical-layer question: once a candidate is deemed HOT,
does actually pinning it in GPU L2 cache via `cudaAccessPropertyPersisting` measurably help, given
this specific host's real hardware limits and real contention? Per root CLAUDE.md's own framing,
"L2 reset/persistence is a physical hint layered under BitFrost, never a substitute for it, and has
no effect on VRAM/OOM headroom" — this change measures that hint's actual effect size, it does not
change or re-validate the logical policy itself (that stays `parent-atlas-bitfrost-sim-01`'s job).

Verified live at proposal time (2026-09-14): this host's RTX 3060 Ti has only 328MB free VRAM, with
`llama-server.exe` (the loaded Ornith 1.5 9B chat model) actively holding the rest. This is real,
current contention, not a hypothetical — the benchmark must be designed to run safely within this
budget and must never attempt to free VRAM by touching another process (e.g. never suggest killing
`llama-server.exe`).

Windows-native CUDA 13.0 toolkit (`C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0`) is
the same environment `ACE-RADIX-01`'s CUB oracle already used, and is used again here rather than
the WSL2 `atlas-rapids-cu13` environment (which has its own separate, newer CUDA 13.3 toolkit) —
per root CLAUDE.md's explicit "keep the three environments separate" rule (`8095` Docker NLP
sidecar / WSL RAPIDS executor / Windows-native CUB+cuTile never merge).

## Goals / Non-Goals

**Goals:**
- Measure `cudaAccessPropertyPersisting`'s real effect on repeated-read latency for a small HOT-tier
  buffer, on this specific host, honestly recording the contention it ran under.
- Size every GPU allocation from live queries (`cudaMemGetInfo`, `cudaDevAttrMaxPersistingL2CacheSize`)
  rather than a hardcoded constant assumed safe.
- Produce a `DRY_RUN_PROVEN` (not "production-ready") characterization result, consistent with this
  repo's Status Language rules.

**Non-Goals:**
- Do not re-validate or change `AtlasAceResidencyV1`'s logical policy — that capability's proof
  already stands from `parent-atlas-bitfrost-sim-01`.
- Do not wire this benchmark's result into any production BitFrost/Redis code path — this is a
  standalone measurement tool, matching `ACE-RADIX-01`'s own explicit Non-Goal.
- Do not attempt to control for other GPU tenants beyond recording their presence (no killing,
  pausing, or otherwise interfering with `llama-server.exe` or any other process).
- Do not claim OOM/VRAM-headroom improvement from L2 persistence — root CLAUDE.md is explicit that
  L2 persistence "has no effect on VRAM/OOM headroom"; this benchmark measures latency only.

## Decisions

### 1. Buffer sizes are derived live from `cudaDevAttrMaxPersistingL2CacheSize` and `cudaMemGetInfo`, never hardcoded
The benchmark queries the device's actual max-persisting-L2-cache-size attribute and the current
free VRAM at startup, then sizes both the "persisting" and "normal" comparison buffers to
`min(maxPersistingL2CacheSize, a small fixed ceiling e.g. 4 MiB)`, and aborts cleanly with a
`INSUFFICIENT_VRAM` result (not a crash) if `cudaMemGetInfo`'s free bytes minus a safety margin
(e.g. 64 MiB for CUDA context overhead) would be violated by the two buffers plus working set.

**Alternative considered**: hardcode a "safe-looking" buffer size (e.g. 16MB) based on today's
observed 328MB free. Rejected — this host's free VRAM is a moving target (other GPU processes start
and stop), and a benchmark that silently OOMs on a future run with less headroom is exactly the
kind of unverified assumption this repo's evidence rules exist to prevent (see the `GPU-GRAPH-ANN-01`
VRAM-hypothesis saga in root CLAUDE.md — assumed-safe VRAM margins have been wrong before on this
exact host).

### 2. A `GpuContentionSnapshotV1` is recorded alongside every result, not asserted separately
Since this device is a real, shared, contended GPU (not an isolated benchmark rig), the result
JSON records `freeVramBeforeMib`, `totalVramMib`, and a boolean `otherGpuProcessesDetected` (queried
via `nvidia-smi --query-compute-apps` at benchmark time, best-effort — a failure to query this is
recorded as `contentionSnapshotAvailable: false`, not treated as "no contention"). This makes any
future comparison across runs honest about the conditions each ran under, rather than implying a
clean-room measurement that didn't happen.

**Alternative considered**: skip contention recording since it's outside the benchmark's own CUDA
process. Rejected — root CLAUDE.md's evidence rules require exactly this kind of environmental
honesty (see the `CagraBuildReceiptV1` precedent, which records `freeVramBeforeMib` for the same
reason), and this host specifically has a documented history of misattributing a real effect to
VRAM pressure without checking it directly (`GPU-GRAPH-ANN-01`/`02A`/`02B`).

### 3. Latency lift is reported as characterization data, not gated PASS/FAIL
Unlike `ACE-RADIX-01`'s determinism-only gate (exact-match ordering is a binary correctness fact),
L2 persistence's benefit is inherently a magnitude measurement that varies with contention, buffer
size, and access pattern — there is no CPU/GPU oracle to check "correctness" against (there's
nothing to be incorrect about; the CUDA driver either honors the access policy window or the
hardware doesn't support it, both independently verifiable facts, separate from the *latency
benefit* itself). The result records `RESULT: "DRY_RUN_PROVEN"` if the benchmark ran successfully
and produced a real measurement (regardless of which direction the lift goes), and separately
reports the observed `persistingVsNormalLatencyLift` as data for a human to interpret — never
inflated into a false PASS/FAIL binary the way `ACE-RADIX-01`'s ordering-match check legitimately
can be.

**Alternative considered**: pick an arbitrary lift threshold (e.g. "PASS if persisting is >10%
faster") mirroring `parent-atlas-bitfrost-sim-01`'s `MIN_LOCALITY_LIFT` gate. Rejected — that gate's
falsifiability came from a clean two-population comparison (locality vs. shuffled-control trace,
same underlying data, only order differs); this benchmark has no equivalent controlled-experiment
structure once real GPU contention is a live confound outside the benchmark's control. Reporting an
honest magnitude, with its contention context, is more defensible than manufacturing a threshold
this specific measurement can't cleanly support.

### 4. Repeated-read kernel, not a single pass, to make the L2 effect observable at all
A single kernel launch reading a buffer once cannot show an L2-residency benefit — the whole point
of `cudaAccessPropertyPersisting` is amortizing repeated access across many kernel launches (or one
kernel's many loop iterations) against the same address range. The benchmark runs a fixed number of
repeated read-and-reduce passes over the SAME buffer (warm-up passes excluded from timing, matching
`GPU-GRAPH-ANN-02-itopk-sweep`'s existing "warmup pass excluded from measurement" precedent), timed
via `cudaEvent` pairs around the persisting-configured stream and the normal-configured stream
separately.

### 5. CORRECTED (2026-09-14, real run): `cudaMemGetInfo` cannot be trusted alone as a VRAM safety signal on this Windows/WDDM host
Decision 1 above sized buffers from live `cudaMemGetInfo`, reasoning that live-querying beats a
hardcoded assumption. That is still true, but a real run surfaced a sharper problem than "hardcoded
vs. live": `cudaMemGetInfo()` inside the CUDA process reported **~6.68GB free**, while
`nvidia-smi.exe` (run immediately before/after, outside the CUDA process) reported **~330-370MB
free** — reproduced identically across 3 separate runs, not a fluke. Likely cause: Windows WDDM's
GPU-memory virtualization/oversubscription model — `cudaMemGetInfo` reflects the driver's
memory-manager *budget* (which can include capacity that is pageable to system RAM under
contention), not `nvidia-smi`'s physically-resident-per-process VRAM accounting.

**This did not cause a failure in practice** (the benchmark ran fine, `llama-server.exe` was
verified undisturbed — same PID before/after, per tasks.md 3.1), but it means Decision 1's
liveness check was not, by itself, the safety guarantee it was designed to be: a `cudaMemGetInfo`
figure that is ~20x too optimistic could in principle let an allocation proceed that a true
physical-memory check would have refused. **Correction**: the wrapper script
(`scripts/atlas/bitfrost-l2-01/run-l2-persist-bench.mjs`, added during implementation, not in the
original task list) queries `nvidia-smi` directly — outside the CUDA process — and records BOTH
figures side-by-side in the final result, with the discrepancy itself as a first-class documented
finding. Any FUTURE change that needs a true go/no-go safety decision on this specific host should
consult the `nvidia-smi`-derived figure, not `cudaMemGetInfo` alone.

## Risks / Trade-offs

- **[Risk]** With only 328MB free VRAM at proposal time, even a conservatively-sized benchmark could
  fail if a concurrent process (e.g. `llama-server.exe`) grows its own allocation mid-run.
  → **Mitigation**: Decision 1's `INSUFFICIENT_VRAM` clean-abort path, plus recording
  `freeVramBeforeMib` right before allocation so a failure is diagnosable, not silent.
- **[Risk]** RTX 3060 Ti's actual L2 cache size (and therefore its max-persisting-L2 attribute) may
  be small enough that the "HOT tier" buffer size this benchmark can safely use is not
  representative of a real production HOT-tier working set. → **Mitigation**: this is disclosed
  explicitly in the result artifact (`bufferSizeBytes` vs. what a production HOT tier might actually
  need) — the benchmark answers "does the mechanism work and by how much at this scale on this
  hardware," not "is this the production-sized answer."
- **[Trade-off]** No CPU/GPU oracle exists for this capability (Decision 3) — accepted as inherent
  to measuring a hardware caching-latency effect rather than a computed value with a known-correct
  reference.

## Migration Plan

No production migration — standalone benchmark tool, zero canonical-data impact, zero production
code path touched.

## Open Questions

- Whether a future revision should run this benchmark repeatedly over time (e.g. at different times
  of day / different concurrent-workload conditions) to characterize variance under contention,
  rather than a single point-in-time measurement — explicitly deferred; this change delivers one
  honest measurement with its context recorded, not a variance study.
