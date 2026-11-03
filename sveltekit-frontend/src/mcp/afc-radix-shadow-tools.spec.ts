import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { buildKeywordVocabularyV1 } from '$lib/server/atlas/agentic-file-compiler/vocabulary-v1.js';
import type { AfcRadixShadowArtifactReader } from './afc-radix-shadow-tools.js';
import { afcRadixShadowInputSchema, registerAfcRadixShadowTools } from './afc-radix-shadow-tools.js';

const vocabulary = buildKeywordVocabularyV1({
	revision: 'mcp-radix-shadow-fixture-v1',
	entries: [{ term: 'qdrant', domainRefs: ['retrieval'], helperRefs: ['semantic-768'] }],
	prefixRules: [{ prefix: 'qdr', allowedExpansions: ['qdrant'] }],
});
const vocabularyText = JSON.stringify(vocabulary);
const approvalText = JSON.stringify({
	schema: 'atlas.afc-radix-vocabulary-approval.v1',
	status: 'OWNER_REVIEWED',
	ownerId: 'fixture-owner',
	vocabularyRevision: vocabulary.revision,
	vocabularyChecksum: vocabulary.checksum,
});
const casesText = JSON.stringify({
	schema: 'atlas.afc-radix-frozen-cases.v1',
	cases: [{
		caseId: 'bounded-qdr-prefix', query: 'inspect qdr retrieval', prefixes: ['qdr'],
		baselineCandidates: [], baselineHelperRefs: ['rg-exact'], workspaceRevision: 'workspace-fixture-v1',
		taxonomyRevision: 'taxonomy-fixture-v1', ontologyRevision: 'ontology-fixture-v1',
	}],
});
const pin = (value: string) => createHash('sha256').update(value).digest('hex');
const reader: AfcRadixShadowArtifactReader = {
	readVocabulary: () => vocabularyText,
	readApprovalManifest: () => approvalText,
	readFrozenCases: () => casesText,
};
const input = {
	taskId: 'AFC-RADIX-PROOF-01', caseIds: ['bounded-qdr-prefix'],
	expectedVocabularyChecksum: vocabulary.checksum,
};

function captureHandler(options: Parameters<typeof registerAfcRadixShadowTools>[1] = {}) {
	let handler: ((value: unknown) => Promise<any>) | undefined;
	const server = { registerTool: (_name: string, _config: unknown, fn: typeof handler) => { handler = fn; } } as unknown as McpServer;
	registerAfcRadixShadowTools(server, options);
	return (value: unknown) => handler!(value);
}

