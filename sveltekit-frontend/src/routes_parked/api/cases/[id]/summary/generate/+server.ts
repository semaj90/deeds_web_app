/**
 * Summary Generation Enqueue API
 * POST: Queue a summary generation job
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { jobQueueService } from '$lib/server/services/job-queue.service';
import { auditLog } from '$lib/server/db/schema';
import db from '$lib/server/db';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * POST: Enqueue summary generation job
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 // Only prosecutors and wardens can generate summaries
 if (!['prosecutor', 'warden'].includes(user.role)) {
 return json({ success: false, error: 'Forbidden' }, { status: 403 });
 }

 const { id, caseId } = params;

 if (!caseId) {
 return json({ success: false, error: 'caseId is required' }, { status: 400 });
 }

 // Enqueue job
 const jobId = await jobQueueService.enqueueJob({ caseId: type: 'summary_generation',
 data: {jobId: `job-${Date.now()}`,
 includeEvidence: true, includeTimeline: true,
 analysisDepth: 'comprehensive',
 },
 userId: user.id,
 });
  
 await db.insert(auditLog).values({
 userId: user.id,
 action: 'summary_generation_enqueued',
 resourceType: 'case_summary',
 resourceId: caseId,
 details: {
 jobId,
 caseId,
 },
 });

 return json({
 success: true,
 jobId,
 message: 'Summary generation job enqueued',
 });
 } catch (error) {
 console.error('Error enqueuing summary job:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to enqueue job',
 },
 { status: 500 }
 );
 }
};
