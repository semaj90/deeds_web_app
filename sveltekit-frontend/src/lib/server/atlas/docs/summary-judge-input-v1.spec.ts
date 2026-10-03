// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
	buildSummaryClaimValidationV1,
	computeSummaryClaimChecksumV1,
	SUMMARY_CLAIM_VALIDATION_SCHEMA
} from './summary-claim-validation-v1.js';
import {
	buildSummaryJudgeInputV1,
	computeCanonicalChunkTextChecksumV1,
	SUMMARY_JUDGE_INPUT_MAX_CHUNK_BYTES,
	SUMMARY_JUDGE_INPUT_SCHEMA,
	SummaryJudgeInputV1Schema,
	type SummaryJudgeInputV1Body
} from './summary-judge-input-v1.js';

const FIXTURE = resolve(import.meta.dirname, '__fixtures__/summary-judge-input-v1.fixture.json');
const body: SummaryJudgeInputV1Body = {
	schema: SUMMARY_JUDGE_INPUT_SCHEMA,
	chunkId: 'doc:pgvector:fe883c75f323441d:22',
	chunkEvidenceRevision: 'sha256:b4ac81deeb1a9e4d3cb6c3e4c4f047dd744739a4a7b0cd573f7ff3dba0ab195a',
	summaryOutputChecksum: '099b9e1d0ea636413f67312877aab4a7d1bcfc0c0fbf61936ab68630bfe8b872',
	canonicalChunkText: 'PostgreSQL pgvector supports HNSW iterative scans for filtered search.',
	canonicalChunkTextChecksum: computeCanonicalChunkTextChecksumV1('PostgreSQL pgvector supports HNSW iterative scans for filtered search.'),
	promptVisibleMetadata: {
		product: 'pgvector',
		productVersion: '0.8.0',
		title: 'HNSW indexes',
		headingPath: ['Indexing', 'HNSW']
	},
	claim: {
		claimOrdinal: 0,
		claimText: 'pgvector supports HNSW iterative scans.',
		claimChecksum: computeSummaryClaimChecksumV1('pgvector supports HNSW iterative scans.')
	},
	deterministicFindings: {
		technical: { status: 'PASS', sourceTokens: ['HNSW'], claimTokens: ['HNSW'], missingTechnicalTokens: [], unexpectedTechnicalTokens: [] },
		numeric: { status: 'PASS', sourceValues: [], claimValues: [], unsupportedValues: [] },
		version: { status: 'PASS', sourceVersions: [], claimVersions: [], unsupportedVersions: [] },
		sourceSpan: { status: 'NO_CLAIMED_SPAN', spans: [] }
	},
	promptRevision: 'summary-judge-prompt:val-06-v1',
	canonicalAuthority: false
};

const buildInput = () => ({
	validation: buildSummaryClaimValidationV1({
		schema: SUMMARY_CLAIM_VALIDATION_SCHEMA,
		chunkId: body.chunkId,
		chunkEvidenceRevision: body.chunkEvidenceRevision,
		analysisId: null,
		summaryInputChecksum: '1'.repeat(64),
		summaryOutputChecksum: body.summaryOutputChecksum,
		claimOrdinal: body.claim.claimOrdinal,
		claimText: body.claim.claimText,
		validatorRevision: 'summary-claim-validator:val-06-input-fixture',
		technical: body.deterministicFindings.technical,
		numeric: body.deterministicFindings.numeric,
		version: body.deterministicFindings.version,
		sourceSpan: body.deterministicFindings.sourceSpan,
		semantic: { status: 'NOT_RUN', verdict: null, citedSpans: [], unsupportedFragment: null, judgeModelId: null, judgeModelRevision: null, judgePromptRevision: null, independenceClass: null },
		ontology: { status: 'NOT_RUN', kernelRevision: null, assertions: [] },
		result: { decision: 'PENDING', escalationRevision: null },
		resolutionLayer: 'NOT_RESOLVED',
		canonicalAuthority: false
	}),
	canonicalChunkRow: { chunk_id: body.chunkId, evidence_revision: body.chunkEvidenceRevision, text: body.canonicalChunkText },
	promptVisibleMetadata: body.promptVisibleMetadata,
	promptRevision: body.promptRevision
});

