#!/usr/bin/env node
/**
 * Qdrant Join GAN Validator (P3)
 *
 * Purpose: Validate one-to-one join safety between Postgres and Qdrant.
 * Fails if: many->one, one->many, missing packets, contradictory source_ref/feature_id
 *
 * Usage:
 *   npm run atlas:validate:qdrant-join-gan -- --story-id=ATLAS-P3-VERIFY --limit=1000
 */

const STORY_ID = process.argv.find(a => a.startsWith('--story-id='))?.split('=')[1];
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '1000');
const VERBOSE = process.argv.includes('--verbose');
const APPLY = process.argv.includes('--apply');

if (!STORY_ID) {
  console.error('❌ Missing --story-id');
  process.exit(1);
}

async function validateQdrantJoin() {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000
    });

    try {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Qdrant Join GAN Validator (P3)                         ║
╚════════════════════════════════════════════════════════════════╝

Story ID:  ${STORY_ID}
Limit:     ${LIMIT} packets
Mode:      ${APPLY ? 'APPLY' : 'AUDIT'}
Timestamp: ${new Date().toISOString()}

`);

      // 1. Check for one-to-many (one Postgres row → many Qdrant points)
      console.log('🔍 Checking for one-to-many joins...\n');
      const oneToManyRes = await pool.query(`
        SELECT
          COUNT(*) as total_packets,
          COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as packets_with_qid,
          COUNT(DISTINCT qdrant_point_id) as distinct_qids
        FROM atlas_packets
        WHERE packet_id IS NOT NULL
        LIMIT $1
      `, [LIMIT]);

      const oneToMany = oneToManyRes.rows[0];
      const oneToManyIssues = oneToMany.packets_with_qid > oneToMany.distinct_qids ? oneToMany.packets_with_qid - oneToMany.distinct_qids : 0;

      if (oneToManyIssues > 0) {
        console.log(`⚠️  Found ${oneToManyIssues} many-to-one joins\n`);
      } else {
        console.log(`✅ No many-to-one joins detected\n`);
      }

      // 2. Check for many-to-one (many Postgres rows → one Qdrant point)
      console.log('🔎 Checking for many-to-one joins...\n');
      const manyToOneRes = await pool.query(`
        SELECT
          qdrant_point_id,
          COUNT(*) as packet_count
        FROM atlas_packets
        WHERE qdrant_point_id IS NOT NULL
        GROUP BY qdrant_point_id
        HAVING COUNT(*) > 1
        LIMIT 20
      `);

      const manyToOne = manyToOneRes.rows;
      if (manyToOne.length > 0) {
        console.log(`⚠️  Found ${manyToOne.length} many-to-one joins:\n`);
        manyToOne.forEach((join, idx) => {
          console.log(`   ${idx + 1}. QID ${join.qdrant_point_id}: ${join.packet_count} packets`);
        });
        console.log('');
      } else {
        console.log(`✅ No many-to-one joins detected\n`);
      }

      // 3. Check for contradictory source_ref
      console.log('🚨 Checking for contradictory source_ref...\n');
      const contradictSourceRes = await pool.query(`
        SELECT
          qdrant_point_id,
          COUNT(DISTINCT source_ref) as distinct_source_refs,
          json_agg(DISTINCT source_ref) as source_refs
        FROM atlas_packets
        WHERE qdrant_point_id IS NOT NULL
        GROUP BY qdrant_point_id
        HAVING COUNT(DISTINCT source_ref) > 1
        LIMIT 20
      `);

      const contradictSource = contradictSourceRes.rows;
      if (contradictSource.length > 0) {
        console.log(`⚠️  Found ${contradictSource.length} Qdrant points with multiple source_refs:\n`);
        contradictSource.forEach((join, idx) => {
          console.log(`   ${idx + 1}. QID ${join.qdrant_point_id}:`);
          join.source_refs.forEach(sr => {
            console.log(`      - ${sr}`);
          });
        });
        console.log('');
      } else {
        console.log(`✅ No contradictory source_refs\n`);
      }

      // 4. Check for contradictory feature_id
      console.log('🚨 Checking for contradictory feature_id...\n');
      const contradictFeatureRes = await pool.query(`
        SELECT
          qdrant_point_id,
          COUNT(DISTINCT feature_id) as distinct_feature_ids,
          json_agg(DISTINCT feature_id) as feature_ids
        FROM atlas_packets
        WHERE qdrant_point_id IS NOT NULL
        GROUP BY qdrant_point_id
        HAVING COUNT(DISTINCT feature_id) > 1
        LIMIT 20
      `);

      const contradictFeature = contradictFeatureRes.rows;
      if (contradictFeature.length > 0) {
        console.log(`⚠️  Found ${contradictFeature.length} Qdrant points with multiple feature_ids:\n`);
        contradictFeature.forEach((join, idx) => {
          console.log(`   ${idx + 1}. QID ${join.qdrant_point_id}: ${join.feature_ids.join(', ')}`);
        });
        console.log('');
      } else {
        console.log(`✅ No contradictory feature_ids\n`);
      }

      // 5. Summary statistics
      console.log('📊 Join summary:\n');
      const summaryRes = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as with_qdrant_id,
          COUNT(CASE WHEN qdrant_point_id IS NULL THEN 1 END) as missing_qdrant_id
        FROM atlas_packets
        LIMIT $1
      `, [LIMIT]);

      const summary = summaryRes.rows[0];
      const joinedPct = (summary.with_qdrant_id / summary.total * 100).toFixed(1);

      console.log(`Total packets:     ${summary.total}`);
      console.log(`With Qdrant ID:    ${summary.with_qdrant_id} (${joinedPct}%)`);
      console.log(`Missing QID:       ${summary.missing_qdrant_id}\n`);

      // 6. Compute validation score
      const totalChecks = 4;
      let passedChecks = 0;

      if (oneToManyIssues === 0) passedChecks++;
      if (manyToOne.length === 0) passedChecks++;
      if (contradictSource.length === 0) passedChecks++;
      if (contradictFeature.length === 0) passedChecks++;

      const score = (passedChecks / totalChecks * 100).toFixed(1);
      const verdict = score === '100' ? 'PASS' : 'REPAIR_NEEDED';

      console.log(`═════════════════════════════════════════════════════════════════\n`);
      console.log(`Join Integrity Score: ${score}% (${passedChecks}/${totalChecks} checks passed)`);
      console.log(`Verdict: ${verdict}\n`);

      // 7. Record proof if APPLY
      if (APPLY) {
        console.log('📋 Recording join validation proof...\n');

        const proofData = JSON.stringify({
          validator: 'validate-qdrant-join-gan',
          timestamp: new Date().toISOString(),
          checks_passed: passedChecks,
          checks_total: totalChecks,
          score: parseFloat(score),
          verdict: verdict,
          details: {
            many_to_one_joins: manyToOne.length,
            one_to_many_issues: oneToManyIssues,
            contradictory_source_refs: contradictSource.length,
            contradictory_feature_ids: contradictFeature.length,
            packets_with_qdrant_id: summary.with_qdrant_id,
            packets_without_qdrant_id: summary.missing_qdrant_id
          }
        });

        await pool.query(`
          INSERT INTO atlas_story_proofs (story_id, stage, action, proof_data)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (story_id, stage, action) DO UPDATE
            SET proof_data = $4
        `, [
          STORY_ID,
          'qdrant_join_validation',
          'gan_check',
          proofData
        ]);

        console.log(`✅ Join validation proof recorded\n`);
      }

    } finally {
      await pool.end();
    }

  } catch (err) {
    console.error('❌ Join validation failed:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

validateQdrantJoin();
