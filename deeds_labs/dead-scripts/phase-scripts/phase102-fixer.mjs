#!/usr/bin/env node
/**
 * Phase 102: Refined Error Fixer
 * Targets revealed type errors after Phase 101 transformation
 * Focus: TS1005 (10,532), TS1128 (1,527), TS1109 (698), TS1434 (599)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// Phase 102 refined patterns
const PATTERNS = {
  // TS1005: ',' expected - object destructuring with type annotations
  destructure_param_comma: {
    pattern: /\(\s*\{\s*(\w+)\s*:\s*(\w+)\s*\}\s*:\s*(\w+)\s*\)/g,
    replacement: '({ $1 }: $3)',
    description: '({ name: string }: Type) → ({ name }: Type)',
    targetErrors: ['TS1005'],
  },

  // TS1005: ':' expected - function params with incorrect syntax
  function_param_colon: {
    pattern: /function\s+(\w+)\s*\(\s*(\w+)\s*,\s*(\w+)\s*:\s*(\w+)\s*\)/g,
    replacement: 'function $1($2, $3: $4)',
    description: 'function foo(a, b: string) - fix param positioning',
    targetErrors: ['TS1005'],
  },

  // TS1005: ';' expected - missing semicolons in declarations
  missing_semicolon_declaration: {
    pattern: /^(\s*)(export\s+)?(const|let|var|type|interface)\s+(\w+)\s*=\s*([^;]+)$/gm,
    replacement: (match, indent, exp, keyword, name, value) => {
      if (value.includes('\n') || value.trim().endsWith('}')) return match;
      return `${indent}${exp || ''}${keyword} ${name} = ${value};`;
    },
    description: 'Add missing semicolons to declarations',
    targetErrors: ['TS1005'],
  },

  // TS1128: Declaration or statement expected
  unexpected_closing_brace: {
    pattern: /^\s*\}\s*;\s*$/gm,
    replacement: '}',
    description: 'Remove unnecessary semicolon after closing brace',
    targetErrors: ['TS1128'],
  },

  // TS1128: export placement issues
  export_after_declaration: {
    pattern: /^(\s*)(const|let|var|function|class)\s+(\w+)([^;{]+);\s*export\s*\{\s*\3\s*\}/gm,
    replacement: '$1export $2 $3$4;',
    description: 'Move export before declaration',
    targetErrors: ['TS1128'],
  },

  // TS1109: Expression expected - incomplete ternary
  incomplete_ternary: {
    pattern: /\?\s*:\s*([^;,)\]}]+)/g,
    replacement: (match, consequent) => {
      return `? ${consequent.trim()} : ${consequent.trim()}`;
    },
    description: 'Fix incomplete ternary expressions',
    targetErrors: ['TS1109'],
  },

  // TS1434: Unexpected keyword - duplicate modifiers
  duplicate_export: {
    pattern: /export\s+export\s+/g,
    replacement: 'export ',
    description: 'Remove duplicate export keyword',
    targetErrors: ['TS1434'],
  },

  // TS1135: Argument expression expected
  trailing_comma_in_call: {
    pattern: /(\w+)\(([^)]+),\s*\)/g,
    replacement: '$1($2)',
    description: 'Remove trailing comma in function calls',
    targetErrors: ['TS1135'],
  },

  // TS1136: Property assignment expected
  object_literal_colon_fix: {
    pattern: /\{\s*(\w+)\s*,\s*(\w+)\s*:\s*(\w+)\s*\}/g,
    replacement: '{ $1, $2: $3 }',
    description: 'Fix object literal property assignments',
    targetErrors: ['TS1136'],
  },

  // TS1005: Optional chaining with type assertion
  optional_chain_assertion: {
    pattern: /(\w+)\?\s*as\s+(\w+)/g,
    replacement: '($1 as $2)',
    description: 'Fix optional chaining with type assertion',
    targetErrors: ['TS1005'],
  },

  // TS1005: Array destructuring syntax
  array_destructure_fix: {
    pattern: /const\s+\[\s*(\w+)\s*:\s*(\w+)\s*\]/g,
    replacement: 'const [$1]',
    description: 'Remove type annotation from array destructuring',
    targetErrors: ['TS1005'],
  },

  // TS1128: Misplaced async keyword
  async_placement: {
    pattern: /(\w+)\s+async\s+function/g,
    replacement: 'async $1 function',
    description: 'Fix async keyword placement',
    targetErrors: ['TS1128'],
  },
};

// Statistics
const stats = {
  filesScanned: 0,
  filesModified: 0,
  totalFixes: 0,
  patternStats: Object.fromEntries(
    Object.keys(PATTERNS).map(key => [key, 0])
  ),
};

/**
 * Recursively find all TypeScript files
 */
function findTypeScriptFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules, .svelte-kit, build, etc.
      if (!['node_modules', '.svelte-kit', 'build', '.git', 'dist'].includes(file)) {
        findTypeScriptFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // Skip .d.ts files (type definitions)
      if (!file.endsWith('.d.ts')) {
        fileList.push(filePath);
      }
    }
  }

  return fileList;
}

/**
 * Apply patterns to a file
 */
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fileFixes = 0;
  const filePatterns = [];

  for (const [patternName, config] of Object.entries(PATTERNS)) {
    let matchCount = 0;

    if (typeof config.replacement === 'function') {
      content = content.replace(config.pattern, (...args) => {
        matchCount++;
        return config.replacement(...args);
      });
    } else {
      const matches = content.match(config.pattern);
      if (matches) {
        matchCount = matches.length;
        content = content.replace(config.pattern, config.replacement);
      }
    }

    if (matchCount > 0) {
      stats.patternStats[patternName] += matchCount;
      fileFixes += matchCount;
      filePatterns.push({ pattern: patternName, count: matchCount });
    }
  }

  if (fileFixes > 0) {
    stats.filesModified++;
    stats.totalFixes += fileFixes;

    if (VERBOSE) {
      console.log(`\n📝 ${path.relative(process.cwd(), filePath)}`);
      filePatterns.forEach(({ pattern, count }) => {
        console.log(`   ├─ ${pattern}: ${count} fix(es)`);
      });
    }

    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
    }

    return {
      file: path.relative(process.cwd(), filePath),
      fixes: fileFixes,
      patterns: filePatterns,
    };
  }

  return null;
}

/**
 * Main execution
 */
function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         PHASE 102: REFINED ERROR FIXER                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '✍️  LIVE'}`);
  console.log(`Patterns: ${Object.keys(PATTERNS).length} refined patterns\n`);

  const srcDir = path.join(__dirname, '..', 'src');
  const files = findTypeScriptFiles(srcDir);

  console.log(`📂 Scanning ${files.length} TypeScript files...\n`);

  const results = [];
  let progressCounter = 0;

  for (const file of files) {
    stats.filesScanned++;
    progressCounter++;

    if (!VERBOSE && progressCounter % 100 === 0) {
      process.stdout.write(`\r   Progress: ${progressCounter}/${files.length} files scanned...`);
    }

    const result = processFile(file);
    if (result) {
      results.push(result);
    }
  }

  if (!VERBOSE) {
    console.log(`\r   Progress: ${files.length}/${files.length} files scanned ✓      \n`);
  }

  // Display results
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    RESULTS SUMMARY                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Files scanned: ${stats.filesScanned}`);
  console.log(`Files with fixes: ${stats.filesModified}`);
  console.log(`Total fixes: ${stats.totalFixes}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes made)' : 'LIVE (files updated)'}\n`);

  console.log('📊 Pattern Breakdown:\n');
  const sortedPatterns = Object.entries(stats.patternStats)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [pattern, count] of sortedPatterns) {
    const percentage = ((count / stats.totalFixes) * 100).toFixed(1);
    const description = PATTERNS[pattern].description;
    console.log(`   ${pattern}: ${count} fixes (${percentage}%)`);
    console.log(`      └─ ${description}\n`);
  }

  if (results.length > 0) {
    console.log('\n🎯 Top 10 Files with Most Fixes:\n');
    const topFiles = results
      .sort((a, b) => b.fixes - a.fixes)
      .slice(0, 10);

    for (const { file, fixes } of topFiles) {
      console.log(`   ${file}: ${fixes} fixes`);
    }
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'live',
    phase: 102,
    statistics: stats,
    patterns: Object.entries(PATTERNS).map(([name, config]) => ({
      name,
      description: config.description,
      targetErrors: config.targetErrors,
      fixes: stats.patternStats[name],
    })),
    topFiles: results.slice(0, 20),
  };

  const reportPath = path.join(
    __dirname,
    '..',
    'reports',
    `phase102-fixer-${DRY_RUN ? 'dryrun' : 'live'}.json`
  );

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved: ${reportPath}\n`);

  if (DRY_RUN) {
    console.log('💡 To apply fixes, run: node scripts/phase102-fixer.mjs --apply\n');
  }
}

main();
