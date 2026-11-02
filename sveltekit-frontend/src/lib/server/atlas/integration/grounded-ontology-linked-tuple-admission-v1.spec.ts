import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { projectGroundedNlpFactToOntologyTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';
import { groundNlpFeatureV1 } from '../../nlp/nlp-observation-lineage-v1.js';
import { admitGroundedOntologyLinkedTupleV1 } from './grounded-ontology-linked-tuple-admission-v1.js';

const sourceBytes = Buffer.from('subject relates to target', 'utf8');
const sha256 = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const sourceRevision = sha256(sourceBytes);
const fact = groundNlpFeatureV1({
	feature: {
		kind: 'concept',
		name: 'relates to',
		description: 'relation observation',
		source: 'langextract',
		byteStart: 8,
		byteEnd: 18,
		rawText: 'relates to',
		confidence: 0.8,
	},
	context: {
		sourceRef: 'src/fixture.ts',
		sourceRevision,
		workspaceRevision: 'workspace:fixture',
		providerRevision: 'langextract:fixture',
		producerRevision: 'fixture-producer-v1',
	},
	sourceBytes,
	taskRef: 'task:fixture',
	canonicalTaskRef: 'task:fixture#fact',
	taskRevision: sha256(Buffer.from('task fixture')),
	evidenceCardChecksum: sha256(Buffer.from('evidence fixture')),
});

function tuple() {
	const projection = projectGroundedNlpFactToOntologyTupleV1({
		fact,
		ontologyIds: ['concept:target'],
		conceptIds: [],
		labelKind: 'ontology',
		ontologyRevision: sha256(Buffer.from('ontology fixture')),
	});
	return {
		...projection.tuple,
		relationRevision: 'relation:fixture-v1',
		participants: [
			{ entityId: 'entity:subject', entityKind: 'semantic_concept' as const, role: 'actor' as const },
			{ entityId: 'concept:target', entityKind: 'semantic_concept' as const, role: 'target' as const },
		],
	};
}

describe('admitGroundedOntologyLinkedTupleV1', () => {
	it('admits a source-bound gated proposal without granting authority or writes', () => {
		const result = admitGroundedOntologyLinkedTupleV1({ tuple: tuple(), sourceBytes, expectedSourceRevision: sourceRevision });
		expect(result.status).toBe('PROPOSED_GROUNDED_TUPLE');
		expect(result.evidenceSpanChecksum).toBe(fact.evidenceSpan.textSha256.startsWith('sha256:')
			? fact.evidenceSpan.textSha256
			: `sha256:${fact.evidenceSpan.textSha256}`);
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
	});

	it('rejects reference-only tuples with no grounded participants', () => {
		const referenceTuple = { ...tuple(), participants: [], evidenceState: 'REFERENCE_ONLY' as const };
		expect(() => admitGroundedOntologyLinkedTupleV1({ tuple: referenceTuple, sourceBytes, expectedSourceRevision: sourceRevision }))
			.toThrow('GROUNDED_TUPLE_STATE_NOT_GATED');
	});

	it('rejects missing participants, source revision drift, and changed bytes', () => {
		const validTuple = tuple();
		expect(() => admitGroundedOntologyLinkedTupleV1({
			tuple: { ...validTuple, participants: [] }, sourceBytes, expectedSourceRevision: sourceRevision,
		})).toThrow('GROUNDED_TUPLE_PARTICIPANTS_REQUIRED');
		expect(() => admitGroundedOntologyLinkedTupleV1({
			tuple: validTuple, sourceBytes, expectedSourceRevision: sha256(Buffer.from('other source')),
		})).toThrow('GROUNDED_TUPLE_SOURCE_REVISION_MISMATCH');
		expect(() => admitGroundedOntologyLinkedTupleV1({
			tuple: validTuple, sourceBytes: Buffer.from('changed source'), expectedSourceRevision: sourceRevision,
		})).toThrow('GROUNDED_TUPLE_SOURCE_BYTES_MISMATCH');
	});

	it('rejects span, text, and evidence checksum mismatch', () => {
		const validTuple = tuple();
		expect(() => admitGroundedOntologyLinkedTupleV1({
			tuple: { ...validTuple, evidenceSpan: { ...validTuple.evidenceSpan!, end: 100 } },
			sourceBytes, expectedSourceRevision: sourceRevision,
		})).toThrow('GROUNDED_TUPLE_EVIDENCE_SPAN_INVALID');
		expect(() => admitGroundedOntologyLinkedTupleV1({
			tuple: { ...validTuple, surfaceText: 'different' }, sourceBytes, expectedSourceRevision: sourceRevision,
		})).toThrow('GROUNDED_TUPLE_EVIDENCE_TEXT_MISMATCH');
		expect(() => admitGroundedOntologyLinkedTupleV1({
			tuple: { ...validTuple, provenance: { ...validTuple.provenance, evidenceSpanChecksum: sha256(Buffer.from('wrong')) } },
			sourceBytes, expectedSourceRevision: sourceRevision,
		})).toThrow('GROUNDED_TUPLE_EVIDENCE_CHECKSUM_MISMATCH');
	});
});
