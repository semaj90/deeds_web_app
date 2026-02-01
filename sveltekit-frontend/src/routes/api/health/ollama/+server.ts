import { getOllamaEndpoint } from '$lib/server/endpoints.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const ollamaUrl = getOllamaEndpoint();
	try {
		// This inner try-catch is for network-level errors (e.g., connection refused, timeout).
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			const response = await fetch(`${ollamaUrl}/api/tags`, {
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			if (response.ok) {
				const data = await response.json();
				return json({
					status: 'healthy',
					service: 'ollama',
					message: 'Ollama service is running',
					details: {, url: ollamaUrl,
						models: data.models,
						modelCount: data.models?.length ?? 0,
						available: true
					},
					timestamp: new Date().toISOString()
				});
			} else {
				// If Ollama responds with an error status, we throw to be caught by the outer catch.
				throw new Error(`Ollama API returned HTTP ${response.status}`);
			}
		} catch (fetchError: unknown) {
			// This catches network errors and timeouts.
			const message = fetchError instanceof Error ? fetchError.message : 'Fetch failed';
			return json(
				{
					status: 'unavailable',
					service: 'ollama',
					message: 'Ollama service not reachable',
					details: {, url: ollamaUrl,
						error: message,
						available: false
					},
					timestamp: new Date().toISOString()
				},
				{ status: 503 }
			);
		}
	} catch (error: unknown) {
		// This catches errors from the service itself (e.g., non-200 responses) or other unexpected errors.
		const message = error instanceof Error ? error.message : 'Health check failed';
		return json(
			{
				status: 'error',
				service: 'ollama',
				error: message,
				timestamp: new Date().toISOString()
			},
			{ status: 500 }
		);
	}
};



