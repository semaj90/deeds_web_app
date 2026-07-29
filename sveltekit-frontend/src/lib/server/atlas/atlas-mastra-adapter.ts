/**
 * Mastra + Atlas Adapter — Wraps Mastra Agent with Atlas FSM, revision tracking, and tool eligibility gating.
 * This is the integration layer between Mastra orchestration and the Go data plane.
 */

import { createTool } from '@mastra/core';
import { z } from 'zod';
import {
  AtlasRuntimeContext,
  AtlasState,
  RuntimeObservation,
  createAtlasRuntimeContext,
} from './atlas-runtime-context';
import { estimateExecutionState, isTransitionAllowed } from './atlas-fsm-policy';

// ─────────────────────────────────────────────────────────────────────────
// MCP Tool Wrapper — Reduce 80+ low-level functions to 7 semantic tools
// ─────────────────────────────────────────────────────────────────────────

export const atlasRetrieveTool = createTool({
  id: 'atlas.retrieve',
  description:
    'Retrieve bounded, provenance-checked evidence for the current task. Queries Qdrant (dense + sparse), Redis cache, and Neo4j graph expansion.',
  inputSchema: z.object({
    query: z.string().describe('Search query (text or SQL filter)'),
    topK: z.number().int().min(1).max(50).default(12),
    lanes: z
      .array(z.enum(['dense', 'sparse', 'graph', 'symbol', 'temporal', 'centroid']))
      .default(['dense', 'sparse', 'graph']),
  }),
  outputSchema: z.object({
    packets: z.array(
      z.object({
        packetKey: z.string(),
        sourceRef: z.string(),
        contentHash: z.string(),
        denseScore: z.number().optional(),
        sparseScore: z.number().optional(),
        graphScore: z.number().optional(),
        retrievalId: z.string(),
      })
    ),
    confidence: z.number(),
    evidenceCount: z.number(),
  }),
  execute: async (input, context) => {
    const runtime = (context as any).atlasRuntime as AtlasRuntimeContext | undefined;

    // Validate state and authorization
    if (runtime) {
      if (!isTransitionAllowed(runtime.state, AtlasState.RETRIEVE, {
        lastTool: 'init',
        lastToolSucceeded: true,
        retrievalConfidence: 0.7,
        evidenceCount: 0,
        validationStatus: 'PASS',
        authFailure: false,
        revisionMismatch: false,
        tokenPressure: 0.5,
        iterationNumber: 0,
      } as RuntimeObservation)) {
        throw new Error(`Cannot transition from ${runtime.state} to RETRIEVE`);
      }
    }

    // TODO: Call Go Retrieval gRPC or HTTP endpoint
    // For now, return stub response
    return {
      packets: [
        {
          packetKey: 'atlas:packet:example:001',
          sourceRef: 'src/lib/server/atlas/atlas-runtime-context.ts',
          contentHash: 'abc123def456',
          denseScore: 0.95,
          sparseScore: 0.82,
          graphScore: 0.88,
          retrievalId: 'retrieval:2026-07-29:001',
        },
      ],
      confidence: 0.9,
      evidenceCount: 1,
    };
  },
});

export const atlasValidateChangeTool = createTool({
  id: 'atlas.validate_change',
  description:
    'Validate a proposed change against Postgres canonical state, revision consistency, and payload schemas.',
  inputSchema: z.object({
    packetKey: z.string(),
    proposedChange: z.record(z.unknown()),
  }),
  outputSchema: z.object({
    valid: z.boolean(),
    status: z.enum(['PASS', 'WARN', 'FAIL']),
    errors: z.array(z.string()),
  }),
  execute: async (input, context) => {
    // TODO: Call Postgres validation, schema enforcement
    return {
      valid: true,
      status: 'PASS',
      errors: [],
    };
  },
});

export const atlasApplyChangeTool = createTool({
  id: 'atlas.apply_change',
  description: 'Apply a validated change to Postgres (write), invalidate Redis cache, emit events.',
  inputSchema: z.object({
    packetKey: z.string(),
    change: z.record(z.unknown()),
  }),
  outputSchema: z.object({
    success: boolean,
    rowsAffected: z.number(),
    newRevision: z.string(),
  }),
  execute: async (input, context) => {
    const runtime = (context as any).atlasRuntime as AtlasRuntimeContext | undefined;

    if (runtime && !runtime.authority.mutationAllowed) {
      throw new Error('Mutation not allowed in current context');
    }

    // TODO: Call Postgres write, invalidate Redis, emit RabbitMQ event
    return {
      success: true,
      rowsAffected: 1,
      newRevision: new Date().toISOString(),
    };
  },
});

export const atlasBuildContextTool = createTool({
  id: 'atlas.build_context',
  description: 'Build an ACE context packet for LLM synthesis. Assembles evidence, metadata, and scoring.',
  inputSchema: z.object({
    packetKeys: z.array(z.string()),
    maxTokens: z.number().default(4096),
  }),
  outputSchema: z.object({
    contextPacket: z.object({
      prompt: z.string(),
      evidence: z.array(z.record(z.unknown())),
      metadata: z.record(z.unknown()),
      tokenCount: z.number(),
    }),
  }),
  execute: async (input, context) => {
    // TODO: Call ACE context assembler, token counter
    return {
      contextPacket: {
        prompt: 'Analyze the retrieved evidence...',
        evidence: [],
        metadata: {},
        tokenCount: 0,
      },
    };
  },
});

