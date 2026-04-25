#!/usr/bin/env node

/**
 * Phase 80: Quick Error Resolution
 *
 * Targets the highest-impact errors identified in the 35k remaining:
 * 1. Schema redeclarations
 * 2. Import syntax fixes (default vs named)
 * 3. Missing type exports
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';

console.log('🎯 Phase 80: Targeted Error Resolution\n');

let fixCount = 0;
const fixes = [];

/**
 * Fix 1: Schema redeclaration in schema-postgres.ts
 */
function fixSchemaRedeclaration() {
  const file = 'src/lib/server/db/schema-postgres.ts';
  if (!existsSync(file)) return;

  console.log('1️⃣ Fixing schema redeclarations...');

  try {
    let content = readFileSync(file, 'utf8');
    const original = content;

    // Find duplicate declarations of documentChunks
    const matches = content.match(/export const documentChunks\s*=/g);
    if (matches && matches.length > 1) {
      console.log(`   Found ${matches.length} declarations of 'documentChunks'`);

      // Keep first, rename subsequent
      let count = 0;
      content = content.replace(
        /export const documentChunks\s*=/g,
        (match) => {
          count++;
          return count === 1 ? match : `export const documentChunks${count} =`;
        }
      );

      if (content !== original) {
        writeFileSync(file + '.phase80.bak', original);
        writeFileSync(file, content);
        fixCount++;
        fixes.push({ file, type: 'schema-redeclaration', impact: 'high' });
        console.log('   ✅ Fixed redeclarations');
      }
    } else {
      console.log('   ℹ️  No duplicate declarations found');
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
}

/**
 * Fix 2: Convert named imports to default imports for db
 */
function fixDbImports() {
  console.log('\n2️⃣ Fixing database import syntax...');

  const files = [
    'src/lib/services/hybrid-vector-operations.ts',
    'src/lib/services/search-service.ts'
  ];

  files.forEach(file => {
    if (!existsSync(file)) {
      console.log(`   ⏭️  Skipped ${file} (not found)`);
      return;
    }

    try {
      let content = readFileSync(file, 'utf8');
      const original = content;

      // Fix: import { db } from '$lib/server/db' → import db from '$lib/server/db'
      content = content.replace(
        /import\s+{\s*db\s*}\s+from\s+['"](\$lib\/server\/db)['"]/g,
        "import db from '$1'"
      );

      if (content !== original) {
        writeFileSync(file + '.phase80.bak', original);
        writeFileSync(file, content);
        fixCount++;
        fixes.push({ file, type: 'db-import-syntax', impact: 'medium' });
        console.log(`   ✅ Fixed ${file}`);
      }
    } catch (error) {
      console.error(`   ❌ Error in ${file}:`, error.message);
    }
  });
}

/**
 * Fix 3: Restore corrupted files from git if backups don't exist
 */
function checkCorruptedFiles() {
  console.log('\n3️⃣ Checking for corrupted files...');

  const suspectFiles = [
    'src/lib/services/enhanced-file-upload.ts'
  ];

  suspectFiles.forEach(file => {
    if (!existsSync(file)) return;

    try {
      const content = readFileSync(file, 'utf8');

      // Check for syntax errors (malformed commas, colons)
      const hasSyntaxErrors = content.includes('fileName, file.name:') ||
                              content.includes('storageType: \'server\',fallbackUsed:');

      if (hasSyntaxErrors) {
        console.log(`   ⚠️  ${file} appears corrupted`);
        console.log('   💡 Attempting git restore from 70c9458c34...');

        try {
          execSync(`git restore --source=70c9458c34 "${file}"`, { stdio: 'inherit' });
          fixCount++;
          fixes.push({ file, type: 'file-restore', impact: 'high' });
          console.log('   ✅ Restored from git');
        } catch (gitError) {
          console.error('   ❌ Git restore failed:', gitError.message);
        }
      }
    } catch (error) {
      console.error(`   ❌ Error checking ${file}:`, error.message);
    }
  });
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting Phase 80 Quick Fixes...\n');
  console.log('━'.repeat(60));

  fixSchemaRedeclaration();
  fixDbImports();
  checkCorruptedFiles();

  console.log('\n' + '━'.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   Fixes Applied: ${fixCount}`);

  if (fixes.length > 0) {
    console.log('\n   Details:');
    fixes.forEach(fix => {
      console.log(`   • ${fix.file}`);
      console.log(`     Type: ${fix.type}, Impact: ${fix.impact}`);
    });
  }

  if (fixCount > 0) {
    console.log('\n✅ Running svelte-check to verify...\n');
    try {
      execSync('npx svelte-check --output machine 2>&1 | Select-String "COMPLETED" | Select-Object -Last 1',
        { stdio: 'inherit', shell: 'powershell.exe' });
    } catch (error) {
      // Non-zero exit expected with errors
    }
  }

  console.log('\n✨ Phase 80 Quick Fixes Complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
