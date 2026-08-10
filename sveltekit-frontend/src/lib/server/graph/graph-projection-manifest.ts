/**
 * GraphProjectionManifest — GA0 (Patch A: contracts only, no behavior change).
 *
 * Every analytical run (see graph-analysis-types.ts's GraphAnalysisRun) must
 * record exactly which GDS in-memory projection it ran against. Without this,
 * "which graph did this PageRank run actually see?" is unanswerable after the
 * fact — this is the reproducibility contract for graph analysis.
 *
 * Distinct from graph-contract.ts's GraphSnapshotSchema: a snapshot is an
 * extracted node/edge set with a content hash (built by the graph ingestion
 * pipeline); a projection manifest describes a live Neo4j GDS in-memory graph
 * projection (node labels, relationship types, orientation, weights) that an
 * algorithm run executes against. One graph revision can have multiple
 * projections (see README.md point 10 — atlas_dependency_v1,
 * atlas_execution_v1, atlas_feature_v1, atlas_combined_v1).
 *
 * V2 (2026-08-09, CONTRACT_EXPRESSIVENESS_HARDENING): the original schema
 * recorded one `orientation` value for the entire projection. Neo4j GDS's
 * native `gds.graph.project` syntax actually sets orientation independently
 * per relationship type (NATURAL | REVERSE | UNDIRECTED) — and
 * `neo4j-gds-client.ts`'s `ensureProjectionClient()` already builds mixed
 * projections this way (BELONGS_TO_CLUSTER/SIMILAR_TOPOLOGY/HAS_CENTROID/
 * BELONGS_TO_FEATURE forced UNDIRECTED, everything else NATURAL/REVERSE).
 * A single global `orientation` field cannot truthfully describe a mixed
 * projection like `atlas_combined_v1` — the manifest would say "NATURAL"
 * while the live graph actually mixed NATURAL and UNDIRECTED, which is
 * exactly the reproducibility failure this schema exists to prevent.
 *
 * This was surfaced (not by an active bug — nothing has ever `.parse()`'d
 * this schema; Patch A was contracts-only and no adapter persists a
 * manifest instance yet) but by Patch H's betweenness work needing a
 * uniform-orientation projection (`atlas_feature_v1`) precisely because
 * `codeTopology`'s mixed orientation isn't expressible/compatible for that
 * algorithm. See parent-atlas-graph-analysis-contract/tasks.md item 7 for
 * the full incident record. Patch H's live run is unaffected — this is
 * schema debt exposed by that work, not a defect in it.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ProjectionOrientationSchema = z.enum(['NATURAL', 'REVERSE', 'UNDIRECTED']);
export type ProjectionOrientation = z.infer<typeof ProjectionOrientationSchema>;

export const ProjectionAggregationSchema = z.enum(['NONE', 'SINGLE', 'COUNT', 'MIN', 'MAX', 'SUM']);
export type ProjectionAggregation = z.infer<typeof ProjectionAggregationSchema>;

/**
 * One relationship type's projection shape, mirroring the fields GDS's
 * native `gds.graph.project` relationship-projection map actually accepts.
 * `sourceType`/`projectedType` are usually identical (Atlas doesn't rename
 * relationship types on projection today) but are kept distinct so a future
 * renamed/filtered projection doesn't require a schema change.
 */
export const GraphRelationshipProjectionSchema = z
	.object({
		sourceType: z.string().min(1),
		projectedType: z.string().min(1),
		orientation: ProjectionOrientationSchema,
		properties: z.array(z.string().min(1)).optional(),
		aggregation: ProjectionAggregationSchema.default('NONE'),
	})
	.strict();
export type GraphRelationshipProjection = z.infer<typeof GraphRelationshipProjectionSchema>;

export const GraphProjectionManifestSchema = z
	.object({
		projectionRevision: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionName: z.string().min(1),
		nodeLabels: z.array(z.string().min(1)).min(1),
		/**
		 * Per-relationship-type orientation map — the V2 replacement for the
		 * old single global `orientation` field. Keyed by `projectedType`.
		 * Must be non-empty; a projection with zero relationship types isn't
		 * a projection.
		 */
		relationships: z
			.record(z.string().min(1), GraphRelationshipProjectionSchema)
			.refine((r) => Object.keys(r).length > 0, {
				message: 'relationships must contain at least one relationship-type projection',
			}),
		/**
		 * sha256 over the canonicalized (sorted-by-projectedType) relationship
		 * projection set — see computeRelationshipProjectionHash(). Changes
		 * whenever orientation, aggregation, properties, or the included
		 * relationship-type set changes; stable under input reordering.
		 */
		relationshipProjectionHash: z.string().min(1),
		relationshipWeights: z.record(z.string(), z.number().finite()).default({}),
		nodeCount: z.number().int().nonnegative(),
		relationshipCount: z.number().int().nonnegative(),
		createdAt: z.string().datetime(),
	})
	.strict();
