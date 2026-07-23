import { z } from 'zod';

const RelationshipNameSchema = z.enum([
	'contains',
	'materializes',
	'imports',
	'calls',
	'references',
	'depends_on',
	'implements',
	'uses_concept',
	'participates_in',
	'semantic_similar'
]);

export const GraphProjectionPolicySchema = z
	.object({
		node_types: z.array(z.enum(['file', 'symbol', 'packet'])).min(1),
		pagerank_edges: z.array(RelationshipNameSchema).min(1),
		traversal_edges: z.array(RelationshipNameSchema).min(1),
		excluded_edges: z.array(RelationshipNameSchema).min(1),
		default_weight: z.number().finite().positive(),
		minimum_confidence: z.number().finite().min(0).max(1),
		max_hops: z.number().int().min(1).max(3),
		max_fanout: z.number().int().min(1).max(50)
	})
	.strict();

export const OkfLanguageSpecSchema = z.object({
	version: z.number().int().positive(),
	language: z.string().min(1),
	name: z.string().min(1),
	extensions: z.array(z.string().regex(/^\./, 'extension must start with a dot')).min(1),
	exclude_paths: z.array(z.string()).default([])
}).passthrough();

export const OkfGraphManifestSchema = z
	.object({
		version: z.number().int().positive(),
		registries: z.record(z.string(), z.unknown()),
		extractors: z.record(z.string(), z.unknown()),
		pipeline: z.record(z.string(), z.string()),
		relationships: z.array(RelationshipNameSchema).min(1),
		graph_projection: GraphProjectionPolicySchema
	})
	.passthrough()
	.superRefine((manifest, ctx) => {
		const registered = new Set(manifest.relationships);
		const projection = manifest.graph_projection;

		for (const edge of projection.pagerank_edges) {
			if (!registered.has(edge)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['graph_projection', 'pagerank_edges'],
					message: `pagerank edge '${edge}' is not registered in relationships`
				});
			}
			if (projection.excluded_edges.includes(edge)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['graph_projection', 'pagerank_edges'],
					message: `pagerank edge '${edge}' is excluded from authority projection`
				});
			}
		}

		if (!projection.excluded_edges.includes('semantic_similar')) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['graph_projection', 'excluded_edges'],
				message: "semantic_similar must remain excluded from the PageRank projection"
			});
		}
	});

export type OkfGraphManifest = z.infer<typeof OkfGraphManifestSchema>;

function inputAtPath(root: unknown, path: PropertyKey[]): unknown {
	let cursor = root;
	for (const key of path) {
		if (cursor === null || typeof cursor !== 'object') return undefined;
		cursor = (cursor as Record<PropertyKey, unknown>)[key];
	}
	return cursor;
}

function formatIssues(root: unknown, issues: z.core.$ZodIssue[]): string {
	return issues.map((issue) => {
		const input = inputAtPath(root, issue.path);
		return `${issue.path.join('.') || 'manifest'}: ${issue.message}; value=${JSON.stringify(input)}`;
	}).join('; ');
}

export function validateOkfGraphManifest(value: unknown): OkfGraphManifest {
	const result = OkfGraphManifestSchema.safeParse(value);
	if (result.success) return result.data;
	throw new Error(formatIssues(value, result.error.issues));
}

export function validateOkfLanguageSpec(value: unknown): z.infer<typeof OkfLanguageSpecSchema> {
	const result = OkfLanguageSpecSchema.safeParse(value);
	if (result.success) return result.data;
	throw new Error(formatIssues(value, result.error.issues));
}
