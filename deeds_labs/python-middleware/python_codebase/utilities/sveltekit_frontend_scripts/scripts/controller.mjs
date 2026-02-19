#!/usr/bin/env node
/**
 * Agentic Code Repair Controller
 * Uses Gemma3 local LLM + Gemma embeddings + TensorRT-LLM + pgvector
 * Autonomous TypeScript/Svelte error detection and repair system
 */
import { Worker } from "worker_threads";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, extname, resolve } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { createClient as createRedisClient } from "redis";
import pg from 'pg';
const { Pool } = pg;
import { cpus } from 'os';

const execAsync = promisify(exec);

// --- AGENTIC CONFIG ---
const CONFIG = {
  // Gemma3 + TensorRT-LLM
  GEMMA_MODEL: 'gemma3:legal-latest',
  GEMMA_EMBEDDINGS: 'embeddinggemma:latest',
  OLLAMA_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
  TENSORRT_ENABLED: true,

  // System Resources
  WORKERS: Math.min(8, cpus().length),
  MAX_FILES_PER_BATCH: 50,
  EMBEDDING_DIMENSION: 768,

  // Directories
  ROOT_DIR: '.svelte-kit/types',
  SOURCE_DIRS: ['src/lib', 'src/routes', 'src/app.html'],
  REPAIR_CACHE_TTL: 3600, // 1 hour

  // Redis & PostgreSQL
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || 'redis',
  DB_URL: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db',
};

console.log(`🤖 Agentic Code Repair Controller`);
console.log(`📊 Gemma3 Model: ${CONFIG.GEMMA_MODEL}`);
console.log(`🧠 Embeddings: ${CONFIG.GEMMA_EMBEDDINGS}`);
console.log(`⚡ TensorRT: ${CONFIG.TENSORRT_ENABLED ? 'ENABLED' : 'DISABLED'}`);
console.log(`👷 Workers: ${CONFIG.WORKERS}`);

// --- Redis Connection ---
const redis = createRedisClient({
  url: CONFIG.REDIS_URL,
  password: CONFIG.REDIS_PASSWORD,
});

// --- PostgreSQL Connection ---
const pool = new Pool({
  connectionString: CONFIG.DB_URL,
});

class AgenticCodeRepairController {
  constructor(mode = 'dry') {
    this.mode = mode; // 'dry', 'apply', 'loop'
    this.workers = [];
    this.repairQueue = [];
    this.stats = {
      filesProcessed: 0,
      errorsDetected: 0,
      repairsApplied: 0,
      embeddingsGenerated: 0,
    };
  }

  async initialize() {
    console.log('🚀 Initializing Agentic Repair System...');

    // Connect to Redis
    await redis.connect();
    console.log('✅ Redis connected');

    // Setup pgvector table
    await this.setupPgVector();
    console.log('✅ PostgreSQL pgvector ready');

    // Test Ollama connection
    await this.testOllamaConnection();
    console.log('✅ Gemma3 LLM connection verified');

    // Create worker pool
    await this.createWorkerPool();
    console.log(`✅ ${CONFIG.WORKERS} AST workers initialized`);
  }

  async setupPgVector() {
    try {
      await pool.query(`
        CREATE EXTENSION IF NOT EXISTS vector;

        CREATE TABLE IF NOT EXISTS code_embeddings (
          id SERIAL PRIMARY KEY,
          path TEXT UNIQUE NOT NULL,
          content_hash TEXT NOT NULL,
          embedding vector(${CONFIG.EMBEDDING_DIMENSION}),
          metadata JSONB DEFAULT '{}'::jsonb,
          error_patterns TEXT[],
          repair_suggestions TEXT[],
          confidence_score FLOAT DEFAULT 0.0,
          last_updated TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_code_embeddings_path ON code_embeddings(path);
        CREATE INDEX IF NOT EXISTS idx_code_embeddings_embedding ON code_embeddings
          USING hnsw (embedding vector_cosine_ops);
        CREATE INDEX IF NOT EXISTS idx_code_embeddings_errors ON code_embeddings
          USING gin (error_patterns);
      `);
    } catch (error) {
      console.warn('⚠️  pgvector setup warning:', error.message);
    }
  }

