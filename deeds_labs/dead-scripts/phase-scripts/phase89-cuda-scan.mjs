#!/usr/bin/env node

/**
 * Phase 89: CUDA Pattern Scanner (Ripgrep-Based)
 * ============================================
 *
 * Fast, deterministic CUDA kernel/launch detection using ripgrep
 *
 * Features:
 * - Ripgrep pattern matching for CUDA keywords
 * - Tag extraction (kernel launches, shared memory, device functions)
 * - Results stored in Redis + PostgreSQL
 * - No embeddings required (text-first approach)
 *
 * Usage:
 *   node scripts/phase89-cuda-scan.mjs [--path ./src]
 *   node scripts/phase89-cuda-scan.mjs --help
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import pg from 'pg';
import { redisFromEnv, setJson, sha256 } from './lib/phase89-cache.mjs';
import { cudaTags, isCudaFile } from './lib/phase89-cuda-tags.mjs';

const { Pool } = pg;

// ============================================================
// Configuration
// ============================================================
const CONFIG = {
  postgres: {
    host: 'localhost',
    port: 5434,
    database: 'legal',
    user: 'user',
    password: 'pass'
  },
  redis: {
    host: 'localhost',
    port: 6379
  },
  ripgrep: {
    patterns: [
      '__global__',
      '__device__',
      '__host__',
      'cudaMalloc',
      'cudaMemcpy',
      'cudaLaunch',
      'kernel<<<',
      '__shared__',
      'blockIdx',
      'threadIdx',
      'atomicAdd',
      'syncthreads'
    ],
    fileExtensions: ['.cu', '.cuh', '.cpp', '.cc', '.h', '.hpp'],
    excludeDirs: ['node_modules', '.git', 'dist', 'build']
  },
  scan: {
    defaultPath: './src',
    maxFileSize: 1024 * 1024 * 5 // 5MB
  }
};

// ============================================================
// Helpers
// ============================================================
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    path: CONFIG.scan.defaultPath,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help' || args[i] === '-h') {
      config.help = true;
    } else if (args[i] === '--path' && args[i + 1]) {
      config.path = args[i + 1];
      i++;
    }
  }

  return config;
}

function showHelp() {
  console.log(`
🔍 Phase 89: CUDA Pattern Scanner
==================================

Usage:
  node scripts/phase89-cuda-scan.mjs [options]

Options:
  --path <dir>    Directory to scan (default: ./src)
  --help, -h      Show this help message

Examples:
  node scripts/phase89-cuda-scan.mjs
  node scripts/phase89-cuda-scan.mjs --path ./cuda-kernels
  `);
}

async function ripgrepSearch(pattern, path, extensions, excludeDirs) {
  return new Promise((resolve, reject) => {
    const args = [
      '--no-heading',
      '--line-number',
      '--color=never',
      '--type-add', `cuda:*{${extensions.join(',')}}`,
      '--type', 'cuda',
      ...excludeDirs.flatMap(dir => ['--glob', `!${dir}/**`]),
      pattern,
      path
    ];

    const proc = spawn('rg', args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 || code === 1) {
        // code 1 = no matches (normal)
        resolve(stdout);
      } else {
        reject(new Error(`ripgrep failed: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

function parseRipgrepOutput(output) {
  const lines = output.split('\n').filter(l => l.trim());
  const results = [];

  for (const line of lines) {
    // Format: "path/to/file.cu:123:matched line content"
    const match = line.match(/^([^:]+):(\d+):(.*)$/);
    if (match) {
      const [, filePath, lineNumber, content] = match;
      results.push({
        filePath: filePath.replace(/\\/g, '/'),
        lineNumber: parseInt(lineNumber, 10),
        content: content.trim()
      });
    }
  }

  return results;
}

async function readFileChunk(filePath, lineNumber, contextLines = 5) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, lineNumber - contextLines - 1);
    const end = Math.min(lines.length, lineNumber + contextLines);
    return lines.slice(start, end).join('\n');
  } catch (err) {
    return null;
  }
}

// ============================================================
// Database Setup
// ============================================================
async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS phase89_cuda_patterns (
      id SERIAL PRIMARY KEY,
      file_path TEXT NOT NULL,
      line_number INT NOT NULL,
      pattern TEXT NOT NULL,
      matched_content TEXT NOT NULL,
      context TEXT,
      tags TEXT[],
      hash TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_cuda_file_path ON phase89_cuda_patterns(file_path);
    CREATE INDEX IF NOT EXISTS idx_cuda_pattern ON phase89_cuda_patterns(pattern);
    CREATE INDEX IF NOT EXISTS idx_cuda_tags ON phase89_cuda_patterns USING GIN(tags);
  `);
}

// ============================================================
// Main
// ============================================================
async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  console.log('🔍 Phase 89: CUDA Pattern Scanner');
  console.log('==================================\n');
  console.log(`📁 Scanning path: ${args.path}`);
  console.log(`🔎 Patterns: ${CONFIG.ripgrep.patterns.length} CUDA keywords\n`);

  // Initialize connections
  const db = new Pool(CONFIG.postgres);
  const redis = redisFromEnv();

  try {
    await ensureTable(db);
    console.log('✅ Database ready\n');

    let totalMatches = 0;
    const allResults = [];

    // Search for each pattern
    for (const pattern of CONFIG.ripgrep.patterns) {
      console.log(`🔎 Searching for: ${pattern}`);

      try {
        const output = await ripgrepSearch(
          pattern,
          args.path,
          CONFIG.ripgrep.fileExtensions,
          CONFIG.ripgrep.excludeDirs
        );

        const results = parseRipgrepOutput(output);
        console.log(`   Found ${results.length} matches`);

        for (const result of results) {
          result.pattern = pattern;
        }

        allResults.push(...results);
        totalMatches += results.length;
      } catch (err) {
        console.error(`   ❌ Error searching for ${pattern}:`, err.message);
      }
    }

    console.log(`\n📊 Total matches: ${totalMatches}\n`);

    if (allResults.length === 0) {
      console.log('❌ No CUDA patterns found');
      return; // Exit early, let finally block clean up
    }

    // Process and store results
    console.log('💾 Storing results...\n');
    let stored = 0;
    let skipped = 0;

    for (const result of allResults) {
      const { filePath, lineNumber, pattern, content } = result;

      // Read context
      const context = await readFileChunk(filePath, lineNumber, 5);
      if (!context) {
        skipped++;
        continue;
      }

      // Extract tags
      const tags = isCudaFile(filePath) ? cudaTags(context) : [];

      // Hash for deduplication
      const hash = sha256(`${filePath}:${lineNumber}:${pattern}`);

      // Store in PostgreSQL
      try {
        await db.query(`
          INSERT INTO phase89_cuda_patterns (file_path, line_number, pattern, matched_content, context, tags, hash)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (hash) DO NOTHING
        `, [filePath, lineNumber, pattern, content, context, tags, hash]);

        // Store in Redis (1 day TTL)
        const redisKey = `cuda:${hash}`;
        await setJson(redis, redisKey, {
          filePath,
          lineNumber,
          pattern,
          content,
          context,
          tags
        }, 86400);

        stored++;
      } catch (err) {
        console.error(`   ❌ Error storing ${filePath}:${lineNumber}:`, err.message);
        skipped++;
      }
    }

    console.log(`✅ Stored ${stored} patterns`);
    if (skipped > 0) {
      console.log(`⚠️  Skipped ${skipped} patterns`);
    }

    // Summary
    console.log('\n📊 Summary:');
    console.log(`   Total patterns scanned: ${CONFIG.ripgrep.patterns.length}`);
    console.log(`   Total matches found: ${totalMatches}`);
    console.log(`   Stored in database: ${stored}`);
    console.log(`   Skipped: ${skipped}\n`);

    // Top patterns
    const patternCounts = {};
    for (const result of allResults) {
      patternCounts[result.pattern] = (patternCounts[result.pattern] || 0) + 1;
    }

    const topPatterns = Object.entries(patternCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topPatterns.length > 0) {
      console.log('🔝 Top CUDA Patterns:');
      for (const [pattern, count] of topPatterns) {
        console.log(`   ${pattern}: ${count} occurrences`);
      }
    }

  } finally {
    await db.end();
    await redis.quit();
  }
}

main().catch(console.error);
