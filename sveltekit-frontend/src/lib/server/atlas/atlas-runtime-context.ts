/**
 * Atlas Runtime Context — shared across Mastra, HMM, and Go data plane.
 * Every tool and workflow step receives this context for authorization, revision tracking, and state estimation.
 */

import { z } from 'zod';

export enum AtlasState {
  DISCOVER = 'DISCOVER',       // Identify packets, resolve identity
  RETRIEVE = 'RETRIEVE',       // Query Qdrant, Redis, Neo4j, Go Retrieval
  VERIFY = 'VERIFY',           // Validate packets against Postgres canonical
  SYNTHESIZE = 'SYNTHESIZE',   // LLM generation (Gemma4, summaries)
  MUTATE = 'MUTATE',           // Apply changes (write Postgres, invalidate cache)
  VALIDATE = 'VALIDATE',       // Deterministic proof gates
  WAIT_EXTERNAL = 'WAIT_EXTERNAL', // Awaiting user input or async task
  RECOVER = 'RECOVER',         // Error recovery, retry logic
  COMPLETE = 'COMPLETE',       // Task done, ready for next
}

export interface AtlasRuntimeContext {
  // Identity
  runId: string;               // Unique run identifier (UUID)
  threadId: string;            // Conversation/session thread
  resourceId: string;          // Workspace or case scope
  workspaceId: string;         // Atlas workspace (e.g., "deeds-2026q3")

  // Revision tracking (immutable snapshots per workspace)
  workspaceRevision: string;   // caller-owned snapshot/head revision, not a timestamp
  packetKey: string;           // Current packet identity (atlas:packet:...)
  packetRevision: string;      // caller-owned packet/source lineage revision

  // State machine
  state: AtlasState;
  confidence: number;          // HMM confidence [0, 1]

  // Resource budget
  tokenBudget: {
    maximumInput: number;      // Max input tokens (context window)
    remainingInput: number;    // Remaining after model prompt
  };

  // Authorization
  authority: {
    mutationAllowed: boolean;  // Can write to Postgres?
    postgresCanonical: boolean; // Trust Postgres as source of truth? (always true)
  };

  // Observability
  parentSpanId?: string;       // OpenTelemetry parent span
  correlationId?: string;      // Cross-service correlation
}

export interface RuntimeObservation {
  // Last tool execution
  lastTool: string;
  lastToolSucceeded: boolean;
  lastToolError?: string;

  // Retrieval metrics
  retrievalConfidence: number;    // [0, 1] How confident are results?
  evidenceCount: number;          // How many packets retrieved?

  // Validation signals
  validationStatus: 'PASS' | 'WARN' | 'FAIL';
  authFailure: boolean;           // Auth error detected?
  revisionMismatch: boolean;      // Workspace revision stale?

  // Resource pressure
  tokenPressure: number;          // [0, 1] Context window utilization

  // Task metadata
  taskDescription?: string;
  iterationNumber: number;
}

/**
 * The only admissible source for a successful prior-tool observation.
 * This is a runtime receipt projection, not a new durable receipt owner.
 */
export const RuntimeToolReceiptV1Schema = z.object({
  schema: z.literal('atlas.runtime-tool-receipt.v1'),
  receiptId: z.string().min(1),
  receiptChecksum: z.string().min(1),
  tool: z.string().min(1),
  workspaceRevision: z.string().min(1),
  packetRevision: z.string().min(1),
  succeeded: z.boolean(),
  errorCode: z.string().min(1).optional(),
  retrievalConfidence: z.number().min(0).max(1),
  evidenceCount: z.number().int().nonnegative(),
  validationStatus: z.enum(['PASS', 'WARN', 'FAIL']),
  authFailure: z.boolean(),
  revisionMismatch: z.boolean(),
  writesPerformed: z.boolean(),
  canonicalAuthority: z.boolean(),
}).strict();

export type RuntimeToolReceiptV1 = z.infer<typeof RuntimeToolReceiptV1Schema>;

