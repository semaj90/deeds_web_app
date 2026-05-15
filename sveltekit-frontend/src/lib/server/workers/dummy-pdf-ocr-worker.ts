import { consumeFromQueue } from '$lib/server/rabbitmq.js';
import {
	completePdfOcrWorkflowRun,
} from '$lib/server/workflows/pdf-ocr-workflow.js';
import {
	PDF_OCR_WORKFLOW_QUEUE,
	type PdfOcrWorkflowJob,
} from '$lib/server/workflows/workflow-rabbitmq.js';

export async function startDummyPdfOcrWorker(): Promise<void> {
	try {
		await consumeFromQueue(PDF_OCR_WORKFLOW_QUEUE, async (payload) => {
			const job = payload as PdfOcrWorkflowJob | undefined;
			if (!job?.workflowRunId) {
				throw new Error('Missing workflowRunId');
			}

			await completePdfOcrWorkflowRun(
				job.workflowRunId,
				`Dummy PDF OCR worker completed ${job.fileName}`,
			);
		});
		console.log('[Workflow] Dummy PDF OCR worker active');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[Workflow] Dummy PDF OCR worker unavailable:', message);
	}
}
