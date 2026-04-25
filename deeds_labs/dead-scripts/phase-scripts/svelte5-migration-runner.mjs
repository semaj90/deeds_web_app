#!/usr/bin/env node

/**
 * Svelte 5 Migration Master Script
 *
 * Runs all migration fixers in the correct order:
 * 1. Rule A: Import-Type Misuse
 * 2. Rule B: Runes Consistency
 * 3. Rule C: Event Handler Syntax
 * 4. Rule D: Component Props Modernization
 */

const { execSync } = require('child_process');
const path = require('path');

async function runMigration() {
  console.log('🚀 Starting Svelte 5 Migration Suite');
  console.log('=====================================\n');

  const fixers = [
    { name: 'Rule A: Import-Type Misuse', script: 'svelte5-rule-a-fixer.mjs' },
    { name: 'Rule B: Runes Consistency', script: 'svelte5-rule-b-fixer.mjs' },
    { name: 'Rule C: Event Handler Syntax', script: 'svelte5-rule-c-fixer.mjs' },
    { name: 'Rule D: Component Props', script: 'svelte5-rule-d-fixer.mjs' }
  ];

  for (const fixer of fixers) {
    console.log(`\n▶️  Running ${fixer.name}...`);
    try {
      execSync(`node scripts/${fixer.script}`, { stdio: 'inherit' });
      console.log(`✅ ${fixer.name} completed successfully`);
    } catch (error) {
      console.error(`❌ ${fixer.name} failed:`, error.message);
      process.exit(1);
    }
  }

  console.log('\n🎉 Svelte 5 Migration Complete!');
  console.log('================================');
  console.log('Next steps:');
  console.log('1. Run: npm run check');
  console.log('2. Review any remaining errors');
  console.log('3. Test core functionality');
  console.log('4. Commit changes');
}

// Run the migration
runMigration().catch(console.error);</content>
<parameter name="filePath">scripts/svelte5-migration-runner.mjs