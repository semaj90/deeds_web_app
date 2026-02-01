import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { logAttachToCase } from '$lib/server/timeline-logger';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const POST: RequestHandler = async ({ request, locals }) => {
 if (!locals.user?.id) {
 return json({ error: 'Unauthorized' }, { status: 401 });
 }

 try {
 const { caseId, citation, title } = await request.json();

 if (!caseId || !citation) {
 return json({ error: 'Missing required fields' }, { status: 400 });
 }

 // Log the attachment to timeline
 await logAttachToCase(locals.user.id, caseId, citation);

 // TODO: Add statute to case file in database
 // This would typically involve:
 // 1. Creating a case_statutes junction table
 // 2. Inserting the statute reference
 // 3. Updating case metadata

 return json({
 success: true,
 message: `Attached ${ citation } to case`,
 timestamp: new Date().toISOString(),
 });
 } catch (error) {
 console.error('Attach to case error:', error);
 return json({ error: 'Failed to attach statute' }, { status: 500 });
 }
};


