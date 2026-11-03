import { describe, expect, it } from 'vitest';
import { POST } from './+server.js';

const evidenceId = process.env.PARENT_ATLAS_LIVE_EVIDENCE_ID;
const actorId = Number(process.env.PARENT_ATLAS_LIVE_EVIDENCE_ACTOR_ID);
const pdfEvidenceId = process.env.PARENT_ATLAS_LIVE_PDF_EVIDENCE_ID;
const pdfActorId = Number(process.env.PARENT_ATLAS_LIVE_PDF_ACTOR_ID);
const imageInputsAvailable = Boolean(evidenceId && Number.isInteger(actorId) && actorId > 0);
const pdfInputsAvailable = Boolean(pdfEvidenceId && Number.isInteger(pdfActorId) && pdfActorId > 0);

describe('live evidence upscale integration (read-only)', () => {
	it.skipIf(!imageInputsAvailable)('authorizes a live evidence row, reads its SeaweedFS object and returns an in-memory PNG preview', async () => {
		const event = {
			params: { id: evidenceId! },
			locals: { user: { id: actorId } },
			request: new Request('http://localhost/api/evidence/live/upscale', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ scale: 2 }),
			}),
		} as unknown as Parameters<typeof POST>[0];

		const response = await POST(event);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('image/png');
		expect(response.headers.get('cache-control')).toBe('private, no-store');
		expect(response.headers.get('x-upscale-method')).toBe('lanczos3');

		const image = Buffer.from(await response.arrayBuffer());
		expect(image.byteLength).toBeGreaterThan(8);
		expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		const sharp = (await import('sharp')).default;
		const metadata = await sharp(image).metadata();
		expect(metadata.format).toBe('png');
		expect(metadata.width).toBeGreaterThan(0);
		expect(metadata.height).toBeGreaterThan(0);
		expect(response.headers.get('x-upscale-size')).toBe(`${metadata.width}x${metadata.height}`);
	});

	it.skipIf(!imageInputsAvailable)('does not disclose an image to an unauthorized actor', async () => {
		const event = {
			params: { id: evidenceId! },
			locals: { user: { id: 0 } },
			request: new Request('http://localhost/api/evidence/live/upscale', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ scale: 2 }),
			}),
		} as unknown as Parameters<typeof POST>[0];

		const response = await POST(event);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Evidence not found' });
	});

	it.skipIf(!pdfInputsAvailable)('rejects an authorized live PDF before object retrieval', async () => {
		const event = {
			params: { id: pdfEvidenceId! },
			locals: { user: { id: pdfActorId } },
			request: new Request('http://localhost/api/evidence/live/upscale', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ scale: 2 }),
			}),
		} as unknown as Parameters<typeof POST>[0];

		const response = await POST(event);
		expect(response.status).toBe(415);
		expect(await response.json()).toEqual({ error: 'Evidence is not an image' });
	});
});
