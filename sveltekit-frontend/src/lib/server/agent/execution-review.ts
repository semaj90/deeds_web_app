/**
 * Execution Review and Validation
 *
 * Pairs proposed tool calls with their actual execution events and outcomes.
 * Core piece of the agent feedback loop: ensures every action is validated
 * before state transition.
 *
 * Pattern: proposal → permission → execution → observation → evaluation → next decision
 */

import { z } from 'zod';
import { pool } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

/**
 * Proposed tool call (what Gemma4 wanted to do)
 */
export interface ProposedToolCall {
	id: string;
	executionId: string;
	toolName: string;
	toolParams: Record<string, unknown>;
	proposedAt: Date;
}

/**
 * Actual tool call event (what actually happened)
 */
export interface ToolCallEvent {
	id: string;
	executionId: string;
	toolName: string;
	actualParams: Record<string, unknown>;
	exitCode: number;
	stdout: string;
	stderr: string;
	startedAt: Date;
	completedAt: Date;
	error?: string;
}

/**
 * Outcome ledger (what changed in the system)
 */
export interface OutcomeLedger {
	id: string;
	executionId: string;
	filesModified: string[];
	filesCreated: string[];
	filesDeleted: string[];
	databaseChanges: Record<string, unknown>;
	evidence: Record<string, unknown>;
	timestamp: Date;
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
export async function loadProposedToolCalls(executionId: string): Promise<ProposedToolCall[]> {
	const result = await pool.query(
		`SELECT id, execution_id, tool_name, tool_params, proposed_at
		 FROM proposed_tool_calls
		 WHERE execution_id = $1
		 ORDER BY proposed_at ASC`,
		[executionId]
	);

	return (result.rows || []).map((row: any) => ({
		id: row.id,
		executionId: row.execution_id,
		toolName: row.tool_name,
		toolParams: row.tool_params,
		proposedAt: row.proposed_at,
	}));
}

/**
 * Load actual tool call events for an execution
 */
export async function loadToolCallEvents(executionId: string): Promise<ToolCallEvent[]> {
	const result = await pool.query(
		`SELECT id, execution_id, tool_name, actual_params, exit_code, stdout, stderr,
		        started_at, completed_at, error
		 FROM tool_call_events
		 WHERE execution_id = $1
		 ORDER BY started_at ASC`,
		[executionId]
	);

	return (result.rows || []).map((row: any) => ({
		id: row.id,
		executionId: row.execution_id,
		toolName: row.tool_name,
		actualParams: row.actual_params,
		exitCode: row.exit_code,
		stdout: row.stdout,
		stderr: row.stderr,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		error: row.error,
	}));
}

/**
 * Load outcome ledger for an execution
 */
export async function loadOutcomeLedger(executionId: string): Promise<OutcomeLedger | null> {
	const result = await pool.query(
		`SELECT id, execution_id, files_modified, files_created, files_deleted,
		        database_changes, evidence, timestamp
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
		filesModified: row.files_modified || [],
		filesCreated: row.files_created || [],
		filesDeleted: row.files_deleted || [],
		databaseChanges: row.database_changes || {},
		evidence: row.evidence || {},
		timestamp: row.timestamp,
	};
}

/**
 * Core review logic: evaluate if execution matched proposal and succeeded
 */
export async function evaluateExecution(executionId: string): Promise<ExecutionReview> {
	const proposed = await loadProposedToolCalls(executionId);
	const events = await loadToolCallEvents(executionId);
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
		proposalMatched = proposed[0].toolName === events[0].toolName;
		if (!proposalMatched) {
			issues.push(
				`Tool mismatch: proposed '${proposed[0].toolName}' but executed '${events[0].toolName}'`
			);
		}
	}

	// Gate 3: Did the tool exit successfully?
	let exitCodeValid = false;
	if (events.length > 0) {
		const event = events[0];
		exitCodeValid = event.exitCode === 0;
		if (!exitCodeValid) {
			issues.push(`Tool exited with code ${event.exitCode}`);
			if (event.error) {
				issues.push(`Error: ${event.error}`);
			}
			if (event.stderr) {
				issues.push(`stderr: ${event.stderr.substring(0, 200)}`);
			}
		}
	}

	// Gate 4: Is there evidence of the outcome?
	let evidenceComplete = false;
	if (outcome) {
		// Evidence is "complete" if at least one change was recorded
		evidenceComplete =
			outcome.filesModified.length > 0 ||
			outcome.filesCreated.length > 0 ||
			outcome.filesDeleted.length > 0 ||
			Object.keys(outcome.databaseChanges).length > 0 ||
			Object.keys(outcome.evidence).length > 0;

		if (evidenceComplete) {
			if (outcome.filesModified.length > 0) {
				evidenceRefs.push(`files modified: ${outcome.filesModified.join(', ')}`);
			}
			if (outcome.filesCreated.length > 0) {
				evidenceRefs.push(`files created: ${outcome.filesCreated.join(', ')}`);
			}
			if (outcome.filesDeleted.length > 0) {
				evidenceRefs.push(`files deleted: ${outcome.filesDeleted.join(', ')}`);
			}
		} else {
			issues.push('No evidence of outcome recorded');
		}
	} else {
		issues.push('No outcome ledger found');
	}

	// Gate 5: Were file modifications allowed?
	// (This would check against permission policy — stub for now)
	const fileModificationsAllowed = true; // TODO: check against permission policy

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