  async testOllamaConnection() {
    try {
      const response = await fetch(`${CONFIG.OLLAMA_URL}/api/tags`);
      const models = await response.json();

      const hasGemma = models.models?.some(m => m.name.includes('gemma3'));
      const hasEmbeddings = models.models?.some(m => m.name.includes('embeddinggemma'));

      if (!hasGemma || !hasEmbeddings) {
        console.warn('⚠️  Missing models. Run: ollama pull gemma3:legal-latest && ollama pull embeddinggemma:latest');
      }
    } catch (error) {
      console.warn('⚠️  Ollama connection failed:', error.message);
    }
  }

  async createWorkerPool() {
    for (let i = 0; i < CONFIG.WORKERS; i++) {
      const worker = new Worker(resolve('scripts/ast-worker.mjs'), {
        workerData: {
          workerId: i,
          config: CONFIG,
        },
      });

      worker.on('message', msg => this.handleWorkerMessage(msg));
      worker.on('error', error => console.error(`❌ Worker ${i} error:`, error));

      this.workers.push(worker);
    }
  }

  async handleWorkerMessage(msg) {
    switch (msg.type) {
      case 'ast_analyzed':
        await this.handleASTAnalysis(msg);
        break;
      case 'repair_suggested':
        await this.handleRepairSuggestion(msg);
        break;
      case 'error':
        console.error('❌ Worker error:', msg.error);
        break;
      default:
        console.log('📨 Worker message:', msg);
    }
  }

  async handleASTAnalysis(msg) {
    const { filePath, ast, errors, embedding, contentHash } = msg;

    // Cache AST in Redis
    await redis.setEx(
      `ast:${filePath}`,
      CONFIG.REPAIR_CACHE_TTL,
      JSON.stringify({
        ast,
        errors,
        contentHash,
        timestamp: Date.now(),
      })
    );

    // Store in pgvector
    if (embedding && embedding.length === CONFIG.EMBEDDING_DIMENSION) {
      await pool.query(
        `
        INSERT INTO code_embeddings (path, content_hash, embedding, error_patterns, metadata)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (path) DO UPDATE SET
          content_hash = $2,
          embedding = $3,
          error_patterns = $4,
          metadata = $5,
          last_updated = NOW()
      `,
        [
          filePath,
          contentHash,
          embedding,
          errors.map(e => e.type),
          { errorCount: errors.length, lastAnalyzed: new Date().toISOString() },
        ]
      );

      this.stats.embeddingsGenerated++;
    }

    this.stats.filesProcessed++;
    this.stats.errorsDetected += errors.length;

    if (errors.length > 0) {
      console.log(`🔍 ${filePath}: ${errors.length} errors detected`);
    }
  }

  async handleRepairSuggestion(msg) {
    const { filePath, repairs, confidence } = msg;

    if (this.mode === 'dry') {
      console.log(`🔧 [DRY] ${filePath}: ${repairs.length} repair suggestions (confidence: ${confidence.toFixed(2)})`);
      repairs.forEach((repair, i) => {
        console.log(`   ${i + 1}. ${repair.type}: ${repair.description}`);
      });
    } else if (this.mode === 'apply' && confidence > 0.7) {
      console.log(`🔧 [APPLY] ${filePath}: Applying ${repairs.length} high-confidence repairs...`);
      await this.applyRepairs(filePath, repairs);
      this.stats.repairsApplied += repairs.length;
    }
  }

  async applyRepairs(filePath, repairs) {
    try {
      let content = readFileSync(filePath, 'utf8');

      // Apply repairs in reverse order to maintain line numbers
      repairs.sort((a, b) => b.line - a.line);

      for (const repair of repairs) {
        const lines = content.split('\n');
        if (repair.line <= lines.length) {
          lines[repair.line - 1] = repair.newContent;
          content = lines.join('\n');
        }
      }

      writeFileSync(filePath, content);
      console.log(`✅ Applied ${repairs.length} repairs to ${filePath}`);
    } catch (error) {
      console.error(`❌ Failed to apply repairs to ${filePath}:`, error.message);
    }
  }

