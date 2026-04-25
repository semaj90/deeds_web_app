import { Worker } from "worker_threads";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Phase 4: Worker Manager
 * Orchestrates all service workers for parallel processing
 */

class WorkerManager {
  constructor() {
    this.workers = new Map();
    this.workerPools = new Map();
    this.isInitialized = false;
    this.config = {
      maxWorkers: 4,
      workerTimeout: 300000, // 5 minutes
      retryAttempts: 3,
    };
  }

  /**
   * Initialize all worker pools
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log("🔧 Initializing Worker Manager...");

    try {
      // Initialize worker pools
      await this.createWorkerPool(
        "chunking",
        join(__dirname, "chunking-worker.js")
      );
      await this.createWorkerPool(
        "streaming",
        join(__dirname, "streaming-worker.js")
      );
      await this.createWorkerPool(
        "embedding",
        join(__dirname, "embedding-worker.js")
      );
      await this.createWorkerPool(
        "analysis",
        join(__dirname, "analysis-worker.js")
      );

      this.isInitialized = true;
      console.log("✅ Worker Manager initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Worker Manager:", error);
      throw error;
    }
  }

  /**
   * Create a worker pool for a specific task
   */
  async createWorkerPool(workerType, workerPath) {
    const pool = {
      workers: [],
      available: [],
      busy: [],
      queue: [],
    };

    // Create worker instances
    for (let i = 0; i < this.config.maxWorkers; i++) {
      const worker = new Worker(workerPath, {
        workerData: { workerId: `${workerType}-${i}` },
      });

      worker.on("error", (error) => {
        console.error(`❌ Worker ${workerType}-${i} error:`, error);
        this.handleWorkerError(workerType, worker, error);
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.error(
            `❌ Worker ${workerType}-${i} exited with code ${code}`
          );
          this.restartWorker(workerType, worker);
        }
      });

      pool.workers.push(worker);
      pool.available.push(worker);
    }

    this.workerPools.set(workerType, pool);
    console.log(
      `✅ Created ${workerType} worker pool with ${this.config.maxWorkers} workers`
    );
  }

  /**
   * Execute task in worker pool
   */
  async executeTask(workerType, taskData, options = {}) {
    await this.initialize();

    const pool = this.workerPools.get(workerType);
    if (!pool) {
      throw new Error(`Worker pool ${workerType} not found`);
    }

    return new Promise((resolve, reject) => {
      const task = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        data: taskData,
        options,
        resolve,
        reject,
        attempts: 0,
        maxAttempts: options.retryAttempts || this.config.retryAttempts,
      };

      if (pool.available.length > 0) {
        this.assignTaskToWorker(workerType, task);
      } else {
        pool.queue.push(task);
      }
    });
  }

  /**
   * Assign task to available worker
   */
  assignTaskToWorker(workerType, task) {
    const pool = this.workerPools.get(workerType);
    const worker = pool.available.shift();

    if (!worker) {
      pool.queue.push(task);
      return;
    }

    pool.busy.push(worker);

    // Set up timeout
    const timeout = setTimeout(() => {
      task.reject(new Error(`Task ${task.id} timed out`));
      this.handleTaskComplete(workerType, worker, task);
    }, this.config.workerTimeout);

    // Set up message handler
    const messageHandler = (result) => {
      clearTimeout(timeout);
      worker.off("message", messageHandler);

      if (result.success) {
        task.resolve(result.data);
      } else {
        if (task.attempts < task.maxAttempts) {
          task.attempts++;
          console.log(
            `🔄 Retrying task ${task.id} (attempt ${task.attempts}/${task.maxAttempts})`
          );
          this.assignTaskToWorker(workerType, task);
          return;
        }
        task.reject(new Error(result.error));
      }

      this.handleTaskComplete(workerType, worker, task);
    };

    worker.on("message", messageHandler);
    worker.postMessage({
      taskId: task.id,
      data: task.data,
      options: task.options,
    });
  }

  /**
   * Handle task completion
   */
  handleTaskComplete(workerType, worker, task) {
    const pool = this.workerPools.get(workerType);

    // Move worker from busy to available
    const busyIndex = pool.busy.indexOf(worker);
    if (busyIndex > -1) {
      pool.busy.splice(busyIndex, 1);
      pool.available.push(worker);
    }

    // Process next task in queue
    if (pool.queue.length > 0) {
      const nextTask = pool.queue.shift();
      this.assignTaskToWorker(workerType, nextTask);
    }
  }

  /**
   * Handle worker errors
   */
  handleWorkerError(workerType, worker, error) {
    console.error(`❌ Worker error in ${workerType}:`, error);
    // Could implement worker restart logic here
  }

  /**
   * Restart a worker
   */
  async restartWorker(workerType, oldWorker) {
    const pool = this.workerPools.get(workerType);
    if (!pool) return;

    // Remove old worker
    const workerIndex = pool.workers.indexOf(oldWorker);
    if (workerIndex > -1) {
      pool.workers.splice(workerIndex, 1);

      const availableIndex = pool.available.indexOf(oldWorker);
      if (availableIndex > -1) {
        pool.available.splice(availableIndex, 1);
      }

      const busyIndex = pool.busy.indexOf(oldWorker);
      if (busyIndex > -1) {
        pool.busy.splice(busyIndex, 1);
      }
    }

    // Create new worker
    const workerPath = join(__dirname, `${workerType}-worker.js`);
    const newWorker = new Worker(workerPath, {
      workerData: { workerId: `${workerType}-${Date.now()}` },
    });

    newWorker.on("error", (error) => {
      console.error(`❌ Restarted worker ${workerType} error:`, error);
      this.handleWorkerError(workerType, newWorker, error);
    });

    pool.workers.push(newWorker);
    pool.available.push(newWorker);

    console.log(`✅ Restarted ${workerType} worker`);
  }

  /**
   * Get worker pool statistics
   */
  getStats() {
    const stats = {};

    for (const [type, pool] of this.workerPools) {
      stats[type] = {
        total: pool.workers.length,
        available: pool.available.length,
        busy: pool.busy.length,
        queued: pool.queue.length,
      };
    }

    return stats;
  }

  /**
   * Process document chunks
   */
  async processDocumentChunks(documentData) {
    return this.executeTask("chunking", {
      type: "chunk_document",
      document: documentData,
    });
  }

  /**
   * Generate embeddings
   */
  async generateEmbeddings(texts) {
    return this.executeTask("embedding", {
      type: "generate_embeddings",
      texts: Array.isArray(texts) ? texts : [texts],
    });
  }

  /**
   * Process streaming data
   */
  async processStream(streamData) {
    return this.executeTask("streaming", {
      type: "process_stream",
      data: streamData,
    });
  }

  /**
   * Analyze case data
   */
  async analyzeCaseData(caseData) {
    return this.executeTask("analysis", {
      type: "analyze_case",
      case: caseData,
    });
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const stats = this.getStats();
      return {
        status: "healthy",
        initialized: this.isInitialized,
        workerPools: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Shutdown all workers
   */
  async shutdown() {
    console.log("🛑 Shutting down Worker Manager...");

    for (const [type, pool] of this.workerPools) {
      for (const worker of pool.workers) {
        await worker.terminate();
      }
      console.log(`✅ Terminated ${type} workers`);
    }

    this.workerPools.clear();
    this.isInitialized = false;
    console.log("✅ Worker Manager shutdown complete");
  }
}

// Export singleton instance
export const workerManager = new WorkerManager();
export default workerManager;
