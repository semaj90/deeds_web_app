import { describe, expect, it } from 'vitest';
import {
  buildContextToolDagFromPreAgentStages,
  executeContextToolDagV1,
  fromCanonicalWorkflowActionEvent,
  toCanonicalWorkflowActionEvent,
  validateContextToolDag,
  workflowActionFromDagNode,
} from './context-tool-dag-contracts.js';
import type { ContextToolDagV1 } from './context-tool-dag-contracts.js';

function baseDag(): ContextToolDagV1 {
  return {
    schema: 'atlas.context-tool-dag.v1' as const,
    workflowId: 'wf-1',
    workflowRevision: 1,
    requestId: 'r-1',
    workspaceRevision: 'ws-1',
    graphRevision: 'g-1',
    canonicalWritesAllowed: false,
    producerRevision: 'test',
    nodes: [
      {
        nodeId: 'retrieve',
        kind: 'RETRIEVAL' as const,
        dependsOn: [],
        canonicalIds: ['S1'],
        toolName: null,
        readOnly: true,
        requiresExactPromotion: false,
        requiresValidation: false,
        maxAttempts: 1,
      },
      {
        nodeId: 'promote',
        kind: 'EXACT_PROMOTION' as const,
        dependsOn: ['retrieve'],
        canonicalIds: ['S1'],
        toolName: null,
        readOnly: true,
        requiresExactPromotion: false,
        requiresValidation: false,
        maxAttempts: 1,
      },
      {
        nodeId: 'tool',
        kind: 'MCP_TOOL_CALL' as const,
        dependsOn: ['promote'],
        canonicalIds: ['S1'],
        toolName: 'read_symbol',
        readOnly: true,
        requiresExactPromotion: true,
        requiresValidation: false,
        maxAttempts: 2,
      },
    ],
  };
}

describe('context tool DAG contracts', () => {
  it('accepts read-only MCP tool calls after exact promotion', () => {
    expect(() => validateContextToolDag(baseDag())).not.toThrow();
    const event = workflowActionFromDagNode({
      dag: baseDag(),
      nodeId: 'tool',
      sequence: 3,
      actionId: 'a-3',
      kind: 'scheduled',
      lane: 'tool',
      producerRevision: 'test',
    });
    expect(event.transport).toBe('mcp');
    expect(event.mutationRequested).toBe(false);
  });

  it('rejects MCP calls claiming exact promotion without an exact-promotion ancestor', () => {
    const dag = baseDag();
    dag.nodes[2] = { ...dag.nodes[2], dependsOn: ['retrieve'] };
    expect(() => validateContextToolDag(dag)).toThrow(/EXACT_PROMOTION/);
  });

  it('rejects unauthorized mutating tool nodes', () => {
    const dag = baseDag();
    dag.nodes[2] = {
      ...dag.nodes[2],
      readOnly: false,
      requiresValidation: true,
      toolName: 'apply_patch',
    };
    expect(() => validateContextToolDag(dag)).toThrow(/canonicalWritesAllowed=false/);
  });
});

describe('context tool DAG contracts -- canonical workflow-action adapter (WORKFLOW-ACTION-SCHEMA-OWNER-01)', () => {
  it('round-trips every field the DAG-execution layer actually reads', () => {
    const local = workflowActionFromDagNode({
      dag: baseDag(),
      nodeId: 'tool',
      sequence: 3,
      actionId: 'a-3',
      kind: 'scheduled',
      lane: 'tool',
      evidenceRefs: ['ev-1'],
      producerRevision: 'test',
    });

    const canonical = toCanonicalWorkflowActionEvent(local);
    expect(canonical.schema).toBe('atlas.workflow-action.v1');
    expect(canonical.canonicalIds).toEqual(local.canonicalIds);
    expect(canonical.toolName).toBe(local.toolName);
    expect(canonical.mutationRequested).toBe(local.mutationRequested);
    expect(canonical.validationRequired).toBe(local.validationRequired);
    expect(canonical.transport).toBe('mcp');

    const roundTripped = fromCanonicalWorkflowActionEvent(canonical);
    expect(roundTripped.workflowId).toBe(local.workflowId);
    expect(roundTripped.workflowRevision).toBe(local.workflowRevision);
    expect(roundTripped.sequence).toBe(local.sequence);
    expect(roundTripped.actionId).toBe(local.actionId);
    expect(roundTripped.dagNodeId).toBe(local.dagNodeId);
    expect(roundTripped.attempt).toBe(local.attempt);
    expect(roundTripped.lane).toBe(local.lane);
    expect(roundTripped.transport).toBe(local.transport);
    expect(roundTripped.kind).toBe(local.kind);
    expect(roundTripped.canonicalIds).toEqual(local.canonicalIds);
    expect(roundTripped.evidenceRefs).toEqual(local.evidenceRefs);
    expect(roundTripped.toolName).toBe(local.toolName);
    expect(roundTripped.mutationRequested).toBe(local.mutationRequested);
    expect(roundTripped.validationRequired).toBe(local.validationRequired);
    expect(roundTripped.producerRevision).toBe(local.producerRevision);
  });

  it('throws rather than silently drop a canonical-only kind this local shape cannot represent', () => {
    const local = workflowActionFromDagNode({
      dag: baseDag(), nodeId: 'retrieve', sequence: 1, actionId: 'a-1',
      kind: 'scheduled', lane: 'tool', producerRevision: 'test',
    });
    const canonical = { ...toCanonicalWorkflowActionEvent(local), kind: 'suspended' as const };
    // 'suspended' is deliberately outside the local DAG shape's kind union (that is what this test proves), so cast.
    expect(() => fromCanonicalWorkflowActionEvent(canonical as unknown as Parameters<typeof fromCanonicalWorkflowActionEvent>[0])).toThrow(
      /WORKFLOW_ACTION_EVENT_KIND_NOT_REPRESENTABLE_IN_DAG_SHAPE/,
    );
  });
});

