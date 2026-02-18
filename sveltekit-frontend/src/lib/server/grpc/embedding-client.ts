/**
 * gRPC Embedding Client — server-only.
 *
 * Uses embedding.proto's EmbeddingService for batch 768d embeddings
 * via gRPC (lower latency than HTTP/Ollama when the gRPC server is up).
 *
 * Fallback: If gRPC is disabled or unavailable, falls through to HTTP/Ollama.
 *
 * ENV:
 *   EMBEDDING_GRPC_URL    — gRPC server address (default: 127.0.0.1:50051)
 *   EMBEDDING_GRPC_ENABLED — "true" to enable gRPC path (default: "false")
 */
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface EmbeddingResult {
	vectors: number[][];
	model: string;
	dimension: number;
	source: 'grpc' | 'http-ollama';
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

		const PROTO_PATH = resolve(process.cwd(), 'proto/active/embedding.proto');

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

	const chunks = texts.map((text, i) => ({
		chunkId: `chunk_${i}`,
		text,
		filePath: '',
		language: 'en',
		metadata: {}
	}));

	return new Promise((resolve) => {
		const deadline = new Date(Date.now() + timeoutMs);

		client.generateEmbeddings(
			{ chunks, batchSize: texts.length, normalize: true, maxLength: 512 },
			{ deadline },
			(err: any, response: any) => {
				if (err) {
					console.warn('[embedding-client] gRPC call failed:', err.message);
					resolve(null);
					return;
				}

				if (!response || response.status !== 'success') {
					resolve(null);
					return;
				}

				const vectors = (response.embeddings ?? []).map((e: any) =>
					Array.isArray(e.vector) ? e.vector : []
				);

				resolve(vectors);
			}
		);
	});
}

// ── HTTP/Ollama fallback ───────────────────────────────────────────────────

async function generateViaHttp(texts: string[]): Promise<number[][]> {
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
 * Tries gRPC first (if enabled), falls back to HTTP/Ollama.
 */
export async function generateEmbeddings(texts: string[]): Promise<EmbeddingResult> {
	const start = performance.now();

	// Try gRPC path if enabled
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
		// gRPC failed — fall through to HTTP
	}

	// HTTP/Ollama fallback
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
		client.health({ service: 'embedding' }, { deadline }, (err: any, response: any) => {
			if (err) {
				resolve({ ...base, available: false });
				return;
			}
			resolve({
				...base,
				available: response.status === 'healthy',
				status: response.status,
				device: response.device
			});
		});
	});
}
