import { createHash } from 'node:crypto';
import { z } from 'zod';

export const StructuralEvidenceProviderV1Schema = z.enum([
  'NODE_TREE_SITTER',
  'TREESITTER_CHUNKER',
  'AST_GREP',
]);
export type StructuralEvidenceProviderV1 = z.infer<typeof StructuralEvidenceProviderV1Schema>;

export const StructuralSpanRelationV1Schema = z.enum([
  'EXACT',
  'CHUNK_CONTAINS_SYMBOL',
  'SYMBOL_CONTAINS_CHUNK',
  'OVERLAPS',
  'DISJOINT',
]);
export type StructuralSpanRelationV1 = z.infer<typeof StructuralSpanRelationV1Schema>;

export const StructuralObservationV2Schema = z.object({
  schema: z.literal('atlas.structural-observation.v2'),
  provider: StructuralEvidenceProviderV1Schema,
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  providerRevision: z.string().min(1),
  startByte: z.number().int().nonnegative(),
  endByte: z.number().int().nonnegative(),
  rawKind: z.string().min(1),
  symbolKind: z.string().min(1),
  name: z.string().nullable(),
  parentPath: z.string().nullable(),
  evidenceKey: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict().superRefine((value, ctx) => {
  if (value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
});
export type StructuralObservationV2 = z.infer<typeof StructuralObservationV2Schema>;

export const StructuralSpanRelationV1SchemaObject = z.object({
  schema: z.literal('atlas.structural-span-relation.v1'),
  leftEvidenceKey: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  rightEvidenceKey: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  relation: StructuralSpanRelationV1Schema,
  intersectionBytes: z.number().int().nonnegative(),
  unionBytes: z.number().int().nonnegative(),
  iou: z.number().min(0).max(1),
  leftContainsRight: z.boolean(),
  rightContainsLeft: z.boolean(),
}).strict();
export type StructuralSpanRelationV1Object = z.infer<typeof StructuralSpanRelationV1SchemaObject>;

function evidenceDigest(input: Omit<StructuralObservationV2, 'schema' | 'evidenceKey'>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(input)).digest('hex')}`;
}

export function buildStructuralObservationV2(
  input: Omit<StructuralObservationV2, 'schema' | 'evidenceKey'>,
): StructuralObservationV2 {
  const normalized = { schema: 'atlas.structural-observation.v2' as const, ...input };
  return StructuralObservationV2Schema.parse({ ...normalized, evidenceKey: evidenceDigest(input) });
}

export function relateStructuralSpansV1(
  left: Pick<StructuralObservationV2, 'startByte' | 'endByte' | 'evidenceKey'>,
  right: Pick<StructuralObservationV2, 'startByte' | 'endByte' | 'evidenceKey'>,
): StructuralSpanRelationV1Object {
  const intersectionBytes = Math.max(0, Math.min(left.endByte, right.endByte) - Math.max(left.startByte, right.startByte));
  const leftBytes = Math.max(0, left.endByte - left.startByte);
  const rightBytes = Math.max(0, right.endByte - right.startByte);
  const unionBytes = leftBytes + rightBytes - intersectionBytes;
  const leftContainsRight = left.startByte <= right.startByte && left.endByte >= right.endByte;
  const rightContainsLeft = right.startByte <= left.startByte && right.endByte >= left.endByte;
  const relation: StructuralSpanRelationV1 = left.startByte === right.startByte && left.endByte === right.endByte
    ? 'EXACT'
    : leftContainsRight ? 'CHUNK_CONTAINS_SYMBOL'
      : rightContainsLeft ? 'SYMBOL_CONTAINS_CHUNK'
        : intersectionBytes > 0 ? 'OVERLAPS' : 'DISJOINT';
  return StructuralSpanRelationV1SchemaObject.parse({
    schema: 'atlas.structural-span-relation.v1', leftEvidenceKey: left.evidenceKey,
    rightEvidenceKey: right.evidenceKey, relation, intersectionBytes, unionBytes,
    iou: unionBytes === 0 ? 1 : intersectionBytes / unionBytes,
    leftContainsRight, rightContainsLeft,
  });
}
