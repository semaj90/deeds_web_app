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
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { codebaseChunkIndex } from '../db/schema-postgres.js';

import { ENV } from '$lib/server/env.server.js';
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
  private turbovecUrl = ENV.TURBOVEC_SIDECAR ?? 'http://127.0.0.1:8791';
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
    void featureId;
    void embedding768;
    throw new Error('KMEANS_EXECUTION_DISABLED: source and representation revisions are not admitted');
  }

  /**
   * Batch submit KMeans jobs for multiple features
   */
  async submitBatch(embeddings: Map<string, number[]>, dryRun = false): Promise<Map<string, string>> {
    if (!dryRun) {
      throw new Error('KMEANS_EXECUTION_DISABLED: source and representation revisions are not admitted');
    }

    const jobIds = new Map<string, string>();

    console.log(`Submitting ${embeddings.size} KMeans jobs...`);

    for (const [featureId, embedding] of embeddings) {
      try {
        console.log(`[DRY RUN] Would submit KMeans for ${featureId}`);
        jobIds.set(featureId, `dry-run-${featureId}`);
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
    if (!dryRun) {
      throw new Error('KMEANS_RESULT_ADMISSION_DISABLED: outputs lack revision-qualified identity and readback');
    }

    console.log(`[DRY RUN] Would review ${jobIds.size} KMeans jobs; no polling or writes performed.`);
    return { success: jobIds.size, failed: 0 };
  }

  /**
   * Full pipeline: load embeddings, submit, wait, write results
   */
  async runFullPipeline(limit = 1000, dryRun = false): Promise<{ submitted: number; processed: number; failed: number }> {
    if (!dryRun) {
      throw new Error('KMEANS_RESULT_ADMISSION_DISABLED: live execution is blocked pending revision-qualified output admission');
    }

    console.log('Starting TurboVec KMeans pipeline...');

    // Check health
    const healthy = await this.checkHealth();
    if (!healthy) {
      throw new Error('TurboVec is not healthy');
    }

    // Load embeddings from Postgres
    const chunks = await db
      .select()
      .from(codebaseChunkIndex)
      .where(sql`embedding_768 IS NOT NULL`)
      .limit(limit);

    const embeddings = new Map<string, number[]>();

    for (const chunk of chunks) {
      if (!chunk.contentEmbedding) continue;

      embeddings.set(chunk.chunkId, chunk.contentEmbedding as number[]);
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
