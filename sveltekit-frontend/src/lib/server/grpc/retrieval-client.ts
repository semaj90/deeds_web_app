/**
 * gRPC Retrieval Client — server-only.
 *
 * Uses retrieval.proto's RetrievalService for RAG+KAG+DAG evidence search
 * via gRPC (offloads pgvector/Qdrant/graph-hop to a dedicated service).
 *
 * Fallback: If gRPC is disabled or unavailable, returns null so the caller
 * can fall through to the inline TypeScript pipeline.
 *
 * ENV:
 *   RETRIEVAL_GRPC_URL     — gRPC server address (default: 127.0.0.1:50053)
 *   RETRIEVAL_GRPC_ENABLED — "true" to enable gRPC path (default: "false")
 */
import { ENV } from '$lib/server/env.server.js';
import type { yorha } from '$lib/generated/proto/retrieval_pb.js';

// ── Types (mirror retrieval.proto messages — validated against generated types) ─

export interface EvidenceSearchParams {
	query: string;
	caseId?: string;
	limit?: number;
	expandSections?: boolean;
	jurisdiction?: string;
}

export interface SearchResult {
	evidenceId: string;
	chunkIndex: number;
	content: string;
	score: number;
	metadata: {
		sectionPath?: string[];
		heading?: string;
		citations?: string[];
		fileName?: string;
		tokenCount?: number;
		extractionMethod?: string;
	};
	rerank?: {
		cosine: number;
		sharedCitations: number;
		jurisdictionMatch: number;
		sectionProximity: number;
		finalScore: number;
	};
}

export interface GraphNeighbor {
	nodeId: string;
	title: string;
	evidenceType: string;
	connectionType: string;
	strength: number;
	confidence: number;
	aiReasoning?: string;
}

export interface DocumentContext {
	evidenceId: string;
	fileName: string;
	fileType: string;
	description: string;
	aiSummary?: string;
	aiTagsJson?: string;
	keyEntitiesJson?: string;
}

export interface ContextBundle {
	hit: SearchResult;
	siblings: SearchResult[];
	sectionPath: string[];
	heading: string;
	citations: string[];
	graphNeighbors: GraphNeighbor[];
	documentContext?: DocumentContext;
}

export interface SearchTiming {
	embedMs: number;
	searchMs: number;
	rerankMs: number;
	hopMs: number;
	kagMs: number;
	dagMs: number;
	totalMs: number;
}

export interface EvidenceSearchResponse {
	results: SearchResult[];
	bundles: ContextBundle[];
	timing: SearchTiming;
	cacheSource?: string;
}

// ── gRPC client (lazy-loaded, singleton) ────────────────────────────────

const RETRIEVAL_GRPC_URL = ENV.RETRIEVAL_GRPC_URL;
const RETRIEVAL_GRPC_ENABLED = ENV.RETRIEVAL_GRPC_ENABLED;

let grpcClient: any = null;
let grpcLoadFailed = false;

async function getGrpcClient(): Promise<any> {
	if (grpcLoadFailed) return null;
	if (grpcClient) return grpcClient;

	try {
		const grpc = await import('@grpc/grpc-js');
		const protoLoader = await import('@grpc/proto-loader');
		const { resolve } = await import('path');

		const PROTO_PATH = resolve(process.cwd(), 'proto/active/retrieval.proto');

		const packageDefinition = await protoLoader.load(PROTO_PATH, {
			keepCase: false,
			longs: Number,
			enums: String,
			defaults: true,
			oneofs: true
		});

		const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
		const RetrievalService = protoDescriptor.yorha.retrieval.RetrievalService;

		grpcClient = new RetrievalService(
			RETRIEVAL_GRPC_URL,
			grpc.credentials.createInsecure()
		);

		return grpcClient;
	} catch (err) {
		console.warn('[retrieval-client] gRPC client init failed, will use inline fallback:', (err as Error).message);
		grpcLoadFailed = true;
		return null;
	}
}

// ── gRPC evidence search ────────────────────────────────────────────────

/**
 * Search evidence via gRPC RetrievalService.
 * Returns null if gRPC is disabled/unavailable (caller falls back to inline pipeline).
 */
export async function searchEvidenceViaGrpc(
	params: EvidenceSearchParams,
	timeoutMs = 10_000
): Promise<EvidenceSearchResponse | null> {
	if (!RETRIEVAL_GRPC_ENABLED) return null;

	const client = await getGrpcClient();
	if (!client) return null;

	return new Promise((resolve) => {
		const deadline = new Date(Date.now() + timeoutMs);

		client.searchEvidence(
			{
				query: params.query,
				caseId: params.caseId ?? '',
				limit: params.limit ?? 10,
				expandSections: params.expandSections ?? true,
				jurisdiction: params.jurisdiction ?? ''
			},
			{ deadline },
			(err: Error | null, response: yorha.retrieval.IEvidenceSearchResponse) => {
				if (err) {
					console.warn('[retrieval-client] gRPC SearchEvidence failed:', err.message);
					resolve(null);
					return;
				}

				if (!response) {
					resolve(null);
					return;
				}

				// Map proto response to TypeScript interface
				resolve(mapProtoResponse(response));
			}
		);
	});
}

