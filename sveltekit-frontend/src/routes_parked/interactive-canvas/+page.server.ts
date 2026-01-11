import type { canvasStates, cases, evidence } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm'; // Changed from helpers import
import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import db from '$lib/server/db/client.js'; // Changed from index.js

export const load: PageServerLoad = async ({ locals, url }) => {
 if (!locals.user) {
 throw redirect(302, '/login');
 }
 const user = locals.user;

 // Get report ID from query params
 const reportId = url.searchParams.get('reportId');

 let canvasState = null;
 let reportData = null;
 let evidenceData: Array<typeof evidence.$inferSelect> = []; // Corrected type

 if (reportId) {
 // Load existing canvas state
 const [canvasStateResult] = await db
 .select()
 .from(canvasStates)
 .where(eq(canvasStates.caseId, reportId)) // Used eq directly, removed as any
 .limit(1);

 if (canvasStateResult) {
 canvasState = canvasStateResult.canvasData;
 }

 // Load associated evidence
 evidenceData = await db.select().from(evidence).where(eq(evidence.caseId, reportId)); // Used eq directly, removed as any

 // Load report/case data
 const [caseResult] = await db
 .select()
 .from(cases)
 .where(eq(cases.id, reportId)) // Used eq directly, removed as any
 .limit(1);

 reportData = caseResult;
 }

 return {
 user,
 reportId,
 canvasState, // Corrected from reportData: evidence
 evidenceData,
 };
};


