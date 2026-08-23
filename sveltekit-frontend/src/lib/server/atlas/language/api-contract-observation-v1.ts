import { createHash } from 'node:crypto';
import { z } from 'zod';

import { LanguageSourceCoordinateV1Schema } from './language-intelligence-plan.js';

export const ApiContractTransportV1Schema = z.enum([
  'HTTP',
  'GRPC',
  'MCP',
  'A2A',
  'ACP',
  'INTERNAL',
]);
export type ApiContractTransportV1 = z.infer<typeof ApiContractTransportV1Schema>;

export const ApiContractEvidenceSourceV1Schema = z.enum([
  'TREE_SITTER',
  'AST_GREP',
  'TS_MORPH',
  'OPENAPI',
  'PROTOBUF',
  'ZOD',
  'JSON_SCHEMA',
  'ROUTE_MANIFEST',
]);
export type ApiContractEvidenceSourceV1 = z.infer<typeof ApiContractEvidenceSourceV1Schema>;

/**
 * Base object for both observation paths:
 *  - buildApiContractObservationV1(): a lighter, coordinate-free path used
 *    before a canonical structural join exists (treeNodeId/symbolVersionId
 *    may be null; coordinate/evidenceSources/grammarRevision/
 *    semanticEngineRevision/retrievalVoteAdded are absent).
 *  - compileApiContractObservationV1(): the canonical-coordinate-joined path
 *    (coordinate required, treeNodeId non-null; structuralEngine/
 *    semanticEngine are absent in favor of evidenceSources).
 * Kept as an un-exported pre-refine base so ApiContractObservationInputV1Schema
 * can still use .omit() (unavailable once .superRefine() is chained on).
 */
const ApiContractObservationV1BaseSchema = z.object({
  schema: z.literal('atlas.api-contract-observation.v1'),
  observationId: z.string().min(1),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  coordinate: LanguageSourceCoordinateV1Schema.optional(),
  transport: ApiContractTransportV1Schema,
  method: z.string().min(1).nullable(),
  route: z.string().min(1).nullable(),
  handlerSymbol: z.string().min(1),
  inputSchemaRefs: z.array(z.string().min(1)),
  outputSchemaRefs: z.array(z.string().min(1)),
  authRequirements: z.array(z.string().min(1)),
  sideEffects: z.array(z.string().min(1)),
  structuralEngine: z.enum(['TREE_SITTER', 'AST_GREP', 'TREE_SITTER_PLUS_AST_GREP']).optional(),
  semanticEngine: z.enum(['TS_MORPH', 'LSP']).nullable().optional(),
  evidenceSources: z.array(ApiContractEvidenceSourceV1Schema).min(1).optional(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  grammarRevision: z.string().min(1).nullable().optional(),
  semanticEngineRevision: z.string().min(1).nullable().optional(),
  producerRevision: z.string().min(1),
  requiresCanonicalPromotion: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  retrievalVoteAdded: z.literal(false).optional(),
}).strict();

export const ApiContractObservationV1Schema = ApiContractObservationV1BaseSchema.superRefine((value, ctx) => {
  if (!value.coordinate) return;
  if (value.coordinate.treeNodeId !== value.treeNodeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['treeNodeId'],
      message: 'treeNodeId must be inherited from the canonical structural coordinate',
    });
  }
  if (value.coordinate.symbolVersionId !== value.symbolVersionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['symbolVersionId'],
      message: 'symbolVersionId must match the inherited structural coordinate',
    });
  }
  if (value.coordinate.sourceRef !== value.sourceRef) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sourceRef'],
      message: 'sourceRef must match the inherited structural coordinate',
    });
  }
});
export type ApiContractObservationV1 = z.infer<typeof ApiContractObservationV1Schema>;

export const ApiContractObservationInputV1Schema = ApiContractObservationV1BaseSchema.omit({
  schema: true,
  observationId: true,
  requiresCanonicalPromotion: true,
  canonicalWritesAllowed: true,
});
export type ApiContractObservationInputV1 = z.infer<typeof ApiContractObservationInputV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalizeInput(input: ApiContractObservationInputV1): ApiContractObservationInputV1 {
  return {
    ...input,
    inputSchemaRefs: sortedUnique(input.inputSchemaRefs),
    outputSchemaRefs: sortedUnique(input.outputSchemaRefs),
    authRequirements: sortedUnique(input.authRequirements),
    sideEffects: sortedUnique(input.sideEffects),
    evidenceRefs: sortedUnique(input.evidenceRefs),
  };
}

