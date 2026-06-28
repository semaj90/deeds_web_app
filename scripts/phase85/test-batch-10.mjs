#!/usr/bin/env node

/**
 * Phase 85a: Batch Test (10 packets)
 * Tests Phase 85a API with 10 sample packets from atlas_packets
 * Logs to: .tmp/phase85a-batch-10.json
 */

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const API_URL = 'http://localhost:5173/api/atlas/summary';
const LOG_FILE = '.tmp/phase85a-batch-10.json';

async function queryPackets(limit = 10) {
  return new Promise((resolve, reject) => {
    const psql = spawn('docker', [
      'exec', 'legal-ai-postgres', 'psql',
      '-U', 'legal_admin', '-d', 'legal_ai_db',
      '-c', `SELECT packet_key, source_ref, feature_id, SUBSTRING(summary, 1, 500) as summary_preview FROM atlas_packets WHERE summary IS NOT NULL LIMIT ${limit}`
    ]);

    let output = '';
    psql.stdout.on('data', (data) => { output += data.toString(); });
    psql.on('close', (code) => {
      if (code === 0) {
        const lines = output.split('\n').slice(2, -2);
        const packets = lines.map(line => {
          const parts = line.split('|').map(p => p.trim());
          return {
            packet_key: parts[0],
            source_ref: parts[1],
            feature_id: parts[2],
            context: parts[3] || 'Test context for Phase 85a validation.'
          };
        }).filter(p => p.packet_key);
        resolve(packets);
      } else {
        reject(new Error('Failed to query packets'));
      }
    });
  });
}

async function testBatch(packets) {
  const results = [];
  const startTime = Date.now();
  let totalCostSaved = 0;
  const gateCount = { skip: 0, metadata_only: 0, regenerate: 0, gan_review: 0, full_regeneration: 0 };

  console.log(`\n🧪 Testing ${packets.length} packets...`);

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];
    const gitCommit = '0'.repeat(40); // Dummy 40-char SHA

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          feature_id: packet.feature_id,
          context: packet.context,
          git_commit: gitCommit
        })
      });

      const data = await res.json();
      results.push({
        packet_key: packet.packet_key,
        recommendation: data.recommendation,
        similarity: data.similarity,
        cost_saved_percent: data.cost_saved_percent || 0,
        action_taken: data.action_taken,
        errors: data.errors || []
      });

      if (data.recommendation) {
        gateCount[data.recommendation]++;
      }

      totalCostSaved += (data.cost_saved_percent || 0);

      console.log(`  [${i + 1}/${packets.length}] ${packet.packet_key}: ${data.recommendation} (similarity: ${(data.similarity || 0).toFixed(3)}, cost: ${(data.cost_saved_percent || 0).toFixed(0)}%)`);
    } catch (err) {
      console.error(`  ❌ [${i + 1}/${packets.length}] ${packet.packet_key}: ${err.message}`);
      results.push({
        packet_key: packet.packet_key,
        error: err.message
      });
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  const elapsed = Date.now() - startTime;
  const report = {
    timestamp: new Date().toISOString(),
    total_packets: packets.length,
    completed: results.filter(r => !r.error).length,
    elapsed_ms: elapsed,
    avg_time_per_packet_ms: Math.round(elapsed / packets.length),
    gates: gateCount,
    total_cost_saved_percent: Math.round((totalCostSaved / packets.length) * 100) / 100,
    avg_similarity: results.reduce((sum, r) => sum + (r.similarity || 0), 0) / results.length,
    results
  };

  writeFileSync(LOG_FILE, JSON.stringify(report, null, 2));

  console.log(`\n✅ Test complete!`);
  console.log(`   Total time: ${elapsed}ms`);
  console.log(`   Avg time/packet: ${report.avg_time_per_packet_ms}ms`);
  console.log(`   Gating breakdown:`);
  console.log(`     - Skip: ${gateCount.skip}`);
  console.log(`     - Metadata only: ${gateCount.metadata_only}`);
  console.log(`     - Regenerate: ${gateCount.regenerate}`);
  console.log(`     - GAN review: ${gateCount.gan_review}`);
  console.log(`     - Full regen: ${gateCount.full_regeneration}`);
  console.log(`   Avg cost saved: ${report.total_cost_saved_percent}%`);
  console.log(`   Avg similarity: ${report.avg_similarity.toFixed(3)}`);
  console.log(`\n📋 Full results: ${LOG_FILE}`);

  return report;
}

async function main() {
  console.log('🧪 Phase 85a Batch Test (10 packets)');
  console.log('====================================');

  try {
    const packets = await queryPackets(10);
    if (packets.length === 0) {
      console.error('❌ No packets found in atlas_packets');
      process.exit(1);
    }

    console.log(`✅ Retrieved ${packets.length} packets from database`);
    await testBatch(packets);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();