describe('buildContextToolDagFromPreAgentStages + executeContextToolDagV1 (CONTEXT-DAG-01)', () => {
  const meta = { workflowId: 'wf', requestId: 'rq', workspaceRevision: 'w1', graphRevision: 'g1', producerRevision: 'p1' };
  const dag = () => buildContextToolDagFromPreAgentStages({
    ...meta, stages: ['QUERY_ANALYSIS', 'CACHE_LOOKUP', 'LEXICAL', 'SEMANTIC_ROUTE', 'AST', 'ACE_PACKET_ASSEMBLY', 'AGENT_HANDOFF'],
  });
  const ok = (v: unknown) => async () => v;

  it('maps stages to a valid read-only DAG with parallel lookups joined by exact promotion', () => {
    const d = dag();
    const byId = new Map(d.nodes.map((n) => [n.nodeId, n]));
    expect(d.canonicalWritesAllowed).toBe(false);
    expect(d.nodes.every((n) => n.readOnly)).toBe(true);
    expect(byId.get('LEXICAL')?.dependsOn).toEqual(['QUERY_ANALYSIS', 'CACHE_LOOKUP']);
    expect(byId.get('AST')?.dependsOn).toEqual(['QUERY_ANALYSIS', 'CACHE_LOOKUP']);
    expect(byId.get('EXACT_PROMOTION')?.dependsOn).toEqual(['LEXICAL', 'SEMANTIC_ROUTE', 'AST']);
    expect(byId.get('ACE_PACKET_ASSEMBLY')?.dependsOn).toEqual(['EXACT_PROMOTION']);
    expect(byId.has('AGENT_HANDOFF')).toBe(false);
  });

  it('graph expansion is a fanout node and unknown stages are rejected', () => {
    const d = buildContextToolDagFromPreAgentStages({ ...meta, stages: ['QUERY_ANALYSIS', 'GRAPH_EXPANSION', 'ACE_PACKET_ASSEMBLY'] });
    expect(d.nodes.find((n) => n.nodeId === 'GRAPH_EXPANSION')?.kind).toBe('CONTEXT_FANOUT');
    expect(() => buildContextToolDagFromPreAgentStages({ ...meta, stages: ['QUERY_ANALYSIS', 'BOGUS'] })).toThrow(/unknown pre-agent stage/);
  });

  it('wires ast-grep refinement after lexical candidates and rejects missing lexical input', async () => {
    const stages = ['QUERY_ANALYSIS', 'LEXICAL', 'AST_STRUCTURAL_REFINE', 'ACE_PACKET_ASSEMBLY'];
    const d = buildContextToolDagFromPreAgentStages({ ...meta, stages });
    const byId = new Map(d.nodes.map((n) => [n.nodeId, n]));
    expect(byId.get('AST_STRUCTURAL_REFINE')?.kind).toBe('STRUCTURAL_REFINE');
    expect(byId.get('AST_STRUCTURAL_REFINE')?.dependsOn).toEqual(['LEXICAL']);
    expect(byId.get('EXACT_PROMOTION')?.dependsOn).toEqual(['LEXICAL', 'AST_STRUCTURAL_REFINE']);
    expect(() => buildContextToolDagFromPreAgentStages({
      ...meta,
      stages: ['QUERY_ANALYSIS', 'AST_STRUCTURAL_REFINE'],
    })).toThrow('AST_STRUCTURAL_REFINE requires the LEXICAL stage');

    let lexicalInput: unknown;
    const lexical = { candidateFiles: ['src/example.ts'], canonicalAuthority: false };
    const receipt = await executeContextToolDagV1(d, {
      QUERY_ANALYSIS: async () => 'query',
      LEXICAL: async () => lexical,
      AST_STRUCTURAL_REFINE: async ({ inputs }) => {
        lexicalInput = inputs.LEXICAL;
        return { declarations: [], canonicalAuthority: false };
      },
      EXACT_PROMOTION: async ({ inputs }) => Object.keys(inputs),
      ACE_PACKET_ASSEMBLY: async () => 'packet',
    });
    expect(lexicalInput).toBe(lexical);
    expect(receipt.outputs.EXACT_PROMOTION).toEqual(['LEXICAL', 'AST_STRUCTURAL_REFINE']);
    expect(receipt.writesPerformed).toBe(false);
  });

  it('executor runs independent lookups concurrently and passes dependency outputs', async () => {
    let active = 0; let peak = 0;
    const slow = (v: string) => async () => { active += 1; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 30)); active -= 1; return v; };
    const receipt = await executeContextToolDagV1(dag(), {
      QUERY_ANALYSIS: ok('qa'), CACHE_LOOKUP: ok('miss'), LEXICAL: slow('lex'), SEMANTIC_ROUTE: slow('sem'), AST: ok('ast'),
      EXACT_PROMOTION: async ({ inputs }) => Object.values(inputs).join('+'),
      ACE_PACKET_ASSEMBLY: async ({ inputs }) => `packet(${String(inputs.EXACT_PROMOTION)})`,
    });
    expect(receipt.ok).toBe(true);
    expect(peak).toBe(2);
    expect(receipt.levels[2]).toEqual(['AST', 'LEXICAL', 'SEMANTIC_ROUTE']);
    expect(receipt.outputs.ACE_PACKET_ASSEMBLY).toBe('packet(lex+sem+ast)');
    expect(receipt.writesPerformed).toBe(false);
  });

  it('a failed lookup degrades the join onto the surviving lookups', async () => {
    const receipt = await executeContextToolDagV1(dag(), {
      QUERY_ANALYSIS: ok('qa'), CACHE_LOOKUP: ok('miss'), LEXICAL: async () => { throw new Error('boom'); }, SEMANTIC_ROUTE: ok('sem'), AST: ok('ast'),
      EXACT_PROMOTION: ok('x'), ACE_PACKET_ASSEMBLY: ok('p'),
    });
    const st = Object.fromEntries(receipt.nodes.map((n) => [n.nodeId, n.status]));
    expect(st.LEXICAL).toBe('FAILED');
    expect(st.SEMANTIC_ROUTE).toBe('OK');
    expect(st.AST).toBe('OK');
    expect(st.EXACT_PROMOTION).toBe('OK');
    expect(st.ACE_PACKET_ASSEMBLY).toBe('OK');
    expect(receipt.nodes.find((n) => n.nodeId === 'EXACT_PROMOTION')?.degradedDependencies).toEqual(['LEXICAL']);
    expect(receipt.ok).toBe(false);
    expect(receipt.degraded).toBe(true);
  });

  it('times out slow nodes, reports missing handlers, and refuses non-read-only DAGs', async () => {
    const slowDag = await executeContextToolDagV1(dag(), { QUERY_ANALYSIS: () => new Promise(() => {}) }, { nodeTimeoutMs: 20 });
    expect(slowDag.nodes.find((n) => n.nodeId === 'QUERY_ANALYSIS')?.status).toBe('FAILED');
    const none = await executeContextToolDagV1(dag(), {});
    expect(none.nodes.find((n) => n.nodeId === 'QUERY_ANALYSIS')?.status).toBe('NO_HANDLER');
    await expect(executeContextToolDagV1({ ...dag(), canonicalWritesAllowed: true }, {})).rejects.toThrow(/read-only/);
  });
});

