#!/usr/bin/env node
/**
 * Error Analysis Script for Svelte5 Comprehensive Testing & Remediation
 *
 * This script parses svelte-check output into structured ErrorEntry objects,
 * categorizes errors by type, and generates a baseline ErrorReport.
 *
 * Implements interfaces from design.md:
 * - ErrorEntry: Individual error with file, line, column, code, message, category, severity, fixable
 * - ErrorReport: Aggregate report with counts by category and file
 *
 * Requirements: 1.1, 1.6
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ============================================================================
// Type Definitions (matching design.md interfaces)
// ============================================================================

/**
 * @typedef {'syntax' | 'type' | 'a11y' | 'import' | 'svelte5'} ErrorCategory
 * @typedef {'error' | 'warning'} ErrorSeverity
 *
 * @typedef {Object} ErrorEntry
 * @property {string} file
 * @property {number} line
 * @property {number} column
 * @property {string} code
 * @property {string} message
 * @property {ErrorCategory} category
 * @property {ErrorSeverity} severity
 * @property {boolean} fixable
 * @property {string} [fixPattern]
 *
 * @typedef {Object} ErrorReport
 * @property {Date} timestamp
 * @property {number} totalErrors
 * @property {number} totalWarnings
 * @property {Record<string, number>} byCategory
 * @property {Record<string, ErrorEntry[]>} byFile
 * @property {{file: string, count: number}[]} topFiles
 */

// ============================================================================
// ANSI Code Stripping
// ============================================================================

/**
 * Strip ANSI escape codes from a string
 * @param {string} str - String with potential ANSI codes
 * @returns {string} - Clean string
 */
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ============================================================================
// Error Categorization Rules
// ============================================================================

/**
 * Categorization patterns for different error types
 */
const CATEGORY_PATTERNS = {
  // Accessibility warnings (a11y_*)
  a11y: [
    /a11y[-_]/i,
    /accessibility/i,
    /aria[-_]/i,
    /label.*associated/i,
    /missing.*alt/i,
    /click.*events.*must.*be.*accompanied/i,
  ],

  // Import/module resolution errors
  import: [
    /cannot find module/i,
    /module.*not found/i,
    /cannot resolve/i,
    /no exported member/i,
    /has no exported member/i,
    /is not exported/i,
    /has no default export/i,
    /Module.*has no/i,
  ],

  // Svelte 5 specific errors (runes, snippets, etc.)
  svelte5: [
    /\$state/i,
    /\$derived/i,
    /\$effect/i,
    /\$props/i,
    /\$bindable/i,
    /snippet/i,
    /rune/i,
    /svelte[-_]?5/i,
    /state_referenced_locally/i,
    /export let.*\$props/i,
    /children.*snippet/i,
    /render.*snippet/i,
    /directive_invalid_value/i,
    /captures the initial value/i,
  ],

  // Syntax errors (parsing, unexpected tokens, CSS errors, etc.)
  syntax: [
    /unexpected token/i,
    /unexpected keyword/i,
    /parse error/i,
    /syntax error/i,
    /expected.*but got/i,
    /unterminated/i,
    /js_parse_error/i,
    /css\)/i,
    /at-rule or selector expected/i,
    /semi-colon expected/i,
    /\{ expected/i,
    /\} expected/i,
    /\: expected/i,
    /\; expected/i,
    /expression expected/i,
    /declaration.*expected/i,
    /identifier expected/i,
  ],

  // Type errors (TypeScript type checking)
  type: [
    /type.*is not assignable/i,
    /property.*does not exist/i,
    /argument.*is not assignable/i,
    /cannot.*type/i,
    /type.*has no/i,
    /missing.*property/i,
    /object literal may only specify known properties/i,
    /implicit.*any/i,
    /possibly.*undefined/i,
    /possibly.*null/i,
    /not.*callable/i,
    /is not a function/i,
    /cannot find name/i,
    /incorrectly extends interface/i,
    /types.*incompatible/i,
    /\(ts\)$/i,
  ],
};

/**
 * Patterns that indicate an error is automatically fixable
 */
