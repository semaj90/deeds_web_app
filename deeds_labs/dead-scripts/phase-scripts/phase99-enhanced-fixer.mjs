#!/usr/bin/env node
/**
 * Phase 99: Enhanced Error Fixer with TSC-Specific Patterns
 * Includes new patterns for type annotations, imports, and null checks
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Enhanced patterns for TSC errors
const FIX_PATTERNS = {
  // Original patterns from phase99-targeted-fixer
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
    description: 'Fix Math operations with colon instead of comma'
  },

  // NEW: Type annotation patterns
  implicit_any_param: {
    regex: /function\s+(\w+)\s*\(([^:)]+)\)\s*{/g,
    replacement: (match, fnName, params) => {
      // Add : any to parameters without types
      const paramList = params.split(',').map(p => {
        const trimmed = p.trim();
        if (trimmed && !trimmed.includes(':')) {
          return `${trimmed}: any`;
        }
        return trimmed;
      }).join(', ');
      return `function ${fnName}(${paramList}) {`;
    },
    description: 'Add : any to function parameters without explicit types'
  },

  arrow_function_implicit_any: {
    regex: /\(([a-zA-Z_$][a-zA-Z0-9_$]*)\)\s*=>/g,
    replacement: (match, param) => `(${param}: any) =>`,
    description: 'Add : any to arrow function parameters'
  },

  // NEW: Import/Export patterns
  add_js_extension: {
    regex: /from\s+['"](\.[^'"]+)(?<!\.js)['"]/g,
    replacement: (match, path) => {
      // Don't add .js to already .js files or non-ts imports
      if (path.endsWith('.css') || path.endsWith('.json') || path.endsWith('.svelte')) {
        return match;
      }
      return `from '${path}.js'`;
    },
    description: 'Add .js extension to relative imports'
  },

  // DISABLED: Too aggressive, breaks default imports
  // fix_named_import: {
  //   regex: /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
  //   replacement: (match, name, path) => `import { ${name} } from '${path}'`,
  //   description: 'Convert default import to named import (requires manual verification)'
  // },

  // NEW: Null check patterns
  optional_chaining: {
    regex: /([a-zA-Z_$][a-zA-Z0-9_$]*)\[['"]?(\w+)['"]?\]/g,
    replacement: (match, obj, prop) => `${obj}?.${prop}`,
    description: 'Add optional chaining for property access (conservative)'
  },

  nullish_coalescing: {
    regex: /\|\|\s*(['"].*?['"]|null|undefined|\d+)/g,
    replacement: (match, fallback) => `?? ${fallback}`,
    description: 'Replace || with ?? for nullish coalescing'
  },

  // NEW: Type assertion patterns
  as_any_assertion: {
    regex: /:\s*any\s*=/g,
    replacement: ' as any =',
    description: 'Use type assertion instead of annotation for complex types'
  }
};

class EnhancedErrorFixer {
  constructor(options = {}) {
    this.dryRun = options.dryRun !== false;
    this.limit = options.limit || 5;
    this.verbose = options.verbose || false;
    this.jsonReportPath = options.jsonReportPath || join(ROOT, 'reports', 'phase99-ace-tsc-analysis.json');
  }

  /**
   * Load top error files from JSON report
   */
  loadTopFiles() {
    if (!existsSync(this.jsonReportPath)) {
      console.error(`❌ JSON report not found: ${this.jsonReportPath}`);
      console.log('💡 Run phase99-ast-analyzer.mjs first to generate the report');
      return [];
    }

    const report = JSON.parse(readFileSync(this.jsonReportPath, 'utf-8'));
    const topFiles = report.topFiles
      .slice(0, this.limit)
      .map(f => join(ROOT, f.file));

    console.log(`📂 Loaded ${topFiles.length} files from ACE analysis report`);
    return topFiles;
  }

  /**
   * Apply all patterns to a file
   */
  fixFile(filePath) {
    if (!existsSync(filePath)) {
      console.log(`⏭️  Skipping non-existent file: ${filePath}`);
      return { file: filePath, fixes: 0, patterns: {} };
    }

    let content = readFileSync(filePath, 'utf-8');
    const originalContent = content;
    const appliedPatterns = {};
    let totalFixes = 0;

    // Apply each pattern
    for (const [patternName, pattern] of Object.entries(FIX_PATTERNS)) {
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
    } else if (totalFixes === 0) {
      console.log(`ℹ️  No pattern matches in ${filePath}`);
    }

    return {
      file: filePath,
      fixes: totalFixes,
      patterns: appliedPatterns,
      modified: content !== originalContent
    };
  }

  /**
   * Run fixer on top files
   */
  async run() {
    console.log(`\n🚀 Phase 99: Enhanced Error Fixer\n`);
    console.log(`Mode: ${this.dryRun ? '🔍 DRY RUN' : '✅ LIVE'}`);
    console.log(`File Limit: ${this.limit}`);
    console.log(`Patterns: ${Object.keys(FIX_PATTERNS).length}\n`);

    const files = this.loadTopFiles();
    if (files.length === 0) {
      console.log('❌ No files to process');
      return;
    }

    const results = [];

    for (const file of files) {
      const result = this.fixFile(file);
      results.push(result);
    }

    // Generate summary
    console.log(`\n${'═'.repeat(60)}\n`);
    console.log(`📊 Summary\n`);

    const totalFiles = results.length;
    const filesWithFixes = results.filter(r => r.fixes > 0).length;
    const totalFixes = results.reduce((sum, r) => sum + r.fixes, 0);

    console.log(`Files processed: ${totalFiles}`);
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

    // Save results
    const reportPath = join(ROOT, 'reports', `phase99-enhanced-fixer-${this.dryRun ? 'dryrun' : 'live'}.json`);
    writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      mode: this.dryRun ? 'dry-run' : 'live',
      limit: this.limit,
      summary: {
        filesProcessed: totalFiles,
        filesWithFixes,
        totalFixes
      },
      patternStats,
      results
    }, null, 2), 'utf-8');

    console.log(`\n💾 Report saved: ${reportPath}\n`);

    if (this.dryRun) {
      console.log(`💡 Run with --apply flag to make actual changes\n`);
    }
  }
}

// CLI
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || 5;
const verbose = args.includes('--verbose') || args.includes('-v');

const fixer = new EnhancedErrorFixer({ dryRun, limit, verbose });
fixer.run().catch(console.error);
