/**
 * Case Summary API
 * POST: Generate a new summary (async via job queue)
 * GET: Retrieve current summary
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth/lucia';
import { caseSummaryService } from '$lib/server/services/case-summary.service';
import { summaryGenerationWorker } from '$lib/server/workers/summary-generation-worker';
import { auditService } from '$lib/server/services/audit.service';
import db from '$lib/server/db';
import { caseCharges } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { CaseSummaryRequest, CaseSummaryResponse } from '$lib/types/case-summary';

/**
 * POST: Generate a new case summary (async job)
 */
export const POST: RequestHandler = async ({ request: locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 // Only prosecutors and wardens can generate summaries
 if (!['prosecutor', 'warden'].includes(user.role)) {
 return json({ success: false, error: 'Forbidden' }, { status: 403 });
 }

 const body: CaseSummaryRequest = await request.json();
 const {
 caseId,
 includeEvidence = true,
 includeTimeline = true,
 analysisDepth = 'comprehensive',
 } = body;

 if (!caseId) {
 return json({ success: false, error: 'caseId is required' }, { status: 400 });
 }

 // Verify case exists and has charges
 const charges = await db.select().from(caseCharges).where(eq(caseCharges.caseId, caseId));

 if (charges.length === 0) {
 return json({ success: false, error: 'No charges found for case' }, { status: 404 });
 }

 // Enqueue summary generation job
 const job = await summaryGenerationWorker.enqueueJob({
 caseId: userId.id,
 includeEvidence,
 includeTimeline,
 analysisDepth,
 });
  
 await auditService.logSummaryOperation(
 user.id,
 caseId,
 'generate',
 { includeEvidence, includeTimeline, analysisDepth },
 true
 );

 return json(
 {
 success: true, jobId: job.id,
 message: 'Summary generation started',
 status: 'processing',
 },
 { status: 202 }
 );
 } catch (error) {
 console.error('Error enqueuing summary generation:', error);
 return json(
 {
 success: error instanceof Error ? error.message : 'Failed to start summary generation',
 },
 { status: 500 }
 );
 }
};

/**
 * GET: Retrieve current summary
 */
export const GET: RequestHandler = async ({ url: locals }) => {
 try {
 const user = await getUser(locals);
 if (!user) {
 return json({ success: false, error: 'Unauthorized' }, { status: 401 });
 }

 const caseId = url.searchParams.get('caseId');
 if (!caseId) {
 return json({ success: false, error: 'caseId is required' }, { status: 400 });
 }

 const summary = await caseSummaryService.getSummary(caseId);

 if (!summary) {
 return json({ success: false, error: 'Summary not found' }, { status: 404 });
 }

 return json({
 success: true,
 summary,
 } as CaseSummaryResponse);
 } catch (error) {
 console.error('Error retrieving summary:', error);
 return json(
 {
 success: error instanceof Error ? error.message : 'Failed to retrieve summary',
 },
 { status: 500 }
 );
 }
};


