// @vitest-environment node
/**
 * Marker creation integrity proof (scratch database only):
 *   INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> npx vitest run <this file>
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';

const ENABLED = process.env.INVESTIGATION_SCRATCH_E2E === '1';
const SCRATCH_DB = 'legal_ai_live_integration_scratch';
const CASE_A = 'c0a5e000-0000-4000-8000-000000000001';
const CASE_B = 'c0a5e000-0000-4000-8000-000000000002';
const EVIDENCE_B = 'e0e1e000-0000-4000-8000-0000000000f2';

describe.skipIf(!ENABLED)('createMarker integrity (scratch database)', () => {
	let db: typeof import('$lib/server/db/client.js').db;
	let schema: typeof import('$lib/server/db/schema-postgres.js');
	let markers: typeof import('./move-marker.js');
	let evidenceA2: string;
	let userA: number;

	beforeAll(async () => {
		if (!(process.env.DATABASE_URL ?? '').includes(SCRATCH_DB)) {
			throw new Error(`Refusing to run: DATABASE_URL must point at ${SCRATCH_DB}`);
		}
		({ db } = await import('$lib/server/db/client.js'));
		schema = await import('$lib/server/db/schema-postgres.js');
		markers = await import('./move-marker.js');
		userA = 1;
		const [row] = (await db
			.insert(schema.evidence)
			.values({ caseId: CASE_A, userId: userA, title: 'Second exhibit', evidenceType: 'photo' })
			.returning({ id: schema.evidence.id })) as Array<{ id: string }>;
		evidenceA2 = row.id;
	});

	const base = (overrides: Partial<import('./move-marker.js').CreateMarkerCommand> = {}) => ({
		caseId: CASE_A,
		sceneKey: 'integrity-scene',
		markerId: randomUUID(),
		evidenceId: '',
		commandId: randomUUID(),
		position: { x: 1, y: 2, z: 3 },
		label: 'Exhibit',
		userId: userA,
		...overrides
	});

	it('refuses evidence that belongs to another case, even though the UUID is valid', async () => {
		const command = base({ evidenceId: EVIDENCE_B });
		await expect(markers.createMarker(db as never, command)).rejects.toBeInstanceOf(markers.EvidenceNotInCaseError);
		const rows = await db.select().from(schema.evidence).where(eq(schema.evidence.id, EVIDENCE_B));
		expect(rows[0].caseId).toBe(CASE_B);
		const created = await db
			.select({ id: (await import('$lib/server/db/schema/scene-markers.js')).sceneMarkers.id })
			.from((await import('$lib/server/db/schema/scene-markers.js')).sceneMarkers)
			.where(eq((await import('$lib/server/db/schema/scene-markers.js')).sceneMarkers.id, command.markerId));
		expect(created).toHaveLength(0);
	});

	it('replays an identical command and returns the original result', async () => {
		const command = base({ evidenceId: evidenceA2 });
		const first = await markers.createMarker(db as never, command);
		expect(first.replayed).toBe(false);
		const second = await markers.createMarker(db as never, command);
		expect(second.replayed).toBe(true);
		expect(second.revision).toBe(first.revision);
		expect(second.position).toEqual(command.position);
	});

	it('refuses a reused command ID with a different evidence, position or label', async () => {
		const original = base({ evidenceId: evidenceA2 });
		await markers.createMarker(db as never, original);
		await expect(markers.createMarker(db as never, { ...original, evidenceId: EVIDENCE_B })).rejects.toBeInstanceOf(markers.CommandReuseError);
		await expect(markers.createMarker(db as never, { ...original, position: { x: 9, y: 2, z: 3 } })).rejects.toBeInstanceOf(markers.CommandReuseError);
		await expect(markers.createMarker(db as never, { ...original, label: 'Different label' })).rejects.toBeInstanceOf(markers.CommandReuseError);
	});

	it('still replays after the marker has been moved', async () => {
		const original = base({ evidenceId: evidenceA2 });
		const created = await markers.createMarker(db as never, original);
		await markers.moveMarker(db as never, {
			caseId: CASE_A,
			sceneKey: original.sceneKey,
			markerId: original.markerId,
			evidenceId: evidenceA2,
			commandId: randomUUID(),
			expectedRevision: created.revision,
			position: { x: 7, y: 7, z: 7 },
			userId: userA
		} as never);
		const replay = await markers.createMarker(db as never, original);
		expect(replay.replayed).toBe(true);
		expect(replay.position).toEqual(original.position);
	});
});
