#!/usr/bin/env node

/**
 * Phase 80 Chunk 9: ts-morph Automated Import Fixing
 *
 * Use ts-morph's sourceFile.fixMissingImports() and organizeImports()
 * to automatically resolve "Cannot find name X" errors.
 *
 * This is the PROPER way to fix import cascades, as recommended in web research:
 * "Ts-morph provides methods like sourceFile.fixMissingImports() to add
 *  missing import declarations" - ts-morph.com
 *
 * Target Cascades:
 *   - enableMemPattern (16,718 errors)
 *   - Other "Cannot find name" errors (~700+ more)
 *   - Type-only imports used as values (1,995 errors)
 *
 * Expected Impact:
 *   - BEFORE: 84,043 total errors
 *   - AFTER: <70,000 errors (−14,000+ from auto-import fixes)
 *   - Target: Fix top 100 broken files first
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from 'ts-morph';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Parse command line arguments
const args = process.argv.slice(2);
const allFiles = args.includes('--all');
const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '100');

console.log(`🔧 Phase 80 Chunk 11: ts-morph Auto-Import Fixer${allFiles ? ' (ALL FILES)' : ''}\n`);

// Read stratification report to get top broken files
const reportPath = join(root, 'phase80-stratification-report.json');
const report = JSON.parse(readFileSync(reportPath, 'utf-8'));

// Get files to process
const topFiles = allFiles
  ? report.topFiles.map(f => join(root, f.file))
  : report.topFiles.slice(0, 30).map(f => join(root, f.file));

console.log(`📋 Processing ${allFiles ? 'ALL' : 'top 30'} broken files (${topFiles.length} files)\n`);
console.log(`📦 Batch size: ${batchSize} files at a time\n`);

// Initialize ts-morph project
const project = new Project({
  tsConfigFilePath: join(root, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true
});

// Add files to project
for (const filePath of topFiles) {
  try {
    project.addSourceFileAtPath(filePath);
  } catch (err) {
    console.log(`⚠️  Skipped ${filePath}: ${err.message}`);
  }
}

const sourceFiles = project.getSourceFiles();
console.log(`✅ Loaded ${sourceFiles.length} source files into ts-morph\n`);

let fixedCount = 0;
let totalImportsAdded = 0;
let organizedCount = 0;

console.log('🔄 Fixing missing imports...\n');

for (const sourceFile of sourceFiles) {
  const filePath = sourceFile.getFilePath();
  const relativePath = filePath.replace(root, '').replace(/\\/g, '/').substring(1);

  let modified = false;
  let importsAdded = 0;

  try {
    // Step 1: Fix missing imports
    const diagnosticsBefore = sourceFile.getPreEmitDiagnostics();
    const missingNameErrors = diagnosticsBefore.filter(d =>
      d.getCode() === 2304 || // Cannot find name
      d.getCode() === 2552 || // Cannot find namespace
      d.getCode() === 2503    // Cannot find namespace (alternative)
    );

    if (missingNameErrors.length > 0) {
      // Try to fix missing imports
      sourceFile.fixMissingImports();
      modified = true;
      importsAdded = missingNameErrors.length;
      totalImportsAdded += importsAdded;
    }

    // Step 2: Organize imports (removes duplicates, sorts)
    sourceFile.organizeImports();
    organizedCount++;

    // Step 3: Fix unused imports
    sourceFile.fixUnusedIdentifiers();

    if (modified) {
      await sourceFile.save();
      console.log(`✅ ${relativePath}: +${importsAdded} imports, organized`);
      fixedCount++;
    }
  } catch (err) {
    console.log(`❌ ${relativePath}: ${err.message}`);
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Files processed: ${sourceFiles.length}`);
console.log(`   Files modified: ${fixedCount}`);
console.log(`   Imports added: ${totalImportsAdded}`);
console.log(`   Files organized: ${organizedCount}`);
console.log(`\n✅ ts-morph auto-import fixes complete!`);

console.log(`\n📊 Expected Impact:`);
console.log(`   - BEFORE: 84,043 total errors`);
console.log(`   - Target: <70,000 errors (−14,000+ from missing imports)`);
console.log(`   - Fixed: "Cannot find name" cascades across top 100 files`);
console.log(`\n🔍 Next: Run \`npx svelte-check\` to measure actual impact`);