describe('SummaryJudgeInputV1 (VAL-06 contract only)', () => {
	it('matches the frozen fixture with a deterministic canonical checksum', () => {
		const expected = buildSummaryJudgeInputV1(buildInput());
		if (process.env.UPDATE_FIXTURE === '1' || !existsSync(FIXTURE)) writeFileSync(FIXTURE, JSON.stringify(expected, null, 2) + '\n');
		expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(JSON.parse(JSON.stringify(expected)));
		const { judgeInputChecksum, ...sealedBody } = expected;
		expect(SummaryJudgeInputV1Schema.parse(expected).judgeInputChecksum).toBe(canonicalSha256V1(sealedBody));
	});

	it('binds the exact chunk revision, summary output, one claim and deterministic findings', () => {
		const input = buildSummaryJudgeInputV1(buildInput());
		expect(input.chunkEvidenceRevision).toBe(body.chunkEvidenceRevision);
		expect(input.summaryOutputChecksum).toBe(body.summaryOutputChecksum);
		expect(input.canonicalChunkTextChecksum).toBe(computeCanonicalChunkTextChecksumV1(body.canonicalChunkText));
		expect(input.claim.claimOrdinal).toBe(0);
		expect(input.deterministicFindings.sourceSpan.status).toBe('NO_CLAIMED_SPAN');
		expect(input.canonicalAuthority).toBe(false);
	});

	it('rejects unknown retrieval, web, ACE, neighboring-chunk and model-execution fields', () => {
		for (const extra of [{ qdrantNeighbors: [] }, { webResults: [] }, { aceHistory: [] }, { modelId: 'ornith-1.5-9b' }]) {
			expect(SummaryJudgeInputV1Schema.safeParse({ ...buildSummaryJudgeInputV1(buildInput()), ...extra }).success).toBe(false);
		}
		expect(SummaryJudgeInputV1Schema.safeParse({ ...buildSummaryJudgeInputV1(buildInput()), unexpected: true }).success).toBe(false);
	});

	it('rejects mismatched claim checksums, tampered input checksums, and oversized UTF-8 chunks', () => {
		const validInput = buildInput();
		expect(() => buildSummaryJudgeInputV1({ ...validInput, validation: { ...validInput.validation, claimChecksum: '0'.repeat(64) } })).toThrow();
		expect(() => buildSummaryJudgeInputV1({ ...validInput, canonicalChunkRow: { ...validInput.canonicalChunkRow, chunk_id: 'different-chunk' } })).toThrow(/IDENTITY_MISMATCH/);
		const built = buildSummaryJudgeInputV1(validInput);
		expect(SummaryJudgeInputV1Schema.safeParse({ ...built, canonicalChunkText: 'changed' }).success).toBe(false);
		expect(SummaryJudgeInputV1Schema.safeParse({ ...built, canonicalChunkTextChecksum: '0'.repeat(64) }).success).toBe(false);
		expect(() => buildSummaryJudgeInputV1({ ...validInput, canonicalChunkRow: { ...validInput.canonicalChunkRow, text: '🧭'.repeat(SUMMARY_JUDGE_INPUT_MAX_CHUNK_BYTES) } })).toThrow();
	});

	it('requires deterministic validators to have run and source-span state to be final', () => {
		const validation = buildInput().validation;
		for (const field of ['technical', 'numeric', 'version'] as const) {
			const input = buildSummaryJudgeInputV1(buildInput());
			const invalid = { ...input, deterministicFindings: { ...input.deterministicFindings, [field]: { ...input.deterministicFindings[field], status: 'NOT_RUN' } } };
			expect(SummaryJudgeInputV1Schema.safeParse(invalid).success).toBe(false);
		}
		const input = buildSummaryJudgeInputV1(buildInput());
		expect(SummaryJudgeInputV1Schema.safeParse({ ...input, deterministicFindings: { ...input.deterministicFindings, sourceSpan: { status: 'NOT_RUN', spans: [] } } }).success).toBe(false);
		expect(validation.sourceSpan.status).toBe('NO_CLAIMED_SPAN');
	});

	it('does not execute a model or make a decision', () => {
		const input = buildSummaryJudgeInputV1(buildInput());
		expect(input).not.toHaveProperty('verdict');
		expect(input).not.toHaveProperty('decision');
	});
});
