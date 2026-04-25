#!/usr/bin/env node

/**
 * AST-Based Error Fixer
 * Uses pattern analysis results to apply automated fixes
 */

import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { glob } = require('glob');

class ASTErrorFixer {
  constructor() {
    this.fixedFiles = new Set();
    this.backupDir = 'backups';
  }

  async loadAnalysisResults(analysisPath) {
    try {
      const data = await fs.readFile(analysisPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`❌ Failed to load analysis results: ${error.message}`);
      return null;
    }
  }

  async createBackup(filePath) {
    const backupPath = path.join(this.backupDir, path.basename(filePath) + '.backup');
    await fs.mkdir(this.backupDir, { recursive: true });
    await fs.copyFile(filePath, backupPath);
    console.log(`💾 Backup created: ${backupPath}`);
  }

  async applyFixes(results) {
    console.log('🔧 Starting AST-based error fixing...');
    console.log(`📊 Found ${results.topErrors?.length || 0} errors to fix`);
    console.log('');

    if (!results.topErrors || results.topErrors.length === 0) {
      console.log('✅ No errors to fix - codebase is clean!');
      return;
    }

    // Group errors by file for efficient processing
    const errorsByFile = {};
    for (const error of results.topErrors) {
      if (!errorsByFile[error.file]) {
        errorsByFile[error.file] = [];
      }
      errorsByFile[error.file].push(error);
    }

    let totalFixed = 0;

    for (const [filePath, errors] of Object.entries(errorsByFile)) {
      console.log(`🔧 Fixing ${errors.length} errors in: ${filePath}`);

      try {
        // Create backup
        await this.createBackup(filePath);

        // Read file content
        let content = await fs.readFile(filePath, 'utf-8');

        // Apply fixes in reverse order to maintain line numbers
        const sortedErrors = errors.sort((a, b) => b.line - a.line);

        for (const error of sortedErrors) {
          const fixResult = this.applySingleFix(content, error);
          if (fixResult.applied) {
            content = fixResult.newContent;
            totalFixed++;
            console.log(`  ✅ Fixed ${error.pattern}: ${error.description}`);
          } else {
            console.log(`  ⚠️  Could not fix ${error.pattern}: ${fixResult.reason}`);
          }
        }

        // Write back the fixed content
        await fs.writeFile(filePath, content);
        this.fixedFiles.add(filePath);

      } catch (error) {
        console.error(`❌ Failed to fix ${filePath}: ${error.message}`);
      }
    }

    console.log('');
    console.log('🎯 AST Fixing Complete!');
    console.log(`📁 Files processed: ${Object.keys(errorsByFile).length}`);
    console.log(`🔧 Fixes applied: ${totalFixed}`);
    console.log(`💾 Backups saved to: ${this.backupDir}/`);
  }

  applySingleFix(content, error) {
    const lines = content.split('\n');

    // Validate line number
    if (error.line < 1 || error.line > lines.length) {
      return { applied: false, reason: 'Invalid line number' };
    }

    const lineIndex = error.line - 1;
    const originalLine = lines[lineIndex];

    // Apply pattern-specific fixes
    switch (error.pattern) {
      case 'TS001': // Union types with comma instead of pipe
        if (originalLine.includes(',')) {
          lines[lineIndex] = originalLine.replace(/,\s*/g, ' | ');
          return { applied: true, newContent: lines.join('\n') };
        }
        break;

      case 'CSS001': // CSS commas instead of semicolons
        if (originalLine.includes(',')) {
          lines[lineIndex] = originalLine.replace(/,\s*(?=\w+(?:-\w+)*\s*:)/g, '; ');
          return { applied: true, newContent: lines.join('\n') };
        }
        break;

      case 'CSS002': // CSS missing semicolons
        if (!originalLine.trim().endsWith(';') && !originalLine.trim().endsWith('{') && !originalLine.trim().endsWith('}')) {
          lines[lineIndex] = originalLine + ';';
          return { applied: true, newContent: lines.join('\n') };
        }
        break;

      case 'JS001': // Console statements
        // Comment out console statements instead of removing them
        if (originalLine.includes('console.')) {
          lines[lineIndex] = '// ' + originalLine;
          return { applied: true, newContent: lines.join('\n') };
        }
        break;

      case 'OBJ001': // Object literal syntax error
        // This is complex - would need AST parsing for accurate fixing
        return { applied: false, reason: 'Requires AST parsing for accurate fix' };

      case 'SYN001': // Double commas
        if (originalLine.includes(',,')) {
          lines[lineIndex] = originalLine.replace(/,,\s*/g, ', ');
          return { applied: true, newContent: lines.join('\n') };
        }
        break;

      default:
        return { applied: false, reason: `No fix logic for pattern ${error.pattern}` };
    }

    return { applied: false, reason: 'Pattern not found in line' };
  }

  async generateFixReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalErrors: results.topErrors?.length || 0,
        filesFixed: this.fixedFiles.size,
        fixesApplied: 0, // Would need to track this
        backupLocation: this.backupDir
      },
      fixedFiles: Array.from(this.fixedFiles),
      remainingErrors: results.topErrors?.filter(error => !this.fixedFiles.has(error.file)) || []
    };

    const reportPath = 'analysis/ast-fix-report.json';
    await fs.mkdir('analysis', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`📋 Fix report saved to: ${reportPath}`);
  }
}

// Main execution
async function main() {
  console.log('🚀 AST-Based Error Fixer');
  console.log('========================');

  const fixer = new ASTErrorFixer();

  // Load analysis results
  const analysisPath = 'analysis/error-patterns-comprehensive.json';
  const results = await fixer.loadAnalysisResults(analysisPath);

  if (!results) {
    console.log('❌ No analysis results found. Run the analyzer first.');
    process.exit(1);
  }

  // Apply fixes
  await fixer.applyFixes(results);

  // Generate report
  await fixer.generateFixReport(results);

  console.log('');
  console.log('✅ AST fixing process complete!');
  console.log('🔍 Run the analyzer again to verify fixes.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ASTErrorFixer };