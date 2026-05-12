/**
 * RG-Atlas Search API Route
 * POST /api/rg-atlas/search
 */

import { json } from '@sveltejs/kit';
import { runRgSearchAtlas } from '$lib/server/rg-atlas/run.js';
import { rgSearchAtlasOptionsSchema } from '$lib/server/rg-atlas/types.js';

export async function POST({ request, locals }) {
    if (!locals.user) {
        return json({ error: 'Unauthorized', processed: 0, qdrantWrites: 0 }, { status: 401 });
    }

    try {
        const body = await request.json();
        const validated = rgSearchAtlasOptionsSchema.safeParse(body);
        
        if (!validated.success) {
            return json({ 
                error: 'Invalid request body', 
                details: validated.error.format(),
                processed: 0,
                qdrantWrites: 0 
            }, { status: 400 });
        }

        const result = await runRgSearchAtlas({
            ...validated.data,
            userId: Number(locals.user.id)
        });

        return json(result);
    } catch (err) {
        console.error('[rg-atlas-api] Error:', err);
        return json({ 
            error: 'Internal Server Error', 
            details: (err as Error).message,
            processed: 0,
            qdrantWrites: 0 
        }, { status: 500 });
    }
}
