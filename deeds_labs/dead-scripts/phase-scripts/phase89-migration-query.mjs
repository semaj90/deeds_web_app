#!/usr/bin/env node
/**
 * Phase 89: Migration Query Tool
 *
 * Query Qdrant for files that need specific migrations:
 * - Svelte 4 → Svelte 5
 * - Melt-UI → Bits-UI v2
 * - Route consolidation
 * - Modal card patterns
 *
 * Usage:
 *   node scripts/phase89-migration-query.mjs --svelte5
 *   node scripts/phase89-migration-query.mjs --bits-ui
 *   node scripts/phase89-migration-query.mjs --routes
 *   node scripts/phase89-migration-query.mjs --modals
 *   node scripts/phase89-migration-query.mjs --all
 */


const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'phase89_code_units';

const MIGRATION_QUERIES = {
  svelte5: {
    name: 'Svelte 4 → Svelte 5 Migration',
    filter: {
      must: [
        { key: 'needs_svelte5_migration', match: { value: true } }
      ]
    }
  },
  bitsui: {
    name: 'Melt-UI → Bits-UI v2 Migration',
    filter: {
      must: [
        { key: 'needs_bits_ui_migration', match: { value: true } }
      ]
    }
  },
  routes: {
    name: 'Route Consolidation Patterns',
    filter: {
      must: [
        { key: 'is_route_consolidated', match: { value: true } }
      ]
    }
  },
  modals: {
    name: 'Modal Card Components',
    filter: {
      must: [
        { key: 'is_modal_card', match: { value: true } }
      ]
    }
  },
  svelte4props: {
    name: 'Svelte 4 Props (export let)',
    filter: {
      must: [
        { key: 'migration_flags', match: { any: ['svelte4_props'] } }
      ]
    }
  },
  svelte4events: {
    name: 'Svelte 4 Events (createEventDispatcher)',
    filter: {
      must: [
        { key: 'migration_flags', match: { any: ['svelte4_events'] } }
      ]
    }
  },
  svelte4reactivity: {
    name: 'Svelte 4 Reactivity ($:)',
    filter: {
      must: [
        { key: 'migration_flags', match: { any: ['svelte4_reactivity'] } }
      ]
    }
  }
};

async function queryMigrations(queryName) {
  const query = MIGRATION_QUERIES[queryName];

  if (!query) {
    console.error(`❌ Unknown query: ${queryName}`);
    console.log(`\nAvailable queries: ${Object.keys(MIGRATION_QUERIES).join(', ')}`);
    return;
  }

  console.log(`\n🔍 ${query.name}`);
  console.log('═'.repeat(60));

  try {
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: query.filter,
        limit: 100,
        with_payload: true,
        with_vector: false
      })
    });

    if (!response.ok) {
      throw new Error(`Qdrant query failed: ${response.statusText}`);
    }

    const data = await response.json();
    const points = data.result?.points || [];

    console.log(`\n📊 Found ${points.length} files\n`);

    if (points.length === 0) {
      console.log('✅ No files need this migration!\n');
      return;
    }

    // Group by migration flags
    const byFlags = {};

    for (const point of points) {
      const { file_path, unit_kind, migration_flags, feature_tags } = point.payload;

      const flags = migration_flags || [];
      const flagKey = flags.join(', ') || 'no_flags';

      if (!byFlags[flagKey]) {
        byFlags[flagKey] = [];
      }

      byFlags[flagKey].push({
        path: file_path,
        kind: unit_kind,
        tags: feature_tags || []
      });
    }

    // Print grouped results
    for (const [flags, files] of Object.entries(byFlags)) {
      console.log(`📌 ${flags}`);
      console.log(`   ${files.length} files`);

      // Show first 10
      for (const file of files.slice(0, 10)) {
        console.log(`   • ${file.path} (${file.kind})`);
        if (file.tags.length > 0) {
          console.log(`     Tags: ${file.tags.join(', ')}`);
        }
      }

      if (files.length > 10) {
        console.log(`   ... and ${files.length - 10} more`);
      }
      console.log('');
    }

    // Summary
    console.log('═'.repeat(60));
    console.log(`Total: ${points.length} files need attention\n`);

    // Export to file
    const exportPath = `reports/migration-${queryName}-${Date.now()}.json`;
    const summary = {
      query: query.name,
      timestamp: new Date().toISOString(),
      total_files: points.length,
      files: points.map(p => ({
        path: p.payload.file_path,
        kind: p.payload.unit_kind,
        migration_flags: p.payload.migration_flags,
        feature_tags: p.payload.feature_tags
      }))
    };

    try {
      await import('fs/promises').then(fs =>
        fs.writeFile(exportPath, JSON.stringify(summary, null, 2))
      );
      console.log(`💾 Exported to: ${exportPath}\n`);
    } catch (e) {
      console.warn(`⚠️  Could not export: ${e.message}`);
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
  }
}

async function queryAll() {
  console.log('\n🔍 Running All Migration Queries\n');

  for (const queryName of Object.keys(MIGRATION_QUERIES)) {
    await queryMigrations(queryName);
    await new Promise(resolve => setTimeout(resolve, 500)); // Throttle
  }
}

// Main
const args = process.argv.slice(2);
const command = args[0] || '--help';

if (command === '--help' || command === '-h') {
  console.log('\n📋 Phase 89: Migration Query Tool\n');
  console.log('Available commands:');
  console.log('  --svelte5         Files needing Svelte 4 → 5 migration');
  console.log('  --bits-ui         Files needing Melt-UI → Bits-UI migration');
  console.log('  --routes          Files with route consolidation patterns');
  console.log('  --modals          Files with modal card patterns');
  console.log('  --svelte4props    Files using export let');
  console.log('  --svelte4events   Files using createEventDispatcher');
  console.log('  --svelte4reactivity Files using $: reactivity');
  console.log('  --all             Run all queries');
  console.log('');
} else if (command === '--all') {
  queryAll();
} else {
  const queryName = command.replace('--', '');
  queryMigrations(queryName);
}
