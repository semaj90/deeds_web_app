#!/usr/bin/env node
/**
 * Supersedes Audit (Packet-Aware)
 *
 * Purpose: Verify that agent tasks don't create duplicate work.
 *
 * Checks:
 *   - Same packet_key?  → SUPERSEDES (don't create duplicate)
 *   - Same feature_id?  → SUPERSEDES (same logical work)
 *   - Same source_ref?  → SUPERSEDES (same source identity)
 *   - Same cache_namespace? → SUPERSEDES (same retrieval namespace)
 *   - Same story_id?    → WARNING (different task, same story)
 *
 * Example:
 *   Agent A: repair-qdrant-postgres-join.mjs (packet: nes:utility:9fa84252)
 *   Agent B: repair-qdrant-postgres-join.mjs.mjs (packet: nes:utility:9fa84252)
 *   Result:  SUPERSEDES FAIL — Patch existing, do not create duplicate
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const DB_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: DB_URL });

async function auditSupersedes() {
  console.log('🔍 SUPERSEDES AUDIT (Packet-Aware)\n');

  try {
    const result = await pool.query(`
      SELECT
        a.id as agent_a_id,
        a.task_id as task_a,
        a.agent as agent_a,
        a.packet_key as packet_a,
        a.feature_id as feature_a,
        a.source_ref as source_a,
        a.cache_namespace as cache_a,
        a.story_id as story_a,
        b.id as agent_b_id,
        b.task_id as task_b,
        b.agent as agent_b,
        b.packet_key as packet_b,
        b.feature_id as feature_b,
        b.source_ref as source_b,
        b.cache_namespace as cache_b,
        b.story_id as story_b
      FROM agent_memory_registry a
      JOIN agent_memory_registry b
        ON (
          (a.packet_key IS NOT NULL AND a.packet_key = b.packet_key) OR
          (a.feature_id IS NOT NULL AND a.feature_id = b.feature_id) OR
          (a.source_ref IS NOT NULL AND a.source_ref = b.source_ref) OR
          (a.cache_namespace IS NOT NULL AND a.cache_namespace = b.cache_namespace)
        )
      WHERE a.id < b.id
        AND a.status NOT IN ('SUPERSEDED', 'FAILED')
        AND b.status NOT IN ('SUPERSEDED', 'FAILED')
      ORDER BY a.task_id, b.task_id
      LIMIT 1000
    `);

    const collisions = result.rows;
    console.log(`📊 Found ${collisions.length} potential supersession conflicts\n`);

    const report = {
      timestamp: new Date().toISOString(),
      total_collisions: collisions.length,
      supersedes_required: [],
      warnings: [],
    };

    for (const collision of collisions) {
      const checks = [];

      if (collision.packet_a === collision.packet_b && collision.packet_a) {
        checks.push('same_packet_key');
      }

      if (collision.feature_a === collision.feature_b && collision.feature_a) {
        checks.push('same_feature_id');
      }

      if (collision.source_a === collision.source_b && collision.source_a) {
        checks.push('same_source_ref');
      }

      if (collision.cache_a === collision.cache_b && collision.cache_a) {
        checks.push('same_cache_namespace');
      }

      const verdict = checks.length > 0 ? 'SUPERSEDES' : 'WARNING';

      const item = {
        task_a: collision.task_a,
        agent_a: collision.agent_a,
        task_b: collision.task_b,
        agent_b: collision.agent_b,
        packet_key: collision.packet_a || collision.packet_b,
        feature_id: collision.feature_a || collision.feature_b,
        source_ref: collision.source_a || collision.source_b,
        checks_matched: checks,
        verdict,
      };

      if (verdict === 'SUPERSEDES') {
        report.supersedes_required.push(item);
        console.log(`⚠️ SUPERSEDES REQUIRED:`);
        console.log(`   Task A: ${collision.task_a} (${collision.agent_a})`);
        console.log(`   Task B: ${collision.task_b} (${collision.agent_b})`);
        console.log(`   Reason: ${checks.join(', ')}`);
        console.log(`   Action: Mark task_b as SUPERSEDED by task_a\n`);
      } else {
        report.warnings.push(item);
        console.log(`⚠️ WARNING (different tasks, same story):`);
        console.log(`   Task A: ${collision.task_a} (${collision.agent_a})`);
        console.log(`   Task B: ${collision.task_b} (${collision.agent_b})`);
        console.log(`   Story: ${collision.story_a}\n`);
      }
    }

    // Save report
    const reportDir = path.dirname(path.resolve('./docs/reports'));
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(
      './docs/reports/supersedes-audit.json',
      JSON.stringify(report, null, 2)
    );

    console.log(`\n📋 Summary:`);
    console.log(`   Total collisions: ${collisions.length}`);
    console.log(`   Supersedes required: ${report.supersedes_required.length}`);
    console.log(`   Warnings: ${report.warnings.length}`);
    console.log(`\n📝 Report: docs/reports/supersedes-audit.json`);

    process.exit(report.supersedes_required.length === 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

auditSupersedes();
