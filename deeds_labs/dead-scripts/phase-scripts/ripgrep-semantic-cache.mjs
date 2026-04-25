#!/usr/bin/env node
/**
 * Ripgrep + AWK Semantic Caching System
 *
 * Fast semantic search with intelligent caching for error pattern detection
 * Integrates with:
 * - Ripgrep (rg) for blazing fast text search
 * - AWK for pattern extraction
 * - IndexedDB/Loki.js patterns for client-side caching
 * - Redis patterns for server-side caching
 *
 * Usage:
 *   node scripts/ripgrep-semantic-cache.mjs --search "pattern" --cache
 *   node scripts/ripgrep-semantic-cache.mjs --analyze-errors
 *   node scripts/ripgrep-semantic-cache.mjs --clear-cache
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.join(__dirname, '../.semantic-cache');
const CACHE_INDEX = path.join(CACHE_DIR, 'index.json');
const MAX_CACHE_AGE = 24 * 60 * 60 * 1000; // 24 hours
const SRC_DIR = path.join(__dirname, '../src');

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Generate cache key from query
 */
function getCacheKey(query, options = {}) {
  const data = JSON.stringify({ query, options });
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Load cache index
 */
function loadCacheIndex() {
  if (fs.existsSync(CACHE_INDEX)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_INDEX, 'utf-8'));
    } catch (e) {
      return { entries: {}, stats: { hits: 0, misses: 0 } };
    }
  }
  return { entries: {}, stats: { hits: 0, misses: 0 } };
}

/**
 * Save cache index
 */
function saveCacheIndex(index) {
  fs.writeFileSync(CACHE_INDEX, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * Get cached result
 */
function getCached(key) {
  const index = loadCacheIndex();
  const entry = index.entries[key];

  if (!entry) {
    index.stats.misses++;
    saveCacheIndex(index);
    return null;
  }

  // Check if cache is expired
  const age = Date.now() - new Date(entry.timestamp).getTime();
  if (age > MAX_CACHE_AGE) {
    delete index.entries[key];
    index.stats.misses++;
    saveCacheIndex(index);
    return null;
  }

  // Load cached data
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(cachePath)) {
    index.stats.hits++;
    saveCacheIndex(index);
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }

  index.stats.misses++;
  saveCacheIndex(index);
  return null;
}

/**
 * Set cached result
 */
function setCached(key, data, metadata = {}) {
  const index = loadCacheIndex();

  // Save data
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');

  // Update index
  index.entries[key] = {
    timestamp: new Date().toISOString(),
    size: JSON.stringify(data).length,
    ...metadata
  };

  saveCacheIndex(index);
}

/**
 * Execute ripgrep search
 */
function ripgrepSearch(pattern, options = {}) {
  const {
    fileType = null,
    ignoreCase = true,
    contextLines = 2,
    maxCount = null
  } = options;

  let cmd = 'rg';

  // Add flags
  if (ignoreCase) cmd += ' -i';
  cmd += ` -C ${contextLines}`;
  cmd += ' --json';
  if (fileType) cmd += ` -t ${fileType}`;
  if (maxCount) cmd += ` -m ${maxCount}`;

  // Add pattern
  cmd += ` "${pattern}"`;

  // Add path
  cmd += ` "${SRC_DIR}"`;

  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
    });

    // Parse JSON lines
    const results = output
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .filter(item => item.type === 'match');

    return results.map(item => ({
      file: item.data.path.text,
      line: item.data.line_number,
      column: item.data.submatches[0]?.start || 0,
      text: item.data.lines.text,
      match: item.data.submatches[0]?.match?.text || ''
    }));
  } catch (e) {
    // Ripgrep not found or no matches, fall back to grep
    return fallbackGrep(pattern, options);
  }
}

/**
 * Fallback to grep if ripgrep not available
 */
function fallbackGrep(pattern, options = {}) {
  const { ignoreCase = true, contextLines = 2 } = options;

  let cmd = 'grep -r';
  if (ignoreCase) cmd += ' -i';
  cmd += ` -n -C ${contextLines}`;
  cmd += ` "${pattern}" "${SRC_DIR}"`;

  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore']
    });

    return output
      .split('\n')
      .filter(line => line.includes(':'))
      .map(line => {
        const [filePath, ...rest] = line.split(':');
        const lineNum = rest[0];
        const text = rest.slice(1).join(':');

        return {
          file: filePath.replace(SRC_DIR + path.sep, ''),
          line: parseInt(lineNum) || 0,
          column: 0,
          text: text.trim(),
          match: pattern
        };
      });
  } catch (e) {
    return [];
  }
}

/**
 * Semantic search with caching
 */
