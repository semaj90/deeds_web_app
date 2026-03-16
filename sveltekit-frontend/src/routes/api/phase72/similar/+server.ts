import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const phase72SimilarSchema = z.object({
	error_hash: z.string().max(500).optional(),
	similar_errors: z.array(z.object({
		error_code: z.string().optional(),
		message: z.string().optional(),
		file_path: z.string().optional()
	})).max(100).optional().default([]),
	context: z.string().max(5000).optional()
});

/**
 * GET /api/phase72/similar?hash=<error_hash>&limit=5
 * Find errors similar to the given error (same code, related file paths).
 */
export const GET: RequestHandler = async ({ url }) => {
	const hash = url.searchParams.get('hash');
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);

	if (!hash) {
		return json({ success: false, error: 'Missing "hash" parameter' }, { status: 400 });
	}

	try {
		// Get the source error
		const sourceResult = await db.execute(sql`
			SELECT id, error_hash, code, file_path, message, severity
			FROM phase72_error
			WHERE error_hash = ${hash}
			LIMIT 1
		`);
		const source = ((sourceResult as any).rows ?? sourceResult ?? [])[0];
		if (!source) {
			return json({ success: false, error: 'Error not found' }, { status: 404 });
		}

		// Find similar errors: same code OR same file directory
		const dirPath = source.file_path?.split('/').slice(0, -1).join('/') || '';
		const similarResult = await db.execute(sql`
			SELECT
				id,
				error_hash,
				code AS error_code,
				file_path,
				COALESCE(line, 0) AS line_num,
				COALESCE("column", 0) AS column_num,
				message,
				COALESCE(severity, 'error') AS severity,
				COALESCE(updated_at, created_at) AS last_seen,
				CASE
					WHEN code = ${source.code} AND file_path LIKE ${dirPath + '%'} THEN 0.95
					WHEN code = ${source.code} THEN 0.80
					WHEN file_path LIKE ${dirPath + '%'} THEN 0.60
					ELSE 0.40
				END AS similarity_score
			FROM phase72_error
			WHERE error_hash != ${hash}
				AND (code = ${source.code} OR file_path LIKE ${dirPath + '%'})
			ORDER BY similarity_score DESC, updated_at DESC NULLS LAST
			LIMIT ${limit}
		`);

		const similarErrors = (similarResult as any).rows ?? similarResult ?? [];

		// Try to get cluster summary if phase72_cluster tables exist
		let clusterSummary = null;
		try {
			const clusterResult = await db.execute(sql`
				SELECT cs.summary_text AS summary
				FROM phase72_cluster_summary cs
				JOIN phase72_cluster c ON cs.cluster_id = c.id
				WHERE c.label LIKE ${'%' + source.code + '%'}
				ORDER BY cs.created_at DESC
				LIMIT 1
			`);
			const row = ((clusterResult as any).rows ?? clusterResult ?? [])[0];
			if (row) {
				clusterSummary = { summary: row.summary, suggested_fixes: null };
			}
		} catch {
			// Cluster tables don't exist — skip
		}

		return json({
			success: true,
			similar_errors: similarErrors,
			cluster_summary: clusterSummary,
			source_error: { code: source.code, file_path: source.file_path, message: source.message },
		});
	} catch (err) {
		console.warn('[phase72/similar] Query failed:', (err as Error).message);
		return json({ success: true, similar_errors: [], cluster_summary: null });
	}
};

/**
 * POST /api/phase72/similar
 * Stream AI fix suggestion via Ollama for a given error + similar errors context.
 * Returns SSE stream with { text } chunks.
 */
export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.json();
	const parsed = phase72SimilarSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { error_hash, similar_errors, context } = parsed.data;

	// Build prompt from error context
	let prompt = 'You are a TypeScript/Svelte expert. Analyze this error and suggest a concise fix.\n\n';
	if (context) prompt += `Context: ${context}\n\n`;

	// Get original error details
	try {
		const sourceResult = await db.execute(sql`
			SELECT code, file_path, message, severity, COALESCE(line, 0) AS line_num
			FROM phase72_error WHERE error_hash = ${error_hash} LIMIT 1
		`);
		const source = ((sourceResult as any).rows ?? sourceResult ?? [])[0];
		if (source) {
			prompt += `**Error:** ${source.code} at ${source.file_path}:${source.line_num}\n`;
			prompt += `**Message:** ${source.message}\n`;
			prompt += `**Severity:** ${source.severity}\n\n`;
		}
	} catch { /* DB unavailable */ }

	if (similar_errors.length > 0) {
		prompt += `**Similar errors (${similar_errors.length}):**\n`;
		for (const se of similar_errors.slice(0, 3)) {
			prompt += `- ${se.error_code}: ${se.message} (${se.file_path})\n`;
		}
		prompt += '\n';
	}

	prompt += 'Provide a brief analysis and actionable fix. Use markdown formatting.';

	// Stream from Ollama
	try {
		const ollamaRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'gemma3-legal:latest', prompt, stream: true }),
			signal: AbortSignal.timeout(30_000),
		});

		if (!ollamaRes.ok || !ollamaRes.body) {
			return new Response(
				`data: ${JSON.stringify({ text: 'Ollama unavailable. Check that gemma3-legal is running.' })}\n\n`,
				{ headers: { 'Content-Type': 'text/event-stream' } }
			);
		}

		const reader = ollamaRes.body.getReader();
		const decoder = new TextDecoder();

		const stream = new ReadableStream({
			async pull(controller) {
				const { done, value } = await reader.read();
				if (done) { controller.close(); return; }

				const text = decoder.decode(value);
				for (const line of text.split('\n')) {
					if (!line.trim()) continue;
					try {
						const parsed = JSON.parse(line);
						if (parsed.response) {
							controller.enqueue(
								new TextEncoder().encode(`data: ${JSON.stringify({ text: parsed.response })}\n\n`)
							);
						}
					} catch { /* skip malformed */ }
				}
			},
		});

		return new Response(stream, {
			headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
		});
	} catch (err) {
		return new Response(
			`data: ${JSON.stringify({ text: `Error: ${(err as Error).message}` })}\n\n`,
			{ headers: { 'Content-Type': 'text/event-stream' } }
		);
	}
};
