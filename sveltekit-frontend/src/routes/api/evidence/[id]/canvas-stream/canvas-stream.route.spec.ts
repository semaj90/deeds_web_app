// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './+server.js';
import { clearEvidenceCanvasCommandsForTestV1 } from '$lib/server/evidence/evidence-canvas-command-bus-v1.js';

const EV_ID = '22222222-2222-4222-8222-222222222222';

function makeGetEvent(options: {
	id?: string;
	stream?: boolean;
	accept?: string;
	user?: { id: string } | null;
} = {}) {
	const id = options.id ?? EV_ID;
	const url = new URL(`http://localhost/api/evidence/${id}/canvas-stream${options.stream ? '?stream=1' : ''}`);
	const headers = new Headers();
	if (options.accept) headers.set('accept', options.accept);
	return {
		params: { id },
		url,
		locals: { user: options.user === undefined ? { id: '7' } : options.user },
		request: new Request(url, { method: 'GET', headers })
	} as never;
}

function makePostEvent(body: unknown, options: { id?: string; user?: { id: string } | null } = {}) {
	const id = options.id ?? EV_ID;
	return {
		params: { id },
		locals: { user: options.user === undefined ? { id: '7' } : options.user },
		request: new Request(`http://localhost/api/evidence/${id}/canvas-stream`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		})
	} as never;
}

describe('GET/POST /api/evidence/[id]/canvas-stream', () => {
	beforeEach(() => {
		clearEvidenceCanvasCommandsForTestV1();
	});

	it('publishes valid MCP canvas commands and returns recent commands via JSON GET', async () => {
		const postRes = await POST(
			makePostEvent({
				command: 'evidence.add_pin',
				x: 0.42,
				y: 0.18,
				label: 'Forged signature'
			})
		);
		expect(postRes.status).toBe(201);
		const postJson = await postRes.json();
		expect(postJson.ok).toBe(true);
		expect(postJson.evidenceId).toBe(EV_ID);
		expect(postJson.envelope.command).toEqual({
			command: 'evidence.add_pin',
			x: 0.42,
			y: 0.18,
			label: 'Forged signature'
		});

		const getRes = await GET(makeGetEvent());
		expect(getRes.status).toBe(200);
		const getJson = await getRes.json();
		expect(getJson).toEqual({
			ok: true,
			evidenceId: EV_ID,
			commands: [postJson.envelope],
			error: null
		});
	});

	it('streams connected and live canvas-command SSE events', async () => {
		const sseRes = await GET(makeGetEvent({ stream: true }));
		expect(sseRes.status).toBe(200);
		expect(sseRes.headers.get('content-type')).toBe('text/event-stream');

		const reader = sseRes.body!.getReader();
		const decoder = new TextDecoder();

		const first = await reader.read();
		expect(first.done).toBe(false);
		const connectedChunk = decoder.decode(first.value);
		expect(connectedChunk).toContain('event: connected');
		expect(connectedChunk).toContain(EV_ID);

		const postRes = await POST(
			makePostEvent({
				command: 'video.seek_keyframe',
				timestampMs: 14200,
				dhashHex: '0123456789abcdef'
			})
		);
		expect(postRes.status).toBe(201);

		const second = await reader.read();
		expect(second.done).toBe(false);
		const commandChunk = decoder.decode(second.value);
		expect(commandChunk).toContain('event: canvas-command');
		expect(commandChunk).toContain('"command":"video.seek_keyframe"');
		expect(commandChunk).toContain('"timestampMs":14200');

		await reader.cancel();
	});

	it('rejects invalid commands, out-of-bounds rectangles, invalid UUIDs, and unauthorized callers', async () => {
		const invalidCmd = await POST(
			makePostEvent({
				command: 'evidence.add_rect',
				x: 0.8,
				y: 0.2,
				width: 0.5,
				height: 0.2
			})
		);
		expect(invalidCmd.status).toBe(400);
		const invalidJson = await invalidCmd.json();
		expect(invalidJson.ok).toBe(false);

		const malformedJson = await POST(makePostEvent('{bad json'));
		expect(malformedJson.status).toBe(400);

		const badGet = await GET(makeGetEvent({ id: 'not-a-uuid' }));
		expect(badGet.status).toBe(400);
		const badGetJson = await badGet.json();
		expect(badGetJson).toEqual({
			ok: false,
			evidenceId: 'not-a-uuid',
			commands: [],
			error: 'Invalid evidence ID'
		});

		const unauthGet = await GET(makeGetEvent({ user: null }));
		expect(unauthGet.status).toBe(401);
		expect(await unauthGet.json()).toEqual({
			ok: false,
			evidenceId: EV_ID,
			commands: [],
			error: 'Unauthorized'
		});
	});
});
