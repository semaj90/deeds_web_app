import { describe, expect, it } from 'vitest';
import {
	completePdfOcrWorkflowRun,
	getLatestPdfOcrWorkflowByEvidenceId,
	getPdfOcrWorkflowRun,
	listPdfOcrWorkflowRuns,
	registerPdfOcrWorkflowRun,
} from './pdf-ocr-workflow.js';

describe('pdf ocr workflow', () => {
	it('fails open when rabbitmq is unavailable', async () => {
		const run = await registerPdfOcrWorkflowRun(
			{
				workflowRunId: 'workflow-test-fallback',
				evidenceId: 'evidence-fallback',
				fileName: 'brief.pdf',
				mimeType: 'application/pdf',
			},
			async () => ({ enqueued: false, transport: 'local-fallback' }),
		);

		expect(run.status).toBe('completed');
		expect(run.transport).toBe('local-fallback');
		expect(run.progress).toBe(100);
		expect(getPdfOcrWorkflowRun('workflow-test-fallback')?.message).toContain('RabbitMQ unavailable');
	});

	it('tracks completed runs and evidence lookup', async () => {
		await registerPdfOcrWorkflowRun(
			{
				workflowRunId: 'workflow-test-queue',
				evidenceId: 'evidence-queue',
				fileName: 'motion.pdf',
				mimeType: 'application/pdf',
			},
			async () => ({ enqueued: true, transport: 'rabbitmq' }),
		);

		const completed = await completePdfOcrWorkflowRun(
			'workflow-test-queue',
			'Dummy PDF OCR worker completed motion.pdf',
		);

		expect(completed?.status).toBe('completed');
		expect(getLatestPdfOcrWorkflowByEvidenceId('evidence-queue')?.workflowRunId).toBe(
			'workflow-test-queue',
		);
		expect(listPdfOcrWorkflowRuns().some((run) => run.workflowRunId === 'workflow-test-queue')).toBe(true);
	});
});
