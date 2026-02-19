#!/usr/bin/env zx

import { $, chalk } from 'zx';
// Use ioredis directly with compatible connection configuration
import Redis from 'ioredis';

// Redis-GPU Pipeline Bridge
// Connects the optimized Redis pipeline with GPU cluster executor for legal AI processing
console.log(chalk.cyan('🔗 Redis-GPU Pipeline Bridge v1.0'));

const config = {
  redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  databaseUrl:
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11436',
  gpuClusterScript: 'scripts/gpu-cluster-concurrent-executor.mjs',
  pipelineManagerUrl: '/api/pipeline-manager',
  batchSize: 25,
  maxConcurrency: 4,
  enableGPU: process.env.ENABLE_GPU !== 'false',
};

console.log(chalk.blue('📋 Bridge Configuration:'));
console.log(`   Redis: ${config.redisUrl}`);
console.log(`   Database: ${config.databaseUrl.split('@')[1]}`);
console.log(`   GPU Enabled: ${config.enableGPU}`);
console.log(`   Max Concurrency: ${config.maxConcurrency}`);

// Redis connection using ioredis (compatible with RedisService)
let redis;
try {
  redis = new Redis({
    host: 'localhost',
    port: 6379,
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: false,
    connectionName: 'redis-gpu-bridge',
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
  });

  console.log(chalk.green('✅ Redis connection established via ioredis'));
} catch (error) {
  console.log(chalk.red(`❌ Redis connection failed: ${error.message}`));
  process.exit(1);
}

// Bridge job types
const JobTypes = {
  LEGAL_EMBEDDINGS: 'legal_embeddings',
  CASE_SIMILARITY: 'case_similarity',
  EVIDENCE_PROCESSING: 'evidence_processing',
  CHAT_PERSISTENCE: 'chat_persistence',
  PIPELINE_OPTIMIZATION: 'pipeline_optimization',
};

