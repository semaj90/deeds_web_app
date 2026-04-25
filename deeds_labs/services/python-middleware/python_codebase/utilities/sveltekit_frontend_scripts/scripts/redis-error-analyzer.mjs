#!/usr/bin/env node
/**
 * Redis-Powered Error Analyzer
 * -----------------------------
 * Scalable error analysis system for handling 100k+ errors
 * Uses Redis for caching and incremental processing
 * 
 * Features:
 * - Batch processing (configurable size)
 * - Parallel execution (multi-core)
 * - Persistent caching (survive crashes)
 * - Incremental updates (only changed files)
 * - Top N error reporting (100, 1000, 10000+)
 * 
 * Usage:
 *   node scripts/redis-error-analyzer.mjs --top 100 --cache-only
 *   node scripts/redis-error-analyzer.mjs --refresh --top 1000
 *   node scripts/redis-error-analyzer.mjs --top 10000 --output errors.json
 */

import Redis from 'ioredis';
import { parseArgs } from 'node:util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import pLimit from 'p-limit';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../src');

// Parse CLI arguments
const { values: args } = parseArgs({
  options: {
    top: { type: 'string', default: '100' },
    output: { type: 'string', default: 'error-analysis.json' },
    'batch-size': { type: 'string', default: '50' },
    parallel: { type: 'string', default: '4' },
    refresh: { type: 'boolean', default: false },
    'cache-only': { type: 'boolean', default: false },
    incremental: { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false }
  }
});

// Configuration
const config = {
  topN: parseInt(args.top),
  output: args.output,
  batchSize: parseInt(args['batch-size']),
  maxParallel: parseInt(args.parallel),
  refresh: args.refresh,
  cacheOnly: args['cache-only'],
  incremental: args.incremental,
  verbose: args.verbose,
  cacheExpiry: 604800, // 7 days
  redisDb: 1 // Dedicated DB for error analysis
};

// Initialize Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  db: config.redisDb,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Statistics
const stats = {
  filesScanned: 0,
  filesProcessed: 0,
  batchesCompleted: 0,
  batchesFailed: 0,
  errorsFound: 0,
  cacheHits: 0,
  cacheMisses: 0,
  startTime: Date.now()
};

// Utility: Walk directory recursively
async function* walkDirectory(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip backup/temp directories
        if (/backup|archive|bak|corrupted|node_modules|\.svelte-kit/.test(entry.name)) {
          continue;
        }
        yield* walkDirectory(fullPath);
      } else if (entry.isFile()) {
        // Only TypeScript and Svelte files
        if (fullPath.endsWith('.ts') || fullPath.endsWith('.svelte')) {
          yield fullPath;
        }
      }
    }
  } catch (err) {
    if (config.verbose) {
      console.warn(`⚠️  Skipping ${dir}: ${err.message}`);
    }
  }
}

// Discover all source files
async function discoverFiles(rootDir) {
  const files = [];
  
  for await (const file of walkDirectory(rootDir)) {
    files.push(file);
  }
  
  stats.filesScanned = files.length;
  return files;
}

// Get modified files (for incremental mode)
async function getModifiedFiles() {
  try {
    const { stdout } = await execFileAsync('git', [
      'diff',
      '--name-only',
      'HEAD~1',
      '--diff-filter=ACMR'
    ]);
    
    return stdout
      .split('\n')
      .filter(f => f.endsWith('.ts') || f.endsWith('.svelte'))
      .map(f => path.resolve(__dirname, '..', f));
  } catch (err) {
    console.warn('⚠️  Git diff failed, falling back to full scan');
    return null;
  }
}

// Split array into chunks
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Parse svelte-check output
function parseErrors(output) {
  const errors = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const error = JSON.parse(line);
      if (error.type === 'error' || error.type === 'warning') {
        errors.push({
          file: error.filename || error.file || 'unknown',
          line: error.start?.line || error.line || 0,
          column: error.start?.column || error.column || 0,
          code: error.code || 'unknown',
          message: error.text || error.message || '',
          severity: error.type || 'error',
          source: 'svelte-check'
        });
      }
    } catch (err) {
      // Not JSON, might be summary line - skip
      if (config.verbose && line.includes('error')) {
        console.log(`  ${line}`);
      }
    }
  }
  
  return errors;
}

