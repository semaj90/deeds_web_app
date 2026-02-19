#!/usr/bin/env node
/**
 * Worker-based codemod runner for parallel processing
 * Runs fix-imports.js and fix-types.js in worker threads for performance
 */

import { Worker } from "node:worker_threads";
import { glob } from "glob";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../").replace(/\\/g, '/');

// Configuration
const MAX_WORKERS = 8;
const CODEMODS = {
  imports: path.join(__dirname, "fix-imports.js"),
  types: path.join(__dirname, "fix-types.js")
};

// Collect files
console.log("🔍 Scanning for TypeScript and Svelte files...");
console.log(`Root directory: ${ROOT}`);

const files = await glob(`${ROOT}/src/**/*.{ts,svelte,js}`, {
  ignore: ["**/node_modules/**", "**/build/**", "**/.svelte-kit/**", "**/dist/**", "**/.backup/**"],
  windowsPathsNoEscape: true
});

console.log(`Found ${files.length} files to process`);

// Worker pool manager
class WorkerPool {
  constructor(scriptPath, maxWorkers = MAX_WORKERS) {
    this.scriptPath = scriptPath;
    this.maxWorkers = maxWorkers;
    this.queue = [];
    this.activeWorkers = 0;
    this.results = [];
  }

  async processFile(file) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.scriptPath, {
        workerData: { file }
      });

      worker.on("message", (msg) => {
        this.results.push(msg);
        resolve(msg);
      });

      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }

  async run(files) {
    const chunks = [];
    for (let i = 0; i < files.length; i += this.maxWorkers) {
      chunks.push(files.slice(i, i + this.maxWorkers));
    }

    let processed = 0;
    for (const chunk of chunks) {
      await Promise.all(chunk.map(f => this.processFile(f)));
      processed += chunk.length;
      if (processed % 100 === 0) {
        console.log(`Progress: ${processed}/${files.length}`);
      }
    }

    return this.results;
  }
}

// Run codemods in sequence
async function runCodemod(name, scriptPath, files) {
  console.log(`\n🔧 Running ${name} codemod...`);
  const pool = new WorkerPool(scriptPath);
  const results = await pool.run(files);
  
  const modified = results.filter(r => r.startsWith("✔")).length;
  const unchanged = results.filter(r => r.startsWith("·")).length;
  
  console.log(`   Modified: ${modified}, Unchanged: ${unchanged}`);
  return { name, modified, unchanged };
}

// Execute all codemods
const startTime = Date.now();
const summary = {
  timestamp: new Date().toISOString(),
  filesScanned: files.length,
  codemods: []
};

try {
  // Run imports codemod
  const importsResult = await runCodemod("fix-imports", CODEMODS.imports, files);
  summary.codemods.push(importsResult);

  // Run types codemod
  const typesResult = await runCodemod("fix-types", CODEMODS.types, files);
  summary.codemods.push(typesResult);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  summary.duration = parseFloat(duration);
  summary.totalModified = summary.codemods.reduce((sum, c) => sum + c.modified, 0);

  // Save summary
  const summaryPath = path.join(ROOT, `worker-codemods-summary-${Date.now()}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\n✅ Worker codemods complete in ${duration}s`);
  console.log(`   Total files modified: ${summary.totalModified}`);
  console.log(`   Summary: ${summaryPath}`);

} catch (error) {
  console.error(`❌ Error running codemods: ${error.message}`);
  process.exit(1);
}
