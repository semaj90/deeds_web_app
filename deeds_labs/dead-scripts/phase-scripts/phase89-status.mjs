#!/usr/bin/env node
/**
 * Phase 89: Status Check
 * Quick validation of enhanced embedding & migration metadata
 */

import { execSync } from 'child_process';

const QDRANT_URL = 'http://localhost:6333';

console.log('\n🎯 Phase 89: Enhanced Embedding & Migration Status\n');
console.log('═'.repeat(70));

// 1. Check Node Processes
console.log('\n1️⃣ Indexer Status:');
try {
  const nodeProcs = execSync('powershell "Get-Process -Name node -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count"', { encoding: 'utf-8' }).trim();
  if (parseInt(nodeProcs) > 0) {
    console.log(`   ✅ Running (${nodeProcs} node processes)`);
  } else {
    console.log('   ✅ Complete (no active processes)');
  }
} catch (e) {
  console.log('   ⚠️  Cannot check process status');
}

// 2. Check Qdrant Collections
console.log('\n2️⃣ Qdrant Collections:');

const collections = [
  'phase89_code_units',
  'phase89_code_chunks',
  'phase90_error_cards',
  'phase90_error_clusters'
];

for (const coll of collections) {
  try {
    const response = await fetch(`${QDRANT_URL}/collections/${coll}`);
    if (response.ok) {
      const data = await response.json();
      const count = data.result.points_count;
      const status = data.result.status;

      if (count > 0) {
        console.log(`   ✅ ${coll}: ${count.toLocaleString()} points (${status})`);
      } else {
        console.log(`   ⏳ ${coll}: Empty (${status})`);
      }
    } else {
      console.log(`   ❌ ${coll}: Not found`);
    }
  } catch (e) {
    console.log(`   ❌ ${coll}: Cannot connect`);
  }
}

// 3. Check Tools
console.log('\n3️⃣ Migration Tools:');

const tools = [
  { path: 'scripts/phase89-migration-query.mjs', name: 'Migration Query CLI' },
  { path: 'scripts/test-phase89-embedding.mjs', name: 'Embedding Test Suite' },
  { path: 'scripts/phase89-code-unit-indexer.mjs', name: 'Code Unit Indexer' }
];

import { existsSync } from 'fs';

for (const tool of tools) {
  if (existsSync(tool.path)) {
    console.log(`   ✅ ${tool.name}`);
  } else {
    console.log(`   ❌ ${tool.name} (missing)`);
  }
}

// 4. Next Steps
console.log('\n' + '═'.repeat(70));
console.log('\n📋 Next Steps:\n');
console.log('   # Find Svelte 4 → 5 migrations');
console.log('   node scripts/phase89-migration-query.mjs --svelte5\n');

console.log('   # Find Melt-UI → Bits-UI migrations');
console.log('   node scripts/phase89-migration-query.mjs --bits-ui\n');

console.log('   # Run all migration queries');
console.log('   node scripts/phase89-migration-query.mjs --all\n');

console.log('   # Test embedding system');
console.log('   node scripts/test-phase89-embedding.mjs\n');

console.log('═'.repeat(70));
console.log('');
