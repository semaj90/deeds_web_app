#!/usr/bin/env node
/* global console, process */
/**
 * Svelte-Check Error Analyzer
 * Analyzes 100k+ svelte-check errors and generates actionable insights
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.resolve(__dirname, "..", "svelte-check-analysis.json");
const TOP_ERRORS_FILE = path.resolve(__dirname, "..", "top-svelte-errors.json");

console.log("🔍 Analyzing svelte-check errors...\n");

const errorStats = {
  totalErrors: 0,
  totalWarnings: 0,
  byCode: {},
  byFile: {},
  byCategory: {},
  topErrors: [],
  patterns: [],
};

function categorizeError(code, message) {
  if (code.startsWith("a11y-")) return "Accessibility";
  if (code.startsWith("ts")) return "TypeScript";
  if (code.includes("unused")) return "Unused Code";
  if (code.includes("missing")) return "Missing Properties";
  if (code.includes("reactive")) return "Reactivity";
  if (message.includes("$state") || message.includes("$derived")) return "Svelte 5 Runes";
  if (message.includes("event") || message.includes("on:")) return "Event Handlers";
  if (message.includes("binding")) return "Bindings";
  if (message.includes("store")) return "Stores";
  if (message.includes("component")) return "Components";
  return "Other";
}

function parseErrorLine(line) {
  // Parse svelte-check machine output format: timestamp SEVERITY "file" line:col "message"
  // Example: 1762889081326 ERROR "src\lib\server\db\schema-postgres.ts" 836:14 "Cannot redeclare block-scoped variable 'documentChunks'."
  const match = line.match(/^(\d+)\s+(ERROR|WARNING)\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"$/);

  if (match) {
    const [, _timestamp, severity, file, line, col, message] = match; // Mark timestamp as unused
    return {
      file: path.relative(process.cwd(), file.replace(/\\/g, '/')), // Normalize path separators
      line: parseInt(line),
      col: parseInt(col),
      severity: severity.toLowerCase(),
      message,
      code: 'unknown', // svelte-check machine format doesn't include error codes
    };
  }

  return null;
}

async function runSvelteCheck() {
  return new Promise((resolve, reject) => {
    const errors = [];
    const proc = spawn('npx', ['svelte-check', '--output', 'machine', '--threshold', 'error'], {
      cwd: path.resolve(__dirname, '..'),
      shell: true,
    });

    let buffer = '';

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      lines.forEach((line) => {
        if (line.trim()) {
          const error = parseErrorLine(line.trim());
          if (error) {
            errors.push(error);

            // Update stats
            if (error.severity === 'error') {
              errorStats.totalErrors++;
            } else {
              errorStats.totalWarnings++;
            }

            // By code
            if (!errorStats.byCode[error.code]) {
              errorStats.byCode[error.code] = {
                count: 0,
                severity: error.severity,
                examples: [],
              };
            }
            errorStats.byCode[error.code].count++;
            if (errorStats.byCode[error.code].examples.length < 3) {
              errorStats.byCode[error.code].examples.push({
                file: error.file,
                line: error.line,
                message: error.message,
              });
            }

            // By file
            if (!errorStats.byFile[error.file]) {
              errorStats.byFile[error.file] = { errors: 0, warnings: 0 };
            }
            if (error.severity === 'error') {
              errorStats.byFile[error.file].errors++;
            } else {
              errorStats.byFile[error.file].warnings++;
            }

            // By category
            const category = categorizeError(error.code, error.message);
            if (!errorStats.byCategory[category]) {
              errorStats.byCategory[category] = 0;
            }
            errorStats.byCategory[category]++;
          }
        }
      });

      // Progress
      if (errors.length % 1000 === 0 && errors.length > 0) {
        process.stdout.write(`\r   Processed ${errors.length} errors...`);
      }
    });

    proc.stderr.on('data', (_data) => { // Mark data as unused
      // svelte-check writes to stderr, that's normal
    });

    proc.on('close', (_code) => { // Mark code as unused
      console.log(`\n✅ svelte-check analysis complete`);
      resolve(errors);
    });

    proc.on('error', reject);
  });
}

// Run analysis
await runSvelteCheck(); // Removed 'const allErrors =' as it was unused

// Calculate top errors
errorStats.topErrors = Object.entries(errorStats.byCode)
  .map(([code, data]) => ({ code, ...data }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 50);

// Calculate patterns
const patterns = [];

// Pattern 1: Event directive deprecation
const eventDirectiveErrors = errorStats.topErrors.filter(
  (e) =>
    e.code.includes('event') ||
    (e.examples[0]?.message.includes('on:') && e.examples[0]?.message.includes('deprecated'))
);
if (eventDirectiveErrors.length > 0) {
  patterns.push({
    name: 'Event Directive Deprecation (on:click → onclick)',
    impact: eventDirectiveErrors.reduce((sum, e) => sum + e.count, 0),
    fix: 'Replace on:event with onevent attributes',
    automated: true,
  });
}

// Pattern 2: TypeScript errors
const tsErrors = errorStats.topErrors.filter((e) => e.code.startsWith('ts'));
if (tsErrors.length > 0) {
  patterns.push({
    name: 'TypeScript Errors',
    impact: tsErrors.reduce((sum, e) => sum + e.count, 0),
    fix: 'Type annotation and import fixes',
    automated: false,
  });
}

// Pattern 3: Component issues
const componentErrors = Object.entries(errorStats.byCategory)
  .filter(([cat]) => cat === 'Components')
  .reduce((sum, [, count]) => sum + count, 0);
if (componentErrors > 0) {
  patterns.push({
    name: 'Component Import/Usage Issues',
    impact: componentErrors,
    fix: 'Review component imports and props',
    automated: false,
  });
}

errorStats.patterns = patterns;

// Top files
const topFiles = Object.entries(errorStats.byFile)
  .map(([file, counts]) => ({
    file,
    total: counts.errors + counts.warnings,
    ...counts,
  }))
  .sort((a, b) => b.total - a.total)
  .slice(0, 20);

// Generate report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalErrors: errorStats.totalErrors,
    totalWarnings: errorStats.totalWarnings,
    uniqueErrorCodes: Object.keys(errorStats.byCode).length,
    affectedFiles: Object.keys(errorStats.byFile).length,
  },
  categories: errorStats.byCategory,
  topErrorCodes: errorStats.topErrors,
  topFiles,
  patterns: errorStats.patterns,
  recommendations: generateRecommendations(errorStats),
};

// Save reports
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));

// Save top errors only (for quick reference)
fs.writeFileSync(
  TOP_ERRORS_FILE,
  JSON.stringify(
    {
      timestamp: report.timestamp,
      top20: errorStats.topErrors.slice(0, 20),
      topFiles: topFiles.slice(0, 10),
    },
    null,
    2
  )
);

// Print summary
console.log('\n' + '='.repeat(70));
console.log('📊 SVELTE-CHECK ERROR ANALYSIS');
console.log('='.repeat(70));
console.log(`🐛 Total Errors: ${errorStats.totalErrors.toLocaleString()}`);
console.log(`⚠️  Total Warnings: ${errorStats.totalWarnings.toLocaleString()}`);
console.log(`📝 Unique Error Codes: ${Object.keys(errorStats.byCode).length}`);
console.log(`📁 Affected Files: ${Object.keys(errorStats.byFile).length}`);
console.log('='.repeat(70));

console.log('\n🔝 Top 10 Error Types:');
errorStats.topErrors.slice(0, 10).forEach((e, i) => {
  console.log(
    `${(i + 1).toString().padStart(2)}. ${e.code.padEnd(30)} ${e.count.toLocaleString().padStart(8)} errors`
  );
});

console.log('\n📂 Top 5 Files with Most Errors:');
topFiles.slice(0, 5).forEach((f, i) => {
  console.log(`${i + 1}. ${f.file}`);
  console.log(`   ${f.errors} errors, ${f.warnings} warnings`);
});

console.log('\n🏷️  Error Categories:');
Object.entries(errorStats.byCategory)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([cat, count]) => {
    console.log(`   ${cat.padEnd(30)} ${count.toLocaleString().padStart(8)}`);
  });

if (patterns.length > 0) {
  console.log('\n🎯 Detected Patterns (Fixable):');
  patterns.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   Impact: ${p.impact.toLocaleString()} errors`);
    console.log(`   Fix: ${p.fix}`);
    console.log(`   Automated: ${p.automated ? '✅ Yes' : '⚠️  Manual'}`);
  });
}

console.log('\n📝 Reports Generated:');
console.log(`   ${path.relative(process.cwd(), OUTPUT_FILE)}`);
console.log(`   ${path.relative(process.cwd(), TOP_ERRORS_FILE)}`);

console.log('\n💡 Recommended Actions:');
report.recommendations.forEach((rec, i) => {
  console.log(`${i + 1}. ${rec}`);
});

console.log('\n');

function generateRecommendations(stats) {
  const recs = [];

  // Check for event directive errors
  const eventErrors = stats.topErrors.find(
    (e) => e.code.includes('event') || e.examples[0]?.message.includes('on:')
  );
  if (eventErrors) {
    recs.push('Run event directive migration: Replace on:event with onevent');
  }

  // Check for TypeScript errors
  const tsErrorCount = stats.topErrors
    .filter((e) => e.code.startsWith('ts'))
    .reduce((sum, e) => sum + e.count, 0);
  if (tsErrorCount > 1000) {
    recs.push(`Fix ${tsErrorCount.toLocaleString()} TypeScript errors (high priority)`);
  }

  // Check for component errors
  if (stats.byCategory['Components'] > 500) {
    recs.push('Review component import patterns and <svelte:component> usage');
  }

  // Check for runes errors
  if (stats.byCategory['Svelte 5 Runes'] > 100) {
    recs.push('Migrate Svelte 4 patterns to Svelte 5 runes ($state, $derived, $effect)');
  }

  recs.push('Run Phase 42 formatters: prettier + eslint');
  recs.push('Create focused fix scripts for top 5 error types');
  recs.push('Set up incremental fixing workflow (fix top errors first)');

  return recs;
}
