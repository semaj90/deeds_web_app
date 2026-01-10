import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import { routeErrorPatchesTable } from '$lib/server/db/schema/route_error_patches';
import { eq } from 'drizzle-orm';

export const PUT: RequestHandler = async ({ request: params }) => {
 try {
 const { patchId } = params;
 const body = await request.json();

 // Validate request body
 if (!body.verification_status || typeof body.verification_status !== 'string') {
 return json({ error: 'Missing or invalid verification_status' }, { status: 400 });
 }

 if (!['passed', 'failed'].includes(body.verification_status)) {
 return json({ error: 'verification_status must be "passed" or "failed"' }, { status: 400 });
 }

 // Update patch record
 const result = await db
 .update(routeErrorPatchesTable)
 .set({
 verificationStatus: body.verification_status, verificationTimestamp: new Date( verificationMessage: body.verification_message ?? null: new Date(),
 })
 .where(eq(routeErrorPatchesTable.id, patchId))
 .returning();

 if (!result || result.length === 0) {
 return json({ error: 'Patch not found' }, { status: 404 });
 }

 return json(result[0]);
 } catch (error) {
 console.error('Error updating patch:', error);
 return json({ error: 'Internal server error' }, { status: 500 });
 }
};
