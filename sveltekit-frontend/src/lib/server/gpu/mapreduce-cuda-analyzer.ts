import { pgRows } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server.js';
/**
 * MapReduce CUDA Analyzer
 * GPU-accelerated semantic indexing for codebase wiki
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { fork, type ChildProcess } from 'child_process';
import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
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
    // Format patterns as PostgreSQL array literal
    const patternsArray = `{${patterns.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(',')}}`;
    await db.execute(
      sql`INSERT INTO codebase_mapreduce_jobs
			    (id, job_type, status, total_files, batch_size, concurrency, file_patterns)
			    VALUES (${jobId}, 'embed', 'pending', 0, ${this.config.batchSize}, ${this.config.concurrency}, ${patternsArray}::text[])`
    );
    return jobId;
  }

  async getJobStatus(jobId: string): Promise<MapReduceJob | null> {
    const result = await db.execute(sql`SELECT * FROM codebase_mapreduce_jobs WHERE id = ${jobId}`);
    return (pgRows<Record<string, unknown>>(result)[0] as unknown as MapReduceJob | null) || null;
  }
}

export async function createCodebaseEmbeddingJob(
  patterns: string[],
  config?: { batchSize?: number; concurrency?: number }
): Promise<string> {
  const analyzer = new MapReduceCUDAAnalyzer({
    batchSize: config?.batchSize ?? 32,
    concurrency: config?.concurrency ?? 4,
  });
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
    type JobRow = {
      file_patterns: string[] | null;
      batch_size: number | null;
      concurrency: number | null;
    };
    const job = pgRows<JobRow>(jobResult)[0];
    if (!job) throw new Error('Job not found');

    const patterns = job.file_patterns || [];
    const batchSize = job.batch_size || 32;
    const concurrency = job.concurrency || 4;

    // Scan files using glob patterns
    // SvelteKit dev server runs from sveltekit-frontend/, so go up to repo root
    const projectRoot = path.resolve(process.cwd(), '..');
    const allFiles: string[] = [];

    for (const pattern of patterns) {
      const files = await glob(pattern, { cwd: projectRoot, absolute: false });
      allFiles.push(...files.map((f) => path.join(projectRoot, f)));
    }

    console.log(`[MapReduce] Found ${allFiles.length} files from ${patterns.length} patterns`);

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

    // Fork a runner process outside Vite to spawn worker threads
    // Vite dev server transforms worker_threads internally, causing zombie workers.
    // child_process.fork() creates a separate Node.js process that bypasses Vite.
    const runnerPath = path.resolve(process.cwd(), 'src/lib/server/gpu/mapreduce-runner.mjs');
    if (!existsSync(runnerPath)) {
      throw new Error(`MapReduce runner not found: ${runnerPath}`);
    }

    let runner: ChildProcess | null = null;

    await new Promise<void>((resolve, reject) => {
      runner = fork(runnerPath, [], {
        stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL,
          OLLAMA_URL: ENV.OLLAMA_BASE_URL,
        },
      });

      runner.on('message', (msg: any) => {
        if (msg.type === 'ready') {
          console.log('[MapReduce] Runner ready, starting workers...');
          runner!.send({ type: 'start', jobId, concurrency, batchSize });
          resolve();
        } else if (msg.type === 'worker-exit') {
          console.log(`[MapReduce] Worker ${msg.workerId} exited (code ${msg.code})`);
        } else if (msg.type === 'worker-error') {
          console.error(`[MapReduce] Worker ${msg.workerId} error:`, msg.error);
        } else if (msg.type === 'all-done') {
          console.log('[MapReduce] All workers finished');
        }
      });

      runner.on('error', (err) => {
        console.error('[MapReduce] Runner error:', err);
        reject(err);
      });

      runner.on('exit', (code) => {
        console.log(`[MapReduce] Runner exited (code ${code})`);
      });

      // Timeout waiting for ready
      setTimeout(() => reject(new Error('Runner did not start in 5s')), 5000);
    });

    // Poll for job completion — derive progress from completed chunks
    const pollInterval = setInterval(async () => {
      try {
        const countsResult = await db.execute(
          sql`SELECT
						COUNT(*) FILTER (WHERE status = 'completed') as completed,
						COUNT(*) FILTER (WHERE status IN ('pending', 'processing')) as remaining,
						COUNT(DISTINCT file_path) FILTER (WHERE status = 'completed') as files_done
					FROM mapreduce_map_queue WHERE job_id = ${jobId}`
        );
        type CountRow = { completed: string; remaining: string; files_done: string };
        const counts = pgRows<CountRow>(countsResult)[0];
        const completed = parseInt(counts.completed || '0');
        const remaining = parseInt(counts.remaining || '0');
        const filesDone = parseInt(counts.files_done || '0');

        // Update processed_files count
        await db.execute(
          sql`UPDATE codebase_mapreduce_jobs SET processed_files = ${filesDone} WHERE id = ${jobId}`
        );

        const statusResult = await db.execute(
          sql`SELECT total_files FROM codebase_mapreduce_jobs WHERE id = ${jobId}`
        );
        const totalFiles = pgRows<{ total_files: number }>(statusResult)[0]?.total_files || 1;
        const progress = (filesDone / totalFiles) * 100;
        onProgress?.(progress);

        if (remaining === 0 && completed > 0) {
          clearInterval(pollInterval);
          await db.execute(
            sql`UPDATE codebase_mapreduce_jobs SET status = 'completed', processed_files = ${filesDone}, completed_at = NOW() WHERE id = ${jobId}`
          );
          if (runner && !runner.killed) runner.kill();
          console.log(
            `[MapReduce] Job ${jobId} completed: ${completed} chunks, ${filesDone} files`
          );
        }
      } catch (err) {
        console.error('[MapReduce] Poll error:', err);
      }
    }, 2000);
  } catch (error) {
    console.error(`[MapReduce] Job ${jobId} failed:`, error);
    await db.execute(
      sql`UPDATE codebase_mapreduce_jobs SET status = 'failed', error_message = ${String(error)} WHERE id = ${jobId}`
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
