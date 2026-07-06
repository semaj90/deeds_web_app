/**
 * Dispatcher LangGraph State Machine
 * Wires 9 nodes with conditional edge routing
 */

import { Annotation, StateGraph, END, START } from '@langchain/langgraph';
import type { DispatcherState } from './dispatcher-nodes/types.js';
import {
  nodeEscalateQuarantine,
  nodeRecoverIdentity,
  nodeValidateEnvelope,
  nodeSyncQdrantMirror,
  nodeSyncNeo4jMirror,
  nodeExpandTopology,
  nodeRerankCandidates,
  nodeSynthesizeAnswer,
  nodeEscalateOperator,
} from './dispatcher-nodes/index.js';
import { routeByDispatch, DISPATCHER_NODES } from './dispatcher-routes.js';
import type { NodeContext } from './dispatcher-nodes/types.js';
import { withDispatcherTelemetry } from '../telemetry/dispatcher-telemetry-wrapper.js';
import Redis from 'ioredis';
import { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Define state schema for LangGraph
 */
const DispatcherStateAnnotation = Annotation.Root({
  query: Annotation<string>,
  candidates: Annotation<any[]>,
  identity_lane: Annotation<string>,
  parity_status: Annotation<string>,
  dispatch_decision: Annotation<string>,
  dispatch_node: Annotation<string | undefined>,
  dispatch_tool: Annotation<string | undefined>,
  dispatch_confidence: Annotation<number>,
  synthesis_path: Annotation<string[]>,
  tool_calls: Annotation<any[]>,
  errors: Annotation<string[]>,
  latency_ms: Annotation<number>,
  start_time: Annotation<number | undefined>,
  action: Annotation<string>,
  reason: Annotation<string | undefined>,
  result: Annotation<any>,
});

export function createDispatcherGraph(ctx: NodeContext) {
  const graph = new StateGraph(DispatcherStateAnnotation);

  // Add start node that initializes state
  graph.addNode('start', async (state: DispatcherState) => {
    const startTime = Date.now();
    console.log('[dispatcher_graph] START | decision=${state.dispatch_decision}');
    return {
      ...state,
      synthesis_path: ['start'],
      start_time: startTime,
      latency_ms: 0,
    };
  });

  // Add all 9 dispatcher nodes (wrapped with telemetry)
  graph.addNode(
    DISPATCHER_NODES.node_escalate_quarantine,
    withDispatcherTelemetry(
      'node_escalate_quarantine',
      async (state: DispatcherState) => nodeEscalateQuarantine(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  graph.addNode(
    DISPATCHER_NODES.node_recover_identity,
    withDispatcherTelemetry(
      'node_recover_identity',
      async (state: DispatcherState) => nodeRecoverIdentity(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  graph.addNode(
    DISPATCHER_NODES.node_validate_envelope,
    withDispatcherTelemetry(
      'node_validate_envelope',
      async (state: DispatcherState) => nodeValidateEnvelope(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  graph.addNode(
    DISPATCHER_NODES.node_sync_qdrant_mirror,
    withDispatcherTelemetry(
      'node_sync_qdrant_mirror',
      async (state: DispatcherState) => nodeSyncQdrantMirror(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  graph.addNode(
    DISPATCHER_NODES.node_sync_neo4j_mirror,
    withDispatcherTelemetry(
      'node_sync_neo4j_mirror',
      async (state: DispatcherState) => nodeSyncNeo4jMirror(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  graph.addNode(
    DISPATCHER_NODES.node_expand_topology,
    withDispatcherTelemetry(
      'node_expand_topology',
      async (state: DispatcherState) => nodeExpandTopology(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  graph.addNode(
    DISPATCHER_NODES.node_rerank_candidates,
    withDispatcherTelemetry(
      'node_rerank_candidates',
      async (state: DispatcherState) => nodeRerankCandidates(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  graph.addNode(
    DISPATCHER_NODES.node_synthesize_answer,
    withDispatcherTelemetry(
      'node_synthesize_answer',
      async (state: DispatcherState) => nodeSynthesizeAnswer(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  graph.addNode(
    DISPATCHER_NODES.node_escalate_operator,
    withDispatcherTelemetry(
      'node_escalate_operator',
      async (state: DispatcherState) => nodeEscalateOperator(state, ctx),
      ctx.redis,
      ctx.postgres
    )
  );

  // Add end node
  graph.addNode('end', async (state: DispatcherState) => {
    const finalLatency = state.start_time ? Date.now() - state.start_time : 0;
    console.log(
      `[dispatcher_graph] END | action=${state.action} | latency=${finalLatency}ms | path_len=${state.synthesis_path.length}`
    );
    return { ...state, latency_ms: finalLatency };
  });

  // Wire start to routing conditional
  graph.addEdge(START, 'start');
  graph.addConditionalEdges('start', routeByDispatch, DISPATCHER_NODES);

  // Wire all nodes to end (each node handles its own routing)
  for (const nodeId of Object.values(DISPATCHER_NODES)) {
    graph.addEdge(nodeId, 'end');
  }

  graph.addEdge('end', END);

  return graph.compile();
}

export type DispatcherGraph = ReturnType<typeof createDispatcherGraph>;
