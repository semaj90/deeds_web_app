import { createHash } from 'node:crypto';
import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import type { ResourceEnvelopeV1 } from '$lib/server/retrieval/bounded-resolution.js';
import {
	selectGraphAlgorithm,
	type GraphAlgorithmDecisionV1,
	type GraphExpansionIntent,
	type GraphExpansionBackend
} from './graph-algorithm-policy.js';
import { buildGraphAlgorithmExecutionReceiptV1, type GraphAlgorithmExecutionReceiptV1 } from './graph-algorithm-receipt-v1.js';

export interface AtlasGraphExpandRequest {
	packetKey: string;
	intent?: GraphExpansionIntent;
	targetPacketKey?: string;
	direction?: 'out' | 'in' | 'both';
	maxHops: number;
	maxNodes?: number;
	maxEdges?: number;
	edgeTypes?: string[];
	hasPositiveEdgeWeights?: boolean;
	hasCommunityLabels?: boolean;
	gpuAvailable?: boolean;
	frozenSnapshotAvailable?: boolean;
	resourceEnvelope?: Partial<ResourceEnvelopeV1>;
	graphRevision?: string;
	workspaceRevision?: string;
	graphOrdinalMapChecksum?: string;
	candidateOrdinalMapChecksum?: string | null;
	algorithmLibraryRevision?: string;
}

export interface AtlasGraphNode {
	id: string;
	labels: string[];
}

export interface AtlasGraphEdge {
	from: string;
	to: string;
	type: string;
}

export type AtlasGraphExpansionStatus = 'PROVEN' | 'EXECUTED_UNPROVEN' | 'BOUNDARY_EXHAUSTED' | 'ALGORITHM_UNAVAILABLE';
export type AtlasGraphExecutionStatus = 'EXECUTED' | 'UNAVAILABLE' | 'FAILED' | 'BOUNDARY_EXHAUSTED';

export interface AtlasGraphExpandResult {
	nodes: AtlasGraphNode[];
	edges: AtlasGraphEdge[];
	hops: number;
	status: AtlasGraphExpansionStatus;
	decision: GraphAlgorithmDecisionV1;
	truncated: boolean;
	reasonCodes: string[];
	executionReceipt?: GraphAlgorithmExecutionReceiptV1;
	requestedBackend: GraphExpansionBackend;
	effectiveBackend: GraphExpansionBackend | null;
	executionStatus: AtlasGraphExecutionStatus;
	fallbackReason: string | null;
	inputSnapshotChecksum: string | null;
	graphRevision: string | null;
	ordinalMapChecksum: string | null;
	outputChecksum: string | null;
}

const DEFAULT_MAX_NODES = 64;
const DEFAULT_MAX_EDGES = 128;
const HARD_MAX_HOPS = 4;

function envelopeFor(input: AtlasGraphExpandRequest): ResourceEnvelopeV1 {
	return {
		maxVramBytes: input.resourceEnvelope?.maxVramBytes ?? 0,
		maxContextTokens: input.resourceEnvelope?.maxContextTokens ?? 8192,
		maxCandidates: input.resourceEnvelope?.maxCandidates ?? input.maxNodes ?? DEFAULT_MAX_NODES,
		maxGraphHops: Math.min(input.resourceEnvelope?.maxGraphHops ?? input.maxHops, HARD_MAX_HOPS),
		maxHyperedges: input.resourceEnvelope?.maxHyperedges ?? 0,
		maxToolCalls: input.resourceEnvelope?.maxToolCalls ?? 1,
		maxWallMs: input.resourceEnvelope?.maxWallMs ?? 3000
	};
}

function nodeIdentity(properties: Record<string, unknown>): string {
	for (const key of ['canonicalId', 'canonical_id', 'packetKey', 'packet_key', 'id', 'sourceRef', 'source_ref']) {
		const value = properties[key];
		if (typeof value === 'string' && value.trim()) return value;
	}
	return '';
}

function inputChecksum(input: AtlasGraphExpandRequest, direction: 'out' | 'in' | 'both', maxHops: number, maxNodes: number, maxEdges: number): string {
	return createHash('sha256')
		.update(JSON.stringify({
			packetKey: input.packetKey,
			targetPacketKey: input.targetPacketKey ?? null,
			direction,
			maxHops,
			maxNodes,
			maxEdges,
			edgeTypes: [...new Set(input.edgeTypes ?? [])].sort()
		}))
		.digest('hex');
}

