import { createHash } from 'node:crypto';
import { z } from 'zod';
import { OntologyLinkedTupleV1Schema, type OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';

const ParticipantSchema = z.object({
	entity_id: z.string().min(1),
	entity_kind: z.string().min(1),
	role: z.string().min(1),
	label: z.string().min(1).nullable(),
}).strict();

const HypergraphProposalSchema = z.object({
	schema: z.literal('atlas.hypergraph-fact-proposal.v1'),
	proposal_id: z.string().regex(/^[a-f0-9]{64}$/),
	fact_id: z.string().min(1),
	predicate: z.string().min(1),
	source_ref: z.string().min(1),
	source_revision: z.string().regex(/^[a-f0-9]{64}$/),
	workspace_revision: z.string().min(1),
	producer_revision: z.string().min(1),
	evidence_start_byte: z.number().int().nonnegative(),
	evidence_end_byte: z.number().int().positive(),
	evidence_text: z.string().min(1),
	evidence_checksum: z.string().regex(/^[a-f0-9]{64}$/),
	participants: z.array(ParticipantSchema).min(2).max(16),
	ontology_ids: z.array(z.string().min(1)).max(32),
	concept_ids: z.array(z.string().min(1)).max(32),
	confidence: z.number().min(0).max(1),
	proposal_checksum: z.string().regex(/^[a-f0-9]{64}$/),
	graph_revision: z.null(),
	admission_state: z.literal('PROPOSAL_ONLY'),
	canonical_authority: z.literal(false),
	writes_performed: z.literal(false),
}).strict();

export type ExternalDocHypergraphTupleProposalV1 = {
	schema: 'atlas.external-doc-hypergraph-tuple-proposal.v1';
	status: 'PROPOSAL_ONLY';
	tuple: OntologyLinkedTupleV1;
	proposalChecksum: string;
	participantResolution: 'UNRESOLVED_SOURCE_MENTIONS';
	canonicalAuthority: false;
	writesPerformed: false;
};

function sha256(bytes: Uint8Array | string): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function compareCodePoints(a: string, b: string): number {
	const left = Array.from(a, (char) => char.codePointAt(0)!);
	const right = Array.from(b, (char) => char.codePointAt(0)!);
	for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
		if (left[index] !== right[index]) return left[index] - right[index];
	}
	return left.length - right.length;
}

