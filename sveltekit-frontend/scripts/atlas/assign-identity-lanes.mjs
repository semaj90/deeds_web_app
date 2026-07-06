#!/usr/bin/env node
/**
 * Assign Identity Lanes to All Packets
 *
 * Classifies packets into five lanes based on identity completeness:
 * - Lane 1 (Canonical): packet_key + source_ref + feature_id present
 * - Lane 2 (Recoverable by Span): source_ref + byte_start + byte_end present
 * - Lane 3 (Recoverable by Hash): source_ref + sha256 present
 * - Lane 4 (Mirror Orphan): qdrant_point_id or neo4j_node_id or redis_key present
 * - Lane 5 (Quarantine): no identity fields available
 *
 * Enables agentic error fixing to reliably locate and reconstruct packets across stores.
 *
 * Usage:
 *   npm run atlas:assign:identity-lanes:dry
 *   npm run atlas:assign:identity-lanes:apply
 */

import { createHash } from 'node:crypto';
import pg from 'pg';

const DRY_RUN = !process.argv.includes('--apply');
const BATCH_SIZE = 100;
const LIMIT = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
  : 0;

console.log(`\n═══ Assign Identity Lanes ═══\n`);
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Batch size: ${BATCH_SIZE}`);
console.log(`Limit: ${LIMIT > 0 ? LIMIT : 'ALL'}\n`);

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5434'),
  user: process.env.DB_USER || 'legal_admin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'legal_ai_db'
});

function reconstructPacketKey(packet) {
  if (packet.packet_key) {
    return packet.packet_key;
  }

  if (packet.source_ref && packet.byte_start != null && packet.byte_end != null) {
    const fields = [
      packet.source_ref,
      packet.feature_id || '',
      String(packet.byte_start),
      String(packet.byte_end),
      packet.sha256 || '',
      packet.source_kind || ''
    ];
    return `recovered:${createHash('sha256').update(fields.join('|')).digest('hex').slice(0, 16)}`;
  }

  if (packet.source_ref && packet.sha256) {
    const fields = [
      packet.source_ref,
      packet.feature_id || '',
      packet.sha256,
      packet.source_kind || ''
    ];
    return `recovered:${createHash('sha256').update(fields.join('|')).digest('hex').slice(0, 16)}`;
  }

  if (packet.qdrant_point_id || packet.neo4j_node_id || packet.redis_key) {
    const source = packet.qdrant_point_id || packet.neo4j_node_id || packet.redis_key || 'unknown';
    return `mirror:${createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
  }

  return `quarantine:${createHash('sha256').update(JSON.stringify(packet)).digest('hex').slice(0, 16)}`;
}

function assignLane(packet) {
  const recovered_packet_key = reconstructPacketKey(packet);

  // Lane 1: Canonical
  if (packet.packet_key && packet.source_ref && packet.feature_id) {
    return {
      lane: 'canonical',
      confidence: 1.0,
      recovered_packet_key: null,
      recovery_reason: null
    };
  }

  // Lane 2: Recoverable by span
  if (packet.source_ref && packet.byte_start != null && packet.byte_end != null) {
    return {
      lane: 'recoverable_by_span',
      confidence: 0.8,
      recovered_packet_key,
      recovery_reason: 'Reconstructed from source_ref + byte span'
    };
  }

  // Lane 3: Recoverable by hash
  if (packet.source_ref && packet.sha256) {
    return {
      lane: 'recoverable_by_hash',
      confidence: 0.6,
      recovered_packet_key,
      recovery_reason: 'Reconstructed from source_ref + content hash'
    };
  }

  // Lane 4: Mirror orphan
  if (packet.qdrant_point_id || packet.neo4j_node_id || packet.redis_key) {
    return {
      lane: 'mirror_orphan',
      confidence: 0.1,
      recovered_packet_key,
      recovery_reason: 'Orphan in mirror store, canonical identity lost'
    };
  }

  // Lane 5: Quarantine
  return {
    lane: 'quarantine',
    confidence: 0.0,
    recovered_packet_key,
    recovery_reason: 'No identity fields available'
  };
}

