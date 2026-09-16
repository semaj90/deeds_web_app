import { z } from 'zod';
// WORKFLOW-ACTION-SCHEMA-ADOPTION-02: workflowActionFromDagNode() below constructs via this
// canonical schema first, then projects down to the local WorkflowActionEventV1Schema shape via
// fromCanonicalWorkflowActionEvent(). It previously called WorkflowActionEventV1Schema.parse()
// directly -- a second, independent construction path for the same schema identity
// ('atlas.workflow-action.v1'), which is exactly the "second uncoordinated peer owner" pattern
// root CLAUDE.md's "One Canonical Runtime Owner Per Capability" section prohibits. Verified
// before this change that workflowActionFromDagNode() has zero real (non-test) callers anywhere
// in the repo, so this was a zero-live-migration-risk conversion, not a behavior change for any
// running code.
import { workflowActionEventSchema } from '@deeds/parent-atlas/core/workflow-action-event';

/**
 * Typed adapter boundary for the existing LangGraph/MCP tool execution owner.
 * This does not replace `ai/langgraph-dag.ts`; it gives retrieval/context
 * expansion a deterministic handoff into tool scheduling.
 */
export const ContextToolDagNodeKindSchema = z.enum([
  'QUERY_CLASSIFICATION',
  'RETRIEVAL',
  'CONTEXT_FANOUT',
  'RERANK',
  'EXACT_PROMOTION',
  'MCP_TOOL_CALL',
  'VALIDATE',
  'MATERIALIZE',
]);
export type ContextToolDagNodeKind = z.infer<typeof ContextToolDagNodeKindSchema>;

export const ContextToolDagNodeV1Schema = z.object({
  nodeId: z.string().min(1),
  kind: ContextToolDagNodeKindSchema,
  dependsOn: z.array(z.string().min(1)).max(64),
  canonicalIds: z.array(z.string().min(1)).max(4096),
  toolName: z.string().min(1).nullable(),
  readOnly: z.boolean(),
  requiresExactPromotion: z.boolean(),
  requiresValidation: z.boolean(),
  maxAttempts: z.number().int().min(1).max(16),
}).strict();
export type ContextToolDagNodeV1 = z.infer<typeof ContextToolDagNodeV1Schema>;

export const ContextToolDagV1Schema = z.object({
  schema: z.literal('atlas.context-tool-dag.v1'),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  nodes: z.array(ContextToolDagNodeV1Schema).min(1).max(4096),
  canonicalWritesAllowed: z.boolean(),
  producerRevision: z.string().min(1),
}).strict();
export type ContextToolDagV1 = z.infer<typeof ContextToolDagV1Schema>;

export const WorkflowActionEventV1Schema = z.object({
  schema: z.literal('atlas.workflow-action.v1'),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  actionId: z.string().min(1),
  parentActionId: z.string().min(1).nullable(),
  dagNodeId: z.string().min(1),
  attempt: z.number().int().min(1),
  lane: z.enum([
    'planner', 'lexical', 'ast', 'semantic', 'graph', 'gpu', 'tool',
    'validator', 'materializer', 'acp', 'a2a',
  ]),
  transport: z.enum(['local', 'grpc', 'rabbitmq', 'acp', 'a2a', 'mcp']).nullable(),
  kind: z.enum([
    'scheduled', 'started', 'progress', 'artifact', 'blocked', 'retrying',
    'validated', 'failed', 'completed',
  ]),
  canonicalIds: z.array(z.string().min(1)).max(4096),
  evidenceRefs: z.array(z.string().min(1)).max(4096),
  toolName: z.string().min(1).nullable(),
  mutationRequested: z.boolean(),
  validationRequired: z.boolean(),
  producerRevision: z.string().min(1),
}).strict();
export type WorkflowActionEventV1 = z.infer<typeof WorkflowActionEventV1Schema>;