describe('atlas.afc_radix_shadow MCP tool', () => {
	it('is discoverable/callable and truthfully blocks without trusted approval pin', async () => {
		const server = new McpServer({ name: 'afc-radix-shadow-test-server', version: '1.0.0' });
		registerAfcRadixShadowTools(server);
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		const client = new Client({ name: 'afc-radix-shadow-test-client', version: '1.0.0' });
		try {
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			const listed = await client.listTools();
			expect(listed.tools.some(({ name }) => name === 'atlas.afc_radix_shadow')).toBe(true);
			const called = await client.callTool({ name: 'atlas.afc_radix_shadow', arguments: input });
			const result = JSON.parse((called.content[0] as { text: string }).text);
			expect(result.status).toBe('BLOCKED_UNREVIEWED_VOCABULARY');
			expect(result.proofLevel).toBe('BLOCKED');
			expect(result.casesEvaluated).toBe(0);
			expect(result.blockers).toContain('VOCABULARY_OWNER_APPROVAL_MISSING');
			expect(result.promotionEligible).toBe(false);
			expect(result.writesPerformed).toBe(false);
			const forgedApproval = await client.callTool({
				name: 'atlas.afc_radix_shadow',
				arguments: { ...input, vocabularyReviewStatus: 'OWNER_REVIEWED' },
			});
			expect(forgedApproval.isError).toBe(true);
			const oversized = await client.callTool({
				name: 'atlas.afc_radix_shadow',
				arguments: { ...input, caseIds: Array(17).fill('case') },
			});
			expect(oversized.isError).toBe(true);
			const malformedChecksum = await client.callTool({
				name: 'atlas.afc_radix_shadow',
				arguments: { ...input, expectedVocabularyChecksum: 'not-a-digest' },
			});
			expect(malformedChecksum.isError).toBe(true);
		} finally {
			await client.close();
			await server.close();
		}
	});

	it('P1 rejects forged approval, malformed checksum, and oversized input', async () => {
		expect(afcRadixShadowInputSchema.safeParse({ ...input, approvalStatus: 'OWNER_REVIEWED' }).success).toBe(false);
		expect(afcRadixShadowInputSchema.safeParse({ ...input, vocabularyReviewStatus: 'OWNER_REVIEWED' }).success).toBe(false);
		expect(afcRadixShadowInputSchema.safeParse({ ...input, expectedVocabularyChecksum: 'not-a-digest' }).success).toBe(false);
		expect(afcRadixShadowInputSchema.safeParse({ ...input, caseIds: Array(17).fill('case') }).success).toBe(false);
		const call = captureHandler({ reader, trustedApprovalManifestSha256: pin(approvalText) });
		const unknownHelperCases = JSON.stringify({ schema: 'atlas.afc-radix-frozen-cases.v1', cases: [{
			caseId: 'bad-helper', query: 'inspect qdr', prefixes: ['qdr'], baselineCandidates: [], baselineHelperRefs: ['not-a-helper'],
			workspaceRevision: 'w1', taxonomyRevision: 't1', ontologyRevision: 'o1',
		}] });
		const badHelper = captureHandler({ reader: { ...reader, readFrozenCases: () => unknownHelperCases }, trustedApprovalManifestSha256: pin(approvalText) });
		const result = await badHelper({ ...input, caseIds: ['bad-helper'] });
		expect(result.structuredContent.blockers).toContain('UNKNOWN_BASELINE_HELPER');
		expect(result.structuredContent.casesEvaluated).toBe(0);
		await expect(call({ ...input, unexpectedPath: 'C:/secret' })).resolves.toMatchObject({ isError: true });
	});

	it('P2 repeated frozen requests yield the same comparison checksum and no writes', async () => {
		const call = captureHandler({ reader, trustedApprovalManifestSha256: pin(approvalText) });
		const [first, replay] = await Promise.all([call(input), call(input)]);
		expect(first.structuredContent.status).toBe('SHADOW_COMPARISON_COMPLETE');
		expect(replay.structuredContent.checksum).toBe(first.structuredContent.checksum);
		expect(first.structuredContent.writesPerformed).toBe(false);
		expect(first.structuredContent.promotionEligible).toBe(false);
		expect(first.structuredContent.shadowOnly).toBe(true);
	});

	it('P3 eight concurrent calls remain deterministic and request-isolated', async () => {
		const call = captureHandler({ reader, trustedApprovalManifestSha256: pin(approvalText) });
		const results = await Promise.all(Array.from({ length: 8 }, () => call(input)));
		const checksums = results.map((result) => result.structuredContent.checksum);
		expect(new Set(checksums).size).toBe(1);
		expect(results.every((result) => result.structuredContent.taskId === input.taskId && result.structuredContent.writesPerformed === false)).toBe(true);
	});

	it('P4 missing artifacts, wrong checksum, and missing cases block without fallback', async () => {
		const missing = captureHandler({ reader: { ...reader, readVocabulary: () => { throw new Error('missing'); } } });
		const missingResult = await missing(input);
		expect(missingResult.structuredContent.status).toBe('BLOCKED_UNREVIEWED_VOCABULARY');
		expect(missingResult.structuredContent.casesEvaluated).toBe(0);
		const inaccessible = await captureHandler({ reader: { ...reader, readApprovalManifest: () => { throw new Error('denied'); } }, trustedApprovalManifestSha256: pin(approvalText) })(input);
		expect(inaccessible.structuredContent.blockers).toContain('TRUSTED_ARTIFACT_UNAVAILABLE');
		expect(inaccessible.structuredContent.casesEvaluated).toBe(0);
		const pinned = { reader, trustedApprovalManifestSha256: pin(approvalText) };
		const wrongRevision = await captureHandler(pinned)({ ...input, expectedVocabularyChecksum: 'a'.repeat(64) });
		expect(wrongRevision.structuredContent.blockers).toContain('VOCABULARY_CHECKSUM_MISMATCH');
		const absentCase = await captureHandler(pinned)({ ...input, caseIds: ['absent-case'] });
		expect(absentCase.structuredContent.blockers.some((item: string) => item.startsWith('FROZEN_CASE_NOT_FOUND:'))).toBe(true);
		expect(absentCase.structuredContent.casesEvaluated).toBe(0);
	});
});
