// Enhanced MCP Server - Integrates legal AI workers with existing orchestrator
import { cpus } from 'os';
import { Worker } from 'worker_threads';
import path from 'path';
import express from 'express';
import Redis from 'ioredis';

const numCores = cpus().length;
const app = express();
app.use(express.json());

// Worker pools
const generalWorkers = [];
const legalAIWorkers = [];
const tensorWorkers = [];

// Redis for coordination
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Worker management
let generalCurrent = 0;
let legalCurrent = 0;
let tensorCurrent = 0;

// Performance tracking
const workerStats = {
  general: { active: 0, completed: 0, errors: 0 },
  legal: { active: 0, completed: 0, errors: 0 },
  tensor: { active: 0, completed: 0, errors: 0 }
};

// Job queues
const jobQueues = {
  'general': 'queue:render:proto',
  'legal': 'queue:legal:proto',
  'tensor': 'queue:tensor:proto',
  'priority': 'queue:priority:proto'
};

// Initialize worker pools
async function initializeWorkers() {
  console.log(`🚀 Initializing enhanced MCP server with ${numCores} cores`);

  // General compute workers (existing functionality)
  for (let i = 0; i < numCores; i++) {
    const worker = new Worker(path.resolve('./src/worker/mesh_worker.js'));
    setupWorkerHandlers(worker, 'general', i);
    generalWorkers.push(worker);
  }

  // Legal AI workers (2 per core for AI-intensive tasks)
  for (let i = 0; i < numCores * 2; i++) {
    const worker = new Worker(path.resolve('./src/worker/legal_ai_worker.js'));
    setupWorkerHandlers(worker, 'legal', i);
    legalAIWorkers.push(worker);
  }

  // Tensor optimization workers (1 per 2 cores)
  for (let i = 0; i < Math.max(1, Math.floor(numCores / 2)); i++) {
    const worker = new Worker(path.resolve('./src/worker/tensor_worker.js'));
    setupWorkerHandlers(worker, 'tensor', i);
    tensorWorkers.push(worker);
  }

  console.log(`✅ Workers initialized: ${generalWorkers.length} general, ${legalAIWorkers.length} legal AI, ${tensorWorkers.length} tensor`);
}

function setupWorkerHandlers(worker, type, index) {
  worker.on('message', (msg) => {
    handleWorkerMessage(msg, type, index);
  });

  worker.on('error', (error) => {
    console.error(`❌ Worker ${type}[${index}] error:`, error);
    workerStats[type].errors++;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`💥 Worker ${type}[${index}] exited with code ${code}`);
      // Could implement worker restart logic here
    }
  });
}

function handleWorkerMessage(msg, type, index) {
  switch (msg.type) {
    case 'job_started':
      workerStats[type].active++;
      console.log(`🔄 ${type}[${index}] started job ${msg.job_id}`);
      break;

    case 'job_completed':
      workerStats[type].active--;
      workerStats[type].completed++;
      console.log(`✅ ${type}[${index}] completed job ${msg.job_id} in ${msg.processing_time}ms`);

      // Publish completion event
      redis.publish('job_completed', JSON.stringify({
        job_id: msg.job_id,
        worker_type: type,
        worker_index: index,
        processing_time: msg.processing_time,
        timestamp: Date.now()
      }));
      break;

    case 'job_error':
      workerStats[type].active--;
      workerStats[type].errors++;
      console.error(`❌ ${type}[${index}] job ${msg.job_id} failed:`, msg.error);
      break;

    case 'worker_health':
      // Store worker health metrics
      redis.setex(`worker_health:${type}:${index}`, 60, JSON.stringify(msg));
      break;

    default:
      console.log(`📝 ${type}[${index}]:`, msg);
  }
}

// Enhanced job dispatch with intelligent routing
export function dispatchJob(job, priority = 'normal') {
  let targetWorkers, currentIndex, queueName;

  // Route based on job type
  if (job.type === 'LEGAL_AI' || job.job_type >= 0) { // Legal job types enum
    targetWorkers = legalAIWorkers;
    currentIndex = legalCurrent;
    legalCurrent = (legalCurrent + 1) % legalAIWorkers.length;
    queueName = jobQueues.legal;
  } else if (job.type === 'TENSOR_OPT' || job.operation === 'tensor') {
    targetWorkers = tensorWorkers;
    currentIndex = tensorCurrent;
    tensorCurrent = (tensorCurrent + 1) % tensorWorkers.length;
    queueName = jobQueues.tensor;
  } else {
    // General compute jobs (existing functionality)
    targetWorkers = generalWorkers;
    currentIndex = generalCurrent;
    generalCurrent = (generalCurrent + 1) % generalWorkers.length;
    queueName = jobQueues.general;
  }

  // Select worker (could implement load balancing here)
  const selectedWorker = selectOptimalWorker(targetWorkers, job);

  console.log(`📤 Dispatching ${job.type || 'general'} job to ${targetWorkers === legalAIWorkers ? 'legal' : targetWorkers === tensorWorkers ? 'tensor' : 'general'} worker`);

  // Send job to worker
  selectedWorker.postMessage(job);

  // Also enqueue for persistence
  if (Buffer.isBuffer(job)) {
    redis.rpushBuffer(queueName, job);
  } else {
    redis.rpush(queueName, JSON.stringify(job));
  }

  return {
    worker_type: targetWorkers === legalAIWorkers ? 'legal' : targetWorkers === tensorWorkers ? 'tensor' : 'general',
    queue: queueName
  };
}

