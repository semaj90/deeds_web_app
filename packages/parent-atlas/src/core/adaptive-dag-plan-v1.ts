import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const DAG_ACTION_KIND_VALUES = [
  'FETCH_POSTGRES', 'FETCH_QDRANT', 'FETCH_FILE', 'AST_SCAN',
  'SIMDJSON_SCAN', 'GRAPH_EXPAND', 'WEB_SEARCH', 'RERANK',
  'BUILD_CONTEXT', 'SYNTHESIZE', 'FETCH_LATENT',
] as const;
export const dagActionKindSchema = z.enum(DAG_ACTION_KIND_VALUES);
export type DagActionKind = z.infer<typeof dagActionKindSchema>;

export const adaptiveDagActionSchema = z.object({
  actionId: id,
  actionKind: dagActionKindSchema,
  parentActionIds: z.array(id),
  inputArtifactRefs: z.array(id),
  inputChecksum: sha256Hex,
  parameterArtifactRef: id.nullable(),
  parameterChecksum: sha256Hex.nullable(),
  outputContract: id,
  mutationPolicy: z.enum(['READ_ONLY', 'PROPOSE_ONLY', 'MUTATES_WITH_RECEIPT']),
  timeoutMs: z.number().int().positive(),
  failurePolicy: z.enum(['FAIL_CLOSED', 'SKIP_OPTIONAL', 'RETRY', 'FALLBACK']),
}).strict();

export type AdaptiveDagActionV1 = z.infer<typeof adaptiveDagActionSchema>;

export const adaptiveDagPlanV1Schema = z.object({
  schema: z.literal('atlas.adaptive-dag-plan.v1').default('atlas.adaptive-dag-plan.v1'),
  planId: id,
  queryId: id,
  dagRevision: revision,
  plannerRevision: revision,
  classificationRevision: revision,
  actions: z.array(adaptiveDagActionSchema).min(1),
  planChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  for (const action of value.actions) {
    if (ids.has(action.actionId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: `Duplicate actionId ${action.actionId}` });
    ids.add(action.actionId);
  }
  for (const action of value.actions) {
    for (const parentId of action.parentActionIds) {
      if (!ids.has(parentId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: `Action ${action.actionId} depends on undeclared action ${parentId}` });
      if (parentId === action.actionId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: `Action ${action.actionId} cannot depend on itself` });
    }
    if (action.actionKind === 'SYNTHESIZE' && action.mutationPolicy === 'MUTATES_WITH_RECEIPT') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'SYNTHESIZE is proposal-only in the adaptive DAG contract' });
    }
  }
});

export type AdaptiveDagPlanV1 = z.infer<typeof adaptiveDagPlanV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => { out[key] = item[key]; return out; }, {})
    : item);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function buildAdaptiveDagPlanV1(input: Omit<AdaptiveDagPlanV1, 'schema' | 'planChecksum' | 'canonicalAuthority'>): AdaptiveDagPlanV1 {
  const body = {
    schema: 'atlas.adaptive-dag-plan.v1' as const,
    ...input,
    canonicalAuthority: false as const,
  };
  return adaptiveDagPlanV1Schema.parse({ ...body, planChecksum: sha256(body) });
}
