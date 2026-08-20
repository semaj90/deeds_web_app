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

export const ApiContractSideEffectV1Schema = z.enum([
  'READ_ONLY',
  'MUTATION',
  'MIXED',
  'UNKNOWN',
]);
export type ApiContractSideEffectV1 = z.infer<typeof ApiContractSideEffectV1Schema>;

export const ApiContractObservationV1Schema = z.object({
  schema: z.literal('atlas.api-contract-observation.v1'),
  observationId: z.string().min(1),
  sourceRef: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  treeNodeId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
  transport: ApiContractTransportV1Schema,
  method: z.string().min(1).nullable(),
  route: z.string().min(1).nullable(),
  handlerSymbol: z.string().min(1),
  inputSchemaRefs: z.array(z.string().min(1)),
  outputSchemaRefs: z.array(z.string().min(1)),
  authRequirements: z.array(z.string().min(1)),
  sideEffect: ApiContractSideEffectV1Schema,
  evidenceRefs: z.array(z.string().min(1)).min(1),
  structuralProducer: z.enum(['TREE_SITTER', 'AST_GREP', 'COMBINED']),
  compilerSemanticProducer: z.literal('TS_MORPH').nullable(),
  exactSourceCoordinatesRequired: z.literal(true),
  requiresCanonicalTreeJoin: z.boolean(),
  canonicalWritesAllowed: z.literal(false),
  mutationProposalOnly: z.literal(true),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  producerRevision: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (!value.treeNodeId && !value.requiresCanonicalTreeJoin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['requiresCanonicalTreeJoin'],
      message: 'requiresCanonicalTreeJoin must be true while treeNodeId is unresolved',
    });
  }
  if (value.transport === 'HTTP' && !value.route) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['route'],
      message: 'HTTP observations require an explicit route',
    });
  }
});

export type ApiContractObservationV1 = z.infer<typeof ApiContractObservationV1Schema>;

/**
 * API observations are evidence-layer facts, not endpoint registrations and
 * not mutation authority. Tree-sitter coordinates remain structural truth;
 * ast-grep may recognize the handler/schema pattern; ts-morph may resolve
 * imported schema/type references. Canonical identity is inherited only after
 * the existing structural/GIS join.
 */
export function createApiContractObservationV1(
  value: ApiContractObservationV1,
): ApiContractObservationV1 {
  return ApiContractObservationV1Schema.parse(value);
}
