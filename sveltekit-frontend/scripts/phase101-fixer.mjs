#!/usr/bin/env node
/**
 * Phase 101: Advanced Error Fixer - TS1128, TS1109, TS1136 patterns
 * New patterns for structural/syntax errors beyond function params
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Phase 101 patterns for TS1128, TS1109, TS1136
const PHASE_101_PATTERNS = {
  // TS1128/TS1109: `as string : undefined` → `as string | undefined`
  type_assertion_union: {
    regex: /as\s+(\w+)\s*:\s*(undefined|null|\w+)/g,
    replacement: (match, type1, type2) => `as ${type1} | ${type2}`,
    description: 'Fix type assertion syntax: as string : undefined → as string | undefined'
  },

  // TS1128: `{ task, DocumentReviewTask }` → `{ task: DocumentReviewTask }`
  object_destructure_type: {
    regex: /{\s*(\w+),\s*([A-Z]\w+)\s*}/g,
    replacement: (match, param, type) => {
      // Only if second word starts with capital (likely a type)
      if (/^[A-Z]/.test(type)) {
        return `{ ${param}: ${type} }`;
      }
      return match;
    },
    description: 'Fix object destructuring with types: { task, TaskType } → { task: TaskType }'
  },

  // TS1128: `{ assignedAgents, string[] }` → `{ assignedAgents: string[] }`
  object_type_annotation: {
    regex: /{\s*(\w+),\s*([\w\[\]<>|&]+)\s*}/g,
    replacement: (match, param, type) => {
      // Only if type contains [], <>, |, & (type indicators)
      if (/[\[\]<>|&]/.test(type) || /^(string|number|boolean|any|unknown|void)$/.test(type)) {
        return `{ ${param}: ${type} }`;
      }
      return match;
    },
    description: 'Fix object type annotations: { value, string[] } → { value: string[] }'
  },

  // TS1136: Property assignment in object literals (already handled by comma_vs_colon_in_types, but more aggressive)
  property_colon_fix: {
    regex: /{\s*(\w+)\s*,\s*(\w+)\s*:/g,
    replacement: (match, key, value) => `{ ${key}: ${value}:`,
    description: 'Fix property assignment: { key, value: → { key: value:'
  },

  // TS1109: Missing expression after colon in ternary or type
  missing_expression_after_colon: {
    regex: /\?\s*:\s*(?=[,\)\}])/g,
    replacement: '? undefined :',
    description: 'Fix missing expression in ternary: ? : → ? undefined :'
  },

  // Continue with existing working patterns from phase99-enhanced-fixer
  comma_vs_colon_in_types: {
    regex: /{\s*(\w+),\s*(number|string|boolean|any|unknown)\s*}/g,
    replacement: (match, prop, type) => `{ ${prop}: ${type} }`,
    description: 'Fix comma vs colon in type definitions'
  },

  function_param_syntax: {
    regex: /\((\w+):\s*([^)]+)\)/g,
    replacement: (match, param, value) => {
      // Only fix if it looks like a value, not a type
      if (value.includes('"') || value.includes("'") || /^\d+$/.test(value) || value === 'true' || value === 'false') {
        return `(${param}, ${value})`;
      }
      return match;
    },
    description: 'Fix function parameter syntax (param: value) → (param, value)'
  },

  destructuring_colon: {
    regex: /{\s*(\w+):\s*(\w+)\s*}/g,
    replacement: (match, key, value) => {
      // Only fix if both are simple identifiers (likely destructuring error)
      if (/^[a-z_$][a-z0-9_$]*$/i.test(key) && /^[a-z_$][a-z0-9_$]*$/i.test(value)) {
        return `{ ${key}, ${value} }`;
      }
      return match;
    },
    description: 'Fix destructuring syntax { done: value } → { done, value }'
  },

  math_operations: {
    regex: /Math\.(max|min|abs|floor|ceil|round)\(([^)]*):([^)]*)\)/g,
    replacement: (match, fn, arg1, arg2) => `Math.${fn}(${arg1},${arg2})`,
    description: 'Fix Math function arguments (colon → comma)'
  },

  optional_chaining: {
    regex: /(\w+)\.(\w+)\s*(?=\s*\|\||&&)/g,
    replacement: (match, obj, prop) => `${obj}?.${prop}`,
    description: 'Add optional chaining for property access (conservative)'
  },

  nullish_coalescing: {
    regex: /\|\|\s*(['"].*?['"]|null|undefined|\d+)/g,
    replacement: (match, fallback) => `?? ${fallback}`,
    description: 'Replace || with ?? for nullish coalescing'
  }
};

class Phase101Fixer {
  constructor(options = {}) {
    this.dryRun = options.dryRun !== false;
    this.verbose = options.verbose || false;
    this.srcDir = join(ROOT, 'src');
  }

  /**
   * Recursively find all TypeScript files
   */
  findAllTsFiles(dir = this.srcDir) {
    let files = [];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);

        try {
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip node_modules, .svelte-kit, build directories
            if (!['node_modules', '.svelte-kit', 'build', '.git'].includes(entry)) {
              files = files.concat(this.findAllTsFiles(fullPath));
            }
          } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
            files.push(fullPath);
          }
        } catch (err) {
          // Skip files we can't stat
        }
      }
    } catch (err) {
      console.error(`Error reading directory ${dir}:`, err.message);
    }

    return files;
  }

  /**
   * Apply all patterns to a file
   */
  fixFile(filePath) {
    if (!existsSync(filePath)) {
      return { file: filePath, fixes: 0, patterns: {}, skipped: true };
    }

    try {
      let content = readFileSync(filePath, 'utf-8');
      const originalContent = content;
      const appliedPatterns = {};
      let totalFixes = 0;

      // Apply each pattern
      for (const [patternName, pattern] of Object.entries(PHASE_101_PATTERNS)) {
        const matches = content.match(pattern.regex);
        if (matches && matches.length > 0) {
          appliedPatterns[patternName] = matches.length;
          totalFixes += matches.length;

          content = content.replace(pattern.regex, pattern.replacement);

          if (this.verbose) {
            console.log(`  🔧 ${patternName}: ${matches.length} fixes`);
          }
        }
      }

      // Write changes if not dry run
      if (!this.dryRun && content !== originalContent) {
        writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ Fixed ${totalFixes} issues in ${filePath}`);
      } else if (this.dryRun && totalFixes > 0) {
        console.log(`🔍 [DRY RUN] Would fix ${totalFixes} issues in ${filePath}`);
        if (this.verbose) {
          console.log(`   File: ${filePath}`);
        }
      }

      return {
        file: filePath.replace(ROOT + '\\', '').replace(ROOT + '/', ''),
        fixes: totalFixes,
        patterns: appliedPatterns,
        modified: content !== originalContent
      };
    } catch (err) {
      console.error(`Error processing ${filePath}:`, err.message);
      return { file: filePath, fixes: 0, patterns: {}, error: err.message };
    }
  }

  /**
   * Run fixer on all TypeScript files
   */
  async run() {
    console.log(`\n🚀 Phase 101: Advanced Error Fixer\n`);
    console.log(`Mode: ${this.dryRun ? '🔍 DRY RUN' : '✅ LIVE'}`);
    console.log(`Target: All TypeScript files in src/`);
    console.log(`Patterns: ${Object.keys(PHASE_101_PATTERNS).length}\n`);

    console.log(`📂 Scanning for TypeScript files...`);
    const files = this.findAllTsFiles();
    console.log(`Found ${files.length} TypeScript files\n`);

    if (files.length === 0) {
      console.log('❌ No files to process');
      return;
    }

    const results = [];
    let processedCount = 0;

    for (const file of files) {
      const result = this.fixFile(file);
      if (result.fixes > 0) {
        results.push(result);
      }

      processedCount++;
      if (processedCount % 100 === 0) {
        console.log(`   Processed ${processedCount}/${files.length} files...`);
      }
    }

    // Generate summary
    console.log(`\n${'═'.repeat(60)}\n`);
    console.log(`📊 Summary\n`);

    const totalFiles = files.length;
    const filesWithFixes = results.filter(r => r.fixes > 0).length;
    const totalFixes = results.reduce((sum, r) => sum + r.fixes, 0);

    console.log(`Files scanned: ${totalFiles}`);
    console.log(`Files with fixes: ${filesWithFixes}`);
    console.log(`Total fixes: ${totalFixes}`);
    console.log(`Mode: ${this.dryRun ? 'DRY RUN - No changes made' : 'LIVE - Files updated'}`);

    // Pattern breakdown
    const patternStats = {};
    for (const result of results) {
      for (const [pattern, count] of Object.entries(result.patterns)) {
        patternStats[pattern] = (patternStats[pattern] || 0) + count;
      }
    }

    if (Object.keys(patternStats).length > 0) {
      console.log(`\n🔧 Pattern Breakdown:`);
      for (const [pattern, count] of Object.entries(patternStats).sort((a, b) => b[1] - a[1])) {
        console.log(`   - ${pattern}: ${count} fixes`);
      }
    }

    // Show top files with most fixes
    if (results.length > 0) {
      console.log(`\n📋 Top 10 Files with Most Fixes:`);
      const topFiles = results
        .sort((a, b) => b.fixes - a.fixes)
        .slice(0, 10);

      for (const file of topFiles) {
        console.log(`   ${file.file}: ${file.fixes} fixes`);
      }
    }

    // Save results
    const reportPath = join(ROOT, 'reports', `phase101-fixer-${this.dryRun ? 'dryrun' : 'live'}.json`);
    writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      mode: this.dryRun ? 'dry-run' : 'live',
      summary: {
        filesScanned: totalFiles,
        filesWithFixes,
        totalFixes,
        patternStats
      },
      results: results.slice(0, 100) // Save top 100 files
    }, null, 2), 'utf-8');

    console.log(`\n💾 Report saved: ${reportPath}`);

    if (this.dryRun) {
      console.log(`\n💡 Run with --apply flag to make actual changes`);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const verbose = args.includes('--verbose') || args.includes('-v');

const fixer = new Phase101Fixer({ dryRun, verbose });
fixer.run().catch(console.error);
