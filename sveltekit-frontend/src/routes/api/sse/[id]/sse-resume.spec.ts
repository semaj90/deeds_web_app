// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sub = vi.hoisted(() => ({
	handlers: {} as Record<string, (channel: string, message: string) => void>,
	subscribe: vi.fn(async () => 1),
	unsubscribe: vi.fn(async () => 1),
}));
const readTokenStream = vi.hoisted(() => vi.fn());
const produceTokenChunk = vi.hoisted(() => vi.fn());

class FakeSubscriber {
	status = 'ready';
	on(event: string, fn: (channel: string, message: string) => void) {
		sub.handlers[event] = fn;
		return this;
	}
	subscribe = sub.subscribe;
	unsubscribe = sub.unsubscribe;
}
// The route builds its subscriber from the shared client (options-based), not from REDIS_URL.
vi.mock('$lib/server/redis.js', () => ({ getRedis: () => ({ duplicate: () => new FakeSubscriber() }) }));
vi.mock('$lib/server/redis-streams.js', () => ({ readTokenStream, produceTokenChunk }));

import { GET } from './+server';

const CHAT = '3b241101-e2bb-4255-8caf-4136c566a962';
const CHANNEL = `updates:${CHAT}`;

function call(opts: { user?: unknown; id?: string; headers?: Record<string, string>; query?: string } = {}) {
	const url = new URL(`http://localhost/api/sse/${opts.id ?? CHAT}${opts.query ?? ''}`);
	return GET({
		params: { id: opts.id ?? CHAT },
		request: new Request(url, { headers: opts.headers }),
		locals: { user: 'user' in opts ? opts.user : { id: 1 } },
		url,
	} as never);
}

class Reader {
	private reader: ReadableStreamDefaultReader<Uint8Array>;
	private decoder = new TextDecoder();
	text = '';
	constructor(res: Response) {
		this.reader = res.body!.getReader();
	}
	async until(predicate: (text: string) => boolean, ms = 2000) {
		const deadline = Date.now() + ms;
		while (!predicate(this.text)) {
			const left = deadline - Date.now();
			if (left <= 0) break;
			const r = await Promise.race([
				this.reader.read(),
				new Promise<{ done: true; value: undefined }>((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), left)),
			]);
			if (r.done) break;
			this.text += this.decoder.decode(r.value);
		}
		return this.text;
	}
	cancel() {
		return this.reader.cancel();
	}
}

const live = (data: Record<string, unknown>) => sub.handlers.message(CHANNEL, JSON.stringify(data));
const count = (text: string, needle: string) => text.split(needle).length - 1;
const entry = (id: string, seq: number, chunk: string) => ({ id, seq, chunk, meta: {}, done: false });

let reader: Reader | null = null;
beforeEach(() => {
	readTokenStream.mockReset();
	produceTokenChunk.mockReset();
	sub.subscribe.mockClear();
	sub.unsubscribe.mockClear();
});
afterEach(async () => {
	await reader?.cancel();
	reader = null;
});

