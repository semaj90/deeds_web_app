import {
	ATLAS_MASTRA_GRAPH_SCHEMA,
	AtlasWorkflowSpecSchema,
	sha256Stable,
	type AtlasWorkflowSpecV1,
	type DagNodePlanV1,
} from './contracts.js';

export type MastraEntryType = 'step' | 'tool' | 'agent' | 'workflow';

export interface MastraWorkflowEntryV1 {
	type: MastraEntryType;
	id: string;
	toolId?: string;
	agentId?: string;
	workflowRef?: string;
	description?: string;
	canSuspend: boolean;
	metadata: Record<string, unknown>;
}

export interface MastraWorkflowGraphV1 {
	schema: typeof ATLAS_MASTRA_GRAPH_SCHEMA;
	workflowId: string;
	workflowRevision: number;
	atlasChecksum: string;
	formatRevision: 'mastra-json-v1';
	entries: MastraWorkflowEntryV1[];
	edges: Array<{ from: string; to: string; kind: 'SEQUENCE' | 'PARALLEL' | 'BRANCH' }>;
	checksum: string;
}

function mapNodeType(node: DagNodePlanV1): MastraEntryType {
	if (node.kind === 'MODEL') return 'agent';
	if (['TOOL', 'MUTATE', 'VALIDATE', 'PROJECT', 'CACHE_INVALIDATE', 'MATERIALIZE'].includes(node.kind)) {
		return 'tool';
	}
	return 'step';
}

function capabilityId(node: DagNodePlanV1): string | undefined {
	return node.capability ?? undefined;
}

export function compileAtlasWorkflowToMastra(input: AtlasWorkflowSpecV1): MastraWorkflowGraphV1 {
	const workflow = AtlasWorkflowSpecSchema.parse(input);
	const nodeIds = new Set(workflow.nodes.map((node) => node.nodeId));
	for (const edge of workflow.edges) {
		if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
			throw new Error(`workflow edge references unknown node: ${edge.from} -> ${edge.to}`);
		}
	}

	const entries = [...workflow.nodes]
		.sort((a, b) => a.nodeId.localeCompare(b.nodeId))
		.map((node): MastraWorkflowEntryV1 => {
			const type = mapNodeType(node);
			return {
				type,
				id: node.nodeId,
				...(type === 'tool' && capabilityId(node) ? { toolId: capabilityId(node) } : {}),
				...(type === 'agent' && capabilityId(node) ? { agentId: capabilityId(node) } : {}),
				canSuspend: node.kind === 'APPROVAL',
				metadata: {
					atlasNodeKind: node.kind,
					lane: node.lane ?? null,
					inputRefs: node.inputRefs,
					outputRefs: node.outputRefs,
					dependsOn: node.dependsOn,
					resources: node.resources,
					retry: node.retry,
					idempotencyKey: node.idempotencyKey,
					requiredEvidenceRefs: node.requiredEvidenceRefs,
					atlasNodeChecksum: node.checksum,
				},
			};
		});

	const base = {
		schema: ATLAS_MASTRA_GRAPH_SCHEMA,
		workflowId: workflow.workflowId,
		workflowRevision: workflow.workflowRevision,
		atlasChecksum: workflow.checksum,
		formatRevision: 'mastra-json-v1' as const,
		entries,
		edges: [...workflow.edges].sort((a, b) => `${a.from}|${a.to}|${a.kind}`.localeCompare(`${b.from}|${b.to}|${b.kind}`)),
	};

	return { ...base, checksum: sha256Stable(base) };
}

export interface MastraParityResult {
	ok: boolean;
	missingNodeIds: string[];
	extraNodeIds: string[];
	edgeMismatch: boolean;
	atlasChecksumMatch: boolean;
}

export function validateMastraGraphParity(
	workflow: AtlasWorkflowSpecV1,
	graph: MastraWorkflowGraphV1,
): MastraParityResult {
	const atlas = AtlasWorkflowSpecSchema.parse(workflow);
	const atlasNodes = new Set(atlas.nodes.map((node) => node.nodeId));
	const graphNodes = new Set(graph.entries.map((entry) => entry.id));
	const missingNodeIds = [...atlasNodes].filter((id) => !graphNodes.has(id)).sort();
	const extraNodeIds = [...graphNodes].filter((id) => !atlasNodes.has(id)).sort();
	const normalizeEdges = (edges: Array<{ from: string; to: string; kind: string }>) =>
		edges.map((edge) => `${edge.from}|${edge.to}|${edge.kind}`).sort();
	const edgeMismatch = JSON.stringify(normalizeEdges(atlas.edges)) !== JSON.stringify(normalizeEdges(graph.edges));
	const atlasChecksumMatch = graph.atlasChecksum === atlas.checksum;
	return {
		ok: missingNodeIds.length === 0 && extraNodeIds.length === 0 && !edgeMismatch && atlasChecksumMatch,
		missingNodeIds,
		extraNodeIds,
		edgeMismatch,
		atlasChecksumMatch,
	};
}
