import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { buildStreamPreamble } from '$lib/server/mcp/atlas-tools-client.js';
import { searchEvidenceViaGrpc } from '$lib/server/grpc/retrieval-client.js';
import { buildSemanticSignalPacket } from './semantic-signal-routing.js';
import { createAtlasSearchAdapter } from './retrieval/search-runtime-adapter.js';
import { AtlasState, createAtlasRuntimeContext, type AtlasRuntimeContext, type RuntimeObservation } from './atlas-runtime-context.js';
import { estimateExecutionState, isTransitionAllowed } from './atlas-fsm-policy.js';

export type AtlasSemanticToolName =
  | 'atlas.discover'
  | 'atlas.retrieve'
  | 'atlas.build_context'
  | 'atlas.inspect_runtime'
  | 'atlas.apply_change'
  | 'atlas.validate_change'
  | 'atlas.delegate';

export interface AtlasSemanticToolDefinition {
  name: AtlasSemanticToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AtlasSemanticRuntimeInput {
  runId?: string;
  threadId?: string;
  resourceId?: string;
  workspaceId?: string;
  workspaceRevision?: string;
  packetKey?: string;
  packetRevision?: string;
  state?: AtlasState;
  confidence?: number;
  tokenBudget?: {
    maximumInput?: number;
    remainingInput?: number;
  };
  authority?: {
    mutationAllowed?: boolean;
    postgresCanonical?: boolean;
  };
  parentSpanId?: string;
  correlationId?: string;
}

export interface AtlasSemanticObservationInput extends Partial<RuntimeObservation> {
  state?: AtlasState;
}

export interface AtlasSemanticRetrieveInput {
  query: string;
  topK?: number;
  lanes?: Array<'dense' | 'sparse' | 'graph' | 'symbol' | 'temporal' | 'centroid'>;
  runtime?: AtlasSemanticRuntimeInput;
  withGraphExpansion?: boolean;
  mock?: boolean;
}

export interface AtlasSemanticBuildContextInput extends AtlasSemanticRetrieveInput {
  includePreamble?: boolean;
}

export interface AtlasSemanticValidateChangeInput {
  runtime?: AtlasSemanticRuntimeInput;
  observation: AtlasSemanticObservationInput;
}

export interface AtlasSemanticDelegateInput {
  target: string;
  runtime?: AtlasSemanticRuntimeInput;
  reason?: string;
}

export interface AtlasSemanticToolResult {
  ok: boolean;
  tool: AtlasSemanticToolName;
  runtime: AtlasRuntimeContext;
  state: AtlasState;
  confidence: number;
  mock: boolean;
  backend: 'grpc' | 'search-runtime' | 'mock' | 'fsm';
  data: Record<string, unknown>;
}

const runtimeSchema = z
  .object({
    runId: z.string().min(1).optional(),
    threadId: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
    workspaceId: z.string().min(1).optional(),
    workspaceRevision: z.string().min(1).optional(),
    packetKey: z.string().min(1).optional(),
    packetRevision: z.string().min(1).optional(),
    state: z.nativeEnum(AtlasState).optional(),
    confidence: z.number().min(0).max(1).optional(),
    tokenBudget: z
      .object({
        maximumInput: z.number().int().positive().optional(),
        remainingInput: z.number().int().nonnegative().optional(),
      })
      .optional(),
    authority: z
      .object({
        mutationAllowed: z.boolean().optional(),
        postgresCanonical: z.boolean().optional(),
      })
      .optional(),
    parentSpanId: z.string().min(1).optional(),
    correlationId: z.string().min(1).optional(),
  })
  .partial();

const observationSchema = z.object({
  lastTool: z.string().min(1).default('atlas.inspect_runtime'),
  lastToolSucceeded: z.boolean().default(true),
  lastToolError: z.string().optional(),
  retrievalConfidence: z.number().min(0).max(1).default(0.5),
  evidenceCount: z.number().int().nonnegative().default(0),
  validationStatus: z.enum(['PASS', 'WARN', 'FAIL']).default('WARN'),
  authFailure: z.boolean().default(false),
  revisionMismatch: z.boolean().default(false),
  tokenPressure: z.number().min(0).max(1).default(0),
  taskDescription: z.string().optional(),
  iterationNumber: z.number().int().nonnegative().default(0),
  state: z.nativeEnum(AtlasState).optional(),
});

const retrieveInputSchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().min(1).max(50).default(12),
  lanes: z.array(z.enum(['dense', 'sparse', 'graph', 'symbol', 'temporal', 'centroid'])).default(['dense', 'sparse', 'graph']),
  runtime: runtimeSchema.optional(),
  withGraphExpansion: z.boolean().default(false),
  mock: z.boolean().default(false),
});