// Queue a job for GPU cluster processing
async function queueGPUJob(jobType, data, priority = 1) {
  try {
    const jobId = `gpu_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job = {
      id: jobId,
      type: jobType,
      data,
      priority,
      created_at: new Date().toISOString(),
      status: 'pending',
      retries: 0,
      max_retries: 3,
    };

    // Add to Redis priority queue
    await redis.zadd(
      'gpu_cluster_jobs',
      Date.now() + priority * 1000000, // Higher priority = processed first
      JSON.stringify(job)
    );

    console.log(chalk.blue(`📦 Queued GPU job: ${jobType} (${jobId})`));
    return jobId;
  } catch (error) {
    console.error(chalk.red(`❌ Error queuing GPU job: ${error.message}`));
    throw error;
  }
}

// Process jobs from Redis queue with GPU cluster
async function processGPUJobQueue() {
  console.log(chalk.cyan('\n🔄 Starting GPU job queue processor...'));

  let activeJobs = 0;

  while (true) {
    try {
      // Check if we have capacity for more jobs
      if (activeJobs >= config.maxConcurrency) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Get next job from priority queue
      const result = await redis.zpopmin('gpu_cluster_jobs', 1);

      if (!result.length) {
        // No jobs available, wait a bit
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      const job = JSON.parse(result[0].value);
      console.log(chalk.blue(`🚀 Processing GPU job: ${job.type} (${job.id})`));

      activeJobs++;

      // Process job asynchronously
      processJob(job).finally(() => {
        activeJobs--;
      });
    } catch (error) {
      console.error(chalk.red(`❌ Error in job queue processor: ${error.message}`));
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// Process individual GPU job
async function processJob(job) {
  try {
    // Update job status
    await redis.hset(
      `gpu_job:${job.id}`,
      'status',
      'processing',
      'started_at',
      new Date().toISOString()
    );

    // Prepare GPU cluster command based on job type
    let gpuCommand;

    switch (job.type) {
      case JobTypes.LEGAL_EMBEDDINGS:
        gpuCommand = [
          'node',
          config.gpuClusterScript,
          '--tasks=legal-embeddings',
          '--workers=2',
          '--enableGPU=true',
        ];
        break;

      case JobTypes.CASE_SIMILARITY:
        gpuCommand = [
          'node',
          config.gpuClusterScript,
          '--tasks=case-similarity',
          '--workers=2',
          '--similarity=0.7',
        ];
        break;

      case JobTypes.EVIDENCE_PROCESSING:
        gpuCommand = [
          'node',
          config.gpuClusterScript,
          '--tasks=evidence-processing',
          '--workers=1',
          '--batchSize=8',
        ];
        break;

      case JobTypes.CHAT_PERSISTENCE:
        gpuCommand = [
          'node',
          config.gpuClusterScript,
          '--tasks=chat-persistence',
          '--workers=2',
          '--enableCache=true',
        ];
        break;

      case JobTypes.PIPELINE_OPTIMIZATION:
        gpuCommand = [
          'node',
          config.gpuClusterScript,
          '--tasks=legal-embeddings,case-similarity,evidence-processing',
          '--workers=4',
          '--profile=true',
        ];
        break;

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    // Add job-specific parameters
    if (job.data) {
      if (job.data.cacheKey) {
        gpuCommand.push(`--cacheKey=${job.data.cacheKey}`);
      }
      if (job.data.batchSize) {
        gpuCommand.push(`--batchSize=${job.data.batchSize}`);
      }
      if (job.data.enableProfile) {
        gpuCommand.push('--profile=true');
      }
    }

    console.log(chalk.gray(`Executing: ${gpuCommand.join(' ')}`));

    // Execute GPU cluster command
    const startTime = Date.now();
    const result = await $`${gpuCommand}`;
    const duration = Date.now() - startTime;

    // Store successful result
    await redis.hset(
      `gpu_job:${job.id}`,
      'status',
      'completed',
      'completed_at',
      new Date().toISOString(),
      'duration_ms',
      duration,
      'output',
      result.stdout.slice(0, 10000), // Truncate large outputs
      'success',
      'true'
    );

    // Update Redis pipeline cache with results
    await updatePipelineCache(job, result.stdout);

    console.log(chalk.green(`✅ GPU job completed: ${job.type} (${duration}ms)`));
  } catch (error) {
    console.error(chalk.red(`❌ GPU job failed: ${job.type} - ${error.message}`));

    // Handle job failure
    job.retries = (job.retries || 0) + 1;

    await redis.hset(
      `gpu_job:${job.id}`,
      'status',
      job.retries >= job.max_retries ? 'failed' : 'retry',
      'error_message',
      error.message,
      'retries',
      job.retries.toString(),
      'last_attempt',
      new Date().toISOString()
    );

    // Requeue if retries remaining
    if (job.retries < job.max_retries) {
      console.log(chalk.yellow(`🔄 Retrying job: ${job.type} (${job.retries}/${job.max_retries})`));

      // Add delay and requeue
      setTimeout(async () => {
        await redis.zadd(
          'gpu_cluster_jobs',
          Date.now() + 60000, // 1 minute delay
          JSON.stringify(job)
        );
      }, 5000);
    }
  }
}

// Update Redis pipeline cache with GPU results
async function updatePipelineCache(job, output) {
  try {
    const cacheKey = `gpu_result:${job.type}:${job.id}`;

    // Store GPU processing results in Redis for pipeline access
    await redis.setex(
      cacheKey,
      3600,
      JSON.stringify({
        job_id: job.id,
        job_type: job.type,
        processed_at: new Date().toISOString(),
        output_preview: output.slice(0, 1000),
        status: 'gpu_processed',
      })
    );

    // Update pipeline manager about completion
    const pipelineUpdate = {
      source: 'gpu_cluster',
      job_id: job.id,
      type: job.type,
      status: 'completed',
      cache_key: cacheKey,
    };

    await redis.publish('pipeline_updates', JSON.stringify(pipelineUpdate));

    console.log(chalk.gray(`💾 Updated pipeline cache: ${cacheKey}`));
  } catch (error) {
    console.error(chalk.red(`❌ Error updating pipeline cache: ${error.message}`));
  }
}

// Monitor Redis pipeline system integration
async function monitorPipelineIntegration() {
  console.log(chalk.cyan('\n📊 Monitoring Redis-GPU pipeline integration...'));

  try {
    // Get job queue statistics
    const totalJobs = await redis.zcard('gpu_cluster_jobs');
    const processingJobs = await redis.keys('gpu_job:*');

    // Get pipeline cache statistics
    const cacheKeys = await redis.keys('gpu_result:*');
    const pipelineKeys = await redis.keys('pipeline:*');

    console.log(chalk.blue('\n📈 Integration Status:'));
    console.log(chalk.gray(`   GPU Jobs Queued: ${totalJobs}`));
    console.log(chalk.gray(`   Jobs Processing: ${processingJobs.length}`));
    console.log(chalk.gray(`   GPU Results Cached: ${cacheKeys.length}`));
    console.log(chalk.gray(`   Pipeline Cache Entries: ${pipelineKeys.length}`));

    // Get recent job completions
    const recentJobs = await redis.keys('gpu_job:*');
    let completedCount = 0;
    let failedCount = 0;

    for (const jobKey of recentJobs.slice(0, 20)) {
      const status = await redis.hget(jobKey, 'status');
      if (status === 'completed') completedCount++;
      if (status === 'failed') failedCount++;
    }

    console.log(chalk.green(`   ✅ Recently Completed: ${completedCount}`));
    console.log(chalk.red(`   ❌ Recently Failed: ${failedCount}`));

    // Performance metrics
    const memoryInfo = await redis.memory('stats');
    const memoryUsage = memoryInfo ? memoryInfo.used_memory : 0;
    console.log(chalk.blue(`   💾 Redis Memory: ${Math.round(memoryUsage / 1024 / 1024)}MB`));
  } catch (error) {
    console.error(chalk.red(`❌ Error monitoring integration: ${error.message}`));
  }
}

// Job scheduling interface
async function scheduleJobs() {
  console.log(chalk.cyan('\n⏰ Scheduling legal AI processing jobs...'));

  try {
    // Schedule regular embedding generation
    await queueGPUJob(
      JobTypes.LEGAL_EMBEDDINGS,
      {
        cacheKey: 'scheduled_embeddings',
        batchSize: 50,
      },
      2
    );

    // Schedule case similarity analysis
    await queueGPUJob(
      JobTypes.CASE_SIMILARITY,
      {
        cacheKey: 'scheduled_similarity',
        enableProfile: true,
      },
      3
    );

    // Schedule evidence processing
    await queueGPUJob(
      JobTypes.EVIDENCE_PROCESSING,
      {
        cacheKey: 'scheduled_evidence',
        batchSize: 8,
      },
      1
    );

    // Schedule chat persistence
    await queueGPUJob(
      JobTypes.CHAT_PERSISTENCE,
      {
        cacheKey: 'scheduled_chat',
        enableCache: true,
      },
      2
    );

    console.log(chalk.green('✅ Scheduled 4 legal AI processing jobs'));
  } catch (error) {
    console.error(chalk.red(`❌ Error scheduling jobs: ${error.message}`));
  }
}

// Main execution
async function main() {
  try {
    console.log(chalk.cyan('\n🚀 Starting Redis-GPU Pipeline Bridge...'));

    // Test connections
    await redis.ping();
    console.log(chalk.green('✅ Redis connection verified'));

    // Check GPU cluster availability
    try {
      await $`node ${config.gpuClusterScript} --help`;
      console.log(chalk.green('✅ GPU cluster executor available'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  GPU cluster executor not found, jobs will queue'));
    }

    // Start job scheduling in background
    scheduleJobs();

    // Start monitoring in background
    setInterval(monitorPipelineIntegration, 30000); // Every 30 seconds

    // Start processing jobs
    console.log(chalk.cyan('\n🔄 Starting job queue processing...'));
    await processGPUJobQueue();
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error in Redis-GPU bridge:'), error);
    process.exit(1);
  } finally {
    if (redis) {
      await redis.disconnect();
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⚠️  Shutting down Redis-GPU bridge...'));
  if (redis) {
    await redis.disconnect();
  }
  process.exit(130);
});

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Unhandled rejection:'), error);
  process.exit(1);
});

// Expose job scheduling for external use
export { queueGPUJob, JobTypes };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  });
}
