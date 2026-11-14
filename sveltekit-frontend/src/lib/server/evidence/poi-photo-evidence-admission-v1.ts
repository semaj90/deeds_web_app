import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';
import { analysisJobs, evidence, type NewAnalysisJob } from '$lib/server/db/schema-postgres.js';
import { ANALYSIS_JOBS_NOTIFY_CHANNEL, normalizeAnalysisJobPayload } from '$lib/server/analysis/analysis-jobs.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { uploadSeaweedFile } from '$lib/server/seaweed-client.js';

/**
 * Admits a person-of-interest photo into the case evidence lane.
 *
 * A POI photo on its own is not evidence. When the person is linked to a case the uploader may access,
 * the same bytes are registered as a case evidence row and a durable `upload_pipeline` job is queued, so
 * the photo gets the same processing as any uploaded image: object detection, an EmbeddingGemma 2 image
 * vector in PostgreSQL (canonical) and, from the outbox, a Qdrant projection.
 *
 * Order: authorize -> store bytes -> one PostgreSQL transaction (evidence row + job + notify).
 * This module never writes Qdrant and never embeds; the worker owns both.
 */

export type PoiPhotoEvidenceAdmissionV1 =
	| { status: 'queued'; evidenceId: string; jobId: string; sourceRevision: string }
	| { status: 'already_registered'; evidenceId: string; sourceRevision: string }
	| { status: 'no_case' }
	| { status: 'case_not_accessible' }
	| { status: 'failed'; reason: string };

export interface PoiPhotoEvidenceInputV1 {
	poiId: string;
	poiName: string;
	poiPhotoId: string;
	caseId: string | null | undefined;
	actorId: number;
	fileName: string;
	contentType: string;
	bytes: Buffer;
}

export interface PoiPhotoEvidencePersistInputV1 {
	jobId: string;
	caseId: string;
	actorId: number;
	poiId: string;
	poiName: string;
	poiPhotoId: string;
	fileName: string;
	contentType: string;
	byteLength: number;
	bucket: string;
	objectKey: string;
	sourceRevision: string;
}

export interface PoiPhotoEvidenceDepsV1 {
	authorizeCase(caseId: string, actorId: number): Promise<unknown | null>;
	evidenceBucket(): string | undefined;
	/** Existing evidence row for the same photo bytes of the same person in the same case, if any. */
	findExisting(input: { caseId: string; poiId: string; sourceRevision: string }): Promise<string | null>;
	putObject(input: { bucket: string; objectKey: string; bytes: Buffer; contentType: string; fileName: string }): Promise<void>;
	/** Inserts the evidence row and its queued job atomically; returns the evidence id. */
	persist(input: PoiPhotoEvidencePersistInputV1): Promise<string>;
	newJobId(): string;
}

const IMAGE_MIME = /^image\/(png|jpeg|webp|bmp|tiff)$/;

