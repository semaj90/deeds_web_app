import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * ParameterAssemblyPlanV1 — ParameterAssemblerV1's output. Takes query intent + candidate
 * ordinals + requested sections + model/adapter revisions and produces an explicit offset table:
 * tensor refs, graph slices, feature columns, source-span refs, each with dimensions/offset/
 * checksum. CANNOT blind-concatenate heterogeneous buffers — every section is explicit, aligned,
 * and checksummed. See
 * openspec/changes/parent-atlas-packet-control-word-record/design.md's "Five operations" table.
 *
 * Non-goal (this change): no production wiring into ACE/BitFrost/any executor. Contracts +
 * fixture proof only.
 */

export const PARAMETER_ASSEMBLY_PLAN_SCHEMA = 'atlas.parameter-assembly-plan.v1' as const;

export const ASSEMBLY_SECTION_KINDS_V1 = ['TENSOR_REF', 'GRAPH_SLICE', 'FEATURE_COLUMN', 'SOURCE_SPAN'] as const;
export type AssemblySectionKindV1 = (typeof ASSEMBLY_SECTION_KINDS_V1)[number];

/** Convention: dimensions are element counts; elements are assumed float32 (4 bytes) unless the
 * section kind is SOURCE_SPAN, where byteLength is raw bytes and dimensions is unused. */
export const AssemblySectionV1Schema = z
  .object({
    kind: z.enum(ASSEMBLY_SECTION_KINDS_V1),
    name: z.string().min(1),
    offset: z.number().int().nonnegative(),
    byteLength: z.number().int().nonnegative(),
    dimensions: z.array(z.number().int().positive()).optional(),
    checksum: z.string().min(1),
  })
  .strict();
export type AssemblySectionV1 = z.infer<typeof AssemblySectionV1Schema>;

export const ParameterAssemblyPlanV1Schema = z
  .object({
    schema: z.literal(PARAMETER_ASSEMBLY_PLAN_SCHEMA),
    planId: z.string().min(1),
    packetKeys: z.array(z.string().min(1)).min(1),
    revisions: z.record(z.string().min(1), z.string().min(1)),
    alignmentBytes: z.number().int().positive(),
    totalByteLength: z.number().int().nonnegative(),
    sections: z.array(AssemblySectionV1Schema).min(1),
    planChecksum: z.string().min(1),
  })
  .strict();
export type ParameterAssemblyPlanV1 = z.infer<typeof ParameterAssemblyPlanV1Schema>;

const FLOAT32_BYTES = 4;

function alignUp(n: number, alignmentBytes: number): number {
  return Math.ceil(n / alignmentBytes) * alignmentBytes;
}

function computePlanChecksum(fields: {
  planId: string;
  packetKeys: readonly string[];
  sections: readonly AssemblySectionV1[];
}): string {
  const canonical = JSON.stringify({
    planId: fields.planId,
    packetKeys: fields.packetKeys,
    sections: fields.sections,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * assembleParameterPlanV1 — ParameterAssemblerV1's construction function. Lays out sections
 * sequentially, aligning each section's start offset up to `alignmentBytes`, and computes the
 * plan's own checksum. Does NOT resolve or read any actual bytes — `checksum` per section and the
 * plan's `planChecksum` must be provided/derivable by the caller from already-resolved data (or
 * validated later against a resolved buffer via `validateParameterAssemblyPlanV1`).
 */
export function assembleParameterPlanV1(input: {
  planId: string;
  packetKeys: readonly string[];
  revisions: Record<string, string>;
  alignmentBytes: number;
  sections: ReadonlyArray<{
    kind: AssemblySectionKindV1;
    name: string;
    byteLength: number;
    dimensions?: readonly number[];
    checksum: string;
  }>;
}): ParameterAssemblyPlanV1 {
  let cursor = 0;
  const laidOut: AssemblySectionV1[] = [];
  for (const section of input.sections) {
    const offset = alignUp(cursor, input.alignmentBytes);
    laidOut.push({
      kind: section.kind,
      name: section.name,
      offset,
      byteLength: section.byteLength,
      dimensions: section.dimensions ? [...section.dimensions] : undefined,
      checksum: section.checksum,
    });
    cursor = offset + section.byteLength;
  }
  const totalByteLength = alignUp(cursor, input.alignmentBytes);

  return ParameterAssemblyPlanV1Schema.parse({
    schema: PARAMETER_ASSEMBLY_PLAN_SCHEMA,
    planId: input.planId,
    packetKeys: input.packetKeys,
    revisions: input.revisions,
    alignmentBytes: input.alignmentBytes,
    totalByteLength,
    sections: laidOut,
    planChecksum: computePlanChecksum({ planId: input.planId, packetKeys: input.packetKeys, sections: laidOut }),
  });
}

/** Exposed for PacketValidatorV1's SHAPE_STRIDE_MISMATCH check (assumes float32 elements for
 * TENSOR_REF/GRAPH_SLICE/FEATURE_COLUMN sections that declare `dimensions`). */
export function expectedTensorByteLength(dimensions: readonly number[]): number {
  return dimensions.reduce((acc, d) => acc * d, 1) * FLOAT32_BYTES;
}

export { computePlanChecksum as computeParameterAssemblyPlanChecksumV1 };
