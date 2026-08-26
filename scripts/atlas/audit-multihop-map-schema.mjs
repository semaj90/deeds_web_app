#!/usr/bin/env node
/**
 * Audit multihop enrichment map schema
 * Verifies that regenerate-multihop-with-enrichment.mjs has valid node template
 * Runs before generation to catch schema errors early
 */

import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../../');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Multihop Map Schema Audit                                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Expected canonical node fields
const REQUIRED_FIELDS = [
  'stableKey',
  'kind',
  'packetKey',
  'sourceRef',
  'featureId',
  'featureLabel',
  'communityId',
  'communitySource',
  'filePath',
  'fileUrl',
  'summary',
  'qdrantPointId',
  'qdrantCollection',
  'qdrantTags',
  'qdrantPayload',
  'encodedLatent',
  'somCell',
  'karpathyBlend',
  'redisKey',
  'ginMetadata',
  'tags',
  'clusterKey',
  'manifold4',
  'svgGlyphRefs',
  'treeNodeId',
  'pageIndexPath',
  'lineageVersion',
  'ledgerType',
  'canonical'
];

console.log('📋 Verifying node schema against the generated artifact...\n');

// 2026-08-26: this audit used to regex-parse the generator's SOURCE CODE for
// a `createNodeTemplate()` function -- brittle (fails on any valid rewrite
// that builds nodes a different way) and not actually validating what
// matters, which is the OUTPUT DATA's schema. Read the real generated
// artifact instead and check its actual node keys.
const artifactPath = resolve(ROOT, 'sveltekit-frontend/docs/graph/multihop-codebase-map.enriched.json');
let templateFields = [];
if (existsSync(artifactPath)) {
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
  const sampleNode = artifact.nodes?.[0];
  if (sampleNode) {
    templateFields = Object.keys(sampleNode);
    console.log(`   Sampled 1 node from ${artifact.nodes.length} in the generated artifact.\n`);
  }
}
if (templateFields.length === 0) {
  console.error('❌ No generated artifact found (or it has zero nodes) -- run the generator first');
  process.exit(1);
}

// Generator source is still read for the enrichment-integration-point checks below.
const generatorPath = resolve(__dirname, 'regenerate-multihop-with-enrichment.mjs');
const generatorCode = readFileSync(generatorPath, 'utf-8');

// Verify all required fields present
let missing = [];
for (const field of REQUIRED_FIELDS) {
  if (!templateFields.includes(field)) {
    missing.push(field);
  }
}

if (missing.length > 0) {
  console.error(`❌ Missing required fields: ${missing.join(', ')}`);
  process.exit(1);
}

// Check for extra unexpected fields
let extra = [];
for (const field of templateFields) {
  if (!REQUIRED_FIELDS.includes(field)) {
    extra.push(field);
  }
}

if (extra.length > 0) {
  console.warn(`⚠️  Extra unexpected fields: ${extra.join(', ')}`);
  console.warn('   (This is acceptable; extra fields will be included)\n');
}

console.log(`✅ Template has all ${REQUIRED_FIELDS.length} required fields`);
console.log(`✅ Field count: ${templateFields.length}\n`);

// Check enrichment steps are present
console.log('📋 Verifying enrichment integration points...\n');

const checks = [
  {
    name: 'fetchPostgresPackets',
    pattern: /async function fetchPostgresPackets\(/,
    essential: true
  },
  {
    name: 'fetchQdrantEnrichment',
    pattern: /async function fetchQdrantEnrichment\(\)/,
    essential: false
  },
  {
    name: 'Qdrant point matching',
    pattern: /qdrantMap\.get\(pkg\.source_ref\)/,
    essential: false
  },
  {
    name: 'Redis cache reference',
    pattern: /redisKey/,
    essential: false
  },
  {
    name: 'Ledger type tracking',
    pattern: /ledgerType/,
    essential: true
  },
  {
    name: 'Readiness gate',
    pattern: /readyForHigherHop/,
    essential: true
  }
];

let essentialPassed = 0;
for (const check of checks) {
  const found = check.pattern.test(generatorCode);
  const symbol = found ? '✅' : (check.essential ? '❌' : '⚠️ ');
  const status = check.essential ? (found ? 'ESSENTIAL' : 'ESSENTIAL MISSING') : (found ? 'OK' : 'MISSING');

  console.log(`${symbol} ${check.name}: ${status}`);

  if (check.essential && found) essentialPassed++;
}

const essentialCount = checks.filter(c => c.essential).length;
if (essentialPassed !== essentialCount) {
  console.error(`\n❌ ${essentialCount - essentialPassed} essential checks failed`);
  process.exit(1);
}

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║ SCHEMA AUDIT PASSED ✅                                         ║');
console.log('║ Safe to proceed with generation                               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

process.exit(0);
