/**
 * GET /api/ai/stats
 *
 * Returns AI dashboard statistics — active chat sessions, model info,
 * document counts, and Ollama connection status.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async () => {
	const ollamaUrl = ENV.OLLAMA_BASE_URL;
	let ollamaStatus = 'disconnected';
	let embeddingModel = 'embeddinggemma:latest';
	let llmModel = 'gemma3-legal:latest';

	// Check Ollama connectivity + discover loaded models
	try {
		const res = await fetch(`${ollamaUrl}/api/tags`, {
			signal: AbortSignal.timeout(3000)
		});
		if (res.ok) {
			ollamaStatus = 'connected';
			const data = await res.json();
			const models = (data.models ?? []) as { name: string }[];
			const names = models.map((m) => m.name);
			if (names.some((n) => n.includes('embed'))) embeddingModel = names.find((n) => n.includes('embed')) ?? embeddingModel;
			if (names.some((n) => n.includes('legal'))) llmModel = names.find((n) => n.includes('legal')) ?? llmModel;
		}
	} catch {
		ollamaStatus = 'error';
	}

	// Pull DB counts (graceful — returns 0 if DB is down)
	let activeChats = 0;
	let documentsAnalyzed = 0;
	let citationsFound = 0;
	let casesProcessed = 0;

	try {
		const { sql } = await import('drizzle-orm');
		const db = (await import('$lib/server/db')).default;

		const [chats, docs, cites, cases] = await Promise.all([
			db.execute(sql`SELECT COUNT(*)::int AS c FROM chat_metadata`).then((r) => [...r][0] as any).catch(() => ({ c: 0 })),
			db.execute(sql`SELECT COUNT(*)::int AS c FROM evidence`).then((r) => [...r][0] as any).catch(() => ({ c: 0 })),
			db.execute(sql`SELECT COUNT(*)::int AS c FROM saved_citations`).then((r) => [...r][0] as any).catch(() => ({ c: 0 })),
			db.execute(sql`SELECT COUNT(*)::int AS c FROM cases`).then((r) => [...r][0] as any).catch(() => ({ c: 0 }))
		]);
		activeChats = Number(chats?.c ?? 0);
		documentsAnalyzed = Number(docs?.c ?? 0);
		citationsFound = Number(cites?.c ?? 0);
		casesProcessed = Number(cases?.c ?? 0);
	} catch {
		// DB unavailable — return zeros
	}

	return json({
		activeChats,
		ragQueries: 0,
		documentsAnalyzed,
		citationsFound,
		casesProcessed,
		assistantSessions: activeChats,
		embeddingModel,
		llmModel,
		ollamaStatus
	});
};