const defaultDeps: PoiPhotoEvidenceDepsV1 = {
	authorizeCase: (caseId, actorId) => getAuthorizedCase(caseId, actorId),
	evidenceBucket: () => ENV.SEAWEED_EVIDENCE_BUCKET,
	findExisting: async ({ caseId, poiId, sourceRevision }) => {
		const [row] = await db
			.select({ id: evidence.id })
			.from(evidence)
			.where(and(
				eq(evidence.caseId, caseId),
				eq(evidence.hash, sourceRevision),
				isNull(evidence.deletedAt),
				sql`${evidence.metadata}->>'poi_id' = ${poiId}`,
			))
			.limit(1);
		return row?.id ?? null;
	},
	putObject: async ({ bucket, objectKey, bytes, contentType, fileName }) => {
		await uploadSeaweedFile(bucket, objectKey, bytes, {
			'Content-Type': contentType,
			'Original-Filename': fileName,
		});
	},
	persist: async (input) => db.transaction(async (tx) => {
		const [created] = await tx
			.insert(evidence)
			.values({
				caseId: input.caseId,
				userId: input.actorId,
				uploadedBy: input.actorId,
				evidenceType: 'photo',
				title: `Photo of ${input.poiName}`.slice(0, 255),
				description: `Photo added from the person-of-interest record for ${input.poiName}.`,
				fileName: input.fileName,
				fileType: input.contentType,
				mimeType: input.contentType,
				fileSize: input.byteLength,
				fileUrl: input.objectKey,
				hash: input.sourceRevision,
				status: 'processing_queued',
				metadata: {
					source_revision: input.sourceRevision,
					observed_mime: input.contentType,
					admitted_via: 'poi-photo',
					poi_id: input.poiId,
					poi_photo_id: input.poiPhotoId,
				},
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning({ id: evidence.id });
		if (!created?.id) throw new Error('EVIDENCE_INSERT_FAILED_NO_ID');

		const jobValues = {
			id: input.jobId,
			evidenceId: created.id,
			caseId: input.caseId,
			jobType: 'upload_pipeline',
			status: 'queued',
			progress: '0',
			result: normalizeAnalysisJobPayload(
				{
					evidenceId: created.id,
					caseId: input.caseId,
					objectKey: input.objectKey,
					object_bucket: input.bucket,
					sourceSha256: input.sourceRevision,
					fileName: input.fileName,
					contentType: input.contentType,
					uploadedBy: input.actorId,
				},
				'upload_pipeline',
			),
		} satisfies NewAnalysisJob;
		await tx.insert(analysisJobs).values(jobValues);
		await tx.execute(
			sql`SELECT pg_notify(${ANALYSIS_JOBS_NOTIFY_CHANNEL}, ${JSON.stringify({ jobType: 'upload_pipeline' })})`,
		);
		return created.id;
	}),
	newJobId: () => randomUUID(),
};

function extensionFor(contentType: string): string {
	const subtype = contentType.slice('image/'.length);
	return subtype === 'jpeg' ? 'jpg' : subtype;
}

export async function admitPoiPhotoAsCaseEvidenceV1(
	input: PoiPhotoEvidenceInputV1,
	deps: PoiPhotoEvidenceDepsV1 = defaultDeps,
): Promise<PoiPhotoEvidenceAdmissionV1> {
	if (!input.caseId) return { status: 'no_case' };
	if (!Number.isSafeInteger(input.actorId) || input.actorId <= 0) return { status: 'case_not_accessible' };
	if (!IMAGE_MIME.test(input.contentType)) return { status: 'failed', reason: 'UNSUPPORTED_IMAGE_TYPE' };
	if (!Buffer.isBuffer(input.bytes) || input.bytes.length === 0 || input.bytes.length > 32 * 1024 * 1024) {
		return { status: 'failed', reason: 'IMAGE_SIZE_OUT_OF_RANGE' };
	}

	try {
		if (!(await deps.authorizeCase(input.caseId, input.actorId))) return { status: 'case_not_accessible' };

		const bucket = deps.evidenceBucket();
		if (!bucket) return { status: 'failed', reason: 'EVIDENCE_BUCKET_NOT_CONFIGURED' };

		const sha256 = createHash('sha256').update(input.bytes).digest('hex');
		const sourceRevision = `sha256:${sha256}`;

		const existing = await deps.findExisting({ caseId: input.caseId, poiId: input.poiId, sourceRevision });
		if (existing) return { status: 'already_registered', evidenceId: existing, sourceRevision };

		// Content-addressed key: the same bytes for the same person always land on the same object.
		const objectKey = `evidence/${input.caseId}/poi-${input.poiId}-${sha256}.${extensionFor(input.contentType)}`;
		await deps.putObject({
			bucket,
			objectKey,
			bytes: input.bytes,
			contentType: input.contentType,
			fileName: input.fileName,
		});

		const jobId = deps.newJobId();
		const evidenceId = await deps.persist({
			jobId,
			caseId: input.caseId,
			actorId: input.actorId,
			poiId: input.poiId,
			poiName: input.poiName,
			poiPhotoId: input.poiPhotoId,
			fileName: input.fileName,
			contentType: input.contentType,
			byteLength: input.bytes.length,
			bucket,
			objectKey,
			sourceRevision,
		});
		return { status: 'queued', evidenceId, jobId, sourceRevision };
	} catch (error) {
		return { status: 'failed', reason: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
	}
}
