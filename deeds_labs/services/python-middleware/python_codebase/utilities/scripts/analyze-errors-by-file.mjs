#!/usr/bin/env node
/**
 * Analyze TypeScript errors by file and priority
 * Shows which files have the most errors and their impact
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = path.join(process.cwd(), 'sveltekit-frontend');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');

/**
 * File priority scores (higher = more critical to fix)
 */
const PRIORITY_SCORES = {
  '+server.ts': 50,      // Route handlers - block entire routes
  '+layout.server.ts': 40, // Layout logic - cascades to all children
  '+page.server.ts': 35,  // Page logic
  '+layout.svelte': 30,   // Layout components
  '+page.svelte': 25,     // Page components
  '.d.ts': 45,           // Type definitions - cascades everywhere
  'index.ts': 42,        // Barrel exports - cascades to imports
  'client.ts': 40,       // DB client - used everywhere
  'schema.ts': 38,       // DB schema
  'types.ts': 37,        // Shared types
  'index.svelte': 20,    // Components
  'machine.ts': 35,      // XState machines
  'service.ts': 32,      // Service files
  'utils.ts': 28,        // Utilities
};

const CRITICAL_DIRS = [
  'src/routes/api',
  'src/lib/server',
  'src/lib/types',
  'src/lib/machines',
  'src/lib/services',
];

/**
 * Run TypeScript compiler and parse errors
 */
function getTypeScriptErrors() {
  try {
    const output = execSync('npx tsc --noEmit --listFilesOnly 2>&1', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    return output;
  } catch (err) {
    return err.stdout || err.stderr || '';
  }
}

/**
 * Parse tsc output for error information
 */
function parseErrors(tscOutput) {
  const lines = tscOutput.split('\n');
  const fileErrors = new Map();
  let currentFile = null;

  for (const line of lines) {
    // Match error lines like: "src/file.ts(10,5): error TS2345: ..."
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*TS(\d+):/);
    if (match) {
      const filePath = match[1];
      const lineNum = parseInt(match[2], 10);
      const errorCode = match[5];

      if (!fileErrors.has(filePath)) {
        fileErrors.set(filePath, {
          path: filePath,
          count: 0,
          lines: [],
          codes: new Set()
        });
      }

      const fileInfo = fileErrors.get(filePath);
      fileInfo.count++;
      fileInfo.lines.push(lineNum);
      fileInfo.codes.add(errorCode);
    }
  }

  return fileErrors;
}

/**
 * Calculate priority score for a file
 */
function calculatePriority(filePath, errorCount) {
  let score = errorCount; // Base score = error count

  // Bonus for file name patterns
  for (const [pattern, points] of Object.entries(PRIORITY_SCORES)) {
    if (filePath.endsWith(pattern)) {
      score += points;
    }
  }

  // Bonus for critical directories
  for (const dir of CRITICAL_DIRS) {
    if (filePath.includes(dir)) {
      score += 20;
    }
  }

  // Penalty for test/demo files
  if (filePath.includes('.test.') || filePath.includes('.spec.')) {
    score *= 0.5;
  }
  if (filePath.includes('demo') || filePath.includes('example')) {
    score *= 0.7;
  }

  return Math.round(score);
}

/**
 * Format output as a sorted list
 */
function formatResults(fileErrors) {
  const files = Array.from(fileErrors.values()).map(fileInfo => ({
    ...fileInfo,
    priority: calculatePriority(fileInfo.path, fileInfo.count),
    codes: Array.from(fileInfo.codes).sort()
  }));

  // Sort by priority (highest first)
  files.sort((a, b) => b.priority - a.priority);

  return files;
}

/**
 * Group files by directory
 */
function groupByDirectory(files) {
  const grouped = {};

  for (const file of files) {
    const dir = path.dirname(file.path);
    if (!grouped[dir]) {
      grouped[dir] = [];
    }
    grouped[dir].push(file);
  }

  return grouped;
}

/**
 * Generate markdown report
 */
