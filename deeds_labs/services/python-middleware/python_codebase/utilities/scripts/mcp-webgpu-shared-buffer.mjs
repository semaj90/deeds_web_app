#!/usr/bin/env node

/**
 * MCP Context7 with SharedArrayBuffer + WebGPU Pattern
 * Demonstrates parallel CPU preparation → GPU processing pipeline
 * Perfect for legal document vectorization and embeddings
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';

const colors = {
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`
};

/**
 * SharedArrayBuffer Layout for Legal Document Processing
 *
 * Memory Layout (per document):
 * [0-3]:     Document ID (Uint32)
 * [4-7]:     Processing Stage (Uint32) - 0: pending, 1: processing, 2: complete
 * [8-11]:    Worker ID (Uint32)
 * [12-15]:   Vector Dimension Count (Uint32)
 * [16-N]:    Embedding Vector Data (Float32Array)
 */

class SharedBufferWebGPUPipeline {
  constructor() {
    this.workerCount = parseInt(process.env.MCP_WORKERS || cpus().length);
    this.workers = [];

    // Shared memory configuration
    this.documentsPerBatch = 1000;
    this.vectorDimension = 768; // Legal AI embedding dimension
    this.bytesPerDocument = 16 + (this.vectorDimension * 4); // Header + float32 vector
    this.totalBufferSize = this.documentsPerBatch * this.bytesPerDocument;

    // Create shared memory buffer
    this.sharedBuffer = new SharedArrayBuffer(this.totalBufferSize);

    // Atomic control buffer for synchronization
    this.controlBuffer = new SharedArrayBuffer(64); // Control flags
    this.atomicControl = new Int32Array(this.controlBuffer);

    this.log('SharedBuffer WebGPU Pipeline initialized', 'cyan');
  }

  log(message, color = 'blue') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const colorFn = colors[color] || colors.blue;
    console.log(colorFn(`[${timestamp}] [WebGPU-SAB] ${message}`));
  }

  async initializeWorkers() {
    this.log(`🚀 Initializing ${this.workerCount} parallel workers with SharedArrayBuffer...`, 'cyan');

    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: {
          workerId: i,
          sharedBuffer: this.sharedBuffer,
          controlBuffer: this.controlBuffer,
          isWorker: true,
          documentsPerBatch: this.documentsPerBatch,
          vectorDimension: this.vectorDimension,
          bytesPerDocument: this.bytesPerDocument,
          workerCount: this.workerCount
        }
      });

      worker.on('message', (msg) => {
        if (msg.type === 'ready') {
          this.log(`Worker ${i}: ${msg.text}`, 'green');
        } else if (msg.type === 'complete') {
          this.log(`Worker ${i} processed ${msg.documentsProcessed} documents`, 'magenta');
        }
      });

      worker.on('error', (error) => {
        this.log(`Worker ${i} error: ${error.message}`, 'red');
      });

      this.workers.push({ worker, id: i });
    }

    this.log(`✅ ${this.workerCount} workers ready with shared canvas`, 'green');
  }

  /**
   * Demonstrates the parallel preparation pattern:
   * 1. Workers process documents in parallel
   * 2. Each writes to their section of SharedArrayBuffer
   * 3. Main thread reads complete buffer for GPU upload
   */
  async processLegalDocumentBatch(documents) {
    this.log(`📊 Processing ${documents.length} documents in parallel...`, 'cyan');

    // Reset control buffer
    Atomics.store(this.atomicControl, 0, 0); // Completed worker count

    // Signal workers to start
    const startTime = performance.now();

    for (let i = 0; i < this.workerCount; i++) {
      this.workers[i].worker.postMessage({
        type: 'process_batch',
        documents: documents.slice(
          i * Math.floor(documents.length / this.workerCount),
          (i + 1) * Math.floor(documents.length / this.workerCount)
        )
      });
    }

    // Wait for all workers to complete using Atomics
    await this.waitForWorkers();

    const duration = performance.now() - startTime;
    this.log(`✅ Batch processed in ${duration.toFixed(2)}ms`, 'green');

    // Read complete buffer for GPU upload
    return this.extractVectorsFromSharedBuffer(documents.length);
  }

  async waitForWorkers() {
    // Wait for all workers to signal completion
    while (Atomics.load(this.atomicControl, 0) < this.workerCount) {
      // Use Atomics.wait for efficient synchronization
      Atomics.wait(this.atomicControl, 0, Atomics.load(this.atomicControl, 0), 100);
    }
  }

  extractVectorsFromSharedBuffer(documentCount) {
    this.log(`🎨 Reading ${documentCount} vectors from shared canvas...`, 'cyan');

    const vectors = [];
    const view = new DataView(this.sharedBuffer);

    for (let i = 0; i < documentCount; i++) {
      const offset = i * this.bytesPerDocument;

      // Read header
      const docId = view.getUint32(offset, true);
      const stage = view.getUint32(offset + 4, true);
      const workerId = view.getUint32(offset + 8, true);
      const dimension = view.getUint32(offset + 12, true);

      // Read vector data
      const vectorData = new Float32Array(
        this.sharedBuffer,
        offset + 16,
        this.vectorDimension
      );

      vectors.push({
        docId,
        stage,
        workerId,
        dimension,
        embedding: Array.from(vectorData)
      });
    }

    this.log(`✅ Extracted ${vectors.length} vectors ready for GPU upload`, 'green');
    return vectors;
  }

  /**
   * Simulated WebGPU upload (would be actual GPU buffer in browser)
   */
  async uploadToGPU(vectors) {
    this.log(`🚀 Uploading ${vectors.length} vectors to GPU buffer...`, 'cyan');

    // In real WebGPU:
    // const gpuBuffer = device.createBuffer({
    //   size: vectors.length * this.vectorDimension * 4,
    //   usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    // });
    // device.queue.writeBuffer(gpuBuffer, 0, this.sharedBuffer);

    this.log(`✅ GPU upload complete (simulated)`, 'green');

    return {
      bufferSize: vectors.length * this.vectorDimension * 4,
      vectorCount: vectors.length,
      gpuReady: true
    };
  }

  async demonstratePattern() {
    this.log('=== SharedArrayBuffer + WebGPU Pattern Demo ===', 'yellow');

    // Simulate legal documents
    const documents = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      text: `Legal document ${i} - Contract, Evidence, Brief, Citation`,
      metadata: { type: 'contract', jurisdiction: 'US' }
    }));

    await this.initializeWorkers();

    // Process batch with parallel workers
    const vectors = await this.processLegalDocumentBatch(documents);

    // Upload to GPU (simulated)
    const gpuResult = await this.uploadToGPU(vectors);

    this.log('=== Pattern Complete ===', 'yellow');
    this.log(`📊 Performance Summary:`, 'cyan');
    this.log(`   Workers: ${this.workerCount}`, 'blue');
    this.log(`   Documents: ${vectors.length}`, 'blue');
    this.log(`   Vector Dimension: ${this.vectorDimension}`, 'blue');
    this.log(`   GPU Buffer Size: ${gpuResult.bufferSize} bytes`, 'blue');
    this.log(`   Shared Memory: ${this.totalBufferSize / 1024} KB`, 'blue');

    process.exit(0);
  }
}

