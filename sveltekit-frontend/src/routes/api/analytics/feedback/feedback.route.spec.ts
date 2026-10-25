import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	execute: vi.fn(),
	insertValues: vi.fn(),
	recordReward: vi.fn(),
}));

vi.mock('$lib/server/db/client.js', () => ({
	db: {
		execute: (...args: unknown[]) => mocks.execute(...args),
		insert: () => ({ values: (...args: unknown[]) => mocks.insertValues(...args) }),
	},
}));
vi.mock('$lib/server/db/schema/context-timeline.js', () => ({
	contextTimeline: {},
}));
vi.mock('$lib/server/features/ai/ace/packet-reward-writer.js', () => ({
	recordReward: (...args: unknown[]) => mocks.recordReward(...args),
}));
vi.mock('drizzle-orm', () => ({
	sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ text: Array.from(strings).join('?'), values }),
}));

import { POST } from './+server.js';

const packetUuid = '6b2749f6-03d8-42b7-a4e0-93983c62cc1d';

function request() {
	return {
		json: async () => ({ eventType: 'feedback', signal: 'thumbs_up', packetUuid }),
	};
}

describe('analytics feedback packet ownership', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execute.mockResolvedValue({ rows: [{ packet_uuid: packetUuid }] });
		mocks.insertValues.mockResolvedValue(undefined);
		mocks.recordReward.mockResolvedValue(undefined);
	});

	it('requires an authenticated numeric actor before packet feedback', async () => {
		const response = await POST({ request: request(), locals: {} } as never);
		expect(response.status).toBe(401);
		expect(mocks.execute).not.toHaveBeenCalled();
		expect(mocks.insertValues).not.toHaveBeenCalled();
	});

	it('refuses packets not owned by the authenticated actor', async () => {
		mocks.execute.mockResolvedValueOnce({ rows: [] });
		const response = await POST({ request: request(), locals: { user: { id: '7' } } } as never);
		expect(response.status).toBe(404);
		expect(mocks.insertValues).not.toHaveBeenCalled();
		expect(mocks.recordReward).not.toHaveBeenCalled();
	});

	it('records reward only after the authenticated actor owns the packet', async () => {
		const response = await POST({ request: request(), locals: { user: { id: '7' } } } as never);
		expect(response.status).toBe(200);
		expect(mocks.execute).toHaveBeenCalledTimes(1);
		expect((mocks.execute.mock.calls[0][0] as { text: string }).text).toContain('user_id');
		expect(mocks.recordReward).toHaveBeenCalledWith({ packetUuid, accepted: true, rejected: false, cited: false });
	});
});
