import { canonicalExecutionSha256 } from '../runtime/canonical-execution-json.js';
import { UnifiedResidencyAdapter, type UnifiedResidencyDescriptor } from './unified-residency-adapter-v1.js';

/**
 * BITFROST-GPU-MEMORY-ADMISSION-01
 *
 * A pure, deterministic admission POLICY -- not a hardware probe. This module
 * intentionally does not call `cudaMemGetInfo`, shell out to `nvidia-smi`, or
 * query the Windows WDDM budget API itself. Those are separate, already-solved
 * data-collection concerns (see `scripts/atlas/bitfrost-l2-01/run-l2-persist-bench.mjs`
 * for the existing nvidia-smi-based free-VRAM probing pattern, and root
 * CLAUDE.md's "BITFROST-L2-01" section for why `cudaMemGetInfo` alone is
 * untrustworthy on this host's Windows WDDM stack -- it reported ~6.68GB free
 * while `nvidia-smi` reported ~140-400MB free, a ~20x discrepancy explained by
 * WDDM's `Budget` including oversubscribable shared-system-memory headroom,
 * not a strict physically-free-right-now figure).
 *
 *   cudaMemGetInfo / WDDM / external probe
 *              |
 *              v
 *   (caller-supplied observation fields)
 *              |
 *              v
 *   decideGpuMemoryAdmissionV1()   <-- this module: deterministic, side-effect-free
 *              |
 *              v
 *   GpuMemoryAdmissionV1
 *
 * Hardware collection can fail, be mocked, or vary under WDDM without ever
 * contaminating the admission algorithm below. Wiring a real observation
 * adapter (CUDA, WDDM) is deliberately a SEPARATE follow-up gate, not folded
 * into this module.
 *
 * Three strictly separated stages inside `decideGpuMemoryAdmissionV1()`:
 *   1. Validate/normalize evidence  -- discard untrusted signals, never guess
 *   2. Classify pressure            -- UNKNOWN/CRITICAL/HIGH/ELEVATED/LOW,
 *                                      purely descriptive of what was observed
 *   3. Choose the decision          -- ADMIT/EVICT_THEN_ADMIT/REJECT/DEFER,
 *                                      derived from pressure + requested bytes
 *                                      + reclaimability, never equated with
 *                                      pressureState itself
 *
 * Decision meaning is deliberately narrow and non-overlapping:
 *   UNKNOWN evidence        -> DEFER              (retry once evidence exists)
 *   known evidence + fits   -> ADMIT
 *   known evidence + reclaimable covers the gap -> EVICT_THEN_ADMIT
 *   known evidence + unsafe otherwise -> REJECT
 * DEFER is NEVER used as a softer REJECT under known high pressure -- known
 * high/critical pressure that doesn't fit is REJECT (or EVICT_THEN_ADMIT if
 * reclaimable), never DEFER. DEFER exists solely for insufficient evidence.
 *
 * BitFrost remains the residency OWNER (this repo's ownership table: ACE
 * decides WHAT is useful, BitFrost decides WHERE it resides). This module is
 * a bounded helper BitFrost calls before admitting a tile into
 * `UnifiedResidencyAdapter` (../tensors/unified-residency-adapter-v1.ts) --
 * it is not itself a residency owner, and it never mutates residency state.
 * Deliberately NOT wired into unified-residency-adapter-v1.ts in this change
 * (that file may be under concurrent edit elsewhere in this session's
 * broader tensor-residency-integration effort) -- callers compose the two
 * explicitly: call `decideGpuMemoryAdmissionV1()` first, then only call
 * `UnifiedResidencyAdapter.admit()` if the decision is `ADMIT` or
 * `EVICT_THEN_ADMIT` (after BitFrost's own residency ledger performs the
 * eviction -- this module never evicts anything itself).
 *
 * A passing admission decision answers ONLY "can these bytes safely reside on
 * this GPU right now?" -- it is never authorization to promote the live
 * current cohort. Current-corpus authority (workspace -> source -> packet ->
 * chunk lineage) is an entirely independent, separately-gated concern.
 */

export const GPU_MEMORY_ADMISSION_SCHEMA = 'atlas.gpu-memory-admission.v1' as const;

