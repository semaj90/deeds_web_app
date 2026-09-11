import { describe, expect, it } from 'vitest';
import { createKnowledgeSnippetV1, KnowledgeSnippetV1Schema, selectKnowledgeSnippetsV1 } from './knowledge-snippet-v1.js';

describe('KnowledgeSnippetV1', () => {
	it('is deterministic and remains non-canonical', () => {
		const input = {
			kind: 'BUSINESS_RULE' as const, text: 'A qualified lead requires a booked demonstration.',
			conceptIds: ['concept:lead', 'concept:lead'], domainIds: ['atlas:sales'], evidenceRefs: ['receipt:1'], sourceRefs: ['docs/rules.md'],
			sourceKind: 'INTERNAL_SOURCE' as const, workspaceRevision: 'sha256:workspace', sourceRevision: 'sha256:source', ontologyRevision: 'atlas-ontology:v1', producerRevision: 'producer:test:v1',
			authorityScore: 0.9, freshnessScore: 0.8, usageScore: 0.7, permissionScope: 'INTERNAL' as const, status: 'REVIEW_REQUIRED' as const,
		};
		const first = createKnowledgeSnippetV1(input);
		expect(createKnowledgeSnippetV1({ ...input, conceptIds: ['concept:lead'] })).toEqual(first);
		expect(first.canonicalAuthority).toBe(false);
		expect(KnowledgeSnippetV1Schema.parse(first)).toEqual(first);
	});

	it('requires evidence', () => {
		expect(() => createKnowledgeSnippetV1({ kind: 'CONCEPT_DEFINITION', text: 'x', conceptIds: [], domainIds: [], evidenceRefs: [], sourceRefs: [], sourceKind: 'MANUAL_CURATED', workspaceRevision: null, sourceRevision: null, ontologyRevision: null, producerRevision: 'producer:test:v1', authorityScore: 0, freshnessScore: 0, usageScore: 0, permissionScope: 'UNKNOWN', status: 'PROPOSED' })).toThrow();
	});

	it('selects only admitted snippets within the caller permission scope', () => {
		const snippet = createKnowledgeSnippetV1({ kind: 'METRIC_DEFINITION', text: 'Revenue is recognized on settlement.', conceptIds: ['concept:revenue'], domainIds: ['atlas:finance'], evidenceRefs: ['receipt:2'], sourceRefs: ['metric:revenue'], sourceKind: 'MANUAL_CURATED', workspaceRevision: null, sourceRevision: null, ontologyRevision: 'atlas-ontology:v1', producerRevision: 'producer:test:v1', authorityScore: 1, freshnessScore: 1, usageScore: 1, permissionScope: 'INTERNAL', status: 'ADMITTED' });
		const rejected = createKnowledgeSnippetV1({ ...snippet, snippetId: undefined as never, status: 'REVIEW_REQUIRED' });
		expect(selectKnowledgeSnippetsV1({ snippets: [snippet, rejected], allowedPermissionScopes: ['INTERNAL'], conceptIds: ['concept:revenue'] })).toEqual([snippet]);
		expect(selectKnowledgeSnippetsV1({ snippets: [snippet], allowedPermissionScopes: ['PUBLIC'] })).toEqual([]);
	});
});
