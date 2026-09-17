/**
 * Mastra + Atlas Adapter — Wraps Mastra Agent with Atlas FSM, revision tracking, and tool eligibility gating.
 * This is the integration layer between Mastra orchestration and the Go data plane.
 */

import { z } from 'zod';

// @mastra/core is NOT installed in this repo (confirmed via package.json audit,
// 2026-08-01/02 — no `mastra` or `@mastra/core` dependency exists). The
// unconditional `import { createTool } from '@mastra/core'` this file used to
// have crashed at module-load time on every request to /api/atlas/mastra-agent
// with "Failed to resolve entry for package @mastra/core" (reproduced live).
// This local shim preserves the exact call shape (id/description/inputSchema/
// outputSchema/execute) so the 7 tool definitions below still type-check and
// export real, callable objects — it does NOT provide Mastra's actual agent
// runtime (tool selection, step orchestration, model loop). If/when the real
// @mastra/core package is installed, delete this shim and restore the import.
interface LocalToolShim<TInput, TOutput> {
  id: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  execute: (input: TInput, context?: unknown) => Promise<TOutput>;
}
function createTool<TInput, TOutput>(config: LocalToolShim<TInput, TOutput>): LocalToolShim<TInput, TOutput> {
  return config;
}

/**
 * A typed fail-closed signal for adapter seams that have no live owner yet.
 * Callers must treat this as unavailable evidence, never as an empty success.
 */
export class AtlasAdapterUnavailableError extends Error {
  readonly code: string;
  readonly writesPerformed = false;
  readonly canonicalAuthority = false;

  constructor(code: string) {
    super(code);
    this.name = 'AtlasAdapterUnavailableError';
    this.code = code;
  }
}
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
        // This guard has no prior tool receipt. Do not manufacture one just
        // to satisfy the FSM; retrieval must remain blocked until discovery
        // supplies actual evidence.
        lastToolSucceeded: false,
        lastToolError: 'PRIOR_TOOL_RECEIPT_REQUIRED',
        retrievalConfidence: 0,
        evidenceCount: 0,
        validationStatus: 'WARN',
        authFailure: false,
        revisionMismatch: false,
        tokenPressure: 0.5,
        iterationNumber: 0,
      } as RuntimeObservation)) {
        throw new Error(`Cannot transition from ${runtime.state} to RETRIEVE`);
      }
    }

    throw new AtlasAdapterUnavailableError('ATLAS_RETRIEVAL_ADAPTER_UNAVAILABLE');
  },
});

export const atlasValidateChangeTool = createTool({
  id: 'atlas.validate_change',
  description:
    'Validate a proposed change against Postgres canonical state, revision consistency, and payload schemas.',
  inputSchema: z.object({
    packetKey: z.string(),
    proposedChange: z.record(z.string(), z.unknown()),
  }),
  outputSchema: z.object({
    valid: z.boolean(),
    status: z.enum(['PASS', 'WARN', 'FAIL']),
    errors: z.array(z.string()),
    available: z.boolean(),
    canonicalAuthority: z.boolean(),
    writesPerformed: z.boolean(),
  }),
  execute: async (input, context) => {
    return {
      valid: false,
      status: 'FAIL',
      errors: ['ATLAS_VALIDATION_ADAPTER_UNAVAILABLE'],
      available: false,
      canonicalAuthority: false,
      writesPerformed: false,
    };
  },
});

export const atlasApplyChangeTool = createTool({
  id: 'atlas.apply_change',
  description: 'Apply a validated change to Postgres (write), invalidate Redis cache, emit events.',
  inputSchema: z.object({
    packetKey: z.string(),
    change: z.record(z.string(), z.unknown()),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    rowsAffected: z.number(),
    newRevision: z.string(),
  }),
  execute: async (input, context) => {
    const runtime = (context as any).atlasRuntime as AtlasRuntimeContext | undefined;

    if (runtime && !runtime.authority.mutationAllowed) {
      throw new Error('Mutation not allowed in current context');
    }

    return {
      success: false,
      rowsAffected: 0,
      newRevision: '',
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
    evidence: z.array(z.record(z.string(), z.unknown())),
    metadata: z.record(z.string(), z.unknown()),
    tokenCount: z.number(),
  }),
  }),
  execute: async (input, context) => {
    throw new AtlasAdapterUnavailableError('ATLAS_CONTEXT_ADAPTER_UNAVAILABLE_ACE_OWNER_REQUIRED');
  },
});

export const atlasDiscoverTool = createTool({
  id: 'atlas.discover',
  description: 'Discover and resolve packet identity from directory, filename, or function symbol.',
  inputSchema: z.object({
    query: z.string().describe('Path, symbol, or identifier'),
  }),
  outputSchema: z.object({
    status: z.enum(['UNAVAILABLE', 'FOUND']),
    packets: z.array(
      z.object({
        packetKey: z.string(),
        sourceRef: z.string(),
        confidence: z.number(),
      })
    ),
    reason: z.string().optional(),
    canonicalAuthority: z.boolean(),
    writesPerformed: z.boolean(),
  }),
  execute: async (input, context) => {
    return {
      status: 'UNAVAILABLE',
      packets: [],
      reason: 'ATLAS_DISCOVER_UNAVAILABLE_CANONICAL_RESOLUTION_REQUIRED',
      canonicalAuthority: false,
      writesPerformed: false,
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
    runtime: z.record(z.string(), z.unknown()),
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
    available: z.boolean(),
    reason: z.string().optional(),
    writesPerformed: z.boolean(),
  }),
  execute: async (input, context) => {
    return {
      result: '',
      status: 'failed',
      available: false,
      reason: 'ATLAS_DELEGATE_UNAVAILABLE_GOVERNED_OWNER_REQUIRED',
      writesPerformed: false,
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
  workspaceRevision?: string;
  packetRevision?: string;
}) {
  const runtime = createAtlasRuntimeContext({
    runId: init.runId,
    threadId: init.threadId,
    resourceId: init.resourceId,
    workspaceId: init.workspaceId,
    packetKey: init.packetKey,
    workspaceRevision: init.workspaceRevision,
    packetRevision: init.packetRevision,
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
