/**
 * Multi-Protocol Embedding Client — server-only.
 *
 * 4-tier fallback chain for batch 768d embeddings:
 *   1. gRPC (port 50051, 5s timeout) — binary protocol, lowest latency
 *   2. QUIC/NATS (port 4222, 5s timeout) — HTTP/3, 0-RTT, multiplexed
 *   3. HTTP/Ollama Batch (/api/embed, 60s timeout) — standard REST
 *   4. HTTP/Ollama Sequential (/api/embeddings, 15s/text) — legacy fallback
 *
 * ENV:
 *   EMBEDDING_GRPC_URL      — gRPC server address (default: 127.0.0.1:50051)
 *   EMBEDDING_GRPC_ENABLED  — "true" to enable gRPC path (default: "false")
 *   EMBEDDING_QUIC_ENABLED  — "true" to enable QUIC/NATS path (default: "false")
 *   NATS_URL                — NATS server URL (default: nats://127.0.0.1:4222)
 */
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';
import type { embedding } from '$lib/generated/proto/embedding_pb.js';

// ── Types ──────────────────────────────────────────────────────────────────

/** Re-export proto interfaces for consumers */
export type ProtoEmbeddingRequest = embedding.IEmbeddingRequest;
export type ProtoEmbeddingResponse = embedding.IEmbeddingResponse;
export type ProtoHealthResponse = embedding.IHealthResponse;

export interface EmbeddingResult {
	vectors: number[][];
	model: string;
	dimension: number;
	source: 'grpc' | 'quic' | 'http-ollama';
	totalMs: number;
}

// ── gRPC client (lazy-loaded, singleton) ───────────────────────────────────

let grpcClient: any = null;
let grpcLoadFailed = false;

async function getGrpcClient(): Promise<any> {
	if (grpcLoadFailed) return null;
	if (grpcClient) return grpcClient;

	try {
		const grpc = await import('@grpc/grpc-js');
		const protoLoader = await import('@grpc/proto-loader');
		const { resolve } = await import('path');

		// Use Go microservice's proto (matches the gRPC server implementation)
		const PROTO_PATH = resolve(process.cwd(), '../go-microservice/proto/embedding/embedding.proto');

		const packageDefinition = await protoLoader.load(PROTO_PATH, {
			keepCase: false,
			longs: Number,
			enums: String,
			defaults: true,
			oneofs: true
		});

		const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
		const EmbeddingService = protoDescriptor.embedding.EmbeddingService;

		grpcClient = new EmbeddingService(
			ENV.EMBEDDING_GRPC_URL,
			grpc.credentials.createInsecure()
		);

		return grpcClient;
	} catch (err) {
		console.warn('[embedding-client] gRPC client init failed, will use HTTP fallback:', (err as Error).message);
		grpcLoadFailed = true;
		return null;
	}
}

// ── gRPC embedding call ────────────────────────────────────────────────────

async function generateViaGrpc(texts: string[], timeoutMs = 5000): Promise<number[][] | null> {
	const client = await getGrpcClient();
	if (!client) return null;

	return new Promise((resolve) => {
		const deadline = new Date(Date.now() + timeoutMs);

		// Go proto: GenerateEmbedding({ texts, normalize, use_cache, model_name })
		client.generateEmbedding(
			{ texts, normalize: true, useCache: true, modelName: SERVER_EMBEDDING_MODEL },
			{ deadline },
			(err: Error | null, response: any) => {
				if (err) {
					console.warn('[embedding-client] gRPC call failed:', err.message);
					resolve(null);
					return;
				}

				if (!response || !response.success) {
					console.warn('[embedding-client] gRPC response error:', response?.error);
					resolve(null);
					return;
				}

				// Go proto: EmbeddingVector.values (float[])
				const vectors = (response.embeddings ?? []).map((e: any) =>
					Array.isArray(e.values) ? e.values : []
				);

				resolve(vectors);
			}
		);
	});
}

// ── QUIC/NATS embedding call ──────────────────────────────────────────────

let natsConnection: any = null;
let natsLoadFailed = false;

async function getNatsConnection(): Promise<any> {
	if (natsLoadFailed) return null;
	if (natsConnection) return natsConnection;

	try {
		const nats = await import('nats');
		natsConnection = await nats.connect({
			servers: [ENV.NATS_URL],
			name: 'embedding-client',
			maxReconnectAttempts: 2,
			reconnectTimeWait: 500,
			timeout: 3000
		});
		return natsConnection;
	} catch (err) {
		console.warn('[embedding-client] NATS/QUIC init failed, will skip QUIC tier:', (err as Error).message);
		natsLoadFailed = true;
		return null;
	}
}

