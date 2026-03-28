import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { getOrchestratorUrl } from '$lib/config/env.server.js';

const ORCHESTRATOR_URL = getOrchestratorUrl();

const orchestratorTaskSchema = z.object({}).passthrough();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = orchestratorTaskSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 });
		}
		const body = parsed.data;

		// Proxy to Legal AI Orchestrator
		const response = await fetch(`${ORCHESTRATOR_URL}/api/v1/agentic/tasks`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(30_000)
		});

		if (!response.ok) {
			throw new Error(`Orchestrator error: ${response.statusText}`);
		}

		const data = await response.json();

		return json({
			success: true,
			data,
			provider: 'legal-orchestrator',
			timestamp: Date.now()
		});
	} catch (err) {
		console.error('[API] Legal Orchestrator error:', err);
		return json(
			{
				success: false,
				error: 'Analysis failed',
				provider: 'legal-orchestrator'
			},
			{ status: 500 }
		);
	}
};

// GET endpoint for health check
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const response = await fetch(`${ORCHESTRATOR_URL}/health`, { signal: AbortSignal.timeout(5_000) });
		const data = await response.json();

		return json({
			status: 'healthy',
			service: 'legal-ai-orchestrator',
			port: 8102,
			capabilities: data,
			timestamp: Date.now()
		});
	} catch (err) {
		return json(
			{
				status: 'unhealthy',
				service: 'legal-ai-orchestrator',
				error: 'Connection failed'
			},
			{ status: 503 }
		);
	}
};