export const atlasDiscoverTool = createTool({
  id: 'atlas.discover',
  description: 'Discover and resolve packet identity from directory, filename, or function symbol.',
  inputSchema: z.object({
    query: z.string().describe('Path, symbol, or identifier'),
  }),
  outputSchema: z.object({
    packets: z.array(
      z.object({
        packetKey: z.string(),
        sourceRef: z.string(),
        confidence: z.number(),
      })
    ),
  }),
  execute: async (input, context) => {
    // TODO: Resolve identity from Postgres, Neo4j topology
    return {
      packets: [],
    };
  },
});

export const atlasInspectRuntimeTool = createTool({
  id: 'atlas.inspect_runtime',
  description: 'Inspect current runtime state, token budget, and allowed operations.',
  inputSchema: z.object({
    detail: z.enum(['summary', 'full']).default('summary'),
  }),
  outputSchema: z.object({
    runtime: z.record(z.unknown()),
  }),
  execute: async (input, context) => {
    const runtime = (context as any).atlasRuntime as AtlasRuntimeContext | undefined;
    return {
      runtime: runtime || {},
    };
  },
});

export const atlasDelegateTool = createTool({
  id: 'atlas.delegate',
  description:
    'Delegate work to a subagent (OpenCode, A2A remote agent, or ACP coding harness).',
  inputSchema: z.object({
    agentType: z.enum(['opencode', 'a2a', 'acp']),
    task: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
    status: z.enum(['success', 'failed', 'pending']),
  }),
  execute: async (input, context) => {
    // TODO: Wire A2A / ACP / OpenCode delegation
    return {
      result: '',
      status: 'pending',
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Mastra Request Context — Inject Atlas runtime into Mastra request
// ─────────────────────────────────────────────────────────────────────────

export async function createAtlasRequestContext(init: {
  runId: string;
  threadId: string;
  resourceId: string;
  workspaceId: string;
  packetKey: string;
}) {
  const runtime = createAtlasRuntimeContext({
    runId: init.runId,
    threadId: init.threadId,
    resourceId: init.resourceId,
    workspaceId: init.workspaceId,
    packetKey: init.packetKey,
    initialState: AtlasState.DISCOVER,
    tokenBudget: 8192,
  });

  return {
    atlasRuntime: runtime,
    systemPrompt: `
You are an Atlas agent. Current execution state: ${runtime.state}.
Allowed operations: Use only the tools available in your current state.
Workspace: ${runtime.workspaceId} (revision: ${runtime.workspaceRevision})
Packet: ${runtime.packetKey}

Follow the Atlas State Machine:
- DISCOVER: Find packets, resolve identity
- RETRIEVE: Query evidence (Qdrant, Redis, Neo4j)
- VERIFY: Validate against Postgres canonical
- SYNTHESIZE: Generate answers
- MUTATE: Apply changes (write-enabled tasks only)
- VALIDATE: Run proof gates
- RECOVER: Handle errors

Never claim completion without validation proof.
`.trim(),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Mastra Processor — FSM state gating + tool eligibility checking
// ─────────────────────────────────────────────────────────────────────────

export async function atlasToolCallProcessor(
  toolCall: { id: string; toolName: string; input: Record<string, unknown> },
  runtime: AtlasRuntimeContext
) {
  // Extract allowed tools for current state
  const allowedTools = getToolsForState(runtime.state);

  if (!allowedTools.includes(toolCall.toolName)) {
    throw new Error(
      `Tool ${toolCall.toolName} not allowed in state ${runtime.state}. Allowed: ${allowedTools.join(', ')}`
    );
  }

  // Redact secrets from input
  const sanitized = sanitizeToolInput(toolCall.input);

  return {
    id: toolCall.id,
    toolName: toolCall.toolName,
    input: sanitized,
  };
}

function getToolsForState(state: AtlasState): string[] {
  const toolMap: Record<AtlasState, string[]> = {
    [AtlasState.DISCOVER]: ['atlas.discover', 'atlas.inspect_runtime'],
    [AtlasState.RETRIEVE]: [
      'atlas.retrieve',
      'atlas.embedding_neighbors',
      'atlas.graph_traversal',
      'atlas.inspect_runtime',
    ],
    [AtlasState.VERIFY]: ['atlas.validate_change', 'atlas.inspect_runtime'],
    [AtlasState.SYNTHESIZE]: ['atlas.build_context'],
    [AtlasState.MUTATE]: ['atlas.apply_change'],
    [AtlasState.VALIDATE]: ['atlas.validate_change', 'atlas.inspect_runtime'],
    [AtlasState.WAIT_EXTERNAL]: ['atlas.delegate'],
    [AtlasState.RECOVER]: ['atlas.inspect_runtime', 'atlas.discover'],
    [AtlasState.COMPLETE]: [],
  };

  return toolMap[state] || [];
}

function sanitizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
  // Remove sensitive fields like API keys, tokens
  const { password, token, secret, apiKey, ...safe } = input as any;
  return safe;
}
