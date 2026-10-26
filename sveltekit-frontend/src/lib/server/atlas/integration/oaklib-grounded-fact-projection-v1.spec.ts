import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { groundNlpFeatureV1 } from '../../nlp/nlp-observation-lineage-v1.js';
import { projectGroundedFactWithOaklibCandidatesV1 } from './oaklib-grounded-fact-projection-v1.js';

const sourceBytes = Buffer.from('feature: semantic retrieval', 'utf8');
const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const ontologyRevision = digest(Buffer.from('fixture ontology', 'utf8'));
const fact = groundNlpFeatureV1({
	feature: {
		kind: 'concept',
		name: 'retrieval',
		description: 'semantic retrieval',
		source: 'langextract',
		byteStart: 9,
		byteEnd: 27,
		rawText: 'semantic retrieval',
		confidence: 0.82,
	},
	context: {
		sourceRef: 'src/retrieval.ts',
		sourceRevision: digest(sourceBytes),
		workspaceRevision: 'workspace:fixture-only',
		providerRevision: 'langextract:fixture-only',
		producerRevision: 'fixture-grounder-v1',
	},
	sourceBytes,
	taskRef: 'task:fixture',
	canonicalTaskRef: 'task:fixture#grounded-fact',
	taskRevision: digest(Buffer.from('task fixture', 'utf8')),
	evidenceCardChecksum: digest(Buffer.from('evidence fixture', 'utf8')),
});

function candidateBundle(labels: string[]) {
	return {
		schema: 'atlas.oaklib-candidate-bundle.v1',
		sourceSelector: 'atlas-local-ontology',
		ontologyRevision,
		producerRevision: 'oaklib-sidecar:fixture-only',
		canonicalAuthority: false,
		relations: [],
		concepts: labels.map((label, index) => ({
			schema: 'atlas.oaklib-concept-candidate.v1',
			candidateId: `candidate-${index}`,
			externalId: `EXT:${index}`,
			label,
			description: null,
			namespace: 'external-oaklib',
			ontologyRevision,
			producerRevision: 'oaklib-sidecar:fixture-only',
			evidenceRefs: [`oaklib:atlas-local-ontology:entity:EXT:${index}`],
			status: 'PROPOSED',
			canonicalAuthority: false,
		})),
	};
}

describe('projectGroundedFactWithOaklibCandidatesV1', () => {
	it('projects one exact label match through the existing gated tuple owner', () => {
		const result = projectGroundedFactWithOaklibCandidatesV1({
			fact,
			candidateBundle: candidateBundle(['Semantic Retrieval']),
		});

		expect(result.status).toBe('PROPOSED_GATED_TUPLE');
		if (result.status !== 'PROPOSED_GATED_TUPLE') throw new Error('expected gated tuple');
		expect(result.tuple.evidenceState).toBe('GATED');
		expect(result.tuple.ontologyIds).toEqual(['EXT:0']);
		expect(result.tuple.conceptIds).toEqual([]);
		expect(result.tuple.sourceRef).toBe(fact.sourceRef);
		expect(result.tuple.evidenceSpan).toEqual({ sourceRef: fact.sourceRef, start: 9, end: 27 });
		expect(result.tuple.provenance.sourceRevision).toBe(fact.sourceRevision);
		expect(result.tuple.provenance.workspaceRevision).toBe(fact.workspaceRevision);
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
	});

	it('returns no match rather than fuzzy-linking labels', () => {
		expect(projectGroundedFactWithOaklibCandidatesV1({
			fact,
			candidateBundle: candidateBundle(['semantic retrieval system']),
		}).status).toBe('NO_EXACT_CONCEPT_MATCH');
	});

	it('refuses ambiguous exact labels', () => {
		const result = projectGroundedFactWithOaklibCandidatesV1({
			fact,
			candidateBundle: candidateBundle(['semantic retrieval', ' Semantic   Retrieval ']),
		});
		expect(result.status).toBe('AMBIGUOUS_EXACT_CONCEPT_MATCH');
	});

	it('rejects candidate revision drift and caller-marked canonical authority', () => {
		const drifted = candidateBundle(['semantic retrieval']);
		drifted.concepts[0].ontologyRevision = digest(Buffer.from('other ontology', 'utf8'));
		expect(() => projectGroundedFactWithOaklibCandidatesV1({ fact, candidateBundle: drifted }))
			.toThrow('OAKLIB_CANDIDATE_REVISION_MISMATCH');
		expect(() => projectGroundedFactWithOaklibCandidatesV1({
			fact: { ...fact, canonicalAuthority: true } as typeof fact,
			candidateBundle: candidateBundle(['semantic retrieval']),
		})).toThrow('GROUNDED_NLP_FACT_AUTHORITY_INVALID');
	});
});
