import { createHash } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
	const objects = new Map<string, Uint8Array>();
	return {
		objects,
		putFileToSeaweed: vi.fn(async ({ objectKey, bytes }: { objectKey: string; bytes: Uint8Array }) => {
			objects.set(objectKey, bytes.slice());
			return { etag: 'scratch-etag' };
		}),
		getFileFromSeaweed: vi.fn(async ({ objectKey }: { objectKey: string }) => objects.get(objectKey)?.slice() ?? new Uint8Array()),
		headFileInSeaweed: vi.fn(async ({ objectKey }: { objectKey: string }) => ({
			contentLength: objects.get(objectKey)?.byteLength ?? 0,
			contentType: null,
			etag: 'scratch-etag'
		}))
	};
});

vi.mock('$lib/server/storage/seaweed.js', () => storage);

import { POST as uploadSog } from './+server.js';
import { GET as getSogManifest } from '../+server.js';
import { GET as getSogMember } from '../[assetId]/[...filePath]/+server.js';

const databaseUrl = process.env.DATABASE_URL;
const caseId = process.env.ATLAS_SOG_TEST_CASE_ID ?? '';
const actorId = Number(process.env.ATLAS_SCENE_TEST_ACTOR_ID);
const sceneId = 'c9da1f4d-828b-4a41-af2d-1542841a1ac5';
const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });

function packageFiles() {
	const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 1, 2, 3, 4]);
	const manifest = {
		version: 1, count: 1, counts: [1], lodLevels: 1, filenames: ['0_0/meta.json'],
		tree: { bound: { min: [0, 0, 0], max: [1, 1, 1] }, lods: { '0': { file: 0, offset: 0, count: 1 } } }
	};
	const chunk = {
		version: 2, count: 1,
		means: { mins: [0, 0, 0], maxs: [1, 1, 1], files: ['means_l.webp', 'means_u.webp'] },
		scales: { codebook: new Array(256).fill(0), files: ['scales.webp'] },
		quats: { files: ['quats.webp'] },
		sh0: { codebook: new Array(256).fill(0), files: ['sh0.webp'] }
	};
	return [
		{ path: 'lod-meta.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
		{ path: '0_0/meta.json', bytes: new TextEncoder().encode(JSON.stringify(chunk)) },
		...['means_l.webp', 'means_u.webp', 'scales.webp', 'quats.webp', 'sh0.webp'].map((name) => ({ path: `0_0/${name}`, bytes: webp }))
	];
}

function buildMultipartBody(boundary: string, files: ReturnType<typeof packageFiles>): Uint8Array {
	const encoder = new TextEncoder();
	const parts: Uint8Array[] = [];
	const receipt = files.map((file) => ({ path: file.path, bytes: file.bytes.byteLength, sha256: awaitSha256(file.bytes) }));
	parts.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="receipt"\r\nContent-Type: text/plain;charset=UTF-8\r\n\r\n${JSON.stringify(receipt)}\r\n`));
	for (const file of files) {
		const filename = file.path.split('/').at(-1)!;
		const contentType = file.path.endsWith('.json') ? 'application/json' : 'image/webp';
		parts.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file:${file.path}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
		parts.push(file.bytes);
		parts.push(encoder.encode('\r\n'));
	}
	parts.push(encoder.encode(`--${boundary}--\r\n`));
	const body = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
	let offset = 0;
	for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
	return body;
}

function event(request: Request, url = new URL(request.url), assetId?: string, filePath?: string) {
	return {
		locals: { user: { id: actorId } },
		params: { id: caseId, sceneId, ...(assetId ? { assetId } : {}), ...(filePath ? { filePath } : {}) },
		request, url
	} as never;
}

describe('Streamed SOG routes with real PostgreSQL 18 registry and isolated object adapter', () => {
	let assetId = '';
	let sourceFiles: ReturnType<typeof packageFiles>;

	beforeAll(async () => {
		expect(databaseUrl).toBeTruthy();
		expect(caseId).toMatch(/^[0-9a-f-]{36}$/i);
		const parsed = new URL(databaseUrl!);
		expect(['127.0.0.1', 'localhost', '::1', '[::1]']).toContain(parsed.hostname.toLowerCase());
		expect(parsed.port || '5432').toBe('5434');
		expect(decodeURIComponent(parsed.pathname.slice(1))).toBe('legal_ai_live_integration_scratch');
		await client.connect();
		const identity = (await client.query(`SELECT current_database() AS database, current_setting('server_version_num')::int AS version`)).rows[0];
		expect(identity.database).toBe('legal_ai_live_integration_scratch');
		expect(identity.version).toBeGreaterThanOrEqual(180000);
		await client.query(`INSERT INTO public.cases (id, title, status, priority, user_id) VALUES ($1, $2, 'open', 'low', $3)`, [caseId, `SOG API fixture ${caseId}`, actorId]);
		sourceFiles = packageFiles();
	});

	afterAll(async () => {
		await client.end().catch(() => {});
	});

	it('uploads a bounded multipart LOD package, reads its DB manifest, then streams a hash-verified member', async () => {
		const boundary = 'atlas-sog-scratch-boundary-v1';
		const wireBody = buildMultipartBody(boundary, sourceFiles);
		const request = new Request(`http://atlas-scratch.invalid/api/cases/${caseId}/scenes/${sceneId}/assets/sog`, { method: 'POST', headers: {
			'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(wireBody.byteLength)
		}, body: wireBody });
		const uploaded = await uploadSog(event(request));
		expect(uploaded.status).toBe(201);
		const uploadBody = await uploaded.json();
		assetId = uploadBody.data.assetId;
		expect(uploadBody.data).toMatchObject({ format: 'SOG', fileCount: 7, gaussianCount: 1, lodCounts: [1] });
		expect(storage.putFileToSeaweed).toHaveBeenCalledTimes(sourceFiles.length);
		expect(storage.getFileFromSeaweed).toHaveBeenCalledTimes(sourceFiles.length);

		const manifestUrl = new URL(`http://atlas-scratch.invalid/api/cases/${caseId}/scenes/${sceneId}/assets`);
		manifestUrl.searchParams.set('assetId', assetId);
		manifestUrl.searchParams.set('manifest', '1');
		const manifestResponse = await getSogManifest(event(new Request(manifestUrl), manifestUrl));
		expect(manifestResponse.status).toBe(200);
		const manifestBody = await manifestResponse.json();
		expect(manifestBody.data.files).toHaveLength(7);
		const member = sourceFiles.find((file) => file.path === '0_0/meta.json')!;
		const memberUrl = new URL(`http://atlas-scratch.invalid/api/cases/${caseId}/scenes/${sceneId}/assets/${assetId}/0_0/meta.json`);
		const memberResponse = await getSogMember(event(new Request(memberUrl), memberUrl, assetId, '0_0/meta.json'));
		expect(memberResponse.status).toBe(200);
		expect(memberResponse.headers.get('cache-control')).toBe('private, no-store');
		const returnedMemberBytes = new Uint8Array(await memberResponse.arrayBuffer());
		expect(returnedMemberBytes.byteLength).toBe(member.bytes.byteLength);
		expect(awaitSha256(returnedMemberBytes)).toBe(awaitSha256(member.bytes));
		const rows = await client.query(`
			SELECT count(*)::int AS members FROM public.scene_asset_files f
			JOIN public.scene_assets a ON a.asset_id = f.asset_id
			WHERE a.case_id = $1 AND a.scene_id = $2 AND a.asset_id = $3 AND a.format = 'SOG'
		`, [caseId, sceneId, assetId]);
		expect(rows.rows[0].members).toBe(7);
	});
});

function awaitSha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}
