#!/usr/bin/env node
/**
 * Query Phase 89 Rankings from Qdrant with Tag Filtering
 *
 * Uses Qdrant's payload filtering + semantic search to rank files by:
 * - Error count
 * - Complexity score
 * - Centrality (import graph)
 * - Embedding similarity to error patterns
 * - Tags (route, component, util, store, type)
 */

import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

// =============================================================================
// Query Configuration
// Actual Qdrant payload structure: { file_path, unit_kind, feature_tags, signature_text }
// =============================================================================
const QUERIES = {
  topErrors: {
    collection: 'phase89_code_units',
    limit: 50,
    // Note: error_count might not be in payload, we'll filter in code
    filter: null
  },

  components: {
    collection: 'phase89_code_units',
    limit: 100,
    filter: {
      must: [
        { key: 'unit_kind', match: { value: 'component' } }
      ]
    }
  },

  routes: {
    collection: 'phase89_code_units',
    limit: 100,
    filter: {
      must: [
        { key: 'unit_kind', match: { value: 'route' } }
      ]
    }
  },

  modules: {
    collection: 'phase89_code_units',
    limit: 200,
    filter: {
      must: [
        { key: 'unit_kind', match: { value: 'module' } }
      ]
    }
  },

  uiComponents: {
    collection: 'phase89_code_units',
    limit: 50,
    filter: {
      must: [
        { key: 'feature_tags', match: { value: 'ui' } }
      ]
    }
  },

  services: {
    collection: 'phase89_code_units',
    limit: 100,
    filter: {
      must: [
        { key: 'feature_tags', match: { value: 'service' } }
      ]
    }
  }
};

// =============================================================================
// Query Qdrant with Filters
// =============================================================================
async function queryWithFilters(queryConfig) {
  try {
    const result = await qdrant.scroll(queryConfig.collection, {
      limit: queryConfig.limit,
      filter: queryConfig.filter,
      with_payload: true,
      with_vector: false
    });

    return result.points || [];
  } catch (error) {
    console.error(`Error querying ${queryConfig.collection}:`, error.message);
    return [];
  }
}

// =============================================================================
// Semantic Search by Error Pattern
// =============================================================================
async function searchSimilarToErrors(errorPattern, limit = 20) {
  try {
    // Get embedding for error pattern query
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: errorPattern
      })
    });

    const { embedding } = await response.json();

    // Search Qdrant
    const results = await qdrant.search('phase89_code_units', {
      vector: embedding,
      limit,
      with_payload: true
    });

    return results;
  } catch (error) {
    console.error('Semantic search error:', error.message);
    return [];
  }
}

// =============================================================================
// Analyze TypeScript File Necessity
// =============================================================================
async function analyzeTypeScriptFiles() {
  console.log('\n📊 Analyzing TypeScript File Necessity...\n');

  const allTS = await qdrant.scroll('phase89_code_units', {
    filter: null, // Get all files, we'll filter by extension in code
    limit: 5000,
    with_payload: true
  });

  const files = (allTS.points || []).filter(p =>
    p.payload?.file_path?.endsWith('.ts') ||
    p.payload?.file_path?.endsWith('.d.ts')
  );

  // Categorize TypeScript files by path patterns
  const categories = {
    typeDefinitions: files.filter(f => f.payload?.file_path?.endsWith('.d.ts')),
    utilities: files.filter(f => f.payload?.file_path?.includes('/utils/') || f.payload?.file_path?.includes('/lib/utils')),
    services: files.filter(f => f.payload?.file_path?.includes('/services/') || f.payload?.feature_tags === 'service'),
    stores: files.filter(f => f.payload?.file_path?.includes('/stores/') || f.payload?.file_path?.includes('Store.ts')),
    types: files.filter(f => f.payload?.file_path?.includes('/types/') && !f.payload?.file_path?.endsWith('.d.ts')),
    routes: files.filter(f => f.payload?.unit_kind === 'route'),
    components: files.filter(f => f.payload?.file_path?.includes('/components/') && f.payload?.file_path?.endsWith('.ts')),
    config: files.filter(f => f.payload?.file_path?.match(/config|setup|env|\.config\.ts/i)),
    other: []
  };

  // Categorize remaining files
  const categorized = new Set([
    ...categories.typeDefinitions,
    ...categories.utilities,
    ...categories.services,
    ...categories.stores,
    ...categories.types,
    ...categories.routes,
    ...categories.components,
    ...categories.config
  ].map(f => f.id));

  categories.other = files.filter(f => !categorized.has(f.id));

  console.log('TypeScript File Breakdown:\n');
  console.log(`  Total: ${files.length} files`);
  console.log(`  Type Definitions (.d.ts): ${categories.typeDefinitions.length}`);
  console.log(`  Utilities: ${categories.utilities.length}`);
  console.log(`  Services: ${categories.services.length}`);
  console.log(`  Stores: ${categories.stores.length}`);
  console.log(`  Types: ${categories.types.length}`);
  console.log(`  Routes: ${categories.routes.length}`);
  console.log(`  Component Logic: ${categories.components.length}`);
  console.log(`  Config files: ${categories.config.length}`);
  console.log(`  Other: ${categories.other.length}\n`);

  // Show sample files from each category
  console.log('Sample Files by Category:\n');
  Object.entries(categories).forEach(([name, items]) => {
    if (items.length > 0) {
      console.log(`  ${name} (${items.length}):`);
      items.slice(0, 3).forEach(f => {
        console.log(`    - ${f.payload?.file_path}`);
      });
      if (items.length > 3) {
        console.log(`    ... and ${items.length - 3} more`);
      }
      console.log('');
    }
  });

  return categories;
}

