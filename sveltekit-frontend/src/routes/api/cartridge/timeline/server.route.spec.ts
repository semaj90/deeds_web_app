import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getChr97Timeline } = vi.hoisted(() => ({ getChr97Timeline: vi.fn() }));

vi.mock('$lib/server/grpc/chr97-agent-client.js', () => ({ getChr97Timeline }));

import { GET } from './+server.js';

function get(url: string, user: { id: string } | null) {
	return GET({
		url: new URL(url),
		locals: { user }
	} as unknown as Parameters<typeof GET>[0]);
}

describe('GET /api/cartridge/timeline', () => {
	beforeEach(() => vi.resetAllMocks());

	it('uses the authenticated actor instead of a query-string userId', async () => {
		getChr97Timeline.mockResolvedValue({ events: [], aiSummary: '', source: 'grpc' });
		const response = await get('http://localhost/api/cartridge/timeline?caseId=case-1&userId=other-actor', { id: 'signed-in-actor' });

		expect(response.status).toBe(200);
		expect(getChr97Timeline).toHaveBeenCalledWith('case-1', 'signed-in-actor');
	});

	it('does not call the timeline service for unauthenticated requests', async () => {
		const response = await get('http://localhost/api/cartridge/timeline?caseId=case-1&userId=other-actor', null);

		expect(response.status).toBe(401);
		expect(getChr97Timeline).not.toHaveBeenCalled();
	});

	it('returns a stable empty envelope when the timeline service is unavailable', async () => {
		getChr97Timeline.mockResolvedValue(null);
		const response = await get('http://localhost/api/cartridge/timeline?caseId=case-1', { id: 'signed-in-actor' });

		expect(await response.json()).toEqual({ events: [], aiSummary: '', source: 'unavailable', caseId: 'case-1' });
	});
});
