#!/usr/bin/env node
/**
 * Practical TypeScript Error Prioritizer
 * Scans src/ directory for syntax patterns and prioritizes fix order
 */

import fs from 'fs';
import path from 'path';
import { readdirSync, statSync } from 'fs';

const SRC_DIR = path.join(process.cwd(), 'sveltekit-frontend', 'src');

const CRITICAL_PATTERNS = {
  'from,': { score: 100, description: 'Stray comma after from keyword' },
  'export const,': { score: 90, description: 'Stray comma in export' },
  'interface.*,': { score: 80, description: 'Stray comma in interface' },
  'from, ': { score: 100, description: 'Stray comma with space' },
};

const FILE_TYPE_PRIORITY = {
  '+server.ts': 100,      // Route handlers - critical
  '+page.server.ts': 90,  // Page server logic
  '+layout.server.ts': 85,
  '.d.ts': 95,           // Type defs - cascade everywhere
  'index.ts': 88,        // Barrel exports
  'client.ts': 85,       // DB client
  'schema.ts': 84,
  'machine.ts': 80,      // XState
  'service.ts': 70,
  'utils.ts': 60,
};

const DIR_PRIORITY = {
  'routes/api': 90,       // API endpoints
  'server/db': 88,        // Database layer
  'server': 85,           // All server-side
  'types': 84,            // Type definitions
  'machines': 80,         // State machines
  'services': 75,         // Services
};

/**
 * Find all TypeScript/Svelte files recursively
 */
function findAllFiles(dir) {
  const files = [];

  function walk(current) {
    try {
      const entries = readdirSync(current);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        if (entry === 'node_modules') continue;

        const fullPath = path.join(current, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (/\.(ts|tsx|svelte|js)$/.test(entry) && !entry.endsWith('.test.ts')) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // Skip inaccessible directories
    }
  }

  walk(dir);
  return files;
}

/**
 * Count error patterns in a file
 */
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let errorCount = 0;
    const patterns = new Set();
    const errorLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const [pattern, info] of Object.entries(CRITICAL_PATTERNS)) {
        if (new RegExp(pattern).test(line)) {
          errorCount += info.score;
          patterns.add(pattern);
          errorLines.push(i + 1);
        }
      }
    }

    return {
      errorCount,
      patterns: Array.from(patterns),
      errorLines: [...new Set(errorLines)].slice(0, 5), // First 5 error lines
      lineCount: lines.length
    };
  } catch (err) {
    return { errorCount: 0, patterns: [], errorLines: [], lineCount: 0 };
  }
}

/**
 * Calculate priority score
 */
function calculateScore(filePath, analysis) {
  let score = analysis.errorCount;

  // Bonus for file type
  for (const [type, points] of Object.entries(FILE_TYPE_PRIORITY)) {
    if (filePath.endsWith(type)) {
      score += points;
      break;
    }
  }

  // Bonus for directory
  for (const [dir, points] of Object.entries(DIR_PRIORITY)) {
    if (filePath.includes(path.sep + dir)) {
      score += points;
      break;
    }
  }

  // Penalty for test files
  if (filePath.includes('.test.') || filePath.includes('.spec.')) {
    score *= 0.3;
  }

  return score;
}

/**
 * Main analysis
 */
console.log('🔍 Scanning TypeScript files for syntax errors...\n');

const allFiles = findAllFiles(SRC_DIR);
console.log(`Found ${allFiles.length} source files\n`);

const analyzed = [];

for (const file of allFiles) {
  const analysis = analyzeFile(file);
  if (analysis.errorCount > 0) {
    const shortPath = file.replace(SRC_DIR + path.sep, '');
    const score = calculateScore(file, analysis);

    analyzed.push({
      path: file,
      shortPath,
      ...analysis,
      score
    });
  }
}

// Sort by score (highest first)
analyzed.sort((a, b) => b.score - a.score);

console.log('═'.repeat(100));
console.log('TOP 30 FILES TO FIX (Sorted by Impact)'.padEnd(100));
console.log('═'.repeat(100));
console.log();

const reports = [];
let totalErrors = 0;

for (let i = 0; i < Math.min(30, analyzed.length); i++) {
  const file = analyzed[i];
  totalErrors += file.errorCount;

  const idx = String(i + 1).padEnd(3);
  const errors = String(file.errorCount).padEnd(6);
  const lines = `(${file.errorLines.join(', ')})`.padEnd(20);

  console.log(`${idx} ${errors} pts  │  ${file.shortPath}`);
  console.log(`         ${lines} Error lines\n`);

  reports.push({
    index: i + 1,
    path: file.shortPath,
    errorCount: file.errorCount,
    priority: file.score,
    patterns: file.patterns,
    errorLines: file.errorLines
  });
}

console.log('═'.repeat(100));
console.log(`\nTotal files with errors: ${analyzed.length}`);
console.log(`Top 30 total error score: ${totalErrors}\n`);

// Save report
const reportJson = {
  timestamp: new Date().toISOString(),
  analysis: 'Syntax Error Pattern Analysis',
  totalFiles: allFiles.length,
  filesWithErrors: analyzed.length,
  topFiles: reports,
  summary: {
    priority1: reports.filter(r => r.priority >= 150).length,
    priority2: reports.filter(r => r.priority >= 50 && r.priority < 150).length,
    priority3: reports.filter(r => r.priority < 50).length
  }
};

const reportPath = path.join(process.cwd(), '.vscode', 'file-priority-analysis.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(reportJson, null, 2), 'utf-8');

console.log(`📄 Report saved: .vscode/file-priority-analysis.json\n`);

// Print quick fix command
if (analyzed.length > 0) {
  console.log('💡 Next Steps:');
  console.log(`\n1. Open the top file:\n   code "${analyzed[0].path}"\n`);
  console.log('2. Press Ctrl+. on each red error');
  console.log('3. Accept TypeScript suggestions');
  console.log('4. Save (Ctrl+S)');
  console.log('5. Move to next file\n');
}

// Save a shell script to open top files
const shellScript = `#!/bin/bash
# Open top 10 files with errors
${reports.slice(0, 10).map(r => `code "${SRC_DIR}/${r.path}"`).join('\n')}
`;

const scriptPath = path.join(process.cwd(), 'scripts', 'open-top-errors.sh');
fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
fs.writeFileSync(scriptPath, shellScript, 'utf-8');

console.log(`📝 Shell script created: scripts/open-top-errors.sh`);
console.log(`   Run: bash scripts/open-top-errors.sh (opens top 10 files)\n`);
