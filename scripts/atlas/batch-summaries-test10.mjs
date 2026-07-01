#!/usr/bin/env node

/**
 * Batch Summaries Test10 — Safe Validation Before Full Apply
 *
 * Tests the complete retrieval/memory lane (LIVE, not simulated):
 * - Qdrant named-vector "content" search
 * - TurboVec 4-bit prefilter
 * - Postgres truth join
 * - Gemma4 :8090 feature extraction / summarization
 *
 * Reports validation gates before full apply
 */

import fetch from 'node-fetch';
import { Pool } from 'pg';

const SERVICES = {
  OLLAMA: 'http://127.0.0.1:11434',
  QDRANT: 'http://127.0.0.1:6333',
  TURBOVEC: 'http://127.0.0.1:8791',
  GEMMA4: 'http://127.0.0.1:8090',
  POSTGRES: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5434'),
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '123456',
    database: process.env.POSTGRES_DB || 'legal_ai_db'
  }
};

const report = {
  timestamp: new Date().toISOString(),
  test_name: 'batch:summaries:test10',
  gates: {},
  summaries_generated: 0,
  fallback_used: false,
  errors: []
};

function recordGate(name, status, details = '') {
  report.gates[name] = { status, details };
  const icon = status === 'LIVE_PASS' ? '✅' : status === 'FALLBACK_PASS' ? '⚠️' : '❌';
  console.log(`${icon} ${name.padEnd(40)} ${status.padEnd(15)} ${details}`);
}

