import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { z } from 'zod';
import { authorizedCaseFilter } from '$lib/server/case-access.js';
import { db } from '$lib/server/db/client.js';
import { analysisJobs, cases, evidence } from '$lib/server/db/schema-postgres.js';
import { ENV } from '$lib/server/env.server.js';
import { buildEvidenceReprocessJobV1 } from '$lib/server/evidence/evidence-reprocess-job-v1.js';
import { normalizeSha256 } from '$lib/server/features/evidence/evidence-revision-v1.js';
import { getFileFromSeaweed, putFileToSeaweed } from '$lib/server/storage/seaweed.js';
import { INDEXED_PALETTE_TEXTURE_REVISION_V1, quantizeRgbaToIndexed4BppV1 } from '$lib/splat/indexed-palette-texture-v1.js';
import { enqueueJob } from './analysis-jobs.js';

const TYPE = 'scene_palette' as const;
const PROCEDURE = 'scene.palette.pack.v1' as const;
const MAX_OUTPUT_BYTES = 256 * 256 / 2;
const SUPPORTED_MEDIA = /^image\/(png|jpeg|webp|tiff)$/i;
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const scenePaletteRequestSchemaV1 = z.object({
	runId: z.uuid().transform((value) => value.toLowerCase()),
	sequenceId: z.number().int().min(0).max(0xffff_ffff),
	sourceRevision: digest,
}).strict();
const jobSchema = scenePaletteRequestSchemaV1.extend({
	actorId: z.number().int().positive(), caseId: z.uuid(), evidenceId: z.uuid(),
	procedureId: z.literal(PROCEDURE),
}).strip();
const artifactSchema = z.object({
	schema: z.literal(INDEXED_PALETTE_TEXTURE_REVISION_V1),
	width: z.number().int().min(1).max(256), height: z.number().int().min(1).max(256),
	byteLength: z.number().int().min(1).max(MAX_OUTPUT_BYTES), sha256: digest,
}).strict().refine((entry) => entry.byteLength === Math.ceil(entry.width * entry.height / 2));

type Job = z.infer<typeof jobSchema>;
type Artifact = z.infer<typeof artifactSchema>;
type Source = Pick<Job, 'actorId' | 'caseId' | 'evidenceId'>;
type Request = z.infer<typeof scenePaletteRequestSchemaV1>;