function stableId(input: ApiContractObservationInputV1): string {
  const hash = createHash('sha256').update(stable(input), 'utf8').digest('hex');
  return `apiobs:${hash}`;
}

/**
 * Compiles already-grounded syntax/compiler facts into a transport/schema
 * observation. It does not infer missing canonical coordinates and does not
 * become an API schema authority: OpenAPI/Protobuf/Zod/etc. remain executable
 * schema sources while Parent Atlas records their revision-qualified links.
 */
export function buildApiContractObservationV1(
  value: ApiContractObservationInputV1,
): ApiContractObservationV1 {
  const parsed = ApiContractObservationInputV1Schema.parse(value);
  const input = canonicalizeInput(parsed);
  return ApiContractObservationV1Schema.parse({
    schema: 'atlas.api-contract-observation.v1',
    observationId: stableId(input),
    ...input,
    requiresCanonicalPromotion: true,
    canonicalWritesAllowed: false,
  });
}

export const ApiContractNominationV1Schema = z.object({
  schema: z.literal('atlas.api-contract-nomination.v1'),
  sourceRef: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  coordinate: LanguageSourceCoordinateV1Schema,
  transport: ApiContractTransportV1Schema,
  method: z.string().min(1).nullable(),
  route: z.string().min(1).nullable(),
  handlerSymbol: z.string().min(1),
  inputSchemaRefs: z.array(z.string().min(1)).default([]),
  outputSchemaRefs: z.array(z.string().min(1)).default([]),
  authRequirements: z.array(z.string().min(1)).default([]),
  sideEffects: z.array(z.string().min(1)).default([]),
  evidenceSources: z.array(ApiContractEvidenceSourceV1Schema).min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  grammarRevision: z.string().min(1).nullable(),
  semanticEngineRevision: z.string().min(1).nullable(),
  producerRevision: z.string().min(1),
}).strict();
export type ApiContractNominationV1 = z.infer<typeof ApiContractNominationV1Schema>;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function observationId(value: ApiContractNominationV1, treeNodeId: string): string {
  return `api-contract:${createHash('sha256').update(stableStringify({
    sourceRef: value.sourceRef,
    sourceRevision: value.sourceRevision,
    treeNodeId,
    transport: value.transport,
    method: value.method,
    route: value.route,
    handlerSymbol: value.handlerSymbol,
    inputSchemaRefs: [...new Set(value.inputSchemaRefs)].sort(),
    outputSchemaRefs: [...new Set(value.outputSchemaRefs)].sort(),
    producerRevision: value.producerRevision,
  })).digest('hex')}`;
}

/**
 * Promote an API nomination only after a canonical structural coordinate has
 * been joined. ast-grep/ts-morph may help discover the contract, but neither is
 * allowed to synthesize a treeNodeId or symbolVersionId here.
 */
export function compileApiContractObservationV1(
  raw: ApiContractNominationV1,
): ApiContractObservationV1 {
  const input = ApiContractNominationV1Schema.parse(raw);
  const treeNodeId = input.coordinate.treeNodeId;
  if (!treeNodeId) throw new Error('API_CONTRACT_CANONICAL_TREE_NODE_REQUIRED');

  return ApiContractObservationV1Schema.parse({
    schema: 'atlas.api-contract-observation.v1',
    observationId: observationId(input, treeNodeId),
    sourceRef: input.sourceRef,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    coordinate: input.coordinate,
    treeNodeId,
    symbolVersionId: input.coordinate.symbolVersionId,
    transport: input.transport,
    method: input.method,
    route: input.route,
    handlerSymbol: input.handlerSymbol,
    inputSchemaRefs: [...new Set(input.inputSchemaRefs)].sort(),
    outputSchemaRefs: [...new Set(input.outputSchemaRefs)].sort(),
    authRequirements: [...new Set(input.authRequirements)].sort(),
    sideEffects: [...new Set(input.sideEffects)].sort(),
    evidenceSources: [...new Set(input.evidenceSources)],
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
    grammarRevision: input.grammarRevision,
    semanticEngineRevision: input.semanticEngineRevision,
    producerRevision: input.producerRevision,
    requiresCanonicalPromotion: true,
    canonicalWritesAllowed: false,
    retrievalVoteAdded: false,
  });
}
