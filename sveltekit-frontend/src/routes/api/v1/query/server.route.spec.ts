// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ assembleACEContext: vi.fn() }));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
	assembleACEContext: (...args: unknown[]) => mocks.assembleACEContext(...args),
}));

const clientOwnedRevisionFields = [
	'workspaceRevision',
	'candidateSnapshotRevision',
	'ordinalMapChecksum',
	'representationRevision',
	'featureRevision',
	'retrievalPolicyRevision',
	'contextPolicyRevision',
	'graphRevision',
	'modelRevision',
	'dimension',
];

describe('/api/v1/query cache identity boundary', () => {
	beforeEach(() => mocks.assembleACEContext.mockReset());

	it.each(clientOwnedRevisionFields)('rejects client-owned %s before retrieval', async (field) => {
		const { POST } = await import('./+server.js');
		const request = new Request('http://localhost/api/v1/query', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query: 'grounded query', [field]: 'attacker-selected-revision' }),
		});

		const response = await POST({ request, locals: { user: { id: 'user-1' } } } as never);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			ok: false,
			error: 'Cache identity revisions are server-owned',
		});
		expect(mocks.assembleACEContext).not.toHaveBeenCalled();
	});
});
