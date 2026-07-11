/**
 * Execution Review and Validation
 *
 * Pairs proposed tool calls with their actual execution events and outcomes.
 * Core piece of the agent feedback loop: ensures every action is validated
 * before state transition.
 *
 * Pattern: proposal → permission → execution → observation → evaluation → next decision
 */

import { pool } from '$lib/server/db/client';

/**
 * Proposed tool call (what Gemma4 wanted to do)
 */
export interface ProposedToolCall {
	id: string;
	traceId: string;
	decisionId: string;
	query: string;
	previousState: string;
	selectedToolName: string;
	selectedToolNamespace: string | null;
	candidateTools: string[];
	confidenceScore: number;
	approvalRequired: boolean;
	proposedAt: Date;
}

/**
 * Actual tool call event (what actually happened)
 */
export interface ToolCallEvent {
	id: string;
	executionId: string;
	toolName: string;
	traceId: string;
	toolNamespace: string | null;
	actualParams: Record<string, unknown>;
	status: string;
	startedAt: Date;
	completedAt: Date | null;
	durationMs: number | null;
	resultClass: string | null;
	resultCount: number | null;
	sourceRefCount: number | null;
	sourceRefs: string[];
	errorMessage: string | null;
	fromServer: boolean;
	eventJson: Record<string, unknown> | null;
	error?: string;
}

/**
 * Outcome ledger (what changed in the system)
 */
export interface OutcomeLedger {
	id: string;
	executionId: string;
	traceId: string;
	previousState: string;
	nextState: string;
	toolName: string | null;
	resultClass: string | null;
	recoveryAttempted: boolean;
	finalState: string | null;
	finalOutcome: string | null;
	totalDurationMs: number | null;
	createdAt: Date;
}

/**
 * Execution review result
 */
export interface ExecutionReview {
	executionId: string;
	proposalMatched: boolean;
	permissionPassed: boolean;
	toolExecuted: boolean;
	exitCodeValid: boolean;
	evidenceComplete: boolean;
	fileModificationsAllowed: boolean;
	decision: 'continue' | 'validate' | 'repair' | 'await_human' | 'fail';
	issues: string[];
	evidenceRefs: string[];
	recommendation: string;
	reviewedAt: Date;
}

/**
 * Load proposed tool calls for an execution
 */
export async function loadProposedToolCalls(traceId: string): Promise<ProposedToolCall[]> {
	const result = await pool.query(
		`SELECT id, trace_id, decision_id, query, previous_state, selected_tool_name,
		        selected_tool_namespace, candidate_tools, confidence_score,
		        approval_required, created_at
		 FROM proposed_tool_calls
		 WHERE trace_id = $1
		 ORDER BY created_at ASC`,
		[traceId]
	);

	return (result.rows || []).map((row: any) => ({
		id: row.id,
		traceId: row.trace_id,
		decisionId: row.decision_id,
		query: row.query,
		previousState: row.previous_state,
		selectedToolName: row.selected_tool_name,
		selectedToolNamespace: row.selected_tool_namespace ?? null,
		candidateTools: Array.isArray(row.candidate_tools) ? row.candidate_tools : [],
		confidenceScore: typeof row.confidence_score === 'number' ? row.confidence_score : Number(row.confidence_score ?? 0),
		approvalRequired: Boolean(row.approval_required),
		proposedAt: row.created_at,
	}));
}

/**
 * Load actual tool call events for an execution
 */
export async function loadToolCallEvents(executionId: string): Promise<ToolCallEvent[]> {
	const result = await pool.query(
		`SELECT id, trace_id, execution_id, tool_name, tool_namespace, arguments,
		        status, start_time, end_time, duration_ms, result_class, result_count,
		        source_ref_count, source_refs, error_message, from_server, event_json,
		        created_at
		 FROM tool_call_events
		 WHERE execution_id = $1
		 ORDER BY created_at ASC`,
		[executionId]
	);

	return (result.rows || []).map((row: any) => ({
		id: row.id,
		executionId: row.execution_id,
		toolName: row.tool_name,
		traceId: row.trace_id,
		toolNamespace: row.tool_namespace ?? null,
		actualParams: row.arguments ?? {},
		status: row.status,
		startedAt: row.start_time,
		completedAt: row.end_time ?? null,
		durationMs: row.duration_ms ?? null,
		resultClass: row.result_class ?? null,
		resultCount: row.result_count ?? null,
		sourceRefCount: row.source_ref_count ?? null,
		sourceRefs: Array.isArray(row.source_refs) ? row.source_refs : [],
		errorMessage: row.error_message ?? null,
		fromServer: Boolean(row.from_server),
		eventJson: row.event_json ?? null,
		error: row.error_message ?? undefined,
	}));
}

/**
 * Load outcome ledger for an execution
 */