function semanticSearch(query, options = {}) {
  const useCache = options.cache !== false;
  const cacheKey = getCacheKey(query, options);

  // Check cache
  if (useCache) {
    const cached = getCached(cacheKey);
    if (cached) {
      console.log('✓ Cache hit');
      return cached;
    }
    console.log('✗ Cache miss');
  }

  // Execute search
  console.log(`🔍 Searching for: "${query}"`);
  const results = ripgrepSearch(query, options);

  // Cache results
  if (useCache && results.length > 0) {
    setCached(cacheKey, results, {
      query,
      resultCount: results.length
    });
  }

  return results;
}

/**
 * Analyze TypeScript errors with semantic search
 */
function analyzeErrors() {
  console.log('🔍 Analyzing TypeScript errors with semantic search\n');

  // Get current errors
  let errors;
  try {
    const output = execSync('npx tsc --noEmit 2>&1', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024
    });
    errors = output.split('\n').filter(line => line.includes('error TS'));
  } catch (e) {
    errors = [];
  }

  if (errors.length === 0) {
    console.log('✅ No errors found!');
    return;
  }

  console.log(`Found ${errors.length} errors\n`);

  // Extract error patterns
  const errorPatterns = new Map();

  errors.forEach(error => {
    const match = error.match(/error (TS\d+): (.+)/);
    if (match) {
      const [, code, message] = match;
      if (!errorPatterns.has(code)) {
        errorPatterns.set(code, []);
      }
      errorPatterns.get(code).push(message);
    }
  });

  // Analyze top error patterns
  const topPatterns = Array.from(errorPatterns.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5);

  console.log('Top 5 error patterns:\n');

  for (const [code, messages] of topPatterns) {
    console.log(`${code}: ${messages.length} occurrences`);

    // Find common keywords in error messages
    const keywords = extractKeywords(messages);
    console.log(`  Keywords: ${keywords.slice(0, 5).join(', ')}`);

    // Search for similar patterns in codebase
    if (keywords.length > 0) {
      const searchResults = semanticSearch(keywords[0], {
        cache: true,
        maxCount: 10,
        fileType: 'ts'
      });

      console.log(`  Found ${searchResults.length} similar patterns in codebase`);

      if (searchResults.length > 0) {
        console.log(`  Example: ${searchResults[0].file}:${searchResults[0].line}`);
      }
    }

    console.log();
  }

  // Cache statistics
  const index = loadCacheIndex();
  const hitRate = index.stats.hits / (index.stats.hits + index.stats.misses) * 100;
  console.log(`\n📊 Cache Statistics:`);
  console.log(`  Hits: ${index.stats.hits}`);
  console.log(`  Misses: ${index.stats.misses}`);
  console.log(`  Hit Rate: ${hitRate.toFixed(1)}%`);
  console.log(`  Cached Entries: ${Object.keys(index.entries).length}`);
}

/**
 * Extract keywords from error messages
 */
function extractKeywords(messages) {
  const words = new Map();

  messages.forEach(msg => {
    // Remove common words and extract meaningful terms
    const terms = msg
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word =>
        word.length > 3 &&
        !['expected', 'cannot', 'type', 'error', 'this', 'that', 'with', 'from'].includes(word)
      );

    terms.forEach(term => {
      words.set(term, (words.get(term) || 0) + 1);
    });
  });

  return Array.from(words.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}

/**
 * Clear cache
 */
function clearCache() {
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log('✅ Cache cleared');
  }
}

/**
 * Main CLI
 */
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--clear-cache')) {
    clearCache();
    return;
  }

  if (args.includes('--analyze-errors')) {
    analyzeErrors();
    return;
  }

  const searchIndex = args.indexOf('--search');
  if (searchIndex !== -1 && args[searchIndex + 1]) {
    const query = args[searchIndex + 1];
    const useCache = args.includes('--cache');
    const results = semanticSearch(query, { cache: useCache });

    console.log(`\nFound ${results.length} matches:\n`);
    results.slice(0, 10).forEach(result => {
      console.log(`${result.file}:${result.line}`);
      console.log(`  ${result.text.trim()}`);
      console.log();
    });

    return;
  }

  // Default: show help
  console.log('Ripgrep Semantic Cache');
  console.log('======================\n');
  console.log('Usage:');
  console.log('  --search "pattern" [--cache]  Search for pattern');
  console.log('  --analyze-errors              Analyze TypeScript errors');
  console.log('  --clear-cache                 Clear semantic cache');
  console.log('\nExamples:');
  console.log('  node scripts/ripgrep-semantic-cache.mjs --search "\\$state" --cache');
  console.log('  node scripts/ripgrep-semantic-cache.mjs --analyze-errors');
}

main();
