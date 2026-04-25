#!/usr/bin/env node
/**
 * Automated Syntax Fix Script
 * Targets: Unterminated strings, missing brackets, common syntax errors
 *
 * Run: node scripts/fix-syntax-errors.mjs
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

let stats = {
  filesScanned: 0,
  filesFixed: 0,
  unterminatedStrings: 0,
  missingBraces: 0,
  missingParens: 0,
  fixedSemicolons: 0
};

/**
 * Fix unterminated string literals
 */
function fixUnterminatedStrings(content) {
  let fixed = content;
  let fixes = 0;

  // Match unterminated strings at end of line
  const lines = content.split('\n');
  const fixedLines = lines.map((line, idx) => {
    // Check for unterminated single/double quotes
    const singleQuotes = (line.match(/'/g) || []).length;
    const doubleQuotes = (line.match(/"/g) || []).length;
    const backticks = (line.match(/`/g) || []).length;

    // Skip lines with comments
    if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
      return line;
    }

    // Fix odd number of quotes (likely unterminated)
    if (singleQuotes % 2 !== 0 && !line.includes('"') && !line.includes('`')) {
      fixes++;
      return line + "'";
    }
    if (doubleQuotes % 2 !== 0 && !line.includes("'") && !line.includes('`')) {
      fixes++;
      return line + '"';
    }
    if (backticks % 2 !== 0) {
      fixes++;
      return line + '`';
    }

    return line;
  });

  stats.unterminatedStrings += fixes;
  return fixedLines.join('\n');
}

/**
 * Fix missing closing braces
 */
function fixMissingBraces(content) {
  const openBraces = (content.match(/{/g) || []).length;
  const closeBraces = (content.match(/}/g) || []).length;

  if (openBraces > closeBraces) {
    const diff = openBraces - closeBraces;
    stats.missingBraces += diff;
    return content + '\n' + '}'.repeat(diff) + '\n';
  }

  return content;
}

/**
 * Fix missing closing parentheses
 */
function fixMissingParens(content) {
  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;

  if (openParens > closeParens) {
    const diff = openParens - closeParens;
    stats.missingParens += diff;
    return content + ')'.repeat(diff);
  }

  return content;
}

/**
 * Fix missing semicolons (common pattern)
 */
function fixMissingSemicolons(content) {
  let fixed = content;
  let fixes = 0;

  // Add semicolon after variable declarations without it
  fixed = fixed.replace(/(const|let|var)\s+\w+\s*=\s*[^;]+$/gm, (match) => {
    if (!match.trim().endsWith(';') && !match.trim().endsWith(',')) {
      fixes++;
      return match + ';';
    }
    return match;
  });

  stats.fixedSemicolons += fixes;
  return fixed;
}

/**
 * Main fix function
 */
async function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Apply fixes in order
    content = fixUnterminatedStrings(content);
    content = fixMissingBraces(content);
    content = fixMissingParens(content);
    content = fixMissingSemicolons(content);

    // Only write if changes were made
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      stats.filesFixed++;
      return true;
    }

    return false;
  } catch (error) {
    log(`Error processing ${filePath}: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  log('\n╔══════════════════════════════════════════════════╗', 'cyan');
  log('║  Automated Syntax Error Fix - YoRHa Detective  ║', 'cyan');
  log('╚══════════════════════════════════════════════════╝\n', 'cyan');

  // Find all TypeScript files
  log('🔍 Scanning for TypeScript files...', 'cyan');
  const files = await glob('src/**/*.ts', {
    ignore: [
      '**/node_modules/**',
      '**/.svelte-kit/**',
      '**/build/**',
      '**/*.d.ts' // Skip type definitions
    ]
  });

  stats.filesScanned = files.length;
  log(`📁 Found ${files.length} TypeScript files\n`, 'green');

  // Process files
  log('🔧 Applying automated fixes...\n', 'yellow');

  for (const file of files) {
    const fixed = await fixFile(file);
    if (fixed) {
      const relPath = path.relative(process.cwd(), file);
      log(`  ✅ Fixed: ${relPath}`, 'green');
    }

    // Progress indicator
    if (stats.filesScanned > 0 && stats.filesFixed % 10 === 0) {
      const progress = ((stats.filesFixed / stats.filesScanned) * 100).toFixed(1);
      process.stdout.write(`\r  Progress: ${progress}%`);
    }
  }

  console.log('\n');

  // Report
  log('═══════════════════════════════════════', 'cyan');
  log('REPAIR SUMMARY', 'cyan');
  log('═══════════════════════════════════════', 'cyan');
  log(`Files Scanned:         ${stats.filesScanned}`, 'blue');
  log(`Files Fixed:           ${stats.filesFixed}`, 'green');
  log(`Unterminated Strings:  ${stats.unterminatedStrings}`, 'yellow');
  log(`Missing Braces:        ${stats.missingBraces}`, 'yellow');
  log(`Missing Parentheses:   ${stats.missingParens}`, 'yellow');
  log(`Fixed Semicolons:      ${stats.fixedSemicolons}`, 'yellow');
  log('═══════════════════════════════════════\n', 'cyan');

  if (stats.filesFixed > 0) {
    log('✅ Automated fixes applied successfully!', 'green');
    log('\n💡 Next steps:', 'cyan');
    log('   1. Run: npm run check:typescript', 'blue');
    log('   2. Review changes: git diff', 'blue');
    log('   3. Commit if satisfied: git add -A && git commit -m "fix: automated syntax repairs"', 'blue');
  } else {
    log('ℹ️  No fixable issues found (or all already fixed)', 'yellow');
  }

  console.log();
}

// Run
main().catch(error => {
  log(`\n❌ Script failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
