/**
 * TurboVec KMeans Launcher
 *
 * Submits batch KMeans jobs to TurboVec sidecar (:8791) for GPU-accelerated
 * latent space progression: 768-dim → 384-dim → 128-dim → 64-dim
 *
 * Each level uses k-means clustering to reduce dimensionality and discover
 * semantic structure. Results stored as bytea (compressed binary) in Postgres.
 */

import fetch from 'node-fetch';
import { db } from '../db/client.js';
import { codebase_chunk_index } from '../db/schema-postgres.js';
import { eq } from 'drizzle-orm';

export interface KMeansJob {
  job_id: string;
  feature_id: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  levels?: {
    embedding_384?: { vector: number[]; cluster: number };
    embedding_128?: { compressed: string; cluster: number };
    embedding_64?: { compressed: string; cluster: number };
  };
  error?: string;
}

export interface KMeansProgressionPlan {
  feature_id: string;
  input_embedding: number[]; // 768-dim vector
  levels: {
    level_384: { k: number; timeout_ms: number };
    level_128: { k: number; timeout_ms: number };
    level_64: { k: number; timeout_ms: number };
  };
}

export class TurboVecKMeansLauncher {
  private turbovecUrl = 'http://127.0.0.1:8791';
  private pollIntervalMs = 1000;
  private maxWaitTimeMs = 300000; // 5 minutes

  constructor(turbovecUrl?: string) {
    if (turbovecUrl) {
      this.turbovecUrl = turbovecUrl;
    }
  }