/** Fixed reserve withheld whenever a decoder (e.g. llama-server) is active on
 * this shared GPU -- treating live decoder survival as a first-class
 * constraint, per this repo's own BITFROST-L2-01 finding (llama-server.exe
 * verified undisturbed across every L2-persistence benchmark run this
 * session touched). This is a policy default, not a measured value -- a
 * caller may override it per-request via `decoderReserveBytes`. */
export const DEFAULT_DECODER_RESERVE_BYTES = 2_000_000_000;

/** The absolute safe-allowance floor. Below this many effective bytes, the
 * device itself is CRITICAL regardless of the specific request; above it but
 * still consumed by the request, the request itself is what's unsafe (HIGH).
 * Also used as the required post-admission headroom for ADMIT/EVICT_THEN_ADMIT. */
export const MIN_SAFE_ALLOWANCE_BYTES = 64_000_000;

export type GpuPressureState = 'UNKNOWN' | 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'LOW';
export type GpuAdmissionDecision = 'ADMIT' | 'DEFER' | 'EVICT_THEN_ADMIT' | 'REJECT';

export interface GpuMemoryAdmissionInputV1 {
  /** Free bytes as directly observed by the caller (e.g. via `nvidia-smi`
   * queried out-of-process) -- the most trustworthy single signal on this
   * host per BITFROST-L2-01, but still just one signal, never used alone. */
  deviceFreeObserved: number | null;
  /** Windows WDDM per-process budget (dedicated + shared, oversubscribable
   * per Microsoft's own docs) -- optimistic, never trusted as a ceiling by
   * itself. */
  wddmBudget: number | null;
  /** Bytes this process is currently reported as using against that WDDM
   * budget. */
  wddmCurrentUsage: number | null;
  /** Free bytes as reported by `cudaMemGetInfo` inside the CUDA context --
   * verified on this host to be a ~20x-optimistic figure relative to
   * `nvidia-smi`; never used as the sole or primary signal. */
  cudaContextFree: number | null;
  /** Bytes the caller wants to admit for this tile. */
  requestedBytes: number;
  /** Additional headroom to withhold beyond the decoder reserve (e.g. for
   * other concurrent GPU consumers). Defaults to 0. */
  reservedHeadroom?: number;
  /** Whether a decoder process (llama-server or equivalent) is currently
   * live on this device -- gates the decoder reserve below. */
  decoderActive: boolean;
  /** Override for the decoder reserve amount; defaults to
   * `DEFAULT_DECODER_RESERVE_BYTES` when `decoderActive` is true. */
  decoderReserveBytes?: number;
  /** Bytes BitFrost's OWN residency ledger reports as reclaimable (already-
   * resident, lower-priority tiles) -- optional; when present and the
   * request doesn't fit in raw effective space but does fit after eviction,
   * the decision becomes EVICT_THEN_ADMIT instead of REJECT. This module
   * never performs the eviction itself -- BitFrost's residency ledger owns
   * that. */
  evictableBytes?: number;
  /** Optional descriptor checksum this admission decision is being made
   * for, folded into the receipt for traceability. */
  descriptorChecksum?: string | null;
  /** Optional evidence references (e.g. paths to the receipts that produced
   * the observed signals) -- purely for audit trail, never load-bearing for
   * the decision itself. Order is preserved in the admission checksum
   * (`canonicalExecutionSha256` preserves array order because array order is
   * often semantic) -- reordering `evidenceRefs` WILL change
   * `admissionChecksum`. This is intentional: evidence order may carry
   * precedence meaning, and silently normalizing it away would hide that. */
  evidenceRefs?: readonly string[];
}

export interface GpuMemoryAdmissionV1 {
  schema: typeof GPU_MEMORY_ADMISSION_SCHEMA;
  descriptorChecksum: string | null;
  requestedBytes: number;
  reservedHeadroom: number;
  deviceFreeObserved: number | null;
  wddmBudget: number | null;
  wddmCurrentUsage: number | null;
  cudaContextFree: number | null;
  decoderActive: boolean;
  /** The single most-conservative combined free-bytes reading across all
   * trusted signals, after subtracting reserves ONCE (never subtracted
   * per-signal). Null only when zero signals were trustworthy. */
  effectiveAdmittableBytes: number | null;
  /** effectiveAdmittableBytes - requestedBytes. Null when effectiveAdmittableBytes is null. */
  postAdmissionHeadroomBytes: number | null;
  pressureState: GpuPressureState;
  decision: GpuAdmissionDecision;
  reason: string;
  evidenceRefs: readonly string[];
  writesPerformed: false;
  admissionChecksum: string;
}

