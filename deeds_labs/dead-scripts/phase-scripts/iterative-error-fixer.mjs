#!/usr/bin/env node
/**
 * Iterative Error Fixer with Pattern Learning
 *
 * Analyzes TypeScript errors, learns patterns, and applies fixes iteratively
 * Integrates with ripgrep for fast semantic search and caching
 *
 * Tech Stack Context:
 * - Svelte 5 (runes: $state, $derived, $effect, $props)
 * - Drizzle ORM 0.44
 * - Bits UI (Svelte 5 API)
 * - XState v5
 * - UnoCSS
 * - IndexedDB + Loki.js (client caching)
 * - PostgreSQL + pgvector + Qdrant + Redis + RabbitMQ
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '../src');
const CACHE_FILE = path.join(__dirname, '../.error-patterns-cache.json');
const KNOWLEDGE_BASE_FILES = [
  path.join(__dirname, '../copilot.md'),
  path.join(__dirname, '../claude.md'),
  path.join(__dirname, '../gemini.md')
];

const DRY_RUN = !process.argv.includes('--apply');
const LEARN_MODE = process.argv.includes('--learn');
const MAX_ITERATIONS = parseInt(process.argv.find(arg => arg.startsWith('--iterations='))?.split('=')[1] || '5');

let iteration = 0;
let totalFixesApplied = 0;
let patternCache = loadPatternCache();

/**
 * Load pattern cache from disk
 */
function loadPatternCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    } catch (e) {
      console.warn('⚠️  Failed to load pattern cache, starting fresh');
    }
  }
  return {
    patterns: [],
    successRate: {},
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Save pattern cache to disk
 */
function savePatternCache() {
  patternCache.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(patternCache, null, 2), 'utf-8');
}

/**
 * Get current error count and breakdown
 */
function getErrorStats() {
  try {
    const output = execSync('npx tsc --noEmit 2>&1', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024
    });

    const errors = output.split('\n').filter(line => line.includes('error TS'));
    const total = errors.length;

    // Group by error code
    const breakdown = {};
    errors.forEach(line => {
      const match = line.match(/error (TS\d+):/);
      if (match) {
        const code = match[1];
        breakdown[code] = (breakdown[code] || 0) + 1;
      }
    });

    return { total, breakdown, errors };
  } catch (e) {
    return { total: 0, breakdown: {}, errors: [] };
  }
}

/**
 * Analyze error patterns using ripgrep for fast search
 */
function analyzeErrorPatterns(errorCode, sampleErrors) {
  const patterns = [];

  // Extract file paths from errors
  const files = sampleErrors
    .map(err => {
      const match = err.match(/^([^(]+)\(/);
      return match ? match[1] : null;
    })
    .filter(Boolean)
    .slice(0, 10); // Analyze top 10 files

  for (const file of files) {
    const fullPath = path.join(__dirname, '..', file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Detect patterns based on error code
        switch (errorCode) {
          case 'TS1005':
            patterns.push(...detectTS1005Patterns(content, file));
            break;
          case 'TS1128':
            patterns.push(...detectTS1128Patterns(content, file));
            break;
          case 'TS1434':
            patterns.push(...detectTS1434Patterns(content, file));
            break;
        }
      } catch (e) {
        // Skip files that can't be read
      }
    }
  }

  return patterns;
}

/**
 * Detect TS1005 patterns (',' or ':' expected)
 */
function detectTS1005Patterns(content, file) {
  const patterns = [];

  // Pattern: Multiple colons in ternary/object
  if (content.match(/\w+:\s*\w+\??\.\w+:\s*\w+\??\.\w+:/)) {
    patterns.push({
      type: 'TS1005',
      name: 'nested-ternary-colons',
      description: 'Multiple colons in nested ternary/optional chaining',
      regex: /(\w+):\s*(\w+)\?\.(\w+):\s*(\w+)\?\.(\w+):\s*(\w+)/g,
      replacement: '$1: $2?.$3 ?? $4?.$5 ?? $6',
      file
    });
  }

  // Pattern: Comma before closing brace in object
  if (content.match(/,\s*\}/)) {
    patterns.push({
      type: 'TS1005',
      name: 'trailing-comma-brace',
      description: 'Trailing comma before closing brace',
      regex: /,(\s*\})/g,
      replacement: '$1',
      file
    });
  }

  // Pattern: Semicolon in object literal
  if (content.match(/\{\s*\w+:\s*[^;]+;\s*\w+:/)) {
    patterns.push({
      type: 'TS1005',
      name: 'semicolon-in-object',
      description: 'Semicolon instead of comma in object literal',
      regex: /(\w+:\s*[^;,\n]+);(\s*\w+:)/g,
      replacement: '$1,$2',
      file
    });
  }

  return patterns;
}