async function generateViaQuic(texts: string[], timeoutMs = 5000): Promise<number[][] | null> {
	const nc = await getNatsConnection();
	if (!nc) return null;

	try {
		const codec = {
			encode: (obj: any) => new TextEncoder().encode(JSON.stringify(obj)),
			decode: (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data))
		};

		const request = {
			texts,
			model: SERVER_EMBEDDING_MODEL,
			normalize: true,
			timestamp: Date.now()
		};

		const msg = await nc.request(
			'legal.embedding.request',
			codec.encode(request),
			{ timeout: timeoutMs }
		);

		const response = codec.decode(msg.data);
		if (response.status === 'success' && Array.isArray(response.embeddings)) {
			return response.embeddings;
		}
		return null;
	} catch (err) {
		console.warn('[embedding-client] QUIC/NATS embedding failed:', (err as Error).message);
		return null;
	}
}

// ── HTTP/Ollama fallback ───────────────────────────────────────────────────

/**
 * Batch embedding via Ollama /api/embed (input: string[] → embeddings: number[][]).
 * Falls back to sequential /api/embeddings if batch API is unavailable.
 */
async function generateViaHttp(texts: string[]): Promise<number[][]> {
	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, input: texts }),
			signal: AbortSignal.timeout(60_000)
		});

		if (res.ok) {
			const data = await res.json();
			if (data.embeddings && Array.isArray(data.embeddings) && data.embeddings.length === texts.length) {
				return data.embeddings;
			}
		}
	} catch {
		// Batch API unavailable — fall through to sequential
	}

	return generateViaHttpSingle(texts);
}

/** Sequential fallback using old /api/embeddings (single prompt per request) */
async function generateViaHttpSingle(texts: string[]): Promise<number[][]> {
	const vectors: number[][] = [];

	for (const text of texts) {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, prompt: text }),
			signal: AbortSignal.timeout(15_000)
		});

		if (!res.ok) throw new Error(`Ollama embedding failed: ${res.status}`);
		const data = await res.json();
		vectors.push(data.embedding);
	}

	return vectors;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate embeddings for a batch of texts.
 * 4-tier fallback: gRPC → QUIC/NATS → HTTP batch → HTTP sequential.
 */
export async function generateEmbeddings(texts: string[]): Promise<EmbeddingResult> {
	const start = performance.now();

	// Tier 1: gRPC (binary protocol, lowest latency)
	if (ENV.EMBEDDING_GRPC_ENABLED) {
		const grpcVectors = await generateViaGrpc(texts);
		if (grpcVectors && grpcVectors.length === texts.length && grpcVectors[0]?.length > 0) {
			return {
				vectors: grpcVectors,
				model: 'embeddinggemma-grpc',
				dimension: grpcVectors[0].length,
				source: 'grpc',
				totalMs: Math.round(performance.now() - start)
			};
		}
	}

	// Tier 2: QUIC/NATS (HTTP/3, 0-RTT, multiplexed)
	if (ENV.EMBEDDING_QUIC_ENABLED) {
		const quicVectors = await generateViaQuic(texts);
		if (quicVectors && quicVectors.length === texts.length && quicVectors[0]?.length > 0) {
			return {
				vectors: quicVectors,
				model: 'embeddinggemma-quic',
				dimension: quicVectors[0].length,
				source: 'quic',
				totalMs: Math.round(performance.now() - start)
			};
		}
	}

	// Tier 3+4: HTTP/Ollama (batch → sequential fallback)
	const httpVectors = await generateViaHttp(texts);
	return {
		vectors: httpVectors,
		model: SERVER_EMBEDDING_MODEL,
		dimension: httpVectors[0]?.length ?? 768,
		source: 'http-ollama',
		totalMs: Math.round(performance.now() - start)
	};
}

/**
 * Generate a single embedding (convenience wrapper).
 */
export async function generateSingleEmbedding(text: string): Promise<number[]> {
	const result = await generateEmbeddings([text]);
	return result.vectors[0];
}

/**
 * Check gRPC service health.
 */
export async function checkGrpcHealth(): Promise<{
	available: boolean;
	enabled: boolean;
	url: string;
	status?: string;
	device?: string;
}> {
	const base = {
		enabled: ENV.EMBEDDING_GRPC_ENABLED,
		url: ENV.EMBEDDING_GRPC_URL
	};

	if (!ENV.EMBEDDING_GRPC_ENABLED) {
		return { ...base, available: false };
	}

	const client = await getGrpcClient();
	if (!client) {
		return { ...base, available: false };
	}

	return new Promise((resolve) => {
		const deadline = new Date(Date.now() + 3000);
		// Go proto: HealthCheck({ check_gpu, check_redis })
		client.healthCheck({ checkGpu: true, checkRedis: true }, { deadline }, (err: Error | null, response: any) => {
			if (err) {
				resolve({ ...base, available: false });
				return;
			}
			resolve({
				...base,
				available: response.healthy === true,
				status: response.healthy ? 'healthy' : 'unhealthy',
				device: response.gpuAvailable ? 'cuda' : 'cpu'
			});
		});
	});
}
