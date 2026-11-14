import { z } from 'zod';
import { sql } from 'drizzle-orm';

import {
	COURTROOM_FIXTURE_CASE_ID,
	COURTROOM_FIXTURE_SOURCE_REVISION,
	COURTROOM_VIDEO_PROJECT_SCHEMA,
	sealCourtroomReconstructionV1,
	validateCourtroomVideoProjectV1,
	type CourtroomVideoProjectV1,
	type SealedCourtroomReconstructionV1,
	type CourtroomObservationRefV1,
} from '$lib/courtroom/courtroom-video-project-v1.js';
import { db } from '$lib/server/db/client.js';
import { assertArtifactTransportReady } from '$lib/server/queue/artifact-transport-readiness-v1.js';
import {
	canonicalJson,
	materializePostgresJsonArtifact,
	readPostgresJsonArtifact,
	sha256Hex,
} from '$lib/server/queue/postgres-json-artifact-v1.js';
import { artifactAddressSchema, type ArtifactAddressV1 } from '$lib/server/queue/artifact-work-item-v1.js';

const sourceRefSchema = z.object({
	sourceId: z.string().min(1).max(255),
	sourceRevision: z.string().min(1).max(255),
	sha256: z.string().regex(/^[a-f0-9]{64}$/i),
	locator: z.string().min(1).max(2048),
	fixtureOnly: z.literal(true),
}).strict();

const observationLocatorSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('document_span'), pageNumber: z.number().int().positive(), utf16Start: z.number().int().nonnegative(), utf16End: z.number().int().positive() }).strict(),
	z.object({ kind: z.literal('image_region'), x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive() }).strict(),
	z.object({ kind: z.literal('video_time'), startPts: z.number().int().nonnegative(), endPts: z.number().int().positive(), timebaseNumerator: z.number().int().positive(), timebaseDenominator: z.number().int().positive() }).strict(),
	z.object({ kind: z.literal('audio_time'), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive() }).strict(),
	z.object({ kind: z.literal('synthetic_fixture'), fixturePath: z.string().min(1).max(2048) }).strict(),
]);

const observationRefSchema = z.object({
	observationId: z.string().min(1).max(255),
	sourceId: z.string().min(1).max(255),
	sourceRevision: z.string().min(1).max(255),
	sha256: z.string().regex(/^[a-f0-9]{64}$/i),
	locator: z.unknown(),
	fixtureOnly: z.literal(true),
}).strict().transform((value): CourtroomObservationRefV1 => ({
	...value,
	locator: observationLocatorSchema.parse(value.locator),
}));

const segmentSchema = z.object({
	beat: z.enum(['WHO', 'WHAT', 'WHY', 'HOW']),
	startFrame: z.number().int().nonnegative(),
	endFrameExclusive: z.number().int().positive(),
	heading: z.string().min(1).max(160),
	narration: z.string().min(1).max(500),
	status: z.enum(['DOCUMENTED', 'DISPUTED', 'HYPOTHETICAL', 'UNKNOWN']),
	sourceRefs: z.array(sourceRefSchema),
	observations: z.array(observationRefSchema),
	camera: z.enum(['wide', 'witness', 'judge', 'defense']),
}).strict();

export const syntheticCourtroomDraftV1Schema = z.object({
	schema: z.literal(COURTROOM_VIDEO_PROJECT_SCHEMA),
	projectId: z.literal('fixture:synthetic-courtroom-reconstruction-v1'),
	projectRevision: z.number().int().positive(),
	caseId: z.literal(COURTROOM_FIXTURE_CASE_ID),
	sourceRevision: z.literal(COURTROOM_FIXTURE_SOURCE_REVISION),
	title: z.string().min(1).max(200),
	fps: z.literal(30),
	frameRate: z.object({ numerator: z.literal(30), denominator: z.literal(1) }).strict(),
	frameCount: z.literal(240),
	width: z.literal(1280),
	height: z.literal(720),
	disclosure: z.literal('SYNTHETIC RECONSTRUCTION — HYPOTHESIS — NOT ORIGINAL EVIDENCE'),
	renderInputs: z.object({
		rendererRevision: z.string().min(1).max(255),
		sceneRevision: z.string().min(1).max(255),
		actorRigRevision: z.string().min(1).max(255),
		cameraRevision: z.string().min(1).max(255),
		shaderPaletteRevision: z.string().min(1).max(255),
		fontRevision: z.string().min(1).max(255),
		disclosureTemplateRevision: z.string().min(1).max(255),
	}).strict(),
	segments: z.array(segmentSchema).length(4),
}).strict();

