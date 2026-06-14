#!/usr/bin/env node

import pg from 'pg';
import Redis from 'ioredis';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 3000)),
  maxRetriesPerRequest: 1
});

redis.on('error', () => {});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

async function auditKarpathy() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Karpathy Authority Mirror Audit                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Connect Redis
    console.log('Step 1: Connecting to Redis cache...');
    await redis.ping();
    console.log('✅ Connected to Redis\n');

    // Get Karpathy scores from Redis
    const karpathyScores = await redis.hgetall('gpu:karpathy:scores');
    const scoreCount = Object.keys(karpathyScores).length;
    console.log(`Step 2: Found ${scoreCount} Karpathy authority scores in Redis`);

    // Parse scores
    const parsed = [];
    for (const [file, jsonStr] of Object.entries(karpathyScores)) {
      try {
        const data = JSON.parse(jsonStr);
        parsed.push({
          file,
          pr: data.pr || 0,
          attn: data.attn || 0,
          authority: data.authority || 0,
          blend: data.blend || 0
        });
      } catch {
        console.log(`  ⚠️ Corrupted JSON for ${file}`);
      }
    }

    console.log(`   - Valid: ${parsed.length}, Corrupted: ${scoreCount - parsed.length}\n`);

    // Get Postgres packets
    console.log('Step 3: Fetching Postgres packets...');
    const packets = await pool.query('SELECT packet_key, source_ref, file_path FROM atlas_packets LIMIT 100');
    console.log(`   - Sampled ${packets.rows.length} packets\n`);

    // Check alignment
    console.log('Step 4: Checking Karpathy alignment...');
    let matched = 0;
    for (const pkt of packets.rows) {
      if (karpathyScores[pkt.file_path]) matched++;
    }
    console.log(`   - Matched: ${matched}/${packets.rows.length} (${((matched / packets.rows.length) * 100).toFixed(1)}%)\n`);

    // Score range analysis
    console.log('Step 5: Score distribution...');
    const prScores = parsed.map(p => p.pr);
    const blends = parsed.map(p => p.blend);
    console.log(`   - PageRank: min=${Math.min(...prScores).toFixed(2)}, max=${Math.max(...prScores).toFixed(2)}`);
    console.log(`   - Blend: min=${Math.min(...blends).toFixed(2)}, max=${Math.max(...blends).toFixed(2)}\n`);

    // Write report
    mkdirSync(REPORTS_DIR, { recursive: true });

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_scores: scoreCount,
        valid_scores: parsed.length,
        corrupted_scores: scoreCount - parsed.length,
        postgres_alignment_sample: matched,
        postgres_alignment_pct: ((matched / packets.rows.length) * 100).toFixed(1)
      },
      score_ranges: {
        pagerank: {
          min: Math.min(...prScores).toFixed(2),
          max: Math.max(...prScores).toFixed(2),
          avg: (prScores.reduce((a,b) => a+b, 0) / prScores.length).toFixed(2)
        },
        blend: {
          min: Math.min(...blends).toFixed(2),
          max: Math.max(...blends).toFixed(2),
          avg: (blends.reduce((a,b) => a+b, 0) / blends.length).toFixed(2)
        }
      },
      sample_scores: parsed.slice(0, 10)
    };

    writeFileSync(
      resolve(REPORTS_DIR, 'karpathy-authority-audit.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(`✅ Report: docs/reports/karpathy-authority-audit.json\n`);

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  AUDIT SUMMARY                                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Total scores in cache: ${scoreCount}`);
    console.log(`Postgres alignment: ${matched}/${packets.rows.length} samples matched`);
    console.log(`Status: ${scoreCount > 0 && matched > 0 ? 'OPERATIONAL' : 'CHECK_NEEDED'}\n`);

  } catch (err) {
    console.error('❌ Audit failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
    if (redis.status !== 'close') await redis.quit().catch(() => {});
  }
}

auditKarpathy();