/** Extract only an explicitly returned receipt from a tool result. */
export function extractRuntimeToolReceiptV1(result: unknown): RuntimeToolReceiptV1 {
  if (!result || typeof result !== 'object' || !('receipt' in result)) {
    throw new Error('RUNTIME_TOOL_RECEIPT_REQUIRED');
  }
  const parsed = RuntimeToolReceiptV1Schema.safeParse((result as { receipt?: unknown }).receipt);
  if (!parsed.success) {
    throw new Error('RUNTIME_TOOL_RECEIPT_INVALID');
  }
  return parsed.data;
}

/**
 * Convert an actual tool receipt into FSM evidence. Missing receipts must be
 * handled by the caller as a blocked transition; this helper never invents
 * success, identity, revisions, or evidence counts.
 */
export function observationFromRuntimeToolReceiptV1(
  receipt: RuntimeToolReceiptV1 | null | undefined,
  iterationNumber: number,
  tokenPressure: number,
  expectedRevisions?: Pick<AtlasRuntimeContext, 'workspaceRevision' | 'packetRevision'>,
): RuntimeObservation {
  if (!receipt) {
    return {
      lastTool: 'none',
      lastToolSucceeded: false,
      lastToolError: 'PRIOR_TOOL_RECEIPT_REQUIRED',
      retrievalConfidence: 0,
      evidenceCount: 0,
      validationStatus: 'FAIL',
      authFailure: false,
      revisionMismatch: false,
      tokenPressure,
      iterationNumber,
    };
  }

  const parsed = RuntimeToolReceiptV1Schema.parse(receipt);
  if (expectedRevisions && (
    parsed.workspaceRevision !== expectedRevisions.workspaceRevision ||
    parsed.packetRevision !== expectedRevisions.packetRevision
  )) {
    throw new Error('RUNTIME_RECEIPT_REVISION_MISMATCH');
  }
  return {
    lastTool: parsed.tool,
    lastToolSucceeded: parsed.succeeded,
    ...(parsed.errorCode ? { lastToolError: parsed.errorCode } : {}),
    retrievalConfidence: parsed.retrievalConfidence,
    evidenceCount: parsed.evidenceCount,
    validationStatus: parsed.validationStatus,
    authFailure: parsed.authFailure,
    revisionMismatch: parsed.revisionMismatch,
    tokenPressure,
    iterationNumber,
  };
}

/** Missing lineage is observable and must never be replaced with wall-clock time. */
export function isAtlasRuntimeRevisionQualified(runtime: Pick<AtlasRuntimeContext, 'workspaceRevision' | 'packetRevision'>): boolean {
  return runtime.workspaceRevision.trim().length > 0 && runtime.packetRevision.trim().length > 0;
}

export function assertAtlasRuntimeRevisionQualified(
  runtime: Pick<AtlasRuntimeContext, 'workspaceRevision' | 'packetRevision'>,
): void {
  if (!isAtlasRuntimeRevisionQualified(runtime)) {
    throw new Error('ATLAS_RUNTIME_REVISION_UNQUALIFIED');
  }
}

export interface HMMInference {
  state: AtlasState;
  confidence: number;           // [0, 1] Posterior probability
  allowedTools: string[];       // Which tools can run in this state?
  allowMutation: boolean;
  recoveryAction?: string;      // Suggested recovery if in error state
}

// Example: Instantiate a runtime context for a retrieval task
export function createAtlasRuntimeContext(init: {
  runId: string;
  threadId: string;
  resourceId: string;
  workspaceId: string;
  packetKey: string;
  workspaceRevision?: string;
  packetRevision?: string;
  initialState?: AtlasState;
  tokenBudget?: number;
}): AtlasRuntimeContext {
  return {
    runId: init.runId,
    threadId: init.threadId,
    resourceId: init.resourceId,
    workspaceId: init.workspaceId,
    // Legacy callers may omit revisions, but that path is diagnostic only.
    // Preserve the absence; never mint a revision from wall-clock time.
    workspaceRevision: init.workspaceRevision ?? '',
    packetKey: init.packetKey,
    packetRevision: init.packetRevision ?? '',
    state: init.initialState ?? AtlasState.DISCOVER,
    confidence: 0.5,
    tokenBudget: {
      maximumInput: init.tokenBudget ?? 8192,
      remainingInput: init.tokenBudget ?? 8192,
    },
    authority: {
      mutationAllowed: false, // Default: read-only until verified
      postgresCanonical: true,
    },
  };
}