export type GraphProjectionManifest = z.infer<typeof GraphProjectionManifestSchema>;

/**
 * Canonicalizes a relationship-projection map into a deterministic,
 * order-independent tuple list (sorted by projectedType) and hashes it.
 * Any semantic change to the projection — orientation, aggregation,
 * properties, or which relationship types are included — changes the hash.
 * Reordering the input record's keys does not.
 */
export function computeRelationshipProjectionHash(
	relationships: Readonly<Record<string, GraphRelationshipProjection>>,
): string {
	const canonical = Object.values(relationships)
		.map((r) => [
			r.projectedType,
			r.sourceType,
			r.orientation,
			r.aggregation ?? 'NONE',
			...(r.properties ? [...r.properties].sort() : []),
		])
		.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/**
 * @deprecated Legacy pre-V2 manifest shape (single global `orientation`).
 * Kept only as the input type for expandLegacyOrientation() below. Confirmed
 * zero live persisters of this shape as of 2026-08-09 — do not construct new
 * manifests this way; build a `relationships` map directly instead.
 */
export interface LegacyGraphProjectionManifestOrientation {
	orientation: ProjectionOrientation;
	relationshipTypes: readonly string[];
}

/**
 * Fail-closed expansion of the legacy single-orientation shape into a V2
 * `relationships` map. This does NOT infer per-type orientation — it applies
 * the single legacy orientation uniformly to every listed relationship type,
 * which is only a correct reconstruction if the original projection actually
 * was homogeneous (true for e.g. a pre-V2 manifest built from
 * `atlas_dependency_v1` or `atlas_feature_v1`, false for `atlas_combined_v1`
 * — callers must know which they have). Throws rather than silently
 * producing an empty/ambiguous manifest.
 */
export function expandLegacyOrientation(
	legacy: LegacyGraphProjectionManifestOrientation,
): Record<string, GraphRelationshipProjection> {
	if (!legacy.relationshipTypes.length) {
		throw new Error('expandLegacyOrientation: relationshipTypes must not be empty');
	}
	const relationships: Record<string, GraphRelationshipProjection> = {};
	for (const type of legacy.relationshipTypes) {
		relationships[type] = {
			sourceType: type,
			projectedType: type,
			orientation: legacy.orientation,
			aggregation: 'NONE',
		};
	}
	return relationships;
}

/**
 * Named projection candidates from README.md point 10, to compare community
 * quality by relationship semantics rather than tuning Leiden's resolution
 * parameter on the undifferentiated combined graph.
 *
 * Corrected 2026-08-09 (Patch E pre-flight audit, see
 * openspec/changes/parent-atlas-graph-analysis-contract/tasks.md) — the original
 * set (`REQUIRES`, `RETURNS`, `PARAMETER_OF`, `IMPLEMENTS_REQUIREMENT`, `EXTENDS`)
 * doesn't exist anywhere in the live graph (confirmed via
 * `CALL db.relationshipTypes()` + per-type counts). Replaced with the actual live
 * relationship types, chosen for the same semantic split README point 10 intends
 * (dependency vs. execution vs. feature/topology vs. test), not a 1:1 rename —
 * `atlas_dependency_v1` is thinner than originally envisioned (`IMPORTS` only,
 * 3,452 edges live) because no live equivalent of REQUIRES/IMPLEMENTS/EXTENDS
 * exists yet. `atlas_test_v1` is new, shared with the sibling
 * `parent-atlas-gpu-graph-vector-substrate` change's `TEST_IMPACT` topology
 * program (defined once here to avoid two possibly-inconsistent definitions).
 */
export const NAMED_PROJECTION_CANDIDATES = {
	atlas_dependency_v1: ['IMPORTS'],
	atlas_execution_v1: ['CALLS'],
	atlas_feature_v1: ['BELONGS_TO_FEATURE', 'SIMILAR_TOPOLOGY'],
	atlas_test_v1: ['TEST_COVERS_FILE'],
	atlas_combined_v1: [
		'IMPORTS', 'CALLS', 'BELONGS_TO_FEATURE', 'SIMILAR_TOPOLOGY',
		'TEST_COVERS_FILE', 'BELONGS_TO_CLUSTER',
	],
} as const satisfies Record<string, readonly string[]>;
export type NamedProjectionCandidate = keyof typeof NAMED_PROJECTION_CANDIDATES;
