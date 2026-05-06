/**
 * IndexWorkerPool — typed façade over ComputePool for indexer pipeline tasks.
 *
 * Provides strongly-typed convenience methods for the five CPU-bound indexing
 * stages (hash → chunk → metadata → entity → qdrant-payload), all dispatched
 * to the shared compute-worker.mjs pool.
 *
 * Uses the existing singleton pool so the indexer shares threads with the
 * rest of the app (no new processes, no extra memory).
 */
import os from 'os';
import { getComputePool } from '$lib/server/workers/compute-pool.js';

// ── result shapes (mirrors compute-worker.mjs handler outputs) ────────────

export interface HashResult {
	hash: string;
}

export interface ChunkItem {
	text: string;
	startLine: number;
	endLine: number;
	chunkIndex: number;
	sizeBytes: number;
	filePath: string;
}

export interface MetadataResult {
	imports: string[];
	exports: string[];
	lineCount: number;
	sizeBytes: number;
	language: string;
	hasDefaultExport: boolean;
	hasTypes: boolean;
}

export interface EntityResult {
	doc_id: string | undefined;
	documentType: string | undefined;
	sections: unknown[];
	entities: Array<{ type: string; text: string; start: number; end: number; confidence: number }>;
	extraction_confidence: number;
}

export type QdrantPayloadRecord = Record<string, unknown>;

// ── pool constants ─────────────────────────────────────────────────────────

/**
 * Recommended pool size for indexing: leave 2 CPUs for I/O (Ollama, Qdrant, DB).
 * In cluster mode the existing compute-pool already reduces to 1 thread.
 */
export const INDEXER_POOL_SIZE = Math.max(2, (os.availableParallelism?.() ?? os.cpus().length) - 2);

// ── IndexWorkerPool ────────────────────────────────────────────────────────

export class IndexWorkerPool {
	private pool = getComputePool();

	/** SHA-256 hex digest of content. */
	hash(text: string): Promise<HashResult> {
		return this.pool.run('hash', { text }) as Promise<HashResult>;
	}

	/**
	 * Split file text into overlapping line-count chunks.
	 * Returns an array — may be empty for whitespace-only files.
	 */
	chunk(
		text: string,
		filePath: string,
		maxLines = 80,
		overlap = 10,
	): Promise<ChunkItem[]> {
		return this.pool.run('chunk', { text, filePath, maxLines, overlap }) as Promise<ChunkItem[]>;
	}

	/** Lightweight regex-based metadata envelope (~1 ms for 1000-line file). */
	metadata(text: string, filePath: string): Promise<MetadataResult> {
		return this.pool.run('metadata', { text, filePath }) as Promise<MetadataResult>;
	}

	/**
	 * Entity / legal-term extraction via inline regex patterns.
	 * documentId and documentType are optional — used for doc-level provenance.
	 */
	extract(
		text: string,
		documentId?: string,
		documentType?: string,
	): Promise<EntityResult> {
		return this.pool.run('langextract.extract', { text, documentId, documentType }) as Promise<EntityResult>;
	}

	/**
	 * Build a Qdrant-ready payload from a chunk + metadata envelope.
	 * contentHash should come from `hash()` to avoid recomputing.
	 */
	qdrantPayload(
		chunk: ChunkItem,
		metadata: MetadataResult,
		contentHash: string,
	): Promise<QdrantPayloadRecord> {
		return this.pool.run('qdrant_payload', { chunk, metadata, contentHash }) as Promise<QdrantPayloadRecord>;
	}

	/**
	 * Convenience: hash + chunk + metadata + qdrant-payload in the correct order,
	 * all dispatched concurrently where possible.
	 *
	 * Returns one QdrantPayloadRecord per chunk, ready for embedding + upsert.
	 */
	async prepareFile(
		text: string,
		filePath: string,
		opts?: { maxLines?: number; overlap?: number },
	): Promise<{ hash: string; chunks: QdrantPayloadRecord[]; metadata: MetadataResult; entities: EntityResult }> {
		// Hash + chunk + metadata run concurrently
		const [{ hash }, chunks, meta] = await Promise.all([
			this.hash(text),
			this.chunk(text, filePath, opts?.maxLines, opts?.overlap),
			this.metadata(text, filePath),
		]);

		// Entity extraction runs in parallel with payload building
		const [entities, payloads] = await Promise.all([
			this.extract(text, filePath),
			Promise.all(chunks.map((c) => this.qdrantPayload(c, meta, hash))),
		]);

		return { hash, chunks: payloads, metadata: meta, entities };
	}
}

// ── singleton ──────────────────────────────────────────────────────────────

let _instance: IndexWorkerPool | null = null;

export function getIndexWorkerPool(): IndexWorkerPool {
	if (!_instance) _instance = new IndexWorkerPool();
	return _instance;
}
