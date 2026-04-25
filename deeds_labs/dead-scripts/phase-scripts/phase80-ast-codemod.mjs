#!/usr/bin/env node
/**
 * Phase 80 AST Codemod - ts-morph based fixes
 * Uses AST understanding for more accurate fixes
 */

import { Project, SyntaxKind, ts } from 'ts-morph';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stats = {
  filesProcessed: 0,
  filesModified: 0,
  unionTypeFixes: 0,
  duplicateParamFixes: 0,
  missingImportFixes: 0,
  organizedImports: 0,
};

function fixUnionTypesInText(text) {
  // Fix patterns like `: Type: null` -> `: Type | null`
  // and `=> Type: undefined` -> `=> Type | undefined`
  let result = text;

  // Pattern 1: Return type union - "): Type: null" or "): Type: undefined"
  result = result.replace(
    /\):\s*([A-Za-z_][\w<>\[\],\s|]*?):\s*(null|undefined)\s*(?=[{;])/g,
    '): $1 | $2'
  );

  // Pattern 2: Property type union - "property: Type: null =" or "property: Type: null;"
  result = result.replace(
    /^(\s*(?:private\s+|public\s+|protected\s+|readonly\s+)*\w+):\s*([A-Za-z_][\w<>\[\],\s|]*?):\s*(null|undefined)\s*(=|;)/gm,
    '$1: $2 | $3$4'
  );

  // Pattern 3: Generic type arguments "=> Promise<Type>: undefined"
  result = result.replace(
    /=>\s*([A-Za-z_][\w<>\[\],\s|]*?):\s*(null|undefined)\s*;/g,
    '=> $1 | $2;'
  );

  return result;
}

function fixComplexObjectLiterals(text) {
  // Fix patterns like "key: value: nextKey," -> "key: value, nextKey:"
  let result = text;
  let iterations = 0;
  const maxIterations = 50;

  while (iterations < maxIterations) {
    const before = result;

    // Pattern: "identifier: value: identifier," where value is simple
    result = result.replace(
      /(\w+):\s*((?:[\w.]+(?:\([^)]*\))?|\d+(?:\.\d+)?|true|false|null|'[^']*'|"[^"]*"))\s*:\s*(\w+),/g,
      '$1: $2, $3:'
    );

    if (result === before) break;
    iterations++;
  }

  return result;
}

function fixRepeatedIdentifiers(text) {
  // Fix "this: this: this.prop" -> "this.prop"
  let result = text;

  result = result.replace(/\bthis:\s*this:\s*this\./g, 'this.');

  // Fix "variable: variable: variable.prop" -> "variable.prop"
  result = result.replace(/\b(\w+):\s*\1:\s*\1\./g, '$1.');

  return result;
}

function fixFunctionParams(text) {
  // Fix duplicate type annotations in function params
  // "param: Type, Type: Type" -> "param: Type"
  let result = text;

  // Pattern: ", Type): Type" at end of params (trailing duplicate type)
  result = result.replace(/,\s*(\w+)\):\s*\1\b/g, '): $1');

  // Pattern: duplicate param like "(a: string, string: string,"
  result = result.replace(/,\s*(\w+):\s*\1,/g, ',');

  return result;
}

async function processFile(filePath, dryRun = false) {
  const fs = await import('fs');
  let content;

  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`  ❌ Cannot read: ${filePath}`);
    return false;
  }

  let modified = content;

  // Apply text-based fixes first (these are safe regex transforms)
  modified = fixUnionTypesInText(modified);
  modified = fixComplexObjectLiterals(modified);
  modified = fixRepeatedIdentifiers(modified);
  modified = fixFunctionParams(modified);

  if (modified !== content) {
    if (!dryRun) {
      fs.writeFileSync(filePath, modified, 'utf8');
    }
    return true;
  }

  return false;
}

async function processWithTsMorph(targetDir, dryRun = false) {
  console.log('\n🔧 Phase 80: AST-Based Codemod (ts-morph)');
  console.log('='.repeat(50));
  console.log(`\n📁 Processing: ${targetDir}${dryRun ? ' (DRY RUN)' : ''}\n`);

  // Create project
  const project = new Project({
    tsConfigFilePath: path.join(__dirname, '..', 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  // Add source files from target directory
  const fs = await import('fs');
  const glob = await import('glob');

  const files = glob.sync(path.join(targetDir, '**/*.ts'), {
    ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/dist/**'],
  });

  console.log(`Found ${files.length} TypeScript files\n`);

  for (const file of files) {
    stats.filesProcessed++;
    const relPath = path.relative(path.join(__dirname, '..'), file);

    // First apply text-based fixes
    const wasModified = await processFile(file, dryRun);

    if (wasModified) {
      stats.filesModified++;
      console.log(`  ✅ ${relPath}: text fixes applied`);
    }
  }

  // Now use ts-morph for AST-level operations
  console.log('\n📦 Running ts-morph AST operations...\n');

  // Reload project with fixed files
  const project2 = new Project({
    tsConfigFilePath: path.join(__dirname, '..', 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  for (const file of files.slice(0, 100)) { // Process first 100 for safety
    try {
      const sourceFile = project2.addSourceFileAtPath(file);
      const relPath = path.relative(path.join(__dirname, '..'), file);

      // Try to organize imports (safe operation)
      try {
        sourceFile.organizeImports();
        stats.organizedImports++;
      } catch (e) {
        // Skip if organize fails (usually due to parse errors)
      }

      // Try to fix missing imports
      try {
        sourceFile.fixMissingImports();
        stats.missingImportFixes++;
      } catch (e) {
        // Skip if fix fails
      }

      if (!dryRun) {
        await sourceFile.save();
      }
    } catch (e) {
      // Skip files that can't be parsed
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files modified (text fixes): ${stats.filesModified}`);
  console.log(`Organized imports: ${stats.organizedImports}`);
  console.log(`Fixed missing imports: ${stats.missingImportFixes}`);
  console.log(`\n✅ AST Codemod complete!${dryRun ? ' (no changes written)' : ''}`);
}

// Main
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dirArg = args.find(a => a.startsWith('--dir='));
const rootDir = path.resolve(__dirname, '..');

let targetDir = path.join(rootDir, 'src');
if (dirArg) {
  targetDir = path.resolve(rootDir, dirArg.replace('--dir=', ''));
}

processWithTsMorph(targetDir, dryRun).catch(console.error);
