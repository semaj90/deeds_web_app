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
 */

import { z } from 'zod';

export const ProjectionOrientationSchema = z.enum(['NATURAL', 'REVERSE', 'UNDIRECTED']);
export type ProjectionOrientation = z.infer<typeof ProjectionOrientationSchema>;

export const GraphProjectionManifestSchema = z
	.object({
		projectionRevision: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionName: z.string().min(1),
		nodeLabels: z.array(z.string().min(1)).min(1),
		relationshipTypes: z.array(z.string().min(1)).min(1),
		orientation: ProjectionOrientationSchema,
		relationshipWeights: z.record(z.string(), z.number().finite()).default({}),
		nodeCount: z.number().int().nonnegative(),
		relationshipCount: z.number().int().nonnegative(),
		createdAt: z.string().datetime(),
	})
	.strict();
export type GraphProjectionManifest = z.infer<typeof GraphProjectionManifestSchema>;

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
