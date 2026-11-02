/**
 * POST /api/worker/autotag/trigger
 * Trigger background processing for evidence, cases, or documents
 *
 * Evidence processing is owned by the durable PostgreSQL analysis_jobs worker.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { db } from '$lib/server/db/client.js';
import { analysisJobs, cases, evidence } from '$lib/server/db/schema-postgres.js';
import { ANALYSIS_JOBS_NOTIFY_CHANNEL, normalizeAnalysisJobPayload } from '$lib/server/analysis/analysis-jobs.js';
import { buildEvidenceReprocessJobV1 } from '$lib/server/evidence/evidence-reprocess-job-v1.js';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const workerTriggerSchema = z.object({
	type: z.enum(['case_created', 'evidence_uploaded', 'document_added']),
	caseId: z.string().max(500).optional(),
	evidenceId: z.string().uuid().optional(),
	documentId: z.string().max(500).optional(),
	action: z.enum(['process', 'reprocess']),
	metadata: z.object({
		priority: z.enum(['low', 'medium', 'high']),
		tags: z.array(z.string().max(200)).max(50).optional(),
		trigger: z.string().max(200),
		userId: z.string().max(500).optional()
	}).passthrough()
}).refine(
	data => !(data.type === 'evidence_uploaded' && !data.evidenceId),
	{ message: 'evidenceId required for type=evidence_uploaded' }
);

/**
 * POST /api/worker/autotag/trigger
 * Enqueues evidence work durably; other legacy trigger types use RabbitMQ.
 */
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const auth = await requireAuth(event);

	try {
		const raw = await event.request.json();
		const parsed = workerTriggerSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{
					success: false,
					error: parsed.error.issues[0]?.message ?? 'Invalid input'
				},
				{ status: 400 }
			);
		}
		const body = parsed.data;
		if (body.type !== 'evidence_uploaded') {
			return json(
				{ success: false, error: 'DURABLE_TRIGGER_UNSUPPORTED', message: 'This trigger type has no durable processing owner yet.' },
				{ status: 409 },
			);
		}

		const ownerId = Number(auth.user.id);
			if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
				return json({ success: false, error: 'INVALID_USER_ID' }, { status: 401 });
			}
			const jobReceipt = await db.transaction(async (tx) => {
				await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${body.evidenceId!}, 0))`);
				const [ownedEvidence] = await tx
					.select({
						id: evidence.id,
						caseId: evidence.caseId,
						fileUrl: evidence.fileUrl,
						fileName: evidence.fileName,
						contentType: evidence.mimeType,
						sourceSha256: evidence.hash,
						uploadedBy: evidence.uploadedBy,
						userId: evidence.userId,
					})
					.from(evidence)
					.leftJoin(cases, eq(evidence.caseId, cases.id))
					.where(and(
						eq(evidence.id, body.evidenceId!),
						or(
							eq(evidence.uploadedBy, ownerId),
							eq(evidence.userId, ownerId),
							eq(cases.userId, ownerId),
							eq(cases.assignedAttorney, ownerId),
						),
					))
					.limit(1);
				if (!ownedEvidence) return { error: 'EVIDENCE_NOT_FOUND' as const };
				const sourceOwnerId = ownedEvidence.uploadedBy ?? ownedEvidence.userId;
				if (!sourceOwnerId) return { error: 'EVIDENCE_OWNER_UNRESOLVED' as const };

				const job = buildEvidenceReprocessJobV1({
					evidenceId: ownedEvidence.id,
					caseId: ownedEvidence.caseId,
					fileUrl: ownedEvidence.fileUrl,
					fileName: ownedEvidence.fileName,
					contentType: ownedEvidence.contentType,
					sourceSha256: ownedEvidence.sourceSha256,
					uploadedBy: sourceOwnerId,
				});

				if (body.action === 'process') {
					const [activeJob] = await tx
						.select({ id: analysisJobs.id, status: analysisJobs.status })
						.from(analysisJobs)
						.where(and(
							eq(analysisJobs.evidenceId, job.evidenceId),
							eq(analysisJobs.jobType, 'upload_pipeline'),
							inArray(analysisJobs.status, ['queued', 'running']),
						))
						.limit(1);
					if (activeJob) return { jobId: activeJob.id, status: activeJob.status };
				}

				const [insertedJob] = await tx
					.insert(analysisJobs)
					.values({
						evidenceId: job.evidenceId,
						caseId: job.caseId,
						jobType: job.jobType,
						status: 'queued',
						progress: '0',
						result: normalizeAnalysisJobPayload(job.result, job.jobType),
					})
					.returning({ id: analysisJobs.id });
				await tx.execute(
					sql`SELECT pg_notify(${ANALYSIS_JOBS_NOTIFY_CHANNEL}, ${JSON.stringify({ jobType: job.jobType })})`
				);
				return { jobId: insertedJob.id, status: 'queued' as const };
			});
			if ('error' in jobReceipt) {
				const status = jobReceipt.error === 'EVIDENCE_NOT_FOUND' ? 404 : 409;
				return json({ success: false, error: jobReceipt.error }, { status });
			}
		return json({
			success: true,
			data: { jobId: jobReceipt.jobId, evidenceId: body.evidenceId, status: jobReceipt.status, triggerType: body.type, action: body.action },
		}, { status: 202 });
	} catch (err) {
		console.error('[autotag-trigger] Request error:', err);
		return json(
			{
				success: false,
				error: 'Worker trigger failed'
			},
			{ status: 500 }
		);
	}
};
