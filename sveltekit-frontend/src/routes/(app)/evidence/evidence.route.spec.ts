import { describe, expect, it } from 'vitest';
import { GET } from './+server.js';

describe('evidence route API compatibility', () => {
	it('redirects non-page GET requests to the canonical evidence API and preserves filters', async () => {
		const response = await GET({
			url: new URL('http://localhost/evidence?caseId=case-7&limit=20'),
		} as never);

		expect(response.status).toBe(307);
		expect(response.headers.get('location')).toBe('http://localhost/api/evidence?caseId=case-7&limit=20');
	});
});
