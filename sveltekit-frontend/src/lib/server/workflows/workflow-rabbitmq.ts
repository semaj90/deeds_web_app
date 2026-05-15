import { publishToQueue } from '$lib/server/rabbitmq.js';

export const PDF_OCR_WORKFLOW_QUEUE = 'ingest.pdf.ocr';

export interface PdfOcrWorkflowJob {
	workflowRunId: string;
	evidenceId?: string;
	fileName: string;
	mimeType: string;
	createdAt: string;
}

export async function publishPdfOcrWorkflowJob(job: PdfOcrWorkflowJob): Promise<{
	enqueued: boolean;
	transport: 'rabbitmq' | 'local-fallback';
}> {
	try {
		const enqueued = await publishToQueue(PDF_OCR_WORKFLOW_QUEUE, job);
		return {
			enqueued,
			transport: enqueued ? 'rabbitmq' : 'local-fallback',
		};
	} catch {
		return {
			enqueued: false,
			transport: 'local-fallback',
		};
	}
}
