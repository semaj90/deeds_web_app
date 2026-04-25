#!/usr/bin/env node
/**
 * Phase 80 ts-morph Import Fixer
 * Uses ts-morph's fixMissingImports() to auto-add missing import declarations
 */

import { Project, ts } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stats = {
  filesProcessed: 0,
  filesModified: 0,
  importsFixed: 0,
  organizedImports: 0,
  errors: 0,
};

function findFiles(dir, extensions = ['.ts']) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.svelte-kit', 'dist', '.git', 'build'].includes(entry.name)) {
          results.push(...findFiles(fullPath, extensions));
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // Skip directories we can't read
  }
  return results;
}

async function processFiles(targetDir, options = {}) {
  const { dryRun = false, maxFiles = 100, verbose = false } = options;

  console.log('\n🔧 Phase 80: ts-morph Import Fixer');
  console.log('='.repeat(50));
  console.log(`\n📁 Processing: ${targetDir}${dryRun ? ' (DRY RUN)' : ''}`);
  console.log(`Max files: ${maxFiles}\n`);

  const rootDir = path.resolve(__dirname, '..');

  // Create a project with loose settings to handle broken files
  const project = new Project({
    tsConfigFilePath: path.join(rootDir, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      skipLibCheck: true,
      noEmit: true,
      allowJs: true,
      checkJs: false,
    },
  });

  const files = findFiles(targetDir).slice(0, maxFiles);
  console.log(`Found ${files.length} files to process\n`);

  for (const file of files) {
    stats.filesProcessed++;
    const relPath = path.relative(rootDir, file);

    try {
      // Add the file to the project
      const sourceFile = project.addSourceFileAtPath(file);
      const originalText = sourceFile.getFullText();

      let modified = false;

      // Try to fix missing imports
      try {
        sourceFile.fixMissingImports();
        if (sourceFile.getFullText() !== originalText) {
          stats.importsFixed++;
          modified = true;
          if (verbose) console.log(`  📦 ${relPath}: imports fixed`);
        }
      } catch (e) {
        // Skip files where fixMissingImports fails (usually parse errors)
        if (verbose) console.log(`  ⚠️ ${relPath}: fixMissingImports failed`);
      }

      // Try to organize imports
      try {
        const beforeOrganize = sourceFile.getFullText();
        sourceFile.organizeImports();
        if (sourceFile.getFullText() !== beforeOrganize) {
          stats.organizedImports++;
          modified = true;
          if (verbose) console.log(`  📋 ${relPath}: imports organized`);
        }
      } catch (e) {
        // Skip if organize imports fails
      }

      if (modified) {
        stats.filesModified++;
        if (!dryRun) {
          await sourceFile.save();
        }
        console.log(`  ✅ ${relPath}`);
      }

      // Remove from project to free memory
      project.removeSourceFile(sourceFile);

    } catch (e) {
      stats.errors++;
      if (verbose) console.log(`  ❌ ${relPath}: ${e.message?.slice(0, 60) || 'error'}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary');
  console.log('='.repeat(50));
  console.log(`Files processed: ${stats.filesProcessed}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`Imports fixed: ${stats.importsFixed}`);
  console.log(`Imports organized: ${stats.organizedImports}`);
  console.log(`Errors (skipped): ${stats.errors}`);
  console.log(`\n✅ Complete!${dryRun ? ' (no changes written)' : ''}`);
}

// Main
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');
const dirArg = args.find(a => a.startsWith('--dir='));
const maxArg = args.find(a => a.startsWith('--max='));
const rootDir = path.resolve(__dirname, '..');

let targetDir = path.join(rootDir, 'src');
if (dirArg) {
  targetDir = path.resolve(rootDir, dirArg.replace('--dir=', ''));
}

const maxFiles = maxArg ? parseInt(maxArg.replace('--max=', '')) : 200;

processFiles(targetDir, { dryRun, maxFiles, verbose }).catch(console.error);
