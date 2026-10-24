import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { EvidenceLocatorV1 } from './evidence-locator-v1.js';
import { buildFeatureDescriptionV1, FeatureDescriptionV1Schema, verifyFeatureDescriptionSourceBytesV1 } from './feature-description-v1.js';

const sourceBytes = Buffer.from('const runSearch = () => 1;');
const relatedBytes = Buffer.from('it("runs search", runSearch);');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const locator: EvidenceLocatorV1 = {
	schema: 'atlas.evidence-locator.v1',
	canonicalId: 'symbol:src/search.ts:runSearch',
	packetKey: 'packet:search',
	sourceRef: 'src/search.ts',
	sourceKind: 'code_file',
	filePath: 'src/search.ts',
	sourceUrl: null,
	contentHash: `sha256:${hash(sourceBytes)}`,
	workspaceRevision: `sha256:${'b'.repeat(64)}`,
	sourceRevision: `sha256:${'c'.repeat(64)}`,
	span: { startByte: 0, endByte: sourceBytes.byteLength },
	domain: null,
};

const evidence = {
	evidenceRef: 'evidence:search-symbol',
	canonicalId: locator.canonicalId,
	packetKey: locator.packetKey,
	sourceRef: locator.sourceRef,
	sourceKind: 'code_file' as const,
	filePath: locator.filePath,
	sourceRevision: locator.sourceRevision,
	workspaceRevision: locator.workspaceRevision,
	contentHash: locator.contentHash,
	spanDigest: `sha256:${hash(sourceBytes)}`,
	span: locator.span!,
	role: 'AST' as const,
};
const relatedEvidence = {
	...evidence,
	evidenceRef: 'evidence:search-test',
	canonicalId: 'test:src/search.test.ts:runSearch',
	packetKey: null,
	sourceRef: 'src/search.test.ts',
	filePath: 'src/search.test.ts',
	sourceRevision: `sha256:${'d'.repeat(64)}`,
	contentHash: `sha256:${hash(relatedBytes)}`,
	spanDigest: `sha256:${hash(relatedBytes)}`,
	span: { startByte: 0, endByte: relatedBytes.byteLength },
	role: 'TEST' as const,
};

describe('FeatureDescriptionV1', () => {
	it('binds a proposal summary and related-file links to revisioned evidence', () => {
		const result = buildFeatureDescriptionV1({
			locator,
			featureRevision: 'feature-r1',
			summary: 'Runs the unified search and merges lexical and semantic candidates.',
			evidence: [evidence, relatedEvidence],
			relatedFiles: [{
				filePath: 'src/search.test.ts',
				canonicalId: 'test:src/search.test.ts:runSearch',
				sourceRef: 'src/search.test.ts',
				sourceRevision: `sha256:${'d'.repeat(64)}`,
				workspaceRevision: locator.workspaceRevision,
				evidenceRefs: [relatedEvidence.evidenceRef],
			}],
		});

		expect(result).toMatchObject({
			schema: 'atlas.feature-description.v1',
			canonicalId: locator.canonicalId,
			packetKey: locator.packetKey,
			status: 'PROPOSAL_ONLY',
			producer: 'DETERMINISTIC',
		});
		expect(result.evidence[0]).toMatchObject({ sourceRef: locator.sourceRef, span: locator.span });
		expect(result).not.toHaveProperty('score');
		expect(result).not.toHaveProperty('tensor');
		const verified = verifyFeatureDescriptionSourceBytesV1(result, new Map([
			[evidence.evidenceRef, sourceBytes],
			[relatedEvidence.evidenceRef, relatedBytes],
		]));
		expect(verified).toMatchObject({
			schema: 'atlas.feature-description-byte-verification.v1',
			status: 'BYTES_AND_SPANS_MATCHED',
			verifiedEvidenceRefs: ['evidence:search-symbol', 'evidence:search-test'],
		});
		expect(verified.descriptionDigest).toMatch(/^[a-f0-9]{64}$/);
	});

	it('does not certify missing, tampered, or out-of-bounds source evidence', () => {
		const description = buildFeatureDescriptionV1({ locator, featureRevision: 'feature-r1', summary: 'Searches.', evidence: [evidence] });
		expect(() => verifyFeatureDescriptionSourceBytesV1(description, new Map())).toThrow('FEATURE_DESCRIPTION_SOURCE_BYTES_MISSING');
		expect(() => verifyFeatureDescriptionSourceBytesV1(description, new Map([[evidence.evidenceRef, Buffer.from('const runSearch = () => 2;')]]))).toThrow('FEATURE_DESCRIPTION_SOURCE_DIGEST_MISMATCH');
		expect(() => verifyFeatureDescriptionSourceBytesV1(description, new Map([[evidence.evidenceRef, sourceBytes.subarray(0, 4)]]))).toThrow('FEATURE_DESCRIPTION_SOURCE_SPAN_OUT_OF_BOUNDS');
	});

	it('rejects source and workspace revision mismatches', () => {
		expect(() => buildFeatureDescriptionV1({
			locator,
			featureRevision: 'feature-r1',
			summary: 'Stale summary.',
			evidence: [{ ...evidence, sourceRevision: `sha256:${'e'.repeat(64)}` }],
		})).toThrow('FEATURE_DESCRIPTION_SOURCE_REVISION_MISMATCH');

		expect(() => buildFeatureDescriptionV1({
			locator,
			featureRevision: 'feature-r1',
			summary: 'Foreign workspace summary.',
			evidence: [{ ...evidence, workspaceRevision: `sha256:${'f'.repeat(64)}` }],
		})).toThrow('FEATURE_DESCRIPTION_WORKSPACE_REVISION_MISMATCH');

		expect(() => buildFeatureDescriptionV1({
			locator,
			featureRevision: 'feature-r1',
			summary: 'Not bound to the feature source.',
			evidence: [{ ...evidence, contentHash: `sha256:${'e'.repeat(64)}` }],
		})).toThrow('FEATURE_DESCRIPTION_PRIMARY_EVIDENCE_MISMATCH');
	});

	it('rejects dangling related-file evidence and model-claimed review', () => {
		const base = {
			schema: 'atlas.feature-description.v1' as const,
			canonicalId: locator.canonicalId,
			packetKey: locator.packetKey,
			sourceRef: locator.sourceRef,
			featureRevision: 'feature-r1',
			workspaceRevision: locator.workspaceRevision,
			summary: 'A proposed summary.',
			status: 'PROPOSAL_ONLY' as const,
			producer: 'DSPY_PROPOSAL' as const,
			evidence: [evidence],
			relatedFiles: [{
				filePath: 'src/other.ts', canonicalId: 'symbol:other', sourceRef: 'src/other.ts',
				sourceRevision: locator.sourceRevision, workspaceRevision: locator.workspaceRevision,
				evidenceRefs: ['evidence:missing'],
			}],
		};
		expect(FeatureDescriptionV1Schema.safeParse(base).success).toBe(false);
		expect(FeatureDescriptionV1Schema.safeParse({ ...base, status: 'REVIEWED' }).success).toBe(false);
		expect(FeatureDescriptionV1Schema.safeParse({
			...base,
			relatedFiles: [{ ...base.relatedFiles[0], filePath: 'src/different.ts' }],
		}).success).toBe(false);
	});
});
