#!/usr/bin/env node
/**
 * Phase 43 — Top Error Analyzer
 * -------------------------------
 * Analyzes svelte-check output to identify top error patterns
 * and generate actionable fix strategies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read svelte-check output from stdin or file
const input = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : '';

const errorPatterns = new Map();
const fileErrors = new Map();
const errorTypes = {
  'event-directive': 0,
  'implicit-any': 0,
  'type-mismatch': 0,
  'async-effect': 0,
  'css-syntax': 0,
  'undefined-identifier': 0,
  'cannot-find-name': 0,
  'module-resolution': 0,
  'property-missing': 0,
  'other': 0
};

// Parse error lines
const lines = input.split('\n');
for (const line of lines) {
  // Extract error pattern
  const errorMatch = line.match(/Error: (.+?)(?:\.|$)/);
  if (errorMatch) {
    const errorMsg = errorMatch[1];
    
    // Classify error
    let type = 'other';
    if (/event directive/i.test(errorMsg)) type = 'event-directive';
    else if (/implicit.*any/i.test(errorMsg)) type = 'implicit-any';
    else if (/not assignable/i.test(errorMsg)) type = 'type-mismatch';
    else if (/async.*effect/i.test(errorMsg)) type = 'async-effect';
    else if (/semi-colon expected|expected \(css\)/i.test(errorMsg)) type = 'css-syntax';
    else if (/Cannot find name/i.test(errorMsg)) type = 'cannot-find-name';
    else if (/has no default export|Cannot find module/i.test(errorMsg)) type = 'module-resolution';
    else if (/Property.*does not exist/i.test(errorMsg)) type = 'property-missing';
    else if (/undefined/i.test(errorMsg)) type = 'undefined-identifier';
    
    errorTypes[type]++;
    
    // Count pattern occurrences
    const count = errorPatterns.get(errorMsg) || 0;
    errorPatterns.set(errorMsg, count + 1);
  }
  
  // Track errors by file
  const fileMatch = line.match(/([^:]+\.(?:ts|svelte|js)):\d+:\d+/);
  if (fileMatch) {
    const file = fileMatch[1];
    const count = fileErrors.get(file) || 0;
    fileErrors.set(file, count + 1);
  }
}

// Sort patterns by frequency
const sortedPatterns = Array.from(errorPatterns.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50);

// Sort files by error count
const sortedFiles = Array.from(fileErrors.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);

// Generate report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    totalErrors: Object.values(errorTypes).reduce((a, b) => a + b, 0),
    byType: errorTypes,
    topPatterns: sortedPatterns.length,
    affectedFiles: fileErrors.size
  },
  topErrorPatterns: sortedPatterns.map(([msg, count]) => ({
    message: msg,
    count,
    percentage: ((count / report.summary.totalErrors) * 100).toFixed(2)
  })),
  topAffectedFiles: sortedFiles.map(([file, count]) => ({
    file,
    errorCount: count
  })),
  recommendations: generateRecommendations(errorTypes, sortedPatterns)
};

// Write report
const reportPath = path.resolve(__dirname, '..', 'PHASE43-TOP-ERRORS.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log('\n' + '='.repeat(70));
console.log('📊 PHASE 43 ERROR ANALYSIS REPORT');
console.log('='.repeat(70));
console.log(`\nTotal Errors: ${report.summary.totalErrors.toLocaleString()}`);
console.log('\nError Distribution:');

Object.entries(errorTypes)
  .sort((a, b) => b[1] - a[1])
  .forEach(([type, count]) => {
    const pct = ((count / report.summary.totalErrors) * 100).toFixed(1);
    console.log(`  ${type.padEnd(25)} ${count.toLocaleString().padStart(8)}  (${pct}%)`);
  });

console.log('\n' + '-'.repeat(70));
console.log('🎯 TOP 10 ERROR PATTERNS:');
console.log('-'.repeat(70));

sortedPatterns.slice(0, 10).forEach(([msg, count], i) => {
  const pct = ((count / report.summary.totalErrors) * 100).toFixed(2);
  console.log(`\n${i + 1}. [${count} occurrences, ${pct}%]`);
  console.log(`   ${msg.slice(0, 100)}${msg.length > 100 ? '...' : ''}`);
});

console.log('\n' + '-'.repeat(70));
console.log('📁 TOP 10 FILES WITH MOST ERRORS:');
console.log('-'.repeat(70));

sortedFiles.slice(0, 10).forEach(([file, count], i) => {
  console.log(`${(i + 1).toString().padStart(2)}. ${file.padEnd(60)} ${count.toString().padStart(5)} errors`);
});

console.log('\n' + '='.repeat(70));
console.log('💡 RECOMMENDED NEXT STEPS:');
console.log('='.repeat(70));

report.recommendations.forEach((rec, i) => {
  console.log(`\n${i + 1}. ${rec.title}`);
  console.log(`   Impact: ${rec.impact}`);
  console.log(`   Command: ${rec.command}`);
});

console.log(`\n📄 Full report saved to: ${reportPath}\n`);

/**
 * Generate fix recommendations based on error analysis
 */
function generateRecommendations(types, patterns) {
  const recs = [];
  
  if (types['css-syntax'] > 1000) {
    recs.push({
      title: 'Fix CSS Syntax Errors (High Priority)',
      impact: `~${types['css-syntax'].toLocaleString()} errors`,
      command: 'node scripts/fix-css-syntax.mjs --apply',
      priority: 1
    });
  }
  
  if (types['cannot-find-name'] > 1000) {
    recs.push({
      title: 'Fix "Cannot find name" Errors',
      impact: `~${types['cannot-find-name'].toLocaleString()} errors`,
      command: 'node scripts/fix-undefined-identifiers.mjs --apply',
      priority: 2
    });
  }
  
  if (types['module-resolution'] > 500) {
    recs.push({
      title: 'Fix Module Import/Export Issues',
      impact: `~${types['module-resolution'].toLocaleString()} errors`,
      command: 'node scripts/fix-module-imports.mjs --apply',
      priority: 2
    });
  }
  
  if (types['type-mismatch'] > 5000) {
    recs.push({
      title: 'Fix Type Mismatch Errors',
      impact: `~${types['type-mismatch'].toLocaleString()} errors`,
      command: 'node scripts/fix-type-mismatches.mjs --apply',
      priority: 3
    });
  }
  
  if (types['event-directive'] > 1000) {
    recs.push({
      title: 'Convert Event Directives to Svelte 5 Syntax',
      impact: `~${types['event-directive'].toLocaleString()} errors`,
      command: 'node scripts/fix-event-directives.mjs --apply',
      priority: 1
    });
  }
  
  return recs.sort((a, b) => a.priority - b.priority);
}
