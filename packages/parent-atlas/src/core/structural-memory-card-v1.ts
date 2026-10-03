import { createHash } from 'node:crypto';
import { z } from 'zod';
import { structuralReferenceKindSchema } from './structural-symbol.js';

const nonEmpty = z.string().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const StructuralMemoryCardV1Schema = z.object({
  schema: z.literal('atlas.structural-memory-card.v1'),
  sourceRef: nonEmpty,
  sourceRevision: nonEmpty,
  workspaceRevision: nonEmpty,
  sourceSpan: z.object({
    startByte: z.number().int().nonnegative(),
    endByte: z.number().int().nonnegative(),
    startLine: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative(),
  }).strict(),
  canonicalIdentityRefs: z.array(z.object({
    kind: z.enum(['packet_key', 'stable_symbol_id', 'symbol_version_id']),
    value: nonEmpty,
  }).strict()).min(1),
  relationships: z.array(z.object({
    referenceId: nonEmpty,
    kind: structuralReferenceKindSchema,
    resolutionStatus: z.enum(['canonical', 'degraded', 'ambiguous', 'unresolved']),
    targetStableSymbolId: nonEmpty.optional(),
  }).strict()),
  syntaxStatus: z.enum(['CLEAN', 'RECOVERED_WITH_ERRORS']),
  upstreamTreeNodeIds: z.array(nonEmpty).min(1),
  upstreamChunkIds: z.array(nonEmpty).default([]),
  representationRevision: nonEmpty,
  producerRevision: nonEmpty,
  evidenceChecksum: sha256,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict().superRefine((card, ctx) => {
  if (card.sourceSpan.endByte < card.sourceSpan.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceSpan', 'endByte'], message: 'endByte must be >= startByte' });
  }
  if (card.sourceSpan.endLine < card.sourceSpan.startLine) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceSpan', 'endLine'], message: 'endLine must be >= startLine' });
  }
  const identityKeys = card.canonicalIdentityRefs.map(({ kind, value }) => `${kind}\u0000${value}`);
  if (new Set(identityKeys).size !== identityKeys.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['canonicalIdentityRefs'], message: 'canonical identity references must be unique' });
  }
  const referenceIds = card.relationships.map(({ referenceId }) => referenceId);
  if (new Set(referenceIds).size !== referenceIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationships'], message: 'relationship references must be unique' });
  }
  card.relationships.forEach((relationship, index) => {
    if (relationship.resolutionStatus === 'canonical' && !relationship.targetStableSymbolId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relationships', index, 'targetStableSymbolId'], message: 'canonical relationship requires a resolved stable symbol ID' });
    }
  });
});

export type StructuralMemoryCardV1 = z.infer<typeof StructuralMemoryCardV1Schema>;
export type StructuralMemoryCardV1Input = Omit<StructuralMemoryCardV1, 'schema' | 'evidenceChecksum' | 'canonicalAuthority' | 'writesPerformed'>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Builds a derived card; all canonical references must be supplied by existing owners. */
export function buildStructuralMemoryCardV1(input: StructuralMemoryCardV1Input): StructuralMemoryCardV1 {
  const payload = {
    schema: 'atlas.structural-memory-card.v1' as const,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    sourceSpan: input.sourceSpan,
    canonicalIdentityRefs: input.canonicalIdentityRefs,
    relationships: input.relationships,
    syntaxStatus: input.syntaxStatus,
    upstreamTreeNodeIds: input.upstreamTreeNodeIds,
    upstreamChunkIds: input.upstreamChunkIds,
    representationRevision: input.representationRevision,
    producerRevision: input.producerRevision,
  };
  const evidenceChecksum = createHash('sha256').update(stableJson(payload)).digest('hex');
  return StructuralMemoryCardV1Schema.parse({
    ...payload,
    evidenceChecksum,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