const buildContextInputSchema = retrieveInputSchema.extend({
  includePreamble: z.boolean().default(true),
});

const validateInputSchema = z.object({
  runtime: runtimeSchema.optional(),
  observation: observationSchema,
});

const delegateInputSchema = z.object({
  target: z.string().min(1),
  reason: z.string().optional(),
  runtime: runtimeSchema.optional(),
});

export const ATLAS_SEMANTIC_TOOL_DEFINITIONS: AtlasSemanticToolDefinition[] = [
  {
    name: 'atlas.discover',
    description: 'Inspect the current Atlas runtime, retrieval health, and allowed tool set for the current FSM state.',
    inputSchema: {
      type: 'object',
      properties: {
        runtime: { type: 'object' },
      },
    },
  },
  {
    name: 'atlas.retrieve',
    description: 'Run the retrieval wrapper against Go Retrieval gRPC first, then fall back to the canonical search runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        topK: { type: 'number', default: 12 },
        lanes: {
          type: 'array',
          items: { type: 'string', enum: ['dense', 'sparse', 'graph', 'symbol', 'temporal', 'centroid'] },
        },
        runtime: { type: 'object' },
        withGraphExpansion: { type: 'boolean', default: false },
        mock: { type: 'boolean', default: false },
      },
      required: ['query'],
    },
  },
  {
    name: 'atlas.build_context',
    description: 'Build a bounded context packet from retrieval results plus the current preamble/memory surface.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        topK: { type: 'number', default: 12 },
        lanes: {
          type: 'array',
          items: { type: 'string', enum: ['dense', 'sparse', 'graph', 'symbol', 'temporal', 'centroid'] },
        },
        runtime: { type: 'object' },
        includePreamble: { type: 'boolean', default: true },
      },
      required: ['query'],
    },
  },
  {
    name: 'atlas.inspect_runtime',
    description: 'Inspect the current runtime context, FSM policy, and retrieval health without mutating any state.',
    inputSchema: {
      type: 'object',
      properties: {
        runtime: { type: 'object' },
        observation: { type: 'object' },
      },
    },
  },
  {
    name: 'atlas.apply_change',
    description: 'Stubbed mutation wrapper. Returns a dry-run style response and does not write to production stores.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        patch: { type: 'object' },
        runtime: { type: 'object' },
        dryRun: { type: 'boolean', default: true },
      },
      required: ['target'],
    },
  },
  {
    name: 'atlas.validate_change',
    description: 'Validate a candidate state transition against the Atlas FSM policy and return the next allowed tools.',
    inputSchema: {
      type: 'object',
      properties: {
        runtime: { type: 'object' },
        observation: { type: 'object' },
      },
      required: ['observation'],
    },
  },
  {
    name: 'atlas.delegate',
    description: 'Stub delegation lane for ACP / A2A handoff bookkeeping. No live delegation is performed.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        reason: { type: 'string' },
        runtime: { type: 'object' },
      },
      required: ['target'],
    },
  },
];

function normalizeRuntimeContext(runtime?: AtlasSemanticRuntimeInput): AtlasRuntimeContext {
  const seed = runtimeSchema.parse(runtime ?? {});
  return {
    ...createAtlasRuntimeContext({
      runId: seed.runId ?? randomUUID(),
      threadId: seed.threadId ?? 'atlas-thread',
      resourceId: seed.resourceId ?? 'atlas-resource',
      workspaceId: seed.workspaceId ?? 'atlas-workspace',
      packetKey: seed.packetKey ?? 'atlas:packet:runtime',
      initialState: seed.state ?? AtlasState.DISCOVER,
      tokenBudget: seed.tokenBudget?.maximumInput ?? 8192,
    }),
    workspaceRevision: seed.workspaceRevision ?? new Date().toISOString(),
    packetRevision: seed.packetRevision ?? new Date().toISOString(),
    confidence: seed.confidence ?? 0.5,
    tokenBudget: {
      maximumInput: seed.tokenBudget?.maximumInput ?? 8192,
      remainingInput: seed.tokenBudget?.remainingInput ?? seed.tokenBudget?.maximumInput ?? 8192,
    },
    authority: {
      mutationAllowed: seed.authority?.mutationAllowed ?? false,
      postgresCanonical: seed.authority?.postgresCanonical ?? true,
    },
    parentSpanId: seed.parentSpanId,
    correlationId: seed.correlationId,
  };
}

