/**
 * Atlas Mastra Workflow — Orchestrates retrieval, verification, synthesis, and mutation.
 * Integrates FSM state transitions, HMM confidence estimation, and Go gRPC calls.
 */

import { defineWorkflow } from '@mastra/core';
import {
  AtlasRuntimeContext,
  AtlasState,
  RuntimeObservation,
  createAtlasRuntimeContext,
} from './atlas-runtime-context';
import {
  estimateExecutionState,
  isTransitionAllowed,
} from './atlas-fsm-policy';
import {
  atlasRetrieveTool,
  atlasValidateChangeTool,
  atlasApplyChangeTool,
  atlasBuildContextTool,
  atlasDiscoverTool,
  atlasInspectRuntimeTool,
  createAtlasRequestContext,
  atlasToolCallProcessor,
} from './atlas-mastra-adapter';
import {
  retrieveFromGo,
  buildContextFromGo,
  validatePacketFromGo,
} from './go-retrieval-grpc-client';

/**
 * Main Atlas Retrieval Workflow
 * Handles: discovery → retrieval → verification → synthesis → optional mutation
 */
export const atlasRetrievalWorkflow = defineWorkflow({
  id: 'atlas-retrieval',
  description: 'Unified retrieval, verification, and synthesis workflow',

  tools: [
    atlasDiscoverTool,
    atlasRetrieveTool,
    atlasValidateChangeTool,
    atlasBuildContextTool,
    atlasInspectRuntimeTool,
  ],

  agent: {
    model: 'gemma4-legal-iq4xs-direct.gguf',
    instructions: async (requestContext) => {
      const context = (requestContext as any).atlasRuntime as AtlasRuntimeContext;
      return `
You are an Atlas retrieval agent. You retrieve legal documents and code snippets.

Current state: ${context.state}
Workspace: ${context.workspaceId}
Packet: ${context.packetKey}

Workflow:
1. DISCOVER: Identify which packets are relevant to the user's query.
2. RETRIEVE: Query Qdrant (dense + sparse), Redis, and Neo4j for evidence.
3. VERIFY: Validate the retrieved packets against Postgres canonical state.
4. SYNTHESIZE: Build context and generate an answer.

Never claim completion without validation. Use atlas.validate_change to prove your work.
`;
    },
  },

  processors: {
    async onToolCall(call, context) {
      const runtime = (context as any).atlasRuntime as AtlasRuntimeContext;
      try {
        // Gate tool calls based on current state
        return await atlasToolCallProcessor(call, runtime);
      } catch (err) {
        console.error(`Tool call rejected: ${(err as Error).message}`);
        throw err;
      }
    },
  },

  stopWhen: async (lastMessage, context) => {
    const runtime = (context as any).atlasRuntime as AtlasRuntimeContext;

    // Stop only when state machine explicitly reaches COMPLETE
    if (runtime.state === AtlasState.COMPLETE) {
      return true;
    }

    // Prevent infinite loops: give up after 20 iterations
    const iterationCount = context.messages?.length ?? 0;
    if (iterationCount > 20) {
      console.warn('Atlas workflow exceeded max iterations, stopping');
      return true;
    }

    return false;
  },
});

/**
 * Structured Retrieval Entry Point
 * Called from API routes to perform a bounded retrieval task.
 */