const draftArtifactRowSchema = z.object({
	artifact_id: z.string().min(1),
	artifact_hash: z.string().regex(/^[a-f0-9]{64}$/i),
	schema_id: z.string().min(1),
	checksum: z.string().regex(/^[a-f0-9]{64}$/i),
	revision_set_hash: z.string().regex(/^[a-f0-9]{64}$/i),
	revisions: z.record(z.string(), z.string()),
	payload: z.unknown(),
}).strict();

type SqlExecutor = { execute: typeof db.execute };

export type SaveSyntheticCourtroomDraftV1Input = {
	readonly ownerId: string;
	readonly expectedRevision: number | null;
	readonly project: CourtroomVideoProjectV1;
};

export type SavedSyntheticCourtroomDraftV1 = {
	readonly project: SealedCourtroomReconstructionV1;
	readonly artifact: ArtifactAddressV1;
};

export class CourtroomDraftErrorV1 extends Error {
	constructor(readonly code: 'INVALID_DRAFT' | 'REVISION_CONFLICT' | 'DRAFT_NOT_FOUND' | 'ARTIFACT_STORE_NOT_READY', message: string) {
		super(message);
		this.name = 'CourtroomDraftErrorV1';
	}
}

function makeArtifactAddress(row: z.infer<typeof draftArtifactRowSchema>): ArtifactAddressV1 {
	return artifactAddressSchema.parse({
		schema: 'atlas.artifact-address.v1',
		artifactId: row.artifact_id,
		artifactHash: row.artifact_hash,
		schemaId: row.schema_id,
		checksum: row.checksum,
		revisionSetHash: row.revision_set_hash,
		revisions: row.revisions,
		locator: { storage: 'POSTGRES', table: 'workflow_artifacts', primaryKey: row.artifact_id },
	});
}

async function latestDraftRow(
	executor: SqlExecutor,
	ownerId: string,
	projectId: string,
): Promise<z.infer<typeof draftArtifactRowSchema> | null> {
	const result = await executor.execute<z.infer<typeof draftArtifactRowSchema>>(sql`
		SELECT artifact_id, artifact_hash, schema_id, checksum, revision_set_hash, revisions, payload
		FROM workflow_artifacts
		WHERE schema_id = ${COURTROOM_VIDEO_PROJECT_SCHEMA}
		  AND revisions->>'ownerId' = ${ownerId}
		  AND revisions->>'projectId' = ${projectId}
		  AND revisions->>'projectRevision' ~ '^[1-9][0-9]*$'
		ORDER BY (revisions->>'projectRevision')::bigint DESC, created_at DESC
		LIMIT 1
	`);
	const row = result.rows?.[0];
	return row ? draftArtifactRowSchema.parse(row) : null;
}

function validateProject(input: unknown): CourtroomVideoProjectV1 {
	const parsed = syntheticCourtroomDraftV1Schema.safeParse(input);
	if (!parsed.success) {
		throw new CourtroomDraftErrorV1('INVALID_DRAFT', `COURTROOM_DRAFT_SCHEMA_INVALID:${parsed.error.issues.map((issue) => issue.path.join('.') || 'root').join(',')}`);
	}
	const errors = validateCourtroomVideoProjectV1(parsed.data);
	if (errors.length) throw new CourtroomDraftErrorV1('INVALID_DRAFT', `COURTROOM_DRAFT_INVALID:${errors.join(',')}`);
	return parsed.data;
}

function revisionFromRow(row: z.infer<typeof draftArtifactRowSchema>): number {
	const value = Number(row.revisions.projectRevision);
	if (!Number.isSafeInteger(value) || value < 1) throw new Error('COURTROOM_DRAFT_REVISION_CORRUPT');
	return value;
}

function expectedArtifactChecksum(payload: unknown): string {
	return sha256Hex(canonicalJson(payload));
}

export function decideCourtroomDraftRevisionWriteV1(input: {
	readonly expectedRevision: number | null;
	readonly currentRevision: number | null;
	readonly currentChecksum: string | null;
	readonly submittedRevision: number;
	readonly submittedChecksum: string;
}): 'IDEMPOTENT_REPLAY' | 'APPEND_REVISION' {
	if (input.currentRevision === input.submittedRevision && input.currentChecksum === input.submittedChecksum) {
		return 'IDEMPOTENT_REPLAY';
	}
	if (input.expectedRevision !== input.currentRevision || input.submittedRevision <= (input.currentRevision ?? 0)) {
		throw new CourtroomDraftErrorV1('REVISION_CONFLICT', 'COURTROOM_DRAFT_REVISION_CONFLICT');
	}
	return 'APPEND_REVISION';
}

