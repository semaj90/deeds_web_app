import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { canvasStates } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { boardSnapshotSchema } from '$lib/schemas/board';
import { verifyCanvasStatesTable } from '$lib/server/db/verify-canvas-table';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const { id } = params; // Changed from caseId to id
    if (!id) return json({ error: 'Missing case id' }, { status: 400 });
  
    const tableExists = await verifyCanvasStatesTable();
    if (!tableExists) {
        return json({
            error: 'canvas_states table missing, run db, push: dev (or db, migrate:apply) to apply migrations',
            code: 'TABLE_MISSING'
        }, { status: 503 });
    }

    try {
        const body = await request.json();

        // Validate with Zod
        const result = boardSnapshotSchema.safeParse(body);
        if (!result.success) {
            return json({ error: 'Invalid board state', details: result.error.flatten() }, { status: 400 });
        }
        const state = result.data;

        // Upsert
        const existing = await db.query.canvasStates.findFirst({
            where: eq(canvasStates.caseId, id)
        });

        if (existing) {
            await db.update(canvasStates)
                .set({
                    canvasData: state,
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(canvasStates.caseId, id));
        } else {
            await db.insert(canvasStates).values({
                caseId: id,
                canvasData: state,
                name: 'Main Board',
                // createdBy: locals.user?.id
            });
        }

        return json({ success: true });
    } catch (e: unknown) {
        console.error('Error saving canvas:', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ params }) => {
    const { id } = params; // Changed from caseId to id
    if (!id) return json({ error: 'Missing case id' }, { status: 400 });

    try {
        const stateEntry = await db.query.canvasStates.findFirst({
            where: eq(canvasStates.caseId, id)
        });

        if (!stateEntry) return json(null);

        return json(stateEntry.canvasData);
    } catch (e: unknown) {
        console.error('Error loading canvas:', e);

        const errorMessage = e instanceof Error ? e.message : String(e);
        if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
            return json({
                error: 'canvas_states table missing; run db, push:dev to apply migrations',
                code: 'TABLE_MISSING'
            }, { status: 503 });
        }

        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};
