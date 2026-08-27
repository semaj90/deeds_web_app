import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { HyperRelationV1 } from '../graph/hyper-relation-v1.js';

export const HypergraphQueryModeV1Schema = z.enum(['entity', 'relation', 'hybrid']);
export type HypergraphQueryModeV1 = z.infer<typeof HypergraphQueryModeV1Schema>;

export const HypergraphSeedV1Schema = z.object({
	canonicalId: z.string().min(1),
	score: z.number().finite(),
	source: z.enum(['semantic_768', 'lexical', 'ast', 'graph', 'human']),
	evidenceRef: z.string().min(1),
}).strict();
export type HypergraphSeedV1 = z.infer<typeof HypergraphSeedV1Schema>;

export const HypergraphRetrievalBudgetV1Schema = z.object({
	maxSeeds: z.number().int().positive().max(512),
	maxRelations: z.number().int().positive().max(4096),
	maxEntities: z.number().int().positive().max(8192),
	maxHops: z.number().int().nonnegative().max(8),
	maxEvidenceRefs: z.number().int().positive().max(16384),
}).strict();
export type HypergraphRetrievalBudgetV1 = z.infer<typeof HypergraphRetrievalBudgetV1Schema>;

export const HypergraphRetrievedRelationV1Schema = z.object({
	relationId: z.string().min(1),
	relationType: z.string().min(1),
	matchedParticipantIds: z.array(z.string().min(1)),
	participantIds: z.array(z.string().min(1)).min(2),
	evidenceRefs: z.array(z.string().min(1)),
	structuralScore: z.number().finite().min(0).max(1),
}).strict();
export type HypergraphRetrievedRelationV1 = z.infer<typeof HypergraphRetrievedRelationV1Schema>;

export const HypergraphRetrievalResultV1Schema = z.object({
	schema: z.literal('atlas.hypergraph-retrieval-result.v1'),
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	queryRevision: z.string().min(1),
	mode: HypergraphQueryModeV1Schema,
	seedIds: z.array(z.string().min(1)),
	relations: z.array(HypergraphRetrievedRelationV1Schema),
	entityIds: z.array(z.string().min(1)),
	evidenceRefs: z.array(z.string().min(1)),
	truncated: z.boolean(),
	projectionHash: z.string().min(1),
}).strict();
export type HypergraphRetrievalResultV1 = z.infer<typeof HypergraphRetrievalResultV1Schema>;

function stableHash(value: unknown): string {
	return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function dedupe<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function relationParticipantIds(relation: HyperRelationV1): string[] {
	return relation.participants
		.slice()
		.sort((a, b) => a.ordinal - b.ordinal || a.canonicalId.localeCompare(b.canonicalId))
		.map((participant) => participant.canonicalId);
}

/**
 * Deterministic structural expansion over canonical n-ary relations.
 *
 * Inspired by the entity/hyperedge separation used in HyperGraphRAG, but
 * adapted to Parent Atlas ownership rules: HyperRelationV1 remains canonical;
 * semantic_768 only proposes seeds; traversal never invents pairwise facts.
 */
export function retrieveHypergraphContextV1(input: {
	workspaceRevision: string;
	sourceRevision: string;
	queryRevision: string;
	mode: HypergraphQueryModeV1;
	seeds: readonly HypergraphSeedV1[];
	relations: readonly HyperRelationV1[];
	budget: HypergraphRetrievalBudgetV1;
}): HypergraphRetrievalResultV1 {
	const budget = HypergraphRetrievalBudgetV1Schema.parse(input.budget);
	const seeds = input.seeds
		.map((seed) => HypergraphSeedV1Schema.parse(seed))
		.sort((a, b) => b.score - a.score || a.canonicalId.localeCompare(b.canonicalId))
		.slice(0, budget.maxSeeds);

	const relationByParticipant = new Map<string, HyperRelationV1[]>();
	for (const relation of input.relations) {
		if (relation.workspaceRevision !== input.workspaceRevision) continue;
		if (relation.sourceRevision !== input.sourceRevision) continue;
		for (const participant of relation.participants) {
			const bucket = relationByParticipant.get(participant.canonicalId) ?? [];
			bucket.push(relation);
			relationByParticipant.set(participant.canonicalId, bucket);
		}
	}

	const visitedEntities = new Set<string>(seeds.map((seed) => seed.canonicalId));
	const visitedRelations = new Map<string, HyperRelationV1>();
	let frontier = [...visitedEntities];
	let truncated = false;

	for (let hop = 0; hop <= budget.maxHops && frontier.length > 0; hop += 1) {
		const nextFrontier = new Set<string>();
		for (const entityId of frontier.sort()) {
			for (const relation of (relationByParticipant.get(entityId) ?? []).slice().sort((a, b) => a.relationId.localeCompare(b.relationId))) {
				if (!visitedRelations.has(relation.relationId)) {
					if (visitedRelations.size >= budget.maxRelations) {
						truncated = true;
						break;
					}
					visitedRelations.set(relation.relationId, relation);
				}
				for (const participant of relation.participants) {
					if (!visitedEntities.has(participant.canonicalId)) {
						if (visitedEntities.size >= budget.maxEntities) {
							truncated = true;
							break;
						}
						visitedEntities.add(participant.canonicalId);
						nextFrontier.add(participant.canonicalId);
					}
				}
			}
			if (truncated) break;
		}
		if (truncated) break;
		frontier = [...nextFrontier];
	}

	// KAG-05I: the hop loop can also stop because budget.maxHops was reached
	// while frontier still holds unexplored entities — that is coverage cut
	// short just as much as hitting maxRelations/maxEntities, and must not be
	// reported as complete (repo rule: no silent caps).
	if (frontier.length > 0) {
		truncated = true;
	}

	const seedSet = new Set(seeds.map((seed) => seed.canonicalId));
	const relations = [...visitedRelations.values()]
		.sort((a, b) => a.relationId.localeCompare(b.relationId))
		.map((relation) => {
			const participantIds = relationParticipantIds(relation);
			const matchedParticipantIds = participantIds.filter((id) => seedSet.has(id));
			const structuralScore = participantIds.length === 0 ? 0 : matchedParticipantIds.length / participantIds.length;
			return HypergraphRetrievedRelationV1Schema.parse({
				relationId: relation.relationId,
				relationType: relation.relationType,
				matchedParticipantIds,
				participantIds,
				evidenceRefs: dedupe(relation.evidenceRefs).sort(),
				structuralScore,
			});
		});

	const evidenceRefs = dedupe([
		...seeds.map((seed) => seed.evidenceRef),
		...relations.flatMap((relation) => relation.evidenceRefs),
	]).sort();
	if (evidenceRefs.length > budget.maxEvidenceRefs) {
		evidenceRefs.length = budget.maxEvidenceRefs;
		truncated = true;
	}

	const payload = {
		workspaceRevision: input.workspaceRevision,
		sourceRevision: input.sourceRevision,
		queryRevision: input.queryRevision,
		mode: input.mode,
		seedIds: seeds.map((seed) => seed.canonicalId),
		relationIds: relations.map((relation) => relation.relationId),
		entityIds: [...visitedEntities].sort(),
		evidenceRefs,
	};

	return HypergraphRetrievalResultV1Schema.parse({
		schema: 'atlas.hypergraph-retrieval-result.v1',
		workspaceRevision: input.workspaceRevision,
		sourceRevision: input.sourceRevision,
		queryRevision: input.queryRevision,
		mode: input.mode,
		seedIds: payload.seedIds,
		relations,
		entityIds: payload.entityIds,
		evidenceRefs,
		truncated,
		projectionHash: stableHash(payload),
	});
}
