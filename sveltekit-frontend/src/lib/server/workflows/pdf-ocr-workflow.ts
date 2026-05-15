import { createJob, getJob, updateJob, listJobs, type JobProgress } from '$lib/server/evidence-progress.js';
import {
	PDF_OCR_WORKFLOW_QUEUE,
	publishPdfOcrWorkflowJob,
	type PdfOcrWorkflowJob,
} from './workflow-rabbitmq.js';

export type PdfOcrWorkflowStatus = 'queued' | 'running' | 'completed' | 'failed';
export type PdfOcrWorkflowTransport = 'pending' | 'rabbitmq' | 'local-fallback';

export interface PdfOcrWorkflowInput {
	workflowRunId: string;
	evidenceId?: string;
	fileName: string;
	mimeType: string;
	createdAt?: string;
}

export interface PdfOcrWorkflowRun {
	workflowRunId: string;
	evidenceId: string | null;
	fileName: string;
	mimeType: string;
	queueName: string;
	status: PdfOcrWorkflowStatus;
	transport: PdfOcrWorkflowTransport;
	step: JobProgress['step'];
	progress: number;
	message: string;
	error: string | null;
	createdAt: string;
	updatedAt: string;
	completedAt: string | null;
}

const workflowRuns = new Map<string, PdfOcrWorkflowRun>();

function buildWorkflowRun(jobId: string): PdfOcrWorkflowRun | undefined {
	const meta = workflowRuns.get(jobId);
	if (!meta) return undefined;
	const job = getJob(jobId);
	return {
		...meta,
		status: deriveStatus(job),
		step: job?.step ?? meta.step,
		progress: job?.progress ?? meta.progress,
		message: job?.message ?? meta.message,
		error: job?.error ?? meta.error,
		updatedAt: job ? new Date(job.updatedAt).toISOString() : meta.updatedAt,
		completedAt: job?.step === 'complete' ? new Date(job.updatedAt).toISOString() : meta.completedAt,
		evidenceId: job?.evidenceId ?? meta.evidenceId,
	};
}

function deriveStatus(job: JobProgress | undefined): PdfOcrWorkflowStatus {
	if (!job) return 'queued';
	if (job.step === 'complete') return 'completed';
	if (job.step === 'error') return 'failed';
	return job.progress > 0 ? 'running' : 'queued';
}

function ensureJob(jobId: string): void {
	if (!getJob(jobId)) createJob(jobId);
}

function upsertMeta(input: PdfOcrWorkflowInput, transport: PdfOcrWorkflowTransport): PdfOcrWorkflowRun {
	const createdAt = input.createdAt ?? new Date().toISOString();
	const existing = workflowRuns.get(input.workflowRunId);
	const meta: PdfOcrWorkflowRun = {
		workflowRunId: input.workflowRunId,
		evidenceId: input.evidenceId ?? existing?.evidenceId ?? null,
		fileName: input.fileName,
		mimeType: input.mimeType,
		queueName: PDF_OCR_WORKFLOW_QUEUE,
		status: existing?.status ?? 'queued',
		transport,
		step: existing?.step ?? 'uploading',
		progress: existing?.progress ?? 0,
		message: existing?.message ?? 'Queued ingest.pdf.ocr job',
		error: existing?.error ?? null,
		createdAt: existing?.createdAt ?? createdAt,
		updatedAt: new Date().toISOString(),
		completedAt: existing?.completedAt ?? null,
	};
	workflowRuns.set(input.workflowRunId, meta);
	return meta;
}

export async function registerPdfOcrWorkflowRun(
	input: PdfOcrWorkflowInput,
	publisher = publishPdfOcrWorkflowJob,
): Promise<PdfOcrWorkflowRun> {
	ensureJob(input.workflowRunId);
	upsertMeta(input, 'pending');

	const published = await publisher({
		workflowRunId: input.workflowRunId,
		evidenceId: input.evidenceId,
		fileName: input.fileName,
		mimeType: input.mimeType,
		createdAt: input.createdAt ?? new Date().toISOString(),
	});

	const run = workflowRuns.get(input.workflowRunId);
	if (!run) return buildWorkflowRun(input.workflowRunId)!;

	run.transport = published.transport;
	run.status = published.enqueued ? 'running' : 'completed';
	run.message = published.enqueued
		? 'ingest.pdf.ocr queued on RabbitMQ'
		: 'RabbitMQ unavailable; completed locally';
	run.updatedAt = new Date().toISOString();
	workflowRuns.set(input.workflowRunId, run);

	if (!published.enqueued) {
		updateJob(input.workflowRunId, {
			step: 'complete',
			progress: 100,
			message: 'RabbitMQ unavailable; completed locally',
			evidenceId: input.evidenceId,
		});
		run.completedAt = new Date().toISOString();
	}

	return buildWorkflowRun(input.workflowRunId)!;
}

export async function linkPdfOcrWorkflowEvidence(
	workflowRunId: string,
	evidenceId: string,
): Promise<PdfOcrWorkflowRun | undefined> {
	const run = workflowRuns.get(workflowRunId);
	if (!run) return undefined;
	run.evidenceId = evidenceId;
	run.updatedAt = new Date().toISOString();
	workflowRuns.set(workflowRunId, run);
	updateJob(workflowRunId, { evidenceId });
	return buildWorkflowRun(workflowRunId);
}

export async function completePdfOcrWorkflowRun(
	workflowRunId: string,
	message = 'Dummy PDF OCR worker completed',
): Promise<PdfOcrWorkflowRun | undefined> {
	ensureJob(workflowRunId);
	const run = workflowRuns.get(workflowRunId);
	if (!run) return undefined;

	run.status = 'completed';
	run.transport = run.transport === 'pending' ? 'local-fallback' : run.transport;
	run.step = 'complete';
	run.progress = 100;
	run.message = message;
	run.error = null;
	run.updatedAt = new Date().toISOString();
	run.completedAt = run.updatedAt;
	workflowRuns.set(workflowRunId, run);
	updateJob(workflowRunId, {
		step: 'complete',
		progress: 100,
		message,
		evidenceId: run.evidenceId ?? undefined,
	});
	return buildWorkflowRun(workflowRunId);
}

export async function failPdfOcrWorkflowRun(
	workflowRunId: string,
	errorMessage: string,
): Promise<PdfOcrWorkflowRun | undefined> {
	ensureJob(workflowRunId);
	const run = workflowRuns.get(workflowRunId);
	if (!run) return undefined;

	run.status = 'failed';
	run.step = 'error';
	run.progress = 0;
	run.message = errorMessage;
	run.error = errorMessage;
	run.updatedAt = new Date().toISOString();
	workflowRuns.set(workflowRunId, run);
	updateJob(workflowRunId, {
		step: 'error',
		progress: 0,
		message: errorMessage,
		error: errorMessage,
	});
	return buildWorkflowRun(workflowRunId);
}

export function getPdfOcrWorkflowRun(workflowRunId: string): PdfOcrWorkflowRun | undefined {
	return buildWorkflowRun(workflowRunId);
}

export function listPdfOcrWorkflowRuns(): PdfOcrWorkflowRun[] {
	const workflowIds = new Set([
		...workflowRuns.keys(),
		...listJobs().map((job) => job.jobId),
	]);

	return [...workflowIds]
		.map((jobId) => buildWorkflowRun(jobId))
		.filter((run): run is PdfOcrWorkflowRun => Boolean(run))
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getLatestPdfOcrWorkflowByEvidenceId(evidenceId: string): PdfOcrWorkflowRun | undefined {
	return listPdfOcrWorkflowRuns().find((run) => run.evidenceId === evidenceId);
}
