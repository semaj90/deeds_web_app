#!/usr/bin/env node
/**
 * Error Analysis + Redis Consolidation Pipeline
 *
 * Features:
 * 1. Scans TypeScript/Svelte files for errors
 * 2. Logs errors to Redis with categorization
 * 3. Ranks errors by frequency/impact
 * 4. Organizes by error type + file path
 * 5. Generates consolidated reports
 *
 * Usage:
 *   node scripts/error-analysis-redis.mjs --scan    (scan files, log to Redis)
 *   node scripts/error-analysis-redis.mjs --report   (show consolidated report)
 *   node scripts/error-analysis-redis.mjs --top 20   (show top 20 errors)
 *   node scripts/error-analysis-redis.mjs --clear    (clear all Redis data)
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { createClient } from 'redis';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// Redis configuration
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Initialize Redis client with better error handling
let redis = null;

async function connectRedis() {
  try {
    redis = createClient({
      host: REDIS_HOST,
      port: REDIS_PORT,
      socket: { reconnectStrategy: () => 5000 }
    });
    await redis.connect();
    return redis;
  } catch (err) {
    console.error('❌ Redis connection failed:', err.message);
    console.log('ℹ️  Make sure Redis is running on port 6379');
    process.exit(1);
  }
}

// Redis keys
const ERRORS_KEY = 'error:analysis:all';
const ERROR_TYPES_KEY = 'error:analysis:types';
const ERROR_FILES_KEY = 'error:analysis:files';
const ERROR_FREQUENCY_KEY = 'error:analysis:frequency';
const TIMESTAMP = new Date().toISOString();

// ============= MAIN FLOW =============

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || '--scan';

  console.log('\n🚀 Error Analysis + Redis Pipeline');
  console.log(`📝 Mode: ${mode}`);
  console.log(`🔴 Redis: ${REDIS_HOST}:${REDIS_PORT}\n`);

  try {
    // Connect to Redis
    await connectRedis();
    console.log('✅ Connected to Redis\n');

    if (mode === '--scan' || mode === '--analyze') {
      await scanAndAnalyzeErrors();
    } else if (mode === '--report') {
      await generateReport();
    } else if (mode === '--top') {
      const count = parseInt(args[1]) || 20;
      await reportTopErrors(count);
    } else if (mode === '--clear') {
      await clearAnalysis();
    } else if (mode === '--run-check') {
      await runTypeScriptCheck();
    } else if (mode === '--watch') {
      await watchErrors();
    } else {
      console.log('Available modes:');
      console.log('  --scan              Scan files and log errors to Redis');
      console.log('  --analyze           Alias for --scan');
      console.log('  --report            Generate consolidated report');
      console.log('  --top N             Show top N errors by frequency');
      console.log('  --clear             Clear all Redis error data');
      console.log('  --run-check         Run npm check:ultra-fast and log errors');
      console.log('  --watch             Continuously watch for errors (for SSE streaming)');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    if (redis) await redis.quit();
  }
}

// ============= RUN TYPESCRIPT CHECK =============

async function runTypeScriptCheck() {
  console.log('⚙️  Running TypeScript check...\n');

  let output = '';
  try {
    output = execSync('npm run check:ultra-fast 2>&1', { encoding: 'utf8', cwd: rootDir });
  } catch (err) {
    output = err.stdout || err.message || '';
  }

  const errors = parseTypeScriptErrors(output);
  console.log(`✅ Found ${errors.length} TypeScript errors\n`);

  let stored = 0;
  for (const error of errors) {
    await storeErrorInRedis(error, error.file);
    stored++;
  }

  console.log(`💾 Stored ${stored} errors in Redis\n`);

  if (errors.length > 0) {
    console.log('📊 Top error types:');
    const typeCount = {};
    errors.forEach(e => {
      typeCount[e.code] = (typeCount[e.code] || 0) + 1;
    });
    Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([code, count]) => {
        console.log(`   ${code}: ${count}`);
      });
  }

  console.log(`\n📄 Run: node scripts/error-analysis-redis.mjs --report`);
}

// ============= WATCH FOR ERRORS (SSE Compatible) =============

async function watchErrors() {
  console.log('👀 Watching for TypeScript errors...');
  console.log('💡 SSE clients connected to /api/errors/stream will receive updates\n');

  const CHECK_INTERVAL = 10000; // Check every 10 seconds
  let lastErrorCount = 0;

  const watch = setInterval(async () => {
    try {
      let output = '';
      try {
        output = execSync('npm run check:ultra-fast 2>&1', { encoding: 'utf8', cwd: rootDir });
      } catch (err) {
        output = err.stdout || err.message || '';
      }

      const errors = parseTypeScriptErrors(output);

      if (errors.length !== lastErrorCount) {
        console.log(`📝 [${new Date().toLocaleTimeString()}] Found ${errors.length} errors`);
        lastErrorCount = errors.length;
      }

      // Store/update all errors in Redis
      for (const error of errors) {
        await storeErrorInRedis(error, error.file);
      }

      // Log summary to Redis for monitoring
      const summary = {
        timestamp: new Date().toISOString(),
        totalErrors: errors.length,
        timestamp_ms: Date.now()
      };
      await redis.set('error:analysis:watch:latest', JSON.stringify(summary));
    } catch (err) {
      console.error('Watch error:', err.message);
    }
  }, CHECK_INTERVAL);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Stopping error watcher...');
    clearInterval(watch);
    process.exit(0);
  });

  console.log('🔄 Press Ctrl+C to stop\n');
}

// ============= PARSE TYPESCRIPT ERRORS =============

function parseTypeScriptErrors(output) {
  const errors = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (!line.includes('error TS')) continue;

    // Pattern: src/file.ts(10,5): error TS1128: message
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+?)$/);
    if (!match) continue;

    const [, file, lineNum, col, code, message] = match;
    errors.push({
      type: code,
      line: parseInt(lineNum),
      col: parseInt(col),
      code: code,
      message: message.trim().substring(0, 100),
      file: file.trim(),
      timestamp: TIMESTAMP
    });
  }

  return errors;
}

// ============= SCAN AND ANALYZE =============

async function scanAndAnalyzeErrors() {
  console.log('🔍 Scanning files for errors...\n');

  const files = await findTypeScriptFiles();
  console.log(`📂 Found ${files.length} TypeScript files\n`);

  let totalErrors = 0;
  const errorsByType = {};
  const errorsByFile = {};

  for (const file of files) {
    try {
      const errors = await extractErrorsFromFile(file);

      for (const error of errors) {
        totalErrors++;

        // Categorize by type
        if (!errorsByType[error.type]) errorsByType[error.type] = [];
        errorsByType[error.type].push(error);

        // Categorize by file
        const relPath = path.relative(rootDir, file);
        if (!errorsByFile[relPath]) errorsByFile[relPath] = [];
        errorsByFile[relPath].push(error);

        // Store in Redis
        await storeErrorInRedis(error, relPath);
      }
    } catch (err) {
      // Skip files that can't be parsed
    }
  }

  console.log(`✅ Scan complete: ${totalErrors} errors found\n`);
  console.log(`📊 Breakdown by type:`);
  Object.entries(errorsByType)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .forEach(([type, errors]) => {
      console.log(`   ${type}: ${errors.length}`);
    });

  console.log(`\n📁 Top files with errors:`);
  Object.entries(errorsByFile)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .forEach(([file, errors]) => {
      console.log(`   ${file}: ${errors.length}`);
    });

  console.log(`\n💾 Data stored in Redis (key: ${ERRORS_KEY})`);
  console.log(`   Run: node scripts/error-analysis-redis.mjs --report`);
}

// ============= EXTRACT ERRORS FROM FILE =============

async function extractErrorsFromFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const errors = [];
  const lines = content.split('\n');

  // Pattern: TS error patterns
  const patterns = [
    { regex: /Type.*is not assignable to type/i, type: 'TS2322' },
    { regex: /Cannot find name/i, type: 'TS2304' },
    { regex: /Property.*does not exist on type/i, type: 'TS2339' },
    { regex: /Expected.*arguments, but got/i, type: 'TS2554' },
    { regex: /Unterminated string literal/i, type: 'TS1002' },
    { regex: /Expected '}'/i, type: 'TS1128' },
    { regex: /is not a function/i, type: 'TS2349' },
    { regex: /async without await inside/i, type: 'TS1308' },
    { regex: /import type.*from runtime value/i, type: 'TS1373' },
    { regex: /Missing return type/i, type: 'TS7022' }
  ];

  lines.forEach((line, idx) => {
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        errors.push({
          type: pattern.type,
          line: idx + 1,
          code: line.trim().substring(0, 80),
          message: line.trim(),
          file: filePath,
          timestamp: TIMESTAMP
        });
      }
    }
  });

  return errors;
}

// ============= STORE ERROR IN REDIS =============

async function storeErrorInRedis(error, relPath) {
  const errorKey = `${ERRORS_KEY}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;

  // Store complete error object
  await redis.hSet(errorKey, {
    type: error.type,
    line: error.line.toString(),
    code: error.code || error.message,
    file: relPath,
    message: error.message,
    timestamp: error.timestamp
  });

  // Add to sorted set for frequency tracking
  await redis.zIncrBy(ERROR_FREQUENCY_KEY, 1, error.type);

  // Add to type index
  await redis.sAdd(`${ERROR_TYPES_KEY}:${error.type}`, errorKey);

  // Add to file index
  await redis.sAdd(`${ERROR_FILES_KEY}:${relPath}`, errorKey);

  // Set TTL (24 hours)
  await redis.expire(errorKey, 86400);
}

// ============= GENERATE REPORT =============

async function generateReport() {
  console.log('📊 Error Analysis Report\n');

  // Get error frequency
  const typeFreq = await redis.zRevRangeWithScores(ERROR_FREQUENCY_KEY, 0, -1);

  if (typeFreq.length === 0) {
    console.log('ℹ️  No errors logged. Run: node scripts/error-analysis-redis.mjs --run-check');
    return;
  }

  let totalErrors = 0;
  typeFreq.forEach(item => {
    totalErrors += item.score;
  });

  console.log(`📈 Total Errors: ${totalErrors}\n`);
  console.log(`🔴 HIGH PRIORITY (>50 occurrences):`);
  typeFreq.filter(f => f.score > 50).forEach(item => {
    const pct = ((item.score / totalErrors) * 100).toFixed(1);
    console.log(`   ${item.member}: ${item.score} (${pct}%)`);
  });

  console.log(`\n🟡 MEDIUM PRIORITY (10-50 occurrences):`);
  typeFreq.filter(f => f.score >= 10 && f.score <= 50).forEach(item => {
    const pct = ((item.score / totalErrors) * 100).toFixed(1);
    console.log(`   ${item.member}: ${item.score} (${pct}%)`);
  });

  console.log(`\n🟢 LOW PRIORITY (<10 occurrences):`);
  typeFreq.filter(f => f.score < 10).forEach(item => {
    const pct = ((item.score / totalErrors) * 100).toFixed(1);
    console.log(`   ${item.member}: ${item.score} (${pct}%)`);
  });

  // Top files
  console.log(`\n📁 Files with Most Errors:`);
  const fileKeys = await redis.keys(`${ERROR_FILES_KEY}:*`);
  const fileCounts = [];

  for (const key of fileKeys.slice(0, 100)) {
    const members = await redis.sMembers(key);
    const file = key.replace(`${ERROR_FILES_KEY}:`, '');
    fileCounts.push({ file, count: members.length });
  }

  fileCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .forEach(({ file, count }) => {
      console.log(`   ${file}: ${count}`);
    });

  console.log(`\n💾 Run: node scripts/error-analysis-redis.mjs --top 20 (for detailed view)`);
}

// ============= REPORT TOP ERRORS =============

async function reportTopErrors(count) {
  console.log(`🔝 Top ${count} Error Types\n`);

  const typeFreq = await redis.zRevRangeWithScores(ERROR_FREQUENCY_KEY, 0, count - 1);

  if (typeFreq.length === 0) {
    console.log('ℹ️  No errors logged yet.');
    return;
  }

  let totalErrors = 0;
  typeFreq.forEach(item => {
    totalErrors += item.score;
  });

  for (const item of typeFreq) {
    const pct = ((item.score / totalErrors) * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(pct / 2));
    console.log(`${item.member.padEnd(25)} │ ${bar.padEnd(50)} ${item.score} (${pct}%)`);
  }

  console.log(`\nTotal: ${totalErrors} errors`);
}

// ============= CLEAR ANALYSIS =============

async function clearAnalysis() {
  console.log('🧹 Clearing Redis error data...\n');

  await redis.del(ERROR_FREQUENCY_KEY);
  const typeKeys = await redis.keys(`${ERROR_TYPES_KEY}:*`);
  for (const key of typeKeys) {
    await redis.del(key);
  }

  const fileKeys = await redis.keys(`${ERROR_FILES_KEY}:*`);
  for (const key of fileKeys) {
    await redis.del(key);
  }

  const errorKeys = await redis.keys(`${ERRORS_KEY}:*`);
  for (const key of errorKeys) {
    await redis.del(key);
  }

  console.log(`✅ Cleared all error analysis data from Redis`);
}

// ============= UTILITIES =============

async function findTypeScriptFiles() {
  const results = [];

  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          }
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.svelte')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Skip
    }
  }

  await walk(srcDir);
  return results;
}

main().catch(console.error);

main().catch(console.error);

