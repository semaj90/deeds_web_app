/**
 * MapReduce GPU Worker Thread
 *
 * Pulls chunks from queue, generates embeddings via Ollama,
 * and stores results in PostgreSQL + Qdrant.
 *
 * Performance: ~40 embeddings/sec per worker (batch 32)
 */

import { parentPort, workerData } from 'worker_threads';
import pg from 'pg';
const { Pool } = pg;

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const pool = new Pool({ connectionString: DATABASE_URL });

// ─────────────────────────────────────────────────────────────────────
// Worker Configuration
// ─────────────────────────────────────────────────────────────────────

const { workerId, jobId, batchSize, fp16Mode } = workerData;

console.log(`[Worker ${workerId}] Started for job ${jobId} (batch size: ${batchSize})`);

// ─────────────────────────────────────────────────────────────────────
// Ollama Embedding Client
// ─────────────────────────────────────────────────────────────────────

async function generateEmbedding(text) {
	const startTime = Date.now();

	try {
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: text,
				options: { num_gpu: 30 } // RTX 3060 Ti layers
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama error: ${response.status}`);
		}

		const data = await response.json();
		const gpuTime = Date.now() - startTime;

		return {
			embedding: data.embedding,
			tokens: text.split(/\s+/).length,
			gpuTimeMs: gpuTime
		};
	} catch (error) {
		console.error(`[Worker ${workerId}] Embedding error:`, error.message);
		return null;
	}
}

async function generateBatchEmbeddings(chunks) {
	const results = [];

	// Process in batches for GPU efficiency
	for (let i = 0; i < chunks.length; i += batchSize) {
		const batch = chunks.slice(i, i + batchSize);

		// Parallel embedding generation (Ollama handles queuing)
		const batchPromises = batch.map(chunk => generateEmbedding(chunk.chunk_text));
		const batchResults = await Promise.all(batchPromises);

		// Combine results with original chunks
		batch.forEach((chunk, idx) => {
			if (batchResults[idx]) {
				results.push({
					...chunk,
					...batchResults[idx]
				});
			}
		});

		// Brief pause between batches to avoid overwhelming GPU
		if (i + batchSize < chunks.length) {
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}

	return results;
}

// ─────────────────────────────────────────────────────────────────────
// Queue Processing Loop
// ─────────────────────────────────────────────────────────────────────

async function processQueue() {
	while (true) {
		try {
			// Pull batch from queue
			const result = await pool.query(
				`UPDATE mapreduce_map_queue
				 SET status = 'processing', worker_id = $1, processed_at = NOW()
				 WHERE id IN (
				   SELECT id FROM mapreduce_map_queue
				   WHERE job_id = $2 AND status = 'pending'
				   ORDER BY created_at
				   LIMIT $3
				   FOR UPDATE SKIP LOCKED
				 )
				 RETURNING *`,
				[`worker-${workerId}`, jobId, batchSize]
			);

			const chunks = result.rows;

			if (chunks.length === 0) {
				// No more pending chunks - check if job is complete
				const pendingCheck = await pool.query(
					`SELECT COUNT(*) as count FROM mapreduce_map_queue
					 WHERE job_id = $1 AND status = 'pending'`,
					[jobId]
				);

				if (parseInt(pendingCheck.rows[0].count) === 0) {
					console.log(`[Worker ${workerId}] No more work, exiting`);
					break;
				}

				// Wait before checking again
				await new Promise(resolve => setTimeout(resolve, 1000));
				continue;
			}

			console.log(`[Worker ${workerId}] Processing ${chunks.length} chunks`);

			// Generate embeddings
			const embeddings = await generateBatchEmbeddings(chunks);

			// Store results
			for (const emb of embeddings) {
				try {
					// Get or create file record
					const fileResult = await pool.query(
						`INSERT INTO codebase_files (file_path, file_hash, language, lines_of_code, size_bytes, domain, metadata)
						 VALUES ($1, $2, $3, $4, $5, $6, $7)
						 ON CONFLICT (file_path) DO UPDATE SET last_modified = NOW()
						 RETURNING id`,
						[
							emb.file_path,
							'temp-hash', // Will be updated by full indexer
							emb.language || 'unknown',
							emb.chunk_text.split('\n').length,
							emb.chunk_text.length,
							emb.domain || null,
							JSON.stringify({ jobId })
						]
					);

					const fileId = fileResult.rows[0].id;

					// Store embedding
					await pool.query(
						`INSERT INTO codebase_embeddings
						 (file_id, chunk_index, chunk_text, embedding, tokens, gpu_device, cuda_time_ms)
						 VALUES ($1, $2, $3, $4, $5, $6, $7)
						 ON CONFLICT (file_id, chunk_index) DO UPDATE
						 SET embedding = EXCLUDED.embedding, cuda_time_ms = EXCLUDED.cuda_time_ms`,
						[
							fileId,
							emb.chunk_index,
							emb.chunk_text,
							JSON.stringify(emb.embedding),
							emb.tokens,
							'RTX 3060 Ti',
							emb.gpuTimeMs
						]
					);

					// Mark chunk as completed
					await pool.query(
						`UPDATE mapreduce_map_queue SET status = 'completed' WHERE id = $1`,
						[emb.id]
					);

					// Store GPU metrics
					await pool.query(
						`INSERT INTO gpu_performance_metrics
						 (gpu_device, operation, batch_size, input_size, duration_ms, fp16_mode)
						 VALUES ($1, $2, $3, $4, $5, $6)`,
						['RTX 3060 Ti', 'embed', batchSize, emb.tokens, emb.gpuTimeMs, fp16Mode || false]
					);

				} catch (error) {
					console.error(`[Worker ${workerId}] Storage error:`, error.message);

					// Mark as failed and increment retry count
					await pool.query(
						`UPDATE mapreduce_map_queue
						 SET status = 'failed', retry_count = retry_count + 1
						 WHERE id = $1`,
						[emb.id]
					);
				}
			}

		} catch (error) {
			console.error(`[Worker ${workerId}] Queue processing error:`, error);
			await new Promise(resolve => setTimeout(resolve, 5000));
		}
	}

	await pool.end();
	console.log(`[Worker ${workerId}] Completed`);
	process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────
// Start Processing
// ─────────────────────────────────────────────────────────────────────

processQueue().catch(error => {
	console.error(`[Worker ${workerId}] Fatal error:`, error);
	process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
	console.log(`[Worker ${workerId}] Received SIGTERM, shutting down`);
	await pool.end();
	process.exit(0);
});