// =============================================================================
// Main Query Interface
// =============================================================================
async function main() {
  console.log('\n🔍 Phase 89 Qdrant Rankings Query\n');
  console.log('════════════════════════════════════════════════════════════\n');

  const args = process.argv.slice(2);
  const command = args[0] || 'top-errors';

  switch (command) {
    case 'components':
    case '1':
      console.log('📦 All Components:\n');
      const comps = await queryWithFilters(QUERIES.components);
      comps.forEach((point, i) => {
        const p = point.payload;
        console.log(`  ${i + 1}. ${p?.file_path || 'unknown'}`);
        console.log(`     Kind: ${p?.unit_kind} | Tags: ${p?.feature_tags || 'none'}`);
      });
      break;

    case 'routes':
    case '2':
      console.log('🛣️  All Routes:\n');
      const routes = await queryWithFilters(QUERIES.routes);
      routes.forEach((point, i) => {
        const p = point.payload;
        console.log(`  ${i + 1}. ${p?.file_path || 'unknown'}`);
        console.log(`     Route ID: ${p?.route_id || 'unknown'} | Tags: ${p?.feature_tags || 'none'}`);
      });
      break;

    case 'modules':
    case '3':
      console.log('📚 All Modules:\n');
      const mods = await queryWithFilters(QUERIES.modules);
      mods.forEach((point, i) => {
        const p = point.payload;
        console.log(`  ${i + 1}. ${p?.file_path || 'unknown'}`);
        console.log(`     Kind: ${p?.unit_kind} | Tags: ${p?.feature_tags || 'none'}`);
      });
      break;

    case 'ui':
    case '4':
      console.log('🎨 UI Components:\n');
      const ui = await queryWithFilters(QUERIES.uiComponents);
      ui.forEach((point, i) => {
        const p = point.payload;
        console.log(`  ${i + 1}. ${p?.file_path || 'unknown'}`);
        console.log(`     Kind: ${p?.unit_kind} | Signature: ${p?.signature_text?.split('\n')[0] || 'N/A'}`);
      });
      break;

    case 'services':
    case '5':
      console.log('⚙️  Service Modules:\n');
      const svcs = await queryWithFilters(QUERIES.services);
      svcs.forEach((point, i) => {
        const p = point.payload;
        console.log(`  ${i + 1}. ${p?.file_path || 'unknown'}`);
        console.log(`     Kind: ${p?.unit_kind} | Tags: ${p?.feature_tags || 'none'}`);
      });
      break;

    case 'analyze-ts':
    case '6':
      await analyzeTypeScriptFiles();
      break;

    case 'search-similar':
      const pattern = args[1] || 'Svelte 5 runes state management';
      console.log(`🔎 Semantic Search: "${pattern}"\n`);
      const similar = await searchSimilarToErrors(pattern, 15);
      similar.forEach((result, i) => {
        console.log(`  ${i + 1}. ${result.payload?.file_path || 'unknown'}`);
        console.log(`     Similarity: ${(result.score * 100).toFixed(1)}% | Kind: ${result.payload?.unit_kind || 'unknown'}`);
      });
      break;

    default:
      console.log('Usage: node query-phase89-rankings.mjs [command]\n');
      console.log('Commands:');
      console.log('  1 | components      - List all Svelte components');
      console.log('  2 | routes          - List all SvelteKit routes');
      console.log('  3 | modules         - List all TypeScript modules');
      console.log('  4 | ui              - List UI-tagged components');
      console.log('  5 | services        - List service modules');
      console.log('  6 | analyze-ts      - Analyze TypeScript file necessity');
      console.log('  search-similar <pattern> - Semantic search for similar code\n');
      break;
  }

  console.log('\n✅ Query Complete!\n');
}

main().catch(console.error);
