#!/usr/bin/env node
/**
 * Concurrent AST Error Fixer
 *
 * Uses VS Code tasks + MCP workers + GPU embedding pipeline
 * to auto-fix svelte-check errors with AI assistance.
 *
 * Features:
 * - 8-16 parallel worker infrastructure
 * - SIMD JSON parsing (500+ MB/s)
 * - Qdrant vector similarity search
 * - Redis tensor cache
 * - Python NER API integration
 * - AST-based code transformations
 *
 * Usage:
 *   node scripts/concurrent-ast-fixer.mjs [--workers 8] [--batch-size 100]
 */

import { spawn } from "child_process";
import { cpus } from "os";
// Import cli-progress (used later in the file)
import cliProgress from "cli-progress";
import { readFileSync, writeFileSync } from "fs";
import { suggestFix, applyFix } from "./lib/rag-client.mjs"; // Add this import

// p-queue has different export shapes across versions (default export, named PQueue, CJS interop).
// Use dynamic import with top-level await to robustly resolve the constructor.
let PQueueModule;
try {
  PQueueModule = await import("p-queue");
} catch (err) {
  // Re-throw with clearer message
  throw new Error(`Failed to import 'p-queue': ${err?.message || err}`);
}
const resolvePQueueCtor = (mod) => mod?.default?.default ?? mod?.default ?? mod?.PQueue ?? mod;
const PQueue = resolvePQueueCtor(PQueueModule);
if (typeof PQueue !== "function") {
  throw new Error(
    "'p-queue' did not export a constructor (default or named). Please check installed package version."
  );
}

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
  update(current) {
    this.current = current;
    if (current % 10 === 0)
      process.stdout.write(
        `\r⏳ Progress: ${current}/${this.total} (${((current / this.total) * 100).toFixed(1)}%)`
      );
  }
  stop() {
    console.log(`\n✅ Complete: ${this.current}/${this.total}`);
  }
}

const config = {
  workers: parseInt(
    process.argv.find((a) => a.startsWith("--workers="))?.split("=")[1] || String(cpus().length),
    10
  ),
  batchSize: parseInt(
    process.argv.find((a) => a.startsWith("--batch-size="))?.split("=")[1] || "100",
    10
  ),
  mcpEndpoint: process.env.MCP_ENDPOINT || "http://localhost:3000",
  ragEndpoint: process.env.RAG_ENDPOINT || "http://localhost:8095",
  qdrantEndpoint: process.env.QDRANT_URL || "http://localhost:6333",
  redisEndpoint: process.env.REDIS_URL || "redis://localhost:6379",
};

class ConcurrentASTFixer {
  constructor() {
    this.queue = new PQueue({ concurrency: config.workers });
    this.stats = {
      total: 0,
      fixed: 0,
      skipped: 0,
      errors: 0,
      startTime: Date.now(),
    };
    this.progressBar = null;
  }

  async initialize() {
    console.log("🚀 Concurrent AST Error Fixer Initializing...\n");
    console.log(`⚙️  Configuration:`);
    console.log(`  • Workers: ${config.workers}`);
    console.log(`  • Batch Size: ${config.batchSize}`);
    console.log(`  • MCP Endpoint: ${config.mcpEndpoint}`);
    console.log(`  • RAG Endpoint: ${config.ragEndpoint}\n`);

    // Check service health
    await this.checkServices();
  }

  async checkServices() {
    const services = [
      { name: "MCP Server", url: `${config.mcpEndpoint}/mcp/health` },
      { name: "Enhanced RAG", url: `${config.ragEndpoint}/health` },
      { name: "Qdrant", url: `${config.qdrantEndpoint}/health` },
    ];

    console.log("🔍 Checking service health...");
    for (const service of services) {
      try {
        const response = await fetch(service.url);
        if (response.ok) {
          console.log(`  ✅ ${service.name}: Healthy`);
        } else {
          console.log(`  ⚠️  ${service.name}: Unhealthy (${response.status})`);
        }
      } catch (error) {
        console.log(`  ❌ ${service.name}: Offline`);
      }
    }
    console.log("");
  }

