import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const vectorStoreSchema = z.object({
  embedding: z.array(z.number()).min(1).max(2048),
  text: z.string().min(1).max(100000),
  documentId: z.string().min(1).max(500),
  metadata: z
    .object({
      wordCount: z.number().optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
});

/** POST /api/v1/vector/store — Store a vector embedding in Qdrant */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = vectorStoreSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { embedding, text, documentId, metadata } = parsed.data;

		const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');

    const { v4: uuid } = await import('uuid');
    const pointId = uuid();

    await qdrant.upsert({
      collection: 'legal_documents',
      wait: true,
      points: [
        {
          id: pointId,
          vector: embedding,
          payload: {
            text: text.slice(0, 10000),
            documentId,
            ...metadata,
            indexedAt: new Date().toISOString(),
          },
        },
      ],
    } as any);

		return json({ success: true, id: pointId });
	} catch (err) {
		console.error('[/api/v1/vector/store] error:', err);
		return json({ error: 'Vector storage failed' }, { status: 500 });
	}
};