function makeResult(
  tool: AtlasSemanticToolName,
  runtime: AtlasRuntimeContext,
  state: AtlasState,
  confidence: number,
  backend: AtlasSemanticToolResult['backend'],
  data: Record<string, unknown>,
  mock = false,
): AtlasSemanticToolResult {
  return {
    ok: true,
    tool,
    runtime,
    state,
    confidence,
    mock,
    backend,
    data,
  };
}

async function inspectRuntime(runtime?: AtlasSemanticRuntimeInput, observation?: AtlasSemanticObservationInput) {
  const ctx = normalizeRuntimeContext(runtime);
  const obs = observationSchema.parse(observation ?? {});
  const inference = estimateExecutionState(ctx.state, obs);
  return makeResult('atlas.inspect_runtime', ctx, inference.state, inference.confidence, 'fsm', {
    allowedTools: inference.allowedTools,
    allowMutation: inference.allowMutation,
    recoveryAction: inference.recoveryAction ?? null,
    observation: obs,
  });
}

async function discover(runtime?: AtlasSemanticRuntimeInput) {
  const ctx = normalizeRuntimeContext(runtime);
  const [retrievalHealth, preamble] = await Promise.all([
    import('$lib/server/grpc/retrieval-client.js')
      .then((mod) => mod.checkRetrievalHealth())
      .catch(() => ({ available: false, enabled: false, url: 'unavailable', service: 'retrieval-service' })),
    buildStreamPreamble('atlas discover', 5).catch(() => null),
  ]);

  return makeResult('atlas.discover', ctx, ctx.state, ctx.confidence, 'grpc', {
    retrievalHealth,
    preamble,
    allowedTools: estimateExecutionState(ctx.state, observationSchema.parse({})).allowedTools,
  });
}

async function retrieve(input: AtlasSemanticRetrieveInput) {
  const params = retrieveInputSchema.parse(input);
  const runtime = normalizeRuntimeContext(params.runtime);
  const query = params.query.trim();
  const semanticSignal = buildSemanticSignalPacket({
    query,
    subjectId: runtime.packetKey,
    workspaceId: runtime.workspaceId,
    workspaceRevision: runtime.workspaceRevision,
    producer: 'atlas.semantic_tools',
    producerRevision: 'phase109a.semantic_signal.v1',
    packetKey: runtime.packetKey,
    packetRevision: runtime.packetRevision,
    activeGoal: 'retrieve bounded evidence',
    currentPlanStep: 'retrieve',
    problem: 'Need compact evidence retrieval without flooding context',
    proposedAction: 'Use bounded lane planning and compact signal packets',
    validationCriteria: ['compact summary produced', 'bounded lanes selected', 'evidence references preserved'],
    rollbackPlan: ['fall back to canonical search runtime', 'keep retrieval data plane unchanged'],
    status: 'RUNTIME_PROOF_PENDING',
    loopState: 'RETRIEVE',
    loopTool: 'atlas.retrieve',
    loopResult: 'PASS',
    loopEvidenceCoverage: 0.5,
    loopTokenPressure: 0.2,
  });

  if (params.mock) {
    return makeResult('atlas.retrieve', runtime, AtlasState.RETRIEVE, runtime.confidence, 'mock', {
      query,
      topK: params.topK,
      lanes: params.lanes,
      evidence: [],
      note: 'mock retrieval enabled',
      semanticSignal: semanticSignal.compactSummary,
      proofManifest: semanticSignal.proofManifest,
    }, true);
  }

  const grpcHit = await searchEvidenceViaGrpc({ query, limit: params.topK }).catch(() => null);
  if (grpcHit) {
    return makeResult('atlas.retrieve', runtime, AtlasState.RETRIEVE, 0.75, 'grpc', {
      query,
      topK: params.topK,
      lanes: params.lanes,
      semanticSignal: semanticSignal.compactSummary,
      proofManifest: semanticSignal.proofManifest,
      evidence: grpcHit.results.map((result) => ({
        sourceRef: result.metadata?.fileName ?? '',
        content: result.content,
        packetKey: result.evidenceId,
        score: result.score,
      })),
      timing: grpcHit.timing,
      cacheSource: grpcHit.cacheSource ?? null,
    });
  }

  const search = createAtlasSearchAdapter({
    userId: runtime.resourceId,
    caseId: runtime.workspaceId,
  });

  const result = await search.search({
    query,
    topK: params.topK,
    withGraphExpansion: params.withGraphExpansion,
  });

  return makeResult('atlas.retrieve', runtime, AtlasState.RETRIEVE, 0.6, 'search-runtime', {
    query,
    topK: params.topK,
    lanes: params.lanes,
    semanticSignal: semanticSignal.compactSummary,
    proofManifest: semanticSignal.proofManifest,
    packets: result.packets,
    metadata: result.metadata,
    provenance: result.provenance,
    topPacketKeys: result.topPacketKeys,
    graphExpanded: result.graphExpanded ?? [],
  }, false);
}

