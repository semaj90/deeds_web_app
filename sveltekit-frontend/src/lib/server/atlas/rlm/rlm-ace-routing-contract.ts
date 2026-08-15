import { z } from 'zod';

export const RLM_INSPECTION_BRANCHES = [
  'AST',
  'CALLERS',
  'TESTS',
  'RUNTIME',
  'DOCUMENTATION',
  'GRAPH',
  'SOURCE',
] as const;

export const RLM_ACTIVE_HEADS = [
  'SEMANTIC',
  'LEXICAL',
  'STRUCTURAL',
  'GRAPH',
  'EXECUTION',
  'DOMAIN',
  'MEMORY',
] as const;

export const ACE_OBJECT_KINDS = [
  'SEMANTIC_768',
  'AST_SUBTREE',
  'CALLER_NEIGHBORHOOD',
  'TEST_PACKET',
  'SOURCE_SPAN',
  'GRAPH_NEIGHBORHOOD',
  'CONTEXT_FRAGMENT',
] as const;

export const RlmSomCellV1Schema = z.object({
  x: z.number().int().min(0).max(19),
  y: z.number().int().min(0).max(19),
  revision: z.string().min(1),
}).strict();

export const RlmRoutingPrefillV1Schema = z.object({
  schema: z.literal('atlas.rlm.routing-prefill.v1'),
  requestId: z.string().min(1),
  query: z.string().min(1),
  workspaceRevision: z.string().min(1),
  taskState: z.string().min(1).nullable(),
  somCell: RlmSomCellV1Schema.nullable(),
  neighboringSomCells: z.array(RlmSomCellV1Schema.omit({ revision: true })).max(9),
  centroidIds: z.array(z.string().min(1)).max(32),
  cachedIntentState: z.record(z.string(), z.unknown()).nullable(),
  activeHeads: z.array(z.enum(RLM_ACTIVE_HEADS)).max(RLM_ACTIVE_HEADS.length),
  fetchPolicy: z.object({
    candidateK: z.number().int().positive().max(4096),
    promotedK: z.number().int().positive().max(512),
    graphDepth: z.number().int().min(0).max(4),
    astDepth: z.number().int().min(0).max(8),
    contextTokenBudget: z.number().int().positive().max(131072),
  }).strict(),
}).strict();

export type RlmRoutingPrefillV1 = z.infer<typeof RlmRoutingPrefillV1Schema>;

export const RlmNavigationDecisionV1Schema = z.object({
  schema: z.literal('atlas.rlm.navigation-decision.v1'),
  requestId: z.string().min(1),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable(),
  treeNodeId: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  branches: z.array(z.enum(RLM_INSPECTION_BRANCHES)).min(1),
  recurse: z.boolean(),
  reasonCodes: z.array(z.string().min(1)).min(1).max(16),
  evidenceRefs: z.array(z.string().min(1)).max(64),
}).strict();

export type RlmNavigationDecisionV1 = z.infer<typeof RlmNavigationDecisionV1Schema>;

export const AcePrefetchHintV1Schema = z.object({
  schema: z.literal('atlas.ace.prefetch-hint.v1'),
  requestId: z.string().min(1),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable(),
  treeNodeId: z.string().min(1).nullable(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  objectKind: z.enum(ACE_OBJECT_KINDS),
  targetResidency: z.enum(['WARM', 'HOT']),
  targetRepresentation: z.enum(['REFERENCE', 'FP16', 'FP32', 'TURBO_4BIT']),
  utility: z.number().min(0).max(1),
  reason: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).max(64),
}).strict();

export type AcePrefetchHintV1 = z.infer<typeof AcePrefetchHintV1Schema>;

export const RlmAceRoutingReceiptV1Schema = z.object({
  schema: z.literal('atlas.rlm-ace.routing-receipt.v1'),
  requestId: z.string().min(1),
  generatedAt: z.string().datetime(),
  routingPrefill: RlmRoutingPrefillV1Schema,
  navigation: z.array(RlmNavigationDecisionV1Schema),
  prefetchHints: z.array(AcePrefetchHintV1Schema),
  canonicalWrites: z.literal(false),
  cacheWrites: z.literal(false),
  notes: z.array(z.string()),
}).strict();

export type RlmAceRoutingReceiptV1 = z.infer<typeof RlmAceRoutingReceiptV1Schema>;
