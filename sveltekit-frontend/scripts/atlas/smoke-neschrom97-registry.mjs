#!/usr/bin/env node
/**
 * Smoke test: NESCHROM97 registry validation (Session 76 Tier 2 gate)
 * Verifies: structure, uniqueness, confidence distribution, card counts
 * Usage: node scripts/atlas/smoke-neschrom97-registry.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');
const registryPath = path.join(repoRoot, 'docs/reports/neschrom97-card-registry.json');

let passCount = 0;
let failCount = 0;

function test(name, condition, details = '') {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passCount++;
  } else {
    console.log(`  ❌ ${name} ${details ? '(' + details + ')' : ''}`);
    failCount++;
  }
}

async function main() {
  console.log('\n🧪 NESCHROM97 Registry Smoke Test\n');

  if (!fs.existsSync(registryPath)) {
    console.error(`❌ Registry file not found: ${registryPath}\n`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const meta = registry.metadata || {};
  const mappings = registry.mappings || [];

  // Test 1: Metadata structure
  console.log('Test 1: Metadata Structure');
  test('metadata present', !!meta);
  test('schema_version defined', !!meta.schema_version);
  test('card_store_size defined', typeof meta.card_store_size === 'number');
  test('mapped_count defined', typeof meta.mapped_count === 'number');
  test('unmapped_count defined', typeof meta.unmapped_count === 'number');

  // Test 2: Card counts
  console.log('\nTest 2: Card Counts');
  test('card_store_size = 8,170', meta.card_store_size === 8170, `got ${meta.card_store_size}`);
  test('packet_ledger_size = 45', meta.packet_ledger_size === 45, `got ${meta.packet_ledger_size}`);
  test('mapped_count = 30', meta.mapped_count === 30, `got ${meta.mapped_count}`);
  test('unmapped_count = 8,140', meta.unmapped_count === 8140, `got ${meta.unmapped_count}`);
  test('mapped + unmapped = 8,170', meta.mapped_count + meta.unmapped_count === 8170);
  test('duplicate_cards = 0', meta.duplicate_cards === 0, `got ${meta.duplicate_cards}`);

  // Test 3: Mapping array structure
  console.log('\nTest 3: Mapping Array');
  test('mappings is array', Array.isArray(mappings));
  test('mappings.length > 0', mappings.length > 0, `got ${mappings.length}`);

  // Test 4: Card uniqueness
  console.log('\nTest 4: Uniqueness');
  const cardIds = mappings.map(m => m.card_id);
  const uniqueCardIds = new Set(cardIds);
  test('no duplicate card_ids', cardIds.length === uniqueCardIds.size, `${cardIds.length} vs ${uniqueCardIds.size}`);

  // Test 5: Confidence distribution
  console.log('\nTest 5: Confidence Distribution');
  const confidences = mappings.map(m => m.match_confidence).filter(c => typeof c === 'number');
  const validConfidences = confidences.every(c => c >= 0 && c <= 1);
  test('all confidence values in [0, 1]', validConfidences);
  test('confidence values present', confidences.length > 0, `got ${confidences.length}`);

  // Test 6: Mapped vs unmapped split (marked by retrieval_temperature)
  console.log('\nTest 6: Mapped vs Unmapped');
  const mapped = mappings.filter(m => m.retrieval_temperature === 'hot' || m.retrieval_temperature === 'warm');
  const unmapped = mappings.filter(m => m.retrieval_temperature === 'cold');
  test('mapped count matches metadata', mapped.length === meta.mapped_count, `${mapped.length} vs ${meta.mapped_count}`);
  test('unmapped count matches metadata', unmapped.length === meta.unmapped_count, `${unmapped.length} vs ${meta.unmapped_count}`);

  // Test 7: Mapped card quality
  console.log('\nTest 7: Mapped Cards Quality');
  const mappedWithPoint = mapped.filter(m => m.qdrant_point_id !== null);
  console.log(`  ℹ️  Mapped cards with qdrant_point_id: ${mappedWithPoint.length}/${mapped.length}`);
  const mappedWithConfidence = mapped.filter(m => m.match_confidence > 0.5);
  console.log(`  ℹ️  Mapped cards with confidence > 0.5: ${mappedWithConfidence.length}/${mapped.length}`);

  // Test 8: Temperature distribution
  console.log('\nTest 8: Temperature Distribution');
  test('temperature_distribution defined', !!meta.temperature_distribution);
  if (meta.temperature_distribution) {
    const tempDist = meta.temperature_distribution;
    const tempSum = (tempDist.hot || 0) + (tempDist.warm || 0) + (tempDist.cool || 0) + (tempDist.cold || 0);
    test('temperature sum = 8,170', tempSum === 8170, `got ${tempSum}`);
    console.log(`  ℹ️  Hot: ${tempDist.hot}, Warm: ${tempDist.warm}, Cool: ${tempDist.cool}, Cold: ${tempDist.cold}`);
  }

  // Test 9: Required fields on each mapping
  console.log('\nTest 9: Required Fields');
  const requiredFields = ['card_id', 'card_hash', 'source_ref', 'som_cluster'];
  let fieldsMissing = 0;
  for (const field of requiredFields) {
    const missingCount = mappings.filter(m => !(field in m)).length;
    if (missingCount > 0) {
      console.log(`  ❌ ${field} missing in ${missingCount} cards`);
      fieldsMissing += missingCount;
    } else {
      console.log(`  ✅ ${field} present in all ${mappings.length} cards`);
      passCount++;
    }
  }
  failCount += fieldsMissing > 0 ? 1 : 0;

  // Summary
  console.log(`\n📊 Summary: ${passCount} PASS, ${failCount} FAIL`);
  console.log(`\n✅ Registry validation: ${failCount === 0 ? 'READY FOR QDRANT ENRICHMENT' : 'ISSUES DETECTED — DO NOT PROCEED'}\n`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message, '\n');
  process.exit(1);
});