// Process a single batch
async function processBatch(files, batchId) {
  const batchKey = `batch:${Date.now()}:${batchId}`;
  const startTime = Date.now();
  
  await redis.hset(batchKey, {
    status: 'processing',
    filesCount: files.length,
    timestamp: startTime
  });
  await redis.expire(batchKey, config.cacheExpiry);
  
  try {
    // Create temporary file list for svelte-check
    const tempFile = path.join(__dirname, `batch-${batchId}.txt`);
    await fs.writeFile(tempFile, files.join('\n'));
    
    // Run svelte-check with machine output
    const { stdout, stderr } = await execFileAsync(
      'npx',
      [
        'svelte-check',
        '--output', 'machine',
        '--workspace', path.resolve(__dirname, '..'),
        '--threshold', 'warning'
      ],
      {
        timeout: 60000, // 60 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=2048'
        }
      }
    ).catch(err => {
      // svelte-check exits with code 1 when errors found
      return { stdout: err.stdout || '', stderr: err.stderr || '' };
    });
    
    // Clean up temp file
    await fs.unlink(tempFile).catch(() => {});
    
    // Parse errors
    const errors = parseErrors(stdout);
    stats.errorsFound += errors.length;
    
    // Cache each error
    for (const error of errors) {
      await cacheError(error);
    }
    
    // Update batch status
    const duration = Date.now() - startTime;
    await redis.hset(batchKey, {
      status: 'completed',
      errorsFound: errors.length,
      duration
    });
    
    stats.batchesCompleted++;
    stats.filesProcessed += files.length;
    
    return {
      batchId,
      files: files.length,
      errors: errors.length,
      duration
    };
    
  } catch (err) {
    await redis.hset(batchKey, {
      status: 'failed',
      error: err.message
    });
    
    stats.batchesFailed++;
    
    if (config.verbose) {
      console.error(`❌ Batch ${batchId} failed:`, err.message);
    }
    
    throw err;
  }
}

// Cache error in Redis
async function cacheError(error) {
  const errorKey = `error:${error.file}:${error.line}:${error.column}`;
  
  // Store error details
  await redis.setex(
    errorKey,
    config.cacheExpiry,
    JSON.stringify(error)
  );
  
  // Update pattern aggregation
  await updatePattern(error);
}

// Update pattern statistics
async function updatePattern(error) {
  const patternKey = `pattern:${error.code}`;
  
  // Atomic increment
  await redis.hincrby(patternKey, 'count', 1);
  
  // Add file to sample (using sorted set with score = timestamp)
  const filesKey = `${patternKey}:files`;
  await redis.zadd(filesKey, Date.now(), error.file);
  await redis.expire(filesKey, config.cacheExpiry);
  
  // Trim to keep only first 100 files
  await redis.zremrangebyrank(filesKey, 100, -1);
  
  // Update metadata
  await redis.hset(patternKey, {
    code: error.code,
    lastSeen: Date.now(),
    severity: error.severity
  });
  await redis.expire(patternKey, config.cacheExpiry * 4); // 28 days for patterns
}

// Process all batches
async function processBatches(files) {
  const batches = chunk(files, config.batchSize);
  const limit = pLimit(config.maxParallel);
  
  console.log(`🔄 Processing ${batches.length} batches (${config.batchSize} files each, ${config.maxParallel} parallel)...\n`);
  
  const results = [];
  let completed = 0;
  
  const promises = batches.map((batch, idx) =>
    limit(async () => {
      const result = await processBatch(batch, idx);
      completed++;
      
      const progress = ((completed / batches.length) * 100).toFixed(1);
      console.log(
        `[${progress}%] Batch ${completed}/${batches.length}: ` +
        `${result.files} files → ${result.errors} errors (${(result.duration / 1000).toFixed(1)}s)`
      );
      
      return result;
    })
  );
  
  const settled = await Promise.allSettled(promises);
  
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    }
  }
  
  return results;
}

// Calculate impact score
function calculateImpact(code, count) {
  // Critical: type errors, parse errors
  if (/ts\(1\d{3}\)|parse-error/.test(code)) {
    return count > 1000 ? 'critical' : 'high';
  }
  
  // High: missing declarations, type mismatches
  if (/ts\(2\d{3}\)|missing-declaration/.test(code)) {
    return count > 500 ? 'high' : 'medium';
  }
  
  // Medium: warnings, accessibility
  if (/warning|a11y/.test(code)) {
    return count > 100 ? 'medium' : 'low';
  }
  
  return 'low';
}

