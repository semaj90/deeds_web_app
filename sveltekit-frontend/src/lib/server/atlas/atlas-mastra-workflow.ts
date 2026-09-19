/**
 * Atlas Mastra Workflow — Orchestrates retrieval, verification, synthesis, and mutation.
 * Integrates FSM state transitions, HMM confidence estimation, and Go gRPC calls.
 */

// @mastra/core is NOT installed in this repo (see the matching shim + comment
// in ./atlas-mastra-adapter.ts for the full explanation and live-reproduced
// error). Passthrough shim preserving defineWorkflow's config-object shape —
// not the real Mastra workflow runtime. Delete this and restore the real
// import if/when @mastra/core is actually installed.
function defineWorkflow<T>(config: T): T {
  return config;
}
import {
  AtlasRuntimeContext,
  AtlasState,
  RuntimeObservation,
  RuntimeToolReceiptV1,
  createAtlasRuntimeContext,
  extractRuntimeToolReceiptV1,
  observationFromRuntimeToolReceiptV1,
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
import { LLM_MODEL_ID } from '../llm/runtime-contract.js';

export type AtlasPacketValidationResultV1 = { valid: boolean };

/** Require an explicitly returned backend receipt before treating a result as evidence. */
export function requireRuntimeToolReceiptForResultV1(result: unknown): RuntimeToolReceiptV1 {
  return extractRuntimeToolReceiptV1(result);
}

export type AtlasWorkflowBlockedReasonV1 =
  | 'DISCOVERY_ADAPTER_UNAVAILABLE'
  | 'VALIDATION_RECEIPT_REQUIRED';

export function blockAtlasWorkflowV1(reason: AtlasWorkflowBlockedReasonV1): {
  state: AtlasState.RECOVER;
  reason: AtlasWorkflowBlockedReasonV1;
} {
  return { state: AtlasState.RECOVER, reason };
}

/**
 * Pure verification boundary used by the workflow and its fixture tests.
 * Missing identity or a non-valid response is never promoted to synthesis.
 */
export async function verifyRetrievedPacketsV1(
  packets: readonly unknown[],
  validate: (packetKey: string) => Promise<AtlasPacketValidationResultV1>,
): Promise<{ valid: true; packetCount: number } | { valid: false; reason: string }> {
  if (packets.length === 0) return { valid: false, reason: 'NO_RETRIEVED_PACKETS_TO_VERIFY' };
  try {
    const results = await Promise.all(packets.map((packet) => {
      const packetKey = typeof (packet as { packetKey?: unknown })?.packetKey === 'string'
        ? (packet as { packetKey: string }).packetKey
        : '';
      if (!packetKey) throw new Error('RETRIEVED_PACKET_KEY_REQUIRED');
      return validate(packetKey);
    }));
    if (results.some((result) => result.valid !== true)) {
      return { valid: false, reason: 'PACKET_CANONICAL_VALIDATION_FAILED' };
    }
    return { valid: true, packetCount: results.length };
  } catch (error) {
    return { valid: false, reason: error instanceof Error ? error.message : 'PACKET_VALIDATOR_UNAVAILABLE' };
  }
}

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
    model: LLM_MODEL_ID,
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
  packetKey: string;
  workspaceRevision: string;
  packetRevision: string;
  /** Caller-owned receipt from the preceding tool invocation, if any. */
  priorToolReceipt?: RuntimeToolReceiptV1 | null;
  maxIterations?: number;
  tokenBudget?: number;
}) {
  if (!init.packetKey.trim()) throw new Error('CANONICAL_PACKET_KEY_REQUIRED');
  if (!init.workspaceRevision.trim()) throw new Error('ADMITTED_WORKSPACE_REVISION_REQUIRED');
  if (!init.packetRevision.trim()) throw new Error('PACKET_REVISION_REQUIRED');

  // Create runtime context
  const runtime = createAtlasRuntimeContext({
    runId: crypto.randomUUID(),
    threadId: crypto.randomUUID(),
    resourceId: init.workspaceId,
    workspaceId: init.workspaceId,
    packetKey: init.packetKey,
    workspaceRevision: init.workspaceRevision,
    packetRevision: init.packetRevision,
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
    workspaceRevision: runtime.workspaceRevision,
    packetRevision: runtime.packetRevision,
  });

  // Execute workflow with FSM state management
  const results: {
    packets: any[];
    summary: string;
    finalState: AtlasState;
    confidence: number;
    blockedReason?: AtlasWorkflowBlockedReasonV1;
  } = {
    packets: [],
    summary: '',
    finalState: runtime.state,
    confidence: runtime.confidence,
  };

  let iterationNumber = 0;
  let priorToolReceipt = init.priorToolReceipt ?? null;
  const maxIterations = init.maxIterations ?? 10;

  while (
    runtime.state !== AtlasState.COMPLETE &&
    iterationNumber < maxIterations
  ) {
    iterationNumber++;

    // A caller-owned receipt is the only admissible prior-tool evidence.
    // Until a live tool result is converted and threaded here, the adapter
    // deliberately returns an explicit fail-closed observation.
    const observation: RuntimeObservation = observationFromRuntimeToolReceiptV1(
      priorToolReceipt,
      iterationNumber,
      runtime.tokenBudget.remainingInput / runtime.tokenBudget.maximumInput,
      runtime,
    );

    // Estimate next state using FSM
    const inference = estimateExecutionState(runtime.state, observation, runtime);
    runtime.state = inference.state;
    runtime.confidence = inference.confidence;

    // Execute step based on state
    switch (runtime.state) {
      case AtlasState.DISCOVER:
        // TODO PA STAGE 13: replace with the canonical identity discovery
        // owner. Empty discovery is not permission to retrieve or synthesize.
        {
          const blocked = blockAtlasWorkflowV1('DISCOVERY_ADAPTER_UNAVAILABLE');
          runtime.state = blocked.state;
          results.finalState = blocked.state;
          results.blockedReason = blocked.reason;
          return results;
        }

      case AtlasState.RETRIEVE:
        // Call Go Retrieval gRPC
        try {
          const retrieveResult = await retrieveFromGo(runtime, init.query, {
            topK: 12,
            lanes: ['DENSE', 'SPARSE', 'GRAPH'],
          });
          priorToolReceipt = requireRuntimeToolReceiptForResultV1(retrieveResult);
          results.packets = retrieveResult.evidence;
          runtime.state = AtlasState.VERIFY;
        } catch (err) {
          console.error('Retrieval failed:', err);
          runtime.state = AtlasState.RECOVER;
        }
        break;

      case AtlasState.VERIFY:
        // Verification must be backed by the canonical packet validator. An
        // empty result or an unavailable validator is not proof and must not
        // advance the workflow into synthesis.
        try {
          const verification = await verifyRetrievedPacketsV1(
            results.packets,
            async (packetKey) => {
              const validation = await validatePacketFromGo(runtime, packetKey, {});
              priorToolReceipt = requireRuntimeToolReceiptForResultV1(validation);
              return { valid: validation.valid };
            },
          );
          if (!verification.valid) throw new Error(verification.reason);
          runtime.state = AtlasState.SYNTHESIZE;
        } catch (err) {
          console.warn('Atlas packet verification blocked:', err);
          runtime.state = AtlasState.RECOVER;
        }
        break;

      case AtlasState.SYNTHESIZE:
        // Call Go service to build context
        try {
          const contextPacket = await buildContextFromGo(
            runtime,
            results.packets.map((p) => p.packetKey),
            runtime.tokenBudget.remainingInput
          );
          priorToolReceipt = requireRuntimeToolReceiptForResultV1(contextPacket);
          results.summary = contextPacket.prompt;
          runtime.state = AtlasState.VALIDATE;
        } catch (err) {
          console.error('Context build failed:', err);
          runtime.state = AtlasState.RECOVER;
        }
        break;

      case AtlasState.VALIDATE:
        // TODO PA STAGE 13: consume an independent validation receipt. Reaching
        // this state alone is not a validation proof and must not mean COMPLETE.
        {
          const blocked = blockAtlasWorkflowV1('VALIDATION_RECEIPT_REQUIRED');
          runtime.state = blocked.state;
          results.finalState = blocked.state;
          results.blockedReason = blocked.reason;
          return results;
        }

      case AtlasState.RECOVER:
        // Recovery is not successful completion. Return the explicit
        // non-terminal state so callers cannot mistake a failed or blocked
        // verification/retrieval path for a completed workflow.
        console.warn('Atlas workflow blocked in recovery mode');
        results.finalState = AtlasState.RECOVER;
        results.confidence = runtime.confidence;
        return results;

      default:
        results.finalState = AtlasState.RECOVER;
        results.confidence = runtime.confidence;
        return results;
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
    model: LLM_MODEL_ID,
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
