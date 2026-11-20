import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './+server.js';

const ports = vi.hoisted(() => ({ caseAccess: vi.fn(), manifest: vi.fn(), citing: vi.fn(), lexical: vi.fn() }));
vi.mock('$lib/server/db/client.js', () => ({ pool: {} }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: ports.caseAccess }));
vi.mock('$lib/server/library/library-citation-provenance-v1.js', () => ({ createLibraryCitationContextManifestV1: ports.manifest }));
vi.mock('$lib/server/legal/statute-search-v1.js', () => ({
	listCaseAuthorityJurisdictionsV1: vi.fn(),
	searchCaseLinkedAuthorityChunksV1: ports.lexical,
	searchCaseLinkedCitingChunksV1: ports.citing,
}));

const caseId = '11111111-1111-4111-8111-111111111111';
const targetChunkId = '22222222-2222-4222-8222-222222222222';
const targetRevision = '33333333-3333-4333-8333-333333333333';
const citingChunk = '44444444-4444-4444-8444-444444444444';
const irrelevantChunk = '55555555-5555-4555-8555-555555555555';
const jurisdiction = 'fixture';
const targetChunkHash = 'a'.repeat(64);
const pin = { jurisdiction, targetChunkId, targetRevision, targetChunkHash };
const authority = { kind: 'case', citation: 'Fixture Opinion', jurisdiction };
const target = { chunkId: targetChunkId, documentRevision: targetRevision, chunkHash: targetChunkHash, authority };

function manifest(...entries: Record<string, unknown>[]) {
	return { entries: new Map(entries.map((entry, index) => [index + 1, entry])), manifestSha256: 'b'.repeat(64) };
}

async function post(userId = 7) {
	return POST({
		params: { id: caseId }, locals: { user: { id: userId } },
		request: new Request('http://fixture/authorities', { method: 'POST', body: JSON.stringify(pin) }),
	} as unknown as Parameters<typeof POST>[0]);
}

describe('Storybook citing passages', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		ports.caseAccess.mockResolvedValue({ id: caseId });
	});

	it('returns only verified excerpts that contain the indexed citation text', async () => {
		const common = { documentId: caseId, documentRevision: targetRevision, sourceHash: 'c'.repeat(64), authority, charStart: 120 };
		const quote = 'This excerpt discusses Fixture Opinion and explains the distinction.';
		ports.manifest.mockResolvedValueOnce(manifest(target)).mockResolvedValueOnce(manifest(
			{ ...common, chunkId: citingChunk, quote },
			{ ...common, chunkId: irrelevantChunk, quote: 'The citation fell outside this excerpt.' },
		)).mockResolvedValueOnce(manifest(target));
		ports.citing.mockResolvedValue([
			{ chunkId: citingChunk, score: 0.8, citationText: 'Fixture Opinion' },
			{ chunkId: irrelevantChunk, score: 1, citationText: 'Fixture Opinion' },
		]);
		const response = await post();
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			authorities: [{ chunkId: citingChunk, quote, excerptCharEnd: 120 + quote.length }],
			coverage: { matched: 2, verified: 1, shown: 1, contraryAuthorityChecked: false },
		});
		expect(ports.lexical).not.toHaveBeenCalled();
		expect(ports.citing).toHaveBeenCalledWith({}, expect.objectContaining({ caseId, actorId: 7, targetRevision }));
	});

	it('rejects a stale citation pin before traversing citation edges', async () => {
		ports.manifest.mockResolvedValue(manifest({ ...target, chunkHash: 'f'.repeat(64) }));
		expect((await post()).status).toBe(409);
		expect(ports.citing).not.toHaveBeenCalled();
	});

	it('rejects a target that changes during lookup', async () => {
		ports.manifest.mockResolvedValueOnce(manifest(target)).mockResolvedValueOnce(manifest()).mockResolvedValueOnce(manifest());
		ports.citing.mockResolvedValue([]);
		expect((await post()).status).toBe(409);
	});

	it('checks case access before looking up any citation', async () => {
		ports.caseAccess.mockResolvedValue(null);
		expect((await post(8)).status).toBe(404);
		expect(ports.manifest).not.toHaveBeenCalled();
		expect(ports.citing).not.toHaveBeenCalled();
	});
});