// Worker thread logic
if (!isMainThread && workerData?.isWorker) {
  const {
    workerId,
    sharedBuffer,
    controlBuffer,
    documentsPerBatch,
    vectorDimension,
    bytesPerDocument,
    workerCount
  } = workerData;

  const atomicControl = new Int32Array(controlBuffer);

  parentPort.postMessage({
    type: 'ready',
    text: `Worker ${workerId} initialized with shared canvas access`
  });

  parentPort.on('message', async (msg) => {
    if (msg.type === 'process_batch') {
      const documents = msg.documents;
      const view = new DataView(sharedBuffer);

      // Each worker writes to their section of the shared buffer
      for (let i = 0; i < documents.length; i++) {
        const globalIndex = workerId * Math.floor(documentsPerBatch / workerCount) + i;
        const offset = globalIndex * bytesPerDocument;

        // Write header
        view.setUint32(offset, documents[i].id, true);          // Document ID
        view.setUint32(offset + 4, 2, true);                    // Stage: complete
        view.setUint32(offset + 8, workerId, true);             // Worker ID
        view.setUint32(offset + 12, vectorDimension, true);     // Vector dimension

        // Simulate embedding generation (in real app, this would be actual model)
        const embedding = new Float32Array(sharedBuffer, offset + 16, vectorDimension);
        for (let j = 0; j < vectorDimension; j++) {
          // Simulate legal AI embedding values
          embedding[j] = Math.random() * 2 - 1;
        }
      }

      // Signal completion using Atomics
      const completedCount = Atomics.add(atomicControl, 0, 1) + 1;
      Atomics.notify(atomicControl, 0, 1);

      parentPort.postMessage({
        type: 'complete',
        documentsProcessed: documents.length
      });
    }
  });
}

// Main thread - run demonstration
if (isMainThread && !workerData?.isWorker) {
  const pipeline = new SharedBufferWebGPUPipeline();
  pipeline.demonstratePattern().catch(error => {
    console.error('❌ Pipeline error:', error);
    process.exit(1);
  });
}
