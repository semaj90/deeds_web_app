import { createHash } from 'node:crypto';
import { z } from 'zod';
import { OntologyLinkedTupleV1Schema } from '../contracts/ontology-linked-tuple-v1.js';

const GroundedTupleAdmissionInputV1Schema = z.object({
	tuple: OntologyLinkedTupleV1Schema,
	sourceBytes: z.unknown(),
	expectedSourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

export type GroundedTupleAdmissionV1 = {
	status: 'PROPOSED_GROUNDED_TUPLE';
	tuple: z.infer<typeof OntologyLinkedTupleV1Schema>;
	sourceRevision: string;
	evidenceSpanChecksum: string;
	canonicalAuthority: false;
	writesPerformed: false;
};

function sha256(bytes: Uint8Array): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function admitGroundedOntologyLinkedTupleV1(input: unknown): GroundedTupleAdmissionV1 {
	const parsed = GroundedTupleAdmissionInputV1Schema.parse(input);
	const { tuple, expectedSourceRevision } = parsed;
	const candidateBytes = parsed.sourceBytes;
	if (!Buffer.isBuffer(candidateBytes) && Object.prototype.toString.call(candidateBytes) !== '[object Uint8Array]') {
		throw new Error('GROUNDED_TUPLE_SOURCE_BYTES_INVALID');
	}
	const sourceBytes = candidateBytes as Uint8Array;
	const span = tuple.evidenceSpan;
	if (!span) throw new Error('GROUNDED_TUPLE_EVIDENCE_SPAN_REQUIRED');
	if (tuple.evidenceState !== 'GATED') throw new Error('GROUNDED_TUPLE_STATE_NOT_GATED');
	if (!tuple.relationRevision?.trim()) throw new Error('GROUNDED_TUPLE_RELATION_REVISION_REQUIRED');
	if (!tuple.provenance.workspaceRevision?.trim()) throw new Error('GROUNDED_TUPLE_WORKSPACE_REVISION_REQUIRED');
	if (tuple.provenance.sourceRevision !== expectedSourceRevision) {
		throw new Error('GROUNDED_TUPLE_SOURCE_REVISION_MISMATCH');
	}
	if (sha256(sourceBytes) !== expectedSourceRevision) throw new Error('GROUNDED_TUPLE_SOURCE_BYTES_MISMATCH');
	if (span.sourceRef !== tuple.sourceRef || span.end <= span.start || span.end > sourceBytes.byteLength) {
		throw new Error('GROUNDED_TUPLE_EVIDENCE_SPAN_INVALID');
	}
	const spanBytes = sourceBytes.slice(span.start, span.end);
	const evidenceSpanChecksum = sha256(spanBytes);
	if (Buffer.from(spanBytes).toString('utf8') !== tuple.surfaceText) {
		throw new Error('GROUNDED_TUPLE_EVIDENCE_TEXT_MISMATCH');
	}
	if (tuple.provenance.evidenceSpanChecksum !== evidenceSpanChecksum) {
		throw new Error('GROUNDED_TUPLE_EVIDENCE_CHECKSUM_MISMATCH');
	}
	if (tuple.evidenceRefs.length === 0) throw new Error('GROUNDED_TUPLE_EVIDENCE_REFS_REQUIRED');
	if (tuple.participants.length < 2) throw new Error('GROUNDED_TUPLE_PARTICIPANTS_REQUIRED');
	if (new Set(tuple.participants.map((participant) => participant.entityId)).size < 2) {
		throw new Error('GROUNDED_TUPLE_DISTINCT_PARTICIPANTS_REQUIRED');
	}
	return {
		status: 'PROPOSED_GROUNDED_TUPLE',
		tuple,
		sourceRevision: expectedSourceRevision,
		evidenceSpanChecksum,
		canonicalAuthority: false,
		writesPerformed: false,
	};
}
