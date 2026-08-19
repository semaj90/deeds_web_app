import { z } from 'zod';

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
 * Exact-promotion and validation requirements are graph properties, not flags
 * that a caller can satisfy by assertion alone. Any node declaring either
 * requirement must have the corresponding ancestor. Mutating MCP calls also
 * require canonical write authorization at the DAG envelope.
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
    const upstream = ancestors(node);
    if (node.requiresExactPromotion
      && node.kind !== 'EXACT_PROMOTION'
      && !upstream.some((parent) => parent.kind === 'EXACT_PROMOTION')) {
      throw new Error(`${node.kind} node ${node.nodeId} requires an EXACT_PROMOTION ancestor`);
    }
    if (node.requiresValidation
      && node.kind !== 'VALIDATE'
      && !upstream.some((parent) => parent.kind === 'VALIDATE')) {
      throw new Error(`${node.kind} node ${node.nodeId} requires a VALIDATE ancestor`);
    }

    if (node.kind !== 'MCP_TOOL_CALL') continue;
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
  return WorkflowActionEventV1Schema.parse({
    schema: 'atlas.workflow-action.v1',
    workflowId: dag.workflowId,
    workflowRevision: dag.workflowRevision,
    sequence: input.sequence,
    actionId: input.actionId,
    parentActionId: input.parentActionId ?? null,
    dagNodeId: node.nodeId,
    attempt: input.attempt ?? 1,
    lane: input.lane,
    transport: input.transport ?? (node.kind === 'MCP_TOOL_CALL' ? 'mcp' : 'local'),
    kind: input.kind,
    canonicalIds: node.canonicalIds,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].sort(),
    toolName: node.toolName,
    mutationRequested: node.kind === 'MCP_TOOL_CALL' && !node.readOnly,
    validationRequired: node.requiresValidation,
    producerRevision: input.producerRevision,
  });
}
