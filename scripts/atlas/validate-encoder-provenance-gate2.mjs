#!/usr/bin/env node

/**
 * Gate 2 Validation: Check encoder provenance & latent vector status
 * Verifies that encoder_provenance table exists, bootstrap record loaded, and validation pipeline is ready
 *
 * Usage:
 *   node scripts/atlas/validate-encoder-provenance-gate2.mjs [--dry-run] [--encoder ae_768_to_64_v0]
 */

import { createConnection } from 'postgres';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const encoderIdArg = args.find(arg => !arg.startsWith('--'));
const targetEncoderId = encoderIdArg || 'ae_768_to_64_v0';

// Database connection
const sql = createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'legal_ai_db',
  username: process.env.DB_USER || 'legal_admin',
  password: process.env.DB_PASSWORD,
});

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║ Gate 2: Autoencoder Provenance Validation                      ║
║ Status: Check encoder_provenance table & latent vectors        ║
║ Target encoder: ${targetEncoderId.padEnd(42, ' ')}║
╚════════════════════════════════════════════════════════════════╝
`);

  try {
    // 1. Check encoder_provenance table exists
    console.log('✓ [CHECK 1/6] encoder_provenance table exists...');
    const tables = await sql`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'encoder_provenance'
      ) as exists`;

    if (!tables[0]?.exists) {
      console.error('✗ encoder_provenance table NOT FOUND');
      process.exit(1);
    }
    console.log('  ✅ Table exists');

    // 2. Check bootstrap record
    console.log(`\n✓ [CHECK 2/6] Bootstrap encoder record (${targetEncoderId})...`);
    const encoder = await sql`
      SELECT
        encoder_id, encoder_type, status, validation_passed,
        input_dimension, output_dimension,
        reconstruction_mse, version,
        validation_gates::text as gates_json
      FROM encoder_provenance
      WHERE encoder_id = ${targetEncoderId}`;

    if (!encoder || encoder.length === 0) {
      console.error(`✗ No encoder record found for ${targetEncoderId}`);
      process.exit(1);
    }

    const enc = encoder[0];
    console.log(`  ✅ Record found:`);
    console.log(`     Type: ${enc.encoder_type}`);
    console.log(`     Status: ${enc.status}`);
    console.log(`     Dims: ${enc.input_dimension}→${enc.output_dimension}`);
    console.log(`     Validation passed: ${enc.validation_passed ? 'YES' : 'NO (needs approval)'}`);
    console.log(`     MSE: ${enc.reconstruction_mse}`);
    console.log(`     Version: ${enc.version}`);

    // 3. Check validation gates
    console.log('\n✓ [CHECK 3/6] Validation gates status...');
    const gates = JSON.parse(enc.gates_json || '{}');
    const gateEntries = Object.entries(gates || {});
    if (gateEntries.length === 0) {
      console.warn('  ⚠️  No validation gates computed yet');
    } else {
      for (const [gateName, gateData] of gateEntries) {
        const passed = (gateData as any).passed ? '✅' : '❌';
        console.log(`     ${passed} ${gateName}: ${(gateData as any).note || '(no note)'}`);
      }
    }

    // 4. Check codebase_chunk_index schema
    console.log('\n✓ [CHECK 4/6] codebase_chunk_index columns...');
    const columns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'codebase_chunk_index'
      AND column_name IN ('encoder_id', 'latent_embedding_valid', 'latent_embedding_validated_at')
      ORDER BY ordinal_position`;

    const requiredCols = new Set(['encoder_id', 'latent_embedding_valid', 'latent_embedding_validated_at']);
    const foundCols = new Set(columns.map((c: any) => c.column_name));
    const missing = [...requiredCols].filter(c => !foundCols.has(c));

    if (missing.length === 0) {
      console.log(`  ✅ All 3 required columns present`);
    } else {
      console.error(`  ✗ Missing columns: ${missing.join(', ')}`);
      process.exit(1);
    }

    // 5. Check latent vector population & validation status
    console.log('\n✓ [CHECK 5/6] Latent vector coverage...');
    const coverage = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN latent_64 IS NOT NULL THEN 1 END) as with_vector,
        COUNT(CASE WHEN encoder_id IS NOT NULL THEN 1 END) as with_encoder,
        COUNT(CASE WHEN latent_embedding_valid = TRUE THEN 1 END) as validated_true,
        COUNT(CASE WHEN latent_embedding_valid = FALSE THEN 1 END) as validated_false,
        COUNT(CASE WHEN latent_embedding_valid IS NULL THEN 1 END) as validated_null
      FROM codebase_chunk_index`;

    const cov = coverage[0];
    const pctVector = ((cov.with_vector / cov.total) * 100).toFixed(1);
    const pctEncoder = ((cov.with_encoder / cov.total) * 100).toFixed(1);
    const pctValidated = ((cov.validated_true / (cov.with_vector || 1)) * 100).toFixed(1);

    console.log(`  Chunks with latent_64: ${cov.with_vector}/${cov.total} (${pctVector}%)`);
    console.log(`  Chunks with encoder_id: ${cov.with_encoder}/${cov.total} (${pctEncoder}%)`);
    console.log(`  Validation status:`);
    console.log(`    ✅ Valid: ${cov.validated_true}`);
    console.log(`    ❌ Invalid: ${cov.validated_false}`);
    console.log(`    ❓ Unchecked: ${cov.validated_null} (${pctValidated}% of with_vector)`);

    // 6. Check indexes
    console.log('\n✓ [CHECK 6/6] Validation indexes...');
    const indexes = await sql`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'encoder_provenance'
      AND indexname LIKE 'idx_%'
      ORDER BY indexname`;

    const expectedIndexes = [
      'idx_encoder_provenance_id',
      'idx_encoder_provenance_status',
      'idx_encoder_provenance_validated',
    ];
    const foundIndexes = new Set(indexes.map((i: any) => i.indexname));
    const missingIndexes = expectedIndexes.filter(idx => !foundIndexes.has(idx));

    if (missingIndexes.length === 0) {
      console.log(`  ✅ All ${expectedIndexes.length} indexes present`);
    } else {
      console.warn(`  ⚠️  Missing indexes: ${missingIndexes.join(', ')} (performance impact)`);
    }

    // Summary
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║ GATE 2 VALIDATION SUMMARY                                      ║
╚════════════════════════════════════════════════════════════════╝

✅ Schema deployed
✅ Bootstrap encoder loaded (${targetEncoderId})
${enc.validation_passed ? '✅ Encoder validation_passed = TRUE' : '⚠️  Encoder validation_passed = FALSE (awaiting operator approval)'}
${cov.validated_null === cov.with_vector ? '⏳ Latent vectors UNCHECKED (no validation runs yet)' : `📊 ${cov.validated_true} vectors validated, ${cov.validated_null} pending`}

NEXT STEPS:
1. Run batch validation: npm run atlas:validate:encoder:apply --encoder ${targetEncoderId}
2. Review gate failures (if any): check validation_gates JSONB
3. Operator approval: UPDATE encoder_provenance SET validation_passed=true WHERE encoder_id='${targetEncoderId}'
4. Proceed to Gate 3: Neo4j PageRank implementation

STATUS: ✅ READY FOR VALIDATION RUNS
`);
  } catch (err) {
    console.error('❌ Error:', (err as Error).message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

await main();
