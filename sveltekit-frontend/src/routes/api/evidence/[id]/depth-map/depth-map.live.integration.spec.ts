import { describe, expect, it } from 'vitest';
import { GET } from './+server.js';

const evidenceId = process.env.PARENT_ATLAS_LIVE_DEPTH_EVIDENCE_ID;
const actorId = process.env.PARENT_ATLAS_LIVE_DEPTH_ACTOR_ID;

describe('live evidence depth-map integration (read-only)', () => {
	it('serves only a verified real artifact or returns an explicit unavailable response', async () => {
		expect(evidenceId, 'set PARENT_ATLAS_LIVE_DEPTH_EVIDENCE_ID to an image row you may read').toBeTruthy();
		expect(actorId, 'set PARENT_ATLAS_LIVE_DEPTH_ACTOR_ID to an authorized actor').toBeTruthy();

		const response = await GET({
			params: { id: evidenceId! },
			locals: { user: { id: actorId! } },
		} as never);

		if (response.status === 200) {
			console.info('[live-depth] real artifact returned with verified SHA-256');
			expect(response.headers.get('x-depth-verification')).toBe('sha256-verified');
			expect(response.headers.get('content-type')).toBe('image/png');
			const bytes = Buffer.from(await response.arrayBuffer());
			expect(bytes.length).toBeGreaterThanOrEqual(24);
			expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
			return;
		}

		expect(response.status).toBe(404);
		const body = await response.json();
		expect([
			'No source-revision-bound depth map is available',
			'Depth map location is invalid',
			'Depth map binding is invalid',
			'A verified depth map is unavailable',
		]).toContain(body.error);
		console.info(`[live-depth] no verified artifact: ${body.error}`);
	});
});