function neo4jBfsPattern(direction: 'out' | 'in' | 'both', maxHops: number): string {
	if (direction === 'out') return `(source)-[rels*1..${maxHops}]->(n)`;
	if (direction === 'in') return `(source)<-[rels*1..${maxHops}]-(n)`;
	return `(source)-[rels*1..${maxHops}]-(n)`;
}

function receiptFor(input: AtlasGraphExpandRequest, decision: GraphAlgorithmDecisionV1): GraphAlgorithmExecutionReceiptV1 | undefined {
	if (!input.graphRevision || !input.workspaceRevision || !input.graphOrdinalMapChecksum || !input.algorithmLibraryRevision) return undefined;
	return buildGraphAlgorithmExecutionReceiptV1({
		decision,
		graphRevision: input.graphRevision,
		workspaceRevision: input.workspaceRevision,
		graphOrdinalMapChecksum: input.graphOrdinalMapChecksum,
		candidateOrdinalMapChecksum: input.candidateOrdinalMapChecksum,
		algorithmLibraryRevision: input.algorithmLibraryRevision,
		parameters: { direction: input.direction ?? 'both', maxHops: input.maxHops, maxNodes: input.maxNodes ?? DEFAULT_MAX_NODES },
	});
}

export async function expandAtlasGraph(input: AtlasGraphExpandRequest): Promise<AtlasGraphExpandResult> {
	const envelope = envelopeFor(input);
	const requestedHops = Math.max(0, Math.floor(input.maxHops));
	const maxHops = Math.min(requestedHops, envelope.maxGraphHops, HARD_MAX_HOPS);
	const maxNodes = Math.max(1, Math.min(input.maxNodes ?? DEFAULT_MAX_NODES, envelope.maxCandidates));
	const maxEdges = Math.max(1, input.maxEdges ?? DEFAULT_MAX_EDGES);
	const direction = input.direction ?? 'both';
	const inputSnapshotChecksum = inputChecksum(input, direction, maxHops, maxNodes, maxEdges);

	const decision = selectGraphAlgorithm({
		intent: input.intent ?? 'neighborhood',
		direction,
		hasPositiveEdgeWeights: input.hasPositiveEdgeWeights,
		hasCommunityLabels: input.hasCommunityLabels,
		hasTarget: Boolean(input.targetPacketKey),
		gpuAvailable: input.gpuAvailable,
		frozenSnapshotAvailable: input.frozenSnapshotAvailable,
		envelope: { ...envelope, maxGraphHops: maxHops, maxCandidates: maxNodes }
	});
	const executionReceipt = receiptFor(input, decision);

	if (maxHops === 0) {
		return {
			nodes: [], edges: [], hops: 0, status: 'BOUNDARY_EXHAUSTED', decision, executionReceipt,
			truncated: true, reasonCodes: [...decision.reasonCodes, 'ZERO_HOP_ENVELOPE'],
			requestedBackend: decision.backend, effectiveBackend: null, executionStatus: 'BOUNDARY_EXHAUSTED',
			fallbackReason: null, inputSnapshotChecksum, graphRevision: input.graphRevision ?? null,
			ordinalMapChecksum: input.graphOrdinalMapChecksum ?? null, outputChecksum: null
		};
	}

	if (decision.backend !== 'neo4j' || !['bfs', 'reverse_bfs'].includes(decision.algorithm)) {
		return {
			nodes: [], edges: [], hops: 0, status: 'ALGORITHM_UNAVAILABLE', decision, executionReceipt,
			truncated: false, reasonCodes: [...decision.reasonCodes, `EXECUTOR_NOT_WIRED:${decision.backend}:${decision.algorithm}`],
			requestedBackend: decision.backend, effectiveBackend: null, executionStatus: 'UNAVAILABLE',
			fallbackReason: null, inputSnapshotChecksum, graphRevision: input.graphRevision ?? null,
			ordinalMapChecksum: input.graphOrdinalMapChecksum ?? null, outputChecksum: null
		};
	}

	const driver = getNeo4jDriver();
	const session = driver.session({ database: 'neo4j' });
	const started = Date.now();
	try {
		const pattern = neo4jBfsPattern(direction, maxHops);
		const rows = await session.run(
			`MATCH (source)
			 WHERE source.packetKey = $packetKey
			    OR source.packet_key = $packetKey
			    OR source.canonicalId = $packetKey
			    OR source.canonical_id = $packetKey
			    OR source.id = $packetKey
			 MATCH p=${pattern}
			 WHERE $edgeTypes IS NULL OR all(rel IN rels WHERE type(rel) IN $edgeTypes)
			 RETURN nodes(p) AS pathNodes, relationships(p) AS pathEdges, length(p) AS hops
			 ORDER BY hops ASC
			 LIMIT $pathLimit`,
			{
				packetKey: input.packetKey,
				edgeTypes: input.edgeTypes?.length ? [...new Set(input.edgeTypes)] : null,
				pathLimit: maxNodes
			}
		);

		const nodeMap = new Map<string, AtlasGraphNode>();
		const edgeMap = new Map<string, AtlasGraphEdge>();
		let observedHops = 0;
		let truncated = false;
		for (const record of rows.records) {
			if (Date.now() - started >= envelope.maxWallMs) {
				truncated = true;
				break;
			}
			observedHops = Math.max(observedHops, Number(record.get('hops') ?? 0));
			const pathNodes = (record.get('pathNodes') ?? []) as Array<{ properties?: Record<string, unknown>; labels?: string[] }>;
			const pathEdges = (record.get('pathEdges') ?? []) as Array<{ type?: string }>;
			for (const node of pathNodes) {
				const id = nodeIdentity(node.properties ?? {});
				if (!id) continue;
				if (!nodeMap.has(id) && nodeMap.size >= maxNodes) {
					truncated = true;
					continue;
				}
				nodeMap.set(id, { id, labels: [...(node.labels ?? [])].sort() });
			}
			for (let i = 0; i < pathEdges.length && i + 1 < pathNodes.length; i += 1) {
				if (edgeMap.size >= maxEdges) {
					truncated = true;
					break;
				}
				const from = nodeIdentity(pathNodes[i]?.properties ?? {});
				const to = nodeIdentity(pathNodes[i + 1]?.properties ?? {});
				const type = pathEdges[i]?.type ?? 'RELATED';
				if (!from || !to) continue;
				edgeMap.set(`${from}\u0000${type}\u0000${to}`, { from, to, type });
			}
		}

		const sortedNodes = [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id));
		const sortedEdges = [...edgeMap.values()].sort((a, b) => `${a.from}:${a.type}:${a.to}`.localeCompare(`${b.from}:${b.type}:${b.to}`));
		const outputChecksum = createHash('sha256').update(JSON.stringify({ nodes: sortedNodes.map((node) => node.id), edges: sortedEdges })).digest('hex');
		const hasRows = sortedNodes.length > 0 && sortedEdges.length > 0;
		const status = truncated ? 'BOUNDARY_EXHAUSTED' : hasRows && executionReceipt ? 'PROVEN' : 'EXECUTED_UNPROVEN';
		return {
			nodes: sortedNodes, edges: sortedEdges, hops: observedHops, status, decision, executionReceipt, truncated,
			reasonCodes: [...decision.reasonCodes, truncated ? 'RESOURCE_BOUNDARY_REACHED' : hasRows ? 'BOUNDED_NEO4J_EXPANSION' : 'EMPTY_GRAPH_RESULT'],
			requestedBackend: decision.backend, effectiveBackend: 'neo4j',
			executionStatus: truncated ? 'BOUNDARY_EXHAUSTED' : 'EXECUTED', fallbackReason: null,
			inputSnapshotChecksum, graphRevision: input.graphRevision ?? null,
			ordinalMapChecksum: input.graphOrdinalMapChecksum ?? null, outputChecksum
		};
	} catch (error) {
		return {
			nodes: [], edges: [], hops: 0, status: 'ALGORITHM_UNAVAILABLE', decision, executionReceipt, truncated: false,
			reasonCodes: [...decision.reasonCodes, `EXECUTION_FAILED:${error instanceof Error ? error.message : String(error)}`],
			requestedBackend: decision.backend, effectiveBackend: 'neo4j', executionStatus: 'FAILED', fallbackReason: null,
			inputSnapshotChecksum, graphRevision: input.graphRevision ?? null,
			ordinalMapChecksum: input.graphOrdinalMapChecksum ?? null, outputChecksum: null
		};
	} finally {
		await session.close();
	}
}
