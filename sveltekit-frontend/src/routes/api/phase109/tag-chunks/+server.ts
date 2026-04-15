import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

/**
 * Phase 109: Auto-tag Qdrant codebase chunks via LLM
 *
 * POST /api/phase109/tag-chunks — runs LLM-based auto-tagging on untagged codebase_chunks_768 points
 * GET  /api/phase109/tag-chunks — returns tagging stats
 */

const COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 20;

const tagSchema = z.object({
	limit: z.number().int().min(1).max(500).optional().default(100),
	dryRun: z.boolean().optional().default(false),
});

const TAG_CATEGORIES = [
	'api-route', 'ui-component', 'server-util', 'db-schema', 'auth', 'ai-inference',
	'vector-search', 'cache', 'queue', 'test', 'config', 'type-definition', 'store',
	'migration', 'pipeline', 'evidence', 'legal', 'form', 'sse', 'admin',
];

/**
 * Classify a code chunk into categories via ollama
 */
async function classifyChunk(content: string): Promise<string[]> {
	const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
	const model = process.env.OLLAMA_CHAT_MODEL ?? 'gemma3-legal:latest';

	const prompt = `Classify this TypeScript/Svelte code chunk into 1-3 of these exact categories: ${TAG_CATEGORIES.join(', ')}.
Respond ONLY with comma-separated category names from the list above. Nothing else.

Code:
${content.slice(0, 800)}`;

	try {
		const res = await fetch(`${ollamaUrl}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, prompt, stream: false, options: { num_predict: 50 } }),
			signal: AbortSignal.timeout(30000),
		});
		if (!res.ok) return [];
		const data = await res.json() as { response?: string };
		const raw = data.response?.trim() ?? '';
		return raw.split(',').map((t) => t.trim().toLowerCase()).filter((t) => TAG_CATEGORIES.includes(t));
	} catch {
		return [];
	}
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const collections = await qdrant.client.getCollections();
		const found = collections.collections.find((c) => c.name === COLLECTION);

		if (!found) return json({ collection: COLLECTION, exists: false, tagged: 0, untagged: 0 });

		const info = await qdrant.client.getCollection(COLLECTION);
		return json({
			collection: COLLECTION,
			exists: true,
			totalPoints: info.points_count ?? 0,
			message: 'Use POST to start auto-tagging',
		});
	} catch (err) {
		return json({ collection: COLLECTION, exists: false, error: String(err) });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = tagSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}
	const { limit, dryRun } = parsed.data;

	try {
		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
		const client = qdrant.client;

		// Scroll untagged points (no 'tags' payload or empty tags)
		let scrollOffset: string | number | null = null;
		const toTag: Array<{ id: string | number; payload: Record<string, unknown>; content: string }> = [];

		do {
			const scrollResult = await client.scroll(COLLECTION, {
				limit: 100,
				offset: scrollOffset ?? undefined,
				with_payload: true,
				with_vector: false,
				filter: {
					must: [
						{
							is_empty: { key: 'tags' },
						},
					],
				},
			});

			for (const pt of scrollResult.points) {
				if (toTag.length >= limit) break;
				const content = (pt.payload as Record<string, unknown>)?.content as string ?? '';
				toTag.push({ id: pt.id, payload: pt.payload as Record<string, unknown>, content });
			}

			const next = scrollResult.next_page_offset;
			scrollOffset = (typeof next === 'string' || typeof next === 'number') ? next : null;
		} while (scrollOffset !== null && toTag.length < limit);

		if (toTag.length === 0) {
			return json({ tagged: 0, skipped: 0, message: 'All chunks already tagged', dryRun });
		}

		if (dryRun) {
			return json({
				dryRun: true,
				wouldTag: toTag.length,
				sample: toTag.slice(0, 3).map((p) => ({ id: p.id, preview: p.content.slice(0, 100) })),
			});
		}

		// Process in batches
		let tagged = 0;
		let failed = 0;

		for (let i = 0; i < toTag.length; i += BATCH_SIZE) {
			const batch = toTag.slice(i, i + BATCH_SIZE);

			await Promise.all(
				batch.map(async (pt) => {
					try {
						const tags = await classifyChunk(pt.content);
						if (tags.length === 0) {
							failed++;
							return;
						}
						await client.setPayload(COLLECTION, {
							payload: { tags, auto_tagged: true, tagged_at: new Date().toISOString() },
							points: [pt.id],
						});
						tagged++;
					} catch {
						failed++;
					}
				})
			);
		}

		return json({
			tagged,
			failed,
			total: toTag.length,
			message: `Tagged ${tagged}/${toTag.length} codebase chunks`,
			dryRun: false,
		});
	} catch (err) {
		console.error('[phase109/tag-chunks] Error:', err);
		return json(
			{ error: 'Auto-tagging failed', message: err instanceof Error ? err.message : String(err) },
			{ status: 500 }
		);
	}
};
