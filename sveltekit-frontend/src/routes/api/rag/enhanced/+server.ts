import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

const RAG_SERVICE_URL = 'http://localhost:8103';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { query, mode = 'query' } = body;

		// Determine endpoint based on mode
		const endpoint = mode === 'process'
			? '/api/v1/rag/process-document'
			: '/api/v1/rag/query';

		// Proxy to Enhanced RAG Service (SIMD JSON Parser)
		const response = await fetch(`${RAG_SERVICE_URL}${endpoint}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			throw new Error(`RAG service error: ${response.statusText}`);
		}

		const data = await response.json();

		return json({
			success: true,
			data,
			provider: 'enhanced-rag-simd',
			mode,
			timestamp: Date.now()
		});
	} catch (err) {
		console.error('[API] Enhanced RAG error:', err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Unknown error',
				provider: 'enhanced-rag-simd'
			},
			{ status: 500 }
		);
	}
};

// GET endpoint for stats
export const GET: RequestHandler = async () => {
	try {
		const [healthRes, statsRes] = await Promise.all([
			fetch(`${RAG_SERVICE_URL}/health`),
			fetch(`${RAG_SERVICE_URL}/api/v1/rag/stats`)
		]);

		const health = await healthRes.json();
		const stats = await statsRes.json();

		return json({
			status: 'healthy',
			service: 'enhanced-rag-simd',
			port: 8103,
			health,
			stats,
			timestamp: Date.now()
		});
	} catch (err) {
		return json(
			{
				status: 'unhealthy',
				service: 'enhanced-rag-simd',
				error: err instanceof Error ? err.message : 'Connection failed'
			},
			{ status: 503 }
		);
	}
};
