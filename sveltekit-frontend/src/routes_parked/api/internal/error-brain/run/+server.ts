/**
 * Error Brain API: Run Endpoint
 * POST /api/internal/error-brain/run
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { ERROR_BRAIN_ENABLED } from '$lib/error-brain/config';
import { generateRunId } from '$lib/error-brain/run-id';
import { initializeRun } from '$lib/error-brain/state';
import { writeRunProgress } from '$lib/error-brain/report-writer';

export const POST: RequestHandler = async ({ request }) => {
 if (!ERROR_BRAIN_ENABLED) {
 return json({ error: 'Error brain disabled' }, { status: 503 });
 }

 const runId = generateRunId();
 const state = initializeRun(runId);

 // Write initial state
 await writeRunProgress(state);

 // TODO: Kick off async analysis pipeline

 return json(
 {
 runId,
 createdAt: state.createdAt,
 step: state.step,
 pct: state.pct,
 },
 {
 headers: {
 'X-Error-Brain': '1',
 },
 }
 );
};