function generateReport(files) {
  const report = [];
  report.push('# TypeScript Error Analysis Report\n');
  report.push(`Generated: ${new Date().toISOString()}\n`);
  report.push(`Total files with errors: ${files.length}\n`);

  const totalErrors = files.reduce((sum, f) => sum + f.count, 0);
  report.push(`Total errors: ${totalErrors}\n\n`);

  // Top priority files
  report.push('## 🔴 Priority 1 - Fix These First (High Impact)\n');
  const priority1 = files.filter(f => f.priority >= 150);
  if (priority1.length === 0) {
    report.push('None\n');
  } else {
    for (const file of priority1.slice(0, 20)) {
      report.push(`- **${file.path}** (${file.count} errors, priority: ${file.priority})`);
      report.push(`  - Error codes: ${file.codes.join(', ')}\n`);
    }
  }

  // Medium priority
  report.push('\n## 🟡 Priority 2 - Medium Impact\n');
  const priority2 = files.filter(f => f.priority >= 50 && f.priority < 150);
  if (priority2.length === 0) {
    report.push('None\n');
  } else {
    for (const file of priority2.slice(0, 30)) {
      report.push(`- ${file.path} (${file.count} errors, priority: ${file.priority})\n`);
    }
  }

  // Low priority
  report.push('\n## 🟢 Priority 3 - Low Impact\n');
  const priority3 = files.filter(f => f.priority < 50);
  report.push(`${priority3.length} files with low impact (${priority3.reduce((s, f) => s + f.count, 0)} total errors)\n`);

  // Error code frequency
  report.push('\n## 📊 Most Common Error Codes\n');
  const codeFreq = {};
  for (const file of files) {
    for (const code of file.codes) {
      codeFreq[code] = (codeFreq[code] || 0) + 1;
    }
  }
  const sortedCodes = Object.entries(codeFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  for (const [code, count] of sortedCodes) {
    report.push(`- TS${code}: ${count} files affected\n`);
  }

  // Recommended fix order
  report.push('\n## 📋 Recommended Fix Order\n');
  report.push('```\n');
  for (let i = 0; i < Math.min(15, files.length); i++) {
    const file = files[i];
    report.push(`${i + 1}. ${file.path.replace(PROJECT_ROOT, '').replace(/^\//, '')}\n`);
    report.push(`   └─ ${file.count} errors | Priority: ${file.priority}\n`);
  }
  report.push('```\n');

  return report.join('');
}

/**
 * Main execution
 */
async function main() {
  console.log('📊 Analyzing TypeScript errors...\n');
  console.log(`Working in: ${PROJECT_ROOT}\n`);

  console.log('Running TypeScript compiler...');
  const tscOutput = getTypeScriptErrors();

  console.log('Parsing errors...');
  const fileErrors = parseErrors(tscOutput);

  if (fileErrors.size === 0) {
    console.log('✅ No errors found!');
    return;
  }

  console.log(`Found errors in ${fileErrors.size} files\n`);

  const files = formatResults(fileErrors);

  // Generate and save report
  const report = generateReport(files);
  const reportPath = path.join(process.cwd(), 'ERROR_ANALYSIS.md');
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n📄 Report saved to: ${reportPath}`);

  // Save JSON for programmatic access
  const jsonPath = path.join(process.cwd(), '.vscode', 'error-analysis.json');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalFiles: files.length,
        totalErrors: files.reduce((s, f) => s + f.count, 0),
        priority1: files.filter(f => f.priority >= 150).length,
        priority2: files.filter(f => f.priority >= 50 && f.priority < 150).length,
        priority3: files.filter(f => f.priority < 50).length,
        topFiles: files.slice(0, 20).map(f => ({
          path: f.path,
          errors: f.count,
          priority: f.priority,
          codes: f.codes
        }))
      },
      null,
      2
    ),
    'utf-8'
  );
  console.log(`📊 JSON data saved to: ${jsonPath}`);

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n🔴 Priority 1 (High Impact):  ${files.filter(f => f.priority >= 150).length} files`);
  console.log(`🟡 Priority 2 (Medium):       ${files.filter(f => f.priority >= 50 && f.priority < 150).length} files`);
  console.log(`🟢 Priority 3 (Low):          ${files.filter(f => f.priority < 50).length} files`);

  console.log('\n📋 Top 10 Files to Fix:');
  for (let i = 0; i < Math.min(10, files.length); i++) {
    const file = files[i];
    const shortPath = file.path.replace(PROJECT_ROOT, '').replace(/^\//, '');
    console.log(`   ${i + 1}. ${shortPath}`);
    console.log(`      └─ ${file.count} errors | Priority score: ${file.priority}`);
  }

  console.log('\n💡 Next Steps:');
  console.log('1. Open the top file: code ' + files[0].path);
  console.log('2. Press Ctrl+. on each red error');
  console.log('3. Review and accept TypeScript suggestions');
  console.log('4. Save and move to next file');
  console.log('\n✅ When done, run this script again to see progress');
}

main().catch(console.error);
