// @vitest-environment node
/**
 * Route: src/routes/api/admin/atlas/phase-lanes/+server.ts
 *
 * Moved from the colocated `+server.test.ts` (2026-08-11) — SvelteKit's Vite
 * plugin reserves the `+`-prefixed filename under src/routes/, so vitest's
 * collector silently skipped that file ("Files prefixed with + are reserved").
 * It never actually ran. This flat tests/*.spec.ts location matches the
 * working convention used by tests/ace-status-route.spec.ts.
 */

import { describe, expect, it } from 'vitest';

describe('GET /api/admin/atlas/phase-lanes', () => {
  it('rejects unauthenticated requests', async () => {
    const { GET } = await import('../src/routes/api/admin/atlas/phase-lanes/+server.js');
    const response = await GET({ locals: {} } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns the mock phase lane snapshot when authenticated', async () => {
    const { GET } = await import('../src/routes/api/admin/atlas/phase-lanes/+server.js');
    const response = await GET({ locals: { user: { id: 'tester' } } } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary.total).toBe(15);
    expect(body.phases[0].canonical_representation_id).toBe('semantic_768');
    expect(
      body.phases.every((phase: { execution_mode: string }) => phase.execution_mode === 'mock'),
    ).toBe(true);
  });
});