const FIXABLE_PATTERNS = {
  'bits-ui-migration': [
    /Button\.Root/i,
    /Dialog\.Root/i,
    /on:click/i,
    /export let/i,
  ],
  'colon-chain-fix': [
    /:\s*\w+\s*:\s*\w+/,
    /key:\s*value:\s*key/i,
  ],
  'a11y-label-fix': [
    /a11y[-_]label/i,
    /label.*associated/i,
  ],
  'import-path-fix': [
    /cannot find module/i,
    /module.*not found/i,
    /has no exported member/i,
    /Module.*has no/i,
  ],
  'type-import-fix': [
    /import\s*{\s*type/i,
    /only.*types.*can.*be.*imported/i,
  ],
  'svelte5-runes-fix': [
    /state_referenced_locally/i,
    /captures the initial value/i,
  ],
  'syntax-repair': [
    /\{ expected/i,
    /\} expected/i,
    /semi-colon expected/i,
    /at-rule or selector expected/i,
  ],
};

// ============================================================================
// Error Parsing Functions
// ============================================================================

/**
 * Categorize an error based on its code and message
 * @param {string} code - Error code (e.g., 'ts', 'svelte', 'css')
 * @param {string} message - Error message
 * @returns {ErrorCategory}
 */
function categorizeError(code, message) {
  const combined = `${code} ${message}`;

  // Check each category's patterns in priority order
  // (a11y and svelte5 first as they're more specific)
  const categoryOrder = ['a11y', 'svelte5', 'import', 'syntax', 'type'];

  for (const category of categoryOrder) {
    const patterns = CATEGORY_PATTERNS[category];
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        return /** @type {ErrorCategory} */ (category);
      }
    }
  }

  // Default based on error code
  if (code === 'ts') return 'type';
  if (code === 'css') return 'syntax';
  if (code === 'svelte') return 'svelte5';

  return 'syntax';
}

/**
 * Determine if an error is fixable and which pattern would fix it
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @returns {{fixable: boolean, fixPattern?: string}}
 */
function determineFixability(code, message) {
  const combined = `${code} ${message}`;

  for (const [patternName, patterns] of Object.entries(FIXABLE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        return { fixable: true, fixPattern: patternName };
      }
    }
  }

  return { fixable: false };
}

/**
 * Parse svelte-check output into ErrorEntry array
 * The output format is:
 *   filepath:line:column
 *   Error|Warn: message
 *   [optional URL]
 *   [optional additional context]
 *
 * @param {string} output - Raw svelte-check output
 * @returns {ErrorEntry[]}
 */
function parseSvelteCheckOutput(output) {
  const entries = [];
  const lines = output.split('\n').map(l => stripAnsi(l));

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    // Match file path pattern: filepath:line:column
    const fileMatch = line.match(/^(.+?):(\d+):(\d+)\s*$/);

    if (fileMatch) {
      const [, filePath, lineNum, colNum] = fileMatch;

      // Look ahead for the error/warning message
      let severity = /** @type {ErrorSeverity} */ ('error');
      let message = '';
      let code = 'unknown';

      // Collect message lines until we hit another file path or empty section
      i++;
      while (i < lines.length) {
        const msgLine = lines[i].trim();

        // Check if this is a new file path (start of next error)
        if (/^.+?:\d+:\d+\s*$/.test(msgLine)) {
          break;
        }

        // Check for Error/Warn prefix
        const severityMatch = msgLine.match(/^(Error|Warn|Warning|Hint):\s*(.*)$/i);
        if (severityMatch) {
          severity = severityMatch[1].toLowerCase().startsWith('warn') ? 'warning' : 'error';
          message = severityMatch[2];
          i++;
          continue;
        }

        // Check for error code at end of line like (ts) or (svelte) or (css)
        const codeMatch = msgLine.match(/\((ts|svelte|css|js)\)\s*$/i);
        if (codeMatch) {
          code = codeMatch[1].toLowerCase();
          // Add the message part (without the code)
          const msgPart = msgLine.replace(/\s*\((ts|svelte|css|js)\)\s*$/i, '').trim();
          if (msgPart && !msgPart.startsWith('http')) {
            message += (message ? ' ' : '') + msgPart;
          }
          i++;
          continue;
        }

        // Skip URL lines and suggestion lines
        if (msgLine.startsWith('http') ||
            msgLine.startsWith('If you') ||
            msgLine.startsWith('Did you') ||
            msgLine.startsWith('See http') ||
            msgLine === '') {
          i++;
          continue;
        }

        // Append to message
        if (msgLine && !msgLine.startsWith('NODE_ENV')) {
          message += (message ? ' ' : '') + msgLine;
        }

        i++;
      }

      // Clean up message
      message = message.trim();

      // Skip if no meaningful message
      if (!message) {
        continue;
      }

      // Normalize file path
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Categorize the error
      const category = categorizeError(code, message);

      // Determine fixability
      const { fixable, fixPattern } = determineFixability(code, message);

      entries.push({
        file: normalizedPath,
        line: parseInt(lineNum, 10),
        column: parseInt(colNum, 10),
        code,
        message,
        category,
        severity,
        fixable,
        ...(fixPattern && { fixPattern }),
      });
    } else {
      i++;
    }
  }

  return entries;
}

