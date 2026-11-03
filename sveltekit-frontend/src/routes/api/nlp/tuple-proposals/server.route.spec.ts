// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	resolveSourceBinding: vi.fn(),
	requestProposals: vi.fn(),
}));

vi.mock('$lib/server/atlas/identity/grounded-extraction-source-binding-v1.js', () => ({
	GroundedExtractionSourceBindingError: class extends Error {
		constructor(readonly code: string) { super(code); }
	},
	resolveGroundedExtractionSourceBindingV1: (...args: unknown[]) => mocks.resolveSourceBinding(...args),
}));

vi.mock('$lib/server/atlas/integration/langextract-documentation-tuple-proposals-v1.js', () => ({
	requestLangExtractTupleProposalsV1: (...args: unknown[]) => mocks.requestProposals(...args),
}));

const validBody = {
	text: 'The agreement is governed by statute.',
	packetKey: 'packet:fixture-1',
	sourceRef: 'docs/agreement.txt',
	sourceRevision: `sha256:${'a'.repeat(64)}`,
	workspaceRevision: `sha256:${'b'.repeat(64)}`,
};

describe('/api/nlp/tuple-proposals', () => {
	beforeEach(() => {
		mocks.resolveSourceBinding.mockReset();
		mocks.requestProposals.mockReset();
		mocks.resolveSourceBinding.mockResolvedValue({
			schema: 'atlas.grounded-extraction-source-binding-receipt.v1',
			status: 'VERIFIED_SOURCE_BINDING',
			canonicalAuthority: false,
			writesPerformed: false,
		});
		mocks.requestProposals.mockResolvedValue({
			schema: 'atlas.langextract-tuple-proposal-batch.v1',
			status: 'PROPOSED',
			proposals: [],
			canonicalAuthority: false,
			writesPerformed: false,
		});
	});

	it('verifies canonical source binding before requesting read-only tuple proposals', async () => {
		const { POST } = await import('./+server.js');
		const request = new Request('http://localhost/api/nlp/tuple-proposals', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(validBody),
		});
		const response = await POST({ request, locals: { user: { id: 'user-1' } } } as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(mocks.resolveSourceBinding).toHaveBeenCalledWith(expect.objectContaining({
			packetKey: validBody.packetKey,
			sourceRef: validBody.sourceRef,
			submittedText: validBody.text,
		}));
		expect(mocks.requestProposals).toHaveBeenCalledWith(expect.objectContaining({
			sourceRef: validBody.sourceRef,
			workspaceRevision: validBody.workspaceRevision,
		}));
		expect(payload.canonicalAuthority).toBe(false);
		expect(payload.writesPerformed).toBe(false);
		expect(payload.promotionEligible).toBe(false);
	});

	it('does not call extraction when source binding is rejected', async () => {
		mocks.resolveSourceBinding.mockRejectedValue(new Error('SOURCE_REVISION_BINDING_MISMATCH'));
		const { POST } = await import('./+server.js');
		const request = new Request('http://localhost/api/nlp/tuple-proposals', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(validBody),
		});
		const response = await POST({ request, locals: { user: { id: 'user-1' } } } as any);

		expect(response.status).toBe(503);
		expect(mocks.requestProposals).not.toHaveBeenCalled();
	});

	it('rejects unauthenticated and oversized requests before database or sidecar access', async () => {
		const { POST } = await import('./+server.js');
		const unauthorized = await POST({
			request: new Request('http://localhost/api/nlp/tuple-proposals', {
				method: 'POST', body: JSON.stringify(validBody),
			}),
			locals: {},
		} as any);
		const oversized = await POST({
			request: new Request('http://localhost/api/nlp/tuple-proposals', {
				method: 'POST', body: JSON.stringify({ ...validBody, text: 'x'.repeat(10_001) }),
			}),
			locals: { user: { id: 'user-1' } },
		} as any);

		expect(unauthorized.status).toBe(401);
		expect(oversized.status).toBe(413);
		expect(mocks.resolveSourceBinding).not.toHaveBeenCalled();
		expect(mocks.requestProposals).not.toHaveBeenCalled();
	});
});
