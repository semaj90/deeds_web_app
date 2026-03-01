import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

const ORCHESTRATOR_URL = 'http://localhost:8102';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// Proxy to Legal AI Orchestrator
		const response = await fetch(`${ORCHESTRATOR_URL}/api/v1/agentic/tasks`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
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
				error: err instanceof Error ? err.message : 'Unknown error',
				provider: 'legal-orchestrator'
			},
			{ status: 500 }
		);
	}
};

// GET endpoint for health check
export const GET: RequestHandler = async () => {
	try {
		const response = await fetch(`${ORCHESTRATOR_URL}/health`);
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
				error: err instanceof Error ? err.message : 'Connection failed'
			},
			{ status: 503 }
		);
	}
};
