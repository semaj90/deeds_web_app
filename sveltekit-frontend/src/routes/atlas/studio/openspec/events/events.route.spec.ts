import { describe, expect, it } from 'vitest';
import { GET } from './+server.js';

describe('OpenSpec events stream access', () => {
	it('rejects anonymous callers before opening the report stream', async () => {
		const event = {
			request: new Request('http://localhost/atlas/studio/openspec/events'),
			locals: { user: null }
		} as unknown as Parameters<typeof GET>[0];

		const response = await GET(event);
		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toBe('Unauthorized');
	});
});
