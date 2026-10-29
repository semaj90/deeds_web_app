// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sanitizeBrowserContext = vi.hoisted(() => vi.fn());
const getValkeyClient = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/admin/browser-context-sanitizer.js', () => ({
	sanitizeBrowserContext,
	emptyContext: vi.fn(() => ({ captured_at: '', session_id: '', tabs: [], snippets: [], history_hits: [], embed_device: 'unavailable' })),
}));
vi.mock('$lib/server/cache/valkey-client.js', () => ({ getValkeyClient }));

import { POST } from './+server.js';

describe('POST /api/browser-context/snapshot', () => {
	beforeEach(() => {
		sanitizeBrowserContext.mockReset().mockReturnValue({
			context: {},
			stats: {
				tabs_dropped: 0,
				snippets_dropped: 0,
				history_hits_dropped: 0,
				urls_redacted: 0,
				snippet_redactions: 0,
				forbidden_schemes_seen: 0,
			},
			rejected_reason: 'invalid snapshot',
		});
		getValkeyClient.mockReset();
	});

	it('rejects an invalid envelope before invoking sanitization or storage', async () => {
		const request = new Request('http://localhost/api/browser-context/snapshot', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tabs: [{}] }),
		});

		const response = await POST({ request, locals: { user: { id: 'user-1' } } } as any);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: false, rejected_reason: expect.any(String) });
		expect(sanitizeBrowserContext).not.toHaveBeenCalled();
		expect(getValkeyClient).not.toHaveBeenCalled();
	});
});
