#!/usr/bin/env node

/**
 * SvelteKit Component Migration Script (Phase 9)
 * Automates migration from Svelte 4 to Svelte 5 patterns
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

console.log('🚀 Starting SvelteKit Component Migration (Phase 9)...\n');

// Migration patterns
const migrationPatterns = {
  // Convert createEventDispatcher to callback props
  createEventDispatcher: {
    find: /import\s*{\s*createEventDispatcher[^}]*}\s*from\s*['"]svelte['"]/g,
    replace: '// Migrated from createEventDispatcher to callback props'
  },

  // Convert export let to $props()
  exportLet: {
    find: /export\s+let\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);/g,
    replace: (match, propName, defaultValue) => {
      // Convert to $props() destructuring
      return `let { ${propName} = ${defaultValue} } = $props();`;
    }
  },

  // Convert old event handlers
  eventHandlers: {
    find: /on:click|on:change|on:input|on:submit|on:keydown|on:keyup|on:focus|on:blur/g,
    replace: (match) => {
      const eventMap = {
        'on:click': 'onclick',
        'on:change': 'onchange',
        'on:input': 'oninput',
        'on:submit': 'onsubmit',
        'on:keydown': 'onkeydown',
        'on:keyup': 'onkeyup',
        'on:focus': 'onfocus',
        'on:blur': 'onblur'
      };
      return eventMap[match] || match;
    }
  },

  // Update store subscriptions (basic pattern)
  storeSubscriptions: {
    find: /import\s*{\s*([^}]+)}\s*from\s*['"]\$\/lib\/stores\/([^'"]+)['"]/g,
    replace: (match, imports, storeName) => {
      // Add comment for manual review
      return match + ' // TODO: Verify store usage is compatible with Svelte 5';
    }
  }
};

async function findComponentFiles() {
  try {
    const patterns = [
      'src/**/*.{svelte,ts,js}',
      'src/lib/components/**/*.{svelte,ts,js}',
      'src/routes/**/*.{svelte,ts,js}'
    ];

    let allFiles = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: process.cwd(),
        absolute: true
      });
      allFiles = allFiles.concat(files);
    }

    return [...new Set(allFiles)]; // Remove duplicates
  } catch (error) {
    console.error('Error finding component files:', error.message);
    return [];
  }
}

async function migrateFile(filePath) {
  console.log(`🔄 Migrating: ${path.relative(process.cwd(), filePath)}`);

  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  const appliedMigrations = [];

  // Apply each migration pattern
  Object.entries(migrationPatterns).forEach(([patternName, pattern]) => {
    const originalContent = content;

    if (typeof pattern.replace === 'function') {
      content = content.replace(pattern.find, (match, ...args) => {
        changes++;
        appliedMigrations.push(patternName);
        return pattern.replace(match, ...args);
      });
    } else {
      content = content.replace(pattern.find, (match) => {
        changes++;
        appliedMigrations.push(patternName);
        return pattern.replace;
      });
    }

    if (content !== originalContent) {
      console.log(`  ✅ Applied ${patternName} migration`);
    }
  });

  // Write back if changes were made
  if (changes > 0) {
    // Create backup
    const backupPath = filePath + '.backup';
    fs.writeFileSync(backupPath, fs.readFileSync(filePath, 'utf8'));

    // Write migrated content
    fs.writeFileSync(filePath, content);

    console.log(`  💾 Backup created: ${path.relative(process.cwd(), backupPath)}`);
    console.log(`  📝 Applied ${changes} migration(s): ${appliedMigrations.join(', ')}\n`);
  } else {
    console.log(`  ℹ️  No migrations needed\n`);
  }

  return { changes, appliedMigrations };
}

async function runMigration() {
  console.log('📂 Scanning for component files...\n');

  const files = await findComponentFiles();
  console.log(`Found ${files.length} files to migrate\n`);

  const results = {
    totalFiles: files.length,
    migratedFiles: 0,
    totalChanges: 0,
    migrationsByType: {}
  };

  for (const file of files) {
    const result = await migrateFile(file);

    if (result.changes > 0) {
      results.migratedFiles++;
      results.totalChanges += result.changes;

      result.appliedMigrations.forEach(migration => {
        results.migrationsByType[migration] = (results.migrationsByType[migration] || 0) + 1;
      });
    }
  }

  // Generate summary report
  console.log('📊 Migration Summary Report\n');
  console.log('='.repeat(50));
  console.log(`Total files scanned: ${results.totalFiles}`);
  console.log(`Files migrated: ${results.migratedFiles}`);
  console.log(`Total changes applied: ${results.totalChanges}`);
  console.log('');

  if (Object.keys(results.migrationsByType).length > 0) {
    console.log('Migration types applied:');
    Object.entries(results.migrationsByType).forEach(([type, count]) => {
      console.log(`  • ${type}: ${count} times`);
    });
  } else {
    console.log('No migrations were applied.');
  }

  // Save detailed report
  const reportPath = path.join(process.cwd(), 'component-migration-report.json');
  const report = {
    timestamp: new Date().toISOString(),
    results,
    files: files.map(f => path.relative(process.cwd(), f))
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);

  console.log('\n✅ Component migration complete!');

  if (results.migratedFiles > 0) {
    console.log('\n⚠️  IMPORTANT: Review all changes and test thoroughly before committing.');
    console.log('   Backups were created for all modified files (*.backup).');
  }
}

// Run the migration
runMigration().catch(error => {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
});