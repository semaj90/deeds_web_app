// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({ xadd: vi.fn(), publish: vi.fn(async () => 1) }));
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => redis }));

import { publishStreamEvent, publishTokenDelta } from './redis-streams';

describe('publishTokenDelta (producer-owned append-once)', () => {
	beforeEach(() => {
		redis.xadd.mockReset();
		redis.publish.mockClear();
	});

	it('appends once, then publishes the stream ID as eventId', async () => {
		redis.xadd.mockResolvedValueOnce('1730000000000-3');
		const id = await publishTokenDelta('chat-1', 'updates:chat-1', 3, 'hello');

		expect(id).toBe('1730000000000-3');
		expect(redis.xadd).toHaveBeenCalledTimes(1);
		expect(redis.xadd.mock.calls[0][0]).toBe('stream:tokens:chat-1');
		expect(redis.publish).toHaveBeenCalledTimes(1);
		expect(redis.publish).toHaveBeenCalledWith(
			'updates:chat-1',
			JSON.stringify({ type: 'delta', content: 'hello', seq: 3, eventId: '1730000000000-3' }),
		);
		// persisted before it was published
		expect(redis.xadd.mock.invocationCallOrder[0]).toBeLessThan(redis.publish.mock.invocationCallOrder[0]);
	});

	it('still delivers live, without an eventId, when persistence fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		redis.xadd.mockRejectedValueOnce(new Error('OOM'));
		const id = await publishTokenDelta('chat-1', 'updates:chat-1', 4, 'world');

		expect(id).toBeNull();
		expect(redis.publish).toHaveBeenCalledWith('updates:chat-1', JSON.stringify({ type: 'delta', content: 'world', seq: 4 }));
		warn.mockRestore();
	});
});

describe('publishStreamEvent (terminal events, append-once)', () => {
	beforeEach(() => {
		redis.xadd.mockReset();
		redis.publish.mockClear();
	});

	it('persists the event with its payload, then publishes it with the stream ID; type and eventId win', async () => {
		redis.xadd.mockResolvedValueOnce('1730000000000-9');
		const id = await publishStreamEvent('chat-1', 'updates:chat-1', 'AI_REPLY', { content: 'hi', type: 'spoofed', eventId: 'x' });

		expect(id).toBe('1730000000000-9');
		const args = redis.xadd.mock.calls[0] as string[];
		expect(args[0]).toBe('stream:tokens:chat-1');
		expect(JSON.parse(args[args.indexOf('meta') + 1])).toEqual({ event: 'AI_REPLY', payload: { content: 'hi', type: 'spoofed', eventId: 'x' } });
		expect(redis.publish).toHaveBeenCalledWith(
			'updates:chat-1',
			JSON.stringify({ content: 'hi', type: 'AI_REPLY', eventId: '1730000000000-9' }),
		);
		expect(redis.xadd.mock.invocationCallOrder[0]).toBeLessThan(redis.publish.mock.invocationCallOrder[0]);
	});

	it('marks done as a stream sentinel so consumeTokenStream exits on it', async () => {
		redis.xadd.mockResolvedValueOnce('1730000000000-10');
		await publishStreamEvent('chat-1', 'updates:chat-1', 'done');
		const args = redis.xadd.mock.calls[0] as string[];
		expect(JSON.parse(args[args.indexOf('meta') + 1])).toMatchObject({ event: 'done', done: true });
	});

	it('still delivers live, without an eventId, when persistence fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		redis.xadd.mockRejectedValueOnce(new Error('OOM'));
		const id = await publishStreamEvent('chat-1', 'updates:chat-1', 'error', { error: 'boom' });
		expect(id).toBeNull();
		expect(redis.publish).toHaveBeenCalledWith('updates:chat-1', JSON.stringify({ error: 'boom', type: 'error' }));
		warn.mockRestore();
	});
});
