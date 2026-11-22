import { createHash } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { expect } from '@playwright/test';
import pg from 'pg';

export function sceneReadbackSettings() {
	const databaseUrl = process.env.PW_SCENE_READBACK_DATABASE_URL;
	const endpoint = process.env.PW_SCENE_READBACK_S3_ENDPOINT;
	const bucket = process.env.PW_SCENE_READBACK_S3_BUCKET;
	const accessKeyId = process.env.PW_SCENE_READBACK_S3_ACCESS_KEY;
	const secretAccessKey = process.env.PW_SCENE_READBACK_S3_SECRET_KEY;
	return databaseUrl && endpoint && bucket && accessKeyId && secretAccessKey
		? { databaseUrl, endpoint, bucket, credentials: { accessKeyId, secretAccessKey } }
		: null;
}

export async function verifySceneGenerationIndependentReadback(
	settings: NonNullable<ReturnType<typeof sceneReadbackSettings>>,
	expected: { caseId: string; sceneId: string; jobId: string; revision: number;
		manifestSha256: string; manifest: unknown; planHash: string; recipe: unknown;
		sourceSnapshot: Array<{ evidenceId: string; sourceRevision: string; sha256: string }> }
) {
	const client = new pg.Client({ connectionString: settings.databaseUrl,
		connectionTimeoutMillis: 8_000, statement_timeout: 8_000, application_name: 'scene-staging-readback' });
	await client.connect();
	let refs: unknown;
	try {
		await client.query('BEGIN READ ONLY');
		const { rows: [job] } = await client.query(
			`SELECT status, input_kind, source_snapshot, result_refs, request_snapshot->>'planHash' AS plan_hash
			FROM scene_generation_jobs WHERE case_id = $1 AND scene_id = $2 AND job_id = $3`,
			[expected.caseId, expected.sceneId, expected.jobId]
		);
		expect(job).toMatchObject({ status: 'completed', input_kind: expected.sourceSnapshot.length ? 'EVIDENCE_BACKED' : 'BLOCKOUT',
			source_snapshot: expected.sourceSnapshot, plan_hash: expected.planHash });
		refs = job.result_refs;
		const { rows: [revision] } = await client.query(
			'SELECT manifest_sha256, manifest FROM scene_document_revisions WHERE case_id = $1 AND scene_id = $2 AND revision = $3',
			[expected.caseId, expected.sceneId, expected.revision]
		);
		expect(revision?.manifest_sha256).toBe(expected.manifestSha256);
		expect(revision?.manifest).toEqual(expected.manifest);
		await client.query('COMMIT');
	} finally {
		await client.end();
	}

	if (!Array.isArray(refs) || refs.length !== 1) throw new Error('Expected one registered scene recipe');
	const [artifact] = refs;
	expect(artifact).toMatchObject({ kind: 'SCENE_RUNTIME_RECIPE_V1', bucket: settings.bucket, mimeType: 'application/json' });
	expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
	expect(Number.isInteger(artifact.byteLength) && artifact.byteLength > 0 && artifact.byteLength <= 1_048_576).toBe(true);
	const key = `scene-generation/${expected.caseId}/${expected.sceneId}/sha256/${artifact.sha256}.json`;
	expect(artifact.artifactKey).toBe(key);
	const s3 = new S3Client({ region: 'us-east-1', endpoint: settings.endpoint, forcePathStyle: true,
		credentials: settings.credentials, maxAttempts: 1 });
	try {
		const result = await s3.send(new GetObjectCommand({ Bucket: settings.bucket, Key: key }),
			{ abortSignal: AbortSignal.timeout(10_000) });
		expect(result.ContentLength).toBe(artifact.byteLength);
		if (!result.Body) throw new Error('Scene recipe bytes missing');
		const chunks: Uint8Array[] = [];
		let length = 0;
		for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
			length += chunk.byteLength;
			if (length > artifact.byteLength) throw new Error('Scene recipe exceeded registered size');
			chunks.push(chunk);
		}
		expect(length).toBe(artifact.byteLength);
		const bytes = Buffer.concat(chunks);
		expect(createHash('sha256').update(bytes).digest('hex')).toBe(artifact.sha256);
		expect(JSON.parse(bytes.toString('utf8'))).toEqual(expected.recipe);
		return { artifactSha256: artifact.sha256 as string, byteLength: length };
	} finally {
		s3.destroy();
	}
}
