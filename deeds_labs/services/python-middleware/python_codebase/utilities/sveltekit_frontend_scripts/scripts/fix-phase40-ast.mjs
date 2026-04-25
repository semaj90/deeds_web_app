#!/usr/bin/env node
/**
 * Phase 40 Stage 2 - AST-Validated Semantic Fixer
 * Uses TypeScript Compiler API to validate each fix before writing
 * Prevents cascading errors from regex-based fixes
 */

import { Project, SyntaxKind, ts } from 'ts-morph';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Results tracking
const results = {
  filesProcessed: 0,
  filesFixed: 0,
  filesSkipped: 0,
  filesFailed: 0,
  totalFixes: 0,
  fixesByType: {},
  errors: []
};

// Initialize TypeScript project
const project = new Project({
  tsConfigFilePath: path.join(projectRoot, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true
});

/**
 * Validate that a fix doesn't introduce new errors
 */
async function validateFix(sourceFile, originalDiagnostics) {
  const newDiagnostics = sourceFile.getPreEmitDiagnostics();
  
  // Count errors only (ignore warnings)
  const originalErrors = originalDiagnostics.filter(d => 
    d.getCategory() === ts.DiagnosticCategory.Error
  ).length;
  
  const newErrors = newDiagnostics.filter(d => 
    d.getCategory() === ts.DiagnosticCategory.Error
  ).length;
  
  return newErrors <= originalErrors;
}

/**
 * Fix object literal property assignments (TS1003, TS1005)
 */
function fixObjectLiterals(sourceFile) {
  let fixes = 0;
  
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.ObjectLiteralExpression) {
      const text = node.getText();
      
      // Fix property assignments: "key = value" -> "key: value"
      const fixed = text.replace(/(\w+)\s*=\s*([^,}\n]+)/g, '$1: $2');
      
      if (fixed !== text) {
        try {
          node.replaceWithText(fixed);
          fixes++;
        } catch (e) {
          // Skip if replacement fails
        }
      }
    }
  });
  
  return fixes;
}

/**
 * Fix arrow function parameter syntax
 */
function fixArrowFunctions(sourceFile) {
  let fixes = 0;
  
  sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction).forEach(func => {
    const params = func.getParameters();
    
    params.forEach(param => {
      const text = param.getText();
      
      // Fix destructured parameters without proper syntax
      if (text.includes('{') && !text.includes(':')) {
        const fixed = text.replace(/\{([^}]+)\}/, '{ $1 }');
        if (fixed !== text) {
          try {
            param.replaceWithText(fixed);
            fixes++;
          } catch (e) {
            // Skip if replacement fails
          }
        }
      }
    });
  });
  
  return fixes;
}

/**
 * Fix type annotations
 */
function fixTypeAnnotations(sourceFile) {
  let fixes = 0;
  
  // Fix missing type separators
  const text = sourceFile.getFullText();
  const lines = text.split('\n');
  let modified = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Fix "const x string" -> "const x: string"
    const fixedLine = line.replace(/\b(const|let|var)\s+(\w+)\s+([A-Z][a-zA-Z0-9<>[\]|&,\s]*)\b/g, '$1 $2: $3');
    
    if (fixedLine !== line) {
      lines[i] = fixedLine;
      modified = true;
      fixes++;
    }
  }
  
  if (modified) {
    sourceFile.replaceWithText(lines.join('\n'));
  }
  
  return fixes;
}

/**
 * Fix property declarations (TS1131)
 */
function fixPropertyDeclarations(sourceFile) {
  let fixes = 0;
  
  sourceFile.getClasses().forEach(cls => {
    cls.getProperties().forEach(prop => {
      const text = prop.getText();
      
      // Fix property syntax issues
      if (!text.includes(':') && !text.includes('=')) {
        const name = prop.getName();
        const type = prop.getType().getText();
        
        try {
          prop.replaceWithText(`${name}: ${type};`);
          fixes++;
        } catch (e) {
          // Skip if replacement fails
        }
      }
    });
  });
  
  return fixes;
}

/**
 * Fix import statements
 */
function fixImports(sourceFile) {
  let fixes = 0;
  
  sourceFile.getImportDeclarations().forEach(imp => {
    const text = imp.getText();
    
    // Fix malformed imports
    if (text.includes('import {') && !text.includes('} from')) {
      try {
        const fixed = text.replace(/import\s*{\s*([^}]+)\s*$/, 'import { $1 } from \'\'');
        imp.replaceWithText(fixed);
        fixes++;
      } catch (e) {
        // Skip if replacement fails
      }
    }
  });
  
  return fixes;
}

/**
 * Process a single file with AST validation
 */
