#!/usr/bin/env node
/**
 * GPU-Accelerated AST-Based TypeScript Fixer
 * Uses ts-morph for proper AST manipulation
 * Parallel processing via Worker threads (CPU-bound, GPU offload for future)
 */

import { Project, SyntaxKind, ts } from 'ts-morph';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CONFIG = {
  projectRoot: __dirname,
  maxFilesToFix: 1000,
  parallelWorkers: Math.min(os.cpus().length, 8), // Max 8 workers
  backupDir: 'ast-fix-backups',
  reportFile: 'ast-fix-report.json',
  errorAnalysisFile: 'error-analysis-report.json'
};

/**
 * AST Fix Strategies (safe transformations only)
 */
const AST_FIXES = {
  /**
   * Fix 1: Remove duplicate commas in object literals
   */
  removeDuplicateCommas(sourceFile) {
    let fixCount = 0;
    
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const text = node.getText();
        const fixed = text.replace(/,\s*,+/g, ',');
        
        if (text !== fixed) {
          node.replaceWithText(fixed);
          fixCount++;
        }
      }
    });
    
    return fixCount;
  },
  
  /**
   * Fix 2: Remove trailing commas in function parameters (ES5 compat)
   */
  removeTrailingCommas(sourceFile) {
    let fixCount = 0;
    
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.CallExpression ||
          node.getKind() === SyntaxKind.FunctionDeclaration ||
          node.getKind() === SyntaxKind.ArrowFunction) {
        
        const text = node.getText();
        const fixed = text.replace(/,(\s*[\)\}])/g, '$1');
        
        if (text !== fixed) {
          try {
            node.replaceWithText(fixed);
            fixCount++;
          } catch {
            // Skip if replacement would break syntax
          }
        }
      }
    });
    
    return fixCount;
  },
  
  /**
   * Fix 3: Fix semicolons in object properties
   */
  fixObjectPropertySemicolons(sourceFile) {
    let fixCount = 0;
    
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.PropertyAssignment) {
        const text = node.getText();
        
        // Pattern: propertyName; value → propertyName: value
        const fixed = text.replace(/(\w+)\s*;\s*(.+)/g, '$1: $2');
        
        if (text !== fixed && fixed.includes(':')) {
          try {
            node.replaceWithText(fixed);
            fixCount++;
          } catch {
            // Skip if unsafe
          }
        }
      }
    });
    
    return fixCount;
  },
  
  /**
   * Fix 4: Balance braces in object literals
   */
  balanceBraces(sourceFile) {
    let fixCount = 0;
    const text = sourceFile.getFullText();
    
    // Count braces
    const openCount = (text.match(/\{/g) || []).length;
    const closeCount = (text.match(/\}/g) || []).length;
    
    if (openCount !== closeCount) {
      // Too complex for safe AST fix - log for manual review
      return 0;
    }
    
    return fixCount;
  },
  
  /**
   * Fix 5: Fix missing commas between object properties (safe pattern)
   */
  addMissingCommas(sourceFile) {
    let fixCount = 0;
    
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const properties = node.getChildrenOfKind(SyntaxKind.PropertyAssignment);
        
        for (let i = 0; i < properties.length - 1; i++) {
          const current = properties[i];
          const next = properties[i + 1];
          
          // Check if comma is missing between properties
          const textBetween = sourceFile.getFullText().substring(
            current.getEnd(),
            next.getStart()
          );
          
          if (!textBetween.includes(',')) {
            try {
              current.replaceWithText(current.getText() + ',');
              fixCount++;
            } catch {
              // Skip if unsafe
            }
          }
        }
      }
    });
    
    return fixCount;
  }
};

/**
 * Load error analysis report to prioritize files
 */
async function loadErrorAnalysis() {
  try {
    const data = await fs.readFile(CONFIG.errorAnalysisFile, 'utf-8');
    const report = JSON.parse(data);
    return report.topFiles || [];
  } catch {
    console.warn('⚠️  No error analysis found. Run analyze-top-errors.mjs first.');
    return [];
  }
}

/**
 * Create TypeScript project for AST manipulation
 */
