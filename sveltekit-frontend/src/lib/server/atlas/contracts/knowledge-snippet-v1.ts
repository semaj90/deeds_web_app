import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Non-canonical, evidence-bearing context inspired by governed semantic snippets. */
export const KnowledgeSnippetV1Schema = z.object({
	schema: z.literal('atlas.knowledge-snippet.v1'),
	snippetId: z.string().min(1),
	kind: z.enum(['CONCEPT_DEFINITION', 'METRIC_DEFINITION', 'BUSINESS_RULE', 'AUTHORITATIVE_SOURCE', 'RELATIONSHIP_HINT']),
	text: z.string().min(1),
	conceptIds: z.array(z.string().min(1)).max(64),
	domainIds: z.array(z.string().min(1)).max(32),
	evidenceRefs: z.array(z.string().min(1)).min(1).max(64),
	sourceRefs: z.array(z.string().min(1)).max(64),
	sourceKind: z.enum(['INTERNAL_SOURCE', 'EXTERNAL_SOURCE', 'RUNTIME_OBSERVATION', 'MANUAL_CURATED']),
	workspaceRevision: z.string().min(1).nullable(),
	sourceRevision: z.string().min(1).nullable(),
	ontologyRevision: z.string().min(1).nullable(),
	producerRevision: z.string().min(1),
	authorityScore: z.number().finite().min(0).max(1),
	freshnessScore: z.number().finite().min(0).max(1),
	usageScore: z.number().finite().min(0).max(1),
	permissionScope: z.enum(['PUBLIC', 'INTERNAL', 'ROLE_SCOPED', 'UNKNOWN']),
	status: z.enum(['PROPOSED', 'REVIEW_REQUIRED', 'ADMITTED', 'REJECTED']),
	canonicalAuthority: z.literal(false),
}).strict();

export type KnowledgeSnippetV1 = z.infer<typeof KnowledgeSnippetV1Schema>;

function unique(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

/** Creates a deterministic context proposal around existing Atlas concept IDs. */
export function createKnowledgeSnippetV1(input: Omit<KnowledgeSnippetV1, 'snippetId' | 'schema' | 'canonicalAuthority'>): KnowledgeSnippetV1 {
	const body = {
		schema: 'atlas.knowledge-snippet.v1' as const,
		kind: input.kind,
		text: input.text.trim(),
		conceptIds: unique(input.conceptIds),
		domainIds: unique(input.domainIds),
		evidenceRefs: unique(input.evidenceRefs),
		sourceRefs: unique(input.sourceRefs),
		sourceKind: input.sourceKind,
		workspaceRevision: input.workspaceRevision,
		sourceRevision: input.sourceRevision,
		ontologyRevision: input.ontologyRevision,
		producerRevision: input.producerRevision,
		authorityScore: input.authorityScore,
		freshnessScore: input.freshnessScore,
		usageScore: input.usageScore,
		permissionScope: input.permissionScope,
		status: input.status,
		canonicalAuthority: false as const,
	};
	const snippetId = `snippet:${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32)}`;
	return KnowledgeSnippetV1Schema.parse({ ...body, snippetId });
}

/**
 * Deterministic context selection only. It never promotes, persists, or
 * changes snippet status; callers must provide the permitted scopes.
 */
export function selectKnowledgeSnippetsV1(input: {
	snippets: readonly KnowledgeSnippetV1[];
	allowedPermissionScopes: readonly KnowledgeSnippetV1['permissionScope'][];
	conceptIds?: readonly string[];
	limit?: number;
}): KnowledgeSnippetV1[] {
	const allowed = new Set(input.allowedPermissionScopes);
	const concepts = new Set(input.conceptIds ?? []);
	const limit = Math.max(0, Math.floor(input.limit ?? 8));
	return input.snippets
		.map((snippet) => KnowledgeSnippetV1Schema.parse(snippet))
		.filter((snippet) => snippet.status === 'ADMITTED' && allowed.has(snippet.permissionScope))
		.filter((snippet) => concepts.size === 0 || snippet.conceptIds.some((id) => concepts.has(id)))
		.sort((left, right) => {
			const score = (snippet: KnowledgeSnippetV1) => snippet.authorityScore * 0.5 + snippet.freshnessScore * 0.3 + snippet.usageScore * 0.2;
			return score(right) - score(left) || left.snippetId.localeCompare(right.snippetId);
		})
		.slice(0, limit);
}
