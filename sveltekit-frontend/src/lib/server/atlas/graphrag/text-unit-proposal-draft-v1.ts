import { createHash } from 'node:crypto';
import type { LangExtractTupleProposalBatchV1 } from '../integration/langextract-documentation-tuple-proposals-v1.js';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { buildTextUnitCandidateV1, toGraphRagTextUnitDraftV1 } from './text-unit-candidate-v1.js';

/** Prepare a whole-source TextUnit for review after the caller verifies the actor grant and source binding. */
export function buildGraphRagTextUnitProposalDraftV1(input: {
	repositoryId: string;
	workspaceId: string;
	grantRevision: string;
	sourceRef: string;
	sourceRevision: string;
	workspaceRevision: string;
	sourceBindingChecksum: string;
	sourceBytes: Buffer;
	batch: LangExtractTupleProposalBatchV1;
}) {
	const { batch } = input;
	if (
		batch.schema !== 'atlas.langextract-tuple-proposal-batch.v1' ||
		batch.sourceRef !== input.sourceRef ||
		batch.sourceRevision !== input.sourceRevision ||
		batch.workspaceRevision !== input.workspaceRevision ||
		batch.canonicalAuthority !== false ||
		batch.writesPerformed !== false ||
		!batch.producerRevision.trim() ||
		batch.status !== (batch.proposals.length ? 'PROPOSED' : 'EMPTY')
	) {
		throw new Error('GRAPHRAG_PROPOSAL_BATCH_BINDING_MISMATCH');
	}
	const candidate = buildTextUnitCandidateV1({
		repositoryId: input.repositoryId,
		sourceRef: input.sourceRef,
		sourceBytes: input.sourceBytes,
		boundSourceRevision: input.sourceRevision,
	});
	const seenTupleIds = new Set<string>();
	const relationshipReviewRefs = batch.proposals.map((proposal) => {
		const { tuple } = proposal;
		const span = tuple.evidenceSpan;
		if (
			proposal.schema !== 'atlas.langextract-tuple-proposal.v1' ||
			proposal.status !== 'PROPOSED' ||
			proposal.participantResolution !== 'UNRESOLVED_CANDIDATES' ||
			proposal.canonicalAuthority !== false ||
			proposal.writesPerformed !== false ||
			tuple.evidenceState !== 'REFERENCE_ONLY' ||
			tuple.lifecycle !== 'OBSERVED' ||
			tuple.sourceRef !== input.sourceRef ||
			tuple.provenance.sourceRevision !== input.sourceRevision ||
			tuple.provenance.workspaceRevision !== input.workspaceRevision ||
			tuple.provenance.producerRevision !== batch.producerRevision ||
			!span || span.sourceRef !== input.sourceRef ||
			!Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) ||
			span.start < 0 || span.end <= span.start || span.end > input.sourceBytes.length
		) {
			throw new Error('GRAPHRAG_TUPLE_BINDING_MISMATCH');
		}
		if (!tuple.tupleId.trim() || seenTupleIds.has(tuple.tupleId)) {
			throw new Error('GRAPHRAG_TUPLE_ID_MISSING_OR_DUPLICATE');
		}
		seenTupleIds.add(tuple.tupleId);
		// Bind the review reference to the exact bytes that form this TextUnit.
		const evidence = input.sourceBytes.subarray(span.start, span.end);
		const evidenceHash = `sha256:${createHash('sha256').update(evidence).digest('hex')}`;
		if (
			evidenceHash !== tuple.provenance.evidenceSpanChecksum ||
			!evidence.equals(Buffer.from(tuple.surfaceText, 'utf8'))
		) {
			throw new Error('GRAPHRAG_TUPLE_EVIDENCE_MISMATCH');
		}
		return {
			tupleId: tuple.tupleId,
			textUnitCandidateId: candidate.candidateId,
			byteStart: span.start,
			byteEnd: span.end,
			evidenceSpanChecksum: evidenceHash,
		};
	});
	const draft = toGraphRagTextUnitDraftV1(candidate);
	const draftBody = {
		schema: 'atlas.graphrag-text-unit-proposal-draft.v1' as const,
		status: 'PROPOSAL_ONLY' as const,
		workspaceId: input.workspaceId,
		grantRevision: input.grantRevision,
		workspaceRevision: input.workspaceRevision,
		sourceBindingChecksum: input.sourceBindingChecksum,
		textUnit: {
			...draft,
			document_id: null,
			textSha256: candidate.textSha256,
			nBytes: candidate.nBytes,
			byogMissingFields: ['document_id', ...draft.byogMissingFields],
		},
		proposedRelationshipCount: batch.proposals.length,
		relationshipReviewRefs,
		extractionProducerRevision: batch.producerRevision,
		proposalBatchChecksum: `sha256:${canonicalSha256V1(batch)}`,
		// The response carries the original tuples separately. The GraphRAG ID
		// columns remain empty pending reviewed identity and graph admission.
		canonicalAuthority: false as const,
		writesPerformed: false as const,
		promotionEligible: false as const,
	};
	return { ...draftBody, draftChecksum: `sha256:${canonicalSha256V1(draftBody)}` };
}
