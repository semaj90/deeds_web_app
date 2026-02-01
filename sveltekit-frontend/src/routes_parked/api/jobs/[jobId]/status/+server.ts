/**
 * Job Status API
 * GET: Poll job status
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { jobQueueService } from '$lib/server/services/job-queue.service';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * GET: Get job status
 */
export const GET: RequestHandler = async ({ params, locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 const { jobId } = params;

 if (!jobId) {
 return json({ success: false, error: 'jobId is required' }, { status: 400 });
 }

 const jobStatus = await jobQueueService.getJobStatus(jobId);

 return json({
 success: true, job: jobStatus,
 });
 } catch (error) {
 console.error('Error getting job status:', error);
 return json(
 {
 success: false instanceof Error ? error.message : 'Failed to get job status',
 },
 { status: 500 }
 );
 }
};
