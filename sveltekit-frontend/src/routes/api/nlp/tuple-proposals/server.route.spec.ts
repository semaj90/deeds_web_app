// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mapLangExtractDocumentationFactsToTupleProposalsV1 } from '$lib/server/atlas/integration/langextract-documentation-tuple-proposals-v1.js';
import { canonicalSha256V1 } from '$lib/server/atlas/prefill/canonical-hash-v1.js';

const mocks = vi.hoisted(() => ({
	resolveSourceBinding: vi.fn(),
	requestProposals: vi.fn(),
	resolveAuthority: vi.fn(),
	grantQuery: vi.fn(),
}));

vi.mock('$lib/server/atlas/identity/grounded-extraction-source-binding-v1.js', () => ({
	GroundedExtractionSourceBindingError: class extends Error {
		constructor(readonly code: string) { super(code); }
	},
	resolveGroundedExtractionSourceBindingV1: (...args: unknown[]) => mocks.resolveSourceBinding(...args),
}));

vi.mock('$lib/server/atlas/integration/langextract-documentation-tuple-proposals-v1.js', async (importOriginal) => ({
	...await importOriginal<typeof import('$lib/server/atlas/integration/langextract-documentation-tuple-proposals-v1.js')>(),
	requestLangExtractTupleProposalsV1: (...args: unknown[]) => mocks.requestProposals(...args),
}));

vi.mock('$lib/server/db/client.js', () => ({ pool: { query: mocks.grantQuery } }));
vi.mock('$lib/server/retrieval/trusted-workspace-authority-v1.js', () => ({
	resolveTrustedWorkspaceAuthorityV1: mocks.resolveAuthority,
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
		mocks.resolveAuthority.mockReset();
		mocks.grantQuery.mockReset();
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

	it('returns a byte-verified GraphRAG draft from an exact repository grant and keeps GraphRAG IDs pending', async () => {
		const { POST } = await import('./+server.js');
		const text = 'Ána calls Bob.';
		const sourceBytes = Buffer.from(text, 'utf8');
		const hash = createHash('sha256').update(sourceBytes).digest('hex');
		const sourceRevision = `sha256:${hash}`;
		const graphRag = {
			workspaceId: '12345678-1234-4123-8123-123456789abc',
			repositoryId: '12345678-1234-4123-8123-123456789abd',
		};
		const body = { ...validBody, text, sourceRevision, graphRag };
		mocks.resolveAuthority.mockResolvedValue({ status: 'TRUSTED', workspaceRevision: body.workspaceRevision });
		const mockMatchingGrant = () => mocks.grantQuery.mockResolvedValueOnce({ rows: [{
			actor_id: 'user-1', actor_type: 'USER', workspace_id: graphRag.workspaceId,
			repository_id: graphRag.repositoryId, workspace_revision: body.workspaceRevision,
			permitted_source_refs: [body.sourceRef], grant_revision: 'grant-1',
			status: 'GRANTED', issued_at: '2026-01-01T00:00:00Z',
		}] }).mockResolvedValueOnce({ rows: [{ revoked_at: null }] })
			.mockResolvedValueOnce({ rows: [{ grant_revision: 'grant-1' }] });
		mockMatchingGrant();
		mocks.resolveSourceBinding.mockResolvedValue({
			sourceRef: body.sourceRef, sourceRevision, workspaceRevision: body.workspaceRevision,
			sourceBindingChecksum: `sha256:${'c'.repeat(64)}`,
		});
		const sourceUrl = `atlas-source:${encodeURIComponent(body.sourceRef)}`;
		const batch = mapLangExtractDocumentationFactsToTupleProposalsV1({
			sourceBytes, sourceRef: body.sourceRef, sourceUrl, sourceRevision, workspaceRevision: body.workspaceRevision,
			response: {
				facts: [{
					schema: 'atlas.documentation-fact.v1', subject: 'Ána', predicate: 'calls', object: 'Bob',
					statement: text, evidenceText: text, sourceUrl, sourceRevision,
					startChar: 0, endChar: Array.from(text).length, startByte: 0, endByte: sourceBytes.length,
					alignmentStatus: 'MATCH_EXACT', productVersion: 'fixture-v1', confidence: 1,
					extractionMethod: 'fixture', customAttributesVersion: 'atlas.langextract-custom-attributes.v1',
					customAttributes: {}, canonicalAuthority: false,
				}],
				apiRules: [], modelId: 'fixture-model', provider: 'fixture', producerRevision: 'fixture-extractor-v1',
				inputHash: hash, outputHash: 'fixture-output-hash', generationControls: {}, alignmentSummary: {},
				canonicalAuthority: false,
			},
		});
		mocks.requestProposals.mockResolvedValue(batch);
		const send = () => POST({
			request: new Request('http://localhost/api/nlp/tuple-proposals', { method: 'POST', body: JSON.stringify(body) }),
			locals: { user: { id: 'user-1' } },
		} as any);
		const response = await send();
		const result = await response.json();
		expect(response.status, JSON.stringify(result)).toBe(200);
		expect(mocks.grantQuery.mock.calls[0][1]).toEqual(['user-1', graphRag.workspaceId, graphRag.repositoryId]);
		expect(mocks.resolveSourceBinding).toHaveBeenCalledWith(expect.objectContaining({ expectedRepositoryId: graphRag.repositoryId }));
		expect(result.graphRagDraft).toMatchObject({
			status: 'PROPOSAL_ONLY', proposedRelationshipCount: 1, canonicalAuthority: false, promotionEligible: false,
			textUnit: { text, textSha256: sourceRevision, document_id: null, n_tokens: null, entity_ids: [], relationship_ids: [] },
		});
		expect(result.proposals.proposals[0].tuple.evidenceSpan.end).toBe(sourceBytes.length);
		const { draftChecksum, ...draftBody } = result.graphRagDraft;
		expect(draftChecksum).toBe(`sha256:${canonicalSha256V1(draftBody)}`);
		expect(draftBody.proposalBatchChecksum).toBe(`sha256:${canonicalSha256V1(result.proposals)}`);
		expect(draftBody.relationshipReviewRefs).toEqual([{
			tupleId: batch.proposals[0].tuple.tupleId,
			textUnitCandidateId: draftBody.textUnit.provenance.candidateId,
			byteStart: 0, byteEnd: sourceBytes.length, evidenceSpanChecksum: sourceRevision,
		}]);

		mockMatchingGrant();
		const tampered = structuredClone(batch);
		tampered.proposals[0].tuple.surfaceText = 'Other text.';
		mocks.requestProposals.mockResolvedValue(tampered);
		const invalid = await send();
		expect(invalid.status).toBe(503);
		expect(await invalid.json()).not.toHaveProperty('graphRagDraft');

		mockMatchingGrant();
		mocks.requestProposals.mockResolvedValue({ ...batch, proposals: [batch.proposals[0], batch.proposals[0]] });
		const duplicate = await send();
		expect(duplicate.status).toBe(503);
		expect(await duplicate.json()).not.toHaveProperty('graphRagDraft');

		// A grant for the same source path in a different repository is insufficient.
		mocks.grantQuery.mockReset();
		mocks.grantQuery.mockResolvedValue({ rows: [] });
		mocks.resolveSourceBinding.mockClear();
		mocks.requestProposals.mockClear();
		expect((await send()).status).toBe(403);
		expect(mocks.resolveSourceBinding).not.toHaveBeenCalled();
		expect(mocks.requestProposals).not.toHaveBeenCalled();
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