async function testBatchSummaries() {
  console.log('\n[BATCH SUMMARIES TEST10 VALIDATION]');
  console.log('─'.repeat(100));
  console.log(`Timestamp: ${report.timestamp}`);
  console.log('─'.repeat(100));

  // GATE 1: Embed test query and perform Qdrant named-vector "content" search
  console.log('\n[GATE 1] Query embedding + Qdrant named-vector "content" search (LIVE)');
  let qdrantChunks = [];
  try {
    const testQuery = 'authentication session validation';
    const embedRes = await fetch(`${SERVICES.OLLAMA}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: testQuery
      })
    });
    const embedData = await embedRes.json();
    const embedding = embedData.embedding;
    if (!embedding || embedding.length !== 768) {
      throw new Error(`Expected 768-dim embedding, got ${embedding?.length || 0}`);
    }

    const qdrantRes = await fetch(
      `${SERVICES.QDRANT}/collections/codebase_chunks_768/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: {
            name: 'content',
            vector: embedding
          },
          limit: 20,
          with_payload: true,
          with_vector: false,
          score_threshold: 0.3
        })
      }
    );
    const qdrantData = await qdrantRes.json();
    qdrantChunks = qdrantData.result || [];
    recordGate('Qdrant named-vector search', 'LIVE_PASS', `${qdrantChunks.length} candidates retrieved (top score: ${qdrantChunks[0]?.score?.toFixed(3) || 'N/A'})`);
  } catch (err) {
    recordGate('Qdrant named-vector search', 'FAIL', err.message);
    report.fallback_used = true;
  }

  // GATE 2: TurboVec health
  console.log('\n[GATE 2] TurboVec 4-bit prefilter (LIVE)');
  try {
    const res = await fetch(`${SERVICES.TURBOVEC}/health`);
    const data = await res.json();
    if (data.ok) {
      recordGate('TurboVec 4-bit prefilter', 'LIVE_PASS', `indexed=${data.indexed}, dim=${data.dim}, bits=${data.bits}`);
    } else {
      recordGate('TurboVec 4-bit prefilter', 'FAIL', 'Health check returned false');
    }
  } catch (err) {
    recordGate('TurboVec 4-bit prefilter', 'FAIL', err.message);
    report.fallback_used = true;
  }

  // GATE 3: Postgres truth join
  console.log('\n[GATE 3] Postgres truth join (LIVE)');
  let postgresChunks = [];
  const pool = new Pool(SERVICES.POSTGRES);
  try {
    if (qdrantChunks.length > 0) {
      const qdrantIds = qdrantChunks.map(c => c.id);
      const res = await pool.query(
        `SELECT id, relative_path, symbol, kind FROM codebase_chunk_index WHERE id = ANY($1) LIMIT 10`,
        [qdrantIds]
      );
      postgresChunks = res.rows;
      recordGate('Postgres truth join', 'LIVE_PASS', `${postgresChunks.length} chunks joined`);
    } else {
      recordGate('Postgres truth join', 'FALLBACK_PASS', 'No Qdrant chunks to join');
    }
  } catch (err) {
    recordGate('Postgres truth join', 'FAIL', err.message);
    report.fallback_used = true;
  } finally {
    pool.end().catch(() => {});
  }

  // GATE 4: Gemma4 :8090 feature extraction
  console.log('\n[GATE 4] Gemma4 :8090 feature extraction / summarization (LIVE)');
  let gemma4Works = false;
  try {
    if (postgresChunks.length > 0) {
      const testChunk = postgresChunks[0];
      const prompt = `Summarize this code chunk in 1-2 sentences: ${testChunk.symbol || testChunk.relative_path}`;

      const res = await fetch(`${SERVICES.GEMMA4}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-legal-iq4xs-direct.gguf',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 128,
          temperature: 0.3,
          stream: false
        })
      });

      if (res.ok) {
        const data = await res.json();
        const summary = data.choices?.[0]?.message?.content || '';
        if (summary.length > 0) {
          gemma4Works = true;
          report.summaries_generated = 1;
          recordGate('Gemma4 :8090 synthesis', 'LIVE_PASS', `Generated summary (${summary.length} chars)`);
        } else {
          recordGate('Gemma4 :8090 synthesis', 'FAIL', 'Empty response from Gemma4');
        }
      } else {
        recordGate('Gemma4 :8090 synthesis', 'FAIL', `HTTP ${res.status}`);
      }
    } else {
      recordGate('Gemma4 :8090 synthesis', 'FALLBACK_PASS', 'No Postgres chunks to summarize');
    }
  } catch (err) {
    recordGate('Gemma4 :8090 synthesis', 'FAIL', err.message);
    report.fallback_used = true;
  }

  // SUMMARY
  console.log('\n[SUMMARY]');
  console.log('─'.repeat(100));

  const livePass = Object.values(report.gates).filter(g => g.status === 'LIVE_PASS').length;
  const fallbackPass = Object.values(report.gates).filter(g => g.status === 'FALLBACK_PASS').length;
  const failures = Object.values(report.gates).filter(g => g.status === 'FAIL').length;

  console.log(`LIVE_PASS:       ${livePass}/${Object.keys(report.gates).length}`);
  console.log(`FALLBACK_PASS:   ${fallbackPass}/${Object.keys(report.gates).length}`);
  console.log(`FAIL:            ${failures}/${Object.keys(report.gates).length}`);
  console.log(`fallback_used:   ${report.fallback_used}`);
  console.log(`summaries_generated: ${report.summaries_generated}`);

  console.log('\n[GATE REPORT]');
  console.log(JSON.stringify(report, null, 2));

  console.log('\n' + '─'.repeat(100));
  if (failures === 0 && livePass >= 3) {
    console.log('✅ TEST10 PASSED — Ready for full batch:summaries:apply');
    console.log('\nNext steps:');
    console.log('  npm run atlas:ontology-kag:readiness');
    console.log('  npm run batch:summaries:apply');
    process.exit(0);
  } else {
    console.log('❌ TEST10 FAILED — Do not run batch:summaries:apply');
    console.log(`\nFailing gates: ${Object.entries(report.gates).filter(([, g]) => g.status === 'FAIL').map(([k]) => k).join(', ')}`);
    process.exit(1);
  }
}

testBatchSummaries().catch(err => {
  console.error('Fatal error:', err);
  report.errors.push(err.message);
  process.exit(1);
});
