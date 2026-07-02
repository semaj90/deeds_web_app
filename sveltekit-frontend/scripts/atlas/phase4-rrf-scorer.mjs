#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../docs/reports');
const RRF_K = 60;
const WEIGHT_LEXICAL = 0.45;
const WEIGHT_VECTOR = 0.35;
const WEIGHT_AUTHORITY = 0.20;

function computeRRF(rank) {
  return 1.0 / (RRF_K + rank);
}

async function scoreQuery(query, client, packetMap) {
  let lexicalRanks = new Map();
  try {
    const result = await client.query(`
      SELECT packet_key, ts_rank(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(summary, '')), plainto_tsquery('english', $1)) AS rank
      FROM atlas_packets
      WHERE ts_vector @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC LIMIT 20
    `, [query]);
    result.rows.forEach((row, idx) => lexicalRanks.set(row.packet_key, idx + 1));
  } catch (e) {
    // FTS unavailable
  }

  let vectorRanks = new Map();
  const mockCandidates = Array.from(packetMap.values()).sort((a, b) => b.pagerank - a.pagerank).slice(0, 20);
  mockCandidates.forEach((cand, idx) => vectorRanks.set(cand.packet_id, idx + 1));

  const authorityRanks = new Map();
  const allPackets = Array.from(packetMap.values()).sort((a, b) => b.pagerank - a.pagerank);
  allPackets.forEach((packet, idx) => authorityRanks.set(packet.packet_id, idx + 1));

  const scores = [];
  const allCandidates = new Set();
  lexicalRanks.forEach((_, id) => allCandidates.add(id));
  vectorRanks.forEach((_, id) => allCandidates.add(id));

  for (const candidate of allCandidates) {
    const lexical_rank = lexicalRanks.get(candidate) || 21;
    const vector_rank = vectorRanks.get(candidate) || 21;
    const authority_rank = authorityRanks.get(candidate) || packetMap.size;

    const lexical_rrf = computeRRF(lexical_rank);
    const vector_rrf = computeRRF(vector_rank);
    const authority_rrf = computeRRF(authority_rank);

    const rrf_score = WEIGHT_LEXICAL * lexical_rrf + WEIGHT_VECTOR * vector_rrf + WEIGHT_AUTHORITY * authority_rrf;

    scores.push({
      packet_id: candidate,
      lexical_rank,
      vector_rank,
      authority_rank,
      lexical_rrf,
      vector_rrf,
      authority_rrf,
      rrf_score,
      top_k_rank: 0
    });
  }

  scores.sort((a, b) => b.rrf_score - a.rrf_score);
  scores.forEach((score, idx) => score.top_k_rank = idx + 1);

  console.log(`  Top-3 for "${query}":`);
  scores.slice(0, 3).forEach((score, idx) => {
    const packet = packetMap.get(score.packet_id);
    console.log(`    ${idx + 1}. ${packet?.symbol} - RRF: ${score.rrf_score.toFixed(4)}`);
  });

  return scores;
}

async function main() {
  const startTime = Date.now();
  const mode = process.argv.includes('--apply') ? 'APPLY' : 'DRY-RUN';
  console.log(`\n⚙️  Phase 102 Step 4b: RRF Scorer (${mode})\n`);

  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await client.connect();
    console.log('✅ Connected to Postgres\n');

    console.log('📥 Loading HashMap...');
    let packetMap = new Map();
    try {
      const hashMapData = JSON.parse(await fs.readFile(path.join(REPORTS_DIR, 'packet-hashmap.json'), 'utf-8'));
      packetMap = new Map(hashMapData.packets);
      console.log(`✅ Loaded ${packetMap.size} packets\n`);
    } catch (e) {
      console.log('⚠️  HashMap not found, loading from Postgres...');
      const result = await client.query('SELECT ap.packet_key, ap.source_ref, ap.symbol, ap.kind, COALESCE(fs.pagerank, 0.0) AS pagerank FROM atlas_packets ap LEFT JOIN feature_statistics fs ON ap.packet_key = fs.packet_key LIMIT 60000');
      result.rows.forEach(row => {
        packetMap.set(row.packet_key, {
          packet_id: row.packet_key,
          source_ref: row.source_ref || 'unknown',
          symbol: row.symbol || 'unknown',
          kind: row.kind || 'unknown',
          pagerank: row.pagerank || 0.0
        });
      });
      console.log(`✅ Loaded ${packetMap.size} packets\n`);
    }

    const testQueries = ['authentication session', 'error handling', 'database query', 'async operations', 'type validation'];
    const allScores = {};
    const runId = `rrf-run-${new Date().toISOString().slice(0, 10)}-${Date.now()}`;

    console.log('🔍 Scoring queries:\n');
    for (const query of testQueries) {
      const scores = await scoreQuery(query, client, packetMap);
      allScores[query] = scores.slice(0, 10);
    }

    if (process.argv.includes('--apply')) {
      console.log(`\n💾 Persisting RRF scores to Postgres (${runId})...`);
      let persistedCount = 0;
      for (const [query, scores] of Object.entries(allScores)) {
        for (const score of scores) {
          try {
            await client.query(`
              UPDATE atlas_packets
              SET metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{rrf}',
                $2::jsonb,
                true
              ),
              updated_at = NOW()
              WHERE packet_id = $1
            `, [
              score.packet_id,
              JSON.stringify({
                score: score.rrf_score,
                precision: 'fp32',
                k: RRF_K,
                weights: {
                  lexical: WEIGHT_LEXICAL,
                  vector: WEIGHT_VECTOR,
                  authority: WEIGHT_AUTHORITY
                },
                signals: {
                  lexical_rank: score.lexical_rank,
                  vector_rank: score.vector_rank,
                  authority_rank: score.authority_rank
                },
                query,
                run_id: runId,
                timestamp: new Date().toISOString(),
                phase: '102-step-4'
              })
            ]);
            persistedCount++;
          } catch (e) {
            console.error(`Error persisting ${score.packet_id}:`, e.message);
          }
        }
      }
      console.log(`✅ Persisted ${persistedCount} RRF scores to atlas_packets.metadata`);
    }

    console.log(`\n✅ COMPLETE in ${Date.now() - startTime}ms\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

await main();