  /**
   * Check TurboVec health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.turbovecUrl}/health`, { method: 'GET' });
      return response.ok;
    } catch (err) {
      console.error('TurboVec health check failed:', err);
      return false;
    }
  }

  /**
   * Submit a single feature for KMeans progression
   */
  async submitKMeansJob(featureId: string, embedding768: number[]): Promise<string> {
    const plan: KMeansProgressionPlan = {
      feature_id: featureId,
      input_embedding: embedding768,
      levels: {
        level_384: { k: 100, timeout_ms: 5000 },
        level_128: { k: 64, timeout_ms: 3000 },
        level_64: { k: 20, timeout_ms: 2000 }
      }
    };

    try {
      const response = await fetch(`${this.turbovecUrl}/kmeans/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan)
      });

      if (!response.ok) {
        throw new Error(`TurboVec returned ${response.status}`);
      }

      const data = (await response.json()) as { job_id: string };
      return data.job_id;
    } catch (err) {
      console.error(`Failed to submit KMeans job for ${featureId}:`, err);
      throw err;
    }
  }

  /**
   * Batch submit KMeans jobs for multiple features
   */
  async submitBatch(embeddings: Map<string, number[]>, dryRun = false): Promise<Map<string, string>> {
    const jobIds = new Map<string, string>();

    console.log(`Submitting ${embeddings.size} KMeans jobs...`);

    for (const [featureId, embedding] of embeddings) {
      try {
        if (dryRun) {
          console.log(`[DRY RUN] Would submit KMeans for ${featureId}`);
          jobIds.set(featureId, `dry-run-${featureId}`);
        } else {
          const jobId = await this.submitKMeansJob(featureId, embedding);
          jobIds.set(featureId, jobId);
          console.log(`Submitted ${featureId} → job ${jobId}`);
        }
      } catch (err) {
        console.error(`Failed to submit job for ${featureId}:`, err);
      }
    }

    return jobIds;
  }

  /**
   * Poll for job completion
   */
  async pollJob(jobId: string): Promise<KMeansJob | null> {
    try {
      const response = await fetch(`${this.turbovecUrl}/kmeans/status/${jobId}`, { method: 'GET' });

      if (!response.ok) {
        console.error(`Job status check failed: ${response.status}`);
        return null;
      }

      return (await response.json()) as KMeansJob;
    } catch (err) {
      console.error(`Failed to poll job ${jobId}:`, err);
      return null;
    }
  }

  /**
   * Wait for job completion with polling
   */
  async waitForCompletion(jobId: string, timeoutMs = this.maxWaitTimeMs): Promise<KMeansJob | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const job = await this.pollJob(jobId);

      if (!job) {
        console.error(`Job ${jobId} not found`);
        return null;
      }

      if (job.status === 'complete') {
        return job;
      }

      if (job.status === 'failed') {
        console.error(`Job ${jobId} failed: ${job.error}`);
        return job;
      }

      // Still running, wait and retry
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));
    }

    console.error(`Job ${jobId} timed out after ${timeoutMs}ms`);
    return null;
  }

  /**
   * Fetch and process completed jobs, writing results to Postgres
   */
  async processCompletedJobs(jobIds: Map<string, string>, dryRun = false): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    console.log(`Processing ${jobIds.size} completed jobs...`);

    for (const [featureId, jobId] of jobIds) {
      try {
        const job = await this.waitForCompletion(jobId);

        if (!job || job.status !== 'complete') {
          console.error(`Job ${jobId} did not complete`);
          failed++;
          continue;
        }

        if (dryRun) {
          console.log(`[DRY RUN] Would write results for ${featureId}`);
          success++;
          continue;
        }

        // Write results to Postgres
        await this.writeJobResults(featureId, job);
        success++;
        console.log(`Processed results for ${featureId}`);
      } catch (err) {
        console.error(`Failed to process job ${jobId}:`, err);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Write KMeans job results to Postgres
   */
  private async writeJobResults(featureId: string, job: KMeansJob): Promise<void> {
    if (!job.levels) {
      throw new Error(`No results in job ${job.job_id}`);
    }

    const updates: Partial<typeof codebase_chunk_index> = {};

    // Write 384-dim vector
    if (job.levels.embedding_384) {
      updates.embedding_384 = JSON.stringify(job.levels.embedding_384.vector);
    }

    // Write 128-dim compressed (bytea)
    if (job.levels.embedding_128) {
      updates.embedding_128 = job.levels.embedding_128.compressed as any;
    }

    // Write 64-dim compressed (bytea)
    if (job.levels.embedding_64) {
      updates.embedding_64 = job.levels.embedding_64.compressed as any;
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('No embeddings to write');
    }

    // Update chunk
    const chunks = await db
      .select()
      .from(codebase_chunk_index)
      .where(eq(codebase_chunk_index.feature_id, featureId))
      .limit(1);

    if (chunks.length === 0) {
      throw new Error(`Chunk not found for feature ${featureId}`);
    }

    const chunk = chunks[0];

    await db
      .update(codebase_chunk_index)
      .set({
        ...updates,
        enriched_at: new Date()
      })
      .where(eq(codebase_chunk_index.id, chunk.id));
  }

  /**
   * Full pipeline: load embeddings, submit, wait, write results
   */
  async runFullPipeline(limit = 1000, dryRun = false): Promise<{ submitted: number; processed: number; failed: number }> {
    console.log('Starting TurboVec KMeans pipeline...');

    // Check health
    const healthy = await this.checkHealth();
    if (!healthy) {
      throw new Error('TurboVec is not healthy');
    }

    // Load embeddings from Postgres
    const chunks = await db
      .select()
      .from(codebase_chunk_index)
      .where(/* WHERE embedding_768 IS NOT NULL AND (embedding_384 IS NULL OR embedding_128 IS NULL OR embedding_64 IS NULL) */)
      .limit(limit);

    const embeddings = new Map<string, number[]>();

    for (const chunk of chunks) {
      if (!chunk.content_embedding) continue;

      embeddings.set(chunk.feature_id, chunk.content_embedding);
    }

    console.log(`Loaded ${embeddings.size} embeddings`);

    // Submit jobs
    const jobIds = await this.submitBatch(embeddings, dryRun);

    // Wait for completion and process
    const results = await this.processCompletedJobs(jobIds, dryRun);

    return {
      submitted: jobIds.size,
      processed: results.success,
      failed: results.failed
    };
  }
}

/**
 * Convenience function
 */
export async function launchKMeansProgression(
  limit = 1000,
  dryRun = false,
  turbovecUrl?: string
): Promise<void> {
  const launcher = new TurboVecKMeansLauncher(turbovecUrl);
  const result = await launcher.runFullPipeline(limit, dryRun);

  console.log(`
KMeans Progression Complete
============================
Submitted: ${result.submitted}
Processed: ${result.processed}
Failed: ${result.failed}
  `);
}
