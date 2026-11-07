import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const mocks = vi.hoisted(() => ({
	getAuthorizedCase: vi.fn(),
	getCachedSpatialPacket: vi.fn(),
	reconcileSpatialKeyframe: vi.fn(),
	select: vi.fn(),
	from: vi.fn(),
	where: vi.fn(),
	limit: vi.fn(),
	env: { SCENE_PERSISTENCE_ENABLED: false }
}));

vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: mocks.getAuthorizedCase }));
vi.mock('$lib/server/cache/valkey-packet-cache.js', () => ({ getCachedSpatialPacket: mocks.getCachedSpatialPacket }));
vi.mock('$lib/server/api/route-spatial-enhancer.js', () => ({
	reconcileSpatialKeyframe: mocks.reconcileSpatialKeyframe,
	decodeActiveSlotBitset: vi.fn(),
	unpackKeyframeBuffer: vi.fn()
}));
vi.mock('$lib/server/env.server.js', () => ({ ENV: mocks.env }));
vi.mock('$lib/server/db/client.js', () => ({ db: { select: mocks.select } }));

import { GET, POST } from './+server.js';

const caseId = '0192fe63-9524-7f12-8756-3240590a294c';
const sceneId = '0192fe63-9524-7f12-8756-3240590a294b';

function event(overrides: Record<string, unknown> = {}) {
	return {
		locals: { user: { id: '7' } },
		params: { id: caseId, sceneId },
		url: new URL(`http://localhost/api/cases/${caseId}/scenes/${sceneId}/keyframes`),
		...overrides
	} as never;
}

describe('case-scoped spatial keyframe route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAuthorizedCase.mockResolvedValue({ id: caseId });
		mocks.getCachedSpatialPacket.mockResolvedValue(null);
		mocks.limit.mockResolvedValue([]);
		mocks.where.mockReturnValue({ limit: mocks.limit });
		mocks.from.mockReturnValue({ where: mocks.where });
		mocks.select.mockReturnValue({ from: mocks.from });
		mocks.reconcileSpatialKeyframe.mockResolvedValue({
			sceneId,
			revisionId: 3,
			sourceSha256: 'a'.repeat(64),
			activeSlotCount: 0,
			bitsetInfo: {},
			simdMetrics: {},
			status: 'CACHED'
		});
	});

	it('uses the authorized case ID for the cache lookup and rejects malformed revisions', async () => {
		const response = await GET(event({ url: new URL(`http://localhost/?revision=3`) }) as never);
		expect(response.status).toBe(404);
		expect(mocks.getCachedSpatialPacket).toHaveBeenCalledWith(caseId, sceneId, 3);
		const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
		expect(query.sql).toContain('"case_id"');
		expect(query.params).toContain(caseId);
		expect(query.params).toContain(sceneId);
		expect(query.params).toContain(3);

		const invalid = await GET(event({ url: new URL('http://localhost/?revision=-4') }) as never);
		expect(invalid.status).toBe(400);
		expect(mocks.getCachedSpatialPacket).toHaveBeenCalledTimes(1);
	});

	it('passes authorized case identity into reconciliation', async () => {
		const request = new Request('http://localhost/', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ sourceSha256: 'a'.repeat(64), revisionId: 3 })
		});
		const response = await POST(event({ request }) as never);
		expect(response.status).toBe(201);
		expect(mocks.reconcileSpatialKeyframe).toHaveBeenCalledWith(expect.objectContaining({ caseId, sceneId, revisionId: 3 }));
	});

	it('stops oversized streamed payloads before reconciliation', async () => {
		const request = new Request('http://localhost/', {
			method: 'POST',
			body: new Uint8Array(1024 * 1024 + 1)
		});
		const response = await POST(event({ request }) as never);
		expect(response.status).toBe(413);
		expect(mocks.reconcileSpatialKeyframe).not.toHaveBeenCalled();
	});
});
