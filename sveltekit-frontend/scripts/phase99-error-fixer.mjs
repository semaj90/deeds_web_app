#!/usr/bin/env node
/**
 * Phase 99: Automated Error Fixing Pipeline with Chunking
 *
 * Strategy:
 * 1. Run svelte-check to get all errors
 * 2. Chunk errors by file (max 50 files per batch)
 * 3. Identify error patterns (syntax, types, imports)
 * 4. Apply fixes with dry-run first
 * 5. Verify each batch before committing
 * 6. Compare ts-check vs svelte-check results
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '50');
const MAX_ITERATIONS = parseInt(process.argv.find(arg => arg.startsWith('--max='))?.split('=')[1] || '5');

// Common error patterns and their fixes
const ERROR_PATTERNS = [
  {
    name: 'comma_instead_of_colon',
    pattern: /:\s*(\w+),\s*(\w+)\s*}/g,
    description: 'Fix type syntax: { prop, type } → { prop: type }',
    fix: (match, prop, type) => `: ${prop}: ${type} }`
  },
  {
    name: 'missing_type_import',
    pattern: /import\s+{\s*(\w+)\s*}\s+from\s+['"]([^'"]+)['"]/g,
    description: 'Add type keyword for type-only imports',
    check: (content, match, name) => {
      // Check if used only as type
      const typeOnlyRegex = new RegExp(`:\\s*${name}\\b`, 'g');
      const valueRegex = new RegExp(`\\b${name}\\s*\\(`, 'g');
      return typeOnlyRegex.test(content) && !valueRegex.test(content);
    },
    fix: (match, name, path) => `import type { ${name} } from '${path}'`
  },
  {
    name: 'optional_chaining_type',
    pattern: /(\w+)\?\s*:\s*undefined/g,
    description: 'Simplify optional with undefined: prop?: undefined → prop?: Type',
    fix: (match, prop) => `${prop}?: unknown`
  },
  {
    name: 'function_param_colon',
    pattern: /\((\w+):\s+([^,)]+)\s*,/g,
    description: 'Fix function param syntax errors',
    fix: (match, param, rest) => `(${param}, ${rest},`
  }
];

class ErrorFixer {
  constructor() {
    this.errors = [];
    this.fixedFiles = new Set();
    this.stats = {
      totalErrors: 0,
      errorsByFile: {},
      fixesByPattern: {},
      batches: []
    };
  }

  async run() {
    console.log('🚀 Phase 99: Automated Error Fixing Pipeline\n');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`Batch Size: ${BATCH_SIZE} files`);
    console.log(`Max Iterations: ${MAX_ITERATIONS}\n`);

    // Step 1: Collect all errors
    await this.collectErrors();

    // Step 2: Group errors by file
    const fileGroups = this.groupErrorsByFile();

    // Step 3: Process in batches
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      console.log(`\n📦 Iteration ${i + 1}/${MAX_ITERATIONS}`);

      const batch = this.createBatch(fileGroups, i);
      if (batch.length === 0) {
        console.log('✅ No more files to process');
        break;
      }

      await this.processBatch(batch, i);

      // Re-check errors after batch
      await this.collectErrors();

      if (this.stats.totalErrors === 0) {
        console.log('\n🎉 All errors fixed!');
        break;
      }
    }

    // Step 4: Final comparison
    await this.compareCheckers();

    // Step 5: Generate report
    this.generateReport();
  }

  async collectErrors() {
    console.log('📊 Collecting errors from svelte-check...');

    try {
      const output = execSync('npx svelte-check --threshold error 2>&1', {
        encoding: 'utf-8',
        cwd: process.cwd(),
        maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large output
      });

      this.parseErrors(output);
    } catch (error) {
      // svelte-check exits with error code when errors found
      const output = error.stdout || error.stderr || '';
      if (output) {
        this.parseErrors(output);
      }
    }

    console.log(`Found ${this.stats.totalErrors} errors in ${Object.keys(this.stats.errorsByFile).length} files\n`);
  }  parseErrors(output) {
    this.errors = [];
    this.stats.errorsByFile = {};

    const lines = output.split('\n');
    let currentFile = null;

    for (const line of lines) {
      // Parse machine format: filename:line:col: error: message
      const match = line.match(/^(.+?):(\d+):(\d+):\s*error:\s*(.+)$/);
      if (match) {
        const [, file, line, col, message] = match;
        const error = { file, line: parseInt(line), col: parseInt(col), message };

        this.errors.push(error);

        if (!this.stats.errorsByFile[file]) {
          this.stats.errorsByFile[file] = [];
        }
        this.stats.errorsByFile[file].push(error);
      }
    }

    this.stats.totalErrors = this.errors.length;
  }

  groupErrorsByFile() {
    const groups = Object.entries(this.stats.errorsByFile)
      .map(([file, errors]) => ({
        file,
        count: errors.length,
        errors
      }))
      .sort((a, b) => b.count - a.count); // Highest error count first

    return groups;
  }

  createBatch(fileGroups, iteration) {
    const start = iteration * BATCH_SIZE;
    const end = start + BATCH_SIZE;
    return fileGroups.slice(start, end);
  }

  async processBatch(batch, iteration) {
    console.log(`Processing ${batch.length} files...`);

    const batchStats = {
      iteration,
      files: batch.length,
      fixes: 0,
      errors: batch.reduce((sum, g) => sum + g.count, 0)
    };

    for (const group of batch) {
      console.log(`  📄 ${group.file} (${group.count} errors)`);

      const fixes = await this.fixFile(group);
      batchStats.fixes += fixes;
    }

    this.stats.batches.push(batchStats);

    console.log(`✅ Batch complete: ${batchStats.fixes} fixes applied`);
  }

  async fixFile(group) {
    const filePath = path.resolve(process.cwd(), group.file);

    if (!fs.existsSync(filePath)) {
      console.log(`    ⚠️  File not found: ${filePath}`);
      return 0;
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    let fixCount = 0;

    // Try each error pattern
    for (const pattern of ERROR_PATTERNS) {
      const matches = [...content.matchAll(pattern.pattern)];

      if (matches.length > 0) {
        console.log(`    🔧 Applying ${pattern.name}: ${matches.length} matches`);

        for (const match of matches) {
          // Check if fix should apply
          if (pattern.check && !pattern.check(content, match[0], ...match.slice(1))) {
            continue;
          }

          const replacement = pattern.fix(...match);
          content = content.replace(match[0], replacement);
          fixCount++;
        }

        if (!this.stats.fixesByPattern[pattern.name]) {
          this.stats.fixesByPattern[pattern.name] = 0;
        }
        this.stats.fixesByPattern[pattern.name] += matches.length;
      }
    }

    // Write changes if not dry-run
    if (fixCount > 0) {
      if (DRY_RUN) {
        console.log(`    💾 [DRY RUN] Would save ${fixCount} fixes to ${group.file}`);
      } else {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`    ✅ Saved ${fixCount} fixes to ${group.file}`);
        this.fixedFiles.add(group.file);
      }
    }

    return fixCount;
  }

  async compareCheckers() {
    console.log('\n📊 Comparing ts-check vs svelte-check...\n');

    // Run tsc
    console.log('Running tsc...');
    let tscErrors = 0;
    try {
      execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8', cwd: process.cwd() });
    } catch (error) {
      const output = error.stdout || '';
      const matches = output.match(/Found (\d+) error/);
      if (matches) {
        tscErrors = parseInt(matches[1]);
      }
    }

    // Run svelte-check
    console.log('Running svelte-check...');
    let svelteErrors = 0;
    try {
      execSync('npx svelte-check --threshold error 2>&1', { encoding: 'utf-8', cwd: process.cwd() });
    } catch (error) {
      const output = error.stdout || '';
      const matches = output.match(/found (\d+) error/);
      if (matches) {
        svelteErrors = parseInt(matches[1]);
      }
    }

    console.log('\n📈 Comparison Results:');
    console.log(`  TypeScript (tsc):      ${tscErrors.toLocaleString()} errors`);
    console.log(`  Svelte (svelte-check): ${svelteErrors.toLocaleString()} errors`);
    console.log(`  Difference:            ${Math.abs(tscErrors - svelteErrors).toLocaleString()}`);
  }

  generateReport() {
    console.log('\n📝 Final Report\n');
    console.log('═'.repeat(60));

    console.log('\n📊 Statistics:');
    console.log(`  Total Errors Found:    ${this.stats.totalErrors.toLocaleString()}`);
    console.log(`  Files Analyzed:        ${Object.keys(this.stats.errorsByFile).length}`);
    console.log(`  Files Fixed:           ${this.fixedFiles.size}`);
    console.log(`  Batches Processed:     ${this.stats.batches.length}`);

    console.log('\n🔧 Fixes by Pattern:');
    for (const [pattern, count] of Object.entries(this.stats.fixesByPattern)) {
      console.log(`  ${pattern.padEnd(30)} ${count.toLocaleString()}`);
    }

    console.log('\n📦 Batch Summary:');
    for (const batch of this.stats.batches) {
      console.log(`  Iteration ${batch.iteration + 1}: ${batch.files} files, ${batch.fixes} fixes`);
    }

    // Save report to file
    const report = {
      timestamp: new Date().toISOString(),
      mode: DRY_RUN ? 'DRY_RUN' : 'LIVE',
      stats: this.stats,
      fixedFiles: [...this.fixedFiles]
    };

    const reportPath = path.join(process.cwd(), 'reports', 'phase99-error-fixing-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n💾 Report saved to: ${reportPath}`);
  }
}

// Run the fixer
const fixer = new ErrorFixer();
fixer.run().catch(console.error);