async function processFile(filePath) {
  try {
    results.filesProcessed++;
    
    // Read original content for backup
    const originalContent = await fs.readFile(filePath, 'utf-8');
    
    // Add file to project
    const sourceFile = project.addSourceFileAtPath(filePath);
    
    // Get baseline diagnostics
    const originalDiagnostics = sourceFile.getPreEmitDiagnostics();
    const originalErrorCount = originalDiagnostics.filter(d => 
      d.getCategory() === ts.DiagnosticCategory.Error
    ).length;
    
    if (originalErrorCount === 0) {
      results.filesSkipped++;
      project.removeSourceFile(sourceFile);
      return { fixed: false, reason: 'no-errors' };
    }
    
    let totalFixes = 0;
    let appliedFixes = [];
    
    // Apply fixes in order
    const fixers = [
      { name: 'object-literals', fn: fixObjectLiterals },
      { name: 'arrow-functions', fn: fixArrowFunctions },
      { name: 'type-annotations', fn: fixTypeAnnotations },
      { name: 'property-declarations', fn: fixPropertyDeclarations },
      { name: 'imports', fn: fixImports }
    ];
    
    for (const fixer of fixers) {
      const fixes = fixer.fn(sourceFile);
      if (fixes > 0) {
        totalFixes += fixes;
        appliedFixes.push(fixer.name);
        results.fixesByType[fixer.name] = (results.fixesByType[fixer.name] || 0) + fixes;
      }
    }
    
    if (totalFixes === 0) {
      results.filesSkipped++;
      project.removeSourceFile(sourceFile);
      return { fixed: false, reason: 'no-applicable-fixes' };
    }
    
    // Validate the fixes
    const isValid = await validateFix(sourceFile, originalDiagnostics);
    
    if (!isValid) {
      // Rollback changes
      sourceFile.replaceWithText(originalContent);
      results.filesSkipped++;
      project.removeSourceFile(sourceFile);
      return { fixed: false, reason: 'validation-failed' };
    }
    
    // Create backup
    const backupPath = `${filePath}.ast-backup`;
    await fs.writeFile(backupPath, originalContent, 'utf-8');
    
    // Save the fixed file
    await sourceFile.save();
    
    results.filesFixed++;
    results.totalFixes += totalFixes;
    
    project.removeSourceFile(sourceFile);
    
    return {
      fixed: true,
      fixes: totalFixes,
      types: appliedFixes,
      originalErrors: originalErrorCount
    };
    
  } catch (error) {
    results.filesFailed++;
    results.errors.push({
      file: filePath,
      error: error.message
    });
    return { fixed: false, reason: 'error', error: error.message };
  }
}

/**
 * Get top error files from TypeScript compilation
 */
async function getTopErrorFiles(limit = 500) {
  const tscCommand = 'npx tsc --noEmit --skipLibCheck 2>&1';
  const { execSync } = await import('child_process');
  
  try {
    execSync(tscCommand, { cwd: projectRoot, encoding: 'utf-8' });
    return []; // No errors
  } catch (error) {
    const output = error.stdout || error.stderr || '';
    const lines = output.split('\n');
    
    const errorFiles = new Map();
    
    for (const line of lines) {
      const match = line.match(/^(.+?\.ts)\((\d+),(\d+)\): error TS(\d+):/);
      if (match) {
        const [, file] = match;
        const fullPath = path.resolve(projectRoot, file);
        
        if (!errorFiles.has(fullPath)) {
          errorFiles.set(fullPath, 1);
        } else {
          errorFiles.set(fullPath, errorFiles.get(fullPath) + 1);
        }
      }
    }
    
    // Sort by error count and take top N
    return Array.from(errorFiles.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([file]) => file)
      .filter(file => fs.access(file).then(() => true).catch(() => false));
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Phase 40 Stage 2 - AST-Validated Semantic Fixer\n');
  console.log('This will process files with TypeScript AST validation');
  console.log('Only fixes that reduce or maintain error count will be applied\n');
  
  const startTime = Date.now();
  
  // Get top error files
  console.log('📊 Analyzing TypeScript errors...');
  const files = await getTopErrorFiles(500);
  console.log(`Found ${files.length} files with errors\n`);
  
  // Process files in batches
  const batchSize = 50;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(files.length / batchSize);
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} files)...`);
    
    for (const file of batch) {
      const result = await processFile(file);
      
      if (result.fixed) {
        console.log(`  ✅ ${path.relative(projectRoot, file)} - ${result.fixes} fixes (${result.types.join(', ')})`);
      }
    }
    
    // Progress update
    const progress = ((i + batch.length) / files.length * 100).toFixed(1);
    console.log(`\n  Progress: ${results.filesFixed}/${results.filesProcessed} fixed (${progress}%)`);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Final report
  console.log('\n' + '='.repeat(80));
  console.log('📊 PHASE 40 STAGE 2 COMPLETE\n');
  console.log(`✅ Files Processed: ${results.filesProcessed}`);
  console.log(`✅ Files Fixed: ${results.filesFixed}`);
  console.log(`⏭️  Files Skipped: ${results.filesSkipped}`);
  console.log(`❌ Files Failed: ${results.filesFailed}`);
  console.log(`🔧 Total Fixes: ${results.totalFixes}`);
  console.log(`⏱️  Duration: ${duration}s`);
  
  console.log('\n📈 Fixes by Type:');
  for (const [type, count] of Object.entries(results.fixesByType)) {
    console.log(`  ${type}: ${count}`);
  }
  
  if (results.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered: ${results.errors.length}`);
    console.log('  See phase40-ast-errors.json for details');
  }
  
  // Save results
  const resultData = {
    timestamp: new Date().toISOString(),
    duration: duration,
    results,
    metadata: {
      batchSize,
      totalFiles: files.length,
      validationEnabled: true
    }
  };
  
  await fs.writeFile(
    path.join(projectRoot, 'phase40-ast-results.json'),
    JSON.stringify(resultData, null, 2)
  );
  
  if (results.errors.length > 0) {
    await fs.writeFile(
      path.join(projectRoot, 'phase40-ast-errors.json'),
      JSON.stringify(results.errors, null, 2)
    );
  }
  
  console.log('\n✅ Results saved to phase40-ast-results.json');
  console.log('🔍 Run TypeScript check to verify improvements\n');
  
  return results;
}

main().catch(console.error);
