import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getRagServiceUrl } from '$lib/config/env.server.js';
import { z } from 'zod';

const RAG_SERVICE_URL = getRagServiceUrl();

const ragEnhancedSchema = z.object({
	query: z.string().min(1).max(10000),
	mode: z.enum(['query', 'process']).optional().default('query')
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = ragEnhancedSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { query, mode } = parsed.data;

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
			body: JSON.stringify(raw)
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
				error: 'RAG query failed',
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
				error: 'Connection failed'
			},
			{ status: 503 }
		);
	}
};
