import { describe, expect, it } from 'vitest';
import { sha256Stable, type AtlasWorkflowSpecV1, type DagNodePlanV1 } from './contracts.js';
import { compileAtlasWorkflowToMastra, validateMastraGraphParity } from './mastra-workflow-compiler.js';

function node(input: Omit<DagNodePlanV1, 'checksum'>): DagNodePlanV1 {
	return { ...input, checksum: sha256Stable(input) };
}

function fixture(): AtlasWorkflowSpecV1 {
	const nodes = [
		node({ nodeId: 'retrieve', kind: 'RETRIEVE', lane: 'semantic', capability: 'semantic.search', inputRefs: [], outputRefs: ['candidates'], dependsOn: [], resources: {}, retry: { maxAttempts: 1, strategy: 'NONE' }, idempotencyKey: 'retrieve:1', requiredEvidenceRefs: [] }),
		node({ nodeId: 'mutate', kind: 'MUTATE', lane: 'tool', capability: 'atlas.filesystem.mutate', inputRefs: ['patch'], outputRefs: ['receipt'], dependsOn: ['retrieve'], resources: {}, retry: { maxAttempts: 1, strategy: 'NONE' }, idempotencyKey: 'mutate:1', requiredEvidenceRefs: ['evidence:1'] }),
		node({ nodeId: 'validate', kind: 'VALIDATE', lane: 'validator', capability: 'atlas.typecheck', inputRefs: ['receipt'], outputRefs: ['validation'], dependsOn: ['mutate'], resources: {}, retry: { maxAttempts: 1, strategy: 'NONE' }, idempotencyKey: 'validate:1', requiredEvidenceRefs: [] }),
	];
	const base = {
		schema: 'atlas.workflow-spec.v1' as const,
		workflowId: 'wf:1', workflowRevision: 1, requestId: 'req:1', workspaceRevision: 'ws:1',
		graphRevision: 'g:1', featureRevision: 'f:1', representationRevision: 'semantic-768-v1',
		intentId: 'intent:1', contextManifestId: 'manifest:1', promptPlanId: 'prompt:1', nodes,
		edges: [
			{ from: 'retrieve', to: 'mutate', kind: 'SEQUENCE' as const },
			{ from: 'mutate', to: 'validate', kind: 'SEQUENCE' as const },
		],
		entryNodeIds: ['retrieve'], terminalNodeIds: ['validate'],
		resourceEnvelope: { tokenBudget: 8192, candidateBudget: 100, graphHopBudget: 2, hyperedgeExpansionBudget: 64, toolCallBudget: 8 },
		retryPolicyRevision: 'retry:1', authorizationPolicyRevision: 'auth:1', validationPolicyRevision: 'validation:1',
	};
	return { ...base, checksum: sha256Stable(base) };
}

describe('Atlas -> Mastra workflow compiler', () => {
	it('compiles a stable JSON-safe graph without changing Atlas ownership', () => {
		const workflow = fixture();
		const first = compileAtlasWorkflowToMastra(workflow);
		const second = compileAtlasWorkflowToMastra(workflow);
		expect(first).toEqual(second);
		expect(first.atlasChecksum).toBe(workflow.checksum);
		expect(first.entries.find((entry) => entry.id === 'mutate')?.toolId).toBe('atlas.filesystem.mutate');
		expect(validateMastraGraphParity(workflow, first).ok).toBe(true);
	});

	it('detects runtime-dialect structural drift', () => {
		const workflow = fixture();
		const graph = compileAtlasWorkflowToMastra(workflow);
		const mutated = { ...graph, entries: graph.entries.filter((entry) => entry.id !== 'validate') };
		const parity = validateMastraGraphParity(workflow, mutated);
		expect(parity.ok).toBe(false);
		expect(parity.missingNodeIds).toEqual(['validate']);
	});
});
