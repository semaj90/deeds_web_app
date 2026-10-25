import { z } from 'zod';
import type { GroundedNlpFactV1 } from '../../nlp/nlp-observation-lineage-v1.js';
import {
	projectGroundedNlpFactToOntologyTupleV1,
	type OntologyLinkedTupleV1,
} from '../contracts/ontology-linked-tuple-v1.js';

const Sha256RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const OaklibConceptCandidateSchema = z.object({
	schema: z.literal('atlas.oaklib-concept-candidate.v1'),
	candidateId: z.string().min(1),
	externalId: z.string().min(1),
	label: z.string().min(1),
	description: z.string().nullable(),
	namespace: z.string().min(1),
	ontologyRevision: Sha256RevisionSchema,
	producerRevision: z.string().min(1),
	evidenceRefs: z.array(z.string().min(1)).min(1),
	status: z.literal('PROPOSED'),
	canonicalAuthority: z.literal(false),
}).strict();

const OaklibCandidateBundleSchema = z.object({
	schema: z.literal('atlas.oaklib-candidate-bundle.v1'),
	sourceSelector: z.literal('atlas-local-ontology'),
	ontologyRevision: Sha256RevisionSchema,
	producerRevision: z.string().min(1),
	concepts: z.array(OaklibConceptCandidateSchema),
	relations: z.array(z.unknown()).optional(),
	canonicalAuthority: z.literal(false),
}).strict();

export type OaklibCandidateBundleForGroundingV1 = z.infer<typeof OaklibCandidateBundleSchema>;

export type GroundedFactOaklibProjectionResultV1 =
	| { status: 'NO_EXACT_CONCEPT_MATCH'; canonicalAuthority: false; writesPerformed: false }
	| { status: 'AMBIGUOUS_EXACT_CONCEPT_MATCH'; candidateIds: string[]; canonicalAuthority: false; writesPerformed: false }
	| { status: 'PROPOSED_GATED_TUPLE'; tuple: OntologyLinkedTupleV1; canonicalAuthority: false; writesPerformed: false };

function normalizedLabel(value: string): string {
	return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function projectGroundedFactWithOaklibCandidatesV1(input: {
	fact: GroundedNlpFactV1;
	candidateBundle: unknown;
}): GroundedFactOaklibProjectionResultV1 {
	const bundle = OaklibCandidateBundleSchema.parse(input.candidateBundle);
	const fact = input.fact;
	if (fact.canonicalAuthority !== false || fact.ontologyPromotionAllowed !== false) {
		throw new Error('GROUNDED_NLP_FACT_AUTHORITY_INVALID');
	}
	if (!Sha256RevisionSchema.safeParse(fact.sourceRevision).success || !fact.workspaceRevision.trim()) {
		throw new Error('GROUNDED_NLP_FACT_LINEAGE_INCOMPLETE');
	}
	if (bundle.concepts.some((candidate) =>
		candidate.ontologyRevision !== bundle.ontologyRevision
		|| candidate.producerRevision !== bundle.producerRevision
	)) {
		throw new Error('OAKLIB_CANDIDATE_REVISION_MISMATCH');
	}

	const targetLabel = normalizedLabel(fact.surfaceText);
	const matches = bundle.concepts.filter((candidate) => normalizedLabel(candidate.label) === targetLabel);
	if (matches.length === 0) {
		return { status: 'NO_EXACT_CONCEPT_MATCH', canonicalAuthority: false, writesPerformed: false };
	}
	if (matches.length > 1) {
		return {
			status: 'AMBIGUOUS_EXACT_CONCEPT_MATCH',
			candidateIds: matches.map((candidate) => candidate.candidateId).sort(),
			canonicalAuthority: false,
			writesPerformed: false,
		};
	}

	const projection = projectGroundedNlpFactToOntologyTupleV1({
		fact,
		ontologyIds: [matches[0].externalId],
		conceptIds: [],
		labelKind: 'ontology',
		ontologyRevision: bundle.ontologyRevision,
	});
	return {
		status: 'PROPOSED_GATED_TUPLE',
		tuple: projection.tuple,
		canonicalAuthority: false,
		writesPerformed: false,
	};
}