function assertDag(nodes: readonly ContextToolDagNodeV1[]): void {
  const byId = new Map(nodes.map((node) => [node.nodeId, node] as const));
  if (byId.size !== nodes.length) throw new Error('ContextToolDag contains duplicate node IDs');
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`DAG dependency is missing: ${dependency}`);
      if (dependency === node.nodeId) throw new Error(`DAG node self-dependency: ${node.nodeId}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`ContextToolDag cycle detected at ${id}`);
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of [...byId.keys()].sort()) visit(id);
}

/**
 * Tool calls that can mutate state must depend on exact promotion; every
 * mutation path must then pass through a validator before materialization.
 */
export function validateContextToolDag(raw: ContextToolDagV1): ContextToolDagV1 {
  const dag = ContextToolDagV1Schema.parse(raw);
  assertDag(dag.nodes);
  const byId = new Map(dag.nodes.map((node) => [node.nodeId, node] as const));

  const ancestors = (node: ContextToolDagNodeV1): ContextToolDagNodeV1[] => {
    const result: ContextToolDagNodeV1[] = [];
    const seen = new Set<string>();
    const stack = [...node.dependsOn];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const parent = byId.get(id);
      if (!parent) continue;
      result.push(parent);
      stack.push(...parent.dependsOn);
    }
    return result;
  };

  for (const node of dag.nodes) {
    if (node.kind !== 'MCP_TOOL_CALL') continue;
    const upstream = ancestors(node);
    if (node.requiresExactPromotion && !upstream.some((parent) => parent.kind === 'EXACT_PROMOTION')) {
      throw new Error(`MCP tool node ${node.nodeId} requires an EXACT_PROMOTION ancestor`);
    }
    if (!node.readOnly && !node.requiresValidation) {
      throw new Error(`mutating MCP tool node ${node.nodeId} must require validation`);
    }
    if (!node.readOnly && !dag.canonicalWritesAllowed) {
      throw new Error(`mutating MCP tool node ${node.nodeId} is blocked by canonicalWritesAllowed=false`);
    }
  }

  return dag;
}

export function workflowActionFromDagNode(input: {
  dag: ContextToolDagV1;
  nodeId: string;
  sequence: number;
  actionId: string;
  parentActionId?: string | null;
  attempt?: number;
  kind: WorkflowActionEventV1['kind'];
  lane: WorkflowActionEventV1['lane'];
  transport?: WorkflowActionEventV1['transport'];
  evidenceRefs?: readonly string[];
  producerRevision: string;
}): WorkflowActionEventV1 {
  const dag = validateContextToolDag(input.dag);
  const node = dag.nodes.find((candidate) => candidate.nodeId === input.nodeId);
  if (!node) throw new Error(`unknown ContextToolDag node ${input.nodeId}`);
  // Construct via the canonical schema first (single source of truth for the
  // 'atlas.workflow-action.v1' identity), then project down to this file's DAG-execution-facing
  // local shape. This function never calls WorkflowActionEventV1Schema.parse() directly.
  const canonical = workflowActionEventSchema.parse({
    schema: 'atlas.workflow-action.v1',
    workflowId: dag.workflowId,
    workflowRevision: dag.workflowRevision,
    sequence: input.sequence,
    actionId: input.actionId,
    parentActionId: input.parentActionId ?? undefined,
    dagNodeId: node.nodeId,
    attempt: input.attempt ?? 1,
    lane: input.lane,
    transport: input.transport ?? (node.kind === 'MCP_TOOL_CALL' ? 'mcp' : 'local'),
    kind: input.kind,
    canonicalIds: node.canonicalIds,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort(),
    toolName: node.toolName ?? undefined,
    mutationRequested: node.kind === 'MCP_TOOL_CALL' && !node.readOnly,
    validationRequired: node.requiresValidation,
    producerRevision: input.producerRevision,
  });
  return fromCanonicalWorkflowActionEvent(canonical);
}

// ── WORKFLOW-ACTION-SCHEMA-OWNER-01: canonical adapter ─────────────────────────
//
// This local WorkflowActionEventV1 stays the DAG-execution-facing type (canonicalIds,
// toolName, mutationRequested, validationRequired). It no longer independently claims the
// 'atlas.workflow-action.v1' schema identity as its own contract -- that identity is owned
// by `workflowActionEventSchema` in `@deeds/parent-atlas/core/workflow-action-event`. These
// two functions are the explicit adapter boundary, per design.md Decision 2. Note:
// `route-head-dag-builder-v1.ts` and `atlas-kernel-session.ts` (this file's real production
// consumers) use only `ContextToolDagV1Schema`/`ContextToolDagNodeV1Schema`, not
// `WorkflowActionEventV1Schema` -- these adapters exist for whenever a real caller of
// `workflowActionFromDagNode()`'s output needs to cross into the canonical identity.
import type { WorkflowActionEventV1 as CanonicalWorkflowActionEventV1 } from '@deeds/parent-atlas/core/workflow-action-event';

export function toCanonicalWorkflowActionEvent(local: WorkflowActionEventV1): CanonicalWorkflowActionEventV1 {
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: local.workflowId,
    workflowRevision: local.workflowRevision,
    sequence: local.sequence,
    actionId: local.actionId,
    parentActionId: local.parentActionId ?? undefined,
    dagNodeId: local.dagNodeId,
    attempt: local.attempt,
    lane: local.lane,
    transport: local.transport ?? undefined,
    kind: local.kind,
    resourceRefs: [],
    evidenceRefs: local.evidenceRefs,
    artifactRefs: [],
    metadata: {},
    producerRevision: local.producerRevision,
    inputRefs: [],
    outputRefs: [],
    canonicalIds: local.canonicalIds,
    toolName: local.toolName ?? undefined,
    mutationRequested: local.mutationRequested,
    validationRequired: local.validationRequired,
  } as CanonicalWorkflowActionEventV1;
}

export function fromCanonicalWorkflowActionEvent(canonical: CanonicalWorkflowActionEventV1): WorkflowActionEventV1 {
  if (!WorkflowActionEventV1Schema.shape.kind.options.includes(canonical.kind as never)) {
    throw new Error(
      `WORKFLOW_ACTION_EVENT_KIND_NOT_REPRESENTABLE_IN_DAG_SHAPE: '${canonical.kind}' has no equivalent in this local WorkflowActionEventV1Schema's kind enum`,
    );
  }
  if (canonical.transport && !WorkflowActionEventV1Schema.shape.transport.unwrap().options.includes(canonical.transport as never)) {
    throw new Error(
      `WORKFLOW_ACTION_EVENT_TRANSPORT_NOT_REPRESENTABLE_IN_DAG_SHAPE: '${canonical.transport}' has no equivalent in this local WorkflowActionEventV1Schema's transport enum`,
    );
  }
  return WorkflowActionEventV1Schema.parse({
    schema: 'atlas.workflow-action.v1',
    workflowId: canonical.workflowId,
    workflowRevision: canonical.workflowRevision,
    sequence: canonical.sequence,
    actionId: canonical.actionId,
    parentActionId: canonical.parentActionId ?? null,
    dagNodeId: canonical.dagNodeId,
    attempt: canonical.attempt,
    lane: canonical.lane,
    transport: canonical.transport ?? null,
    kind: canonical.kind,
    canonicalIds: canonical.canonicalIds ?? [],
    evidenceRefs: canonical.evidenceRefs,
    toolName: canonical.toolName ?? null,
    mutationRequested: canonical.mutationRequested ?? false,
    validationRequired: canonical.validationRequired ?? false,
    producerRevision: canonical.producerRevision,
  });
}
