/**
 * Parent Atlas Scene Ontology Bridge (v1)
 *
 * Additive, typed bridge connecting 3D scene objects, procedural geometry recipes,
 * and spatial hierarchy to domain concepts and evidence provenance.
 *
 * Invariants:
 * - Separated from the 13-domain software/code taxonomy (DOMAIN-CLASSIFICATION-TAXONOMY.md).
 * - Graph relationships are strictly typed and acyclic for spatial containment.
 * - Model proposals and visual approximations never establish legal findings or identities.
 * - Serialization is deterministic for stable SHA-256 manifest hashing.
 */

import { z } from 'zod';

// ============================================================================
// 1. Concept Categories & Stable Concept Vocabulary
// ============================================================================

export const SCENE_CONCEPT_CATEGORIES_V1 = [
	'spatial_hierarchy',
	'geometry',
	'objects',
	'actors',
	'observations',
	'events',
	'provenance',
	'rendering',
	'workflow'
] as const;

export type SceneConceptCategoryV1 = (typeof SCENE_CONCEPT_CATEGORIES_V1)[number];

export const SCENE_CONCEPTS_V1 = [
	// Spatial hierarchy
	'spatial.city',
	'spatial.building',
	'spatial.floor',
	'spatial.room',
	'spatial.zone',
	'spatial.doorway',
	'spatial.wall',
	'spatial.exterior',

	// Geometry
	'geometry.box',
	'geometry.sphere',
	'geometry.cylinder',
	'geometry.cone',
	'geometry.polygon_prism',
	'geometry.glb',
	'geometry.instanced_mesh',

	// Objects
	'object.furniture',
	'object.furniture.chair',
	'object.furniture.table',
	'object.furniture.desk',
	'object.vehicles',
	'object.fixtures',
	'object.landscape_props',
	'object.exhibits',

	// Actors
	'actor.visual_actor_neutral',
	'actor.rig',
	'actor.appearance',
	'actor.animation',

	// Observations
	'observation.source_image',
	'observation.pixel_region',
	'observation.detection',
	'observation.segmentation',
	'observation.ocr',
	'observation.pose',
	'observation.unresolved',

	// Events
	'event.reviewed_event',
	'event.hypothetical_cue',
	'event.clock_interval',
	'event.visual_action',

	// Provenance
	'provenance.evidence_revision',
	'provenance.analysis_revision',
	'provenance.reviewer_decision',
	'provenance.artifact_hash',

	// Rendering
	'rendering.cell',
	'rendering.lod',
	'rendering.geometry_instance',
	'rendering.camera',
	'rendering.visual_placeholder',

	// Workflow
	'workflow.draft',
	'workflow.proposed',
	'workflow.accepted',
	'workflow.disputed',
	'workflow.unresolved',
	'workflow.saved'
] as const;

export type SceneConceptV1 = (typeof SCENE_CONCEPTS_V1)[number];

export const sceneConceptV1Schema = z.enum(SCENE_CONCEPTS_V1);

// ============================================================================
// 2. Relation Vocabulary
// ============================================================================

export const SCENE_RELATIONS_V1 = [
	'INSTANCE_OF',
	'USES_RECIPE',
	'PART_OF',
	'LOCATED_IN',
	'HAS_CHILD',
	'OBSERVED_IN',
	'DERIVED_FROM',
	'HAS_SOURCE',
	'HAS_APPEARANCE',
	'CUE_TARGETS',
	'BOUND_TO_EVENT',
	'REVIEWED_BY',
	'USES_ASSET'
] as const;

export type SceneRelationV1 = (typeof SCENE_RELATIONS_V1)[number];

export const sceneRelationV1Schema = z.enum(SCENE_RELATIONS_V1);

// ============================================================================
// 3. Tuple Contract
// ============================================================================

export const TUPLE_ORIGINS_V1 = [
	'USER_AUTHORED',
	'MODEL_PROPOSAL',
	'SOURCE_OBSERVATION',
	'REVIEWED_BINDING'
] as const;

export type TupleOriginV1 = (typeof TUPLE_ORIGINS_V1)[number];

