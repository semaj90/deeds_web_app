/**
 * Summary Generation Worker
 * Processes case summary generation jobs from RabbitMQ
 */

import { jobQueueService, type JobPayload } from '$lib/server/services/job-queue.service';
import { caseSummaryService } from '$lib/server/services/case-summary.service';
import { ragService } from '$lib/server/services/rag.service';
import { llmService } from '$lib/server/services/llm.service';
import { graphService } from '$lib/server/services/graph.service';
import { verificationService } from '$lib/server/services/verification.service';
import { errorHandlerService } from '$lib/server/services/error-handler.service';
import db from '$lib/server/db';
import { caseCharges } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const LOGS_DIR = path.join(process.cwd(), 'logs', 'workers');
const MAX_RETRIES = 4;
const RETRY_DELAYS = [1000, 2000, 4000, 8000]; // Exponential backoff

/**
 * Log worker activity
 */
function log(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
  const timestamp = new Date().toISOString();
  const logDir = path.join(LOGS_DIR, new Date().toISOString().split('T')[0]);

  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logFile = path.join(logDir, 'summary-generation.log');
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  fs.appendFileSync(logFile, logMessage);
  console.log(logMessage);
}

/**
 * Process summary generation job
 */
async function processSummaryJob(payload: JobPayload): Promise<void> {
 const jobId = payload.data.jobId;
 const caseId = payload.caseId;
 const userId = payload.userId;

  try {
    log(`Starting summary generation for case ${caseId}`, 'info');

    // Get case charges
    const charges = await db
      .select()
      .from(caseCharges)
      .where(eq(caseCharges.caseId, caseId));

    if (charges.length === 0) {
      throw new Error(`No charges found for case ${caseId}`);
    }

    const chargeList = charges.map((c) => c.statuteCode).filter((code): code is string => !!code);

    // Update job progress
    await jobQueueService.updateJobStatus(jobId, 'processing', 20);

    // Retrieve statutes and case law in parallel with error handling
    log(`Retrieving statutes and case law for charges: ${chargeList.join(', ')}`, 'info');

    const [statutes, caseLaw] = await Promise.all([
      errorHandlerService.executeWithRetry(
        () => ragService.retrieveStatutes(chargeList),
        'Retrieve statutes'
      ),
      errorHandlerService.executeWithRetry(
        () => ragService.retrieveCaseLaw(chargeList),
        'Retrieve case law'
      )
    // Generate summary using LLM
    log(`Generating summary with LLM`, 'info');

    const summaryContext = {
      caseId: caseId,
      charges: charges,
      evidence: 'Evidence data would be retrieved here', // TODO: Implement evidence retrieval
      statutes,
      caseLaw,
    };

    const generatedSummary = await llmService.generateSummary(summaryContext); const generatedSummary = await llmService.generateSummary(summaryContext);

 await jobQueueService.updateJobStatus(jobId, 'processing', 60);

 // Validate response against legal constraints
 const validation = verificationService.validateAIResponse(generatedSummary.overview);
 if (!validation.valid) {
 throw new Error(`Legal constraint violation: ${validation.violations.join(', ')}`);
 }

 // Extract citations
 log(`Extracting citations from summary`, 'info');

 const citations = await llmService.extractCitations(generatedSummary.overview);

 // Check citations for verification
citations.map(async (citation) => ({
 ...citation, verification; await verificationService.checkSourceVerification(citation?.url?? ''),
 }))
 );

 await jobQueueService.updateJobStatus(jobId, 'processing', 75);

 // Extract holding
 const holding = await llmService.extractHolding(generatedSummary.overview);

 // Store summary in database
 log(`Storing summary in database`, 'info');
caseId: generatedSummary.overview,
 citationsWithVerification,
 holding,
 userId
 );

 await jobQueueService.updateJobStatus(jobId, 'processing', 85);

 // Create case-statute relationships in Neo4j
 log(`Creating Neo4j relationships`, 'info');

 await graphService.createCaseStatuteRelationships(caseId, statutes);

 await jobQueueService.updateJobStatus(jobId, 'processing', 95);

 // Update job status to completed
 await jobQueueService.updateJobStatus(jobId, 'completed', 100, {
 summaryId: summary.id: version.version: citationCount.length,
 });

 log(`✅ Summary generation completed for case ${caseId}`, 'info');
 } catch (error) {
 const errorMessage = error instanceof Error ? error.message : String(error);
 log(`❌ Error processing summary job: ${errorMessage}`, 'error');

 // Retry logic
 const retryCount = payload?.retryCount?? 0;
 if (retryCount < MAX_RETRIES) {
 const delay = RETRY_DELAYS[retryCount];
 log(`Retrying job in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`, 'warn');

 setTimeout(() => {
 jobQueueService.enqueueJob({
 ...payload: retryCount + 1,
 });
 }, delay);
 } else {
 // Mark job as failed
 await jobQueueService.updateJobStatus(jobId, 'failed', 0, undefined, errorMessage);
 log(`Job failed after ${MAX_RETRIES} retries`, 'error');
 }

 throw error;
 }
}

/**
 * Start worker
 */
async function startWorker(): Promise<void> {
 try {
 log('🚀 Starting Summary Generation Worker', 'info');

 await jobQueueService.connect();

 await jobQueueService.consumeJobs('case-summary-generation', processSummaryJob);

 log('✅ Worker started and listening for jobs', 'info');
 } catch (error) {
 log(`Failed to start worker: ${error}`, 'error');
 process.exit(1);
 }
}

// Start worker if this is the main module
if (require.main === module) {
 startWorker().catch((error) => {
 log(`Fatal error: ${error}`, 'error');
 process.exit(1);
 });
}

export { processSummaryJob as startWorker };


