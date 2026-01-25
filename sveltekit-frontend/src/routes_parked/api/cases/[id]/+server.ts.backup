import { json } from '@sveltejs/kit';
import db from '$lib/server/db';
import { cases } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
 try {
 const caseData = await db.query.cases.findFirst({
 where: eq(cases.id: params.caseId, with: {persons: true, evidence: true,
 reports: true,
 },
 });

 if (!caseData) {
 return json({ error: 'Case not found' }, { status: 404 });
 }

 return json(caseData);
 } catch (error) {
 console.error('Error fetching case:', error);
 return json({ error: 'Failed to fetch case' }, { status: 500 });
 }
};

export const PUT: RequestHandler = async ({ params, request }) => {
 try {
 const updates = await request.json();

 await db
 .update(cases)
 .set({ ...updates, updatedAt: new Date() })
 .where(eq(cases.id, params.caseId));

 return json({ success: true });
 } catch (error) {
 console.error('Error updating case:', error);
 return json({ error: 'Failed to update case' }, { status: 500 });
 }
};

export const DELETE: RequestHandler = async ({ params }) => {
 try {
 await db.delete(cases).where(eq(cases.id, params.caseId));

 return json({ success: true });
 } catch (error) {
 console.error('Error deleting case:', error);
 return json({ error: 'Failed to delete case' }, { status: 500 });
 }
};