describe('executeContextToolDagV1 degradation (lexical-only / ast-less)', () => {
  const meta = { workflowId: 'wf', requestId: 'rq', workspaceRevision: 'w1', graphRevision: 'g1', producerRevision: 'p1' };
  const dag = () => buildContextToolDagFromPreAgentStages({ ...meta, stages: ['QUERY_ANALYSIS', 'LEXICAL', 'AST', 'ACE_PACKET_ASSEMBLY'] });

  it('AST failing still yields a lexical-only packet', async () => {
    const r = await executeContextToolDagV1(dag(), {
      QUERY_ANALYSIS: async () => 'qa', LEXICAL: async () => 'lex', AST: async () => { throw new Error('napi missing'); },
      EXACT_PROMOTION: async ({ inputs }) => Object.keys(inputs), ACE_PACKET_ASSEMBLY: async () => 'packet',
    });
    expect(r.degraded).toBe(true);
    expect(r.outputs.EXACT_PROMOTION).toEqual(['LEXICAL']);
    expect(r.nodes.find((n) => n.nodeId === 'EXACT_PROMOTION')?.degradedDependencies).toEqual(['AST']);
  });

  it('LEXICAL failing still yields an AST-only packet (vice versa)', async () => {
    const r = await executeContextToolDagV1(dag(), {
      QUERY_ANALYSIS: async () => 'qa', LEXICAL: async () => { throw new Error('db down'); }, AST: async () => 'ast',
      EXACT_PROMOTION: async ({ inputs }) => Object.keys(inputs), ACE_PACKET_ASSEMBLY: async () => 'packet',
    });
    expect(r.degraded).toBe(true);
    expect(r.outputs.EXACT_PROMOTION).toEqual(['AST']);
  });

  it('with no surviving lookup the join and packet are BLOCKED and the result is not degraded', async () => {
    const boom = async () => { throw new Error('down'); };
    const r = await executeContextToolDagV1(dag(), {
      QUERY_ANALYSIS: async () => 'qa', LEXICAL: boom, AST: boom, EXACT_PROMOTION: async () => 'x', ACE_PACKET_ASSEMBLY: async () => 'packet',
    });
    const st = Object.fromEntries(r.nodes.map((n) => [n.nodeId, n.status]));
    expect([st.LEXICAL, st.AST, st.EXACT_PROMOTION, st.ACE_PACKET_ASSEMBLY]).toEqual(['FAILED', 'FAILED', 'BLOCKED', 'BLOCKED']);
    expect(r.ok).toBe(false);
    expect(r.degraded).toBe(false);
  });
});

