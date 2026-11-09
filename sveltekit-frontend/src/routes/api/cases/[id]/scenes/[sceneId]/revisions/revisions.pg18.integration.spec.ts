import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET, POST } from './+server.js';

const databaseUrl = process.env.DATABASE_URL;
const caseId = process.env.ATLAS_SCENE_TEST_CASE_ID ?? '';
const actorId = Number(process.env.ATLAS_SCENE_TEST_ACTOR_ID);
const sceneId = 'a4456070-4eb4-4e73-bf9a-1cd690a0cc41';
const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });

function manifest(revision: number, parentManifestSha256: string | null, marker = false) {
	return {
		schema: 'parent-atlas.scene-document.v1', sceneId, caseId, status: 'HYPOTHESIS', revision,
		parentManifestSha256, createdAt: `2026-11-09T00:00:0${revision}.000Z`, coordinateFrame: 'LOCAL_UNCALIBRATED',
		objects: marker ? [{
			objectId: 'ec88fc78-2c77-42f8-9ab4-08e9f79bb2e7', parentObjectId: null,
			name: 'Scratch hypothesis marker', kind: 'MARKER', assetSha256: null,
			transform: { translation: [1, 0, 2], rotationXyzw: [0, 0, 0, 1], scale: [1, 1, 1] }, geometry: null
		}] : [],
		animations: [], evidenceBindings: [], evidenceSources: [], assets: [],
		quality: { triangleBudget: null, triangleCount: 0, textureBytes: null, derivedAssetBytes: 0, derivedAssetByteBudget: 8 * 1024 * 1024, derivedAssetByteStatus: 'WITHIN_BUDGET', status: 'NOT_ASSESSED' }
	};
}

function event(method: 'GET' | 'POST', command?: unknown) {
	const url = new URL(`http://atlas-scratch.invalid/api/cases/${caseId}/scenes/${sceneId}/revisions`);
	const request = new Request(url, command ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) } : { method: 'GET' });
	return { locals: { user: { id: actorId } }, params: { id: caseId, sceneId }, request, url } as never;
}

describe('case scene revisions on isolated PostgreSQL 18 scratch', () => {
	beforeAll(async () => {
		expect(databaseUrl, 'DATABASE_URL must target the guarded scratch database').toBeTruthy();
		expect(caseId).toMatch(/^[0-9a-f-]{36}$/i);
		expect(Number.isSafeInteger(actorId)).toBe(true);
		const parsed = new URL(databaseUrl!);
		expect(['127.0.0.1', 'localhost', '::1', '[::1]']).toContain(parsed.hostname.toLowerCase());
		expect(parsed.port || '5432').toBe('5434');
		expect(decodeURIComponent(parsed.pathname.slice(1))).toBe('legal_ai_live_integration_scratch');
		await client.connect();
		const identity = (await client.query(`SELECT current_database() AS database, current_setting('server_version_num')::int AS version`)).rows[0];
		expect(identity.database).toBe('legal_ai_live_integration_scratch');
		expect(identity.version).toBeGreaterThanOrEqual(180000);
		await client.query(`INSERT INTO public.cases (id, title, status, priority, user_id) VALUES ($1, $2, 'open', 'low', $3)`, [caseId, `Scene API fixture ${caseId}`, actorId]);
	});

	afterAll(async () => {
		await client.end().catch(() => {});
	});

	it('authorizes the synthetic case, saves, reloads, rejects stale edits, and reads the new revision', async () => {
		const empty = await GET(event('GET'));
		expect(empty.status).toBe(200);
		expect((await empty.json()).data).toBeNull();

		const first = await POST(event('POST', { commandId: 'f29403e4-46db-4596-94ce-51402f95ba96', expectedRevision: 0, manifest: manifest(1, null) }));
		expect(first.status).toBe(201);
		const firstBody = await first.json();
		expect(firstBody.data.revision).toBe(1);
		const firstHash = firstBody.data.manifestSha256 as string;
		expect(firstHash).toMatch(/^[0-9a-f]{64}$/);

		const loaded = await GET(event('GET'));
		const loadedBody = await loaded.json();
		expect(loadedBody.data).toMatchObject({ revision: 1, manifestSha256: firstHash, manifest: { caseId, sceneId, revision: 1 } });

		const stale = await POST(event('POST', { commandId: '259bcf1e-0137-4a17-a03d-ce19c6385422', expectedRevision: 0, manifest: manifest(1, null, true) }));
		expect(stale.status).toBe(409);
		expect((await stale.json()).message).toBe('SCENE_REVISION_CONFLICT');

		const second = await POST(event('POST', { commandId: 'ca2f3a4d-05c0-4940-8d6a-ec9094ea9f75', expectedRevision: 1, manifest: manifest(2, firstHash, true) }));
		expect(second.status).toBe(201);
		const secondBody = await second.json();
		expect(secondBody.data.revision).toBe(2);
		expect(secondBody.data.manifest.parentManifestSha256).toBe(firstHash);

		const finalReadback = await GET(event('GET'));
		expect((await finalReadback.json()).data).toMatchObject({ revision: 2, manifest: { revision: 2, objects: [{ objectId: 'ec88fc78-2c77-42f8-9ab4-08e9f79bb2e7' }] } });
		const rows = await client.query(`SELECT count(*)::int AS count FROM public.scene_document_revisions WHERE case_id = $1 AND scene_id = $2`, [caseId, sceneId]);
		expect(rows.rows[0].count).toBe(2);
	});
});
