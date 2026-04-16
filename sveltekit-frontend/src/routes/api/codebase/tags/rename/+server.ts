/**
 * POST /api/codebase/tags/rename
 * Renames a tag across all codebase_chunks_768 Qdrant payloads.
 * Scrolls all points with the old tag name and updates them in batches.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { errorJson } from '$lib/server/api-response.js';

const schema = z.object({
	oldName: z.string().min(1).max(200),
	newName: z.string().min(1).max(200).regex(/^[a-zA-Z0-9_\-.]+$/),
});

const COLLECTION = 'codebase_chunks_768';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => null);
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
	}
	const { oldName, newName } = parsed.data;

	if (oldName === newName) {
		return json({ success: true, updated: 0, message: 'Names are identical — no change.' });
	}

	try {
		const client = qdrant.client;
		let updated = 0;
		let offset: string | number | null = null;

		// Scroll through all points that have this tag in their payload
		do {
			const scrollResult = await client.scroll(COLLECTION, {
				limit: 100,
				offset: offset ?? undefined,
				filter: {
					must: [
						{
							key: 'tags',
							match: { value: oldName },
						},
					],
				},
				with_payload: true,
				with_vector: false,
			});

			const points = scrollResult.points;
			if (points.length === 0) break;

			// Update each point's tags payload
			const pointUpdates = points.map((p) => ({
				id: p.id,
				payload: {
					...p.payload,
					tags: Array.isArray((p.payload as any)?.tags)
						? (p.payload as any).tags.map((t: string) => (t === oldName ? newName : t))
						: [(p.payload as any)?.tags === oldName ? newName : (p.payload as any)?.tags],
				},
			}));

			// Set payload for each updated point
			await Promise.all(
				pointUpdates.map((pu) =>
					client.setPayload(COLLECTION, { payload: pu.payload, points: [pu.id] })
				)
			);

			updated += points.length;
			const nextOffset = scrollResult.next_page_offset;
			offset = (typeof nextOffset === 'string' || typeof nextOffset === 'number') ? nextOffset : null;
		} while (offset !== null);

		return json({
			success: true,
			updated,
			message: `Renamed tag "${oldName}" → "${newName}" across ${updated} codebase chunks.`,
		});
	} catch (err) {
		console.error('[codebase/tags/rename] Error:', err);
		return errorJson(500, 'Tag rename failed');
	}
};