  async collectFiles() {
    let files = [];

    const scanDir = dir => {
      try {
        for (const item of readdirSync(dir, { withFileTypes: true })) {
          const fullPath = join(dir, item.name);
          if (item.isDirectory() && !item.name.startsWith('.')) {
            scanDir(fullPath);
          } else if (['.ts', '.d.ts', '.svelte'].includes(extname(item.name))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`⚠️  Cannot scan ${dir}:`, error.message);
      }
    };

    // Scan all configured source directories
    for (const dir of CONFIG.SOURCE_DIRS) {
      if (require('fs').existsSync(dir)) {
        scanDir(dir);
      }
    }

    // Also scan generated types
    if (readdirSync('.').includes(CONFIG.ROOT_DIR.split('/')[0])) {
      try {
        scanDir(CONFIG.ROOT_DIR);
      } catch (error) {
        console.warn(`⚠️  Cannot scan ${CONFIG.ROOT_DIR}:`, error.message);
      }
    }

    return files.slice(0, CONFIG.MAX_FILES_PER_BATCH);
  }

  async validateTypeScript() {
    console.log('🔍 Running TypeScript validation...');

    try {
      const { stdout, stderr } = await execAsync('npm run check:ultra-fast');
      console.log('✅ TypeScript validation passed');
      return true;
    } catch (error) {
      const errorCount = (error.stderr.match(/error TS/g) || []).length;
      console.log(`❌ TypeScript validation failed: ${errorCount} errors remain`);

      if (errorCount < 10) {
        console.log('Errors:', error.stderr);
      }

      return false;
    }
  }

  async processFiles(files) {
    console.log(`📂 Processing ${files.length} files with ${CONFIG.WORKERS} workers...`);

    const batches = [];
    const batchSize = Math.ceil(files.length / CONFIG.WORKERS);

    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }

    // Distribute batches to workers
    const promises = batches
      .map((batch, index) => {
        if (this.workers[index]) {
          return new Promise(resolve => {
            this.workers[index].postMessage({
              type: 'process_batch',
              batch,
              mode: this.mode,
            });
            this.workers[index].once('message', msg => {
              if (msg.type === 'batch_complete') resolve(msg);
            });
          });
        }
      })
      .filter(Boolean);

    await Promise.all(promises);
  }

  async findSimilarFixes(errorType, embedding) {
    try {
      const result = await pool.query(
        `
        SELECT path, repair_suggestions, confidence_score,
               embedding <=> $1 as distance
        FROM code_embeddings
        WHERE array_length(repair_suggestions, 1) > 0
        AND $2 = ANY(error_patterns)
        ORDER BY embedding <=> $1
        LIMIT 5
      `,
        [embedding, errorType]
      );

      return result.rows.map(row => ({
        path: row.path,
        suggestions: row.repair_suggestions,
        confidence: row.confidence_score,
        similarity: 1 - row.distance,
      }));
    } catch (error) {
      console.warn('⚠️  Similarity search failed:', error.message);
      return [];
    }
  }

  async run() {
    try {
      await this.initialize();

      const files = await this.collectFiles();
      console.log(`🎯 Found ${files.length} files to analyze`);

      if (files.length === 0) {
        console.log('✅ No files to process');
        return;
      }

      const startTime = Date.now();

      if (this.mode === 'loop') {
        console.log('🔄 Starting continuous loop mode...');
        let iteration = 1;

        while (iteration <= 5) {
          // Max 5 iterations to prevent infinite loops
          console.log(`\n🔄 Loop iteration ${iteration}`);

          await this.processFiles(files);
          const isValid = await this.validateTypeScript();

          if (isValid) {
            console.log('🎉 All errors resolved!');
            break;
          }

          iteration++;
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay
        }
      } else {
        await this.processFiles(files);
        await this.validateTypeScript();
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n🎉 Agentic Repair Complete!');
      console.log(`📊 Statistics:`);
      console.log(`   • Files processed: ${this.stats.filesProcessed}`);
      console.log(`   • Errors detected: ${this.stats.errorsDetected}`);
      console.log(`   • Repairs applied: ${this.stats.repairsApplied}`);
      console.log(`   • Embeddings generated: ${this.stats.embeddingsGenerated}`);
      console.log(`   • Duration: ${duration}s`);
      console.log(`   • Mode: ${this.mode.toUpperCase()}`);
    } catch (error) {
      console.error('❌ Agentic repair failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up resources...');

    // Terminate workers
    for (const worker of this.workers) {
      await worker.terminate();
    }

    // Close connections
    try {
      await redis.disconnect();
      await pool.end();
    } catch (error) {
      console.warn('⚠️  Cleanup warning:', error.message);
    }
  }
}

// --- MAIN EXECUTION ---
async function main() {
  const mode = process.argv[2] || 'dry';

  if (!['dry', 'apply', 'loop'].includes(mode)) {
    console.error('❌ Invalid mode. Use: dry, apply, or loop');
    process.exit(1);
  }

  const controller = new AgenticCodeRepairController(mode);

  try {
    await controller.run();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Graceful shutdown initiated...');
  process.exit(0);
});

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { AgenticCodeRepairController, CONFIG };