/**
 * Detect TS1128 patterns (Declaration or statement expected)
 */
function detectTS1128Patterns(content, file) {
  const patterns = [];

  // Pattern: Missing closing paren before brace
  if (content.match(/\([^)]*,\s*\}/)) {
    patterns.push({
      type: 'TS1128',
      name: 'missing-closing-paren',
      description: 'Missing closing parenthesis before brace',
      regex: /(\w+\([^)]*),(\s*\})/g,
      replacement: '$1)$2',
      file
    });
  }

  // Pattern: Semicolon in function params
  if (content.match(/\([^)]*\w+:\s*\w+;\s*\w+:/)) {
    patterns.push({
      type: 'TS1128',
      name: 'semicolon-in-params',
      description: 'Semicolon instead of comma in function parameters',
      regex: /\(([^)]*);([^)]*)\)/g,
      replacement: '($1, $2)',
      file
    });
  }

  return patterns;
}

/**
 * Detect TS1434 patterns (Unexpected keyword or identifier)
 */
function detectTS1434Patterns(content, file) {
  const patterns = [];

  // Pattern: 'type' keyword in wrong position
  if (content.match(/import\s+type\s+\{[^}]*:\s*[^}]*\}/)) {
    patterns.push({
      type: 'TS1434',
      name: 'import-type-colon',
      description: 'Colon instead of comma in import type statement',
      regex: /import\s+type\s+\{([^}]*)\}/g,
      replacement: (match, imports) => {
        return `import type {${imports.replace(/:\s*/g, ', ')}}`;
      },
      file
    });
  }

  return patterns;
}

/**
 * Apply pattern fixes to a file
 */