async function assignIdentityLanes() {
  try {
    const countRes = await pool.query('SELECT COUNT(*) as count FROM atlas_packets');
    const totalPackets = parseInt(countRes.rows[0].count, 10);
    const targetPackets = LIMIT > 0 ? Math.min(LIMIT, totalPackets) : totalPackets;

    console.log(`Total packets: ${totalPackets}`);
    console.log(`Target: ${targetPackets}\n`);

    let processed = 0;
    let offset = 0;
    const laneStats = { canonical: 0, recoverable_by_span: 0, recoverable_by_hash: 0, mirror_orphan: 0, quarantine: 0 };

    while (processed < targetPackets) {
      const batchQuery = `
        SELECT
          packet_key,
          source_ref,
          feature_id,
          byte_start,
          byte_end,
          sha256,
          source_kind,
          qdrant_point_id,
          neo4j_node_id,
          redis_key
        FROM atlas_packets
        ORDER BY created_at ASC
        LIMIT $1 OFFSET $2
      `;

      const batchRes = await pool.query(batchQuery, [BATCH_SIZE, offset]);
      if (batchRes.rows.length === 0) break;

      const assignments = batchRes.rows.map(row => {
        const assignment = assignLane(row);
        laneStats[assignment.lane]++;
        return { ...row, ...assignment };
      });

      if (DRY_RUN) {
        console.log(`[DRY-RUN] Batch ${Math.floor(offset / BATCH_SIZE) + 1}: ${assignments.length} packets assigned`);
        assignments.slice(0, 3).forEach(a => {
          console.log(`  - ${a.packet_key || a.recovered_packet_key}: ${a.lane} (confidence: ${a.confidence})`);
        });
      } else {
        // Batch update
        for (const assignment of assignments) {
          const updateQuery = `
            UPDATE atlas_packets
            SET
              identity_lane = $1,
              recovered_packet_key = $2,
              identity_confidence = $3,
              identity_recovery_reason = $4,
              updated_at = NOW()
            WHERE packet_key = $5 OR (packet_key IS NULL AND source_ref = $6)
            LIMIT 1
          `;

          await pool.query(updateQuery, [
            assignment.lane,
            assignment.recovered_packet_key,
            assignment.confidence,
            assignment.recovery_reason,
            assignment.packet_key,
            assignment.source_ref
          ]);
        }

        console.log(`✅ Updated batch ${Math.floor(offset / BATCH_SIZE) + 1} (${assignments.length} rows)`);
      }

      processed += batchRes.rows.length;
      offset += BATCH_SIZE;
    }

    console.log(`\n📊 Lane Distribution:`);
    console.log(`  Canonical: ${laneStats.canonical} (${(laneStats.canonical / targetPackets * 100).toFixed(1)}%)`);
    console.log(`  Recoverable by span: ${laneStats.recoverable_by_span} (${(laneStats.recoverable_by_span / targetPackets * 100).toFixed(1)}%)`);
    console.log(`  Recoverable by hash: ${laneStats.recoverable_by_hash} (${(laneStats.recoverable_by_hash / targetPackets * 100).toFixed(1)}%)`);
    console.log(`  Mirror orphan: ${laneStats.mirror_orphan} (${(laneStats.mirror_orphan / targetPackets * 100).toFixed(1)}%)`);
    console.log(`  Quarantine: ${laneStats.quarantine} (${(laneStats.quarantine / targetPackets * 100).toFixed(1)}%)\n`);

    if (DRY_RUN) {
      console.log(`✅ Dry-run complete. Run with --apply to assign lanes.\n`);
    } else {
      // Verify coverage
      const coverageRes = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN identity_lane IS NOT NULL THEN 1 END) as assigned,
          COUNT(CASE WHEN identity_confidence >= 0.8 THEN 1 END) as high_confidence,
          COUNT(CASE WHEN identity_confidence < 0.2 THEN 1 END) as low_confidence
        FROM atlas_packets
      `);

      const coverage = coverageRes.rows[0];
      console.log(`✅ Assignment complete:`);
      console.log(`  Total packets: ${coverage.total}`);
      console.log(`  Assigned: ${coverage.assigned} (${(coverage.assigned / coverage.total * 100).toFixed(1)}%)`);
      console.log(`  High confidence (≥0.8): ${coverage.high_confidence}`);
      console.log(`  Low confidence (<0.2): ${coverage.low_confidence}\n`);
    }

    process.exit(0);
  } catch (err) {
    console.error(`❌ Error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

assignIdentityLanes();
