#!/usr/bin/env node

/**
 * Automated Svelte Error Fixer - Phase 1
 * Fixes high-frequency syntax errors using regex patterns
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

const BACKUP_DIR = '.svelte-error-fixes-backup';
const DRY_RUN = process.argv.includes('--dry-run');

class SvelteErrorFixer {
  constructor() {
    this.stats = {
      filesProcessed: 0,
      filesModified: 0,
      errorsPotentiallyFixed: 0,
      backupsCreated: 0
    };
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m'
    };
    const color = colors[type] || colors.info;
    console.log(`${color}${message}\x1b[0m`);
  }

  /**
   * Phase 1 Fix: Replace semicolons with commas in object literals
   */
  fixObjectLiteralSemicolons(content) {
    let modified = content;
    let fixCount = 0;

    // Pattern 1: String values followed by semicolon
    // Example: property: 'value'; → property: 'value',
    const stringPattern = /(\w+:\s*['"][^'"]+['"])\s*;(\s*(?:\w+:|}))/g;
    const stringMatches = [...modified.matchAll(stringPattern)].length;
    modified = modified.replace(stringPattern, '$1,$2');
    fixCount += stringMatches;

    // Pattern 2: Numeric values followed by semicolon
    // Example: count: 5; → count: 5,
    const numericPattern = /(\w+:\s*\d+(?:\.\d+)?)\s*;(\s*(?:\w+:|}))/g;
    const numericMatches = [...modified.matchAll(numericPattern)].length;
    modified = modified.replace(numericPattern, '$1,$2');
    fixCount += numericMatches;

    // Pattern 3: Boolean values followed by semicolon
    // Example: enabled: true; → enabled: true,
    const booleanPattern = /(\w+:\s*(?:true|false))\s*;(\s*(?:\w+:|}))/g;
    const booleanMatches = [...modified.matchAll(booleanPattern)].length;
    modified = modified.replace(booleanPattern, '$1,$2');
    fixCount += booleanMatches;

    // Pattern 4: Array/Object literals followed by semicolon
    // Example: items: []; → items: [],
    const arrayObjPattern = /(\w+:\s*(?:\[\]|\{\}))\s*;(\s*(?:\w+:|}))/g;
    const arrayObjMatches = [...modified.matchAll(arrayObjPattern)].length;
    modified = modified.replace(arrayObjPattern, '$1,$2');
    fixCount += arrayObjMatches;

    return { content: modified, fixCount };
  }

  /**
   * Phase 1 Fix: Remove semicolons after spread operators in $props()
   */
  fixPropsSpreadSemicolon(content) {
    let modified = content;
    let fixCount = 0;

    // Pattern: ...restProp; } : Props = $props()
    const spreadPattern = /(\.\.\.\w+)\s*;(\s*}\s*:\s*\w+\s*=\s*\$props\(\))/g;
    const matches = [...modified.matchAll(spreadPattern)].length;
    modified = modified.replace(spreadPattern, '$1$2');
    fixCount += matches;

    return { content: modified, fixCount };
  }

  /**
   * Phase 1 Fix: Add default values for empty prop assignments
   */
  fixMissingDefaultValues(content) {
    let modified = content;
    let fixCount = 0;

    // Pattern: property = , (missing default value)
    // Replace with property = {},
    const emptyPattern = /(\w+)\s*=\s*,/g;
    const matches = [...modified.matchAll(emptyPattern)].length;
    modified = modified.replace(emptyPattern, '$1 = {},');
    fixCount += matches;

    return { content: modified, fixCount };
  }

  /**
   * Apply all Phase 1 fixes to content
   */
  applyAllFixes(content) {
    let result = content;
    let totalFixes = 0;

    const fix1 = this.fixObjectLiteralSemicolons(result);
    result = fix1.content;
    totalFixes += fix1.fixCount;

    const fix2 = this.fixPropsSpreadSemicolon(result);
    result = fix2.content;
    totalFixes += fix2.fixCount;

    const fix3 = this.fixMissingDefaultValues(result);
    result = fix3.content;
    totalFixes += fix3.fixCount;

    return { content: result, fixCount: totalFixes };
  }

  /**
   * Create backup of file before modifying
   */
  async createBackup(filePath, content) {
    const backupPath = path.join(BACKUP_DIR, filePath);
    const backupDir = path.dirname(backupPath);

    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(backupPath, content, 'utf8');
    this.stats.backupsCreated++;
  }

  /**
   * Process a single file
   */
  async processFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const { content: fixedContent, fixCount } = this.applyAllFixes(content);

      this.stats.filesProcessed++;

      if (fixCount > 0) {
        if (DRY_RUN) {
          this.log(`[DRY RUN] Would fix ${fixCount} errors in: ${filePath}`, 'warning');
        } else {
          await this.createBackup(filePath, content);
          await fs.writeFile(filePath, fixedContent, 'utf8');
          this.log(`✅ Fixed ${fixCount} errors in: ${filePath}`, 'success');
        }

        this.stats.filesModified++;
        this.stats.errorsPotentiallyFixed += fixCount;
      }
    } catch (error) {
      this.log(`❌ Error processing ${filePath}: ${error.message}`, 'error');
    }
  }

  /**
   * Process all Svelte files in directory
   */
  async processDirectory(pattern) {
    const files = await glob(pattern, {
      cwd: process.cwd(),
      ignore: ['node_modules/**', '.svelte-kit/**', 'build/**']
    });

    this.log(`Found ${files.length} files to process`, 'info');

    for (const file of files) {
      await this.processFile(file);
    }
  }

  /**
   * Print statistics
   */
  printStats() {
    console.log('\n' + '='.repeat(60));
    this.log('Svelte Error Fixer - Statistics', 'info');
    console.log('='.repeat(60));
    console.log(`Files Processed:       ${this.stats.filesProcessed}`);
    console.log(`Files Modified:        ${this.stats.filesModified}`);
    console.log(`Errors Fixed:          ${this.stats.errorsPotentiallyFixed}`);
    console.log(`Backups Created:       ${this.stats.backupsCreated}`);
    console.log('='.repeat(60) + '\n');
  }
}

// Main execution
async function main() {
  const fixer = new SvelteErrorFixer();

  fixer.log('🚀 Svelte Error Fixer - Phase 1 (Automated)', 'info');

  if (DRY_RUN) {
    fixer.log('Running in DRY RUN mode - no files will be modified', 'warning');
  }

  // Process all .svelte files in src/lib/components
  await fixer.processDirectory('sveltekit-frontend/src/lib/components/**/*.svelte');

  // Process routes
  await fixer.processDirectory('sveltekit-frontend/src/routes/**/*.svelte');

  fixer.printStats();

  if (DRY_RUN) {
    fixer.log('\nRun without --dry-run flag to apply fixes', 'warning');
  } else {
    fixer.log(`\nBackups stored in: ${BACKUP_DIR}`, 'info');
    fixer.log('Next: Run "npm run svelte:check:log" to verify fixes', 'success');
  }
}

main().catch(console.error);
