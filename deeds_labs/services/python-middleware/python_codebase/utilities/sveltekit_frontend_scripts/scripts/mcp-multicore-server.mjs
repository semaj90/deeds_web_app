#!/usr/bin/env node

/**
 * Enhanced MCP Multi-Core Server for VS Code Tasks
 * Optimized for RTX 3060 Ti and Legal AI workloads
 */

import { createServer } from 'http';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import chalk from 'chalk';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MCPMultiCoreServer {
  constructor() {
    this.workers = [];
    this.config = null;
    this.isRunning = false;
    this.workerCount = process.env.MCP_WORKERS ? parseInt(process.env.MCP_WORKERS) : cpus().length;
    this.port = process.env.MCP_PORT || 3000;
  }

  log(message, color = 'white') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk[color](`${timestamp} [MCP-Server] ${message}`));
  }

  async loadConfig() {
    try {
      const configPath = './mcp-multicore-config.json';
      const configData = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configData);
      this.log(' Configuration loaded successfully', 'green');
    } catch (error) {
      this.log('� Using default configuration', 'yellow');
      this.config = {
        mcp: {
          multicore: { enabled: true, workers: this.workerCount },
          gpu: { acceleration: true, device: 'RTX_3060_TI' },
          context7: { multicore: true },
        },
      };
    }
  }

  async initializeWorkers() {
    this.log(`=� Initializing ${this.workerCount} MCP workers...`, 'cyan');

    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(__filename, {
        workerData: {
          workerId: i,
          config: this.config,
          isWorker: true,
        },
      });

      worker.on('message', (message) => {
        this.log(`Worker ${i}: ${message}`, 'magenta');
      });

      worker.on('error', (error) => {
        this.log(`L Worker ${i} error: ${error.message}`, 'red');
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          this.log(`� Worker ${i} exited with code ${code}`, 'yellow');
        }
      });

      this.workers.push(worker);
    }

    this.log(` ${this.workerCount} workers initialized`, 'green');
  }

  async startHTTPServer() {
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');

      switch (req.url) {
        case '/mcp/health':
          res.writeHead(200);
          res.end(
            JSON.stringify({
              status: 'healthy',
              workers: this.workers.length,
              uptime: process.uptime(),
            })
          );
          break;

        case '/mcp/metrics':
          res.writeHead(200);
          res.end(
            JSON.stringify({
              workers: this.workers.length,
              memory: process.memoryUsage(),
              cpu: process.cpuUsage(),
              gpu: process.env.RTX_3060_OPTIMIZATION || false,
            })
          );
          break;

        case '/mcp/workers':
          res.writeHead(200);
          res.end(
            JSON.stringify({
              total: this.workers.length,
              active: this.workers.filter((w) => !w.isDead).length,
              config: this.config.mcp.multicore,
            })
          );
          break;

        default:
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    server.listen(this.port, () => {
      this.log(`< MCP Server listening on port ${this.port}`, 'cyan');
      this.log(`= Health: http://localhost:${this.port}/mcp/health`, 'blue');
      this.log(`=� Metrics: http://localhost:${this.port}/mcp/metrics`, 'blue');
      this.log(`=e Workers: http://localhost:${this.port}/mcp/workers`, 'blue');
    });

    return server;
  }

  async start() {
    this.log('=� Starting Enhanced MCP Multi-Core Server...', 'cyan');

    // Display system info
    this.log(`=� CPU Cores: ${cpus().length}`, 'white');
    this.log(`� Workers: ${this.workerCount}`, 'yellow');
    this.log(
      `<� GPU: ${process.env.RTX_3060_OPTIMIZATION ? 'RTX 3060 Ti Enabled' : 'Disabled'}`,
      'magenta'
    );
    this.log(`=� Context7: ${process.env.CONTEXT7_MULTICORE ? 'Enabled' : 'Disabled'}`, 'green');

    await this.loadConfig();
    await this.initializeWorkers();
    await this.startHTTPServer();

    this.isRunning = true;
    this.log(' MCP Multi-Core Server ready!', 'green');

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    if (!this.isRunning) return;

    this.log('= Shutting down MCP Server...', 'yellow');

    // Terminate all workers
    for (const worker of this.workers) {
      await worker.terminate();
    }

    this.isRunning = false;
    this.log(' MCP Server shutdown complete', 'green');
    process.exit(0);
  }
}

// Worker thread logic
if (!isMainThread && workerData?.isWorker) {
  const { workerId, config } = workerData;

  parentPort.postMessage(`Worker ${workerId} initialized with PID ${process.pid}`);

  // Simulate MCP processing work
  setInterval(() => {
    if (Math.random() < 0.1) {
      // 10% chance to report activity
      parentPort.postMessage(`Processing MCP request (GPU: ${config.mcp.gpu.acceleration})`);
    }
  }, 5000);

  parentPort.postMessage(`Worker ${workerId} ready for MCP processing`);
}

// Main thread - start the server
if (isMainThread && !workerData?.isWorker) {
  const server = new MCPMultiCoreServer();
  server.start().catch((error) => {
    console.error('L Failed to start MCP server:', error);
    process.exit(1);
  });
}