// ============================================================================
// Report Generation Functions
// ============================================================================

/**
 * Generate ErrorReport from parsed entries
 * @param {ErrorEntry[]} entries - Parsed error entries
 * @returns {ErrorReport}
 */
function generateReport(entries) {
  const byCategory = /** @type {Record<string, number>} */ ({
    syntax: 0,
    type: 0,
    a11y: 0,
    import: 0,
    svelte5: 0,
  });

  const byFile = /** @type {Record<string, ErrorEntry[]>} */ ({});
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const entry of entries) {
    // Count by severity
    if (entry.severity === 'error') {
      totalErrors++;
    } else {
      totalWarnings++;
    }

    // Count by category
    byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;

    // Group by file
    if (!byFile[entry.file]) {
      byFile[entry.file] = [];
    }
    byFile[entry.file].push(entry);
  }

  // Generate top files list
  const topFiles = Object.entries(byFile)
    .map(([file, errors]) => ({ file, count: errors.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  return {
    timestamp: new Date(),
    totalErrors,
    totalWarnings,
    byCategory,
    byFile,
    topFiles,
  };
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('🔍 Svelte5 Error Analysis Script');
  console.log('================================\n');
  console.log('Running svelte-check to analyze current errors...\n');

  let output = '';

  try {
    // Run svelte-check and capture output (use machine output for better parsing)
    output = execSync('npx svelte-check --output human 2>&1', {
      cwd: 'sveltekit-frontend',
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    // svelte-check exits with code 1 when errors found, but we still get output
    if (error.stdout) {
      output = error.stdout;
    } else if (error.stderr) {
      output = error.stderr;
    } else {
      console.error('❌ Error running svelte-check:', error.message);
      process.exit(1);
    }
  }

  // Parse the output into ErrorEntry objects
  console.log('📝 Parsing svelte-check output...\n');
  const entries = parseSvelteCheckOutput(output);

  if (entries.length === 0) {
    console.log('✅ No errors found! Codebase is clean.\n');

    // Still generate an empty report
    const emptyReport = {
      timestamp: new Date(),
      totalErrors: 0,
      totalWarnings: 0,
      byCategory: { syntax: 0, type: 0, a11y: 0, import: 0, svelte5: 0 },
      byFile: {},
      topFiles: [],
    };

    fs.writeFileSync(
      'sveltekit-frontend/logs/error-analysis-baseline.json',
      JSON.stringify(emptyReport, null, 2)
    );

    return;
  }

  // Generate the ErrorReport
  console.log('📊 Generating error report...\n');
  const report = generateReport(entries);

  // Save the full report
  const reportPath = 'sveltekit-frontend/logs/error-analysis-baseline.json';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Save raw entries for detailed analysis
  const entriesPath = 'sveltekit-frontend/logs/error-entries-baseline.json';
  fs.writeFileSync(entriesPath, JSON.stringify(entries, null, 2));

  // Display summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    ERROR ANALYSIS REPORT                       ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`📅 Timestamp: ${report.timestamp.toISOString()}\n`);

  console.log('📈 SUMMARY');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`   Total Errors:   ${report.totalErrors}`);
  console.log(`   Total Warnings: ${report.totalWarnings}`);
  console.log(`   Total Issues:   ${report.totalErrors + report.totalWarnings}`);
  console.log(`   Files Affected: ${Object.keys(report.byFile).length}\n`);

  console.log('📂 ERRORS BY CATEGORY');
  console.log('───────────────────────────────────────────────────────────────');
  const categoryOrder = ['syntax', 'type', 'a11y', 'import', 'svelte5'];
  const categoryLabels = {
    syntax: '🔧 Syntax Errors    ',
    type: '📝 Type Errors      ',
    a11y: '♿ A11y Warnings    ',
    import: '📦 Import Errors    ',
    svelte5: '⚡ Svelte5 Errors   ',
  };

  for (const cat of categoryOrder) {
    const count = report.byCategory[cat] || 0;
    const percentage = entries.length > 0 ? ((count / entries.length) * 100).toFixed(1) : '0.0';
    const bar = '█'.repeat(Math.round(count / Math.max(entries.length, 1) * 30));
    console.log(`   ${categoryLabels[cat]}: ${count.toString().padStart(5)} (${percentage.padStart(5)}%) ${bar}`);
  }

  console.log('\n📁 TOP 20 FILES WITH MOST ERRORS');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('   Rank │ Count │ File');
  console.log('   ─────┼───────┼────────────────────────────────────────────────');

  report.topFiles.slice(0, 20).forEach((item, idx) => {
    const rank = (idx + 1).toString().padStart(4);
    const count = item.count.toString().padStart(5);
    // Extract just the relative path from src/
    const srcIndex = item.file.indexOf('src/');
    const displayPath = srcIndex >= 0 ? item.file.slice(srcIndex) : item.file;
    const fileName = displayPath.length > 48
      ? '...' + displayPath.slice(-45)
      : displayPath;
    console.log(`   ${rank} │ ${count} │ ${fileName}`);
  });

  // Calculate fixable statistics
  const fixableCount = entries.filter(e => e.fixable).length;
  const fixablePercentage = entries.length > 0 ? ((fixableCount / entries.length) * 100).toFixed(1) : '0.0';

  console.log('\n🔧 FIXABILITY ANALYSIS');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`   Automatically Fixable: ${fixableCount} (${fixablePercentage}%)`);
  console.log(`   Manual Review Needed:  ${entries.length - fixableCount} (${(100 - parseFloat(fixablePercentage)).toFixed(1)}%)`);

  // Count by fix pattern
  const byFixPattern = {};
  for (const entry of entries) {
    if (entry.fixPattern) {
      byFixPattern[entry.fixPattern] = (byFixPattern[entry.fixPattern] || 0) + 1;
    }
  }

  if (Object.keys(byFixPattern).length > 0) {
    console.log('\n   Fix Patterns Available:');
    for (const [pattern, count] of Object.entries(byFixPattern).sort((a, b) => b[1] - a[1])) {
      console.log(`     • ${pattern}: ${count} errors`);
    }
  }

  // Show sample errors by category
  console.log('\n📋 SAMPLE ERRORS BY CATEGORY');
  console.log('───────────────────────────────────────────────────────────────');

  for (const cat of categoryOrder) {
    const catErrors = entries.filter(e => e.category === cat);
    if (catErrors.length > 0) {
      console.log(`\n   ${categoryLabels[cat].trim()}:`);
      const samples = catErrors.slice(0, 2);
      for (const sample of samples) {
        const shortFile = sample.file.split('/').slice(-2).join('/');
        const shortMsg = sample.message.length > 60
          ? sample.message.slice(0, 57) + '...'
          : sample.message;
        console.log(`     • ${shortFile}:${sample.line} - ${shortMsg}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`✅ Full report saved to: ${reportPath}`);
  console.log(`✅ Raw entries saved to: ${entriesPath}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Return exit code based on error count (for CI integration)
  if (report.totalErrors > 500) {
    console.log(`⚠️  Error count (${report.totalErrors}) exceeds target threshold (500)`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
