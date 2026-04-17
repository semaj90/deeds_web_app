/**
 * POST /api/tools/batch
 *
 * Execute up to 10 tool calls in a single request via gRPC
 * ToolCallingService.ExecuteToolBatch.  Set parallel=true to run all calls
 * concurrently (default false = sequential).
 *
 * Body: {
 *   calls:    ToolCallRequest[]  — 1-10 items
 *   parallel: boolean            — default false
 *   timeoutMs?: number           — default 60 000
 * }
 *
 * Response: { results: ToolCallResponse[], totalDurationMs: number }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getToolCallingClient } from '$lib/server/grpc/tool-calling-client.js';

// ── Input schema ──────────────────────────────────────────────────────────────

const callSchema = z.object({
	requestId:           z.string().max(128).optional(),
	toolName:            z.string().min(1).max(128),
	arguments:           z.record(z.string(), z.string()),
	caseId:              z.string().uuid().optional(),
	userId:              z.string().max(128).optional(),
	retrievalConfidence: z.number().min(0).max(1).optional(),
	message:             z.string().max(4096).optional(),
});

const schema = z.object({
	calls:     z.array(callSchema).min(1).max(10),
	parallel:  z.boolean().default(false),
	timeoutMs: z.number().int().min(1000).max(300_000).optional(),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { calls, parallel, timeoutMs = 60_000 } = parsed.data;
	const userId = String(locals.user.id);

	const hydratedCalls = calls.map((c) => ({
		...c,
		requestId: c.requestId ?? randomUUID(),
		userId:    c.userId    ?? userId,
	}));

	const client = getToolCallingClient();
	const result = await client.executeBatch({ calls: hydratedCalls, parallel }, timeoutMs);
	return json(result);
};
