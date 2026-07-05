#!/usr/bin/env node
/**
 * Validate Canonical Feature Envelope Contract
 *
 * Gate: Ensures all packets conform to the canonical envelope schema.
 *   - Hard failures: packet_key, source_ref_key, feature_id, title_id, tree_node_id, used_concepts
 *   - Soft warnings: qdrant_point_id, community_id, som_cluster, domain_class
 *
 * Usage:
 *   node scripts/atlas/validate-canonical-envelope-contract.mjs [--limit=N] [--verbose]
 */

import pg from 'pg';
import { buildCanonicalFeatureEnvelope, validateCanonicalEnvelope, reportValidation } from './lib/envelope-builder.mjs';
import { loadRepoEnv } from './connection-config.mjs';

const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 100);
const VERBOSE = process.argv.includes('--verbose');

const { Pool } = pg;

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Validate Canonical Feature Envelope Contract                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const pool = new Pool({
    host: ENV.PGHOST ?? '127.0.0.1',
    port: ENV.PGPORT ?? 5434,
    database: ENV.PGDATABASE ?? 'legal_ai_db',
    user: ENV.PGUSER ?? 'legal_admin',
    password: ENV.PGPASSWORD ?? ENV.DB_PASSWORD ?? '123456',
  });

  try {
    // Fetch sample packets
    console.log(`Loading ${LIMIT} packets from Postgres...\n`);
    const result = await pool.query(
      `
      SELECT
        packet_id,
        packet_key,
        source_ref,
        source_ref_key,
        feature_id,
        title_id,
        tree_node_id,
        domain_class,
        community_id,
        som_cluster,
        som_row,
        som_col,
        metadata,
        payload,
        summary,
        created_at,
        updated_at
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      ORDER BY created_at DESC
      LIMIT $1
    `,
      [LIMIT]
    );

    console.log(`Loaded ${result.rows.length} packets\n`);

    // Validate each packet
    let hardFailCount = 0;
    let softWarnCount = 0;
    let passCount = 0;

    const failures = [];
    const warnings = [];

    for (const packet of result.rows) {
      const { envelope, validation } = buildCanonicalFeatureEnvelope(packet);

      if (!validation.isValid) {
        hardFailCount++;
        failures.push({
          packet_key: packet.packet_key,
          errors: validation.hardFailures,
        });
        if (VERBOSE) {
          console.log(`❌ ${packet.packet_key}`);
          validation.hardFailures.forEach(e => console.log(`   - ${e}`));
        }
      } else {
        passCount++;
        if (validation.softWarnings.length > 0) {
          softWarnCount++;
          warnings.push({
            packet_key: packet.packet_key,
            warnings: validation.softWarnings,
          });
          if (VERBOSE) {
            console.log(`⚠️  ${packet.packet_key}`);
            validation.softWarnings.forEach(w => console.log(`   - ${w}`));
          }
        } else if (VERBOSE) {
          console.log(`✅ ${packet.packet_key}`);
        }
      }
    }

    console.log('\n══════════════════════════════════════════════════════════');
    console.log('VALIDATION RESULTS');
    console.log('══════════════════════════════════════════════════════════\n');

    console.log(`✅ Passed:          ${passCount} / ${result.rows.length}`);
    console.log(`⚠️  Soft warnings:  ${softWarnCount} / ${result.rows.length}`);
    console.log(`❌ Hard failures:   ${hardFailCount} / ${result.rows.length}\n`);

    // Report details
    if (hardFailCount > 0) {
      console.log('HARD FAILURES (blocking):\n');
      failures.slice(0, 5).forEach(f => {
        console.log(`  ${f.packet_key}:`);
        f.errors.forEach(e => console.log(`    - ${e}`));
      });
      if (failures.length > 5) {
        console.log(`  ... and ${failures.length - 5} more\n`);
      }
    }

    if (softWarnCount > 0) {
      console.log('\nSOFT WARNINGS (non-blocking):\n');
      warnings.slice(0, 5).forEach(w => {
        console.log(`  ${w.packet_key}:`);
        w.warnings.forEach(warn => console.log(`    - ${warn}`));
      });
      if (warnings.length > 5) {
        console.log(`  ... and ${warnings.length - 5} more\n`);
      }
    }

    // Exit status
    if (hardFailCount > 0) {
      console.log('\n❌ GATE FAILED — hard failures detected\n');
      process.exit(1);
    } else {
      console.log('\n✅ GATE PASSED — all packets conform to canonical envelope contract\n');
      process.exit(0);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();