// ── Response mapping (proto → TS) ───────────────────────────────────────

function mapProtoResult(r: any): SearchResult {
	return {
		evidenceId: r.evidenceId ?? '',
		chunkIndex: r.chunkIndex ?? 0,
		content: r.content ?? '',
		score: r.score ?? 0,
		metadata: {
			sectionPath: r.metadata?.sectionPath ?? [],
			heading: r.metadata?.heading ?? '',
			citations: r.metadata?.citations ?? [],
			fileName: r.metadata?.fileName ?? '',
			tokenCount: r.metadata?.tokenCount ?? 0,
			extractionMethod: r.metadata?.extractionMethod ?? ''
		},
		rerank: r.rerank
			? {
					cosine: r.rerank.cosine ?? 0,
					sharedCitations: r.rerank.sharedCitations ?? 0,
					jurisdictionMatch: r.rerank.jurisdictionMatch ?? 0,
					sectionProximity: r.rerank.sectionProximity ?? 0,
					finalScore: r.rerank.finalScore ?? 0
				}
			: undefined
	};
}

function mapProtoNeighbor(n: any): GraphNeighbor {
	return {
		nodeId: n.nodeId ?? '',
		title: n.title ?? '',
		evidenceType: n.evidenceType ?? '',
		connectionType: n.connectionType ?? '',
		strength: n.strength ?? 0,
		confidence: n.confidence ?? 0,
		aiReasoning: n.aiReasoning || undefined,
	};
}

function mapProtoDocContext(d: any): DocumentContext | undefined {
	if (!d) return undefined;
	return {
		evidenceId: d.evidenceId ?? '',
		fileName: d.fileName ?? '',
		fileType: d.fileType ?? '',
		description: d.description ?? '',
		aiSummary: d.aiSummary || undefined,
		aiTagsJson: d.aiTagsJson || undefined,
		keyEntitiesJson: d.keyEntitiesJson || undefined,
	};
}

function mapProtoResponse(response: any): EvidenceSearchResponse {
	return {
		results: (response.results ?? []).map(mapProtoResult),
		bundles: (response.bundles ?? []).map((b: any) => ({
			hit: mapProtoResult(b.hit),
			siblings: (b.siblings ?? []).map(mapProtoResult),
			sectionPath: b.sectionPath ?? [],
			heading: b.heading ?? '',
			citations: b.citations ?? [],
			graphNeighbors: (b.graphNeighbors ?? []).map(mapProtoNeighbor),
			documentContext: mapProtoDocContext(b.documentContext),
		})),
		timing: {
			embedMs: Math.round(response.timing?.embedMs ?? 0),
			searchMs: Math.round(response.timing?.searchMs ?? 0),
			rerankMs: Math.round(response.timing?.rerankMs ?? 0),
			hopMs: Math.round(response.timing?.hopMs ?? 0),
			kagMs: Math.round(response.timing?.kagMs ?? 0),
			dagMs: Math.round(response.timing?.dagMs ?? 0),
			totalMs: Math.round(response.timing?.totalMs ?? 0),
		},
		cacheSource: response.cacheSource || undefined
	};
}

// ── Health check ────────────────────────────────────────────────────────

/**
 * Check gRPC RetrievalService health.
 */
export async function checkRetrievalHealth(): Promise<{
	available: boolean;
	enabled: boolean;
	url: string;
	status?: string;
	pgvectorConnected?: boolean;
	qdrantConnected?: boolean;
}> {
	const base = { enabled: RETRIEVAL_GRPC_ENABLED, url: RETRIEVAL_GRPC_URL };

	if (!RETRIEVAL_GRPC_ENABLED) {
		return { ...base, available: false };
	}

	const client = await getGrpcClient();
	if (!client) {
		return { ...base, available: false };
	}

	return new Promise((resolve) => {
		const deadline = new Date(Date.now() + 3000);
		client.health({ service: 'retrieval' }, { deadline }, (err: any, response: any) => {
			if (err) {
				resolve({ ...base, available: false });
				return;
			}
			resolve({
				...base,
				available: response.status === 'healthy',
				status: response.status,
				pgvectorConnected: response.pgvectorConnected,
				qdrantConnected: response.qdrantConnected
			});
		});
	});
}