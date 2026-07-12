#!/usr/bin/env node

/**
 * Lane 1: Lexical Coverage Backfill (22.22% → 80%+)
 *
 * Goal: Populate lexical_features (BM25 terms + scores) in payload JSONB
 * Strategy: Extract terms from summary + title (existing text fields)
 * Pattern-based extraction: ERROR_CODES, CONSTANTS, ENDPOINTS, API terms
 *
 * Usage:
 *   node backfill-lexical-lane.mjs [--dry-run] [--limit=500]
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 500;

const { Pool } = pg;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

/**
 * Extract lexical features from text
 */
function extractLexicalFeatures(text) {
  if (!text) return [];

  const terms = [];
  const termScores = {};

  // 1. Split on whitespace + punctuation
  const words = text
    .toLowerCase()
    .split(/[\s\-_./:()[\]{}<>]+/)
    .filter(w => w.length > 2);

  // 2. Collect word frequencies
  for (const word of words) {
    if (word.length > 2) {
      termScores[word] = (termScores[word] || 0) + 1;
    }
  }

  // 3. Extract patterns
  // ERROR_CODES: E_*, ERR_*, ERROR_*
  const errorCodes = text.match(/\b[A-Z]{2,}(?:_[A-Z0-9]+)*\b/g) || [];
  for (const code of errorCodes) {
    if (code.match(/^[A-Z]{2,}(?:_[A-Z0-9]+)*$/)) {
      termScores[code] = (termScores[code] || 0) + 2; // boost
    }
  }

  // API ENDPOINTS: /api/*, /routes/*
  const endpoints = text.match(/\/[a-z0-9\-_/]+/g) || [];
  for (const endpoint of endpoints) {
    if (endpoint.startsWith('/api') || endpoint.startsWith('/route')) {
      termScores[endpoint] = (termScores[endpoint] || 0) + 1.5;
    }
  }

  // 4. Top 50 by BM25 score (frequency × uniqueness)
  const sorted = Object.entries(termScores)
    .map(([term, freq]) => ({
      term,
      frequency: freq,
      score: freq * Math.log(1 + freq), // simple BM25 approximation
      type: term.match(/^[A-Z]{2,}/) ? 'CONSTANT' : 'TERM',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  return sorted;
}

/**
 * Main backfill
 */
async function backfillLexical() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        Lane 1: Lexical Coverage Backfill                   ║');
  console.log(`║        Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(36 - (dryRun ? 'DRY-RUN' : 'APPLY').length)}║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    console.log('🔗 Connecting to Postgres...');
    await pool.query('SELECT 1');
    console.log('✓ Connected\n');

    // Get packets missing lexical features
    console.log(`📋 Fetching ${limit} packets with missing lexical_features...\n`);
    const packets = await pool.query(
      `SELECT packet_id, packet_key, summary, payload->>'title' as title
       FROM atlas_packets
       WHERE payload->>'lexical_features' IS NULL OR payload->>'lexical_features' = '{}'
       LIMIT $1`,
      [limit]
    );

    if (packets.rows.length === 0) {
      console.log('✅ No packets with missing lexical features. Lane 1 complete.\n');
      process.exit(0);
    }

    console.log(`Processing ${packets.rows.length} packets...\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < packets.rows.length; i++) {
      const packet = packets.rows[i];
      const idx = i + 1;

      try {
        const text = packet.summary || packet.title || '';
        const features = extractLexicalFeatures(text);

        console.log(`  [${idx}/${packets.rows.length}] ${packet.packet_key.substring(0, 40)}`);
        console.log(`      Extracted: ${features.length} terms`);

        if (!dryRun) {
          await pool.query(
            `UPDATE atlas_packets
             SET payload = jsonb_set(payload, '{lexical_features}', $1::jsonb),
                 updated_at = NOW()
             WHERE packet_id = $2`,
            [JSON.stringify(features), packet.packet_id]
          );
          console.log(`      ✓ Written to Postgres`);
        } else {
          console.log(`      [DRY-RUN] Would write ${features.length} features`);
        }

        success++;
      } catch (err) {
        console.log(`  [${idx}/${packets.rows.length}] ${packet.packet_key}`);
        console.log(`      ❌ Error: ${err.message}`);
        failed++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('LANE 1 BACKFILL SUMMARY\n');
    console.log(`  Processed:  ${success}`);
    console.log(`  Failed:     ${failed}`);
    console.log(`  Mode:       ${dryRun ? 'DRY-RUN' : 'APPLIED'}`);
    console.log('='.repeat(60) + '\n');

    await pool.end();
    process.exit(0);

  } catch (err) {
    console.error('❌ FATAL ERROR:', err.message);
    await pool.end();
    process.exit(1);
  }
}

backfillLexical();
