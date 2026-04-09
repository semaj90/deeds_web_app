/**
 * MapReduce CUDA Analyzer
 * GPU-accelerated semantic indexing for codebase wiki
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { Worker } from 'worker_threads';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import path from 'path';

export interface MapReduceJob {
	id: string;
	jobType: 'embed' | 'cluster' | 'similarity';
	status: 'pending' | 'running' | 'completed' | 'failed';
	totalFiles: number;
	processedFiles: number;
	metrics?: { throughputFilesPerMin: number; totalDurationMs: number };
}

export class MapReduceCUDAAnalyzer {
	constructor(private config = { batchSize: 32, concurrency: 4 }) {}

	async createJob(patterns: string[]): Promise<string> {
		const jobId = crypto.randomUUID();
		await db.execute(
			sql`INSERT INTO codebase_mapreduce_jobs
			    (id, job_type, status, total_files, batch_size, concurrency)
			    VALUES (${jobId}, 'embed', 'pending', 0, ${this.config.batchSize}, ${this.config.concurrency})`
		);
		return jobId;
	}

	async getJobStatus(jobId: string): Promise<MapReduceJob | null> {
		const result = await db.execute(
			sql`SELECT * FROM codebase_mapreduce_jobs WHERE id = ${jobId}`
		);
		return (result as any).rows[0] || null;
	}
}

export async function createCodebaseEmbeddingJob(
	patterns: string[],
	config?: { batchSize?: number; concurrency?: number }
): Promise<string> {
	const analyzer = new MapReduceCUDAAnalyzer(config);
	return await analyzer.createJob(patterns);
}

export async function getJobStatus(jobId: string): Promise<MapReduceJob | null> {
	const analyzer = new MapReduceCUDAAnalyzer();
	return await analyzer.getJobStatus(jobId);
}

/**
 * Process embedding job - scan files, chunk, queue, spawn workers
 */
export async function processEmbeddingJob(
	jobId: string,
	onProgress?: (progress: number) => void
): Promise<void> {
	try {
		// Update job status to running
		await db.execute(
			sql`UPDATE codebase_mapreduce_jobs SET status = 'running', started_at = NOW() WHERE id = ${jobId}`
		);

		// Get job configuration
		const jobResult = await db.execute(
			sql`SELECT * FROM codebase_mapreduce_jobs WHERE id = ${jobId}`
		);
		const job = (jobResult as any).rows[0];
		if (!job) throw new Error('Job not found');

		const patterns = job.file_patterns || [];
		const batchSize = job.batch_size || 32;
		const concurrency = job.concurrency || 4;

		// Scan files using glob patterns
		const projectRoot = path.resolve(process.cwd(), '..');
		const allFiles: string[] = [];

		for (const pattern of patterns) {
			const files = await glob(pattern, { cwd: projectRoot, absolute: false });
			allFiles.push(...files.map(f => path.join(projectRoot, f)));
		}

		// Update total files count
		await db.execute(
			sql`UPDATE codebase_mapreduce_jobs SET total_files = ${allFiles.length} WHERE id = ${jobId}`
		);

		// Chunk files and add to queue
		let chunkIndex = 0;
		for (const filePath of allFiles) {
			try {
				const content = await readFile(filePath, 'utf-8');
				const chunks = chunkFile(content, 512, 50); // 512 tokens, 50 overlap

				// Detect language from file extension
				const ext = path.extname(filePath);
				const language = ext === '.ts' ? 'typescript' : ext === '.svelte' ? 'svelte' : 'unknown';

				// Detect domain from file path
				const domain = detectDomain(filePath);

				for (let i = 0; i < chunks.length; i++) {
					await db.execute(
						sql`INSERT INTO mapreduce_map_queue
							(job_id, file_path, chunk_index, chunk_text, language, domain, status)
							VALUES (${jobId}, ${filePath}, ${i}, ${chunks[i]}, ${language}, ${domain}, 'pending')`
					);
					chunkIndex++;
				}
			} catch (error) {
				console.error(`Failed to process file ${filePath}:`, error);
			}
		}

		console.log(`[MapReduce] Queued ${chunkIndex} chunks for ${allFiles.length} files`);

		// Spawn worker threads
		const workers: Worker[] = [];
		const workerPath = path.join(__dirname, 'mapreduce-worker.mjs');

		for (let i = 0; i < concurrency; i++) {
			const worker = new Worker(workerPath, {
				workerData: {
					workerId: i,
					jobId,
					batchSize,
					fp16Mode: false
				}
			});

			worker.on('error', (error) => {
				console.error(`Worker ${i} error:`, error);
			});

			worker.on('exit', (code) => {
				console.log(`Worker ${i} exited with code ${code}`);
			});

			workers.push(worker);
		}

		// Poll for job completion
		const pollInterval = setInterval(async () => {
			const statusResult = await db.execute(
				sql`SELECT processed_files, total_files, status FROM codebase_mapreduce_jobs WHERE id = ${jobId}`
			);
			const status = (statusResult as any).rows[0];

			if (status) {
				const progress = (status.processed_files / status.total_files) * 100;
				onProgress?.(progress);

				// Check if all workers completed
				const pendingResult = await db.execute(
					sql`SELECT COUNT(*) as count FROM mapreduce_map_queue WHERE job_id = ${jobId} AND status = 'pending'`
				);
				const pendingCount = parseInt((pendingResult as any).rows[0].count);

				if (pendingCount === 0) {
					clearInterval(pollInterval);
					await db.execute(
						sql`UPDATE codebase_mapreduce_jobs SET status = 'completed', completed_at = NOW() WHERE id = ${jobId}`
					);
					workers.forEach(w => w.terminate());
					console.log(`[MapReduce] Job ${jobId} completed`);
				}
			}
		}, 2000);
	} catch (error) {
		console.error(`[MapReduce] Job ${jobId} failed:`, error);
		await db.execute(
			sql`UPDATE codebase_mapreduce_jobs SET status = 'failed', error = ${String(error)} WHERE id = ${jobId}`
		);
		throw error;
	}
}

/**
 * Chunk file content into overlapping segments
 */
function chunkFile(content: string, chunkSize: number, overlap: number): string[] {
	const words = content.split(/\s+/);
	const chunks: string[] = [];
	let i = 0;

	while (i < words.length) {
		const chunk = words.slice(i, i + chunkSize).join(' ');
		chunks.push(chunk);
		i += chunkSize - overlap;
	}

	return chunks;
}

/**
 * Detect domain from file path
 */
function detectDomain(filePath: string): string {
	if (filePath.includes('/auth/')) return 'auth';
	if (filePath.includes('/rag/') || filePath.includes('/retrieval/')) return 'rag';
	if (filePath.includes('/evidence/')) return 'evidence';
	if (filePath.includes('/chat/')) return 'chat';
	if (filePath.includes('/vector/') || filePath.includes('/embedding/')) return 'vector';
	if (filePath.includes('/gpu/') || filePath.includes('/cuda/')) return 'gpu';
	return 'general';
}