// Assess automation potential
function assessAutomation(code) {
  const highAutomation = [
    'ts(7006)', // missing types → 'unknown'
    'ts(2304)', // missing imports → auto-import
    'event-directive-deprecated', // on:click → onclick
    'a11y-missing-attribute' // add missing attrs
  ];
  
  const mediumAutomation = [
    'ts(2322)', // type mismatch → cast
    'ts(2339)', // missing property → optional
    'missing-declaration' // add declaration
  ];
  
  if (highAutomation.some(pattern => code.includes(pattern))) {
    return 'high';
  }
  if (mediumAutomation.some(pattern => code.includes(pattern))) {
    return 'medium';
  }
  return 'low';
}

// Generate report
async function generateReport(topN) {
  console.log(`\n📊 Generating report for top ${topN} patterns...`);
  
  // Get all pattern keys
  const patternKeys = await redis.keys('pattern:*:*') || [];
  const basePatternKeys = patternKeys
    .filter(k => !k.includes(':files'))
    .slice(0, 10000); // Limit to 10k patterns max
  
  console.log(`Found ${basePatternKeys.length} unique error patterns`);
  
  // Fetch pattern data
  const patterns = [];
  
  for (const key of basePatternKeys) {
    const data = await redis.hgetall(key);
    if (!data.code) continue;
    
    const count = parseInt(data.count || '0');
    const filesKey = `${key}:files`;
    const files = await redis.zrange(filesKey, 0, 9); // Get first 10 files
    
    const impact = calculateImpact(data.code, count);
    const automation = assessAutomation(data.code);
    
    patterns.push({
      code: data.code,
      count,
      severity: data.severity || 'error',
      impact,
      automation,
      priority: calculatePriority(count, impact, automation),
      files: files.slice(0, 10),
      lastSeen: parseInt(data.lastSeen || '0')
    });
  }
  
  // Sort by priority (descending)
  patterns.sort((a, b) => b.priority - a.priority);
  
  return patterns.slice(0, topN);
}

// Calculate priority score (0-100)
function calculatePriority(count, impact, automation) {
  const impactScore = { critical: 40, high: 30, medium: 20, low: 10 };
  const automationScore = { high: 30, medium: 20, low: 10 };
  
  const countScore = Math.min(30, Math.log10(count + 1) * 10);
  
  return Math.round(
    countScore +
    (impactScore[impact] || 10) +
    (automationScore[automation] || 10)
  );
}

// Main execution
async function main() {
  console.log(`🚀 Redis Error Analyzer`);
  console.log(`Mode: ${config.cacheOnly ? 'Cache-Only' : config.incremental ? 'Incremental' : 'Full Scan'}`);
  console.log(`Target: Top ${config.topN} errors`);
  console.log(`Output: ${config.output}\n`);
  
  try {
    // Test Redis connection
    await redis.ping();
    console.log(`✓ Redis connected (DB ${config.redisDb})\n`);
  } catch (err) {
    console.error(`❌ Redis connection failed:`, err.message);
    console.error(`Make sure Redis is running: docker run -d -p 6379:6379 redis:7-alpine`);
    process.exit(1);
  }
  
  let files = [];
  
  if (!config.cacheOnly || config.refresh) {
    console.log(`📁 Scanning source files...`);
    
    if (config.incremental) {
      files = await getModifiedFiles();
      if (!files) {
        files = await discoverFiles(ROOT);
      }
    } else {
      files = await discoverFiles(ROOT);
    }
    
    console.log(`Found ${files.length} files to analyze\n`);
    
    if (files.length > 0) {
      await processBatches(files);
    }
  } else {
    console.log(`Using cached data (no file scanning)\n`);
  }
  
  // Generate report
  const report = await generateReport(config.topN);
  
  // Save report
  const outputPath = path.resolve(__dirname, '..', config.output);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved to ${config.output}`);
  
  // Print summary
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  
  console.log(`\n📈 Summary:`);
  console.log(`Total patterns: ${report.length}`);
  console.log(`Files scanned: ${stats.filesScanned}`);
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Batches completed: ${stats.batchesCompleted}`);
  console.log(`Batches failed: ${stats.batchesFailed}`);
  console.log(`Errors found: ${stats.errorsFound}`);
  console.log(`Elapsed time: ${elapsed}s`);
  
  console.log(`\n🔝 Top 5 errors:`);
  report.slice(0, 5).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.code}: ${p.count} occurrences (${p.impact} impact, ${p.automation} automation)`);
  });
  
  // Close Redis connection
  await redis.quit();
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  redis.quit();
  process.exit(1);
});
