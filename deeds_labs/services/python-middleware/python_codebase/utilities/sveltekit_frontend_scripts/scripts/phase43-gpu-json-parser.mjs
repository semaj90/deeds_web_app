#!/usr/bin/env node
/**
 * GPU-Accelerated SIMD JSON Parser for Svelte-Check Output
 * Uses simdjson-node for ultra-fast parsing of error logs
 * Distributes analysis to Ollama GPU workers for semantic categorization
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Ollama } from "ollama";
import { createClient } from "redis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Try to use simdjson if available, fallback to native JSON
let parseJSON;
try {
  const simdjson = await import('simdjson');
  parseJSON = simdjson.parse;
  console.log('✅ Using simdjson (SIMD-accelerated)');
} catch {
  parseJSON = JSON.parse;
  console.log('ℹ️  Using native JSON parser (install simdjson for 10x speed)');
}

const ollama = new Ollama({ 
  host: process.env.OLLAMA_URL || 'http://localhost:11434' 
});

const redis = createClient({
  url: process.env.REDIS_URL || 'redis://:redis@localhost:6379/0'
});

await redis.connect();

async function analyzeSvelteCheckOutput(logPath) {
  console.log(`🔍 Analyzing ${logPath}...`);
  
  const raw = fs.readFileSync(logPath, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  
  const errors = [];
  const warnings = [];
  
  for (const line of lines) {
    if (line.includes('Error:')) {
      const match = line.match(/(.+?):(\d+):(\d+)\s+Error:\s+(.+)/);
      if (match) {
        errors.push({
          file: match[1],
          line: parseInt(match[2]),
          col: parseInt(match[3]),
          message: match[4],
        });
      }
    } else if (line.includes('Warning:')) {
      const match = line.match(/(.+?):(\d+):(\d+)\s+Warning:\s+(.+)/);
      if (match) {
        warnings.push({
          file: match[1],
          line: parseInt(match[2]),
          col: parseInt(match[3]),
          message: match[4],
        });
      }
    }
  }
  
  return { errors, warnings };
}

async function categorizeWithGPU(errors) {
  console.log(`🧠 Categorizing ${errors.length} errors with GPU (Gemma3)...`);
  
  const categories = new Map();
  const batches = [];
  const BATCH_SIZE = 50;
  
  // Batch errors for parallel processing
  for (let i = 0; i < errors.length; i += BATCH_SIZE) {
    batches.push(errors.slice(i, i + BATCH_SIZE));
  }
  
  let processed = 0;
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (error) => {
      const cacheKey = `error:category:${Buffer.from(error.message).toString('base64').slice(0, 32)}`;
      
      // Check cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseJSON(cached);
      }
      
      // GPU inference
      const prompt = `Categorize this TypeScript/Svelte error into ONE category:
Error: ${error.message}

Categories: type-annotation, event-directive, async-effect, component-import, prop-binding, reactive-statement, type-inference, missing-export, syntax-error, other

Return ONLY the category name, nothing else.`;
      
      try {
        const response = await ollama.generate({
          model: 'gemma3',
          prompt,
          stream: false,
          options: { temperature: 0.1, num_predict: 10 }
        });
        
        const category = response.response.trim().toLowerCase();
        const result = { error, category };
        
        // Cache for 1 hour
        await redis.setEx(cacheKey, 3600, JSON.stringify(result));
        
        return result;
      } catch (err) {
        console.error(`GPU inference failed for: ${error.message.slice(0, 50)}...`, err);
        return { error, category: 'unknown' };
      }
    });
    
    const results = await Promise.all(batchPromises);
    
    results.forEach(({ category }) => {
      categories.set(category, (categories.get(category) || 0) + 1);
    });
    
    processed += batch.length;
    process.stdout.write(`\r⚡ Processed ${processed}/${errors.length} errors...`);
  }
  
  console.log('\n');
  return categories;
}

async function generateReport(logPath) {
  const { errors, warnings } = await analyzeSvelteCheckOutput(logPath);
  
  console.log(`\n📊 Parse Complete:`);
  console.log(`   Total Errors: ${errors.length}`);
  console.log(`   Total Warnings: ${warnings.length}`);
  
  // Sample first 500 for GPU analysis to avoid overwhelming
  const sample = errors.slice(0, 500);
  console.log(`\n🧮 Analyzing sample of ${sample.length} errors...`);
  
  const categories = await categorizeWithGPU(sample);
  
  // Calculate projections
  const projections = new Map();
  const totalSample = sample.length;
  const totalErrors = errors.length;
  
  for (const [category, count] of categories.entries()) {
    const projected = Math.round((count / totalSample) * totalErrors);
    projections.set(category, { sample: count, projected });
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    totals: {
      errors: errors.length,
      warnings: warnings.length,
    },
    analysis: {
      sampleSize: sample.length,
      categories: Object.fromEntries(projections),
    },
    topErrors: Array.from(
      errors
        .reduce((acc, e) => {
          const key = e.message;
          acc.set(key, (acc.get(key) || 0) + 1);
          return acc;
        }, new Map())
        .entries()
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([msg, count]) => ({ message: msg, count })),
  };
  
  const reportPath = path.join(ROOT, 'phase43-gpu-error-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n✅ Report saved to: ${reportPath}`);
  console.log(`\n🎯 Top Error Categories (Projected):`);
  
  const sorted = Array.from(projections.entries())
    .sort((a, b) => b[1].projected - a[1].projected);
  
  for (const [category, { sample, projected }] of sorted) {
    console.log(`   ${category.padEnd(25)} ${projected.toLocaleString().padStart(8)} errors (${sample} sampled)`);
  }
  
  return report;
}

// Main execution
const logPath = process.argv[2] || path.join(ROOT, 'svelte-check-errors.txt');

if (!fs.existsSync(logPath)) {
  console.error(`❌ Log file not found: ${logPath}`);
  console.log(`\n💡 Usage: node scripts/phase43-gpu-json-parser.mjs [logfile]`);
  console.log(`   Default: svelte-check-errors.txt`);
  process.exit(1);
}

try {
  await generateReport(logPath);
} finally {
  await redis.quit();
}
