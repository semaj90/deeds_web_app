#!/usr/bin/env node
/**
 * Phase 89: Context7 Multi-Core Clustering Server
 * - Exposes HTTP API for concurrent clustering requests
 * - Uses worker threads to bypass GIL-like blocking
 * - Streams results via Server-Sent Events (SSE)
 * - Compatible with FastMCP and ACE agents
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { EventEmitter } from 'events';
import express from 'express';
import Redis from 'ioredis';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.CONTEXT7_PORT || 3007;
const NUM_WORKERS = parseInt(process.env.CONTEXT7_WORKERS || os.cpus().length);

class Context7ClusterServer extends EventEmitter {
  constructor() {
    super();
    this.redis = new Redis({ host: 'localhost', port: 6379, db: 0 });
    this.qdrant = new QdrantClient({ url: 'http://localhost:6333' });
    this.workerPool = [];
    this.activeJobs = new Map();
    this.jobCounter = 0;

    console.log(`🚀 Context7 Multi-Core Clustering Server`);
    console.log(`   Workers: ${NUM_WORKERS} (${os.cpus()[0].model})`);
    console.log(`   Port: ${PORT}\n`);
  }

  /**
   * Initialize worker pool for multi-core processing
   */
  initWorkerPool() {
    for (let i = 0; i < NUM_WORKERS; i++) {
      const worker = new Worker(path.join(__dirname, 'phase89-cluster-worker.mjs'));

      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          console.log(`   ✅ Worker ${i + 1} ready`);
        } else if (msg.type === 'result') {
          this.handleWorkerResult(msg);
        } else if (msg.type === 'error') {
          this.handleWorkerError(msg);
        }
      });

      worker.on('error', (err) => {
        console.error(`   ❌ Worker ${i + 1} error:`, err);
      });

      this.workerPool.push({ worker, busy: false, id: i });
    }
  }

  /**
   * Get next available worker (round-robin)
   */
  getWorker() {
    const available = this.workerPool.find((w) => !w.busy);
    if (available) {
      available.busy = true;
      return available;
    }
    return null; // All busy
  }

  /**
   * Submit clustering job to worker
   */
  async submitJob(errorIds, options = {}) {
    const jobId = ++this.jobCounter;
    const worker = this.getWorker();

    if (!worker) {
      throw new Error('All workers busy. Try again later.');
    }

    const job = {
      id: jobId,
      workerId: worker.id,
      status: 'running',
      startedAt: Date.now(),
      options,
    };

    this.activeJobs.set(jobId, job);

    worker.worker.postMessage({
      type: 'cluster',
      jobId,
      errorIds,
      options,
    });

    return jobId;
  }

  /**
   * Handle worker result
   */
  handleWorkerResult(msg) {
    const { jobId, clusters, summary } = msg;
    const job = this.activeJobs.get(jobId);

    if (job) {
      job.status = 'completed';
      job.result = { clusters, summary };
      job.completedAt = Date.now();

      // Free worker
      const worker = this.workerPool.find((w) => w.id === job.workerId);
      if (worker) worker.busy = false;

      this.emit('job:completed', job);
    }
  }

  /**
   * Handle worker error
   */
  handleWorkerError(msg) {
    const { jobId, error } = msg;
    const job = this.activeJobs.get(jobId);

    if (job) {
      job.status = 'failed';
      job.error = error;

      // Free worker
      const worker = this.workerPool.find((w) => w.id === job.workerId);
      if (worker) worker.busy = false;

      this.emit('job:failed', job);
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Start HTTP server
   */
  startServer() {
    app.use(express.json());

    // Health check
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        workers: this.workerPool.length,
        active_jobs: this.activeJobs.size,
        system: {
          cpus: os.cpus().length,
          memory_free_gb: (os.freemem() / 1e9).toFixed(1),
          uptime_hours: (os.uptime() / 3600).toFixed(1),
        },
      });
    });

    // Submit clustering job
    app.post('/cluster', async (req, res) => {
      try {
        const { error_ids, options } = req.body;

        if (!error_ids || !Array.isArray(error_ids)) {
          return res.status(400).json({ error: 'error_ids must be an array' });
        }

        const jobId = await this.submitJob(error_ids, options);

        res.json({
          job_id: jobId,
          status: 'submitted',
          poll_url: `/jobs/${jobId}`,
          stream_url: `/jobs/${jobId}/stream`,
        });
      } catch (err) {
        res.status(503).json({ error: err.message });
      }
    });

    // Get job status
    app.get('/jobs/:jobId', (req, res) => {
      const jobId = parseInt(req.params.jobId);
      const job = this.getJobStatus(jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.json({
        job_id: job.id,
        status: job.status,
        started_at: new Date(job.startedAt).toISOString(),
        completed_at: job.completedAt ? new Date(job.completedAt).toISOString() : null,
        result: job.result || null,
        error: job.error || null,
      });
    });

    // Stream job progress (SSE)
    app.get('/jobs/:jobId/stream', (req, res) => {
      const jobId = parseInt(req.params.jobId);
      const job = this.getJobStatus(jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      sendEvent({ type: 'connected', job_id: jobId });

      const onCompleted = (completedJob) => {
        if (completedJob.id === jobId) {
          sendEvent({ type: 'completed', result: completedJob.result });
          res.end();
        }
      };

      const onFailed = (failedJob) => {
        if (failedJob.id === jobId) {
          sendEvent({ type: 'failed', error: failedJob.error });
          res.end();
        }
      };

      this.on('job:completed', onCompleted);
      this.on('job:failed', onFailed);

      req.on('close', () => {
        this.off('job:completed', onCompleted);
        this.off('job:failed', onFailed);
      });
    });

    // List all jobs
    app.get('/jobs', (req, res) => {
      const jobs = Array.from(this.activeJobs.values()).map((job) => ({
        id: job.id,
        status: job.status,
        started_at: new Date(job.startedAt).toISOString(),
      }));

      res.json({ jobs });
    });

    app.listen(PORT, () => {
      console.log(`✅ Context7 server listening on http://localhost:${PORT}`);
      console.log(`   Endpoints:`);
      console.log(`   - POST /cluster (submit job)`);
      console.log(`   - GET /jobs/:jobId (status)`);
      console.log(`   - GET /jobs/:jobId/stream (SSE)`);
      console.log(`   - GET /health\n`);
    });
  }
}

// Main
const server = new Context7ClusterServer();
server.initWorkerPool();

setTimeout(() => {
  server.startServer();
}, 2000); // Wait for workers to initialize
