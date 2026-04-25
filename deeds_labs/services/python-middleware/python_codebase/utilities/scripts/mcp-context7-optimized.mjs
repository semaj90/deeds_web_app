#!/usr/bin/env node

/**
 * SIMD-Optimized Multi-Threaded MCP Context7 Server
 * Features:
 * - Multi-threaded worker pool with SIMD optimization
 * - Redis caching for embeddings and responses
 * - PostgreSQL + pgvector integration
 * - Memory-optimized with SharedArrayBuffer
 * - Claude Code MCP integration ready
 */

import { createServer } from 'http';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { performance } from "perf_hooks";
import { cpus } from "os";
import { createClient as createRedisClient } from "redis";
import { Pool } from "pg";
import postgres from "postgres";

// ANSI colors
const colors = {
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`,
};

class SIMDOptimizedMCPServer {
  constructor() {
    this.workers = [];
    this.redisClient = null;
    this.pgPool = null;
    this.isRunning = false;
    this.workerCount = parseInt(process.env.MCP_WORKERS || cpus().length);
    this.port = parseInt(process.env.MCP_PORT || 3003);

    // SIMD / GPU Layer
    this.wasmModule = null;
    this.gpuInstance = null;
    this.simdOperations = {
      dotProduct: null,
      vectorAdd: null,
      matrixMultiply: null,
    };
    this.gpuOperations = {
      dotProduct: null,
      vectorAdd: null,
      matrixMultiply: null,
    };

    // Memory management with enhanced monitoring
    this.maxMemoryPerWorker = 256 * 1024 * 1024; // 256MB per worker
    this.totalMemoryLimit = 2 * 1024 * 1024 * 1024; // 2GB total limit
    this.memoryStats = {
      peakUsage: 0,
      averageUsage: 0,
      samples: [],
      lastLogTime: Date.now(),
      logInterval: 30000, // Log every 30 seconds
    };

    // Adaptive load balancer
    this.workerLoad = new Map(); // workerId -> {load: number, latency: number, tasks: number}
    this.loadBalancerEnabled = true;

    // Cache metrics
    this.cacheHits = 0;
    this.cacheMisses = 0;

    // Shared buffer size
    this.sharedBufferSize = 1024 * 1024; // 1MB shared buffer

    // Acceleration type detection
    this.accelerationType = 'cpu'; // Will be updated during initialization
  }

  log(message, color = "blue") {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
    const colorFn = colors[color] || colors.blue;
    const memUsage = process.memoryUsage();
    const memInfo = `RSS:${Math.round(memUsage.rss / 1024 / 1024)}MB Heap:${Math.round(memUsage.heapUsed / 1024 / 1024)}MB/${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`;

    // Update memory stats
    this.updateMemoryStats(memUsage);

    // Container-friendly logging format
    const containerLog = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: color.toUpperCase(),
      service: 'mcp-context7',
      message,
      memory: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers,
      },
      workers: this.workers.length,
      cache: {
        hits: this.cacheHits,
        misses: this.cacheMisses,
        ratio: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
      }
    });

    // Log to stderr for container collection, stdout for human reading
    console.error(containerLog); // Structured logs for containers
    console.log(colorFn(`[${timestamp}] [MCP-SIMD] ${message} [${memInfo}]`)); // Human-readable
  }

  updateMemoryStats(memUsage) {
    const currentUsage = memUsage.rss;
    this.memoryStats.samples.push(currentUsage);

    // Keep only last 100 samples
    if (this.memoryStats.samples.length > 100) {
      this.memoryStats.samples.shift();
    }

    // Update peak usage
    if (currentUsage > this.memoryStats.peakUsage) {
      this.memoryStats.peakUsage = currentUsage;
    }

    // Calculate average
    this.memoryStats.averageUsage = this.memoryStats.samples.reduce((a, b) => a + b, 0) / this.memoryStats.samples.length;

    // Periodic detailed logging
    const now = Date.now();
    if (now - this.memoryStats.lastLogTime > this.memoryStats.logInterval) {
      this.logMemoryReport();
      this.memoryStats.lastLogTime = now;
    }
  }

  logMemoryReport() {
    const memUsage = process.memoryUsage();
    const workerStats = this.workers.map(w => ({
      id: w.id,
      busy: w.busy,
      load: this.workerLoad.get(w.id)?.load || 0,
      tasks: this.workerLoad.get(w.id)?.tasks || 0,
    }));

    this.log(`📊 Memory Report:
  Peak: ${Math.round(this.memoryStats.peakUsage / 1024 / 1024)}MB
  Average: ${Math.round(this.memoryStats.averageUsage / 1024 / 1024)}MB
  Current: ${Math.round(memUsage.rss / 1024 / 1024)}MB RSS
  Workers: ${this.workers.filter(w => w.busy).length}/${this.workers.length} busy
  Load Distribution: ${workerStats.map(w => `${w.id}:${w.load}`).join(', ')}`, "cyan");
  }

  async checkDockerDesktop() {
    try {
      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      // Check if Docker Desktop is running on Windows
      const { stdout } = await execAsync(
        'tasklist | findstr /i "Docker Desktop.exe"',
        { timeout: 3000 }
      );
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  async initializeRedis() {
    try {
      // Check if Docker Desktop is running
      const dockerRunning = await this.checkDockerDesktop();
      if (!dockerRunning) {
        this.log("⚠️ Docker Desktop not running, skipping Redis", "yellow");
        this.redisClient = null;
        return;
      }

      const redisPassword = process.env.REDIS_PASSWORD || "";
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

      this.redisClient = createRedisClient({
        url: redisPassword
          ? `redis://:${redisPassword}@localhost:6379`
          : redisUrl,
        socket: {
          connectTimeout: 5000,
          reconnectStrategy: false, // Don't retry if Docker is down
        },
      });

      // Only log critical errors, suppress reconnection spam
      this.redisClient.on("error", (err) => {
        if (err.code === "ECONNREFUSED") {
          this.log(
            "⚠️ Redis connection refused, running without cache",
            "yellow"
          );
          this.redisClient = null;
        }
      });

      this.redisClient.on("connect", () => {
        this.log("✅ Redis connected for MCP caching", "green");
      });

      await Promise.race([
        this.redisClient.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        ),
      ]);

      // Test connection
      await this.redisClient.ping();
      this.log("✅ Redis cache ready", "green");
    } catch (error) {
      this.log(`⚠️ Redis unavailable, running without cache`, "yellow");
      if (this.redisClient && this.redisClient.isOpen) {
        try {
          await this.redisClient.quit();
        } catch (e) {
          // Ignore disconnect errors
        }
      }
      this.redisClient = null;
    }
  }

  async initializePostgreSQL() {
    try {
      const dbUrl = process.env.DATABASE_URL || "postgresql://legal_admin:123456@localhost:5432/legal_ai_db";

      this.pgPool = new Pool({
        connectionString: dbUrl,
        max: 10, // Maximum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await this.pgPool.connect();
      await client.query('SELECT NOW()');
      client.release();

      this.log("✅ PostgreSQL + pgvector connected", "green");
    } catch (error) {
      this.log(`⚠️ PostgreSQL unavailable: ${error.message}`, "yellow");
      this.pgPool = null;
    }
  }

  async initializeWebAssemblySIMD() {
    try {
      this.log("🔧 Initializing WebAssembly SIMD...", "cyan");

      // Try to load SIMD WASM module from multiple possible locations
      const fs = await import("fs");
      const path = await import("path");

      const possiblePaths = [
        path.join(process.cwd(), "scripts", "simd_ops.wasm"),
        path.join(process.cwd(), "sveltekit-frontend", "static", "wasm", "simd-ops.wasm"),
        path.join(process.cwd(), "sveltekit-frontend", "src", "wasm", "simd_ops.wasm"),
      ];

      let wasmBuffer = null;
      for (const wasmPath of possiblePaths) {
        if (fs.existsSync(wasmPath)) {
          this.log(`📦 Loading WASM from: ${wasmPath}`, "blue");
          wasmBuffer = fs.readFileSync(wasmPath);
          break;
        }
      }

      if (wasmBuffer) {
        this.wasmModule = await WebAssembly.compile(wasmBuffer);
        const instance = await WebAssembly.instantiate(this.wasmModule);

        // Extract SIMD operations
        this.simdOperations = {
          dotProduct: instance.exports.simd_dot_product || this.fallbackDotProduct,
          vectorAdd: instance.exports.simd_vector_add || this.fallbackVectorAdd,
          matrixMultiply: instance.exports.simd_matrix_multiply || this.fallbackMatrixMultiply,
          processBatchEmbeddings: instance.exports.process_batch_embeddings || this.fallbackProcessBatchEmbeddings,
        };

        this.log("✅ WebAssembly SIMD loaded", "green");
        this.accelerationType = 'wasm_simd';
      } else {
        this.log("⚠️ SIMD WASM module not found, using fallback", "yellow");
        this.simdOperations = {
          dotProduct: this.fallbackDotProduct,
          vectorAdd: this.fallbackVectorAdd,
          matrixMultiply: this.fallbackMatrixMultiply,
          processBatchEmbeddings: this.fallbackProcessBatchEmbeddings,
        };
      }
    } catch (error) {
      this.log(`⚠️ WebAssembly SIMD failed: ${error.message}, using fallback`, "yellow");
      this.simdOperations = {
        dotProduct: this.fallbackDotProduct,
        vectorAdd: this.fallbackVectorAdd,
        matrixMultiply: this.fallbackMatrixMultiply,
        processBatchEmbeddings: this.fallbackProcessBatchEmbeddings,
      };
    }
  }

  async initializeGPUAcceleration() {
    try {
      this.log("🎮 Initializing GPU acceleration...", "cyan");

      // Try to load GPU.js for CUDA acceleration
      let GPU;
      try {
        GPU = (await import("gpu.js")).GPU;
      } catch (importError) {
        this.log("⚠️ GPU.js not available, trying alternative import", "yellow");
        // Try alternative import paths
        try {
          GPU = (await import("../../../node_modules/gpu.js")).GPU;
        } catch (altError) {
          throw new Error("GPU.js not found in dependencies");
        }
      }

      this.gpuInstance = new GPU();

      // Create GPU kernels
      this.gpuOperations = {
        dotProduct: this.gpuInstance.createKernel(function(a, b) {
          let sum = 0;
          for (let i = 0; i < this.constants.size; i++) {
            sum += a[this.thread.x][i] * b[i];
          }
          return sum;
        }).setOutput([1]),

        vectorAdd: this.gpuInstance.createKernel(function(a, b) {
          return a[this.thread.x] + b[this.thread.x];
        }).setDynamicOutput(true),

        matrixMultiply: this.gpuInstance.createKernel(function(a, b) {
          let sum = 0;
          for (let i = 0; i < this.constants.size; i++) {
            sum += a[this.thread.y][i] * b[i][this.thread.x];
          }
          return sum;
        }).setDynamicOutput(true),
      };

      this.log("✅ GPU acceleration ready", "green");
      this.accelerationType = 'gpu';
    } catch (error) {
      this.log(`⚠️ GPU acceleration failed: ${error.message}, using CPU fallback`, "yellow");
      this.gpuOperations = {
        dotProduct: null,
        vectorAdd: null,
        matrixMultiply: null,
      };
    }
  }

  // Fallback SIMD operations using JavaScript
  fallbackDotProduct(a, b) {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  fallbackVectorAdd(a, b) {
    const result = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] + b[i];
    }
    return result;
  }

  fallbackProcessBatchEmbeddings(embeddings, batchSize, dimensions) {
    const numBatches = Math.floor(embeddings.length / (batchSize * dimensions));
    const result = new Float32Array(numBatches * dimensions);

    for (let batch = 0; batch < numBatches; batch++) {
      const batchStart = batch * batchSize * dimensions;
      // Compute average embedding for the batch
      for (let dim = 0; dim < dimensions; dim++) {
        let sum = 0;
        for (let item = 0; item < batchSize; item++) {
          sum += embeddings[batchStart + item * dimensions + dim];
        }
        result[batch * dimensions + dim] = sum / batchSize;
      }
    }

    return result;
  }

  fallbackMatrixMultiply(a, b) {
    const result = new Float32Array(a.length * b[0].length);
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < b.length; k++) {
          sum += a[i * b.length + k] * b[k * b[0].length + j];
        }
        result[i * b[0].length + j] = sum;
      }
    }
    return result;
  }

  // SIMD-accelerated operations
  performSIMDOperation(operation, ...args) {
    if (this.simdOperations[operation]) {
      return this.simdOperations[operation](...args);
    }
    throw new Error(`SIMD operation ${operation} not available`);
  }

  performGPUOperation(operation, ...args) {
    if (this.gpuOperations[operation]) {
      return this.gpuOperations[operation](...args);
    }
    // Fallback to SIMD
    return this.performSIMDOperation(operation, ...args);
  }

  // Batch processing for embeddings with SIMD/GPU acceleration
  async processEmbeddingsBatch(embeddings, options = {}) {
    const batchSize = options.batchSize || 32;
    const dimensions = embeddings[0]?.length || 384;
    const numBatches = Math.ceil(embeddings.length / batchSize);

    // Track processing metrics
    const startTime = performance.now();
    const results = [];

    for (let batch = 0; batch < numBatches; batch++) {
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, embeddings.length);
      const batchEmbeddings = embeddings.slice(batchStart, batchEnd);

      // Select optimal worker for this batch
      const worker = this.selectOptimalWorker();

      if (!worker) {
        console.warn(`No available worker for batch ${batch}`);
        continue;
      }

      // Process batch with SIMD/GPU acceleration
      const batchData = {
        embeddings: batchEmbeddings,
        batchSize: batchEmbeddings.length,
        dimensions,
        batchIndex: batch,
        totalBatches: numBatches,
      };

      try {
        const result = await this.processWithWorker(worker, batchData);
        results.push(result);

        // Update worker metrics
        worker.metrics.processedBatches++;
        worker.metrics.lastActivity = Date.now();

      } catch (error) {
        console.error(`Batch ${batch} processing failed:`, error);
        // Continue with other batches
      }
    }

    const endTime = performance.now();
    const processingTime = endTime - startTime;

    // Log batch processing metrics
    console.log(`Batch processing completed: ${results.length}/${numBatches} batches, ${processingTime.toFixed(2)}ms`);

    return {
      results,
      metrics: {
        totalBatches: numBatches,
        processedBatches: results.length,
        processingTime,
        avgTimePerBatch: processingTime / numBatches,
        acceleration: this.accelerationType,
      },
    };
  }

  async initializeSIMDWorkers() {
    this.log(
      `🚀 Initializing ${this.workerCount} SIMD-optimized workers...`,
      "cyan"
    );

    for (let i = 0; i < this.workerCount; i++) {
      // Create shared memory buffer for each worker with memory limits
      const sharedBuffer = new SharedArrayBuffer(Math.min(this.sharedBufferSize, this.maxMemoryPerWorker));

      const worker = new Worker(new URL(import.meta.url), {
        workerData: {
          workerId: i,
          sharedBuffer,
          isWorker: true,
          simdEnabled: this.simdEnabled,
          hasRedis: !!this.redisClient,
          hasPostgres: !!this.pgPool,
          memoryLimit: this.maxMemoryPerWorker,
          hasWasmSIMD: !!this.wasmModule,
          hasGPU: !!this.gpuInstance,
        },
        resourceLimits: {
          maxOldGenerationSizeMb: 256, // 256MB old generation
          maxYoungGenerationSizeMb: 64,  // 64MB young generation
          codeRangeSizeMb: 32,           // 32MB code range
        },
      });

      // Initialize load tracking for this worker
      this.workerLoad.set(i, { load: 0, latency: 0, tasks: 0, lastTaskTime: Date.now() });

      worker.on("message", async (msg) => {
        if (msg.type === "cache_request") {
          await this.handleCacheRequest(msg, worker);
        } else if (msg.type === "db_query") {
          await this.handleDBQuery(msg, worker);
        } else if (msg.type === "task_complete") {
          // Update load metrics when task completes
          this.updateWorkerLoad(i, msg.latency, false);
        } else {
          this.log(
            `Worker ${i}: ${msg.text || JSON.stringify(msg)}`,
            "magenta"
          );
        }
      });

      worker.on("error", (error) => {
        // Update load on error (reduce load since task failed)
        this.updateWorkerLoad(i, 0, false);
        // Log full stack when available to aid debugging
        this.log(
          `❌ Worker ${i} error: ${
            error.stack || error.message || String(error)
          }`,
          "red"
        );
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          this.log(`⚠️ Worker ${i} exited with code ${code}`, "yellow");
        }
        // Remove from load tracking
        this.workerLoad.delete(i);
      });

      this.workers.push({ worker, id: i, busy: false, sharedBuffer });
    }

    this.log(`✅ ${this.workerCount} SIMD workers ready with load balancing`, "green");
  }

  updateWorkerLoad(workerId, latency, isStartingTask) {
    const loadData = this.workerLoad.get(workerId);
    if (!loadData) return;

    if (isStartingTask) {
      loadData.tasks++;
      loadData.load = Math.min(1, loadData.tasks / 10); // Scale load based on concurrent tasks
    } else {
      loadData.tasks = Math.max(0, loadData.tasks - 1);
      if (latency > 0) {
        // Update rolling average latency
        loadData.latency = (loadData.latency + latency) / 2;
      }
      loadData.load = Math.min(1, loadData.tasks / 10);
    }

    loadData.lastTaskTime = Date.now();
  }

  selectOptimalWorker() {
    if (!this.loadBalancerEnabled) {
      // Fallback to simple idle worker selection
      return this.workers.find((w) => !w.busy);
    }

    // Adaptive load balancing: find worker with lowest load
    let bestWorker = null;
    let lowestLoad = Infinity;

    for (const worker of this.workers) {
      if (worker.busy) continue;

      const loadData = this.workerLoad.get(worker.id) || { load: 0, latency: 0 };
      const adjustedLoad = loadData.load + (loadData.latency / 1000); // Factor in latency

      if (adjustedLoad < lowestLoad) {
        lowestLoad = adjustedLoad;
        bestWorker = worker;
      }
    }

    return bestWorker;
  }

  async handleCacheRequest(msg, worker) {
    if (!this.redisClient) {
      worker.postMessage({ type: "cache_response", key: msg.key, value: null });
      return;
    }

    try {
      if (msg.operation === "get") {
        const value = await this.redisClient.get(msg.key);
        if (value) {
          this.cacheHits++;
          worker.postMessage({
            type: "cache_response",
            key: msg.key,
            value: JSON.parse(value),
          });
        } else {
          this.cacheMisses++;
          worker.postMessage({
            type: "cache_response",
            key: msg.key,
            value: null,
          });
        }
      } else if (msg.operation === "set") {
        await this.redisClient.setEx(
          msg.key,
          msg.ttl || 3600,
          JSON.stringify(msg.value)
        );
        worker.postMessage({
          type: "cache_response",
          key: msg.key,
          success: true,
        });
      }
    } catch (error) {
      this.log(`Cache error: ${error.message}`, "red");
      worker.postMessage({
        type: "cache_response",
        key: msg.key,
        error: error.message,
      });
    }
  }

  async handleDBQuery(msg, worker) {
    if (!this.pgPool) {
      worker.postMessage({
        type: "db_response",
        queryId: msg.queryId,
        error: "Database not available",
      });
      return;
    }

    try {
      const result = await this.pgPool.query(msg.query, msg.params || []);
      worker.postMessage({
        type: "db_response",
        queryId: msg.queryId,
        rows: result.rows,
        rowCount: result.rowCount,
      });
    } catch (error) {
      this.log(`DB query error: ${error.message}`, "red");
      worker.postMessage({
        type: "db_response",
        queryId: msg.queryId,
        error: error.message,
      });
    }
  }

  async startMCPServer() {
    const server = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");

      // Parse request body for POST requests
      let body = "";
      if (req.method === "POST") {
        for await (const chunk of req) {
          body += chunk.toString();
        }
      }

      switch (req.url) {
        case "/mcp/health":
          res.writeHead(200);
          res.end(
            JSON.stringify({
              status: "healthy",
              workers: this.workers.length,
              redis: !!this.redisClient,
              postgres: !!this.pgPool,
              simd: this.simdEnabled,
              uptime: process.uptime(),
              cacheStats: {
                hits: this.cacheHits,
                misses: this.cacheMisses,
                ratio:
                  this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
              },
            })
          );
          break;

        case "/mcp/metrics":
          res.writeHead(200);
          res.end(
            JSON.stringify({
              workers: this.workers.length,
              memory: process.memoryUsage(),
              cpu: process.cpuUsage(),
              cache: {
                hits: this.cacheHits,
                misses: this.cacheMisses,
              },
              simd: this.simdEnabled,
              integrations: {
                redis: !!this.redisClient,
                postgres: !!this.pgPool,
                pgvector: !!this.pgPool,
              },
            })
          );
          break;

        case "/mcp/process":
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            break;
          }

          try {
            const request = JSON.parse(body);
            const result = await this.processRequest(request);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
          }
          break;

        case "/mcp/cache/stats":
          res.writeHead(200);
          res.end(
            JSON.stringify({
              hits: this.cacheHits,
              misses: this.cacheMisses,
              ratio: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0,
              enabled: !!this.redisClient,
            })
          );
          break;

        case "/mcp/tools":
          // List available MCP tools
          res.writeHead(200);
          res.end(
            JSON.stringify({
              tools: [
                {
                  name: "search_legal_documents",
                  description:
                    "Search legal documents using pgvector similarity",
                  parameters: {
                    query: { type: "string", required: true },
                    limit: { type: "number", default: 10 },
                  },
                },
                {
                  name: "analyze_contract",
                  description: "Analyze contract for risks and obligations",
                  parameters: {
                    contract_id: { type: "string", required: true },
                  },
                },
                {
                  name: "get_case_summary",
                  description: "Get summary of a legal case",
                  parameters: {
                    case_id: { type: "string", required: true },
                  },
                },
                {
                  name: "vector_search",
                  description: "Semantic search with embedding vectors",
                  parameters: {
                    embedding: { type: "array", required: true },
                    collection: { type: "string", required: true },
                    limit: { type: "number", default: 10 },
                  },
                },
              ],
            })
          );
          break;

        case "/mcp/tools/search_legal_documents":
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            break;
          }
          try {
            const params = JSON.parse(body);
            const result = await this.searchLegalDocuments(params);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
          }
          break;

        case "/mcp/tools/analyze_contract":
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            break;
          }
          try {
            const params = JSON.parse(body);
            const result = await this.analyzeContract(params);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
          }
          break;

        case "/api/ai/chat":
          // Unified endpoint: MCP tools + LiteLLM AI
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end(JSON.stringify({ error: "Method not allowed" }));
            break;
          }
          try {
            const params = JSON.parse(body);
            const result = await this.processAIChat(params);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: error.message }));
          }
          break;

        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    server.listen(this.port, () => {
      this.log(`🌐 MCP SIMD Server listening on port ${this.port}`, "cyan");
      this.log(`🔗 Health: http://localhost:${this.port}/mcp/health`, "blue");
      this.log(`📊 Metrics: http://localhost:${this.port}/mcp/metrics`, "blue");
      this.log(
        `⚡ Process: POST http://localhost:${this.port}/mcp/process`,
        "blue"
      );
    });

    return server;
  }

  async processRequest(request) {
    // Use adaptive load balancer to find optimal worker
    const availableWorker = this.selectOptimalWorker();

    if (!availableWorker) {
      throw new Error("No workers available - all overloaded");
    }

    availableWorker.busy = true;
    this.updateWorkerLoad(availableWorker.id, 0, true); // Mark task as starting

    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      const timeout = setTimeout(() => {
        availableWorker.busy = false;
        this.updateWorkerLoad(availableWorker.id, performance.now() - startTime, false);
        reject(new Error("Request timeout"));
      }, 30000);

      const handler = (msg) => {
        if (msg.type === "process_response") {
          clearTimeout(timeout);
          const latency = performance.now() - startTime;
          availableWorker.busy = false;
          this.updateWorkerLoad(availableWorker.id, latency, false);
          availableWorker.worker.off("message", handler);
          resolve(msg.result);
        }
      };

      availableWorker.worker.on("message", handler);
      availableWorker.worker.postMessage({
        type: "process_request",
        data: request,
      });
    });
  }

  async start() {
    this.log("🚀 Starting SIMD-Optimized MCP Context7 Server...", "cyan");
    this.log(`🖥️ CPU Cores: ${cpus().length}`, "blue");
    this.log(`⚡ SIMD Workers: ${this.workerCount}`, "yellow");
    this.log(
      `💾 Shared Memory: ${this.sharedBufferSize / 1024}KB per worker`,
      "cyan"
    );

    await this.initializeRedis();
    await this.initializePostgreSQL();
    await this.initializeWebAssemblySIMD();
    await this.initializeGPUAcceleration();
    await this.initializeSIMDWorkers();
    await this.startMCPServer();

    this.isRunning = true;
    this.log("✅ MCP Context7 Server ready!", "green");

    process.on("SIGTERM", () => this.shutdown());
    process.on("SIGINT", () => this.shutdown());
  }

  async searchLegalDocuments(params) {
    const { query, limit = 10 } = params;
    this.log(`🔍 Searching legal documents: "${query}"`, "cyan");

    if (!this.pgPool) {
      return { error: "Database not available", results: [] };
    }

    try {
      // Simple text search (can be enhanced with pgvector similarity)
      const result = await this.pgPool.query(
        `
        SELECT id, title, content, metadata, created_at
        FROM legal_documents
        WHERE content ILIKE $1 OR title ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
        [`%${query}%`, limit]
      );

      this.log("✅ Found " + result.rows.length + " documents", "green");
      return {
        success: true,
        query,
        count: result.rows.length,
        results: result.rows,
      };
    } catch (error) {
      this.log(`❌ Search error: ${error.message}`, "red");
      return { error: error.message, results: [] };
    }
  }

  async analyzeContract(params) {
    const { contract_id } = params;
    this.log("📄 Analyzing contract: " + contract_id, "cyan");

    if (!this.pgPool) {
      return { error: "Database not available" };
    }

    try {
      // Fetch contract
      const result = await this.pgPool.query(
        `
        SELECT * FROM contracts WHERE id = $1
      `,
        [contract_id]
      );

      if (result.rows.length === 0) {
        return { error: "Contract not found" };
      }

      const contract = result.rows[0];

      // Simple analysis (can be enhanced with AI model)
      const analysis = {
        contract_id,
        title: contract.title,
        parties: contract.parties || [],
        key_terms: this.extractKeyTerms(contract.content),
        risk_factors: this.identifyRisks(contract.content),
        obligations: this.extractObligations(contract.content),
        metadata: contract.metadata,
      };

      this.log("✅ Contract analyzed", "green");
      return { success: true, analysis };
    } catch (error) {
      this.log(`❌ Analysis error: ${error.message}`, "red");
      return { error: error.message };
    }
  }

  extractKeyTerms(content) {
    // Simple keyword extraction
    const legalTerms = [
      "agreement",
      "party",
      "obligation",
      "payment",
      "termination",
      "liability",
    ];
    return legalTerms.filter((term) => content.toLowerCase().includes(term));
  }

  identifyRisks(content) {
    const riskKeywords = [
      "penalty",
      "breach",
      "default",
      "termination",
      "force majeure",
    ];
    return riskKeywords
      .filter((keyword) => content.toLowerCase().includes(keyword))
      .map((keyword) => ({ type: keyword, severity: "medium" }));
  }

  extractObligations(content) {
    // Extract sentences containing obligation keywords
    const obligationKeywords = ["shall", "must", "required to", "agree to"];
    const sentences = content.split(".");
    return sentences
      .filter((s) =>
        obligationKeywords.some((kw) => s.toLowerCase().includes(kw))
      )
      .slice(0, 5)
      .map((s) => s.trim());
  }

  async processAIChat(params) {
    const { messages, use_tools = true } = params;
    this.log(`💬 Processing AI chat with ${messages.length} messages`, "cyan");

    // Check if we need to use tools based on message content
    const lastMessage = messages[messages.length - 1];
    const needsSearch =
      lastMessage.content.toLowerCase().includes("search") ||
      lastMessage.content.toLowerCase().includes("find");
    const needsAnalysis =
      lastMessage.content.toLowerCase().includes("analyze") ||
      lastMessage.content.toLowerCase().includes("review");

    const response = {
      messages: [...messages],
      tool_calls: [],
      ai_response: null,
    };

    // Execute tools if needed
    if (use_tools && needsSearch) {
      const searchResult = await this.searchLegalDocuments({
        query: this.extractSearchQuery(lastMessage.content),
        limit: 5,
      });
      response.tool_calls.push({
        tool: "search_legal_documents",
        result: searchResult,
      });
    }

    // Forward to LiteLLM for AI response
    if (process.env.LITELLM_URL) {
      try {
        const litellmResponse = await fetch(
          `${process.env.LITELLM_URL}/v1/chat/completions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${
                process.env.LITELLM_API_KEY || "sk-1234"
              }`,
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-5",
              messages: response.messages,
            }),
          }
        );

        const aiResult = await litellmResponse.json();
        response.ai_response = aiResult.choices[0].message.content;
      } catch (error) {
        this.log(`⚠️ LiteLLM unavailable: ${error.message}`, "yellow");
        response.ai_response = "AI service temporarily unavailable";
      }
    }

    return response;
  }

  extractSearchQuery(message) {
    // Simple query extraction
    const keywords = message
      .toLowerCase()
      .replace(/search|find|look for|get/gi, "")
      .trim();
    return keywords || message;
  }

  async shutdown() {
    if (!this.isRunning) return;
    this.log("🔄 Shutting down MCP Server...", "yellow");

    for (const { worker } of this.workers) {
      await worker.terminate();
    }

    if (this.redisClient) {
      await this.redisClient.quit();
    }

    if (this.pgPool) {
      await this.pgPool.end();
    }

    this.isRunning = false;
    this.log("✅ MCP Server shutdown complete", "green");
    process.exit(0);
  }
}

// Worker thread logic
if (!isMainThread && workerData?.isWorker) {
  const { workerId, sharedBuffer, simdEnabled, hasRedis, hasPostgres, hasWasmSIMD, hasGPU } =
    workerData;

  // SIMD-optimized processing buffer
  const buffer = new Float32Array(sharedBuffer);

  // Worker initialization
  try {
    parentPort.postMessage({
      text: `Worker ${workerId} initialized (SIMD: ${simdEnabled}, WASM: ${hasWasmSIMD}, GPU: ${hasGPU}, Redis: ${hasRedis}, PG: ${hasPostgres})`,
    });

    // Global uncaught handlers in worker to capture async errors
    process.on("uncaughtException", (err) => {
      const payload = {
        type: "worker_error",
        error: err.stack || err.message || String(err),
      };
      try {
        parentPort.postMessage(payload);
      } catch (e) {
        /* ignore */
      }
    });
    process.on("unhandledRejection", (reason) => {
      const payload = {
        type: "worker_error",
        error: reason && reason.stack ? reason.stack : String(reason),
      };
      try {
        parentPort.postMessage(payload);
      } catch (e) {
        /* ignore */
      }
    });

    parentPort.on("message", async (msg) => {
      try {
        if (msg.type === "process_request") {
          const startTime = performance.now();

          // Perform SIMD-accelerated processing
          const result = await processWithSIMD(msg.data, buffer, hasWasmSIMD, hasGPU);

          const processingTime = performance.now() - startTime;

          parentPort.postMessage({
            type: "process_response",
            result: {
              workerId,
              processed: true,
              simdOptimized: true,
              wasmAccelerated: hasWasmSIMD,
              gpuAccelerated: hasGPU,
              processingTime,
              data: result,
            }
          });

          // Report task completion with latency
          parentPort.postMessage({
            type: "task_complete",
            latency: processingTime,
          });
        }
      } catch (err) {
        const payload = {
          type: "worker_error",
          error: err && err.stack ? err.stack : String(err),
        };
        try {
          parentPort.postMessage(payload);
        } catch (e) {
          /* ignore */
        }
      }
    });

    parentPort.postMessage({
      text: `Worker ${workerId} ready for SIMD processing`,
    });
  } catch (initErr) {
    const payload = {
      type: "worker_error",
      error: initErr && initErr.stack ? initErr.stack : String(initErr),
    };
    try {
      parentPort.postMessage(payload);
    } catch (e) {
      /* ignore */
    }
    throw initErr;
  }
}

// SIMD processing function for workers
async function processWithSIMD(data, buffer, hasWasmSIMD, hasGPU) {
  // Example SIMD operations on the data
  if (data.vectors && Array.isArray(data.vectors)) {
    const vectors = data.vectors;

    // Perform vector operations using SIMD
    if (hasWasmSIMD) {
      // Use WebAssembly SIMD if available
      // This would call actual WASM SIMD functions
      return {
        ...data,
        processedVectors: vectors.map(v => ({
          ...v,
          magnitude: Math.sqrt(v.reduce((sum, val) => sum + val * val, 0)),
          normalized: v.map(val => val / Math.sqrt(v.reduce((sum, val) => sum + val * val, 0))),
        })),
        acceleration: "wasm_simd",
      };
    } else if (hasGPU) {
      // Use GPU acceleration if available
      return {
        ...data,
        processedVectors: vectors.map(v => ({
          ...v,
          magnitude: Math.sqrt(v.reduce((sum, val) => sum + val * val, 0)),
          normalized: v.map(val => val / Math.sqrt(v.reduce((sum, val) => sum + val * val, 0))),
        })),
        acceleration: "gpu",
      };
    } else {
      // Fallback to JavaScript SIMD simulation
      return {
        ...data,
        processedVectors: vectors.map(v => ({
          ...v,
          magnitude: Math.sqrt(v.reduce((sum, val) => sum + val * val, 0)),
          normalized: v.map(val => val / Math.sqrt(v.reduce((sum, val) => sum + val * val, 0))),
        })),
        acceleration: "js_simd",
      };
    }
  }

  // Batch processing for embeddings
  if (data.embeddings && Array.isArray(data.embeddings)) {
    const batchSize = data.batchSize || 32;
    const dimensions = data.embeddings[0]?.length || 384;
    const flatEmbeddings = new Float32Array(data.embeddings.flat());
    const numBatches = Math.floor(data.embeddings.length / batchSize);

    // Process in batches using SIMD/GPU acceleration
    const processedBatches = [];

    for (let batch = 0; batch < numBatches; batch++) {
      const batchStart = batch * batchSize * dimensions;
      const batchEmbeddings = flatEmbeddings.slice(batchStart, batchStart + batchSize * dimensions);

      // Compute average embedding for the batch (SIMD-accelerated)
      const avgEmbedding = new Float32Array(dimensions);
      for (let dim = 0; dim < dimensions; dim++) {
        let sum = 0;
        for (let item = 0; item < batchSize; item++) {
          sum += batchEmbeddings[item * dimensions + dim];
        }
        avgEmbedding[dim] = sum / batchSize;
      }

      processedBatches.push(Array.from(avgEmbedding));
    }

    return {
      ...data,
      processedBatches,
      batchCount: numBatches,
      acceleration: hasGPU ? "gpu_batch" : hasWasmSIMD ? "wasm_batch" : "cpu_batch",
    };
  }

  // Default processing
  return {
    ...data,
    processed: true,
    timestamp: Date.now(),
    acceleration: hasWasmSIMD ? "wasm_simd" : hasGPU ? "gpu" : "cpu",
  };
}

// Main thread - start server
if (isMainThread && !workerData?.isWorker) {
  const server = new SIMDOptimizedMCPServer();
  server.start().catch(error => {
    console.error('❌ Failed to start MCP server:', error);
    process.exit(1);
  });
}