function stableJson(value: unknown, key = ''): string {
	if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).sort(compareCodePoints).map((childKey) =>
			`${JSON.stringify(childKey)}:${stableJson(record[childKey], childKey)}`).join(',')}}`;
	}
	// Python's json.dumps emits confidence values as floats (for example 0.0),
	// while JavaScript JSON.stringify would erase the decimal marker.
	if (key === 'confidence' && typeof value === 'number' && Number.isInteger(value)) return `${value}.0`;
	return JSON.stringify(value);
}

function verifyProposalDigest(proposal: z.infer<typeof HypergraphProposalSchema>): void {
	const body = {
		schema: proposal.schema,
		fact_id: proposal.fact_id,
		predicate: proposal.predicate,
		source_ref: proposal.source_ref,
		source_revision: proposal.source_revision,
		workspace_revision: proposal.workspace_revision,
		producer_revision: proposal.producer_revision,
		evidence_start_byte: proposal.evidence_start_byte,
		evidence_end_byte: proposal.evidence_end_byte,
		evidence_text: proposal.evidence_text,
		evidence_checksum: proposal.evidence_checksum,
		participants: [...proposal.participants].sort((a, b) =>
			compareCodePoints(a.role, b.role)
			|| compareCodePoints(a.entity_kind, b.entity_kind)
			|| compareCodePoints(a.entity_id, b.entity_id)
			|| compareCodePoints(a.label ?? '', b.label ?? ''),
		),
		ontology_ids: [...new Set(proposal.ontology_ids)].sort(compareCodePoints),
		concept_ids: [...new Set(proposal.concept_ids)].sort(compareCodePoints),
		confidence: proposal.confidence,
		graph_revision: null,
		admission_state: proposal.admission_state,
		canonical_authority: false,
		writes_performed: false,
	};
	if (sha256(stableJson(body)) !== proposal.proposal_checksum) throw new Error('EXTERNAL_DOC_TUPLE_PROPOSAL_CHECKSUM_MISMATCH');
	const expectedId = sha256([
		proposal.fact_id,
		proposal.source_revision,
		proposal.workspace_revision,
		proposal.producer_revision,
		proposal.evidence_checksum,
		proposal.proposal_checksum,
	].join('|'));
	if (expectedId !== proposal.proposal_id) throw new Error('EXTERNAL_DOC_TUPLE_PROPOSAL_ID_MISMATCH');
}

function participantRole(role: string): 'actor' | 'target' {
	const normalized = role.toLowerCase();
	if (['subject', 'nsubj', 'csubj', 'agent'].includes(normalized)) return 'actor';
	if (['object', 'obj', 'dobj', 'iobj', 'obl', 'recipient', 'goal', 'target'].includes(normalized)) return 'target';
	throw new Error(`EXTERNAL_DOC_TUPLE_PARTICIPANT_ROLE_UNMAPPED:${role}`);
}

/**
 * Converts the existing Python hypergraph proposal wire record into the shared
 * tuple shape. This verifies bytes and digests but never resolves ontology IDs,
 * approves a relation, or writes to a graph/cache/database.
 */
export function mapExternalDocHypergraphProposalToTupleV1(input: {
	proposal: unknown;
	sourceBytes: Uint8Array;
}): ExternalDocHypergraphTupleProposalV1 {
	const proposal = HypergraphProposalSchema.parse(input.proposal);
	if (!input.sourceBytes.byteLength || sha256(input.sourceBytes) !== proposal.source_revision) {
		throw new Error('EXTERNAL_DOC_TUPLE_SOURCE_REVISION_MISMATCH');
	}
	if (proposal.ontology_ids.length || proposal.concept_ids.length) {
		throw new Error('EXTERNAL_DOC_TUPLE_MAPPING_REQUIRES_REVIEWED_ADMISSION');
	}
	if (proposal.participants.some((participant) => participant.entity_kind !== 'external_doc_mention'
		|| !participant.entity_id.startsWith('mention:'))) {
		throw new Error('EXTERNAL_DOC_TUPLE_PARTICIPANT_ID_NOT_UNRESOLVED_MENTION');
	}
	verifyProposalDigest(proposal);
	if (proposal.evidence_end_byte <= proposal.evidence_start_byte
		|| proposal.evidence_end_byte > input.sourceBytes.byteLength) {
		throw new Error('EXTERNAL_DOC_TUPLE_EVIDENCE_SPAN_INVALID');
	}
	const span = input.sourceBytes.subarray(proposal.evidence_start_byte, proposal.evidence_end_byte);
	const evidenceChecksum = sha256(span);
	let evidenceText: string;
	try {
		evidenceText = new TextDecoder('utf-8', { fatal: true }).decode(span);
	} catch {
		throw new Error('EXTERNAL_DOC_TUPLE_EVIDENCE_NOT_UTF8');
	}
	if (evidenceText !== proposal.evidence_text || evidenceChecksum !== proposal.evidence_checksum) {
		throw new Error('EXTERNAL_DOC_TUPLE_EVIDENCE_READBACK_MISMATCH');
	}
	const sourceRevision = `sha256:${proposal.source_revision}`;
	const tuple = OntologyLinkedTupleV1Schema.parse({
		tupleId: proposal.proposal_id,
		schemaVersion: 'ontology-linked-tuple.v1',
		sourceRef: proposal.source_ref,
		surfaceText: proposal.evidence_text,
		label: proposal.predicate,
		labelKind: 'tag',
		labelSource: 'pos_tagger',
		ontologyIds: [],
		conceptIds: [],
		participants: proposal.participants.map((participant) => ({
			entityId: participant.entity_id,
			entityKind: 'source_ref',
			role: participantRole(participant.role),
			label: participant.label,
		})),
		evidenceRefs: [`${proposal.source_ref}#bytes=${proposal.evidence_start_byte}-${proposal.evidence_end_byte}`],
		relationRevision: proposal.producer_revision,
		evidenceSpan: {
			sourceRef: proposal.source_ref,
			start: proposal.evidence_start_byte,
			end: proposal.evidence_end_byte,
		},
		confidence: proposal.confidence,
		evidenceState: 'REFERENCE_ONLY',
		lifecycle: 'OBSERVED',
		provenance: {
			sourceTables: [],
			labelerVersion: null,
			taggerVersion: null,
			ontologyVersion: null,
			nlpVersion: 'Stanza',
			sourceRevision,
			workspaceRevision: proposal.workspace_revision,
			evidenceSpanChecksum: `sha256:${evidenceChecksum}`,
			producerId: 'atlas_external_doc_hypergraph',
			producerRevision: proposal.producer_revision,
			inputDigest: `sha256:${proposal.source_revision}`,
			outputDigest: `sha256:${proposal.proposal_checksum}`,
		},
	});
	return {
		schema: 'atlas.external-doc-hypergraph-tuple-proposal.v1',
		status: 'PROPOSAL_ONLY',
		tuple,
		proposalChecksum: `sha256:${proposal.proposal_checksum}`,
		participantResolution: 'UNRESOLVED_SOURCE_MENTIONS',
		canonicalAuthority: false,
		writesPerformed: false,
	};
}