describe('/api/sse/[id] resumable delivery', () => {
	it('rejects unauthenticated and malformed requests', async () => {
		expect((await call({ user: null })).status).toBe(401);
		expect((await call({ id: 'not valid!' })).status).toBe(400);
	});

	it('sends the stream ID as the SSE id for live deltas and never appends from the subscriber', async () => {
		const res = await call();
		reader = new Reader(res);
		await reader.until((t) => t.includes('event: ready'));
		live({ type: 'delta', content: 'hello', seq: 0, eventId: '1730000000000-1' });
		const text = await reader.until((t) => t.includes('hello'));

		expect(text).toContain('id: 1730000000000-1\nevent: message\n');
		expect(readTokenStream).not.toHaveBeenCalled();
		expect(produceTokenChunk).not.toHaveBeenCalled();
	});

	it('relays ephemeral messages without an id', async () => {
		reader = new Reader(await call());
		await reader.until((t) => t.includes('event: ready'));
		live({ type: 'presence', userId: '7' });
		const text = await reader.until((t) => t.includes('presence'));
		const block = text.slice(text.lastIndexOf('event: message'));
		expect(block).toContain('presence');
		expect(text.slice(text.indexOf('event: ready'))).not.toContain('id: ');
	});

	it('resumes strictly after Last-Event-ID, with ids, flagged replayed, before ready', async () => {
		readTokenStream.mockResolvedValueOnce([entry('1730000000000-6', 6, 'six '), entry('1730000000000-7', 7, 'seven')]);
		reader = new Reader(await call({ headers: { 'Last-Event-ID': '1730000000000-5' } }));
		const text = await reader.until((t) => t.includes('event: ready'));

		expect(readTokenStream).toHaveBeenCalledWith(CHAT, '(1730000000000-5', 100);
		expect(text).toContain('id: 1730000000000-6\nevent: message\n');
		expect(text).toContain('id: 1730000000000-7\nevent: message\n');
		expect(count(text, '"replayed":true')).toBe(2);
		expect(text.indexOf('seven')).toBeLessThan(text.indexOf('event: ready'));
		expect(text).toContain('"resumedFrom":"1730000000000-5"');
	});

	it('replays terminal events (AI_REPLY, error, done) saved after the cursor, with their payloads', async () => {
		readTokenStream.mockResolvedValueOnce([
			entry('1730000000000-6', 6, 'six'),
			{ id: '1730000000000-7', seq: 0, chunk: '', meta: { event: 'AI_REPLY', payload: { content: 'final answer', confidence: 0.9 } }, done: false },
			{ id: '1730000000000-8', seq: 0, chunk: '', meta: { event: 'done' , done: true, payload: {} }, done: true },
		]);
		reader = new Reader(await call({ headers: { 'Last-Event-ID': '1730000000000-5' } }));
		const text = await reader.until((t) => t.includes('event: ready'));

		expect(text).toContain('id: 1730000000000-7\nevent: message\n');
		expect(text).toContain('"type":"AI_REPLY"');
		expect(text).toContain('"content":"final answer"');
		expect(text).toContain('id: 1730000000000-8\nevent: message\n');
		expect(text).toContain('"type":"done"');
		expect(text.indexOf('"type":"done"')).toBeLessThan(text.indexOf('event: ready'));
	});

	it('does not let a stored payload override the stream identity of a replayed event', async () => {
		readTokenStream.mockResolvedValueOnce([
			{ id: '1730000000000-7', seq: 0, chunk: '', meta: { event: 'AI_REPLY', payload: { type: 'spoofed', eventId: '9999999999999-0' } }, done: false },
		]);
		reader = new Reader(await call({ headers: { 'Last-Event-ID': '1730000000000-5' } }));
		const text = await reader.until((t) => t.includes('event: ready'));

		expect(text).toContain('id: 1730000000000-7\n');
		expect(text).toContain('"type":"AI_REPLY"');
		expect(text).not.toContain('spoofed');
		expect(text).not.toContain('9999999999999-0');
	});

	it('closes the replay/live gap and drops duplicates', async () => {
		readTokenStream.mockImplementationOnce(async () => {
			// These arrive while replay is still running (after we subscribed).
			live({ type: 'delta', content: 'dup', seq: 7, eventId: '1730000000000-7' });
			live({ type: 'delta', content: 'fresh', seq: 8, eventId: '1730000000000-8' });
			return [entry('1730000000000-6', 6, 'six'), entry('1730000000000-7', 7, 'seven')];
		});
		reader = new Reader(await call({ headers: { 'last-event-id': '1730000000000-5' } }));
		const text = await reader.until((t) => t.includes('fresh'));

		expect(count(text, 'id: 1730000000000-7\n')).toBe(1); // not delivered twice
		expect(text).not.toContain('"content":"dup"');
		expect(text).toContain('id: 1730000000000-8\n');
		expect(text.indexOf('fresh')).toBeGreaterThan(text.indexOf('event: ready'));
	});

	it('ignores a malformed cursor and never queries the stream with it', async () => {
		reader = new Reader(await call({ headers: { 'Last-Event-ID': '1730; FLUSHALL' } }));
		const text = await reader.until((t) => t.includes('event: ready'));
		expect(readTokenStream).not.toHaveBeenCalled();
		expect(text).toContain('"resumedFrom":null');
	});

	it('accepts the lastEventId query parameter for manual reconnects', async () => {
		readTokenStream.mockResolvedValueOnce([]);
		reader = new Reader(await call({ query: '?lastEventId=1730000000000-9' }));
		await reader.until((t) => t.includes('event: ready'));
		expect(readTokenStream).toHaveBeenCalledWith(CHAT, '(1730000000000-9', 100);
	});

	it('asks the client to resync when replay is unavailable, and keeps streaming', async () => {
		readTokenStream.mockRejectedValueOnce(new Error('valkey down'));
		reader = new Reader(await call({ headers: { 'Last-Event-ID': '1730000000000-5' } }));
		await reader.until((t) => t.includes('event: ready'));
		live({ type: 'delta', content: 'still-live', seq: 1, eventId: '1730000000000-9' });
		const text = await reader.until((t) => t.includes('still-live'));

		expect(text).toContain('event: resync');
		expect(text).toContain('REPLAY_UNAVAILABLE');
		expect(text).toContain('id: 1730000000000-9\n');
	});

	it('pages through long replays using the last returned ID as the next exclusive cursor', async () => {
		const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => entry(`1730000000000-${from + i}`, from + i, `t${from + i} `));
		readTokenStream.mockResolvedValueOnce(page(10, 100)).mockResolvedValueOnce(page(110, 3));
		reader = new Reader(await call({ headers: { 'Last-Event-ID': '1730000000000-9' } }));
		const text = await reader.until((t) => t.includes('event: ready'));

		expect(readTokenStream).toHaveBeenNthCalledWith(1, CHAT, '(1730000000000-9', 100);
		expect(readTokenStream).toHaveBeenNthCalledWith(2, CHAT, '(1730000000000-109', 100);
		expect(count(text, '"replayed":true')).toBe(103);
	});

	it('unsubscribes when the client disconnects', async () => {
		reader = new Reader(await call());
		await reader.until((t) => t.includes('event: ready'));
		await reader.cancel();
		reader = null;
		await vi.waitFor(() => expect(sub.unsubscribe).toHaveBeenCalledWith(CHANNEL));
	});
});
