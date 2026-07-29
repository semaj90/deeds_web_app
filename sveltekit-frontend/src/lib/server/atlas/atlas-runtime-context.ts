/**
 * Atlas Runtime Context — shared across Mastra, HMM, and Go data plane.
 * Every tool and workflow step receives this context for authorization, revision tracking, and state estimation.
 */

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
  workspaceRevision: string;   // e.g., "2026-07-29T18:45:00Z"
  packetKey: string;           // Current packet identity (atlas:packet:...)
  packetRevision: string;      // Packet version timestamp

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
  initialState?: AtlasState;
  tokenBudget?: number;
}): AtlasRuntimeContext {
  return {
    runId: init.runId,
    threadId: init.threadId,
    resourceId: init.resourceId,
    workspaceId: init.workspaceId,
    workspaceRevision: new Date().toISOString(),
    packetKey: init.packetKey,
    packetRevision: new Date().toISOString(),
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
