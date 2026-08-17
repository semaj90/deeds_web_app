import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createHyperedgeV1, type HyperedgeV1 } from '../../graph/hyperedge-contract.js';

/**
 * Taxonomy identity is independent from vector point ids, community ordinals,
 * graph node ids, file paths, and retrieval executors.
 *
 * Existing Parent Atlas canonical ids remain entity identity. This contract
 * only adds typed descriptors and concept/taxonomy identity around them.
 */
export const AtlasEntityTypeV1Schema = z.enum([
	'feature',
	'requirement',
	'file',
	'symbol',
	'route',
	'table',
	'column',
	'package',
	'test',
	'document',
	'term',
	'runtime_observation',
	'failure',
	'patch',
	'other',
]);
export type AtlasEntityTypeV1 = z.infer<typeof AtlasEntityTypeV1Schema>;

export const EntityDescriptorV1Schema = z.object({
	schema: z.literal('atlas.entity-descriptor.v1'),
	entityId: z.string().min(1),
	entityType: AtlasEntityTypeV1Schema,
	sourceRef: z.string().min(1).nullable(),
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type EntityDescriptorV1 = z.infer<typeof EntityDescriptorV1Schema>;

export const ConceptV1Schema = z.object({
	schema: z.literal('atlas.concept.v1'),
	conceptId: z.string().min(1),
	conceptKey: z.string().min(1),
	namespace: z.string().min(1),
	label: z.string().min(1),
	aliases: z.array(z.string().min(1)),
	description: z.string().min(1).nullable(),
	taxonomyRevision: z.string().min(1),
	definitionEvidenceRefs: z.array(z.string().min(1)).min(1),
	producerRevision: z.string().min(1),
}).strict();
export type ConceptV1 = z.infer<typeof ConceptV1Schema>;

export const SemanticNeighborEvidenceV1Schema = z.object({
	schema: z.literal('atlas.semantic-neighbor-evidence.v1'),
	queryEntityId: z.string().min(1),
	neighborEntityId: z.string().min(1),
	semanticLane: z.literal('semantic_768'),
	similarity: z.number().finite().min(-1).max(1),
	rank: z.number().int().positive(),
	representationRevision: z.string().min(1),
	executor: z.enum(['qdrant', 'cuvs_exact', 'cagra']),
	retrievalReceiptRef: z.string().min(1),
}).strict();
export type SemanticNeighborEvidenceV1 = z.infer<typeof SemanticNeighborEvidenceV1Schema>;

export const TaxonomyAssignmentCandidateV1Schema = z.object({
	schema: z.literal('atlas.taxonomy-assignment-candidate.v1'),
	candidateId: z.string().min(1),
	entityId: z.string().min(1),
	conceptId: z.string().min(1),
	taxonomyRevision: z.string().min(1),
	semanticRevision: z.string().min(1),
	graphRevision: z.string().min(1),
	semanticNeighborRefs: z.array(z.string().min(1)),
	communityRefs: z.array(z.string().min(1)),
	graphEvidenceRefs: z.array(z.string().min(1)),
	lexicalEvidenceRefs: z.array(z.string().min(1)),
	nlpEvidenceRefs: z.array(z.string().min(1)),
	evidenceRefs: z.array(z.string().min(1)).min(1),
	semanticScore: z.number().finite().min(0).max(1).nullable(),
	communityAffinity: z.number().finite().min(0).max(1).nullable(),
	graphSupport: z.number().finite().min(0).max(1).nullable(),
	lexicalSupport: z.number().finite().min(0).max(1).nullable(),
	nlpSupport: z.number().finite().min(0).max(1).nullable(),
	status: z.enum(['proposed', 'review_required', 'promoted', 'rejected']),
	producerRevision: z.string().min(1),
}).strict();
export type TaxonomyAssignmentCandidateV1 = z.infer<typeof TaxonomyAssignmentCandidateV1Schema>;

function sha256(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stableUnique(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

export function createConceptV1(input: {
	conceptKey: string;
	namespace: string;
	label: string;
	aliases?: readonly string[];
	description?: string | null;
	taxonomyRevision: string;
	definitionEvidenceRefs: readonly string[];
	producerRevision: string;
}): ConceptV1 {
	const conceptKey = input.conceptKey.trim();
	const namespace = input.namespace.trim();
	const conceptId = `concept:${sha256({ namespace, conceptKey }).slice(0, 32)}`;
	return ConceptV1Schema.parse({
		schema: 'atlas.concept.v1',
		conceptId,
		conceptKey,
		namespace,
		label: input.label.trim(),
		aliases: stableUnique(input.aliases ?? []),
		description: input.description?.trim() || null,
		taxonomyRevision: input.taxonomyRevision,
		definitionEvidenceRefs: stableUnique(input.definitionEvidenceRefs),
		producerRevision: input.producerRevision,
	});
}

/**
 * Build a reviewable taxonomy hypothesis. KNN/community scores are evidence
 * signals only; this function never creates canonical ENTITY_CLASSIFIED_AS.
 */
export function createTaxonomyAssignmentCandidateV1(input: {
	entityId: string;
	conceptId: string;
	taxonomyRevision: string;
	semanticRevision: string;
	graphRevision: string;
	semanticNeighborRefs?: readonly string[];
	communityRefs?: readonly string[];
	graphEvidenceRefs?: readonly string[];
	lexicalEvidenceRefs?: readonly string[];
	nlpEvidenceRefs?: readonly string[];
	evidenceRefs: readonly string[];
	semanticScore?: number | null;
	communityAffinity?: number | null;
	graphSupport?: number | null;
	lexicalSupport?: number | null;
	nlpSupport?: number | null;
	status?: 'proposed' | 'review_required';
	producerRevision: string;
}): TaxonomyAssignmentCandidateV1 {
	const identity = {
		entityId: input.entityId,
		conceptId: input.conceptId,
		taxonomyRevision: input.taxonomyRevision,
		semanticRevision: input.semanticRevision,
		graphRevision: input.graphRevision,
	};
	return TaxonomyAssignmentCandidateV1Schema.parse({
		schema: 'atlas.taxonomy-assignment-candidate.v1',
		candidateId: `taxonomy-candidate:${sha256(identity).slice(0, 32)}`,
		...identity,
		semanticNeighborRefs: stableUnique(input.semanticNeighborRefs ?? []),
		communityRefs: stableUnique(input.communityRefs ?? []),
		graphEvidenceRefs: stableUnique(input.graphEvidenceRefs ?? []),
		lexicalEvidenceRefs: stableUnique(input.lexicalEvidenceRefs ?? []),
		nlpEvidenceRefs: stableUnique(input.nlpEvidenceRefs ?? []),
		evidenceRefs: stableUnique(input.evidenceRefs),
		semanticScore: input.semanticScore ?? null,
		communityAffinity: input.communityAffinity ?? null,
		graphSupport: input.graphSupport ?? null,
		lexicalSupport: input.lexicalSupport ?? null,
		nlpSupport: input.nlpSupport ?? null,
		status: input.status ?? 'proposed',
		producerRevision: input.producerRevision,
	});
}

/**
 * Promotion is the only path in this module that emits canonical taxonomy
 * truth. The result reuses HyperedgeV1 rather than inventing a second relation
 * owner.
 */
export function promoteTaxonomyAssignmentV1(input: {
	candidate: TaxonomyAssignmentCandidateV1;
	workspaceRevision: string;
	sourceRevision: string;
	graphRevision: string;
	promotionEvidenceRefs: readonly string[];
	producerRevision: string;
}): HyperedgeV1 {
	const candidate = TaxonomyAssignmentCandidateV1Schema.parse(input.candidate);
	const evidenceRefs = stableUnique([...candidate.evidenceRefs, ...input.promotionEvidenceRefs]);
	if (evidenceRefs.length === 0) throw new Error('taxonomy promotion requires evidence');
	return createHyperedgeV1({
		predicate: 'ENTITY_CLASSIFIED_AS',
		participants: [
			{ canonicalId: candidate.entityId, role: 'entity', ordinal: 0 },
			{ canonicalId: candidate.conceptId, role: 'concept', ordinal: 1 },
		],
		evidenceRefs,
		workspaceRevision: input.workspaceRevision,
		graphRevision: input.graphRevision,
		sourceRevision: input.sourceRevision,
		producerRevision: input.producerRevision,
	});
}

export function createConceptBroaderThanV1(input: {
	parentConceptId: string;
	childConceptId: string;
	workspaceRevision: string;
	graphRevision: string;
	sourceRevision: string;
	evidenceRefs: readonly string[];
	producerRevision: string;
}): HyperedgeV1 {
	if (input.parentConceptId === input.childConceptId) throw new Error('concept cannot be broader than itself');
	if (stableUnique(input.evidenceRefs).length === 0) throw new Error('concept hierarchy relation requires evidence');
	return createHyperedgeV1({
		predicate: 'CONCEPT_BROADER_THAN',
		participants: [
			{ canonicalId: input.parentConceptId, role: 'broader', ordinal: 0 },
			{ canonicalId: input.childConceptId, role: 'narrower', ordinal: 1 },
		],
		evidenceRefs: stableUnique(input.evidenceRefs),
		workspaceRevision: input.workspaceRevision,
		graphRevision: input.graphRevision,
		sourceRevision: input.sourceRevision,
		producerRevision: input.producerRevision,
	});
}
