import { createHash } from 'node:crypto';
import { z } from 'zod';

const S = z.string().min(1);
const Unit = z.number().finite().min(0).max(1);

export const ActionLifecycleStateSchema = z.enum([
  'PROPOSED','STARTED','COMPLETED','FINALIZED','INVALIDATED','RETRIED','SUPERSEDED','REJECTED',
]);
export const ActionOutcomeSchema = z.enum([
  'SUCCESS_EXACT','SUCCESS_PARTIAL','NO_RESULT','STALE_RESULT','INVALID_IDENTITY','PARSE_ERROR','TOOL_ERROR',
  'TIMEOUT','TEST_FAILED','TYPECHECK_FAILED','MUTATION_REJECTED','SUPERSEDED','POLICY_REJECTED','CACHE_HIT',
]);
export const ActionOpcodeSchema = z.enum([
  'RG_SEARCH','QDRANT_SEARCH','AST_SYMBOL','FIND_CALLERS','READ_SPAN','QUERY_DOCS','RUN_TEST','TYPECHECK',
  'GRAPH_EXPAND','RERANK','EXACT_PROMOTE','PREFETCH','SYNTHESIZE','PATCH','VERIFY',
]);

export const TemporalApplicabilityV1Schema = z.object({
  workspaceRevision: S,
  sourceRevisions: z.array(S).default([]),
  graphRevision: S.nullable().default(null),
  representationRevision: S.nullable().default(null),
  producerRevision: S,
  validFromRevision: S.nullable().default(null),
  validToRevision: S.nullable().default(null),
  observedAt: z.string().datetime(),
}).strict();

export const AgentActionEventV1Schema = z.object({
  schema: z.literal('atlas.agent-action-event.v1'),
  eventId: S,
  actionId: S,
  dagId: S.nullable().default(null),
  taskId: S.nullable().default(null),
  opcode: ActionOpcodeSchema,
  targetCanonicalId: S.nullable().default(null),
  inputHash: S,
  executionKey: S,
  lifecycleState: ActionLifecycleStateSchema,
  outcome: ActionOutcomeSchema.nullable().default(null),
  applicability: TemporalApplicabilityV1Schema,
  resultRef: S.nullable().default(null),
  evidenceRefs: z.array(S).default([]),
  latencyMs: z.number().finite().min(0).default(0),
  tokenCost: z.number().finite().min(0).default(0),
  mutationRisk: Unit.default(0),
  informationGain: Unit.default(0),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict();
export type AgentActionEventV1 = z.infer<typeof AgentActionEventV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (Array.isArray(item)) return item;
    if (item && typeof item === 'object') {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = (item as Record<string, unknown>)[key];
        return acc;
      }, {});
    }
    return item;
  });
}
function hash(prefix: string, value: unknown): string {
  return `${prefix}:${createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 32)}`;
}

export function buildActionExecutionKey(input: {
  opcode: z.infer<typeof ActionOpcodeSchema>;
  targetCanonicalId?: string | null;
  inputHash: string;
  workspaceRevision: string;
  sourceRevisions?: string[];
  graphRevision?: string | null;
  representationRevision?: string | null;
  producerRevision: string;
}): string {
  return hash('exec', {
    opcode: input.opcode,
    targetCanonicalId: input.targetCanonicalId ?? null,
    inputHash: input.inputHash,
    workspaceRevision: input.workspaceRevision,
    sourceRevisions: [...new Set(input.sourceRevisions ?? [])].sort(),
    graphRevision: input.graphRevision ?? null,
    representationRevision: input.representationRevision ?? null,
    producerRevision: input.producerRevision,
  });
}

export function buildAgentActionEvent(input: Omit<AgentActionEventV1, 'schema' | 'eventId' | 'executionKey'> & { executionKey?: string }): AgentActionEventV1 {
  const executionKey = input.executionKey ?? buildActionExecutionKey({
    opcode: input.opcode,
    targetCanonicalId: input.targetCanonicalId,
    inputHash: input.inputHash,
    workspaceRevision: input.applicability.workspaceRevision,
    sourceRevisions: input.applicability.sourceRevisions,
    graphRevision: input.applicability.graphRevision,
    representationRevision: input.applicability.representationRevision,
    producerRevision: input.applicability.producerRevision,
  });
  const canonical = { ...input, executionKey };
  return AgentActionEventV1Schema.parse({
    ...canonical,
    schema: 'atlas.agent-action-event.v1',
    eventId: hash('aevt', canonical),
  });
}
