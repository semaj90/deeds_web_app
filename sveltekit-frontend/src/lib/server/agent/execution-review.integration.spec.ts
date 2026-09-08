// @vitest-environment node
//
// Live (non-mocked) runtime proof for the "Validation receipts / proof gates" cluster in
// openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md's "Repository-first search
// inventory".
//
// Was originally a characterization test of two schema-drift bugs found 2026-09-08:
//  1. tool_call_events was missing 12 columns loadToolCallEvents() queries (execution_id,
//     tool_namespace, status, start_time, end_time, duration_ms, result_class, result_count,
//     source_ref_count, source_refs, from_server, event_json) -- fixed by
//     drizzle/manual/20260908_tool_call_events_execution_columns.sql.
//  2. execution_reviews was missing the evidence_refs column saveExecutionReview() writes --
//     fixed by drizzle/manual/20260908_execution_reviews_evidence_refs.sql.
// Both migrations were applied to the live database 2026-09-08 (additive only, zero data loss --
// the pre-existing 120 tool_call_events rows and the other writer,
// src/lib/server/telemetry/tool-call-recorder.ts, are untouched). This now asserts the fixed,
// working behavior instead of the prior bug.
//
// Opt-in only via RUN_DB_INTEGRATION=1.

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const describeIf = RUN_DB_INTEGRATION ? describe : describe.skip;

describeIf('reviewAndSaveExecution (live Postgres, schema-drift fixed 2026-09-08)', () => {
	it('evaluates a non-existent execution, persists the review, and returns a well-formed degraded result', async () => {
		const { reviewAndSaveExecution } = await import('./execution-review.js');
		const executionId = randomUUID();

		const review = await reviewAndSaveExecution(executionId);

		expect(review.executionId).toBe(executionId);
		expect(review.toolExecuted).toBe(false);
		expect(review.decision).toBe('fail');
		expect(review.issues).toContain('No tool call events found');
		expect(Array.isArray(review.evidenceRefs)).toBe(true);

		const { pool } = await import('$lib/server/db/client.js');
		const { rows } = await pool.query('SELECT execution_id, decision FROM execution_reviews WHERE execution_id = $1', [
			executionId,
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0].decision).toBe('fail');
	});
});
