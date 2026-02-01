import { db } from '$lib/server/db';
import { canvasStates } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const load: PageServerLoad = async ({ params }) => {
    const { id } = params; // Changed from caseId to id to match [id] route

    try {
        const savedState = await db.query.canvasStates.findFirst({
            where: eq(canvasStates.caseId, id)
        });

         return {
            caseId: id, // Keep as caseId for component consistency
            initialState: savedState ? savedState.stateData : null
        };
    } catch (e) {
        console.error('Failed to load canvas state:', e);
        return {
            caseId: id,
            initialState: null
        };
    }
};
