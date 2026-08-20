import { getNeo4jDriver } from '$lib/server/neo4j-driver.js';
import type { ResourceEnvelopeV1 } from '$lib/server/retrieval/bounded-resolution.js';
import {
	selectGraphAlgorithm,
	type GraphAlgorithmDecisionV1,
	type GraphExpansionIntent
} from './graph-algorithm-policy.js';

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

export type AtlasGraphExpansionStatus = 'PROVEN' | 'BOUNDARY_EXHAUSTED' | 'ALGORITHM_UNAVAILABLE';

export interface AtlasGraphExpandResult {
	nodes: AtlasGraphNode[];
	edges: AtlasGraphEdge[];
	hops: number;
	status: AtlasGraphExpansionStatus;
	decision: GraphAlgorithmDecisionV1;
	truncated: boolean;
	reasonCodes: string[];
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

function neo4jBfsPattern(direction: 'out' | 'in' | 'both', maxHops: number): string {
	if (direction === 'out') return `(source)-[rels*1..${maxHops}]->(n)`;
	if (direction === 'in') return `(source)<-[rels*1..${maxHops}]-(n)`;
	return `(source)-[rels*1..${maxHops}]-(n)`;
}

/**
 * Bounded live-graph executor used by atlas.graph.expand.
 *
 * Only plain BFS / reverse-BFS are executable here today. The policy can name
 * richer algorithms so the contract is forward-compatible, but those choices
 * fail closed until a real cuGraph/GDS/temporal executor is wired and parity
 * proven. This prevents an empty or approximate mock from masquerading as a
 * successful graph result.
 */
export async function expandAtlasGraph(input: AtlasGraphExpandRequest): Promise<AtlasGraphExpandResult> {
	const envelope = envelopeFor(input);
	const requestedHops = Math.max(0, Math.floor(input.maxHops));
	const maxHops = Math.min(requestedHops, envelope.maxGraphHops, HARD_MAX_HOPS);
	const maxNodes = Math.max(1, Math.min(input.maxNodes ?? DEFAULT_MAX_NODES, envelope.maxCandidates));
	const maxEdges = Math.max(1, input.maxEdges ?? DEFAULT_MAX_EDGES);
	const direction = input.direction ?? 'both';

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

	if (maxHops === 0) {
		return {
			nodes: [],
			edges: [],
			hops: 0,
			status: 'BOUNDARY_EXHAUSTED',
			decision,
			truncated: true,
			reasonCodes: [...decision.reasonCodes, 'ZERO_HOP_ENVELOPE']
		};
	}

	if (!['bfs', 'reverse_bfs'].includes(decision.algorithm)) {
		return {
			nodes: [],
			edges: [],
			hops: 0,
			status: 'ALGORITHM_UNAVAILABLE',
			decision,
			truncated: false,
			reasonCodes: [...decision.reasonCodes, `EXECUTOR_NOT_WIRED:${decision.backend}:${decision.algorithm}`]
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

		return {
			nodes: [...nodeMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
			edges: [...edgeMap.values()].sort((a, b) => `${a.from}:${a.type}:${a.to}`.localeCompare(`${b.from}:${b.type}:${b.to}`)),
			hops: observedHops,
			status: truncated ? 'BOUNDARY_EXHAUSTED' : 'PROVEN',
			decision,
			truncated,
			reasonCodes: [...decision.reasonCodes, truncated ? 'RESOURCE_BOUNDARY_REACHED' : 'BOUNDED_NEO4J_EXPANSION']
		};
	} finally {
		await session.close();
	}
}
