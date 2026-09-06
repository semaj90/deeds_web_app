import { z } from 'zod';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const ATLAS_EVIDENCE_NAMESPACE_VALUES = [
  'SOURCE',
  'SYMBOL',
  'PACKET',
  'OPENSPEC',
  'REPORT',
  'RECEIPT',
  'TEST',
  'SCHEMA',
  'GRAPH',
  'ONTOLOGY',
  'EXTERNAL',
] as const;

export const atlasEvidenceNamespaceSchema = z.enum(ATLAS_EVIDENCE_NAMESPACE_VALUES);
export type AtlasEvidenceNamespaceV1 = z.infer<typeof atlasEvidenceNamespaceSchema>;

export const byteRangeV1Schema = z
  .object({ startByte: z.number().int().nonnegative(), endByte: z.number().int().positive() })
  .strict()
  .refine((range) => range.endByte > range.startByte, 'endByte must be greater than startByte');

export const lineRangeV1Schema = z
  .object({ startLine: z.number().int().positive(), endLine: z.number().int().positive() })
  .strict()
  .refine((range) => range.endLine >= range.startLine, 'endLine must be at or after startLine');

export const atlasEvidenceResourceV1Schema = z
  .object({
    schema: z.literal('atlas.evidence-resource.v1').default('atlas.evidence-resource.v1'),
    namespace: atlasEvidenceNamespaceSchema,
    locator: id,
    byteRange: byteRangeV1Schema.nullable().default(null),
    lineRange: lineRangeV1Schema.nullable().default(null),
    resourceKey: sha256Hex,
  })
  .strict();

export type AtlasEvidenceResourceV1 = z.infer<typeof atlasEvidenceResourceV1Schema>;

export function buildAtlasEvidenceResourceV1(
  input: Omit<AtlasEvidenceResourceV1, 'schema' | 'resourceKey'>,
): AtlasEvidenceResourceV1 {
  const body = {
    schema: 'atlas.evidence-resource.v1' as const,
    namespace: input.namespace,
    locator: input.locator,
    byteRange: input.byteRange ?? null,
    lineRange: input.lineRange ?? null,
  };
  return atlasEvidenceResourceV1Schema.parse({ ...body, resourceKey: sha256HexV1(body) });
}

export const EVIDENCE_RESOLUTION_METHOD_VALUES = [
  'EXACT_SOURCE_REVISION',
  'SYMBOL_VERSION',
  'TREE_SITTER_OCCURRENCE',
  'LSP_COMPILER_LOCATION',
  'EXACT_TEXT',
  'CONTEXT_ANCHOR',
  'RESOURCE_NATIVE',
] as const;

export const resolvedEvidenceRefV1Schema = z
  .object({
    schema: z.literal('atlas.resolved-evidence-ref.v1').default('atlas.resolved-evidence-ref.v1'),
    resource: atlasEvidenceResourceV1Schema,
    evidenceVersion: revision,
    authorityRevision: revision,
    sourceRevision: revision.nullable(),
    contentChecksum: sha256Hex,
    resolvedByteRange: byteRangeV1Schema.nullable(),
    resolvedLineRange: lineRangeV1Schema.nullable(),
    stableSymbolId: id.nullable(),
    symbolVersionId: id.nullable(),
    resolutionMethod: z.enum(EVIDENCE_RESOLUTION_METHOD_VALUES),
    resolverRevision: revision,
    resolutionChecksum: sha256Hex,
    canonicalAuthority: z.literal(false).default(false),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.resource.namespace === 'SOURCE' && value.sourceRevision === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRevision'], message: 'SOURCE evidence requires sourceRevision' });
    }
    if (value.symbolVersionId !== null && value.stableSymbolId === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stableSymbolId'], message: 'symbolVersionId requires stableSymbolId' });
    }
  });

export type ResolvedEvidenceRefV1 = z.infer<typeof resolvedEvidenceRefV1Schema>;

export interface ResolvedEvidencePayloadV1 {
  evidence: ResolvedEvidenceRefV1;
  content: string;
}

export function buildResolvedEvidenceRefV1(
  input: Omit<ResolvedEvidenceRefV1, 'schema' | 'resolutionChecksum' | 'canonicalAuthority'>,
): ResolvedEvidenceRefV1 {
  const body = {
    schema: 'atlas.resolved-evidence-ref.v1' as const,
    ...input,
    canonicalAuthority: false as const,
  };
  return resolvedEvidenceRefV1Schema.parse({ ...body, resolutionChecksum: sha256HexV1(body) });
}