export const sceneLinkedTupleV1Schema = z.object({
	schema: z.literal('atlas.scene-linked-tuple.v1'),
	tupleId: z.string().uuid(),
	subjectId: z.string().min(1).max(200),
	predicate: sceneRelationV1Schema,
	objectId: z.string().min(1).max(200),
	origin: z.enum(TUPLE_ORIGINS_V1),
	sourceBinding: z.object({
		evidenceId: z.string().uuid(),
		sourceRevision: z.string().min(1).max(100),
		observationId: z.string().min(1).max(100),
		reviewRevision: z.string().min(1).max(100).optional()
	}).strict().optional()
}).strict();

export type SceneLinkedTupleV1 = z.infer<typeof sceneLinkedTupleV1Schema>;

// ============================================================================
// 4. Deterministic Serialization & Hashing
// ============================================================================

export function stableStringifyTupleV1(tuple: SceneLinkedTupleV1): string {
	return JSON.stringify({
		schema: tuple.schema,
		tupleId: tuple.tupleId,
		subjectId: tuple.subjectId,
		predicate: tuple.predicate,
		objectId: tuple.objectId,
		origin: tuple.origin,
		sourceBinding: tuple.sourceBinding ? {
			evidenceId: tuple.sourceBinding.evidenceId,
			sourceRevision: tuple.sourceBinding.sourceRevision,
			observationId: tuple.sourceBinding.observationId,
			reviewRevision: tuple.sourceBinding.reviewRevision ?? null
		} : null
	});
}

// ============================================================================
// 5. Graph Validation (Acyclic Spatial Containment & Integrity)
// ============================================================================

export interface TupleValidationResultV1 {
	valid: boolean;
	errors: string[];
}

/**
 * Validates a set of scene linked tuples:
 * 1. Unique tuple IDs.
 * 2. No cyclic spatial parenting (`PART_OF`, `HAS_CHILD`, `LOCATED_IN`).
 * 3. Consistent source binding if origin is `SOURCE_OBSERVATION` or `REVIEWED_BINDING`.
 */
export function validateSceneOntologyGraphV1(tuples: readonly SceneLinkedTupleV1[]): TupleValidationResultV1 {
	const errors: string[] = [];
	const seenTupleIds = new Set<string>();

	// Direct child -> parent adjacency map for cycle detection
	const spatialParentOf = new Map<string, string[]>();

	for (let i = 0; i < tuples.length; i++) {
		const tuple = tuples[i];
		const parsed = sceneLinkedTupleV1Schema.safeParse(tuple);
		if (!parsed.success) {
			errors.push(`tuple[${i}] schema error: ${parsed.error.issues[0]?.message ?? 'invalid tuple'}`);
			continue;
		}

		if (seenTupleIds.has(tuple.tupleId)) {
			errors.push(`duplicate tupleId: ${tuple.tupleId}`);
		}
		seenTupleIds.add(tuple.tupleId);

		// Provenance rule: SOURCE_OBSERVATION and REVIEWED_BINDING require sourceBinding
		if ((tuple.origin === 'SOURCE_OBSERVATION' || tuple.origin === 'REVIEWED_BINDING') && !tuple.sourceBinding) {
			errors.push(`tuple[${tuple.tupleId}] with origin '${tuple.origin}' requires sourceBinding`);
		}

		// Spatial containment relations
		if (tuple.predicate === 'PART_OF' || tuple.predicate === 'LOCATED_IN') {
			// subject is child, object is parent
			const parents = spatialParentOf.get(tuple.subjectId) ?? [];
			parents.push(tuple.objectId);
			spatialParentOf.set(tuple.subjectId, parents);
		} else if (tuple.predicate === 'HAS_CHILD') {
			// subject is parent, object is child
			const parents = spatialParentOf.get(tuple.objectId) ?? [];
			parents.push(tuple.subjectId);
			spatialParentOf.set(tuple.objectId, parents);
		}
	}

	// Cycle detection using DFS
	const visited = new Set<string>();
	const inStack = new Set<string>();

	function checkCycle(node: string, path: string[]): boolean {
		visited.add(node);
		inStack.add(node);

		const parents = spatialParentOf.get(node) ?? [];
		for (const parent of parents) {
			if (!visited.has(parent)) {
				if (checkCycle(parent, [...path, parent])) return true;
			} else if (inStack.has(parent)) {
				errors.push(`cyclic spatial hierarchy detected: ${[...path, parent].join(' -> ')}`);
				return true;
			}
		}

		inStack.delete(node);
		return false;
	}

	for (const node of spatialParentOf.keys()) {
		if (!visited.has(node)) {
			checkCycle(node, [node]);
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
