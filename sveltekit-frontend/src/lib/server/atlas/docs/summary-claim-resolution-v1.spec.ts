// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	buildSummaryClaimValidationV1,
	SUMMARY_CLAIM_VALIDATION_SCHEMA,
	type SummaryClaimValidationInputV1
} from './summary-claim-validation-v1.js';
import { resolveSummaryClaimValidationV1 } from './summary-claim-resolution-v1.js';

const base: SummaryClaimValidationInputV1 = {
	schema: SUMMARY_CLAIM_VALIDATION_SCHEMA,
	chunkId: 'doc:pgvector:fe883c75f323441d:22',
	chunkEvidenceRevision: `sha256:${'b'.repeat(64)}`,
	analysisId: null,
	summaryInputChecksum: '1'.repeat(64),
	summaryOutputChecksum: '2'.repeat(64),
	claimOrdinal: 0,
	claimText: 'pgvector supports HNSW iterative scans.',
	validatorRevision: 'summary-claim-validator:val-09-fixture',
	technical: { status: 'PASS', sourceTokens: ['HNSW'], claimTokens: ['HNSW'], missingTechnicalTokens: [], unexpectedTechnicalTokens: [] },
	numeric: { status: 'PASS', sourceValues: [], claimValues: [], unsupportedValues: [] },
	version: { status: 'PASS', sourceVersions: [], claimVersions: [], unsupportedVersions: [] },
	sourceSpan: { status: 'NO_CLAIMED_SPAN', spans: [] },
	semantic: { status: 'JUDGED', verdict: 'SUPPORTED_PARAPHRASE', citedSpans: [], unsupportedFragment: null, judgeModelId: 'ornith-1.5-9b', judgeModelRevision: 'ornith-1.5-9b:hforf.gguf', judgePromptRevision: 'summary-claim-judge-prompt:val-07-v1', independenceClass: 'SAME_MODEL_SEMANTIC_JUDGE' },
	ontology: { status: 'NOT_APPLICABLE', kernelRevision: null, assertions: [] },
	result: { decision: 'PENDING', escalationRevision: null },
	resolutionLayer: 'NOT_RESOLVED',
	canonicalAuthority: false
};

const build = (patch: Partial<SummaryClaimValidationInputV1> = {}) =>
	buildSummaryClaimValidationV1({ ...base, ...patch });

describe('VAL-09 deterministic claim resolution', () => {
	it('admits only fully checked supported claims and reseals derived output', () => {
		const result = resolveSummaryClaimValidationV1(build());
		expect(result.result.decision).toBe('ADMIT');
		expect(result.result.escalationRevision).toBe('summary-claim-resolution:val-09-v1');
		expect(result.resolutionLayer).toBe('COMPOSITE');
		expect(result.canonicalAuthority).toBe(false);
	});

	it('a semantic verdict cannot override a deterministic hard failure', () => {
		const result = resolveSummaryClaimValidationV1(build({
			technical: { ...base.technical, status: 'FAIL', unexpectedTechnicalTokens: ['invented.api'] }
		}));
		expect(result.result.decision).toBe('REJECT');
		expect(result.resolutionLayer).toBe('TECHNICAL');
	});

	it.each([
		['UNSUPPORTED_CLAIM', 'REJECT'], ['CONTRADICTED', 'REJECT'],
		['PARTIALLY_SUPPORTED', 'REVIEW'], ['SUPPORTED_WITH_OMISSION', 'REVIEW'],
		['INSUFFICIENT_EVIDENCE', 'REVIEW'], ['UNKNOWN', 'REVIEW']
	] as const)('resolves semantic verdict %s to %s', (verdict, decision) => {
		const result = resolveSummaryClaimValidationV1(build({
			semantic: { ...base.semantic, verdict }
		}));
		expect(result.result.decision).toBe(decision);
	});

	it('unrun judge, unresolved claimed span, or typed assertion review cannot admit', () => {
		expect(resolveSummaryClaimValidationV1(build({ semantic: { ...base.semantic, status: 'NOT_RUN', verdict: null, judgeModelId: null, judgeModelRevision: null, judgePromptRevision: null, independenceClass: null } })).result.decision).toBe('REVIEW');
		expect(resolveSummaryClaimValidationV1(build({ sourceSpan: { status: 'CLAIMED', spans: [{ startByte: 0, endByte: 1, textChecksum: '3'.repeat(64) }] } })).result.decision).toBe('REVIEW');
		expect(resolveSummaryClaimValidationV1(build({ sourceSpan: { status: 'VERIFIED', spans: [] } })).result.decision).toBe('REVIEW');
		expect(resolveSummaryClaimValidationV1(build({ ontology: { status: 'PASS', kernelRevision: 'oak-kernel-v1', assertions: [{ subject: 'x', predicate: 'PART_OF', object: 'y', status: 'REVIEW', evidenceRef: 'chunk-revision:span:0-1' }] } })).result.decision).toBe('REVIEW');
	});

	it('rejects a rejected verified span or rejected typed ontology assertion', () => {
		expect(resolveSummaryClaimValidationV1(build({ sourceSpan: { status: 'REJECTED', spans: [{ startByte: 0, endByte: 1, textChecksum: '3'.repeat(64) }] } })).result.decision).toBe('REJECT');
		expect(resolveSummaryClaimValidationV1(build({ ontology: { status: 'PASS', kernelRevision: 'oak-kernel-v1', assertions: [{ subject: 'x', predicate: 'PART_OF', object: 'y', status: 'REJECTED', evidenceRef: 'chunk-revision:span:0-1' }] } })).result.decision).toBe('REJECT');
	});
});
