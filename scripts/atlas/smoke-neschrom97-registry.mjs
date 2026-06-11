#!/usr/bin/env node
/**
 * NESCHROM97 Registry Smoke Test
 *
 * Narrow boundaries:
 * - No Drizzle imports
 * - No SvelteKit bootstrap
 * - Pure fs/JSON operations only
 * - Report and exit cleanly
 *
 * Usage:
 *   npm run smoke:neschrom97-registry
 *   node scripts/atlas/smoke-neschrom97-registry.mjs
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL (error during test)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// ============================================================================
// TESTS
// ============================================================================

function testRegistry() {
  const registryPath = path.join(PROJECT_ROOT, 'docs/reports/neschrom97-card-registry.json');

  // Verify file exists
  if (!fs.existsSync(registryPath)) {
    throw new Error(`Registry file not found: ${registryPath}`);
  }

  // Load and parse
  const content = fs.readFileSync(registryPath, 'utf8');
  const registry = JSON.parse(content);

  // Validate structure
  if (!registry.metadata) throw new Error('Missing metadata');
  if (!Array.isArray(registry.mappings)) throw new Error('Missing mappings array');

  const meta = registry.metadata;
  const mappings = registry.mappings;

  console.log('[✓] Registry file valid JSON');
  console.log(`[✓] Metadata present (${Object.keys(meta).length} fields)`);
  console.log(`[✓] Mappings array loaded (${mappings.length} entries)`);

  return { registry, meta, mappings };
}

function testCardCount(meta, mappings) {
  // Card store should have 8,170 cards
  if (meta.card_store_size !== 8170) {
    throw new Error(`Expected card_store_size=8170, got ${meta.card_store_size}`);
  }

  // Mappings should match card store size
  if (mappings.length !== meta.card_store_size) {
    throw new Error(
      `Mappings count (${mappings.length}) != card_store_size (${meta.card_store_size})`
    );
  }

  console.log(`[✓] Card count verified (${meta.card_store_size})`);
}

function testMappingStructure(mappings) {
  // Check first 10 mappings for required fields
  const required = ['card_id', 'source', 'tags', 'som_cluster', 'packet_id', 'feature_id', 'match_confidence'];

  for (let i = 0; i < Math.min(10, mappings.length); i++) {
    const m = mappings[i];
    for (const field of required) {
      if (!(field in m)) {
        throw new Error(`Mapping ${i} missing field: ${field}`);
      }
    }
  }

  console.log(`[✓] Mapping structure verified (${Math.min(10, mappings.length)} samples)`);
}

function testMatchStats(meta) {
  const { mapped_count, mapped_percentage, unmapped_count, card_store_size } = meta;

  // Mapped + unmapped should equal total
  if (mapped_count + unmapped_count !== card_store_size) {
    throw new Error(
      `Mapped (${mapped_count}) + Unmapped (${unmapped_count}) != Total (${card_store_size})`
    );
  }

  // Percentage should be correct
  const expected = ((mapped_count / card_store_size) * 100).toFixed(1);
  if (mapped_percentage !== expected) {
    console.warn(
      `[warn] Percentage mismatch: ${mapped_percentage}% vs expected ${expected}%`
    );
  }

  console.log(`[✓] Match stats valid: ${mapped_count} mapped / ${unmapped_count} unmapped`);
}

function testConfidenceDistribution(mappings) {
  let highConf = 0;  // >= 0.75
  let medConf = 0;   // 0.5 - 0.75
  let lowConf = 0;   // 0 - 0.5
  let zeroConf = 0;  // == 0

  for (const m of mappings) {
    const c = m.match_confidence || 0;
    if (c >= 0.75) highConf++;
    else if (c >= 0.5) medConf++;
    else if (c > 0) lowConf++;
    else zeroConf++;
  }

  console.log(
    `[✓] Confidence distribution: HIGH=${highConf} MED=${medConf} LOW=${lowConf} ZERO=${zeroConf}`
  );
}

function testNoOrphanIds(mappings) {
  const cardIds = new Set();
  const dupes = [];

  for (const m of mappings) {
    if (!m.card_id) {
      throw new Error('Found mapping with missing card_id');
    }
    if (cardIds.has(m.card_id)) {
      dupes.push(m.card_id);
    }
    cardIds.add(m.card_id);
  }

  if (dupes.length > 0) {
    throw new Error(`Found ${dupes.length} duplicate card_ids`);
  }

  console.log(`[✓] All card_ids unique (${cardIds.size} total)`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('[start] NESCHROM97 Registry Smoke Test\n');

  try {
    // Test 1: Registry file and structure
    console.log('[test-1] Registry file and structure...');
    const { registry, meta, mappings } = testRegistry();

    // Test 2: Card count
    console.log('\n[test-2] Card count integrity...');
    testCardCount(meta, mappings);

    // Test 3: Mapping structure
    console.log('\n[test-3] Mapping field structure...');
    testMappingStructure(mappings);

    // Test 4: Match statistics
    console.log('\n[test-4] Match statistics...');
    testMatchStats(meta);

    // Test 5: Confidence distribution
    console.log('\n[test-5] Confidence distribution...');
    testConfidenceDistribution(mappings);

    // Test 6: No orphan IDs
    console.log('\n[test-6] Card ID uniqueness...');
    testNoOrphanIds(mappings);

    // Summary
    console.log('\n[summary]');
    console.log(`  Card store: ${meta.card_store_size}`);
    console.log(`  Packet ledger: ${meta.packet_ledger_size}`);
    console.log(`  Mapped: ${meta.mapped_count} (${meta.mapped_percentage}%)`);
    console.log(`  Unmapped: ${meta.unmapped_count}`);
    console.log(`  Generated: ${meta.generated_at}`);

    console.log('\n[✓] ALL TESTS PASS');
    process.exit(0);
  } catch (err) {
    console.error(`\n[✗] TEST FAILED: ${err.message}`);
    process.exit(1);
  }
}

main();