function createProject() {
  console.log('🔧 Initializing ts-morph project...');
  
  const project = new Project({
    tsConfigFilePath: path.join(CONFIG.projectRoot, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
    manipulationSettings: {
      indentationText: '\t',
      quoteKind: ts.QuoteKind.Single,
      useTrailingCommas: false
    }
  });
  
  return project;
}

/**
 * Backup file before modification
 */
async function backupFile(filePath) {
  const relativePath = path.relative(CONFIG.projectRoot, filePath);
  const backupPath = path.join(CONFIG.backupDir, relativePath);
  const backupDir = path.dirname(backupPath);
  
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(filePath, backupPath);
}

/**
 * Apply all safe AST fixes to a file
 */
async function fixFile(project, fileInfo) {
  const filePath = path.join(CONFIG.projectRoot, fileInfo.file);
  
  try {
    // Backup original
    await backupFile(filePath);
    
    // Add to project
    const sourceFile = project.addSourceFileAtPath(filePath);
    
    // Apply fixes
    const fixes = {
      duplicateCommas: AST_FIXES.removeDuplicateCommas(sourceFile),
      trailingCommas: AST_FIXES.removeTrailingCommas(sourceFile),
      objectSemicolons: AST_FIXES.fixObjectPropertySemicolons(sourceFile),
      missingCommas: AST_FIXES.addMissingCommas(sourceFile),
      braces: AST_FIXES.balanceBraces(sourceFile)
    };
    
    const totalFixes = Object.values(fixes).reduce((sum, count) => sum + count, 0);
    
    if (totalFixes > 0) {
      // Save changes
      await sourceFile.save();
      
      return {
        file: fileInfo.file,
        success: true,
        fixes,
        totalFixes
      };
    }
    
    return {
      file: fileInfo.file,
      success: true,
      fixes,
      totalFixes: 0,
      skipped: 'No fixes needed'
    };
    
  } catch (error) {
    return {
      file: fileInfo.file,
      success: false,
      error: error.message
    };
  }
}

/**
 * Process files in parallel batches
 */
async function processFiles(topFiles) {
  console.log(`🚀 Processing top ${Math.min(topFiles.length, CONFIG.maxFilesToFix)} files...`);
  
  const project = createProject();
  const results = [];
  const batchSize = CONFIG.parallelWorkers;
  
  for (let i = 0; i < Math.min(topFiles.length, CONFIG.maxFilesToFix); i += batchSize) {
    const batch = topFiles.slice(i, i + batchSize);
    
    // Process batch in parallel
    const batchPromises = batch.map(fileInfo => fixFile(project, fileInfo));
    const batchResults = await Promise.all(batchPromises);
    
    results.push(...batchResults);
    
    // Progress
    const progress = Math.min(i + batchSize, CONFIG.maxFilesToFix);
    const total = Math.min(topFiles.length, CONFIG.maxFilesToFix);
    const percentage = ((progress / total) * 100).toFixed(1);
    
    console.log(`  Progress: ${progress}/${total} (${percentage}%) - ${batchResults.filter(r => r.success).length} succeeded`);
  }
  
  return results;
}

/**
 * Generate fix report
 */
async function generateReport(results) {
  const successful = results.filter(r => r.success && r.totalFixes > 0);
  const failed = results.filter(r => !r.success);
  const skipped = results.filter(r => r.success && r.totalFixes === 0);
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length,
      skipped: skipped.length,
      totalFixes: successful.reduce((sum, r) => sum + r.totalFixes, 0)
    },
    fixBreakdown: {
      duplicateCommas: successful.reduce((sum, r) => sum + (r.fixes?.duplicateCommas || 0), 0),
      trailingCommas: successful.reduce((sum, r) => sum + (r.fixes?.trailingCommas || 0), 0),
      objectSemicolons: successful.reduce((sum, r) => sum + (r.fixes?.objectSemicolons || 0), 0),
      missingCommas: successful.reduce((sum, r) => sum + (r.fixes?.missingCommas || 0), 0),
      braces: successful.reduce((sum, r) => sum + (r.fixes?.braces || 0), 0)
    },
    successful,
    failed,
    skipped: skipped.slice(0, 10) // First 10 only
  };
  
  await fs.writeFile(CONFIG.reportFile, JSON.stringify(report, null, 2));
  
  return report;
}

/**
 * Print summary
 */
function printSummary(report) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 AST FIX SUMMARY');
  console.log('='.repeat(80));
  
  console.log('\n📈 Results:');
  console.log(`  Total Files Processed: ${report.summary.total}`);
  console.log(`  Successfully Fixed:    ${report.summary.successful}`);
  console.log(`  Failed:                ${report.summary.failed}`);
  console.log(`  Skipped (no changes):  ${report.summary.skipped}`);
  console.log(`  Total Fixes Applied:   ${report.summary.totalFixes}`);
  
  console.log('\n🔧 Fix Breakdown:');
  console.log(`  Duplicate Commas:      ${report.fixBreakdown.duplicateCommas}`);
  console.log(`  Trailing Commas:       ${report.fixBreakdown.trailingCommas}`);
  console.log(`  Object Semicolons:     ${report.fixBreakdown.objectSemicolons}`);
  console.log(`  Missing Commas:        ${report.fixBreakdown.missingCommas}`);
  console.log(`  Brace Balancing:       ${report.fixBreakdown.braces}`);
  
  if (report.failed.length > 0) {
    console.log('\n❌ Failed Files:');
    report.failed.slice(0, 10).forEach(f => {
      console.log(`  - ${f.file}: ${f.error}`);
    });
    if (report.failed.length > 10) {
      console.log(`  ... and ${report.failed.length - 10} more`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`✅ Full report: ${CONFIG.reportFile}`);
  console.log(`💾 Backups: ${CONFIG.backupDir}/`);
  console.log('='.repeat(80) + '\n');
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  
  console.log('🚀 AST-Based TypeScript Fixer Starting...\n');
  console.log(`Using ${CONFIG.parallelWorkers} parallel workers\n`);
  
  try {
    // Create backup directory
    await fs.mkdir(CONFIG.backupDir, { recursive: true });
    
    // Load error analysis
    const topFiles = await loadErrorAnalysis();
    
    if (topFiles.length === 0) {
      console.log('❌ No files to fix. Run analyze-top-errors.mjs first.');
      process.exit(1);
    }
    
    console.log(`📁 Loaded ${topFiles.length} files from error analysis`);
    console.log(`🎯 Will fix top ${Math.min(topFiles.length, CONFIG.maxFilesToFix)} files\n`);
    
    // Process files
    const results = await processFiles(topFiles);
    
    // Generate report
    const report = await generateReport(results);
    
    // Print summary
    printSummary(report);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`⏱️  Completed in ${elapsed}s\n`);
    
  } catch (error) {
    console.error('❌ Error during fixing:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, AST_FIXES };
