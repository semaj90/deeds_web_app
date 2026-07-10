/**
 * Viterbi Router — Deterministic state transitions + result classification
 *
 * Phase 1: Route decision without learned probabilities
 * Phase 2: Explicit result classification → next state
 * Phase 3: Bounded recovery (hard state rules, no invalid transitions)
 */

import { v4 as uuid } from 'uuid';
import type {
  RouterState,
  ToolDescriptor,
  ToolResult,
  RouterObservation,
  RouterDecision,
  RouteTrace,
} from './router-types.js';
import { isValidTransition, getNextStatesFromResult } from './router-types.js';
import { rankTools, selectTopTools } from './deterministic-tool-ranker.js';

// ── Result Classifier ────────────────────────────────────────────────────────

export function classifyToolResult(result: ToolResult): RouterState {
  // Transport/timeout → recovery
  if (result.transportError || result.timeout) {
    return 'RECOVER';
  }

  // Schema error → clarification
  if (result.schemaError) {
    return 'CLARIFY';
  }

  // Empty result → retry retrieval
  if (result.success && result.resultCount === 0) {
    return 'RETRIEVE';
  }

  // Partial result without provenance → recovery
  if (result.resultClass === 'partial' && result.sourceRefCount === 0) {
    return 'RECOVER';
  }

  // Valid result but missing required source refs → validation
  if (
    result.success &&
    result.requiresProvenance &&
    result.sourceRefCount === 0
  ) {
    return 'VALIDATE';
  }

  // Valid result ready for synthesis
  return 'SYNTHESIZE';
}

// ── Deterministic State Transition ───────────────────────────────────────────

export function nextLegalState(
  currentState: RouterState,
  result: ToolResult
): RouterState | null {
  const candidates = getNextStatesFromResult(result);

  // Filter to only legal transitions
  const legal = candidates.filter((s) =>
    isValidTransition(currentState, s)
  );

  if (legal.length === 0) {
    // No legal transition from this state with this result
    // Fallback to ESCALATE (top-level error recovery)
    return isValidTransition(currentState, 'ESCALATE') ? 'ESCALATE' : null;
  }

  // Return first legal state (deterministic ordering)
  return legal[0];
}

// ── Route Decision ───────────────────────────────────────────────────────────

export function makeRouteDecision(
  traceId: string,
  obs: RouterObservation
): RouterDecision {
  // Rank all tools
  const ranked = rankTools(Array.from(obs.availableTools.values()), obs);

  if (ranked.length === 0) {
    // No eligible tools — escalate
    throw new Error(`No eligible tools for query: "${obs.query}"`);
  }

  // Select top 3
  const topThree = selectTopTools(ranked, 3);
  const selected = topThree[0];

  // Determine next state (from current or START)
  const nextState = obs.previousState === 'START'
    ? 'RETRIEVE'
    : obs.previousState;

  return {
    decisionId: uuid(),
    traceId,
    selectedTool: selected.tool,
    candidates: topThree,
    selectedState: nextState,
    reasoning: `Selected ${selected.tool.name} (score: ${selected.compositeScore.toFixed(3)})`,
  };
}

// ── Bounded Recovery ─────────────────────────────────────────────────────────

export async function attemptRecovery(
  trace: RouteTrace,
  availableTools: Map<string, ToolDescriptor>
): Promise<RouteTrace> {
  if (trace.recoveryAttempted) {
    // Already tried recovery
    return trace;
  }

  // Identify recovery tools (RETRIEVE, CLARIFY, VALIDATE)
  const recoveryTools = Array.from(availableTools.values()).filter(
    (t) => t.namespace === 'kb' || t.namespace === 'db'
  );

  if (recoveryTools.length === 0) {
    // No recovery tools available
    return {
      ...trace,
      recoveryAttempted: true,
      finalState: 'ESCALATE',
      finalOutcome: 'escalated',
    };
  }

  // Return recovery trace (execution deferred to caller)
  return {
    ...trace,
    recoveryAttempted: true,
    recoveryState: 'RECOVER',
    recoveryTool: recoveryTools[0].name,
  };
}

// ── Build Auditable Trace ────────────────────────────────────────────────────

export function buildRouteTrace(
  traceId: string,
  query: string,
  queryHash: string,
  decision: RouterDecision,
  proposalId: string,
  schemaValid: boolean
): RouteTrace {
  return {
    traceId,
    queryHash,
    query,
    decisionId: decision.decisionId,
    selectedState: decision.selectedState,
    selectedToolName: decision.selectedTool.name,
    candidateTools: decision.candidates.map((c) => c.tool.name),
    proposalId,
    proposedArguments: {},
    schemaValid,
    approvalRequired: !decision.selectedTool.readOnly,
    executed: false,
    recoveryAttempted: false,
    finalState: decision.selectedState,
    finalOutcome: 'partial',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Finalize Trace after Execution ───────────────────────────────────────────

export function finalizeTrace(
  trace: RouteTrace,
  result: ToolResult
): RouteTrace {
  const nextState = nextLegalState(trace.finalState, result);

  return {
    ...trace,
    executed: true,
    executionId: result.executionId,
    resultClass: result.resultClass,
    resultCount: result.resultCount,
    sourceRefCount: result.sourceRefCount,
    sourceRefs: result.sourceRefs,
    durationMs: result.durationMs,
    finalState: nextState || 'ESCALATE',
    finalOutcome: result.success ? 'success' : 'failed',
    updatedAt: new Date(),
  };
}

// ── Validation Gates ─────────────────────────────────────────────────────────

export interface RouteValidation {
  valid: boolean;
  errors: string[];
}

export function validateRoute(trace: RouteTrace): RouteValidation {
  const errors: string[] = [];

  // Gate 1: Tool name exists (no invented tools)
  if (!trace.selectedToolName || trace.selectedToolName.trim() === '') {
    errors.push('Tool name is empty');
  }

  // Gate 2: Schema valid (no invalid arguments)
  if (!trace.schemaValid) {
    errors.push('Schema validation failed');
  }

  // Gate 3: State is valid
  if (!(['START', 'RETRIEVE', 'STRUCTURE', 'LEGAL_ANALYZE', 'OPERATE', 'VALIDATE', 'RECOVER', 'CLARIFY', 'SYNTHESIZE', 'ESCALATE', 'DONE'] as const satisfies readonly RouterState[]).includes(trace.selectedState)) {
    errors.push(`Invalid router state: ${trace.selectedState}`);
  }

  // Gate 4: Transition is legal
  if (
    trace.finalState !== trace.selectedState &&
    !isValidTransition(trace.selectedState, trace.finalState)
  ) {
    errors.push(
      `Illegal transition: ${trace.selectedState} → ${trace.finalState}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
