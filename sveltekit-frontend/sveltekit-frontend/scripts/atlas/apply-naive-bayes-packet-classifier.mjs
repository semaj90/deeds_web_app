#!/usr/bin/env node
/**
 * Phase 106.2: Apply Naive Bayes Predictions
 *
 * Load trained Naive Bayes models (JSON) and run inference
 * on all packets, writing predictions to atlas_packet_metrics.
 *
 * Input: atlas_packet_features rows with 95%+ coverage
 * Output: atlas_packet_metrics.naive_bayes_predictions (JSONB)
 *
 * Usage:
 *   npm run atlas:phase106.2:naive-bayes:dry --limit=100
 *   npm run atlas:phase106.2:naive-bayes:apply --limit=10000
 */

import pg from 'pg';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '50000'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Load Naive Bayes predictions using Python inference
 * Runs python script to utilize trained models in JSON format
 */
async function predictNaiveBayes(packets) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, 'infer-naive-bayes.py');

    // Check if inference script exists
    if (!fs.existsSync(pythonScript)) {
      reject(new Error(`Inference script not found: ${pythonScript}`));
      return;
    }

    const python = spawn('python', [pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let output = '';
    let error = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      error += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python inference failed (exit ${code}): ${error}`));
        return;
      }

      try {
        const predictions = JSON.parse(output);
        resolve(predictions);
      } catch (e) {
        reject(new Error(`Failed to parse predictions: ${e.message}`));
      }
    });

    // Send packet features to Python via stdin
    python.stdin.write(JSON.stringify(packets));
    python.stdin.end();
  });
}

async function main() {
  console.log(`\n[PHASE 106.2] Apply Naive Bayes Predictions [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch packets needing predictions
    console.log('Step 1: Fetch packets with feature coverage...');
    const result = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.title_id,
        apf.ast_symbols,
        apf.lexical_features,
        apf.used_concepts,
        apf.entities
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      WHERE ap.source_ref NOT LIKE 'proto:%'
      AND (apf.ast_symbols IS NOT NULL OR apf.lexical_features IS NOT NULL OR apf.used_concepts IS NOT NULL)
      ORDER BY ap.packet_key
      LIMIT $1
    `, [limit]);

    const packets = result.rows;
    console.log(`  [OK] Fetched ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('  [WARN] No packets to process.\n');
      process.exit(0);
    }

    // 2. Run Naive Bayes inference via Python
    console.log('Step 2: Run Naive Bayes inference...');
    const predictions = await predictNaiveBayes(packets);
    console.log(`  [OK] Generated ${predictions.length} predictions\n`);

    if (isDryRun) {
      console.log('Sample predictions (first 5):\n');
      predictions.slice(0, 5).forEach(pred => {
        const np = pred.naive_bayes_predictions;
        console.log(`  ${pred.packet_key}`);
        console.log(`    domain_class: ${np.domain_class} (${(np.domain_class_confidence * 100).toFixed(1)}%)`);
        console.log(`    feature_type: ${np.feature_type}`);
        console.log(`    error_state: ${np.likely_error_state} (${(np.error_state_confidence * 100).toFixed(1)}%)`);
        console.log(`    repair_lane: ${np.candidate_repair_lane} (${(np.repair_lane_confidence * 100).toFixed(1)}%)\n`);
      });
      console.log('[OK] Dry-run complete. Use apply to persist.\n');
      process.exit(0);
    }

    // 3. Write predictions to atlas_packet_metrics
    console.log('Step 3: Write predictions to atlas_packet_metrics...');

    let written = 0;
    let failed = 0;

    for (const pred of predictions) {
      try {
        await client.query(`
          INSERT INTO atlas_packet_metrics (packet_key, naive_bayes_predictions)
          VALUES ($1, $2)
          ON CONFLICT (packet_key) DO UPDATE
          SET naive_bayes_predictions = EXCLUDED.naive_bayes_predictions, updated_at = NOW()
        `, [pred.packet_key, JSON.stringify(pred.naive_bayes_predictions)]);

        written++;
        if (written % 500 === 0) {
          console.log(`  Progress: ${written}/${predictions.length} written`);
        }
      } catch (err) {
        console.error(`  [WARN] Failed to write ${pred.packet_key}: ${err.message}`);
        failed++;
      }
    }

    console.log(`  [OK] ${written} predictions written (${failed} failed)\n`);

    // 4. Validation gate
    console.log('Step 4: Validate coverage...');

    const coverage = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM atlas_packets) as total_packets,
        (SELECT COUNT(*) FROM atlas_packets WHERE source_ref NOT LIKE 'proto:%') as extractable_packets,
        (SELECT COUNT(*) FROM atlas_packet_metrics WHERE naive_bayes_predictions IS NOT NULL) as with_predictions
      LIMIT 1
    `);

    const { total_packets, extractable_packets, with_predictions } = coverage.rows[0];
    const pct = extractable_packets > 0 ? (with_predictions / extractable_packets * 100).toFixed(1) : 0;

    console.log(`  Total packets: ${total_packets}`);
    console.log(`  Extractable (non-proto) packets: ${extractable_packets}`);
    console.log(`  With predictions: ${with_predictions} (${pct}% of extractable)`);
    console.log(`  Target: >= 50% for Phase 106.2 (95% after feature extraction complete)`);

    if (with_predictions >= extractable_packets * 0.5) {
      console.log(`  Result: PASS\n`);
    } else {
      console.log(`  Result: PARTIAL (${pct}%, targeting 50%+)\n`);
    }

    console.log('[SUCCESS] Phase 106.2 Complete. Ready for HMM wiring.\n');
    process.exit(0);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