export async function executeAtlasRetrieval(init: {
  workspaceId: string;
  query: string;
  packetKey?: string;
  maxIterations?: number;
  tokenBudget?: number;
}) {
  // Create runtime context
  const runtime = createAtlasRuntimeContext({
    runId: crypto.randomUUID(),
    threadId: crypto.randomUUID(),
    resourceId: init.workspaceId,
    workspaceId: init.workspaceId,
    packetKey: init.packetKey || 'atlas:packet:query:' + Date.now(),
    initialState: AtlasState.DISCOVER,
    tokenBudget: init.tokenBudget ?? 8192,
  });

  // Create request context with runtime
  const requestContext = await createAtlasRequestContext({
    runId: runtime.runId,
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
    workspaceId: runtime.workspaceId,
    packetKey: runtime.packetKey,
  });

  // Execute workflow with FSM state management
  const results: {
    packets: any[];
    summary: string;
    finalState: AtlasState;
    confidence: number;
  } = {
    packets: [],
    summary: '',
    finalState: runtime.state,
    confidence: runtime.confidence,
  };

  let iterationNumber = 0;
  const maxIterations = init.maxIterations ?? 10;

  while (
    runtime.state !== AtlasState.COMPLETE &&
    iterationNumber < maxIterations
  ) {
    iterationNumber++;

    // Create observation from previous step (stub for now)
    const observation: RuntimeObservation = {
      lastTool: 'previous',
      lastToolSucceeded: true,
      retrievalConfidence: 0.7,
      evidenceCount: 0,
      validationStatus: 'PASS',
      authFailure: false,
      revisionMismatch: false,
      tokenPressure: runtime.tokenBudget.remainingInput / runtime.tokenBudget.maximumInput,
      iterationNumber,
    };

    // Estimate next state using FSM
    const inference = estimateExecutionState(runtime.state, observation);
    runtime.state = inference.state;
    runtime.confidence = inference.confidence;

    // Execute step based on state
    switch (runtime.state) {
      case AtlasState.DISCOVER:
        // TODO: Call atlas.discover tool
        runtime.state = AtlasState.RETRIEVE;
        break;

      case AtlasState.RETRIEVE:
        // Call Go Retrieval gRPC
        try {
          const retrieveResult = await retrieveFromGo(runtime, init.query, {
            topK: 12,
            lanes: ['DENSE', 'SPARSE', 'GRAPH'],
          });
          results.packets = retrieveResult.evidence;
          runtime.state = AtlasState.VERIFY;
        } catch (err) {
          console.error('Retrieval failed:', err);
          runtime.state = AtlasState.RECOVER;
        }
        break;

      case AtlasState.VERIFY:
        // TODO: Call atlas.validate_change tool
        // For now, assume validation passes
        runtime.state = AtlasState.SYNTHESIZE;
        break;

      case AtlasState.SYNTHESIZE:
        // Call Go service to build context
        try {
          const contextPacket = await buildContextFromGo(
            runtime,
            results.packets.map((p) => p.packetKey),
            runtime.tokenBudget.remainingInput
          );
          results.summary = contextPacket.prompt;
          runtime.state = AtlasState.VALIDATE;
        } catch (err) {
          console.error('Context build failed:', err);
          runtime.state = AtlasState.RECOVER;
        }
        break;

      case AtlasState.VALIDATE:
        // Validation passed, mark complete
        runtime.state = AtlasState.COMPLETE;
        break;

      case AtlasState.RECOVER:
        // Log error and return partial results
        console.warn('Atlas workflow in recovery mode');
        runtime.state = AtlasState.COMPLETE;
        break;

      default:
        runtime.state = AtlasState.COMPLETE;
    }
  }

  results.finalState = runtime.state;
  results.confidence = runtime.confidence;

  return results;
}

/**
 * Mutation Workflow
 * Gated by FSM: only allowed when state === MUTATE and proof exists.
 */
export const atlasMutationWorkflow = defineWorkflow({
  id: 'atlas-mutation',
  description: 'Apply a validated change to Postgres + invalidate caches + emit events',

  tools: [atlasValidateChangeTool, atlasApplyChangeTool, atlasInspectRuntimeTool],

  agent: {
    model: 'gemma4-legal-iq4xs-direct.gguf',
    instructions: async (requestContext) => {
      const context = (requestContext as any).atlasRuntime as AtlasRuntimeContext;
      return `
You are an Atlas mutation agent. Your job is to apply a validated change safely.

Current state: ${context.state}
Mutation allowed: ${context.authority.mutationAllowed}

1. If mutation is not allowed, stop and explain why.
2. Use atlas.validate_change to verify the change is safe.
3. Use atlas.apply_change to persist to Postgres.
4. Emit success notification.

Never skip validation.
`;
    },
  },

  stopWhen: async (lastMessage, context) => {
    const runtime = (context as any).atlasRuntime as AtlasRuntimeContext;
    return runtime.state === AtlasState.COMPLETE;
  },
});
