#!/usr/bin/env node
/**
 * Lucide Import Fixer - Perfect Tier 1 Target
 *
 * Transforms:
 *   import { Brain } from "lucide-svelte"
 * To:
 *   import Brain from "lucide-svelte"
 *
 * This is 100% deterministic, AST-safe, and reversible.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CLI Arguments
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = args.includes('--dry-run');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) ||
              parseInt(args[args.indexOf('--limit') + 1]) ||
              null;

console.log('🎯 Lucide Import Fixer (Tier 1)\n');
console.log('═'.repeat(70));
console.log(`Mode:  ${apply ? (dryRun ? 'Dry Run' : 'APPLY') : 'Plan Only'}`);
console.log(`Limit: ${limit || 'none'}`);
console.log('═'.repeat(70) + '\n');

// Load errors from latest/
const errorsFile = path.join(__dirname, '..', 'reports', 'latest', 'errors.jsonl');

if (!fs.existsSync(errorsFile)) {
  console.error('❌ No errors.jsonl found in reports/latest/');
  console.error('   Run: node scripts/factory-runner.mjs run');
  process.exit(1);
}

console.log('📖 Loading error events...\n');

const lines = fs.readFileSync(errorsFile, 'utf-8').split('\n').filter(l => l.trim());
const events = lines.map(line => JSON.parse(line));

console.log(`  ✅ Loaded ${events.length.toLocaleString()} error events\n`);

// Filter for lucide-svelte import errors
const lucideErrors = events.filter(e =>
  e.message && e.message.includes('lucide-svelte') &&
  e.message.includes('has no exported member')
);

console.log(`  🎯 Found ${lucideErrors.length.toLocaleString()} lucide-svelte import errors\n`);

// Group by file
const byFile = new Map();

for (const error of lucideErrors) {
  if (!byFile.has(error.file)) {
    byFile.set(error.file, []);
  }
  byFile.get(error.file).push(error);
}

console.log(`  📁 Affects ${byFile.size} files\n`);

// Apply limit
let filesToFix = Array.from(byFile.keys());

if (limit) {
  filesToFix = filesToFix.slice(0, limit);
  console.log(`  ⚠️  Limited to ${limit} files\n`);
}

// Show preview
console.log('📊 Top 10 Files:\n');

filesToFix.slice(0, 10).forEach((file, idx) => {
  const count = byFile.get(file).length;
  const fileName = path.relative(process.cwd(), file);
  console.log(`  ${idx + 1}. ${fileName} (${count} imports)`);
});

console.log('\n' + '═'.repeat(70) + '\n');

if (!apply) {
  console.log('💡 DRY RUN - No files modified\n');
  console.log('To apply fixes:\n');
  console.log('  node scripts/fix-lucide-imports.mjs --apply --limit 100\n');
  process.exit(0);
}

// Apply fixes
console.log('🔨 Applying fixes...\n');

const backupsDir = path.join(__dirname, '..', 'reports', 'backups-lucide-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(backupsDir, { recursive: true });

let fixed = 0;
let skipped = 0;
let failed = 0;

for (const file of filesToFix) {
  try {
    if (!fs.existsSync(file)) {
      console.log(`  ⏭️  Skipped: ${path.basename(file)} (not found)`);
      skipped++;
      continue;
    }

    const content = fs.readFileSync(file, 'utf-8');

    // Backup original
    const backupFile = path.join(backupsDir, path.basename(file) + '.bak');

    if (!dryRun) {
      fs.copyFileSync(file, backupFile);
    }

    // Transform lucide imports
    // Pattern: import { X } from "lucide-svelte"
    // Replace: import X from "lucide-svelte"

    const lucideImportRegex = /import\s+\{\s*([A-Z][a-zA-Z0-9]*)\s*\}\s+from\s+["']lucide-svelte["']/g;

    let newContent = content.replace(lucideImportRegex, (match, iconName) => {
      return `import ${iconName} from "lucide-svelte"`;
    });

    // Check if any changes were made
    if (newContent === content) {
      console.log(`  ⏭️  Skipped: ${path.basename(file)} (no matching imports)`);
      skipped++;
      continue;
    }

    // Write fixed content
    if (!dryRun) {
      fs.writeFileSync(file, newContent, 'utf-8');
    }

    const fileName = path.relative(process.cwd(), file);
    console.log(`  ✅ Fixed: ${fileName}`);
    fixed++;

  } catch (err) {
    console.error(`  ❌ Failed: ${path.basename(file)} - ${err.message}`);
    failed++;
  }
}

console.log('\n' + '═'.repeat(70));
console.log('📊 RESULTS');
console.log('═'.repeat(70));
console.log(`Fixed:   ${fixed}`);
console.log(`Skipped: ${skipped}`);
console.log(`Failed:  ${failed}`);
console.log('═'.repeat(70) + '\n');

if (fixed > 0 && !dryRun) {
  console.log(`💾 Backups saved to: ${path.relative(process.cwd(), backupsDir)}\n`);
  console.log('💡 NEXT STEPS:\n');
  console.log('  1. Verify: npm run check:ultra-fast');
  console.log('  2. If passed: commit changes');
  console.log('  3. If failed: restore from backups\n');
}
