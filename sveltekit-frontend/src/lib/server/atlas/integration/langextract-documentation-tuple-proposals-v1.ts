import { createHash } from 'node:crypto';
import { OntologyLinkedTupleV1Schema, type OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';
import {
	requestLangExtractDocumentationFacts,
	type LangExtractDocumentationFactsResponse,
	type LangExtractSidecarRequestOptions,
} from '../ai/langextract-transport.js';

const MAX_SOURCE_BYTES = 10_000;

export type LangExtractTupleProposalV1 = {
	schema: 'atlas.langextract-tuple-proposal.v1';
	status: 'PROPOSED';
	tuple: OntologyLinkedTupleV1;
	participantResolution: 'UNRESOLVED_CANDIDATES';
	canonicalAuthority: false;
	writesPerformed: false;
};

export type LangExtractTupleProposalBatchV1 = {
	schema: 'atlas.langextract-tuple-proposal-batch.v1';
	status: 'PROPOSED' | 'EMPTY';
	sourceRef: string;
	sourceRevision: string;
	workspaceRevision: string;
	producerRevision: string;
	proposals: LangExtractTupleProposalV1[];
	canonicalAuthority: false;
	writesPerformed: false;
};

function sha256(value: Uint8Array | string): string {
	return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function candidateEntityId(sourceRevision: string, value: string): string {
	return `candidate:langextract:${createHash('sha256').update(`${sourceRevision}\0${value.trim()}`, 'utf8').digest('hex')}`;
}

export function mapLangExtractDocumentationFactsToTupleProposalsV1(input: {
	sourceBytes: Uint8Array;
	sourceRef: string;
	sourceUrl: string;
	sourceRevision: string;
	workspaceRevision: string;
	response: LangExtractDocumentationFactsResponse;
}): LangExtractTupleProposalBatchV1 {
	if (!input.sourceRef.trim() || !input.sourceUrl.trim() || !input.workspaceRevision.trim()) {
		throw new Error('LANGEXTRACT_TUPLE_PROPOSAL_IDENTITY_REQUIRED');
	}
	const actualSourceRevision = sha256(input.sourceBytes);
	if (input.sourceRevision !== actualSourceRevision) throw new Error('LANGEXTRACT_TUPLE_SOURCE_REVISION_MISMATCH');
	if (input.response.canonicalAuthority !== false || !input.response.producerRevision.trim()) {
		throw new Error('LANGEXTRACT_TUPLE_RESPONSE_AUTHORITY_OR_REVISION_INVALID');
	}
	const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(input.sourceBytes);
	if (input.response.inputHash !== actualSourceRevision.slice('sha256:'.length)) {
		throw new Error('LANGEXTRACT_TUPLE_RESPONSE_INPUT_HASH_MISMATCH');
	}
	const sourceCodePoints = Array.from(sourceText);
	const proposals = input.response.facts.map((fact, index) => {
		if (fact.canonicalAuthority !== false || fact.alignmentStatus !== 'MATCH_EXACT'
			|| fact.sourceUrl !== input.sourceUrl || fact.sourceRevision !== actualSourceRevision
			|| !Number.isInteger(fact.startChar) || !Number.isInteger(fact.endChar)
			|| !Number.isInteger(fact.startByte) || !Number.isInteger(fact.endByte)
			|| !fact.subject.trim() || !fact.predicate.trim() || !fact.object.trim()
			|| !Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1) {
			throw new Error('LANGEXTRACT_TUPLE_FACT_UNQUALIFIED');
		}
		const spanBytes = input.sourceBytes.subarray(fact.startByte, fact.endByte);
		if (fact.startByte < 0 || fact.endByte <= fact.startByte || fact.endByte > input.sourceBytes.byteLength
			|| fact.startChar < 0 || fact.endChar <= fact.startChar || fact.endChar > sourceCodePoints.length
			|| Buffer.from(spanBytes).toString('utf8') !== fact.evidenceText
			|| sourceCodePoints.slice(fact.startChar, fact.endChar).join('') !== fact.evidenceText) {
			throw new Error('LANGEXTRACT_TUPLE_FACT_SPAN_MISMATCH');
		}
		const evidenceSpanChecksum = sha256(spanBytes);
		const participants = [
			{ entityId: candidateEntityId(actualSourceRevision, fact.subject), entityKind: 'semantic_concept' as const, role: 'actor' as const, label: fact.subject },
			{ entityId: candidateEntityId(actualSourceRevision, fact.object), entityKind: 'semantic_concept' as const, role: 'target' as const, label: fact.object },
		];
		const tupleId = sha256([
			'langextract-documentation-tuple-v1', actualSourceRevision, input.sourceRef,
			String(fact.startByte), String(fact.endByte), fact.subject, fact.predicate, fact.object,
			input.response.producerRevision, String(index),
		].join('\0'));
		const tuple = OntologyLinkedTupleV1Schema.parse({
			tupleId,
			schemaVersion: 'ontology-linked-tuple.v1',
			sourceRef: input.sourceRef,
			surfaceText: fact.evidenceText,
			label: fact.predicate,
			labelKind: 'tag',
			labelSource: 'llm',
			ontologyIds: [],
			conceptIds: [],
			participants,
			evidenceRefs: [`${input.sourceRef}#bytes=${fact.startByte}-${fact.endByte}`],
			relationRevision: input.response.producerRevision,
			evidenceSpan: { sourceRef: input.sourceRef, start: fact.startByte, end: fact.endByte },
			confidence: fact.confidence,
			evidenceState: 'REFERENCE_ONLY',
			lifecycle: 'OBSERVED',
			provenance: {
				sourceTables: [], labelerVersion: null, taggerVersion: null, ontologyVersion: null,
				nlpVersion: fact.productVersion, sourceRevision: actualSourceRevision,
				workspaceRevision: input.workspaceRevision, evidenceSpanChecksum,
				producerId: 'langextract.documentation-facts', producerRevision: input.response.producerRevision,
				inputDigest: input.response.inputHash, outputDigest: input.response.outputHash,
			},
		});
		return {
			schema: 'atlas.langextract-tuple-proposal.v1',
			status: 'PROPOSED',
			tuple,
			participantResolution: 'UNRESOLVED_CANDIDATES',
			canonicalAuthority: false,
			writesPerformed: false,
		};
	});
	return {
		schema: 'atlas.langextract-tuple-proposal-batch.v1',
		status: proposals.length ? 'PROPOSED' : 'EMPTY',
		sourceRef: input.sourceRef,
		sourceRevision: actualSourceRevision,
		workspaceRevision: input.workspaceRevision,
		producerRevision: input.response.producerRevision,
		proposals,
		canonicalAuthority: false,
		writesPerformed: false,
	};
}

export async function requestLangExtractTupleProposalsV1(input: {
	sourceBytes: Uint8Array;
	sourceRef: string;
	sourceUrl: string;
	workspaceRevision: string;
	productVersion?: string;
}, options: Omit<LangExtractSidecarRequestOptions, 'path'> = {}): Promise<LangExtractTupleProposalBatchV1> {
	if (input.sourceBytes.byteLength === 0 || input.sourceBytes.byteLength > MAX_SOURCE_BYTES) {
		throw new Error('LANGEXTRACT_TUPLE_SOURCE_SIZE_OUT_OF_RANGE');
	}
	const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(input.sourceBytes);
	const sourceRevision = sha256(input.sourceBytes);
	const response = await requestLangExtractDocumentationFacts({
		text: sourceText,
		sourceUrl: input.sourceUrl,
		sourceRevision,
		productVersion: input.productVersion,
	}, options);
	return mapLangExtractDocumentationFactsToTupleProposalsV1({ ...input, sourceRevision, response });
}
