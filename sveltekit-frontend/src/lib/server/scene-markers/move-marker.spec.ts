/**
 * Transactional move tests. Gated: runs only when SCENE_MARKER_TEST_DATABASE_URL is set,
 * and that URL must point at a disposable database with the scene_markers migration applied
 * and stand-in cases/evidence rows. It must never point at the live database.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sceneEventOutbox, sceneEvents, sceneMarkers } from '../db/schema/scene-markers.js';
import {
	CommandReuseError,
	createMarker,
	EvidenceMismatchError,
	listSceneMarkers,
	MarkerConflictError,
	MarkerNotFoundError,
	moveMarker
} from './move-marker.js';

const url = process.env.SCENE_MARKER_TEST_DATABASE_URL;
const CASE_ID = process.env.SCENE_MARKER_TEST_CASE_ID ?? '11111111-1111-1111-1111-111111111111';
const EVIDENCE_ID = process.env.SCENE_MARKER_TEST_EVIDENCE_ID ?? '22222222-2222-2222-2222-222222222222';

describe.runIf(Boolean(url))('moveMarker (scratch database)', () => {
	let pool: pg.Pool;
	let db: ReturnType<typeof drizzle>;
	let markerId: string;
	const scene = `scene-${randomUUID()}`;

	beforeAll(async () => {
		pool = new pg.Pool({ connectionString: url, max: 2 });
		db = drizzle(pool);
		const [m] = await db
			.insert(sceneMarkers)
			.values({
				caseId: CASE_ID,
				sceneKey: scene,
				markerKey: 'door',
				evidenceId: EVIDENCE_ID,
				posX: 0,
				posY: 0,
				posZ: 0,
				revision: 1
			})
			.returning({ id: sceneMarkers.id });
		markerId = m.id;
	});

	afterAll(async () => {
		if (pool) {
			await pool.query(
				`delete from scene_event_outbox where event_id in
				 (select id from scene_events where case_id = $1 and scene_key = $2)`,
				[CASE_ID, scene]
			);
			await pool.query('delete from scene_events where case_id = $1 and scene_key = $2', [CASE_ID, scene]);
			await pool.query('delete from scene_markers where case_id = $1 and scene_key = $2', [CASE_ID, scene]);
		}
		await pool.end();
	});

	const base = () => ({
		caseId: CASE_ID,
		sceneKey: scene,
		markerId,
		evidenceId: EVIDENCE_ID,
		userId: 1,
		position: { x: 4, y: 5, z: 6 }
	});

	it('commits marker, event and outbox together and bumps revision', async () => {
		const commandId = randomUUID();
		const result = await moveMarker(db as never, { ...base(), commandId, expectedRevision: 1 });

		expect(result).toMatchObject({ revision: 2, replayed: false, position: { x: 4, y: 5, z: 6 } });
		const [row] = await db.select().from(sceneMarkers).where(eq(sceneMarkers.id, markerId));
		expect(row.revision).toBe(2);
		expect(row.posX).toBe(4);

		const [ev] = await db.select().from(sceneEvents).where(eq(sceneEvents.commandId, commandId));
		expect(ev.aggregateRevision).toBe(2);
		const outbox = await db.select().from(sceneEventOutbox).where(eq(sceneEventOutbox.eventId, ev.id));
		expect(outbox).toHaveLength(1);
	});

	it('replays a repeated commandId without writing again', async () => {
		const commandId = randomUUID();
		await moveMarker(db as never, { ...base(), commandId, expectedRevision: 2 });
		const second = await moveMarker(db as never, { ...base(), commandId, expectedRevision: 3 });

		expect(second).toMatchObject({ replayed: true, revision: 3 });
		const events = await db.select().from(sceneEvents).where(eq(sceneEvents.commandId, commandId));
		expect(events).toHaveLength(1);
	});

	it('rejects a stale expectedRevision with the current revision', async () => {
		const err = await moveMarker(db as never, {
			...base(),
			commandId: randomUUID(),
			expectedRevision: 1
		}).catch((e) => e);
		expect(err).toBeInstanceOf(MarkerConflictError);
		expect((err as MarkerConflictError).currentRevision).toBeGreaterThan(1);
	});

	it('rejects a move for the wrong evidence', async () => {
		const err = await moveMarker(db as never, {
			...base(),
			evidenceId: '33333333-3333-3333-3333-333333333333',
			commandId: randomUUID(),
			expectedRevision: 3
		}).catch((e) => e);
		expect(err).toBeInstanceOf(EvidenceMismatchError);
	});

	it('rejects a marker that is not in the given scene', async () => {
		const err = await moveMarker(db as never, {
			...base(),
			sceneKey: 'other-scene',
			commandId: randomUUID(),
			expectedRevision: 3
		}).catch((e) => e);
		expect(err).toBeInstanceOf(MarkerNotFoundError);
	});

	it('rejects a commandId reused for a different marker in the same scene', async () => {
		const commandId = randomUUID();
		await moveMarker(db as never, { ...base(), commandId, expectedRevision: 3 });
		const err = await moveMarker(db as never, {
			...base(),
			markerId: randomUUID(),
			commandId,
			expectedRevision: 1
		}).catch((e) => e);
		expect(err).toBeInstanceOf(CommandReuseError);
	});

	it('creates a marker once and replays the same commandId', async () => {
		const newId = randomUUID();
		const commandId = randomUUID();
		const cmd = {
			caseId: CASE_ID,
			sceneKey: scene,
			markerId: newId,
			evidenceId: EVIDENCE_ID,
			commandId,
			position: { x: 1, y: 1, z: 0 },
			label: 'created',
			userId: 1
		};
		const first = await createMarker(db as never, cmd);
		const second = await createMarker(db as never, cmd);

		expect(first).toMatchObject({ revision: 1, replayed: false });
		expect(second).toMatchObject({ revision: 1, replayed: true });
		const events = await db.select().from(sceneEvents).where(eq(sceneEvents.commandId, commandId));
		expect(events).toHaveLength(1);
		expect(events[0].eventType).toBe('MARKER_CREATED');
	});

	it('rejects a create that references unknown evidence and writes nothing', async () => {
		const newId = randomUUID();
		const err = await createMarker(db as never, {
			caseId: CASE_ID,
			sceneKey: scene,
			markerId: newId,
			evidenceId: '44444444-4444-4444-4444-444444444444',
			commandId: randomUUID(),
			position: { x: 0, y: 0, z: 0 },
			label: null,
			userId: 1
		}).catch((e) => e);
		expect(err).toBeDefined();
		const rows = await db.select().from(sceneMarkers).where(eq(sceneMarkers.id, newId));
		expect(rows).toHaveLength(0);
	});

	it('lists live markers for the scene at their current revision (hydration source)', async () => {
		const listed = await listSceneMarkers(db as never, CASE_ID, scene);
		expect(listed.length).toBeGreaterThanOrEqual(1);
		const moved = listed.find((m) => m.markerId === markerId);
		expect(moved).toBeDefined();
		expect(moved!.revision).toBeGreaterThanOrEqual(2);
		expect(moved!.evidenceId).toBe(EVIDENCE_ID);
		const other = await listSceneMarkers(db as never, CASE_ID, 'some-other-scene');
		expect(other).toHaveLength(0);
	});
});
