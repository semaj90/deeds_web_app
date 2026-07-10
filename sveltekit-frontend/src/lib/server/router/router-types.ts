/**
 * Router Types — Deterministic tool selection with HMM-shaped telemetry
 *
 * Phase 1: Eligibility gates → weighted ranking (heuristic scores, no ML yet)
 * Phase 2: Bounded recovery (explicit state transitions, result classification)
 * Phase 3: Gold replay dataset (160+ examples for later Baum-Welch training)
 */

// ── Router States ────────────────────────────────────────────────────────────

export type RouterState =
  | 'START'
  | 'RETRIEVE'
  | 'STRUCTURE'
  | 'LEGAL_ANALYZE'
  | 'OPERATE'
  | 'VALIDATE'
  | 'RECOVER'
  | 'CLARIFY'
  | 'SYNTHESIZE'
  | 'ESCALATE'
  | 'DONE';

export const ALLOWED_TRANSITIONS: Record<RouterState, RouterState[]> = {
  START: ['RETRIEVE', 'STRUCTURE', 'OPERATE', 'CLARIFY'],
  RETRIEVE: ['STRUCTURE', 'LEGAL_ANALYZE', 'VALIDATE', 'RECOVER'],
  STRUCTURE: ['RETRIEVE', 'VALIDATE', 'RECOVER'],
  LEGAL_ANALYZE: ['VALIDATE', 'RETRIEVE', 'RECOVER'],
  OPERATE: ['VALIDATE', 'RECOVER'],
  VALIDATE: ['SYNTHESIZE', 'RECOVER', 'CLARIFY'],
  RECOVER: ['RETRIEVE', 'STRUCTURE', 'CLARIFY', 'ESCALATE'],
  CLARIFY: ['RETRIEVE', 'DONE'],
  SYNTHESIZE: ['DONE'],
  ESCALATE: ['DONE'],
  DONE: [],
};

// ── Tool Result Classification ────────────────────────────────────────────────

export type ToolResultClass =
  | 'answer'          // complete result, ready to synthesize
  | 'candidates'      // partial result, ready for further processing
  | 'partial'         // incomplete result, requires another tool
  | 'empty'           // no results found
  | 'validation_error'
  | 'transport_error'
  | 'tool_error'
  | 'timeout';

// ── Tool Descriptor ──────────────────────────────────────────────────────────

export interface ToolDescriptor {
  name: string;
  namespace: string;                    // 'db', 'kb', 'trace', 'topology', etc.
  description: string;
  readOnly: boolean;
  providesSourceRefs: boolean;
  requiresServices: string[];           // ['postgres', 'qdrant', 'redis']
  resultClass: ToolResultClass;
  timeout: number;                      // ms
  maxRetries: number;
}

// ── Router Observation ───────────────────────────────────────────────────────

export interface RouterConstraint {
  readOnly: boolean;
  requiresExactSourceRefs: boolean;
}

export interface RouterObservation {
  query: string;
  constraints: RouterConstraint;
  previousState: RouterState;
  healthyServices: Set<string>;
  availableTools: Map<string, ToolDescriptor>;
  telemetryContext?: {
    traceId: string;
    queryHash: string;
    priorSuccessRate?: number;
    timeoutRiskScore?: number;
  };
}

// ── Tool Candidate (ranked) ──────────────────────────────────────────────────

export interface ToolCandidate {
  tool: ToolDescriptor;
  eligible: boolean;
  ineligibilityReason?: string;

  // Normalized heuristic scores [0, 1]
  semanticScore: number;         // BM25 or EmbeddingGemma similarity
  intentScore: number;           // query intent match
  schemaFitness: number;         // argument matching
  transitionScore: number;       // legal state transition
  healthScore: number;           // service health
  historicalSuccessScore: number;  // from telemetry (or 0.5 if missing)
  provenanceScore: number;       // source-ref availability
  latencyScore: number;          // expected latency
  topologyScore: number;         // Neo4j graph alignment

  // Combined ranking score
  compositeScore: number;
}

// ── Router Decision ──────────────────────────────────────────────────────────

export interface RouterDecision {
  decisionId: string;
  traceId: string;
  selectedTool: ToolDescriptor;
  candidates: ToolCandidate[];  // top 3
  selectedState: RouterState;
  reasoning: string;
}

// ── Proposed Tool Call ───────────────────────────────────────────────────────

export interface ProposedToolCall {
  proposalId: string;
  traceId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  schemaValid: boolean;
  validationErrors: string[];
  readOnly: boolean;
  sideEffectClass: 'none' | 'minor' | 'major' | 'data_loss';
  approvalRequired: boolean;
  executed: boolean;
  createdAt: Date;
}

// ── Tool Execution Result ────────────────────────────────────────────────────

export interface ToolResult {
  toolName: string;
  executionId: string;
  success: boolean;
  resultClass: ToolResultClass;
  resultCount: number;
  sourceRefCount: number;
  sourceRefs?: string[];
  summary?: string;
  fullResult?: unknown;

  // Error details
  schemaError?: boolean;
  transportError?: boolean;
  timeout?: boolean;
  toolError?: string;

  // Timing
  durationMs: number;

  // Next state classification
  requiresProvenance: boolean;
}

// ── Route Trace (complete auditable record) ──────────────────────────────────

export interface RouteTrace {
  traceId: string;
  queryHash: string;
  query: string;

  // Decision
  decisionId: string;
  selectedState: RouterState;
  selectedToolName: string;
  candidateTools: string[];  // top 3 ranked tools

  // Proposal
  proposalId: string;
  proposedArguments: Record<string, unknown>;
  schemaValid: boolean;
  approvalRequired: boolean;

  // Execution
  executed: boolean;
  executionId?: string;
  resultClass?: ToolResultClass;
  resultCount?: number;
  sourceRefCount?: number;
  sourceRefs?: string[];
  durationMs?: number;

  // Recovery
  recoveryAttempted: boolean;
  recoveryState?: RouterState;
  recoveryTool?: string;

  // Final outcome
  finalState: RouterState;
  finalOutcome: 'success' | 'partial' | 'failed' | 'escalated';

  // Telemetry
  createdAt: Date;
  updatedAt: Date;
}

// ── Exports for type safety ──────────────────────────────────────────────────

export function isValidTransition(from: RouterState, to: RouterState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatesFromResult(result: ToolResult): RouterState[] {
  if (result.transportError || result.timeout) return ['RECOVER'];
  if (result.schemaError) return ['CLARIFY'];
  if (result.success && result.resultCount === 0) return ['RETRIEVE'];
  if (result.resultClass === 'partial' && result.sourceRefCount === 0) {
    return ['RECOVER'];
  }
  if (result.success && result.requiresProvenance && result.sourceRefCount === 0) {
    return ['VALIDATE'];
  }
  return ['SYNTHESIZE'];
}