function sha256(bytes: Uint8Array) {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function loadSource(input: Source) {
	const access = authorizedCaseFilter(input.caseId, input.actorId);
	if (!access) return null;
	const [row] = await db.select({
		hash: evidence.hash, fileUrl: evidence.fileUrl, fileName: evidence.fileName,
		mime: evidence.mimeType, fileType: evidence.fileType,
	}).from(evidence).innerJoin(cases, eq(evidence.caseId, cases.id))
		.where(and(access, eq(evidence.id, input.evidenceId), isNull(evidence.deletedAt))).limit(1);
	return row ?? null;
}

export function scenePaletteJobIdV1(input: Pick<Job, 'caseId' | 'runId' | 'sequenceId'>) {
	const bytes = createHash('sha256')
		.update(JSON.stringify([PROCEDURE, input.caseId, input.runId, input.sequenceId]))
		.digest().subarray(0, 16);
	bytes[6] = (bytes[6] & 15) | 0x80;
	bytes[8] = (bytes[8] & 63) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readJob(source: Source, id: string) {
	const [row] = await db.select({ status: analysisJobs.status, result: analysisJobs.result })
		.from(analysisJobs)
		.where(and(eq(analysisJobs.id, id), eq(analysisJobs.evidenceId, source.evidenceId),
			eq(analysisJobs.caseId, source.caseId), eq(analysisJobs.jobType, TYPE))).limit(1);
	return row;
}

export async function enqueueScenePaletteJobV1(source: Source, request: Request) {
	const row = await loadSource(source);
	if (!row) return { status: 'NOT_FOUND' } as const;
	if (normalizeSha256(row.hash) !== request.sourceRevision) return { status: 'STALE_SOURCE' } as const;
	if (!SUPPORTED_MEDIA.test(row.mime ?? row.fileType ?? '')) return { status: 'UNSUPPORTED_MEDIA' } as const;
	const input = jobSchema.parse({ ...source, ...request, procedureId: PROCEDURE });
	const jobId = scenePaletteJobIdV1(input);
	await enqueueJob({ evidenceId: source.evidenceId, caseId: source.caseId, jobType: TYPE, reuseId: jobId, result: input });
	const existing = await readJob(source, jobId);
	const stored = jobSchema.safeParse(existing?.result);
	if (!stored.success || stored.data.actorId !== input.actorId || stored.data.sourceRevision !== input.sourceRevision ||
		stored.data.evidenceId !== input.evidenceId || stored.data.caseId !== input.caseId ||
		stored.data.runId !== input.runId || stored.data.sequenceId !== input.sequenceId) return { status: 'SEQUENCE_CONFLICT' } as const;
	return { status: 'ACCEPTED', jobId, jobStatus: existing?.status } as const;
}

function location(input: Source, sourceRevision: string, artifact: Artifact) {
	const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET;
	if (!bucket) throw new Error('SCENE_PALETTE_BUCKET_UNAVAILABLE');
	return { bucket, objectKey: `evidence/${input.caseId}/${input.evidenceId}/${sourceRevision.slice(7)}/palette-${artifact.sha256.slice(7)}.bin` };
}

async function readPaletteBytes(input: Source, sourceRevision: string, artifact: Artifact) {
	const bytes = await getFileFromSeaweed({ ...location(input, sourceRevision, artifact), maximumBytes: artifact.byteLength });
	if (bytes.length !== artifact.byteLength || sha256(bytes) !== artifact.sha256) {
		throw new Error('SCENE_PALETTE_READBACK_MISMATCH');
	}
	return bytes;
}

export async function executeScenePaletteJobV1(evidenceId: string, metadata: Record<string, unknown>, jobId: string) {
	const input = jobSchema.parse(metadata);
	const job = await readJob(input, jobId);
	if (input.evidenceId !== evidenceId || scenePaletteJobIdV1(input) !== jobId || job?.status !== 'running') {
		throw new Error('SCENE_PALETTE_JOB_MISMATCH');
	}
	const source = await loadSource(input);
	if (!source || normalizeSha256(source.hash) !== input.sourceRevision) throw new Error('SCENE_PALETTE_STALE_SOURCE');
	if (!SUPPORTED_MEDIA.test(source.mime ?? source.fileType ?? '')) throw new Error('SCENE_PALETTE_UNSUPPORTED_MEDIA');
	const locator = buildEvidenceReprocessJobV1({
		evidenceId, caseId: input.caseId, fileUrl: source.fileUrl, fileName: source.fileName,
		contentType: source.mime ?? source.fileType, sourceSha256: input.sourceRevision, uploadedBy: input.actorId,
	}).result;
	const original = await getFileFromSeaweed({ bucket: locator.object_bucket, objectKey: locator.objectKey, maximumBytes: 32 * 1024 * 1024 });
	if (sha256(original) !== input.sourceRevision) throw new Error('SCENE_PALETTE_SOURCE_HASH_MISMATCH');
	const image = sharp(original, { limitInputPixels: 32 * 1024 * 1024 });
	const { format } = await image.metadata();
	if (!SUPPORTED_MEDIA.test(`image/${format}`)) throw new Error('SCENE_PALETTE_UNSUPPORTED_MEDIA');
	const preview = await image.rotate()
		.resize(256, 256, { fit: 'inside', withoutEnlargement: true }).toColourspace('srgb')
		.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const { width, height } = preview.info;
	const bytes = quantizeRgbaToIndexed4BppV1(width, height, preview.data).packedIndices;
	const artifact = artifactSchema.parse({ schema: INDEXED_PALETTE_TEXTURE_REVISION_V1, width, height, byteLength: bytes.length, sha256: sha256(bytes) });
	await putFileToSeaweed({ ...location(input, input.sourceRevision, artifact), bytes, contentType: 'application/octet-stream' });
	await readPaletteBytes(input, input.sourceRevision, artifact);
	const current = await loadSource(input);
	if (!current || normalizeSha256(current.hash) !== input.sourceRevision) throw new Error('SCENE_PALETTE_STALE_SOURCE');
	return { ...input, artifact };
}

export async function reopenScenePaletteJobV1(source: Source, jobId: string, download: boolean) {
	const current = await loadSource(source);
	if (!current) return { status: 'NOT_FOUND' } as const;
	const job = await readJob(source, jobId);
	const pin = jobSchema.safeParse(job?.result);
	if (!pin.success || pin.data.caseId !== source.caseId || pin.data.evidenceId !== source.evidenceId ||
		scenePaletteJobIdV1(pin.data) !== jobId) return { status: 'NOT_FOUND' } as const;
	if (normalizeSha256(current.hash) !== pin.data.sourceRevision) return { status: 'STALE_SOURCE' } as const;
	if (job?.status !== 'completed') return { status: job?.status === 'failed' ? 'FAILED' : 'PENDING', jobStatus: job?.status } as const;
	const artifact = artifactSchema.parse(z.object({ artifact: z.unknown() }).parse(job.result).artifact);
	const bytes = download ? await readPaletteBytes(source, pin.data.sourceRevision, artifact) : null;
	if (download) {
		const latest = await loadSource(source);
		if (!latest) return { status: 'NOT_FOUND' } as const;
		if (normalizeSha256(latest.hash) !== pin.data.sourceRevision) return { status: 'STALE_SOURCE' } as const;
	}
	return { status: 'READY', sourceRevision: pin.data.sourceRevision, artifact, bytes } as const;
}