export async function loadOutcomeLedger(executionId: string): Promise<OutcomeLedger | null> {
	const result = await pool.query(
		`SELECT id, trace_id, previous_state, next_state, tool_name, execution_id,
		        result_class, recovery_attempted, final_state, final_outcome,
		        total_duration_ms, created_at
		 FROM outcome_ledger
		 WHERE execution_id = $1
		 LIMIT 1`,
		[executionId]
	);

	if (!result.rows || result.rows.length === 0) {
		return null;
	}

	const row = result.rows[0];
	return {
		id: row.id,
		executionId: row.execution_id,
		traceId: row.trace_id,
		previousState: row.previous_state,
		nextState: row.next_state,
		toolName: row.tool_name ?? null,
		resultClass: row.result_class ?? null,
		recoveryAttempted: Boolean(row.recovery_attempted),
		finalState: row.final_state ?? null,
		finalOutcome: row.final_outcome ?? null,
		totalDurationMs: row.total_duration_ms ?? null,
		createdAt: row.created_at,
	};
}

/**
 * Core review logic: evaluate if execution matched proposal and succeeded
 */
export async function evaluateExecution(executionId: string): Promise<ExecutionReview> {
	const events = await loadToolCallEvents(executionId);
	const traceId = events[0]?.traceId ?? null;
	const proposed = traceId ? await loadProposedToolCalls(traceId) : [];
	const outcome = await loadOutcomeLedger(executionId);

	const issues: string[] = [];
	const evidenceRefs: string[] = [];

	// Gate 1: Was a tool actually executed?
	const toolExecuted = events.length > 0;
	if (!toolExecuted) {
		issues.push('No tool call events found');
	}

	// Gate 2: Did the tool name match the proposal?
	let proposalMatched = false;
	if (proposed.length > 0 && events.length > 0) {
		proposalMatched = proposed[0].selectedToolName === events[0].toolName;
		if (!proposalMatched) {
			issues.push(
				`Tool mismatch: proposed '${proposed[0].selectedToolName}' but executed '${events[0].toolName}'`
			);
		}
	}

	// Gate 3: Did the tool finish successfully?
	let exitCodeValid = false;
	if (events.length > 0) {
		const event = events[0];
		exitCodeValid = event.status === 'completed' && !event.errorMessage;
		if (!exitCodeValid) {
			issues.push(`Tool execution status: ${event.status}`);
			if (event.errorMessage) {
				issues.push(`Error: ${event.errorMessage}`);
			}
		}
	}

	// Gate 4: Is there evidence of the outcome?
	let evidenceComplete = false;
	if (outcome) {
		evidenceComplete = Boolean(outcome.finalOutcome || outcome.finalState || outcome.resultClass);

		if (events.length > 0 && events[0].sourceRefs.length > 0) {
			evidenceRefs.push(`source refs: ${events[0].sourceRefs.join(', ')}`);
		}
		if (events.length > 0 && events[0].resultClass) {
			evidenceRefs.push(`result class: ${events[0].resultClass}`);
		}
		if (!evidenceComplete) {
			issues.push('No evidence of outcome recorded');
		}
	} else {
		issues.push('No outcome ledger found');
	}

	// Gate 5: Were file modifications allowed?
	// (This would check against permission policy — stub for now)
	const fileModificationsAllowed = proposed.length > 0 ? !proposed[0].approvalRequired : true;

	// Decide next state
	let decision: ExecutionReview['decision'] = 'fail';
	let recommendation = '';

	if (!toolExecuted) {
		decision = 'fail';
		recommendation = 'Tool was not executed. Check agent logs for dispatch failures.';
	} else if (!proposalMatched) {
		decision = 'repair';
		recommendation = 'Tool name mismatch detected. Review agent proposal routing.';
	} else if (!exitCodeValid) {
		decision = 'repair';
		recommendation = 'Tool failed with non-zero exit code. Review tool output and retry.';
	} else if (!evidenceComplete) {
		decision = 'validate';
		recommendation = 'Tool completed but no evidence recorded. Manual verification needed.';
	} else if (!fileModificationsAllowed) {
		decision = 'await_human';
		recommendation = 'Tool execution matched but approval is still required for the action.';
	} else if (issues.length === 0) {
		decision = 'continue';
		recommendation = 'Execution successful. Ready to continue or transition.';
	} else {
		decision = 'await_human';
		recommendation = 'Execution completed with warnings. Awaiting human decision.';
	}

	return {
		executionId,
		proposalMatched,
		permissionPassed: fileModificationsAllowed,
		toolExecuted,
		exitCodeValid,
		evidenceComplete,
		fileModificationsAllowed,
		decision,
		issues,
		evidenceRefs,
		recommendation,
		reviewedAt: new Date(),
	};
}

/**
 * Save execution review to database
 */
export async function saveExecutionReview(review: ExecutionReview): Promise<void> {
	await pool.query(
		`INSERT INTO execution_reviews
		 (execution_id, proposal_matched, permission_passed, tool_executed, exit_code_valid,
		  evidence_complete, file_modifications_allowed, decision, issues, evidence_refs,
		  recommendation, reviewed_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		[
			review.executionId,
			review.proposalMatched,
			review.permissionPassed,
			review.toolExecuted,
			review.exitCodeValid,
			review.evidenceComplete,
			review.fileModificationsAllowed,
			review.decision,
			JSON.stringify(review.issues),
			JSON.stringify(review.evidenceRefs),
			review.recommendation,
			review.reviewedAt,
		]
	);
}

/**
 * Complete execution review cycle: evaluate and save
 */
export async function reviewAndSaveExecution(executionId: string): Promise<ExecutionReview> {
	const review = await evaluateExecution(executionId);
	await saveExecutionReview(review);
	return review;
}