// Intelligent worker selection based on current load
function selectOptimalWorker(workers, job) {
  // Simple round-robin for now
  // Could be enhanced with actual load metrics
  const currentIndex = getCurrentIndex(workers);
  return workers[currentIndex];
}

function getCurrentIndex(workers) {
  if (workers === legalAIWorkers) return legalCurrent;
  if (workers === tensorWorkers) return tensorCurrent;
  return generalCurrent;
}

// Queue processing from Redis (persistent job handling)
async function processQueue(queueName, workerPool) {
  while (true) {
    try {
      // Blocking pop from queue
      const result = await redis.blpop(queueName, 5); // 5 second timeout

      if (result) {
        const [queue, jobData] = result;
        let job;

        // Try to parse as Buffer first (protobuf), then JSON
        try {
          if (Buffer.isBuffer(jobData)) {
            job = jobData;
          } else {
            job = JSON.parse(jobData);
          }
        } catch (e) {
          job = jobData; // Raw data
        }

        // Dispatch to worker
        const worker = selectOptimalWorker(workerPool);
        worker.postMessage(job);
      }
    } catch (error) {
      console.error(`❌ Queue processing error for ${queueName}:`, error);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
    }
  }
}

// API endpoints
app.post('/api/job/dispatch', (req, res) => {
  try {
    const job = req.body;
    const priority = req.headers['x-priority'] || 'normal';

    const dispatch = dispatchJob(job, priority);

    res.json({
      success: true,
      dispatched_to: dispatch.worker_type,
      queue: dispatch.queue,
      timestamp: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    // Get queue lengths
    const queueLengths = {};
    for (const [name, queue] of Object.entries(jobQueues)) {
      queueLengths[name] = await redis.llen(queue);
    }

    // Get worker health
    const workerHealth = {};
    const healthKeys = await redis.keys('worker_health:*');
    for (const key of healthKeys) {
      const health = await redis.get(key);
      if (health) {
        workerHealth[key.replace('worker_health:', '')] = JSON.parse(health);
      }
    }

    res.json({
      workers: {
        general: { count: generalWorkers.length, stats: workerStats.general },
        legal: { count: legalAIWorkers.length, stats: workerStats.legal },
        tensor: { count: tensorWorkers.length, stats: workerStats.tensor }
      },
      queues: queueLengths,
      worker_health: workerHealth,
      system: {
        cores: numCores,
        memory: process.memoryUsage(),
        uptime: process.uptime()
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/worker/:type/:index/health', async (req, res) => {
  try {
    const { type, index } = req.params;
    const health = await redis.get(`worker_health:${type}:${index}`);

    if (health) {
      res.json(JSON.parse(health));
    } else {
      res.status(404).json({ error: 'Worker health data not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/legal/job', (req, res) => {
  try {
    const legalJob = {
      job_id: `legal_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      type: 'LEGAL_AI',
      payload: req.body,
      timestamp: Date.now()
    };

    const dispatch = dispatchJob(legalJob);

    res.json({
      success: true,
      job_id: legalJob.job_id,
      dispatched_to: dispatch.worker_type,
      estimated_completion: Date.now() + 5000 // 5 second estimate
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/legal/result/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const result = await redis.getBuffer(`legal:result:${jobId}`);

    if (result) {
      // Return protobuf binary or JSON
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(result);
    } else {
      res.status(404).json({ error: 'Result not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket for real-time updates (optional)
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Subscribe to Redis pub/sub
  const subscriber = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
  subscriber.subscribe('job_completed', 'worker_health', 'legal_result');

  subscriber.on('message', (channel, message) => {
    res.write(`event: ${channel}\n`);
    res.write(`data: ${message}\n\n`);
  });

  req.on('close', () => {
    subscriber.quit();
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down MCP server...');

  // Stop all workers
  [...generalWorkers, ...legalAIWorkers, ...tensorWorkers].forEach(worker => {
    worker.terminate();
  });

  // Close Redis connections
  await redis.quit();

  process.exit(0);
});

// Initialize and start
async function start() {
  try {
    await initializeWorkers();

    // Start queue processors
    processQueue(jobQueues.general, generalWorkers);
    processQueue(jobQueues.legal, legalAIWorkers);
    processQueue(jobQueues.tensor, tensorWorkers);

    const port = process.env.PORT || 3000;
    app.listen(port, () => {
      console.log(`🌟 Enhanced MCP server running on port ${port}`);
      console.log(`📊 Status: http://localhost:${port}/api/status`);
      console.log(`🤖 Legal AI: http://localhost:${port}/api/legal/job`);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
}

start();

export { workerStats };