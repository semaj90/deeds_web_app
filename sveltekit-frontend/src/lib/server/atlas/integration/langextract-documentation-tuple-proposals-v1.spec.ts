import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	mapLangExtractDocumentationFactsToTupleProposalsV1,
} from './langextract-documentation-tuple-proposals-v1.js';
import type { LangExtractDocumentationFactsResponse } from '../ai/langextract-transport.js';

const sourceText = 'Ána calls Bob.';
const sourceBytes = Buffer.from(sourceText, 'utf8');
const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
const inputHash = sourceRevision.slice('sha256:'.length);
const spanByteEnd = sourceBytes.byteLength;
const spanCharEnd = Array.from(sourceText).length;

function response(overrides: Partial<LangExtractDocumentationFactsResponse> = {}): LangExtractDocumentationFactsResponse {
	return {
		facts: [{
			schema: 'atlas.documentation-fact.v1', subject: 'Ána', predicate: 'calls', object: 'Bob',
			statement: sourceText, evidenceText: sourceText, sourceUrl: 'repo:fixture.ts', sourceRevision,
			startChar: 0, endChar: spanCharEnd, startByte: 0, endByte: spanByteEnd,
			alignmentStatus: 'MATCH_EXACT', productVersion: 'fixture-model-v1', confidence: 0.9,
			extractionMethod: 'fixture', customAttributesVersion: 'atlas.langextract-custom-attributes.v1',
			customAttributes: {}, canonicalAuthority: false,
		}],
		apiRules: [], modelId: 'fixture-model', provider: 'fixture', producerRevision: 'langextract-fixture-v1',
		inputHash, outputHash: 'fixture-output-hash', generationControls: {}, alignmentSummary: {},
		canonicalAuthority: false,
		...overrides,
	};
}

describe('mapLangExtractDocumentationFactsToTupleProposalsV1', () => {
	it('preserves exact source bytes and leaves participants unresolved and noncanonical', () => {
		const result = mapLangExtractDocumentationFactsToTupleProposalsV1({
			sourceBytes, sourceRef: 'src/fixture.ts', sourceUrl: 'repo:fixture.ts', sourceRevision,
			workspaceRevision: 'workspace:fixture-revision', response: response(),
		});
		expect(result.status).toBe('PROPOSED');
		expect(result.proposals).toHaveLength(1);
		expect(result.proposals[0].tuple.evidenceSpan).toEqual({ sourceRef: 'src/fixture.ts', start: 0, end: spanByteEnd });
		expect(result.proposals[0].tuple.surfaceText).toBe(sourceText);
		expect(result.proposals[0].tuple.participants).toHaveLength(2);
		expect(result.proposals[0].tuple.evidenceState).toBe('REFERENCE_ONLY');
		expect(result.proposals[0].participantResolution).toBe('UNRESOLVED_CANDIDATES');
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
	});

	it('rejects source, input-hash, and exact-span mismatches', () => {
		const input = { sourceBytes, sourceRef: 'src/fixture.ts', sourceUrl: 'repo:fixture.ts', sourceRevision, workspaceRevision: 'workspace:fixture-revision' };
		expect(() => mapLangExtractDocumentationFactsToTupleProposalsV1({ ...input, sourceRevision: 'sha256:wrong', response: response() }))
			.toThrow('LANGEXTRACT_TUPLE_SOURCE_REVISION_MISMATCH');
		expect(() => mapLangExtractDocumentationFactsToTupleProposalsV1({ ...input, response: response({ inputHash: 'wrong' }) }))
			.toThrow('LANGEXTRACT_TUPLE_RESPONSE_INPUT_HASH_MISMATCH');
		const badFact = { ...response().facts[0], endByte: spanByteEnd - 1 };
		expect(() => mapLangExtractDocumentationFactsToTupleProposalsV1({ ...input, response: response({ facts: [badFact] }) }))
			.toThrow('LANGEXTRACT_TUPLE_FACT_SPAN_MISMATCH');
	});

	it('reports EMPTY when the extractor returns no facts', () => {
		const result = mapLangExtractDocumentationFactsToTupleProposalsV1({
			sourceBytes, sourceRef: 'src/fixture.ts', sourceUrl: 'repo:fixture.ts', sourceRevision,
			workspaceRevision: 'workspace:fixture-revision', response: response({ facts: [] }),
		});
		expect(result.status).toBe('EMPTY');
		expect(result.proposals).toEqual([]);
	});
});
