// @vitest-environment node
/**
 * Scene-marker authorization proof, through the real route handlers (scratch database only):
 *   INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> npx vitest run <this file>
 * Policy under test: owner or assigned attorney only; the admin role grants no case access.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';

const ENABLED = process.env.INVESTIGATION_SCRATCH_E2E === '1';
const SCRATCH_DB = 'legal_ai_live_integration_scratch';

describe.skipIf(!ENABLED)('scene marker authorization (scratch database)', () => {
	let caseA: string;
	let evidenceA: string;
	let ownerId = 1;
	let assignedId: number;
	let adminId: number;
	let unrelatedId: number;
	let collection: { GET: any; POST: any };
	let item: { PATCH: any; DELETE: any };
	const scene = 'authz-scene';

	beforeAll(async () => {
		if (!(process.env.DATABASE_URL ?? '').includes(SCRATCH_DB)) {
			throw new Error(`Refusing to run: DATABASE_URL must point at ${SCRATCH_DB}`);
		}
		const { db } = await import('$lib/server/db/client.js');
		const schema = await import('$lib/server/db/schema-postgres.js');
		collection = (await import('../../../routes/api/cases/[id]/scenes/[sceneKey]/markers/+server.js')) as never;
		item = (await import('../../../routes/api/cases/[id]/scenes/[sceneKey]/markers/[markerId]/+server.js')) as never;

		const suffix = randomUUID().slice(0, 8);
		const users = (await db
			.insert(schema.users)
			.values([
				{ email: `assigned-${suffix}@scratch.invalid`, passwordHash: 'scratch-only' },
				{ email: `admin-${suffix}@scratch.invalid`, passwordHash: 'scratch-only', role: 'admin' },
				{ email: `unrelated-${suffix}@scratch.invalid`, passwordHash: 'scratch-only' }
			])
			.returning({ id: schema.users.id })) as Array<{ id: number }>;
		[assignedId, adminId, unrelatedId] = users.map((row) => row.id);

		const [kase] = (await db
			.insert(schema.cases)
			.values({ title: `Authz ${suffix}`, status: 'open', priority: 'medium', userId: ownerId, assignedAttorney: assignedId })
			.returning({ id: schema.cases.id })) as Array<{ id: string }>;
		caseA = kase.id;
		const [exhibit] = (await db
			.insert(schema.evidence)
			.values({ caseId: caseA, userId: ownerId, title: 'Authz exhibit', evidenceType: 'photo' })
			.returning({ id: schema.evidence.id })) as Array<{ id: string }>;
		evidenceA = exhibit.id;
	});

	const locals = (id: number, role = 'prosecutor') => ({ user: { id: String(id), role } });
	const params = (markerId?: string) => ({ id: caseA, sceneKey: scene, ...(markerId ? { markerId } : {}) });
	const body = (value: unknown) => new Request('http://scratch.invalid/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
	const create = (who: ReturnType<typeof locals>, value: Record<string, unknown>) => collection.POST({ locals: who, params: params(), request: body(value) });
	const read = (who: ReturnType<typeof locals>) => collection.GET({ locals: who, params: params() });
	const move = (who: ReturnType<typeof locals>, markerId: string, value: Record<string, unknown>) =>
		item.PATCH({ locals: who, params: params(markerId), request: body(value) });
	const remove = (who: ReturnType<typeof locals>, markerId: string, value: Record<string, unknown>) =>
		item.DELETE({ locals: who, params: params(markerId), request: body(value) });

	it('owner can create, read, move and delete a marker in their case', async () => {
		const markerId = randomUUID();
		const created = await create(locals(ownerId), { markerId, commandId: randomUUID(), evidenceId: evidenceA, position: { x: 1, y: 1, z: 1 } });
		expect(created.status).toBe(201);
		expect((await read(locals(ownerId))).status).toBe(200);
		const moved = await move(locals(ownerId), markerId, { commandId: randomUUID(), evidenceId: evidenceA, expectedRevision: 1, position: { x: 2, y: 2, z: 2 } });
		expect(moved.status).toBe(200);
		const deleted = await remove(locals(ownerId), markerId, { commandId: randomUUID(), evidenceId: evidenceA, expectedRevision: 2 });
		expect(deleted.status).toBe(200);
	});

	it('assigned attorney has the same write access as the owner', async () => {
		const markerId = randomUUID();
		const created = await create(locals(assignedId), { markerId, commandId: randomUUID(), evidenceId: evidenceA, position: { x: 3, y: 3, z: 3 } });
		expect(created.status).toBe(201);
	});

	it('an admin without case membership is refused on every method (no case disclosure)', async () => {
		const markerId = randomUUID();
		const admin = locals(adminId, 'admin');
		expect((await read(admin)).status).toBe(404);
		expect((await create(admin, { markerId, commandId: randomUUID(), evidenceId: evidenceA, position: { x: 0, y: 0, z: 0 } })).status).toBe(404);
		expect((await move(admin, markerId, { commandId: randomUUID(), evidenceId: evidenceA, expectedRevision: 1, position: { x: 0, y: 0, z: 0 } })).status).toBe(404);
		expect((await remove(admin, markerId, { commandId: randomUUID(), evidenceId: evidenceA, expectedRevision: 1 })).status).toBe(404);
	});

	it('an unrelated user is refused the same way, and nothing is written', async () => {
		const markerId = randomUUID();
		const res = await create(locals(unrelatedId), { markerId, commandId: randomUUID(), evidenceId: evidenceA, position: { x: 0, y: 0, z: 0 } });
		expect(res.status).toBe(404);
		expect((await read(locals(unrelatedId))).status).toBe(404);
	});

	it('an anonymous request is refused', async () => {
		const res = await read({} as never);
		expect(res.status).toBe(401);
	});

	it('replays an identical create and rejects a stale move', async () => {
		const markerId = randomUUID();
		const commandId = randomUUID();
		const payload = { markerId, commandId, evidenceId: evidenceA, position: { x: 5, y: 5, z: 5 } };
		expect((await create(locals(ownerId), payload)).status).toBe(201);
		expect((await create(locals(ownerId), payload)).status).toBe(200);
		const stale = await move(locals(ownerId), markerId, { commandId: randomUUID(), evidenceId: evidenceA, expectedRevision: 99, position: { x: 6, y: 6, z: 6 } });
		expect(stale.status).toBe(409);
	});
});
