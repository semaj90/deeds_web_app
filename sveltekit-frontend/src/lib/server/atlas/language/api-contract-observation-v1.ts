import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ApiContractTransportV1Schema = z.enum([
  'HTTP',
  'GRPC',
  'MCP',
  'A2A',
  'ACP',
  'INTERNAL',
]);
export type ApiContractTransportV1 = z.infer<typeof ApiContractTransportV1Schema>;

export const ApiContractObservationV1Schema = z.object({
  schema: z.literal('atlas.api-contract-observation.v1'),
  observationId: z.string().min(1),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
  transport: ApiContractTransportV1Schema,
  method: z.string().min(1).nullable(),
  route: z.string().min(1).nullable(),
  handlerSymbol: z.string().min(1).nullable(),
  inputSchemaRefs: z.array(z.string().min(1)),
  outputSchemaRefs: z.array(z.string().min(1)),
  authRequirements: z.array(z.string().min(1)),
  sideEffects: z.array(z.string().min(1)),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  structuralEngine: z.enum(['TREE_SITTER', 'AST_GREP', 'TREE_SITTER_PLUS_AST_GREP']),
  semanticEngine: z.enum(['TS_MORPH', 'LSP']).nullable(),
  evidenceRefs: z.array(z.string().min(1)).min(1),
  requiresCanonicalPromotion: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type ApiContractObservationV1 = z.infer<typeof ApiContractObservationV1Schema>;

export const ApiContractObservationInputV1Schema = ApiContractObservationV1Schema.omit({
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

function stableId(input: ApiContractObservationInputV1): string {
  const hash = createHash('sha256').update(stable({
    sourceRef: input.sourceRef,
    treeNodeId: input.treeNodeId,
    symbolVersionId: input.symbolVersionId,
    transport: input.transport,
    method: input.method,
    route: input.route,
    handlerSymbol: input.handlerSymbol,
    workspaceRevision: input.workspaceRevision,
    sourceRevision: input.sourceRevision,
    producerRevision: input.producerRevision,
  }), 'utf8').digest('hex');
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
  const input = ApiContractObservationInputV1Schema.parse(value);
  return ApiContractObservationV1Schema.parse({
    schema: 'atlas.api-contract-observation.v1',
    observationId: stableId(input),
    ...input,
    inputSchemaRefs: [...new Set(input.inputSchemaRefs)].sort(),
    outputSchemaRefs: [...new Set(input.outputSchemaRefs)].sort(),
    authRequirements: [...new Set(input.authRequirements)].sort(),
    sideEffects: [...new Set(input.sideEffects)].sort(),
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
    requiresCanonicalPromotion: true,
    canonicalWritesAllowed: false,
  });
}
