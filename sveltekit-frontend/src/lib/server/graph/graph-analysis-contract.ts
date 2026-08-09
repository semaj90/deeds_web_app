/**
 * Graph analysis contract compatibility surface.
 *
 * Keeps the requested graph-analysis contract names stable while delegating
 * to the canonical graph analysis types and projection manifest.
 */

import { z } from 'zod';

export const GraphAnalysisEngineSchema = z.enum([
	'neo4j-gds',
	'networkx',
	'cugraph',
	'gpu-sidecar',
	'offline',
]);
export type GraphAnalysisEngine = z.infer<typeof GraphAnalysisEngineSchema>;

export {
	GraphAlgorithmSchema,
	GraphAnalysisRunSchema,
	GraphAnalysisRunStatusSchema,
	GraphMetricResultSchema,
	CommunityAssignmentSchema,
	CommunityTaxonomyRecordSchema,
	CommunityEvaluationSchema,
	FeatureRowV1Schema,
} from './graph-analysis-types.js';
export type {
	GraphAlgorithm,
	GraphAnalysisRun,
	GraphAnalysisRunStatus,
	GraphMetricResult,
	CommunityAssignment,
	CommunityTaxonomyRecord,
	CommunityEvaluation,
	FeatureRowV1,
} from './graph-analysis-types.js';
export {
	GraphProjectionManifestSchema,
	ProjectionOrientationSchema,
	NAMED_PROJECTION_CANDIDATES,
} from './graph-projection-manifest.js';
export type {
	GraphProjectionManifest,
	ProjectionOrientation,
	NamedProjectionCandidate,
} from './graph-projection-manifest.js';