function isTrustedObservation(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && Number.isSafeInteger(value) && value >= 0;
}

/** Stage 1: validate/normalize evidence. Untrusted individual readings
 * (negative, non-finite, non-safe-integer) are excluded from the signal set
 * entirely rather than propagated -- corrupt evidence is treated as absent
 * evidence for that signal, deterministically, never guessed at. */
function wddmAvailable(input: GpuMemoryAdmissionInputV1): number | null {
  if (!isTrustedObservation(input.wddmBudget) || !isTrustedObservation(input.wddmCurrentUsage)) return null;
  return Math.max(0, input.wddmBudget - input.wddmCurrentUsage);
}

function observedFreeBound(input: GpuMemoryAdmissionInputV1): number | null {
  const signals = [
    isTrustedObservation(input.deviceFreeObserved) ? input.deviceFreeObserved : null,
    wddmAvailable(input),
    isTrustedObservation(input.cudaContextFree) ? input.cudaContextFree : null,
  ].filter((value): value is number => value !== null);
  if (signals.length === 0) return null;
  // The most conservative (smallest) reading wins -- never an average, never
  // the optimistic maximum. This is the direct BITFROST-L2-01 lesson: on
  // this host, cudaMemGetInfo overstated free memory by ~20x relative to
  // nvidia-smi. Trusting anything but the minimum here would reproduce
  // exactly that failure mode.
  return Math.min(...signals);
}

/** Stage 2: classify pressure -- purely descriptive of what was observed,
 * independent of what BitFrost should DO about it (stage 3). */
function classifyPressure(effectiveAdmittableBytes: number | null, requestedBytes: number): GpuPressureState {
  if (effectiveAdmittableBytes === null) return 'UNKNOWN';
  if (effectiveAdmittableBytes < MIN_SAFE_ALLOWANCE_BYTES) return 'CRITICAL';
  const postAdmission = effectiveAdmittableBytes - requestedBytes;
  if (postAdmission < MIN_SAFE_ALLOWANCE_BYTES) return 'HIGH';
  if (postAdmission < MIN_SAFE_ALLOWANCE_BYTES * 2) return 'ELEVATED';
  return 'LOW';
}

/**
 * Decide whether a GPU tile admission request is safe, given whatever
 * memory-pressure signals the caller observed. Pure function -- no hardware
 * access, no residency-ledger mutation, `writesPerformed` is always `false`.
 */
