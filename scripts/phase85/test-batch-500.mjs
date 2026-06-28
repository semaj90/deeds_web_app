#!/usr/bin/env node

/**
 * Phase 85a: Batch Test (500 packets)
 * Tests Phase 85a API with 500 packets from atlas_packets
 * WARNING: This takes 5-10 minutes!
 * Logs to: .tmp/phase85a-batch-500.json
 *
 * Measures:
 * - Throughput (packets/minute)
 * - Success rate
 * - Gate distribution (skip/metadata_only/regenerate/etc.)
 * - Cost savings (%)
 * - Average similarity
 */

import { spawn } from 'child_process';
import { writeFileSync } from 'fs';

const API_URL = 'http://localhost:5173/api/atlas/summary';
const LOG_FILE = '.tmp/phase85a-batch-500.json';
const BATCH_SIZE = 500;
const DELAY_MS = 100; // Delay between requests to avoid overwhelming server

async function queryPackets(limit = 500) {
  return new Promise((resolve, reject) => {
    const psql = spawn('docker', [
      'exec', 'legal-ai-postgres', 'psql',
      '-U', 'legal_admin', '-d', 'legal_ai_db',
      '-c', `SELECT packet_key, source_ref, feature_id, SUBSTRING(summary, 1, 200) as summary_preview FROM atlas_packets WHERE summary IS NOT NULL LIMIT ${limit}`
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
            context: parts[3] || 'Test context for Phase 85a batch validation.'
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
  let successCount = 0;

  console.log(`\n🧪 Testing ${packets.length} packets...`);
  console.log(`⏱️  Estimated time: ${Math.round((packets.length * DELAY_MS) / 1000 / 60)} minutes`);
  console.log(`   (${Math.round(60000 / DELAY_MS)} packets/minute)\n`);

  for (let i = 0; i < packets.length; i++) {
    const packet = packets[i];
    const gitCommit = '0'.repeat(40); // Dummy 40-char SHA
    const startPacket = Date.now();

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
      const packetTime = Date.now() - startPacket;

      results.push({
        packet_key: packet.packet_key,
        recommendation: data.recommendation,
        similarity: data.similarity,
        cost_saved_percent: data.cost_saved_percent || 0,
        action_taken: data.action_taken,
        time_ms: packetTime,
        errors: data.errors || []
      });

      if (data.recommendation) {
        gateCount[data.recommendation]++;
        successCount++;
      }

      totalCostSaved += (data.cost_saved_percent || 0);

      // Print progress every 50 packets
      if ((i + 1) % 50 === 0) {
        const elapsed = Date.now() - startTime;
        const rate = (i + 1) / (elapsed / 1000 / 60);
        const eta = Math.round((packets.length - (i + 1)) / rate);
        console.log(`  [${i + 1}/${packets.length}] - Rate: ${rate.toFixed(1)} pkt/min - ETA: ${eta}min`);
      }
    } catch (err) {
      console.error(`  ❌ [${i + 1}/${packets.length}] ${packet.packet_key}: ${err.message}`);
      results.push({
        packet_key: packet.packet_key,
        error: err.message
      });
    }

    // Delay to avoid overwhelming server
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }

  const elapsed = Date.now() - startTime;
  const report = {
    timestamp: new Date().toISOString(),
    total_packets: packets.length,
    completed: successCount,
    success_rate: Math.round((successCount / packets.length) * 10000) / 100,
    elapsed_ms: elapsed,
    elapsed_min: Math.round(elapsed / 1000 / 60),
    throughput_pkt_per_min: Math.round((packets.length / (elapsed / 1000)) * 6) / 10,
    avg_time_per_packet_ms: Math.round(elapsed / packets.length),
    gates: gateCount,
    total_cost_saved_percent: Math.round((totalCostSaved / packets.length) * 10000) / 100,
    avg_similarity: Math.round((results.reduce((sum, r) => sum + (r.similarity || 0), 0) / results.length) * 10000) / 10000,
    results: results.slice(0, 100) // Store first 100 detailed results only
  };

  writeFileSync(LOG_FILE, JSON.stringify(report, null, 2));

  console.log(`\n✅ Test complete!`);
  console.log(`   Total time: ${report.elapsed_min}min ${Math.round(elapsed % 60000 / 1000)}s`);
  console.log(`   Success rate: ${report.success_rate}%`);
  console.log(`   Throughput: ${report.throughput_pkt_per_min} packets/min`);
  console.log(`   Gating breakdown:`);
  console.log(`     - Skip: ${gateCount.skip} (100% cost save)`);
  console.log(`     - Metadata only: ${gateCount.metadata_only} (80% cost save)`);
  console.log(`     - Regenerate: ${gateCount.regenerate} (0% cost save)`);
  console.log(`     - GAN review: ${gateCount.gan_review} (0% cost save)`);
  console.log(`     - Full regen: ${gateCount.full_regeneration} (0% cost save)`);
  console.log(`   Avg cost saved: ${report.total_cost_saved_percent}%`);
  console.log(`   Avg similarity: ${report.avg_similarity}`);
  console.log(`\n📋 Full results: ${LOG_FILE}`);

  return report;
}

async function main() {
  console.log('🧪 Phase 85a Batch Test (500 packets)');
  console.log('=====================================');

  try {
    const packets = await queryPackets(BATCH_SIZE);
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