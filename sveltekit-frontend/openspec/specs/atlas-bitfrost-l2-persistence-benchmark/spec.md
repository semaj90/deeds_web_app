# atlas-bitfrost-l2-persistence-benchmark Specification

## Purpose
TBD - created by archiving change parent-atlas-bitfrost-l2-01. Update Purpose after archive.
## Requirements
### Requirement: Buffer sizes are derived live from device limits and free VRAM, never hardcoded
The system SHALL query `cudaDevAttrMaxPersistingL2CacheSize` and `cudaMemGetInfo` at benchmark
startup and size its GPU buffers from those live values (bounded by a small fixed ceiling), and
SHALL NOT allocate a hardcoded buffer size that assumes a specific amount of free VRAM.

#### Scenario: Insufficient VRAM is a clean, reported abort, not a crash
- **WHEN** live free VRAM minus a safety margin is smaller than the buffers the benchmark needs
- **THEN** the benchmark exits with an `INSUFFICIENT_VRAM` result rather than crashing or silently
  proceeding

#### Scenario: Buffer size never exceeds the device's max-persisting-L2 attribute
- **WHEN** the benchmark sizes its persisting buffer
- **THEN** the buffer size is at most `cudaDevAttrMaxPersistingL2CacheSize` for the current device

### Requirement: GPU contention is recorded, not assumed absent
The system SHALL record a contention snapshot (free/total VRAM, whether other GPU compute processes
were detected) alongside every benchmark result, and SHALL mark the snapshot as unavailable rather
than implying a clean/isolated run when the contention query itself fails.

#### Scenario: A result artifact discloses its contention context
- **WHEN** a benchmark result is produced
- **THEN** it includes `freeVramBeforeMib`, `totalVramMib`, and `otherGpuProcessesDetected`

#### Scenario: A failed contention query is disclosed, not hidden
- **WHEN** the contention query (e.g. `nvidia-smi`) fails or is unavailable
- **THEN** the result artifact sets `contentionSnapshotAvailable: false` rather than omitting the
  field or implying zero contention

### Requirement: Latency lift is reported as characterization data, never a fabricated PASS/FAIL threshold
The system SHALL report the measured persisting-vs-normal latency difference as data, and SHALL
mark the run's `RESULT` as `DRY_RUN_PROVEN` based on whether the measurement itself completed
successfully, not on whether the lift crossed an arbitrary threshold.

#### Scenario: A negative or negligible lift is still a valid DRY_RUN_PROVEN result
- **WHEN** persisting access shows no measurable benefit over normal access on this contended host
- **THEN** the result is still recorded as `DRY_RUN_PROVEN` (a real, honest measurement), with the
  observed lift reported as-is, not omitted or reframed as a failure

### Requirement: The repeated-read kernel excludes warm-up passes from timing
The system SHALL run warm-up passes over each buffer before recorded timing begins, matching this
repo's existing itopk-sweep timing convention.

#### Scenario: Warm-up passes are excluded from the timed measurement
- **WHEN** the benchmark times the persisting and normal access patterns
- **THEN** at least one untimed warm-up pass precedes the timed passes for each configuration

