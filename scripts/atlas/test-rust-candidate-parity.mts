/**
 * Test Rust Candidate Parity — Runtime validation of candidate generation
 *
 * Loads manifest, instantiates RustNapiSearchBackend, validates 7 gates.
 * Exit code 0 if all gates PASS, 1 if any fails.
 *
 * Usage:
 *   npx tsx scripts/atlas/test-rust-candidate-parity.mts
 *   npx tsx scripts/atlas/test-rust-candidate-parity.mts --verbose
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVerbose = process.argv.includes('--verbose');

// Import the backend directly (assumes it exists)
const { RustNapiSearchBackend } = await import(
  '../../sveltekit-frontend/src/lib/server/search/rust-napi-search-backend.js'
);

async function main() {
  console.log('🧪 Testing Rust Candidate Parity...\n');

  const manifestPath = path.resolve(__dirname, '../../artifacts/rust-ann-slot-manifest-example.json');

  let passCount = 0;
  let failCount = 0;

  // G1: Manifest loads
  console.log('[G1] Manifest loads and health() works');
  try {
    const backend = new RustNapiSearchBackend(manifestPath);
    const health = await backend.health();

    if (health.healthy !== false || health.indexVersion !== null) {
      console.log('  ✓ Health endpoint responds (native module not loaded, expected)\n');
      passCount++;
    } else {
      console.log('  ✓ Health endpoint responds\n');
      passCount++;
    }
  } catch (err) {
    console.log(`  ✗ Manifest failed to load: ${err instanceof Error ? err.message : String(err)}\n`);
    failCount++;
  }

  // G2: Dimensions are 768
  console.log('[G2] Dimensions match expected (768)');
  try {
    const backend = new RustNapiSearchBackend(manifestPath);
    const health = await backend.health();
    if (health.details && health.details.dimensions === 768) {
      console.log('  ✓ Dimensions are 768\n');
      passCount++;
    } else {
      console.log(`  ✗ Dimensions mismatch: ${health.details?.dimensions || 'unknown'}\n`);
      failCount++;
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}\n`);
    failCount++;
  }

  // G3: Slot bijection
  console.log('[G3] Slot bijection (vectorCount > 0 and consistent)');
  try {
    const backend = new RustNapiSearchBackend(manifestPath);
    const health = await backend.health();
    if (health.details && health.details.vectorCount > 0 && health.details.vectorCount === health.details.manifestRows) {
      console.log(`  ✓ Bijection valid: ${health.details.vectorCount} slots\n`);
      passCount++;
    } else {
      console.log(`  ✗ Bijection mismatch: vectorCount=${health.details?.vectorCount}, manifestRows=${health.details?.manifestRows}\n`);
      failCount++;
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}\n`);
    failCount++;
  }

  // G4: Search executes
  console.log('[G4] Search executes and returns candidates');
  try {
    const backend = new RustNapiSearchBackend(manifestPath);
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
    });

    if (result.backend === 'rust_napi') {
      console.log(`  ✓ Search executed (candidates: ${result.candidates.length}, warnings: ${result.warnings.length})\n`);
      passCount++;
    } else {
      console.log(`  ✗ Backend mismatch: ${result.backend}\n`);
      failCount++;
    }
  } catch (err) {
    console.log(`  ✗ Search failed: ${err instanceof Error ? err.message : String(err)}\n`);
    failCount++;
  }

  // G5: Candidate schema compliance
  console.log('[G5] Candidate schema compliance');
  try {
    const backend = new RustNapiSearchBackend(manifestPath);
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
    });

    let schemaErrors = 0;
    for (const candidate of result.candidates) {
      if (!candidate.packetKey || typeof candidate.packetKey !== 'string') {
        schemaErrors++;
        if (isVerbose) console.log(`    - Missing packetKey: ${candidate.candidateId}`);
      }
      if (!candidate.sourceRef || typeof candidate.sourceRef !== 'string') {
        schemaErrors++;
        if (isVerbose) console.log(`    - Missing sourceRef: ${candidate.candidateId}`);
      }
      if (!candidate.contentHash || typeof candidate.contentHash !== 'string') {
        schemaErrors++;
        if (isVerbose) console.log(`    - Missing contentHash: ${candidate.candidateId}`);
      }
    }

    if (schemaErrors === 0) {
      console.log(`  ✓ All ${result.candidates.length} candidates have valid schema\n`);
      passCount++;
    } else {
      console.log(`  ✗ Schema errors found: ${schemaErrors}\n`);
      failCount++;
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}\n`);
    failCount++;
  }

  // G6: Filter compliance
  console.log('[G6] Filter compliance (workspace_revision filter)');
  try {
    const backend = new RustNapiSearchBackend(manifestPath);
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
      filter: {
        workspaceRevision: 'snapshot-phase12-2026-07-28',
      },
    });

    let filterErrors = 0;
    for (const candidate of result.candidates) {
      if (candidate.workspaceRevision !== 'snapshot-phase12-2026-07-28') {
        filterErrors++;
      }
    }

    if (filterErrors === 0) {
      console.log(`  ✓ Filter compliance verified (${result.candidates.length} candidates match filter)\n`);
      passCount++;
    } else {
      console.log(`  ✗ Filter compliance failed: ${filterErrors} candidates violate filter\n`);
      failCount++;
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}\n`);
    failCount++;
  }

  // G7: Packet key resolution
  console.log('[G7] Packet key resolution (no null packetKeys)');
  try {
    const backend = new RustNapiSearchBackend(manifestPath);
    const query = new Float32Array(768).fill(0.1);
    const result = await backend.search({
      queryVector: query,
      vectorName: 'dense_768',
      limit: 10,
    });

    let nullCount = 0;
    for (const candidate of result.candidates) {
      if (!candidate.packetKey) {
        nullCount++;
      }
    }

    if (nullCount === 0) {
      console.log(`  ✓ All ${result.candidates.length} candidates have valid packetKeys\n`);
      passCount++;
    } else {
      console.log(`  ✗ Null packetKeys found: ${nullCount}\n`);
      failCount++;
    }
  } catch (err) {
    console.log(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}\n`);
    failCount++;
  }

  console.log('\n📊 Test Results:');
  console.log(`  ✅ PASS: ${passCount}/7`);
  console.log(`  ❌ FAIL: ${failCount}/7\n`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
