import { randomUUID } from 'node:crypto';
import { eq, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { cases, evidence } from '../db/schema-postgres.js';
import { ENV } from '../env.server.js';
import { createMarker, listSceneMarkers, MarkerSourceMismatchError, moveMarker } from './move-marker.js';

describe.skipIf(process.env.ATLAS_IMAGE_MARKER_SCRATCH_E2E !== '1')('image marker PostgreSQL readback', () => {
	it('reads back source image and case scene markers in their own coordinate spaces', async () => {
		const url = new URL(ENV.DATABASE_URL);
		const scratch = 'legal_ai_live_integration_scratch';
		if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5434') {
			throw new Error('Image marker proof requires loopback PostgreSQL on port 5434.');
		}
		url.pathname = `/${scratch}`;
		const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
		await client.connect();
		try {
			const { rows: [identity] } = await client.query(
				"select current_database() as name, current_setting('server_version_num')::int as version"
			);
			expect(identity.name).toBe(scratch);
			expect(identity.version).toBeGreaterThanOrEqual(180000);
			expect(identity.version).toBeLessThan(190000);

			const db = drizzle(client);
			const evidenceId = randomUUID();
			const sceneKey = `evidence:${evidenceId}`;
			const markerId = randomUUID();
			const worldMarkerId = randomUUID();
			const sha = 'ab'.repeat(32);
			const sourceRevision = `sha256:${sha}`;
			const rollback = new Error('Roll back image-marker fixture');
			let caseId = '';

			await expect(db.transaction(async (tx) => {
				const [fixtureCase] = await tx.select({ id: cases.id, userId: cases.userId })
					.from(cases).where(isNotNull(cases.userId)).limit(1);
				if (fixtureCase?.userId == null) throw new Error('Scratch database requires a case with an owner.');
				caseId = fixtureCase.id;
				const userId = fixtureCase.userId;
				await tx.insert(evidence).values({
					id: evidenceId, caseId, userId, title: 'Rollback image-marker fixture',
					evidenceType: 'photo', mimeType: 'image/png', hash: sha,
				});
				const original = {
					caseId, evidenceId, sceneKey, markerId, userId, commandId: randomUUID(), label: 'Image marker',
					position: { x: 0.25, y: 0.5, z: 0 }, anchor: { kind: 'IMAGE_UV' as const, u: 0.25, v: 0.5 },
					sourceRevision, sourceSha256: sourceRevision,
				};
				await expect(createMarker(tx, { ...original, sourceRevision: null })).rejects.toBeInstanceOf(MarkerSourceMismatchError);
				expect(await listSceneMarkers(tx, caseId, sceneKey)).toEqual([]);
				await expect(createMarker(tx, original)).resolves.toMatchObject({ revision: 1 });
				await expect(createMarker(tx, original)).resolves.toMatchObject({ revision: 1, replayed: true });

				const move = {
					...original, commandId: randomUUID(), expectedRevision: 1,
					position: { x: 0.75, y: 0.125, z: 0 }, anchor: { kind: 'IMAGE_UV' as const, u: 0.75, v: 0.125 },
				};
				await expect(moveMarker(tx, { ...move, sourceSha256: null })).rejects.toBeInstanceOf(MarkerSourceMismatchError);
				await expect(moveMarker(tx, move)).resolves.toMatchObject({ revision: 2 });
				await expect(moveMarker(tx, move)).resolves.toMatchObject({ revision: 2, replayed: true });
				expect(await listSceneMarkers(tx, caseId, sceneKey)).toEqual([expect.objectContaining({
					markerId, evidenceId, revision: 2, anchor: move.anchor, position: move.position,
					anchorStatus: 'DRAFT', provenance: { sourceRevision, sourceSha256: sourceRevision },
				})]);
				const mainSceneMarker = {
					caseId, evidenceId, sceneKey: 'main-scene', markerId: worldMarkerId, userId,
					commandId: randomUUID(), label: 'Case scene exhibit',
					position: { x: 1.625, y: 0, z: -2.375 },
				};
				await expect(createMarker(tx, mainSceneMarker)).resolves.toMatchObject({ revision: 1 });
				expect(await listSceneMarkers(tx, caseId, mainSceneMarker.sceneKey)).toContainEqual(expect.objectContaining({
					markerId: worldMarkerId, evidenceId, revision: 1, anchor: null, position: mainSceneMarker.position,
				}));
				expect(await listSceneMarkers(tx, caseId, sceneKey)).toHaveLength(1);
				throw rollback;
			})).rejects.toBe(rollback);

			expect(await listSceneMarkers(db, caseId, sceneKey)).toEqual([]);
			expect((await listSceneMarkers(db, caseId, 'main-scene')).some((marker) => marker.markerId === worldMarkerId)).toBe(false);
			expect(await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, evidenceId))).toEqual([]);
		} finally {
			await client.end();
		}
	}, 15_000);
});