describe('executeContextToolDagV1 review fixes (soft cache dependency, sync handlers, clearer blocked reason)', () => {
  const meta = { workflowId: 'wf', requestId: 'rq', workspaceRevision: 'w1', graphRevision: 'g1', producerRevision: 'p1' };
  const dag = () => buildContextToolDagFromPreAgentStages({
    ...meta, stages: ['QUERY_ANALYSIS', 'CACHE_LOOKUP', 'LEXICAL', 'AST', 'ACE_PACKET_ASSEMBLY'],
  });

  it('a failing or timed-out CACHE_LOOKUP does not block the lookups; the receipt is degraded and records it', async () => {
    const r = await executeContextToolDagV1(dag(), {
      QUERY_ANALYSIS: async () => 'qa',
      CACHE_LOOKUP: async () => { throw new Error('valkey down'); },
      LEXICAL: async () => 'lex', AST: async () => 'ast',
      EXACT_PROMOTION: async ({ inputs }) => Object.keys(inputs), ACE_PACKET_ASSEMBLY: async () => 'packet',
    });
    const st = Object.fromEntries(r.nodes.map((n) => [n.nodeId, n.status]));
    expect([st.CACHE_LOOKUP, st.LEXICAL, st.AST, st.EXACT_PROMOTION, st.ACE_PACKET_ASSEMBLY]).toEqual(['FAILED', 'OK', 'OK', 'OK', 'OK']);
    expect(r.nodes.find((n) => n.nodeId === 'LEXICAL')?.degradedDependencies).toEqual(['CACHE_LOOKUP']);
    expect(r.outputs.EXACT_PROMOTION).toEqual(['LEXICAL', 'AST']);
    expect(r.ok).toBe(false);
    expect(r.degraded).toBe(true);
  });

  it('a handler that returns a plain value (not a Promise) is a success', async () => {
    const r = await executeContextToolDagV1(dag(), {
      QUERY_ANALYSIS: (() => 'qa') as never, CACHE_LOOKUP: (() => null) as never, LEXICAL: (() => 'lex') as never, AST: (() => 'ast') as never,
      EXACT_PROMOTION: (() => 'x') as never, ACE_PACKET_ASSEMBLY: (() => 'p') as never,
    });
    expect(r.ok).toBe(true);
    expect(r.outputs.QUERY_ANALYSIS).toBe('qa');
  });

  it('a missing QUERY_ANALYSIS handler blocks dependents with a reason that names its status', async () => {
    const r = await executeContextToolDagV1(dag(), { LEXICAL: async () => 'lex' });
    const lex = r.nodes.find((n) => n.nodeId === 'LEXICAL');
    expect(lex?.status).toBe('BLOCKED');
    expect(lex?.error).toBe('dependency QUERY_ANALYSIS NO_HANDLER');
  });
});
