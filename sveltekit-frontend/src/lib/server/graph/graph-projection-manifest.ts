/**
 * GraphProjectionManifest — GA0 projection lineage contracts.
 *
 * V2 preserves the existing production-compatible manifest shape.
 * V3 adds fully-qualified projected relationship properties so projection
 * identity changes when source property, default value, or aggregation changes.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ProjectionOrientationSchema = z.enum(['NATURAL', 'REVERSE', 'UNDIRECTED']);
export type ProjectionOrientation = z.infer<typeof ProjectionOrientationSchema>;

export const ProjectionAggregationSchema = z.enum(['NONE', 'SINGLE', 'COUNT', 'MIN', 'MAX', 'SUM']);
export type ProjectionAggregation = z.infer<typeof ProjectionAggregationSchema>;

/** Existing V2 relationship projection. Kept stable for persisted manifests. */
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

/** Existing V2 manifest. Do not reinterpret persisted values. */
export const GraphProjectionManifestSchema = z
	.object({
		projectionRevision: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionName: z.string().min(1),
		nodeLabels: z.array(z.string().min(1)).min(1),
		relationships: z
			.record(z.string().min(1), GraphRelationshipProjectionSchema)
			.refine((r) => Object.keys(r).length > 0, {
				message: 'relationships must contain at least one relationship-type projection',
			}),
		relationshipProjectionHash: z.string().min(1),
		relationshipWeights: z.record(z.string(), z.number().finite()).default({}),
		nodeCount: z.number().int().nonnegative(),
		relationshipCount: z.number().int().nonnegative(),
		createdAt: z.string().datetime(),
	})
	.strict();
export type GraphProjectionManifest = z.infer<typeof GraphProjectionManifestSchema>;

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
 * V3 projected relationship property. This mirrors the semantic inputs that
 * affect a native GDS projection rather than recording only a property name.
 */
export const GraphRelationshipPropertyProjectionV3Schema = z
	.object({
		projectedProperty: z.string().min(1),
		sourceProperty: z.string().min(1),
		defaultValue: z.number().finite().nullable(),
		aggregation: ProjectionAggregationSchema.default('NONE'),
	})
	.strict();
export type GraphRelationshipPropertyProjectionV3 = z.infer<
	typeof GraphRelationshipPropertyProjectionV3Schema
>;

export const GraphRelationshipProjectionV3Schema = z
	.object({
		sourceType: z.string().min(1),
		projectedType: z.string().min(1),
		orientation: ProjectionOrientationSchema,
		aggregation: ProjectionAggregationSchema.default('NONE'),
		properties: z
			.record(z.string().min(1), GraphRelationshipPropertyProjectionV3Schema)
			.default({}),
	})
	.strict()
	.superRefine((relationship, ctx) => {
		for (const [key, property] of Object.entries(relationship.properties)) {
			if (property.projectedProperty !== key) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['properties', key, 'projectedProperty'],
					message: `projectedProperty must match properties key '${key}'`,
				});
			}
		}
	});
export type GraphRelationshipProjectionV3 = z.infer<typeof GraphRelationshipProjectionV3Schema>;

export function computeRelationshipProjectionHashV3(
	relationships: Readonly<Record<string, GraphRelationshipProjectionV3>>,
): string {
	const canonical = Object.values(relationships)
		.map((relationship) => [
			relationship.projectedType,
			relationship.sourceType,
			relationship.orientation,
			relationship.aggregation ?? 'NONE',
			Object.values(relationship.properties)
				.map((property) => [
					property.projectedProperty,
					property.sourceProperty,
					property.defaultValue,
					property.aggregation ?? 'NONE',
				])
				.sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
		])
		.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
	return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export const GraphProjectionManifestV3Schema = z
	.object({
		schema: z.literal('atlas.graph-projection-manifest.v3'),
		projectionRevision: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionName: z.string().min(1),
		nodeLabels: z.array(z.string().min(1)).min(1),
		relationships: z
			.record(z.string().min(1), GraphRelationshipProjectionV3Schema)
			.refine((relationships) => Object.keys(relationships).length > 0, {
				message: 'relationships must contain at least one relationship-type projection',
			}),
		projectionHash: z.string().min(1),
		nodeCount: z.number().int().nonnegative(),
		relationshipCount: z.number().int().nonnegative(),
		createdAt: z.string().datetime(),
	})
	.strict()
	.superRefine((manifest, ctx) => {
		for (const [key, relationship] of Object.entries(manifest.relationships)) {
			if (relationship.projectedType !== key) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['relationships', key, 'projectedType'],
					message: `projectedType must match relationships key '${key}'`,
				});
			}
		}
		const expected = computeRelationshipProjectionHashV3(manifest.relationships);
		if (manifest.projectionHash !== expected) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['projectionHash'],
				message: `projectionHash mismatch: expected ${expected}`,
			});
		}
	});
export type GraphProjectionManifestV3 = z.infer<typeof GraphProjectionManifestV3Schema>;

export interface GraphProjectionFreshnessCheck {
	graphRevision: string;
	projectionRevision: string;
	expectedGraphRevision: string;
	expectedProjectionRevision: string;
}

export function assertGraphProjectionFreshness(input: GraphProjectionFreshnessCheck): GraphProjectionFreshnessCheck {
	const parsed = GraphProjectionManifestSchema.pick({
		graphRevision: true,
		projectionRevision: true,
	}).parse({
		graphRevision: input.graphRevision,
		projectionRevision: input.projectionRevision,
	});

	if (parsed.graphRevision !== input.expectedGraphRevision) {
		throw new Error(
			`stale graph projection rejected: expected graphRevision=${input.expectedGraphRevision}, got ${parsed.graphRevision}`,
		);
	}
	if (parsed.projectionRevision !== input.expectedProjectionRevision) {
		throw new Error(
			`stale graph projection rejected: expected projectionRevision=${input.expectedProjectionRevision}, got ${parsed.projectionRevision}`,
		);
	}
	return input;
}

/** @deprecated Legacy pre-V2 manifest shape. */
export interface LegacyGraphProjectionManifestOrientation {
	orientation: ProjectionOrientation;
	relationshipTypes: readonly string[];
}

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

export const NAMED_PROJECTION_CANDIDATES = {
	atlas_dependency_v1: ['IMPORTS'],
	atlas_execution_v1: ['CALLS'],
	atlas_feature_v1: ['BELONGS_TO_FEATURE', 'SIMILAR_TOPOLOGY'],
	atlas_test_v1: ['TEST_COVERS_FILE'],
	atlas_combined_v1: [
		'IMPORTS',
		'CALLS',
		'BELONGS_TO_FEATURE',
		'SIMILAR_TOPOLOGY',
		'TEST_COVERS_FILE',
		'BELONGS_TO_CLUSTER',
	],
} as const satisfies Record<string, readonly string[]>;
export type NamedProjectionCandidate = keyof typeof NAMED_PROJECTION_CANDIDATES;
