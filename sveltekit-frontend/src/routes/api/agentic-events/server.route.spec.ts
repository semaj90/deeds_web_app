// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

const status = vi.hoisted(() => ({
	jobId: 'none',
	startTime: 0,
	status: 'idle',
	centroidCount: 15,
	documentsProcessed: 0,
	cacheInvalidated: false,
}));

vi.mock('$lib/server/ml/topic-clustering-worker.js', () => ({
	getClusteringStatus: () => status,
}));

import { GET } from './+server.js';

async function open(signal: AbortSignal): Promise<Response> {
	return GET({ request: new Request('http://localhost/api/agentic-events', { signal }) } as never);
}

describe('/api/agentic-events SSE', () => {
	it('is served as an event stream and sends byte chunks (connected + status)', async () => {
		const ac = new AbortController();
		const res = await open(ac.signal);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/event-stream');

		const reader = res.body!.getReader();
		let text = '';
		while (!text.includes('event: status')) {
			const { value, done } = await reader.read();
			if (done) break;
			expect(value).toBeInstanceOf(Uint8Array);
			text += new TextDecoder().decode(value);
		}
		expect(text).toContain(': connected');
		expect(text).toContain(`data: ${JSON.stringify(status)}`);
		ac.abort();
	});

	it('survives a client disconnect: abort then cancel never throws ERR_INVALID_STATE', async () => {
		const ac = new AbortController();
		const res = await open(ac.signal);
		const reader = res.body!.getReader();
		await reader.read();

		const unhandled = vi.fn();
		process.on('uncaughtException', unhandled);
		ac.abort();
		await reader.cancel().catch(() => {});
		ac.abort();
		await new Promise((r) => setTimeout(r, 50));
		process.off('uncaughtException', unhandled);

		expect(unhandled).not.toHaveBeenCalled();
	});

	it('does not start streaming for a request that is already aborted', async () => {
		const ac = new AbortController();
		ac.abort();
		const res = await open(ac.signal);
		const reader = res.body!.getReader();
		const chunks: string[] = [];
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			chunks.push(new TextDecoder().decode(value));
		}
		// stream must terminate on its own instead of hanging on intervals
		expect(chunks.join('')).not.toContain('pipeline_error');
	});
});
