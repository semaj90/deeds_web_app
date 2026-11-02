import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	EvidenceClaimV1Schema,
	groundEvidenceClaimV1,
	mapLangExtractFactToEvidenceClaimV1,
	type EvidenceClaimProposalV1,
} from './evidence-claim-v1.js';

const sourceText = 'A 🧑‍⚖️ statement: café is mentioned.';
const sourceBytes = Buffer.from(sourceText, 'utf8');
const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const sourceRevision = `sha256:${sourceSha256}`;
const sourceId = 'evidence:fixture-1';
const caseId = '22222222-2222-4222-8222-222222222222';
const exactText = ' café';
const codePoints = Array.from(sourceText);
const startChar = Array.from(sourceText.slice(0, sourceText.indexOf('café'))).length - 1;
const endChar = startChar + Array.from(exactText).length;
const startByte = Buffer.byteLength(codePoints.slice(0, startChar).join(''), 'utf8');
const endByte = startByte + Buffer.byteLength(exactText, 'utf8');

const fixture = (): EvidenceClaimProposalV1 => ({
	claimId: '11111111-1111-4111-8111-111111111111',
	sourceId,
	sourceSha256,
	sourceRevision,
	workspaceRevision: 'workspace:fixture-rev-1',
	caseId,
	span: { startChar, endChar, exactText, textSourceSha256: sourceSha256 },
	who: 'unknown',
	relationPredicate: 'mentions',
	what: 'The source mentions café.',
	why: '',
	how: '',
	assertion: 'The source contains the word café.',
	domainId: null,
	taxonomyId: null,
	observedAt: null,
	validAt: null,
	extraction: {
		provider: 'fixture-provider',
		producerRevision: 'langextract-fixture-v1',
		modelId: null,
		outputSha256: sourceSha256,
		method: 'fixture',
		confidence: 1,
		productVersion: 'fixture-1',
	},
	verificationStatus: 'PROPOSED',
	supportingClaimIds: [],
	contradictingClaimIds: [],
});

const binding = {
	sourceId,
	sourceRevision,
	workspaceRevision: 'workspace:fixture-rev-1',
	caseId,
	contentSha256: sourceSha256,
	spanContentSha256: sourceSha256,
};

