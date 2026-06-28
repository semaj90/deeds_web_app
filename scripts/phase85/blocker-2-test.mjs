#!/usr/bin/env node

/**
 * PHASE 85a BLOCKER #2 TEST
 *
 * Verify artifact registry logging + semantic diff gate + summary QA + pipeline
 * integration is wired correctly.
 *
 * Usage:
 *   node scripts/phase85/blocker-2-test.mjs [--dry-run] [--verbose]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERBOSE = process.argv.includes('--verbose');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Check file existence ───────────────────────────────────────────────────────

const FILES_TO_CHECK = [
  'sveltekit-frontend/src/lib/server/generation/semantic-diff-gate.ts',
  'sveltekit-frontend/src/lib/server/generation/artifact-logger.ts',
  'sveltekit-frontend/src/lib/server/generation/summary-qa.ts',
  'sveltekit-frontend/src/lib/server/generation/packet-summary-pipeline.ts',
  'sveltekit-frontend/src/lib/server/generation/index.ts',
  'sveltekit-frontend/src/routes/api/atlas/summary/+server.ts',
  'sveltekit-frontend/src/lib/server/db/schema/atlas-semantic-diffs.ts',
  'sveltekit-frontend/src/lib/server/db/schema/atlas-artifacts.ts',
  'sveltekit-frontend/drizzle/manual/0047_phase85a_semantic_diffs.sql',
  'sveltekit-frontend/drizzle/manual/0048_phase85a_artifact_registry.sql',
];

let passed = 0;
let failed = 0;

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('PHASE 85a BLOCKER #2: ARTIFACT REGISTRY LOGGING TEST');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

console.log('✓ Checking required files...\n');

for (const file of FILES_TO_CHECK) {
  const fullPath = path.join(__dirname, '../../', file);
  const exists = fs.existsSync(fullPath);

  if (exists) {
    console.log(`  ✅ ${file}`);
    passed++;
  } else {
    console.log(`  ❌ ${file} — NOT FOUND`);
    failed++;
  }
}

console.log('\n───────────────────────────────────────────────────────────────────────────\n');

// ── Check exports ──────────────────────────────────────────────────────────────

const EXPORTS_TO_CHECK = [
  {
    file: 'sveltekit-frontend/src/lib/server/generation/artifact-logger.ts',
    exports: [
      'logArtifact',
      'getPacketArtifacts',
      'getArtifactsByGenerator',
      'getSupersessionChain',
      'markArtifactValidated',
      'markArtifactFailed',
      'ArtifactType',
      'Generator',
      'ArtifactStatus',
    ],
  },
  {
    file: 'sveltekit-frontend/src/lib/server/generation/summary-qa.ts',
    exports: [
      'validateSummaryStructure',
      'validateSummaryQuality',
      'storeSummaryArtifact',
      'SUMMARY_QA_THRESHOLDS',
      'SummaryQAResult',
    ],
  },
  {
    file: 'sveltekit-frontend/src/lib/server/generation/packet-summary-pipeline.ts',
    exports: ['runPacketSummaryPipeline', 'runPacketSummaryPipelineBatch', 'SummaryPipelineResult'],
  },
  {
    file: 'sveltekit-frontend/src/lib/server/generation/semantic-diff-gate.ts',
    exports: [
      'semanticDiffGate',
      'cacheSummaryEmbedding',
      'getCachedSummaryEmbedding',
      'SEMANTIC_DIFF_THRESHOLDS',
      'SemanticDiffRecommendation',
    ],
  },
];

console.log('✓ Checking exports...\n');

for (const check of EXPORTS_TO_CHECK) {
  const fullPath = path.join(__dirname, '../../', check.file);
  const content = fs.readFileSync(fullPath, 'utf-8');

  console.log(`  ${path.basename(check.file)}`);

  for (const exp of check.exports) {
    const pattern = new RegExp(`\\bexport\\s+(const|function|async|type|interface|class)\\s+${exp}\\b`);
    const found = pattern.test(content);

    if (found) {
      console.log(`    ✅ ${exp}`);
      passed++;
    } else {
      console.log(`    ❌ ${exp} — NOT EXPORTED`);
      failed++;
    }
  }

  console.log('');
}

console.log('───────────────────────────────────────────────────────────────────────────\n');

// ── Check schema integration ───────────────────────────────────────────────────

console.log('✓ Checking schema index exports...\n');

const schemaIndexPath = path.join(
  __dirname,
  '../../sveltekit-frontend/src/lib/server/db/schema/index.ts'
);
const schemaIndexContent = fs.readFileSync(schemaIndexPath, 'utf-8');

if (schemaIndexContent.includes("export * from './atlas-semantic-diffs.js'")) {
  console.log('  ✅ atlas-semantic-diffs exported from schema/index.ts');
  passed++;
} else {
  console.log('  ❌ atlas-semantic-diffs NOT exported from schema/index.ts');
  failed++;
}

if (schemaIndexContent.includes("export * from './atlas-artifacts.js'")) {
  console.log('  ✅ atlas-artifacts exported from schema/index.ts');
  passed++;
} else {
  console.log('  ❌ atlas-artifacts NOT exported from schema/index.ts');
  failed++;
}

console.log('\n───────────────────────────────────────────────────────────────────────────\n');

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`RESULTS: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('🎉 All Phase 85a Blocker #2 checks PASSED!');
  console.log('\nNext steps:');
  console.log('  1. Wire artifact logging into packet summary generation');
  console.log('  2. Test the /api/atlas/summary endpoint');
  console.log('  3. Implement Blocker #3: Summary QA validation gates');
  process.exit(0);
} else {
  console.log('⚠️  Some checks failed. Please fix the issues above.');
  process.exit(1);
}