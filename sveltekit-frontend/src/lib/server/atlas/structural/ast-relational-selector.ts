import { z } from 'zod';

const S = z.string().min(1);

export const AstRelationSchema = z.enum([
  'SELF',
  'PARENT',
  'CHILD',
  'ANCESTOR',
  'DESCENDANT',
  'SIBLING',
  'CALLS',
  'CALLED_BY',
  'REFERENCES',
  'REFERENCED_BY',
  'TYPE_OF',
  'TESTS',
  'DIAGNOSTIC_FOR',
]);
export type AstRelation = z.infer<typeof AstRelationSchema>;

export const AstNodeSelectorV1Schema: z.ZodType<AstNodeSelectorV1> = z.lazy(() => z.object({
  nodeType: S.optional(),
  named: z.boolean().optional(),
  name: S.optional(),
  relation: AstRelationSchema.optional(),
  maxDepth: z.number().int().min(0).max(8).optional(),
  topK: z.number().int().positive().max(256).optional(),
  has: z.lazy(() => AstNodeSelectorV1Schema).optional(),
}).strict());

export type AstNodeSelectorV1 = {
  nodeType?: string;
  named?: boolean;
  name?: string;
  relation?: AstRelation;
  maxDepth?: number;
  topK?: number;
  has?: AstNodeSelectorV1;
};

export const AstTraversalSeedV1Schema = z.object({
  canonicalId: S,
  symbolVersionId: S.nullable(),
  treeNodeId: S,
  workspaceRevision: S,
  sourceRevision: S,
  graphRevision: S,
  sourceRef: S,
}).strict();
export type AstTraversalSeedV1 = z.infer<typeof AstTraversalSeedV1Schema>;

export const AstTraversalPlanV1Schema = z.object({
  schema: z.literal('atlas.ast-traversal-plan.v1'),
  requestId: S,
  seed: AstTraversalSeedV1Schema,
  selector: AstNodeSelectorV1Schema,
  execution: z.object({
    namedNodesFirst: z.literal(true),
    requireRevisionParity: z.literal(true),
    maxVisitedNodes: z.number().int().positive().max(4096),
    failClosedOnMissingIdentity: z.literal(true),
  }).strict(),
  reasonCodes: z.array(S).min(1),
}).strict();
export type AstTraversalPlanV1 = z.infer<typeof AstTraversalPlanV1Schema>;

export function buildAstTraversalPlan(input: {
  requestId: string;
  seed: AstTraversalSeedV1;
  intent: string;
  selector?: AstNodeSelectorV1;
}): AstTraversalPlanV1 {
  const text = input.intent.toLowerCase();
  const repairLike = /repair|fix|error|fail|compile|runtime|diagnostic|test/.test(text);
  const typeLike = /type|signature|argument|parameter|overload/.test(text);

  const selector: AstNodeSelectorV1 = input.selector ?? {
    named: true,
    relation: repairLike ? 'ANCESTOR' : 'SELF',
    maxDepth: repairLike ? 4 : 1,
    topK: repairLike ? 32 : 16,
    ...(typeLike
      ? {
          has: {
            named: true,
            relation: 'TYPE_OF',
            maxDepth: 2,
            topK: 16,
          },
        }
      : {}),
  };

  return AstTraversalPlanV1Schema.parse({
    schema: 'atlas.ast-traversal-plan.v1',
    requestId: input.requestId,
    seed: input.seed,
    selector,
    execution: {
      namedNodesFirst: true,
      requireRevisionParity: true,
      maxVisitedNodes: repairLike ? 1024 : 384,
      failClosedOnMissingIdentity: true,
    },
    reasonCodes: [
      'AST_RELATIONS_ARE_FACTS_NOT_IDENTITY',
      'RELATIONAL_SELECTION_IS_BOUNDED',
      'NAMED_NODES_FIRST',
      'RLM_CHOSES_WHICH_RELATION_TO_FOLLOW',
    ],
  });
}
