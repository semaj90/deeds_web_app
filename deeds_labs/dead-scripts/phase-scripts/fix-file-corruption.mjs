#!/usr/bin/env node
/**
 * Fix File Corruption Script
 * Repairs TypeScript files with compression/punctuation corruption
 * Pattern: Interfaces/functions compressed to single lines with wrong punctuation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Corruption patterns to detect
const CORRUPTION_PATTERNS = {
  recordType: /Record<string:\s*unknown>/g,
  paramComma: /(\w+),\s+(string|number|boolean)([,\):])/g,
  objectCommas: /{\s*(\w+),\s+(\w+)/g,
  missingLineBreaks: /}\s*export\s+(interface|class|const|function)/g,
  singleLineClass: /export class \w+\s*{[^}]{200,}}/g,
  singleLineInterface: /export interface \w+\s*{[^}]{100,}}/g
};

// Fix patterns
const FIXES = {
  recordType: 'Record<string, unknown>',
  semicolonToComma: (match, prop, type, suffix) => {
    if (suffix === ':') return `${prop}: ${type}${suffix}`;
    return `${prop}: ${type}${suffix}`;
  },
  addLineBreaks: (match) => {
    return match.replace(/}\s*/, '}\n\n');
  }
};

async function scanCorruptedFiles() {
  console.log('🔍 Scanning for corrupted TypeScript files...\n');

  const corrupted = [];

  async function walkDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules, .svelte-kit, etc.
        if (!['node_modules', '.svelte-kit', 'dist', 'build'].includes(entry.name)) {
          await walkDir(fullPath);
        }
      } else if (entry.name.endsWith('.ts') && !entry.name.includes('.bak')) {
        await checkFile(fullPath);
      }
    }
  }

  async function checkFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').length;
      const size = content.length;
      const ratio = size / Math.max(lines, 1);

      // Check corruption patterns
      const hasRecordError = CORRUPTION_PATTERNS.recordType.test(content);
      const hasParamError = CORRUPTION_PATTERNS.paramComma.test(content);
      const hasSingleLineClass = CORRUPTION_PATTERNS.singleLineClass.test(content);
      const hasSingleLineInterface = CORRUPTION_PATTERNS.singleLineInterface.test(content);

      if ((ratio > 200 && lines < 30) || hasRecordError || hasParamError ||
          hasSingleLineClass || hasSingleLineInterface) {
        corrupted.push({
          path: path.relative(rootDir, filePath),
          lines,
          size,
          ratio: Math.round(ratio),
          hasRecordError,
          hasParamError,
          hasSingleLineClass,
          hasSingleLineInterface
        });
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  await walkDir(path.join(rootDir, 'src'));
  return corrupted;
}

async function fixFile(filePath) {
  console.log(`\n🔧 Fixing: ${filePath}`);

  try {
    let content = await fs.readFile(path.join(rootDir, filePath), 'utf-8');
    let modified = false;

    // Fix Record<string: unknown> → Record<string, unknown>
    if (CORRUPTION_PATTERNS.recordType.test(content)) {
      content = content.replace(CORRUPTION_PATTERNS.recordType, FIXES.recordType);
      modified = true;
      console.log('   ✓ Fixed Record<string: unknown>');
    }

    // Fix param, Type → param: Type
    if (CORRUPTION_PATTERNS.paramComma.test(content)) {
      content = content.replace(CORRUPTION_PATTERNS.paramComma, (match, prop, type, suffix) => {
        return `${prop}: ${type}${suffix}`;
      });
      modified = true;
      console.log('   ✓ Fixed parameter type syntax');
    }

    // Add line breaks between declarations
    if (CORRUPTION_PATTERNS.missingLineBreaks.test(content)) {
      content = content.replace(CORRUPTION_PATTERNS.missingLineBreaks, FIXES.addLineBreaks);
      modified = true;
      console.log('   ✓ Added line breaks');
    }

    if (modified) {
      // Backup original
      const backupPath = path.join(rootDir, filePath + '.corruption-backup');
      await fs.writeFile(backupPath, await fs.readFile(path.join(rootDir, filePath)));

      // Write fixed content
      await fs.writeFile(path.join(rootDir, filePath), content);
      console.log('   ✅ File fixed and backed up');
      return true;
    }

    return false;
  } catch (err) {
    console.error(`   ❌ Error fixing file: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  File Corruption Repair Tool - Phase 72              ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // Scan for corrupted files
  const corrupted = await scanCorruptedFiles();

  console.log(`\n📊 Found ${corrupted.length} corrupted files\n`);

  if (corrupted.length === 0) {
    console.log('✅ No corrupted files detected!\n');
    return 0;
  }

  // Show top 20
  console.log('Top 20 corrupted files:');
  corrupted.slice(0, 20).forEach((file, i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${file.path}`);
    console.log(`    Lines: ${file.lines} | Size: ${Math.round(file.size/1024)}KB | Ratio: ${file.ratio}`);
    const errors = [];
    if (file.hasRecordError) errors.push('Record<string:>');
    if (file.hasParamError) errors.push('param, Type');
    if (file.hasSingleLineClass) errors.push('single-line class');
    if (file.hasSingleLineInterface) errors.push('single-line interface');
    if (errors.length > 0) {
      console.log(`    Issues: ${errors.join(', ')}`);
    }
  });

  console.log(`\n... and ${corrupted.length - 20} more files\n`);

  // Ask to proceed (or auto-proceed in CI)
  const shouldFix = process.argv.includes('--auto-fix') || process.argv.includes('--apply');

  if (!shouldFix) {
    console.log('💡 Run with --apply to fix these files automatically\n');
    return 0;
  }

  console.log('\n🚀 Starting automatic repair...\n');

  let fixed = 0;
  const maxFix = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '999');

  for (const file of corrupted.slice(0, maxFix)) {
    if (await fixFile(file.path)) {
      fixed++;
    }
  }

  console.log(`\n✅ Fixed ${fixed} of ${Math.min(corrupted.length, maxFix)} files\n`);
  console.log('💡 NEXT: Run TypeScript check to verify fixes');
  console.log('   npx tsc --noEmit -p tsconfig.check.json\n');

  return 0;
}

main().then(process.exit).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
