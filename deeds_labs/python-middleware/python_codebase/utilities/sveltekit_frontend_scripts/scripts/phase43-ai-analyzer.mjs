#!/usr/bin/env node
/**
 * Phase 43 GPU-Accelerated Embedding Analyzer
 *
 * Features:
 * - Streams JSON logs in 1k-10k chunks
 * - Redis tensor cache (avoids redundant GPU calls)
 * - embeddinggemma:latest via Ollama
 * - Qdrant vector storage with tags
 * - Progress bars for 20min+ batches
 * - Resumable processing with checkpoints
 * - JSONL output for LLM consumption
 *
 * Usage:
 *   node scripts/phase43-ai-analyzer.mjs <log-file> [--batch-size 1000] [--resume]
 */

import { createReadStream } from 'fs';
import { appendFileSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { createClient } from 'redis';
import { QdrantClient } from '@qdrant/js-client-rest';
import PQueueModule from 'p-queue';
const resolvePQueueCtor = (mod) => mod?.default?.default ?? mod?.default ?? mod?.PQueue ?? mod;
const PQueue = resolvePQueueCtor(PQueueModule);
if (typeof PQueue !== "function") {
  throw new Error(
    "'p-queue' did not export a constructor (default or named). Please check installed package version."
  );
}
import { createHash } from "crypto";

// Simple progress tracker (cli-progress is CommonJS only)
class SimpleProgress {
  constructor() {
    this.current = 0;
    this.total = 0;
  }
  start(total) {
    this.total = total;
    console.log(`📊 Processing ${total} items...`);
  }
  increment() {
    this.update(this.current + 1);
  }
  update(current) {
    this.current = current;
    if (current % 100 === 0)
      process.stdout.write(
        `\r⏳ Progress: ${current}/${this.total} (${((current / this.total) * 100).toFixed(1)}%)`
      );
  }
  stop() {
    console.log(`\n✅ Complete: ${this.current}/${this.total}`);
  }
}

// Configuration
const config = {
  batchSize: parseInt(process.env.BATCH_SIZE || "500", 10),
  concurrency: parseInt(process.env.CONCURRENCY || "8", 10),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  qdrantUrl: process.env.QDRANT_URL || "http://localhost:6333",
  ollamaUrl: process.env.OLLAMA_URL || "http://localhost:11434",
  // Optional override if you run a dedicated GPU-backed embedding service
  embeddingServiceUrl:
    process.env.EMBEDDING_GPU_SERVICE_URL || process.env.OLLAMA_URL || "http://localhost:11434",
  // Optional: hint to the analyzer (and recommended env) for Ollama GPU layers
  ollamaGpuLayers: process.env.OLLAMA_GPU_LAYERS || "25",
  embeddingModel: "embeddinggemma:latest",
  embeddingDim: parseInt(process.env.EMBED_DIM || "768", 10),
  cacheTTL: 7 * 24 * 60 * 60, // 7 days
  outputDir: "logs/phase43",
  collectionName: "error_embeddings",
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function alignVectorSize(vector, targetSize) {
  if (vector.length === targetSize) {
    return vector;
  }

  if (vector.length > targetSize) {
    return vector.slice(0, targetSize);
  }

  return vector.concat(new Array(targetSize - vector.length).fill(0));
}

// Parse CLI arguments
const args = parseArgs();
config.batchSize = args.batchSize || config.batchSize;

class GPUEmbeddingAnalyzer {
  constructor() {
    this.redis = null;
    this.qdrant = null;
    this.queue = new PQueue({ concurrency: config.concurrency });
    this.stats = {
      total: 0,
      processed: 0,
      cached: 0,
      embedded: 0,
      errors: 0,
      startTime: Date.now(),
    };
    this.checkpoint = null;
    this.progressBar = null;
    this.dimMismatchWarned = false;
  }

  async initialize() {
    console.log("🚀 Phase 43 GPU Embedding Analyzer Initializing...\n");

    // Connect to Redis
    console.log("📡 Connecting to Redis...");
    this.redis = createClient({ url: config.redisUrl });
    await this.redis.connect();
    console.log("✅ Redis connected");

    // Connect to Qdrant
    console.log("📡 Connecting to Qdrant...");
    this.qdrant = new QdrantClient({ url: config.qdrantUrl });

    // Probe embedding dimension from Ollama to avoid silent mismatches
    await this.detectEmbeddingDim();
    // Probe Ollama for GPU availability and provide guidance if it's not using GPU
    await this.detectOllamaGpu();
    await this.ensureQdrantCollection();
    console.log("✅ Qdrant collection ready");

    // Create output directory
    const { mkdirSync } = await import("fs");
    mkdirSync(config.outputDir, { recursive: true });

    // Load checkpoint if resuming
    if (args.resume) {
      this.loadCheckpoint();
    }

    console.log("\n⚙️  Configuration:");
    console.log(`  • Batch Size: ${config.batchSize}`);
    console.log(`  • Concurrency: ${config.concurrency}`);
    console.log(`  • Model: ${config.embeddingModel}`);
    console.log(`  • Cache TTL: ${config.cacheTTL / 86400} days\n`);
  }

  async detectOllamaGpu() {
    // Try to detect whether the Ollama server is configured to use GPU layers.
    // Ollama's HTTP API doesn't expose a stable "gpu" flag across versions,
    // so we use a best-effort approach: hit /api/version and look for clues,
    // then fall back to checking the local env var hint `OLLAMA_GPU_LAYERS`.
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(`${config.ollamaUrl}/api/version`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.ok) {
        let body = null;
        try {
          body = await resp.json().catch(() => null);
        } catch (e) {
          body = null;
        }

        // Heuristic checks
        const versionText = body?.version || body?.version_string || String(body || "");
        const bodyStr = JSON.stringify(body || "");

        const looksLikeGpu = /cuda|gpu|nvidia|rocm/i.test(bodyStr + versionText);

        if (looksLikeGpu) {
          console.log(`✅ Ollama appears to be GPU-enabled (probe: ${config.ollamaUrl}).`);
          return;
        }
      }
    } catch (err) {
      // ignore probe errors — we will still check env hints below
    }

    // If we reach here, we couldn't confirm GPU usage via the HTTP probe.
    if (config.ollamaGpuLayers) {
      console.log(
        `⚠️ Ollama GPU layers hint detected via env: OLLAMA_GPU_LAYERS=${config.ollamaGpuLayers}. ` +
          `If embeddings still run on CPU, ensure the Ollama process was started with this variable set and that the host has a CUDA-capable GPU.`
      );
      return;
    }

    // No GPU detected / hinted — provide actionable guidance.
    console.warn(`⚠️ Ollama does not appear to be GPU-enabled (or probe inconclusive).`);
    console.warn(
      `  • If you run Ollama locally and have an NVIDIA GPU, restart Ollama with CUDA enabled. Example:`
    );
    console.warn(`      $env:OLLAMA_GPU_LAYERS='25'           # PowerShell (Windows)`);
    console.warn(`      OLLAMA_GPU_LAYERS=25 ollama serve    # Unix-like shells`);
    console.warn(`  • Or run the helper script:`);
    console.warn(
      `      pwsh -NoProfile -File scripts/start-ollama-gpu.ps1  # or use the VS Code task`
    );
    console.warn(`  • Or set the environment variable for this process before running Phase43:`);
    console.warn(
      `      $env:OLLAMA_GPU_LAYERS='25'; node scripts/phase43-ai-analyzer.mjs <log-file>`
    );
    console.warn(
      `  • If you prefer a dedicated GPU embedding service, set EMBEDDING_GPU_SERVICE_URL to a local GPU-backed endpoint and restart.`
    );
    console.warn(
      `  • See README or docs for more deployment details. For now the analyzer will continue but embeddings may be CPU-backed and slower.`
    );
  }

  async ensureQdrantCollection() {
    try {
      const collections = await this.qdrant.getCollections();
      const existsEntry = collections.collections.find((c) => c.name === config.collectionName);

      if (!existsEntry) {
        console.log(
          `📝 Creating Qdrant collection: ${config.collectionName} (vectors.size=${config.embeddingDim})`
        );
        await this.qdrant.createCollection(config.collectionName, {
          vectors: {
            size: config.embeddingDim,
            distance: "Cosine",
          },
        });

        // Create payload indexes for fast filtering
        await this.qdrant.createPayloadIndex(config.collectionName, {
          field_name: "error_code",
          field_schema: "keyword",
        });

        await this.qdrant.createPayloadIndex(config.collectionName, {
          field_name: "file",
          field_schema: "keyword",
        });
      } else {
        // If collection exists, check vector size and warn if different
        try {
          const existingSize = existsEntry.vectors?.size ?? existsEntry.config?.vectors?.size;
          if (existingSize && existingSize !== config.embeddingDim) {
            console.warn(
              `⚠️ Qdrant collection '${config.collectionName}' exists with vectors.size=${existingSize} but config.embeddingDim=${config.embeddingDim}. This may cause upsert inconsistencies.`
            );
          }
        } catch (err) {
          // Non-fatal
        }
      }
    } catch (error) {
      console.error("⚠️  Qdrant collection setup error:", error.message);
    }
  }

  async detectEmbeddingDim() {
    // Probe Ollama embeddings endpoint to detect output vector length
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const resp = await fetch(`${config.embeddingServiceUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.embeddingModel, prompt: "probe" }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        console.warn(`⚠️ Embedding probe failed: ${resp.status} ${body}`);
        return;
      }
      const data = await resp.json().catch(() => null);
      const vec = Array.isArray(data?.embedding) ? data.embedding : [];
      if (vec.length && vec.length !== config.embeddingDim) {
        console.warn(
          `⚠️  Embedding dimension mismatch detected at probe: ${vec.length} (was ${config.embeddingDim}). Updating config.embeddingDim to ${vec.length}`
        );
        config.embeddingDim = vec.length;
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn("⚠️ Embedding probe failed:", msg);

      if (/ECONNREFUSED|Failed to connect|connect ECONNREFUSED/i.test(msg)) {
        console.warn("  • Could not reach the embedding service at", config.embeddingServiceUrl);
        console.warn(
          "  • If you are using the Ollama desktop app, run the server API with GPU enabled:"
        );
        console.warn("      OLLAMA_GPU_LAYERS=25 ollama serve   # Unix-like shells");
        console.warn("      $env:OLLAMA_GPU_LAYERS='25'; ollama serve   # PowerShell (Windows)");
        console.warn(
          "  • Or set EMBEDDING_GPU_SERVICE_URL to a GPU-backed endpoint and restart Phase43."
        );
      }
    }
  }

  async processLogFile(logPath) {
    console.log(`📄 Processing log file: ${logPath}\n`);

    // Count total lines
    const totalLines = await this.countLines(logPath);
    this.stats.total = totalLines;

    console.log(`📊 Total lines to process: ${totalLines.toLocaleString()}\n`);

    // Initialize simple progress tracker
    this.progressBar = new SimpleProgress();
    this.progressBar.start(totalLines);

    const mainBar = {
      increment: () => this.progressBar.increment(),
      update: (v) => this.progressBar.update(v),
    };
    const cacheBar = { increment: () => {}, update: () => {} };
    const embedBar = { increment: () => {}, update: () => {} };

    // Stream and batch process
    const fileStream = createReadStream(logPath, { encoding: "utf8" });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let batch = [];
    let batchNum = 0;

    for await (const line of rl) {
      if (!line.trim()) continue;

      batch.push(line);

      if (batch.length >= config.batchSize) {
        await this.processBatch(batch, batchNum, { mainBar, cacheBar, embedBar });
        batch = [];
        batchNum++;

        // Save checkpoint
        this.saveCheckpoint();
      }
    }

    // Process remaining lines
    if (batch.length > 0) {
      await this.processBatch(batch, batchNum, { mainBar, cacheBar, embedBar });
    }

    this.progressBar.stop();

    // Final summary
    this.printSummary();
  }

  async processBatch(lines, batchNum, bars) {
    const batchStartTime = Date.now();
    const batchResults = [];

    const tasks = lines.map((line, i) =>
      this.queue.add(async () => {
        try {
          const result = await this.processLine(line, batchNum * config.batchSize + i);

          if (result.cached) {
            this.stats.cached++;
            bars.cacheBar.increment();
          } else if (result.embedded) {
            this.stats.embedded++;
            bars.embedBar.increment();
          }

          this.stats.processed++;
          bars.mainBar.increment();

          // Update speed
          const elapsed = (Date.now() - this.stats.startTime) / 1000;
          const speed = Math.round(this.stats.processed / elapsed);
          bars.mainBar.update(this.stats.processed, { speed });

          return result;
        } catch (error) {
          this.stats.errors++;
          return { error: error.message };
        }
      })
    );

    const results = await Promise.all(tasks);
    batchResults.push(...results.filter((r) => !r.error));

    // Write batch to JSONL
    const batchFile = `${config.outputDir}/batch-${String(batchNum).padStart(5, "0")}.jsonl`;
    const batchData = batchResults.map((r) => JSON.stringify(r)).join("\n") + "\n";
    appendFileSync(batchFile, batchData);

    // Write progress log
    const progressEntry = {
      batchNum,
      timestamp: new Date().toISOString(),
      processed: this.stats.processed,
      cached: this.stats.cached,
      embedded: this.stats.embedded,
      errors: this.stats.errors,
      batchTime: Date.now() - batchStartTime,
    };

    appendFileSync(`${config.outputDir}/progress.log.json`, JSON.stringify(progressEntry) + "\n");
  }

  async processLine(line, index) {
    // Generate stable ID from line content
    const id = this.generateId(line, index);

    // Check Redis cache
    const cached = await this.getCachedEmbedding(id);
    if (cached) {
      return {
        id,
        cached: true,
        summary: cached.summary,
        timestamp: cached.timestamp,
      };
    }

    // Parse and summarize line
    const parsed = this.parseLine(line, index);
    const summary = this.summarize(parsed);

    // Generate embedding
    const embedding = await this.getEmbedding(summary);

    // Cache in Redis
    await this.cacheEmbedding(id, {
      summary,
      vector: embedding,
      metadata: parsed,
    });

    // Store in Qdrant
    await this.storeInQdrant(id, embedding, {
      ...parsed,
      summary,
    });

    return {
      id,
      embedded: true,
      summary,
      file: parsed.file,
      line: parsed.line,
      errorCode: parsed.errorCode,
      timestamp: new Date().toISOString(),
    };
  }

  generateId(line, index) {
    // Generate a stable integer ID from hash for Qdrant compatibility
    const hash = createHash("sha256").update(line).digest("hex");
    // Convert first 8 hex chars to integer (max ~4 billion)
    const intId = parseInt(hash.substring(0, 8), 16);
    return intId;
  }

  async getCachedEmbedding(id) {
    try {
      const data = await this.redis.hGetAll(`ai:embedding:${id}`);
      if (data && data.vector) {
        return {
          summary: data.summary,
          vector: JSON.parse(data.vector),
          timestamp: data.timestamp,
        };
      }
    } catch (error) {
      // Cache miss
    }
    return null;
  }

  async cacheEmbedding(id, data) {
    // Use UUID format for cache key to match Qdrant ID
    const cachePayload = {
      id: id, // Store the UUID
      summary: data.summary,
      vector: JSON.stringify(data.vector),
      timestamp: new Date().toISOString(),
      file: data.metadata.file || "",
      line: String(data.metadata.line ?? ""),
      errorCode: data.metadata.errorCode || "",
      errorMessage: data.metadata.errorMessage || "",
      tags: JSON.stringify(data.metadata.tags ?? []),
    };

    await this.redis.hSet(`ai:embedding:${id}`, cachePayload);

    // Set expiry
    await this.redis.expire(`ai:embedding:${id}`, config.cacheTTL);

    // Publish event for downstream services (Neo4j graph, analytics, etc.)
    try {
      const channel = process.env.EMBED_EVENTS_CHANNEL || "embeddings.new";
      await this.redis.publish(
        channel,
        JSON.stringify({
          id,
          summary: data.summary,
          file: cachePayload.file,
          line: Number(cachePayload.line) || 0,
          errorCode: cachePayload.errorCode,
          errorMessage: cachePayload.errorMessage,
          tags: data.metadata.tags ?? [],
          emittedAt: new Date().toISOString(),
        })
      );
    } catch (err) {
      console.warn("⚠️ Failed to publish embedding event:", err?.message || err);
    }
  }

  async getEmbedding(text) {
    const payload = {
      model: config.embeddingModel,
      prompt: text.substring(0, 2048), // Limit to model context
    };

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Use AbortController to guard against stalled requests
        const controller = new AbortController();
        const timeoutMs = 30000; // 30s
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(`${config.embeddingServiceUrl}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          console.error(
            `Ollama embeddings non-OK response (status=${response.status}). Body:`,
            bodyText
          );
          throw new Error(
            `Ollama API error: ${response.status}${bodyText ? ` - ${bodyText}` : ""}`
          );
        }

        // Parse response safely and log if shape is unexpected
        let data;
        try {
          data = await response.json();
        } catch (err) {
          const txt = await response.text().catch(() => "<<unreadable body>>");
          console.error("Failed to parse Ollama response as JSON. Body:", txt);
          throw new Error("Invalid JSON from Ollama embeddings endpoint");
        }
        const vector = Array.isArray(data?.embedding) ? data.embedding : [];

        if (!vector.length) {
          console.error("Ollama returned empty embedding vector. Full response:", data);
          throw new Error("Ollama API returned an empty embedding vector");
        }

        const sizedVector = alignVectorSize(vector, config.embeddingDim);

        if (vector.length !== config.embeddingDim && !this.dimMismatchWarned) {
          console.warn(
            `⚠️  Embedding dimension mismatch. Expected ${config.embeddingDim}, received ${vector.length}. Adjust config.embeddingDim to match the model output to avoid padding/truncation.`
          );
          this.dimMismatchWarned = true;
        }

        return sizedVector;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `Embedding generation failed (attempt ${attempt}/${maxAttempts}): ${message}`
        );

        if (attempt < maxAttempts) {
          await delay(500 * attempt);
        }
      }
    }

    // Return zero vector as fallback
    return new Array(config.embeddingDim).fill(0);
  }

  async storeInQdrant(id, vector, payload) {
    try {
      await this.qdrant.upsert(config.collectionName, {
        points: [
          {
            id,
            vector,
            payload: {
              file: payload.file || "",
              line: payload.line || 0,
              error_code: payload.errorCode || "",
              error_message: payload.errorMessage || "",
              summary: payload.summary || "",
              tags: payload.tags || [],
              timestamp: new Date().toISOString(),
            },
          },
        ],
      });
    } catch (error) {
      // Log detailed error for debugging
      if (error.message && !error.message.includes("Bad Request")) {
        console.error("Qdrant upsert detailed error:", error.message);
      }
      // Don't throw - Redis cache is primary, Qdrant is secondary
    }
  }

  parseLine(line, index) {
    // Extract error information from log line
    const fileMatch = line.match(/([^:\s]+\.(ts|svelte|js|mjs)):(\d+):(\d+)/);
    const errorCodeMatch = line.match(/TS(\d+)/);
    const errorMessageMatch = line.match(/Error:\s*(.+?)(?:\(|$)/);

    return {
      index,
      file: fileMatch ? fileMatch[1] : "",
      line: fileMatch ? parseInt(fileMatch[3], 10) : 0,
      column: fileMatch ? parseInt(fileMatch[4], 10) : 0,
      errorCode: errorCodeMatch ? `TS${errorCodeMatch[1]}` : "",
      errorMessage: errorMessageMatch ? errorMessageMatch[1].trim() : line.substring(0, 200),
      raw: line,
      tags: this.extractTags(line),
    };
  }

  extractTags(line) {
    const tags = [];

    if (line.includes("expected")) tags.push("syntax-error");
    if (line.includes("TS1005")) tags.push("missing-token");
    if (line.includes("TS2304")) tags.push("cannot-find-name");
    if (line.includes(".svelte")) tags.push("svelte-file");
    if (line.includes(".ts")) tags.push("typescript-file");
    if (line.includes("import")) tags.push("import-related");
    if (line.includes("type")) tags.push("type-related");

    return tags;
  }

  summarize(parsed) {
    if (parsed.errorCode && parsed.errorMessage) {
      return `${parsed.errorCode}: ${parsed.errorMessage} in ${parsed.file}:${parsed.line}`;
    }
    return parsed.raw.substring(0, 512);
  }

  async countLines(filePath) {
    let count = 0;
    const fileStream = createReadStream(filePath, { encoding: "utf8" });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) count++;
    }

    return count;
  }

  saveCheckpoint() {
    const checkpointData = {
      stats: this.stats,
      timestamp: new Date().toISOString(),
      config,
    };

    writeFileSync(`${config.outputDir}/checkpoint.json`, JSON.stringify(checkpointData, null, 2));
  }

  loadCheckpoint() {
    const checkpointPath = `${config.outputDir}/checkpoint.json`;
    if (existsSync(checkpointPath)) {
      const data = JSON.parse(readFileSync(checkpointPath, "utf8"));
      this.stats = data.stats;
      console.log(`✅ Resumed from checkpoint: ${this.stats.processed} lines processed`);
    }
  }

  printSummary() {
    const duration = (Date.now() - this.stats.startTime) / 1000;
    const speed = Math.round(this.stats.processed / duration);

    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║            PHASE 43 EMBEDDING ANALYSIS COMPLETE        ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");
    console.log("📊 Statistics:");
    console.log(`  • Total lines: ${this.stats.total.toLocaleString()}`);
    console.log(`  • Processed: ${this.stats.processed.toLocaleString()}`);
    console.log(
      `  • Cache hits: ${this.stats.cached.toLocaleString()} (${Math.round((this.stats.cached / this.stats.processed) * 100)}%)`
    );
    console.log(`  • New embeddings: ${this.stats.embedded.toLocaleString()}`);
    console.log(`  • Errors: ${this.stats.errors}`);
    console.log(`\n⏱️  Performance:`);
    console.log(`  • Duration: ${Math.round(duration)}s (${(duration / 60).toFixed(1)} min)`);
    console.log(`  • Speed: ${speed} lines/sec`);
    console.log(`\n📁 Output:`);
    console.log(`  • Batches: ${config.outputDir}/batch-*.jsonl`);
    console.log(`  • Progress: ${config.outputDir}/progress.log.json`);
    console.log(`  • Checkpoint: ${config.outputDir}/checkpoint.json`);
    console.log("\n✅ Ready for LLM consumption or Phase 44 tensor operations\n");
  }

  async cleanup() {
    if (this.redis) {
      await this.redis.disconnect();
    }
  }
}

function parseArgs() {
  const args = {
    logFile: process.argv[2] || "svelte-check-fronten1d.log",
    batchSize: null,
    resume: false,
  };

  for (let i = 3; i < process.argv.length; i++) {
    if (process.argv[i] === "--batch-size" && process.argv[i + 1]) {
      args.batchSize = parseInt(process.argv[++i], 10);
    } else if (process.argv[i] === "--resume") {
      args.resume = true;
    }
  }

  return args;
}

// Main execution
async function main() {
  const analyzer = new GPUEmbeddingAnalyzer();

  try {
    await analyzer.initialize();
    await analyzer.processLogFile(args.logFile);
  } catch (error) {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  } finally {
    await analyzer.cleanup();
  }
}

main();