export function decideGpuMemoryAdmissionV1(input: GpuMemoryAdmissionInputV1): GpuMemoryAdmissionV1 {
  if (!Number.isFinite(input.requestedBytes) || !Number.isSafeInteger(input.requestedBytes) || input.requestedBytes < 0) {
    throw new Error('GPU_MEMORY_ADMISSION_REQUESTED_BYTES_INVALID');
  }

  // --- Stage 1: validate/normalize evidence ---
  const reservedHeadroom = input.reservedHeadroom ?? 0;
  const decoderReserve = input.decoderActive ? (input.decoderReserveBytes ?? DEFAULT_DECODER_RESERVE_BYTES) : 0;
  const totalReserve = reservedHeadroom + decoderReserve;

  const freeBound = observedFreeBound(input);
  // Reserves are subtracted exactly ONCE, after taking the most conservative
  // physical observation -- never per-signal (that would double-charge and
  // is easy to get inconsistent across signals).
  const effectiveAdmittableBytes = freeBound === null ? null : Math.max(0, freeBound - totalReserve);
  const postAdmissionHeadroomBytes = effectiveAdmittableBytes === null ? null : effectiveAdmittableBytes - input.requestedBytes;

  // --- Stage 2: classify pressure ---
  const pressureState = classifyPressure(effectiveAdmittableBytes, input.requestedBytes);

  // --- Stage 3: choose the decision ---
  let decision: GpuAdmissionDecision;
  let reason: string;
  const evictableBytes = input.evictableBytes ?? 0;

  if (pressureState === 'UNKNOWN') {
    decision = 'DEFER';
    reason = 'GPU_MEMORY_ADMISSION_NO_TRUSTED_EVIDENCE -- at least one of deviceFreeObserved, wddmBudget+wddmCurrentUsage, or cudaContextFree must be a trusted (finite, safe-integer, non-negative) observation; DEFER here means "retry once evidence exists", not a soft rejection';
  } else if (input.requestedBytes <= effectiveAdmittableBytes! && postAdmissionHeadroomBytes! >= MIN_SAFE_ALLOWANCE_BYTES) {
    decision = 'ADMIT';
    reason = `GPU_MEMORY_ADMISSION_FITS_WITH_SAFE_HEADROOM -- effectiveAdmittableBytes=${effectiveAdmittableBytes} covers requestedBytes=${input.requestedBytes} leaving postAdmissionHeadroomBytes=${postAdmissionHeadroomBytes} at pressureState=${pressureState}`;
  } else if (evictableBytes > 0 && effectiveAdmittableBytes! + evictableBytes - input.requestedBytes >= MIN_SAFE_ALLOWANCE_BYTES) {
    decision = 'EVICT_THEN_ADMIT';
    reason = `GPU_MEMORY_ADMISSION_REQUIRES_EVICTION -- effectiveAdmittableBytes=${effectiveAdmittableBytes} alone is insufficient for requestedBytes=${input.requestedBytes} at safe headroom, but BitFrost-reported evictableBytes=${evictableBytes} closes the gap; BitFrost's own residency ledger must perform the eviction, this module does not`;
  } else {
    decision = 'REJECT';
    reason = `GPU_MEMORY_ADMISSION_UNSAFE -- effectiveAdmittableBytes=${effectiveAdmittableBytes} plus evictableBytes=${evictableBytes} does not leave MIN_SAFE_ALLOWANCE_BYTES=${MIN_SAFE_ALLOWANCE_BYTES} of headroom after requestedBytes=${input.requestedBytes} at pressureState=${pressureState}`;
  }

  const body = {
    schema: GPU_MEMORY_ADMISSION_SCHEMA,
    descriptorChecksum: input.descriptorChecksum ?? null,
    requestedBytes: input.requestedBytes,
    reservedHeadroom: totalReserve,
    deviceFreeObserved: input.deviceFreeObserved,
    wddmBudget: input.wddmBudget,
    wddmCurrentUsage: input.wddmCurrentUsage,
    cudaContextFree: input.cudaContextFree,
    decoderActive: input.decoderActive,
    effectiveAdmittableBytes,
    postAdmissionHeadroomBytes,
    pressureState,
    decision,
    reason,
    evidenceRefs: input.evidenceRefs ?? [],
    writesPerformed: false as const,
  };

  return { ...body, admissionChecksum: canonicalExecutionSha256(body) };
}

/**
 * BITFROST-GPU-MEMORY-ADMISSION-01 (stage F: integration)
 *
 * The explicit pre-check composition this module's own header comment
 * already prescribed: call `decideGpuMemoryAdmissionV1()` first, and only
 * call `UnifiedResidencyAdapter.admit()` if the decision permits it. This
 * wrapper does NOT compute the admission decision itself (the caller must
 * supply an already-produced `GpuMemoryAdmissionV1`, keeping observation ->
 * decision -> mutation as three separately-inspectable steps, per this
 * module's own three-stage discipline) and does NOT modify `admit()`'s own
 * signature or internal budget check -- it is purely an ordering guard placed
 * in front of it.
 *
 * `EVICT_THEN_ADMIT` is accepted here on the assumption that eviction has
 * ALREADY happened by the time this is called -- this module never evicts
 * anything itself (BitFrost's own residency ledger owns that), so a caller
 * passing an `EVICT_THEN_ADMIT` decision is asserting the eviction step is
 * already complete, not asking this function to perform it.
 *
 * `DEFER` and `REJECT` both throw rather than silently no-op -- a caller that
 * ignores the return value must not accidentally treat "did not throw" as
 * "was admitted" for a decision this function refused to act on.
 */
export function admitWithGpuMemoryAdmissionCheck(
  adapter: UnifiedResidencyAdapter,
  descriptor: UnifiedResidencyDescriptor,
  admission: GpuMemoryAdmissionV1,
): void {
  if (admission.decision !== 'ADMIT' && admission.decision !== 'EVICT_THEN_ADMIT') {
    throw new Error(`GPU_MEMORY_ADMISSION_REFUSED_${admission.decision} -- ${admission.reason}`);
  }
  adapter.admit(descriptor);
}