describe('EvidenceClaimV1 grounding', () => {
	it('grounds exact Unicode spans against source bytes and digest', () => {
		const result = groundEvidenceClaimV1(fixture(), sourceBytes, binding);
		expect(result.verificationStatus).toBe('SOURCE_GROUNDED');
		expect(result.span.exactText).toBe(exactText);
		expect(result.span).toMatchObject({ startByte, endByte });
	});

	it('adapts exact LangExtract facts and preserves producer provenance', () => {
		const fact = {
			schema: 'atlas.documentation-fact.v1' as const,
			subject: 'A statement',
			predicate: 'mentions',
			object: 'café',
			statement: 'A statement mentions café.',
			evidenceText: exactText,
			sourceUrl: 'evidence://fixture-1',
			sourceRevision,
			startChar,
			endChar,
			startByte,
			endByte,
			alignmentStatus: 'MATCH_EXACT' as const,
			productVersion: 'langextract-fixture',
			confidence: 0.94,
			extractionMethod: 'langextract',
			customAttributesVersion: 'atlas.langextract-custom-attributes.v1' as const,
			customAttributes: {},
			canonicalAuthority: false as const,
		};
		const result = mapLangExtractFactToEvidenceClaimV1({
			fact,
			claimId: fixture().claimId,
			sourceId,
			sourceUrl: 'evidence://fixture-1',
			sourceRevision,
			workspaceRevision: binding.workspaceRevision,
			caseId,
			sourceBytes,
			provenance: {
				provider: 'fixture-provider',
				producerRevision: 'langextract-fixture-v1',
				modelId: null,
				outputHash: sourceSha256,
			},
		});
		expect(result.verificationStatus).toBe('SOURCE_GROUNDED');
		expect(result.relationPredicate).toBe('mentions');
		expect(result.extraction.producerRevision).toBe('langextract-fixture-v1');
	});

	it('binds extracted-text spans to the original binary source revision', () => {
		const originalBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);
		const extractedText = 'Witness statement: café occurred on Monday.';
		const extractedBytes = Buffer.from(extractedText, 'utf8');
		const originalDigest = createHash('sha256').update(originalBytes).digest('hex');
		const extractedDigest = createHash('sha256').update(extractedBytes).digest('hex');
		const exactEvidence = 'café occurred';
		const startChar = Array.from(extractedText.slice(0, extractedText.indexOf('café'))).length;
		const endChar = startChar + Array.from(exactEvidence).length;
		const startByte = Buffer.byteLength(Array.from(extractedText).slice(0, startChar).join(''), 'utf8');
		const endByte = startByte + Buffer.byteLength(exactEvidence, 'utf8');
		const result = mapLangExtractFactToEvidenceClaimV1({
			fact: {
				schema: 'atlas.documentation-fact.v1',
				subject: 'Witness',
				predicate: 'states',
				object: 'event occurred Monday',
				statement: 'Witness states the event occurred Monday.',
				evidenceText: exactEvidence,
				sourceUrl: 'evidence://fixture-pdf',
				sourceRevision: `sha256:${extractedDigest}`,
				startChar,
				endChar,
				startByte,
				endByte,
				alignmentStatus: 'MATCH_EXACT',
				productVersion: 'langextract-fixture',
				confidence: 0.9,
				extractionMethod: 'langextract',
				customAttributesVersion: 'atlas.langextract-custom-attributes.v1',
				customAttributes: {},
				canonicalAuthority: false,
			},
			claimId: fixture().claimId,
			sourceId: 'evidence:fixture-pdf',
			sourceUrl: 'evidence://fixture-pdf',
			sourceRevision: `sha256:${originalDigest}`,
			workspaceRevision: null,
			caseId,
			sourceBytes: originalBytes,
			spanSourceBytes: extractedBytes,
			provenance: {
				provider: 'fixture-provider',
				producerRevision: 'langextract-fixture-v1',
				modelId: null,
				outputHash: sourceSha256,
			},
		});

		expect(result.sourceSha256).toBe(originalDigest);
		expect(result.sourceRevision).toBe(`sha256:${originalDigest}`);
		expect(result.span.textSourceSha256).toBe(extractedDigest);
		expect(result.span.exactText).toBe(exactEvidence);
		expect(result.span).toMatchObject({ startByte, endByte });
	});

	it('rejects non-exact facts and byte-offset disagreement from LangExtract', () => {
		const fact = {
			schema: 'atlas.documentation-fact.v1' as const,
			subject: 'A statement',
			predicate: 'mentions',
			object: 'café',
			statement: 'A statement mentions café.',
			evidenceText: exactText,
			sourceUrl: 'evidence://fixture-1',
			sourceRevision,
			startChar,
			endChar,
			startByte,
			endByte,
			alignmentStatus: 'MATCH_EXACT' as const,
			productVersion: 'langextract-fixture',
			confidence: 0.94,
			extractionMethod: 'langextract',
			customAttributesVersion: 'atlas.langextract-custom-attributes.v1' as const,
			customAttributes: {},
			canonicalAuthority: false as const,
		};
		const options = {
			claimId: fixture().claimId,
			sourceId,
			sourceUrl: 'evidence://fixture-1',
			sourceRevision,
			workspaceRevision: binding.workspaceRevision,
			caseId,
			sourceBytes,
			provenance: {
				provider: 'fixture-provider',
				producerRevision: 'langextract-fixture-v1',
				modelId: null,
				outputHash: sourceSha256,
			},
		};
		expect(() => mapLangExtractFactToEvidenceClaimV1({ ...options, fact: { ...fact, alignmentStatus: 'MATCH_FUZZY' } }))
			.toThrow();
		expect(() => mapLangExtractFactToEvidenceClaimV1({ ...options, fact: { ...fact, endByte: endByte + 1 } }))
			.toThrow('EVIDENCE_CLAIM_LANGEXTRACT_BYTE_SPAN_MISMATCH');
		expect(() => mapLangExtractFactToEvidenceClaimV1({ ...options, fact, sourceUrl: 'evidence://other-source' }))
			.toThrow('EVIDENCE_CLAIM_SOURCE_BINDING_MISMATCH');
	});

	it('rejects a changed source digest', () => {
		expect(() => groundEvidenceClaimV1(fixture(), Buffer.from(`${sourceText}!`), binding))
			.toThrow('EVIDENCE_CLAIM_SOURCE_DIGEST_MISMATCH');
	});

	it('rejects mismatched source revision or case binding', () => {
		expect(() => groundEvidenceClaimV1(fixture(), sourceBytes, { ...binding, caseId: null }))
			.toThrow('EVIDENCE_CLAIM_SOURCE_BINDING_MISMATCH');
		expect(() => groundEvidenceClaimV1(fixture(), sourceBytes, { ...binding, sourceRevision: 'other-revision' }))
			.toThrow('EVIDENCE_CLAIM_SOURCE_BINDING_MISMATCH');
	});

	it('rejects missing source revision and invalid case identity', () => {
		const missingRevision = { ...fixture(), sourceRevision: undefined };
		expect(() => groundEvidenceClaimV1(missingRevision, sourceBytes, binding)).toThrow();
		expect(() => groundEvidenceClaimV1({ ...fixture(), caseId: 'not-a-uuid' }, sourceBytes, binding)).toThrow();
	});

	it('rejects forged text, byte offsets, and out-of-range spans', () => {
		expect(() => groundEvidenceClaimV1({ ...fixture(), span: { ...fixture().span, exactText: 'not café' } }, sourceBytes, binding))
			.toThrow('EVIDENCE_CLAIM_SPAN_MISMATCH');
		expect(() => groundEvidenceClaimV1({ ...fixture(), span: { ...fixture().span, endChar: 999 } }, sourceBytes, binding))
			.toThrow('EVIDENCE_CLAIM_SPAN_OUT_OF_BOUNDS');
	});

	it('does not accept extractor-authored verification states', () => {
		expect(() => groundEvidenceClaimV1({ ...fixture(), verificationStatus: 'CORROBORATED' }, sourceBytes, binding))
			.toThrow();
	});

	it('requires an explicit non-self, unique contradiction link for conflicted claims', () => {
		const grounded = groundEvidenceClaimV1(fixture(), sourceBytes, binding);
		expect(EvidenceClaimV1Schema.safeParse({ ...grounded, verificationStatus: 'CONFLICTED' }).success).toBe(false);
		expect(EvidenceClaimV1Schema.safeParse({
			...grounded,
			verificationStatus: 'CONFLICTED',
			contradictingClaimIds: ['33333333-3333-4333-8333-333333333333'],
		}).success).toBe(true);
		expect(EvidenceClaimV1Schema.safeParse({
			...grounded,
			verificationStatus: 'CONFLICTED',
			contradictingClaimIds: [grounded.claimId],
		}).success).toBe(false);
	});
});