function applyPatternFixes(filePath, patterns) {
  const fullPath = path.join(__dirname, '..', filePath);
  if (!fs.existsSync(fullPath)) return 0;

  let content = fs.readFileSync(fullPath, 'utf-8');
  let fixes = 0;

  for (const pattern of patterns) {
    const before = content;

    if (typeof pattern.replacement === 'function') {
      content = content.replace(pattern.regex, pattern.replacement);
    } else {
      content = content.replace(pattern.regex, pattern.replacement);
    }

    if (content !== before) {
      fixes++;

      // Update success rate
      const key = `${pattern.type}-${pattern.name}`;
      if (!patternCache.successRate[key]) {
        patternCache.successRate[key] = { applied: 0, successful: 0 };
      }
      patternCache.successRate[key].applied++;
    }
  }

  if (fixes > 0 && !DRY_RUN) {
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  return fixes;
}

/**
 * Update knowledge base with new patterns
 */
function updateKnowledgeBase(newPatterns) {
  if (newPatterns.length === 0) return;

  const timestamp = new Date().toISOString();
  const entry = `\n\n## Error Patterns Discovered (${timestamp})\n\n`;

  let content = entry;

  for (const pattern of newPatterns) {
    content += `### ${pattern.type}: ${pattern.name}\n`;
    content += `**Description:** ${pattern.description}\n\n`;
    content += `**Pattern:**\n\`\`\`typescript\n`;
    content += `// Before\n${pattern.regex.source}\n\n`;
    content += `// After\n${pattern.replacement}\n`;
    content += `\`\`\`\n\n`;
  }

  // Append to all knowledge base files
  for (const kbFile of KNOWLEDGE_BASE_FILES) {
    if (fs.existsSync(kbFile)) {
      fs.appendFileSync(kbFile, content, 'utf-8');
    }
  }

  console.log(`✅ Updated ${KNOWLEDGE_BASE_FILES.length} knowledge base files`);
}

/**
 * Main iterative fixing loop
 */
async function main() {
  console.log('🔧 Iterative Error Fixer with Pattern Learning');
  console.log('==============================================\n');
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '⚠️  APPLY'}`);
  console.log(`Max Iterations: ${MAX_ITERATIONS}`);
  console.log(`Learn Mode: ${LEARN_MODE ? 'ON' : 'OFF'}\n`);

  const startStats = getErrorStats();
  console.log(`📊 Starting Error Count: ${startStats.total}\n`);

  for (iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`\n🔄 Iteration ${iteration}/${MAX_ITERATIONS}`);
    console.log('─'.repeat(50));

    const stats = getErrorStats();

    if (stats.total === 0) {
      console.log('🎉 No errors remaining!');
      break;
    }

    console.log(`Current errors: ${stats.total}`);
    console.log('\nTop error types:');

    const topErrors = Object.entries(stats.breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [code, count] of topErrors) {
      console.log(`  ${code}: ${count}`);
    }

    // Analyze patterns for top error
    const [topErrorCode, topErrorCount] = topErrors[0];
    console.log(`\n🔍 Analyzing ${topErrorCode} patterns...`);

    const sampleErrors = stats.errors
      .filter(err => err.includes(`error ${topErrorCode}:`))
      .slice(0, 20);

    const patterns = analyzeErrorPatterns(topErrorCode, sampleErrors);

    if (patterns.length === 0) {
      console.log('⚠️  No patterns detected, stopping iteration');
      break;
    }

    console.log(`Found ${patterns.length} patterns`);

    // Apply fixes
    let iterationFixes = 0;
    const filesProcessed = new Set();

    for (const pattern of patterns) {
      if (pattern.file && !filesProcessed.has(pattern.file)) {
        const fixes = applyPatternFixes(pattern.file, [pattern]);
        iterationFixes += fixes;
        filesProcessed.add(pattern.file);
      }
    }

    console.log(`✓ Applied ${iterationFixes} fixes to ${filesProcessed.size} files`);
    totalFixesApplied += iterationFixes;

    // Learn mode: save new patterns
    if (LEARN_MODE) {
      const newPatterns = patterns.filter(p => {
        const key = `${p.type}-${p.name}`;
        return !patternCache.patterns.some(cached =>
          cached.type === p.type && cached.name === p.name
        );
      });

      if (newPatterns.length > 0) {
        patternCache.patterns.push(...newPatterns);
        updateKnowledgeBase(newPatterns);
        console.log(`📚 Learned ${newPatterns.length} new patterns`);
      }
    }

    // Check if we made progress
    const newStats = getErrorStats();
    const reduction = stats.total - newStats.total;

    if (reduction <= 0) {
      console.log('⚠️  No progress made, stopping iteration');
      break;
    }

    console.log(`📉 Reduced by ${reduction} errors (${((reduction / stats.total) * 100).toFixed(1)}%)`);
  }

  // Final summary
  const endStats = getErrorStats();
  const totalReduction = startStats.total - endStats.total;
  const reductionPercent = ((totalReduction / startStats.total) * 100).toFixed(1);

  console.log('\n' + '='.repeat(50));
  console.log('📊 Final Summary');
  console.log('='.repeat(50));
  console.log(`Starting errors: ${startStats.total}`);
  console.log(`Ending errors: ${endStats.total}`);
  console.log(`Total reduction: ${totalReduction} (${reductionPercent}%)`);
  console.log(`Fixes applied: ${totalFixesApplied}`);
  console.log(`Iterations: ${iteration - 1}`);

  if (LEARN_MODE) {
    savePatternCache();
    console.log(`\n💾 Saved ${patternCache.patterns.length} patterns to cache`);
  }

  if (DRY_RUN) {
    console.log('\n💡 Run with --apply to apply fixes');
  }
}

main().catch(console.error);