async function buildContext(input: AtlasSemanticBuildContextInput) {
  const params = buildContextInputSchema.parse(input);
  const runtime = normalizeRuntimeContext(params.runtime);
  const retrieval = await retrieve({
    query: params.query,
    topK: params.topK,
    lanes: params.lanes,
    runtime: params.runtime,
    withGraphExpansion: params.withGraphExpansion,
    mock: params.mock,
  });

  const preamble = params.includePreamble
    ? await buildStreamPreamble(params.query, Math.min(params.topK, 12)).catch(() => null)
    : null;

  return makeResult('atlas.build_context', runtime, AtlasState.SYNTHESIZE, retrieval.confidence, retrieval.backend, {
    query: params.query,
    topK: params.topK,
    lanes: params.lanes,
    retrieval: retrieval.data,
    preamble,
    semanticSignal: (retrieval.data as Record<string, unknown>).semanticSignal ?? null,
    proofManifest: (retrieval.data as Record<string, unknown>).proofManifest ?? null,
    contextBlob: JSON.stringify({
      runtime: {
        runId: runtime.runId,
        threadId: runtime.threadId,
        workspaceId: runtime.workspaceId,
        packetKey: runtime.packetKey,
        state: runtime.state,
      },
      semanticSignal: (retrieval.data as Record<string, unknown>).semanticSignal ?? null,
      retrieval: retrieval.data,
      preamble,
    }),
  }, retrieval.mock);
}

async function validateChange(input: AtlasSemanticValidateChangeInput) {
  const params = validateInputSchema.parse(input);
  const runtime = normalizeRuntimeContext(params.runtime);
  const inference = estimateExecutionState(runtime.state, params.observation);

  return makeResult('atlas.validate_change', runtime, inference.state, inference.confidence, 'fsm', {
    allowedTools: inference.allowedTools,
    allowMutation: inference.allowMutation,
    recoveryAction: inference.recoveryAction ?? null,
    transitionAllowed: isTransitionAllowed(runtime.state, inference.state, params.observation),
    observation: params.observation,
  });
}

async function applyChange(input: { target: string; patch?: unknown; runtime?: AtlasSemanticRuntimeInput; dryRun?: boolean }) {
  const runtime = normalizeRuntimeContext(input.runtime);
  return makeResult('atlas.apply_change', runtime, AtlasState.MUTATE, 0.2, 'mock', {
    target: input.target,
    dryRun: input.dryRun ?? true,
    applied: false,
    reason: 'Mutation path is intentionally stubbed until a validated apply queue exists.',
    patch: input.patch ?? null,
  }, true);
}

async function delegate(input: AtlasSemanticDelegateInput) {
  const params = delegateInputSchema.parse(input);
  const runtime = normalizeRuntimeContext(params.runtime);
  return makeResult('atlas.delegate', runtime, AtlasState.WAIT_EXTERNAL, runtime.confidence, 'mock', {
    target: params.target,
    reason: params.reason ?? 'delegation stub',
    delegated: false,
    transport: 'none',
  }, true);
}

export async function handleAtlasSemanticToolCall(
  name: AtlasSemanticToolName,
  args: Record<string, unknown>,
): Promise<AtlasSemanticToolResult> {
  switch (name) {
    case 'atlas.discover':
      return discover((args.runtime as AtlasSemanticRuntimeInput | undefined) ?? undefined);
    case 'atlas.retrieve':
      return retrieve(args as unknown as AtlasSemanticRetrieveInput);
    case 'atlas.build_context':
      return buildContext(args as unknown as AtlasSemanticBuildContextInput);
    case 'atlas.inspect_runtime':
      return inspectRuntime(
        (args.runtime as AtlasSemanticRuntimeInput | undefined) ?? undefined,
        (args.observation as AtlasSemanticObservationInput | undefined) ?? undefined,
      );
    case 'atlas.apply_change':
      return applyChange(args as { target: string; patch?: unknown; runtime?: AtlasSemanticRuntimeInput; dryRun?: boolean });
    case 'atlas.validate_change':
      return validateChange(args as unknown as AtlasSemanticValidateChangeInput);
    case 'atlas.delegate':
      return delegate(args as unknown as AtlasSemanticDelegateInput);
    default:
      throw new Error(`Unsupported atlas semantic tool: ${name}`);
  }
}
