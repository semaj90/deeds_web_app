#!/usr/bin/env zx

import { $, argv, chalk, sleep } from 'zx';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';

// GPU Cluster Concurrent Executor
// Orchestrates multiple GPU workers with concurrent execution
console.log(chalk.cyan('🚀 GPU Cluster Concurrent Executor v1.0'));

// Dynamic port resolution to prevent conflicts
function getPortForService(basePort, offset = 0) {
  return basePort + offset;
}

// Dynamic Ollama port discovery
async function discoverOllamaPort() {
  const possiblePorts = [11437, 11436, 11435, 11434];

  for (const port of possiblePorts) {
    try {
      const response = await fetch(`http://localhost:${port}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        console.log(chalk.green(`✅ Ollama discovered on port ${port}`));
        return port;
      }
    } catch (error) {
      // Port not available, try next
    }
  }

  console.log(chalk.yellow('⚠️  No Ollama service found, using default port 11437'));
  return 11437;
}

const config = {
  workers: argv.workers || 4,
  gpuContexts: argv['gpu-contexts'] || 2, // RTX 3060 Ti can handle 2 concurrent contexts efficiently
  tasks: argv.tasks?.split(',') || ['legal-embeddings', 'case-similarity', 'evidence-processing'],
  profile: argv.profile || false,
  enableGPU: argv.enableGPU || process.env.ENABLE_GPU === 'true',
  enableMCP: argv.enableMCP || false,
  maxMemory: argv.maxMemory || '6144', // Optimized for RTX 3060 Ti 8GB VRAM
  timeout: argv.timeout || 600000, // Longer timeout for legal document processing
  // RTX 3060 Ti specific optimizations
  gpuMemoryReservation: argv.gpuMemory || '6144', // Reserve 6GB for GPU operations
  batchSize: argv.batchSize || 16, // Optimal batch size for RTX 3060 Ti
  legalOptimization: argv.legalMode || true,
  embeddingDimensions: argv.embeddingDim || 384, // nomic-embed-text dimensions
  similarityThreshold: argv.similarity || 0.7,
  // Dynamic port configuration (base port + 0-10 range)
  portConfig: {
    ollama: getPortForService(11434, 0), // 11434-11444 range
    postgres: getPortForService(5434, 0), // 5434-5443 range
    redis: getPortForService(6379, 0), // 6379-6389 range
    enhanced_rag: getPortForService(8094, 0), // 8094-8104 range
    upload_service: getPortForService(8093, 0), // 8093-8103 range
    neo4j: getPortForService(7474, 0), // 7474-7484 range
    minio: getPortForService(9000, 0), // 9000-9010 range
    qdrant: getPortForService(6333, 0), // 6333-6343 range
  },
};

console.log(chalk.blue('📋 Legal AI GPU Configuration:'));
console.log(`   Workers: ${config.workers}`);
console.log(`   GPU Contexts: ${config.gpuContexts}`);
console.log(`   Tasks: ${config.tasks.join(', ')}`);
console.log(`   Profile Mode: ${config.profile}`);
console.log(`   GPU Enabled: ${config.enableGPU}`);
console.log(`   Max Memory: ${config.maxMemory}MB`);
console.log(`   GPU Memory Reserved: ${config.gpuMemoryReservation}MB`);
console.log(`   Batch Size: ${config.batchSize}`);
console.log(`   Legal Optimization: ${config.legalOptimization}`);
console.log(`   Embedding Dimensions: ${config.embeddingDimensions}`);
console.log(`   Similarity Threshold: ${config.similarityThreshold}`);

// Check GPU availability
async function checkGPUAvailability() {
  try {
    if (config.enableGPU) {
      const result =
        await $`nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader,nounits`;
      console.log(chalk.green('✅ GPU detected:'));
      result.stdout
        .split('\n')
        .filter((line) => line.trim())
        .forEach((line, i) => {
          console.log(chalk.gray(`   GPU ${i}: ${line.trim()}`));
        });
    } else {
      console.log(chalk.yellow('⚠️  GPU acceleration disabled'));
    }
  } catch (error) {
    console.log(chalk.yellow('⚠️  GPU not available, running in CPU mode'));
    config.enableGPU = false;
  }
}

// Legal AI Task definitions optimized for RTX 3060 Ti with dynamic ports
const taskDefinitions = {
  'legal-embeddings': {
    name: 'Legal Document Embeddings',
    cmd: ['node', 'scripts/generate-legal-embeddings.mjs'],
    env: {
      OLLAMA_URL: process.env.OLLAMA_URL || `http://localhost:${config.dynamicOllamaPort}`,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        `postgresql://legal_admin:123456@localhost:${config.portConfig.postgres}/legal_ai_db`,
      OLLAMA_GPU_LAYERS: '35',
      RTX_3060_OPTIMIZATION: 'true',
      LEGAL_EMBEDDING_MODEL: 'nomic-embed-text',
      GPU_MEMORY_LIMIT: '8192',
      BATCH_SIZE: '32',
    },
  },
  'case-similarity': {
    name: 'Case Similarity Analysis',
    cmd: ['node', 'scripts/process-case-similarity.mjs'],
    env: {
      OLLAMA_URL: process.env.OLLAMA_URL || `http://localhost:${config.dynamicOllamaPort}`,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        `postgresql://legal_admin:123456@localhost:${config.portConfig.postgres}/legal_ai_db`,
      OLLAMA_GPU_LAYERS: '35',
      RTX_3060_OPTIMIZATION: 'true',
      PGVECTOR_ENABLED: 'true',
      SIMILARITY_THRESHOLD: '0.7',
    },
  },
  'legal-inference': {
    name: 'Legal AI Inference',
    cmd: ['npm', 'run', 'check:typescript'],
    env: {
      OLLAMA_URL: process.env.OLLAMA_URL || `http://localhost:${config.dynamicOllamaPort}`,
      OLLAMA_GPU_LAYERS: '30',
      RTX_3060_OPTIMIZATION: 'true',
      LEGAL_MODEL: 'gemma3-legal',
      GPU_CONTEXT_SIZE: '4096',
    },
  },
  'evidence-processing': {
    name: 'Evidence Document Processing',
    cmd: ['node', 'scripts/process-evidence-batch.mjs'],
    env: {
      OLLAMA_URL: process.env.OLLAMA_URL || `http://localhost:${config.dynamicOllamaPort}`,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        `postgresql://legal_admin:123456@localhost:${config.portConfig.postgres}/legal_ai_db`,
      MINIO_URL: process.env.MINIO_URL || `http://localhost:${config.portConfig.minio}`,
      ENABLE_TRAINING: 'true',
      GPU_ACCELERATION: 'true',
      MINIO_ENABLED: 'true',
      OCR_GPU_ENABLED: 'true',
    },
  },
  vectorization: {
    name: 'Legal Vector Operations',
    cmd: ['npm', 'run', 'build:wasm'],
    env: {
      OLLAMA_URL: process.env.OLLAMA_URL || `http://localhost:${config.dynamicOllamaPort}`,
      QDRANT_URL: process.env.QDRANT_URL || `http://localhost:${config.portConfig.qdrant}`,
      ENABLE_WASM_GPU: 'true',
      LEGAL_VECTOR_DIM: '384',
      HNSW_ENABLED: 'true',
    },
  },
  'chat-persistence': {
    name: 'Chat Session Persistence',
    cmd: ['node', 'scripts/persist-chat-embeddings.mjs'],
    env: {
      OLLAMA_URL: process.env.OLLAMA_URL || `http://localhost:${config.dynamicOllamaPort}`,
      DATABASE_URL:
        process.env.DATABASE_URL ||
        `postgresql://legal_admin:123456@localhost:${config.portConfig.postgres}/legal_ai_db`,
      REDIS_URL: process.env.REDIS_URL || `redis://localhost:${config.portConfig.redis}`,
      PGVECTOR_ENABLED: 'true',
      EMBEDDING_CACHE: 'true',
      REDIS_ENABLED: 'true',
    },
  },
  'simd-parser': {
    name: 'Legal Document SIMD Parser',
    cmd: ['node', 'scripts/simd-legal-parser.mjs'],
    env: {
      OLLAMA_URL: process.env.OLLAMA_URL || `http://localhost:${config.dynamicOllamaPort}`,
      NEO4J_URL: process.env.NEO4J_URL || `http://localhost:${config.portConfig.neo4j}`,
      SIMD_ENABLED: 'true',
      LEGAL_PARSING: 'true',
      PDF_GPU_ACCELERATION: 'true',
      WASM_ENABLED: 'true',
    },
  },
  'webgpu-som': {
    name: 'WebGPU Legal Knowledge SOM',
    cmd: ['npm', 'run', 'check:ultra-fast'],
    env: {
      OLLAMA_URL: process.env.OLLAMA_URL || `http://localhost:${config.dynamicOllamaPort}`,
      ENHANCED_RAG_URL:
        process.env.ENHANCED_RAG_URL || `http://localhost:${config.portConfig.enhanced_rag}`,
      WEBGPU_ENABLED: 'true',
      LEGAL_SOM_CACHE: 'true',
      KNOWLEDGE_GRAPH: 'true',
    },
  },
};

// Worker execution
async function executeWorker(workerId, task) {
  const taskDef = taskDefinitions[task];
  if (!taskDef) {
    console.log(chalk.red(`❌ Unknown task: ${task}`));
    return { success: false, error: `Unknown task: ${task}` };
  }

  const startTime = Date.now();
  console.log(chalk.blue(`🔧 Worker ${workerId}: Starting ${taskDef.name}`));

  try {
    // Set environment variables
    process.env.WORKER_ID = workerId;
    process.env.NODE_OPTIONS = `--max-old-space-size=${config.maxMemory}`;
    if (config.enableGPU) {
      process.env.CUDA_VISIBLE_DEVICES = (workerId % config.gpuContexts).toString();
    }

    // Apply task-specific environment variables
    Object.entries(taskDef.env).forEach(([key, value]) => {
      process.env[key] = value;
    });

    // Execute task - use spawn-like syntax for better control
    const [command, ...args] = taskDef.cmd;
    const result = await $`${command} ${args}`;

    const duration = Date.now() - startTime;
    console.log(chalk.green(`✅ Worker ${workerId}: Completed ${taskDef.name} in ${duration}ms`));

    return {
      success: true,
      duration,
      workerId,
      task: taskDef.name,
      output: result.stdout,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(chalk.red(`❌ Worker ${workerId}: Failed ${taskDef.name} after ${duration}ms`));
    console.log(chalk.gray(`   Error: ${error.message}`));

    return {
      success: false,
      duration,
      workerId,
      task: taskDef.name,
      error: error.message,
    };
  }
}

// Store performance metrics in database for tracking
async function storePerformanceMetrics(results, summary) {
  try {
    const databaseUrl =
      process.env.DATABASE_URL ||
      `postgresql://legal_admin:123456@localhost:${config.portConfig.postgres}/legal_ai_db`;
    const sql = postgres(databaseUrl, {
      host: 'localhost',
      port: config.portConfig.postgres,
      database: 'legal_ai_db',
      username: 'legal_admin',
      password: '123456',
      max: 2,
    });

    console.log(chalk.blue('\n💾 Storing performance metrics...'));

    // Store overall execution summary
    const executionId = randomUUID();

    try {
      await sql`
        INSERT INTO gpu_cluster_executions (
          id, execution_date, total_workers, gpu_contexts, avg_duration_ms, 
          success_rate, total_tasks, successful_tasks, failed_tasks, 
          configuration, metadata
        ) VALUES (
          ${executionId},
          NOW(),
          ${summary.totalWorkers},
          ${summary.gpuContexts},
          ${Math.round(summary.avgDuration)},
          ${Math.round(summary.successRate * 100) / 100},
          ${results.length},
          ${results.filter((r) => r.success).length},
          ${results.filter((r) => !r.success).length},
          ${JSON.stringify({
            maxMemory: config.maxMemory,
            gpuMemoryReservation: config.gpuMemoryReservation,
            batchSize: config.batchSize,
            legalOptimization: config.legalOptimization,
            embeddingDimensions: config.embeddingDimensions,
            similarityThreshold: config.similarityThreshold,
          })},
          ${JSON.stringify({
            rtx3060Optimized: true,
            tasks: config.tasks,
            profile: config.profile,
            timestamp: new Date().toISOString(),
          })}
        )
      `;

      // Store individual task results
      for (const result of results) {
        await sql`
          INSERT INTO gpu_task_results (
            execution_id, worker_id, task_name, task_type, duration_ms, 
            success, error_message, metadata
          ) VALUES (
            ${executionId},
            ${result.workerId || 0},
            ${result.task || 'unknown'},
            'legal-ai',
            ${result.duration || 0},
            ${result.success || false},
            ${result.error || null},
            ${JSON.stringify({
              timestamp: new Date().toISOString(),
              output_size: result.output?.length || 0,
              gpu_optimized: true,
            })}
          )
        `;
      }

      console.log(chalk.green(`✅ Stored metrics for execution ${executionId.slice(0, 8)}...`));
    } catch (dbError) {
      if (dbError.message.includes('relation') && dbError.message.includes('does not exist')) {
        console.log(
          chalk.yellow('⚠️  Performance tracking tables not found, creating minimal log...')
        );

        // Fallback: create a simple log entry in case_activities
        try {
          await sql`
            INSERT INTO case_activities (case_id, activity_type, description, metadata)
            VALUES (
              null,
              'gpu_cluster_execution',
              'GPU cluster executed with ${results.length} tasks, ${results.filter((r) => r.success).length} successful',
              ${JSON.stringify({
                execution_id: executionId,
                summary,
                tasks: results.map((r) => ({
                  task: r.task,
                  success: r.success,
                  duration: r.duration,
                })),
              })}
            )
          `;
          console.log(chalk.green('✅ Logged execution to case_activities'));
        } catch (fallbackError) {
          console.log(
            chalk.yellow(`⚠️  Could not log to case_activities: ${fallbackError.message}`)
          );
        }
      } else {
        throw dbError;
      }
    }

    await sql.end();
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Could not store performance metrics: ${error.message}`));
  }
}

// Main execution
async function main() {
  console.log(chalk.cyan('\n🔍 Checking system requirements...'));
  await checkGPUAvailability();

  // Discover Ollama port dynamically
  console.log(chalk.cyan('\n🔍 Discovering Ollama service...'));
  config.dynamicOllamaPort = await discoverOllamaPort();

  console.log(chalk.cyan('\n🚀 Starting concurrent execution...'));

  const workers = [];
  const results = [];

  // Create worker promises
  for (let i = 0; i < config.workers; i++) {
    const taskIndex = i % config.tasks.length;
    const task = config.tasks[taskIndex];

    const workerPromise = executeWorker(i + 1, task).then((result) => {
      results.push(result);
      return result;
    });

    workers.push(workerPromise);

    // Stagger worker starts to avoid resource conflicts
    await sleep(500);
  }

  // Wait for all workers to complete
  console.log(chalk.cyan(`\n⏳ Waiting for ${workers.length} workers to complete...`));
  await Promise.allSettled(workers);

  // Report results and store performance data
  console.log(chalk.cyan('\n📊 Legal AI Execution Summary:'));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(chalk.green(`✅ Successful: ${successful.length}`));
  console.log(chalk.red(`❌ Failed: ${failed.length}`));

  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    console.log(chalk.blue(`⏱️  Average duration: ${Math.round(avgDuration)}ms`));

    // Store performance metrics in database
    await storePerformanceMetrics(results, {
      totalWorkers: config.workers,
      gpuContexts: config.gpuContexts,
      avgDuration,
      successRate: (successful.length / results.length) * 100,
    });
  }

  // Profile report
  if (config.profile || argv.report) {
    console.log(chalk.cyan('\n📈 Performance Profile:'));

    results.forEach((result) => {
      const status = result.success ? chalk.green('✅') : chalk.red('❌');
      console.log(`${status} Worker ${result.workerId}: ${result.task} - ${result.duration}ms`);
    });

    // GPU memory usage if available
    if (config.enableGPU) {
      try {
        const memUsage =
          await $`nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits`;
        console.log(chalk.blue('\n🎮 GPU Memory Usage:'));
        memUsage.stdout
          .split('\n')
          .filter((line) => line.trim())
          .forEach((line, i) => {
            const [used, total] = line.trim().split(', ');
            const percent = Math.round((used / total) * 100);
            console.log(chalk.gray(`   GPU ${i}: ${used}MB / ${total}MB (${percent}%)`));
          });
      } catch (error) {
        console.log(chalk.yellow('⚠️  Could not retrieve GPU memory usage'));
      }
    }
  }

  // Exit with appropriate code
  const exitCode = failed.length > 0 ? 1 : 0;
  console.log(chalk.cyan(`\n🎯 Execution complete. Exit code: ${exitCode}`));
  process.exit(exitCode);
}

// Error handling
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  Received SIGINT, shutting down workers...'));
  process.exit(130);
});

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Unhandled rejection:'), error);
  process.exit(1);
});

// Run main function
main().catch((error) => {
  console.error(chalk.red('\n❌ Fatal error:'), error);
  process.exit(1);
});