export async function saveSyntheticCourtroomDraftV1(
	input: SaveSyntheticCourtroomDraftV1Input,
): Promise<SavedSyntheticCourtroomDraftV1> {
	if (!input.ownerId.trim() || input.ownerId.length > 128) {
		throw new CourtroomDraftErrorV1('INVALID_DRAFT', 'COURTROOM_DRAFT_OWNER_REQUIRED');
	}
	if (input.expectedRevision !== null && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1)) {
		throw new CourtroomDraftErrorV1('INVALID_DRAFT', 'COURTROOM_DRAFT_EXPECTED_REVISION_INVALID');
	}
	const project = validateProject(input.project);
	const sealed = await sealCourtroomReconstructionV1(project);
	const revisions = {
		ownerId: input.ownerId,
		projectId: project.projectId,
		projectRevision: String(project.projectRevision),
		contractRevision: 'courtroom-draft-artifact-v1',
	};
	const checksum = expectedArtifactChecksum(sealed);

	try {
		return await db.transaction(async (tx: SqlExecutor) => {
			await assertArtifactTransportReady(tx);
			const lockKey = `courtroom-draft:${input.ownerId}:${project.projectId}`;
			await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
			const current = await latestDraftRow(tx, input.ownerId, project.projectId);
			const currentRevision = current ? revisionFromRow(current) : null;
			const writeDecision = decideCourtroomDraftRevisionWriteV1({
				expectedRevision: input.expectedRevision,
				currentRevision,
				currentChecksum: current?.checksum ?? null,
				submittedRevision: project.projectRevision,
				submittedChecksum: checksum,
			});
			if (writeDecision === 'IDEMPOTENT_REPLAY' && current) {
				return { project: sealed, artifact: makeArtifactAddress(current) };
			}

			const artifact = await materializePostgresJsonArtifact({
				schemaId: COURTROOM_VIDEO_PROJECT_SCHEMA,
				payload: sealed,
				revisions,
			}, tx);
			return { project: sealed, artifact };
		});
	} catch (error) {
		if (error instanceof CourtroomDraftErrorV1) throw error;
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('ARTIFACT_TRANSPORT_STORE_NOT_READY')) {
			throw new CourtroomDraftErrorV1('ARTIFACT_STORE_NOT_READY', message);
		}
		throw error;
	}
}

export async function getLatestSyntheticCourtroomDraftV1(ownerId: string): Promise<SavedSyntheticCourtroomDraftV1 | null> {
	if (!ownerId.trim() || ownerId.length > 128) throw new CourtroomDraftErrorV1('INVALID_DRAFT', 'COURTROOM_DRAFT_OWNER_REQUIRED');
	try {
		return await db.transaction(async (tx: SqlExecutor) => {
			await assertArtifactTransportReady(tx);
			const row = await latestDraftRow(tx, ownerId, 'fixture:synthetic-courtroom-reconstruction-v1');
			if (!row) return null;
			const artifact = makeArtifactAddress(row);
			const raw = await readPostgresJsonArtifact<unknown>(artifact, tx);
			if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('COURTROOM_DRAFT_PAYLOAD_INVALID');
			const { storyboardChecksum, ...unsealedProject } = raw as Record<string, unknown>;
			const project = validateProject(unsealedProject);
			if (typeof storyboardChecksum !== 'string' || !await verifySealedProject(project, storyboardChecksum)) {
				throw new Error('COURTROOM_DRAFT_CHECKSUM_INVALID');
			}
			if (project.projectRevision !== revisionFromRow(row)) throw new Error('COURTROOM_DRAFT_REVISION_BINDING_INVALID');
			return { project: { ...project, storyboardChecksum } as SealedCourtroomReconstructionV1, artifact };
		});
	} catch (error) {
		if (error instanceof CourtroomDraftErrorV1) throw error;
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('ARTIFACT_TRANSPORT_STORE_NOT_READY')) {
			throw new CourtroomDraftErrorV1('ARTIFACT_STORE_NOT_READY', message);
		}
		throw error;
	}
}

async function verifySealedProject(project: CourtroomVideoProjectV1, checksum: string): Promise<boolean> {
	const sealed = await sealCourtroomReconstructionV1(project);
	return sealed.storyboardChecksum === checksum;
}
