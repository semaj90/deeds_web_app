import { z } from 'zod';

const FiniteNumberArraySchema = z.array(z.number().finite());

export const GraphHierarchyManifestSchema = z
	.object({
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		communityLevel: z.number().int().nonnegative(),
		communityId: z.string().min(1),
		parentCommunityId: z.string().min(1).nullable(),
		memberCount: z.number().int().nonnegative(),
		createdAt: z.string().datetime(),
	})
	.strict();

export type GraphHierarchyManifest = z.infer<typeof GraphHierarchyManifestSchema>;

export const RoutingMapManifestSchema = z
	.object({
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		somRevision: z.string().min(1),
		somRow: z.number().int().min(0).max(19),
		somCol: z.number().int().min(0).max(19),
		clusterId: z.string().min(1).nullable(),
		routeNeighborhood: z.array(z.string().min(1)).default([]),
		createdAt: z.string().datetime(),
	})
	.strict();

export type RoutingMapManifest = z.infer<typeof RoutingMapManifestSchema>;

export const ProjectionDistortionStatsSchema = z
	.object({
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		jacobianNorm: z.number().finite().min(0).nullable(),
		singularValues: FiniteNumberArraySchema.default([]),
		neighborhoodPreservation: z.number().finite().min(0).max(1).nullable(),
		createdAt: z.string().datetime(),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (value.singularValues.length === 0 && value.jacobianNorm === null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['singularValues'],
				message: 'Either singularValues or jacobianNorm must be provided for distortion analysis.',
			});
		}
	});

export type ProjectionDistortionStats = z.infer<typeof ProjectionDistortionStatsSchema>;

export function validateGraphHierarchyManifest(value: unknown): GraphHierarchyManifest {
	return GraphHierarchyManifestSchema.parse(value);
}

export function validateRoutingMapManifest(value: unknown): RoutingMapManifest {
	return RoutingMapManifestSchema.parse(value);
}

export function validateProjectionDistortionStats(value: unknown): ProjectionDistortionStats {
	return ProjectionDistortionStatsSchema.parse(value);
}
