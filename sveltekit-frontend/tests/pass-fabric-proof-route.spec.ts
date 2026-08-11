// @vitest-environment node
/**
 * Route: src/routes/api/admin/atlas/pass-fabric/proof/+server.ts
 *
 * Relocated from the colocated `+server.test.ts` (2026-08-11) — SvelteKit's
 * Vite plugin reserves the `+`-prefixed filename under src/routes/, so it
 * never actually ran ("Files prefixed with + are reserved"). Flat tests/
 * location matches the working tests/ace-status-route.spec.ts convention.
 */

import { describe, expect, it } from 'vitest';

describe('GET /api/admin/atlas/pass-fabric/proof', () => {
	it('rejects unauthenticated requests', async () => {
		const { GET } = await import('../src/routes/api/admin/atlas/pass-fabric/proof/+server.js');
		const response = await GET({ locals: {} } as never);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: 'Unauthorized' });
	});

	it('returns the wired PF4 proof snapshot when authenticated', async () => {
		const { GET } = await import('../src/routes/api/admin/atlas/pass-fabric/proof/+server.js');
		const response = await GET({ locals: { user: { id: 'tester' } } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.summary.total).toBe(1);
		expect(body.summary.proofState).toBe('wired');
		expect(body.receipts[0].lane).toBe('PF4');
		expect(body.receipts[0].canonical_representation_id).toBe('semantic_768');
	});
});
