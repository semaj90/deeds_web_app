import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { canvasStates } from '$lib/server/db/schema';
import { cases } from '$lib/server/db/schema-postgres.js';
import { and, eq } from 'drizzle-orm';
import { boardSnapshotSchema } from '$lib/schemas/board';
import { verifyCanvasStatesTable } from '$lib/server/db/verify-canvas-table';
import { isUuid } from '$lib/server/validation.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = params; // Changed from caseId to id
    if (!id) return json({ error: 'Missing case id' }, { status: 400 });
    if (!isUuid(id)) return json({ error: 'Invalid case ID format' }, { status: 400 });

    const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, id), eq(cases.userId, locals.user.id)))
      .limit(1);

    if (!targetCase) return json({ error: 'Case not found' }, { status: 404 });

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
                    stateData: state,
                    updatedAt: new Date(),
                })
                .where(eq(canvasStates.caseId, id));
        } else {
            await db.insert(canvasStates).values({
                caseId: id,
                stateData: state,
                // createdBy: locals.user?.id
            });
        }

        return json({ success: true });
    } catch (e: unknown) {
        console.error('Error saving canvas:', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

export const GET: RequestHandler = async ({ params, locals, request }) => {
  const { id } = params; // Changed from caseId to id
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!id) return json({ error: 'Missing case id' }, { status: 400 });
  if (!isUuid(id)) return json({ error: 'Invalid case ID format' }, { status: 400 });

  const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, id), eq(cases.userId, locals.user.id)))
    .limit(1);

  if (!targetCase) return json({ error: 'Case not found' }, { status: 404 });

  try {
    const stateEntry = await db.query.canvasStates.findFirst({
      where: eq(canvasStates.caseId, id),
    });

    if (!stateEntry) return json(null);

    const responseData = stateEntry.stateData;
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);
    return json(responseData, { headers: { ...cacheControl.private, ETag: etag } });
  } catch (e: unknown) {
    console.error('Error loading canvas:', e);
    return json(null);
  }
};
