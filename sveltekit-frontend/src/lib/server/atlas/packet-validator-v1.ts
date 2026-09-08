import { createHash } from 'node:crypto';
import {
  computeParameterAssemblyPlanChecksumV1,
  expectedTensorByteLength,
  type ParameterAssemblyPlanV1,
} from './parameter-assembly-plan-v1.js';

/**
 * PacketValidatorV1 — validates a ParameterAssemblyPlanV1 (or any resolved buffer set) against 9
 * named gates before an executor (CUB/cuTile/cuVS/ATen) is allowed to run against it. CANNOT be
 * skipped before an executor runs — divisibility/alignment hints an executor applies on top are
 * optimization info, never a substitute for this gate. See
 * openspec/changes/parent-atlas-packet-control-word-record/design.md's "Five operations" table
 * and its proof-gate item: "PacketValidatorV1 rejects at least one deliberately malformed
 * ParameterAssemblyPlanV1 (wrong shape, bad checksum, out-of-bounds offset) before it would reach
 * any executor."
 */

export const PACKET_VALIDATION_FAILURE_CODES_V1 = [
  'DUPLICATE_OR_EMPTY_IDENTITY',
  'REVISION_MISMATCH',
  'INVALID_UTF8',
  'ORDINAL_MAP_MISMATCH',
  'OUT_OF_BOUNDS',
  'MISALIGNED_OFFSET',
  'SHAPE_STRIDE_MISMATCH',
  'CHECKSUM_MISMATCH',
  'MISSING_REQUIRED_REPRESENTATION',
] as const;
export type PacketValidationFailureCodeV1 = (typeof PACKET_VALIDATION_FAILURE_CODES_V1)[number];

export interface PacketValidationResultV1 {
  valid: boolean;
  failures: PacketValidationFailureCodeV1[];
}

export interface PacketValidationOptionsV1 {
  /** Actual concatenated bytes the plan describes, if already resolved. Enables the UTF-8,
   * bounds (against real buffer length), and checksum checks; omitted, those checks are skipped
   * (not failed) since there is nothing to check bytes against yet. */
  resolvedBuffer?: Uint8Array;
  /** Revisions the caller expects each packetKey to be pinned to; mismatches against the plan's
   * own `revisions` map fail REVISION_MISMATCH. */
  expectedRevisions?: Record<string, string>;
  expectedOrdinalMap?: readonly number[];
  actualOrdinalMap?: readonly number[];
  /** Section names that MUST be present in the plan (e.g. ['semantic768', 'astGraphSlice']). */
  requiredRepresentations?: readonly string[];
}

function fail(failures: PacketValidationFailureCodeV1[], code: PacketValidationFailureCodeV1): void {
  if (!failures.includes(code)) failures.push(code);
}

export function validatePacketAssemblyPlanV1(
  plan: ParameterAssemblyPlanV1,
  opts: PacketValidationOptionsV1 = {},
): PacketValidationResultV1 {
  const failures: PacketValidationFailureCodeV1[] = [];

  // 1. IDENTITY: no duplicate or empty packetKeys.
  const seen = new Set<string>();
  for (const key of plan.packetKeys) {
    if (!key || seen.has(key)) {
      fail(failures, 'DUPLICATE_OR_EMPTY_IDENTITY');
    }
    seen.add(key);
  }

  // 2. REVISION: caller-expected revisions must match the plan's pinned revisions.
  if (opts.expectedRevisions) {
    for (const [key, expected] of Object.entries(opts.expectedRevisions)) {
      if (plan.revisions[key] !== expected) {
        fail(failures, 'REVISION_MISMATCH');
      }
    }
  }

  // 5. BOUNDS + 6. ALIGNMENT + 7. SHAPE_STRIDE (checked per-section; kept together for one pass).
  for (const section of plan.sections) {
    const end = section.offset + section.byteLength;
    if (end > plan.totalByteLength) fail(failures, 'OUT_OF_BOUNDS');
    if (opts.resolvedBuffer && end > opts.resolvedBuffer.length) fail(failures, 'OUT_OF_BOUNDS');
    if (section.offset % plan.alignmentBytes !== 0) fail(failures, 'MISALIGNED_OFFSET');
    if (section.dimensions && section.kind !== 'SOURCE_SPAN') {
      const expected = expectedTensorByteLength(section.dimensions);
      if (expected !== section.byteLength) fail(failures, 'SHAPE_STRIDE_MISMATCH');
    }
  }

  // 3. UTF8 + 8. CHECKSUM (require resolvedBuffer; skipped, not failed, if absent).
  if (opts.resolvedBuffer) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (const section of plan.sections) {
      const slice = opts.resolvedBuffer.subarray(section.offset, section.offset + section.byteLength);
      if (section.kind === 'SOURCE_SPAN') {
        try {
          decoder.decode(slice);
        } catch {
          fail(failures, 'INVALID_UTF8');
        }
      }
      const actualChecksum = createHash('sha256').update(slice).digest('hex');
      if (actualChecksum !== section.checksum) fail(failures, 'CHECKSUM_MISMATCH');
    }
    const recomputedPlanChecksum = computeParameterAssemblyPlanChecksumV1({
      planId: plan.planId,
      packetKeys: plan.packetKeys,
      sections: plan.sections,
    });
    if (recomputedPlanChecksum !== plan.planChecksum) fail(failures, 'CHECKSUM_MISMATCH');
  }

  // 4. ORDINAL_MAP
  if (opts.expectedOrdinalMap && opts.actualOrdinalMap) {
    const matches =
      opts.expectedOrdinalMap.length === opts.actualOrdinalMap.length &&
      opts.expectedOrdinalMap.every((v, i) => v === opts.actualOrdinalMap![i]);
    if (!matches) fail(failures, 'ORDINAL_MAP_MISMATCH');
  }

  // 9. REQUIRED_REPRESENTATION
  if (opts.requiredRepresentations) {
    const presentNames = new Set(plan.sections.map((s) => s.name));
    for (const required of opts.requiredRepresentations) {
      if (!presentNames.has(required)) fail(failures, 'MISSING_REQUIRED_REPRESENTATION');
    }
  }

  return { valid: failures.length === 0, failures };
}