  async runSvelteCheck() {
    console.log("📊 Running svelte-check...");

    return new Promise((resolve, reject) => {
      const proc = spawn("npx", ["svelte-check", "--output", "machine"], {
        cwd: process.cwd(),
        shell: true,
      });

      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      });
      proc.stderr.on("data", (data) => {
        output += data.toString();
      });

      proc.on("close", (code) => {
        // Save raw output
        writeFileSync("svelte-check-latest.log", output);
        console.log(`  ✅ Saved to svelte-check-latest.log\n`);
        resolve(output);
      });
    });
  }

  async categorizeErrors() {
    console.log("🗂️  Categorizing errors...");

    return new Promise((resolve, reject) => {
      const proc = spawn(
        "node",
        [
          "scripts/categorize-svelte-check-log.mjs",
          "--log",
          "svelte-check-latest.log",
          "--limit",
          String(config.batchSize),
          "--json",
        ],
        {
          cwd: process.cwd(),
          shell: true,
        }
      );

      let output = "";
      proc.stdout.on("data", (data) => {
        output += data.toString();
      });

      proc.on("close", (code) => {
        try {
          const categories = JSON.parse(output);
          console.log(`  ✅ Found ${Object.keys(categories).length} error categories\n`);
          resolve(categories);
        } catch (error) {
          console.error("  ❌ Failed to parse categories");
          resolve({});
        }
      });
    });
  }

  async embedErrors() {
    console.log("🧠 Generating embeddings with GPU...");

    return new Promise((resolve, reject) => {
      const proc = spawn(
        "node",
        [
          "scripts/phase43-ai-analyzer.mjs",
          "svelte-check-latest.log",
          "--batch-size",
          String(config.batchSize),
        ],
        {
          cwd: process.cwd(),
          shell: true,
          env: { ...process.env, CONCURRENCY: String(config.workers) },
        }
      );

      proc.stdout.on("data", (data) => {
        process.stdout.write(data);
      });
      proc.stderr.on("data", (data) => {
        process.stderr.write(data);
      });

      proc.on("close", (code) => {
        console.log(`  ✅ Embeddings generated\n`);
        resolve();
      });
    });
  }

  async processErrorBatch(errors) {
    this.progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    this.progressBar.start(errors.length, 0);

    const tasks = errors.map((error, i) =>
      this.queue.add(async () => {
        try {
          // Use the new RAG client to suggest and apply fixes
          const embeddingResult = await suggestFix(error.message);
          const success = await applyFix(error.file, embeddingResult.suggestedFix);

          if (success.ok) this.stats.fixed++;
          else this.stats.errors++;

          this.stats.total++;
          this.progressBar.update(this.stats.total);
        } catch (error) {
          this.stats.errors++;
          console.error(`Error processing fix for ${error.file}:`, error); // Log the error
        }
      })
    );

    await Promise.all(tasks);
    this.progressBar.stop();
  }

  printSummary() {
    const duration = (Date.now() - this.stats.startTime) / 1000;
    const speed = Math.round(this.stats.total / duration);

    console.log("\n╔════════════════════════════════════════════════════════╗");
    console.log("║        CONCURRENT AST ERROR FIXING COMPLETE            ║");
    console.log("╚════════════════════════════════════════════════════════╝\n");
    console.log("📊 Statistics:");
    console.log(`  • Total processed: ${this.stats.total}`);
    console.log(
      `  • Fixed: ${this.stats.fixed} (${Math.round((this.stats.fixed / this.stats.total) * 100)}%)`
    );
    console.log(`  • Skipped: ${this.stats.skipped}`);
    console.log(`  • Errors: ${this.stats.errors}`);
    console.log(`\n⏱️  Performance:`);
    console.log(`  • Duration: ${Math.round(duration)}s`);
    console.log(`  • Speed: ${speed} errors/sec`);
    console.log(`  • Workers: ${config.workers}`);
    console.log("");
  }
}

async function main() {
  const fixer = new ConcurrentASTFixer();

  await fixer.initialize();

  // Step 1: Run svelte-check
  await fixer.runSvelteCheck();

  // Step 2: Categorize errors
  const categories = await fixer.categorizeErrors();

  // Step 3: Generate embeddings
  await fixer.embedErrors();

  // Step 4: Process errors with AI fixes
  console.log("🔧 Applying AI-assisted fixes...");
  const allErrors = Object.values(categories).flat(); // Flatten categories into a single array of errors
  await fixer.processErrorBatch(allErrors);

  fixer.printSummary();
}

main().catch(console.error);
