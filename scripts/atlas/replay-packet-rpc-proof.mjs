#!/usr/bin/env node
/**
 * Real Packet-RPC Replay Proof (replaces simulated replay-proof-test.mjs)
 *
 * Purpose: P1c/P4 lane — validate real HyperRAG retrieval with packet-RPC backing.
 * Uses actual /api/hyperrag/packet-rpc calls instead of simulated data.
 *
 * Usage:
 *   npm run atlas:replay:packet-rpc -- --story-id=ATLAS-P1-REPLAY --limit=10
 *   npm run atlas:replay:packet-rpc -- --story-id=ATLAS-P4-VERIFY --limit=50 --apply
 */

const STORY_ID = process.argv.find(a => a.startsWith('--story-id='))?.split('=')[1];
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '10');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const BASE_URL = process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'http://127.0.0.1:5173';

if (!STORY_ID) {
  console.error('❌ Missing --story-id');
  process.exit(1);
}

// Golden queries for replay proof
const GOLDEN_QUERIES = [
  'how is session validation implemented?',
  'where is the login route handler?',
  'what is the user authentication flow?',
  'how does the session middleware work?',
  'where are user roles defined?',
  'how is password reset handled?',
  'where are user permissions checked?',
  'how is CORS configured?',
  'where is the database connection initialized?',
  'how are migrations managed?',
  'what caching strategy is used?',
  'how is error handling implemented?',
  'where are API routes defined?',
  'how is input validation performed?',
  'where is the response serialization logic?',
  'how is the router configured?',
  'where are the middleware functions?',
  'how is file upload handled?',
  'where is the evidence storage defined?',
  'how is the vector search implemented?',
];

async function replayPacketRpc() {
  const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000
    });

    try {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Real Packet-RPC Replay Proof (P1c/P4)                  ║
╚════════════════════════════════════════════════════════════════╝

Story ID:    ${STORY_ID}
Queries:     ${Math.min(LIMIT, GOLDEN_QUERIES.length)}/${GOLDEN_QUERIES.length}
Base URL:    ${BASE_URL}
Mode:        ${APPLY ? 'APPLY' : 'AUDIT'}
Timestamp:   ${new Date().toISOString()}

`);

      // 1. Prepare queries
      const queriesToRun = GOLDEN_QUERIES.slice(0, LIMIT);
      console.log(`📥 Running ${queriesToRun.length} golden queries via packet-RPC...\n`);

      const results = [];
      let successCount = 0;

      for (let i = 0; i < queriesToRun.length; i++) {
        const query = queriesToRun[i];
        try {
          // Call /api/hyperrag/packet-rpc with the query
          const response = await fetch(`${BASE_URL}/api/hyperrag/packet-rpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              story_id: STORY_ID,
              limit: 5
            }),
            timeout: 30000
          });

          if (!response.ok) {
            console.log(`[${i + 1}/${queriesToRun.length}] ❌ "${query}" (HTTP ${response.status})`);
            results.push({
              query,
              success: false,
              status: response.status,
              error: `HTTP ${response.status}`
            });
            continue;
          }

          const data = await response.json();

          // Validate response structure
          const hasTraceId = !!data.trace_id;
          const hasPackets = Array.isArray(data.packets) && data.packets.length > 0;
          const hasContributors = !!data.contributors;
          const hasRetrievalStrategy = !!data.retrieval_strategy;
          const hasCacheSource = !!data.cache_source;
          const hasProvenance = !!data.provenance;

          const allFieldsPresent = hasTraceId && hasPackets && hasContributors &&
                                   hasRetrievalStrategy && hasCacheSource && hasProvenance;

          if (allFieldsPresent) {
            successCount++;
            console.log(`[${i + 1}/${queriesToRun.length}] ✅ "${query}"`);
            if (VERBOSE) {
              console.log(`   trace_id: ${data.trace_id}`);
              console.log(`   packets: ${data.packets.length}`);
              console.log(`   cache_source: ${data.cache_source}`);
            }
          } else {
            console.log(`[${i + 1}/${queriesToRun.length}] ⚠️  "${query}" (missing fields)`);
            if (VERBOSE) {
              console.log(`   trace_id: ${hasTraceId ? '✓' : '✗'}`);
              console.log(`   packets: ${hasPackets ? `✓ (${data.packets.length})` : '✗'}`);
              console.log(`   contributors: ${hasContributors ? '✓' : '✗'}`);
              console.log(`   retrieval_strategy: ${hasRetrievalStrategy ? '✓' : '✗'}`);
              console.log(`   cache_source: ${hasCacheSource ? '✓' : '✗'}`);
              console.log(`   provenance: ${hasProvenance ? '✓' : '✗'}`);
            }
          }

          results.push({
            query,
            success: allFieldsPresent,
            trace_id: data.trace_id || null,
            packet_count: data.packets?.length || 0,
            contributors: data.contributors || [],
            retrieval_strategy: data.retrieval_strategy || null,
            cache_source: data.cache_source || null,
            provenance: data.provenance || null
          });

        } catch (err) {
          console.log(`[${i + 1}/${queriesToRun.length}] ❌ "${query}" (${err.message})`);
          results.push({
            query,
            success: false,
            error: err.message
          });
        }
      }

      console.log(`\n═════════════════════════════════════════════════════════════════\n`);

      // 2. Summary
      const successPct = (successCount / queriesToRun.length * 100).toFixed(1);
      console.log(`Results: ${successCount}/${queriesToRun.length} (${successPct}%)`);
      console.log(`Verdict: ${successPct >= 80 ? 'PASS' : 'FAIL'}\n`);

      // 3. Coverage by field
      const fieldCounts = {
        trace_id: 0,
        packets: 0,
        contributors: 0,
        retrieval_strategy: 0,
        cache_source: 0,
        provenance: 0
      };

      results.forEach(r => {
        if (r.trace_id) fieldCounts.trace_id++;
        if (r.packet_count > 0) fieldCounts.packets++;
        if (r.contributors && r.contributors.length > 0) fieldCounts.contributors++;
        if (r.retrieval_strategy) fieldCounts.retrieval_strategy++;
        if (r.cache_source) fieldCounts.cache_source++;
        if (r.provenance) fieldCounts.provenance++;
      });

      console.log(`Field Coverage:`);
      console.log(`  trace_id: ${fieldCounts.trace_id}/${queriesToRun.length} (${(fieldCounts.trace_id/queriesToRun.length*100).toFixed(1)}%)`);
      console.log(`  packets: ${fieldCounts.packets}/${queriesToRun.length} (${(fieldCounts.packets/queriesToRun.length*100).toFixed(1)}%)`);
      console.log(`  contributors: ${fieldCounts.contributors}/${queriesToRun.length} (${(fieldCounts.contributors/queriesToRun.length*100).toFixed(1)}%)`);
      console.log(`  retrieval_strategy: ${fieldCounts.retrieval_strategy}/${queriesToRun.length} (${(fieldCounts.retrieval_strategy/queriesToRun.length*100).toFixed(1)}%)`);
      console.log(`  cache_source: ${fieldCounts.cache_source}/${queriesToRun.length} (${(fieldCounts.cache_source/queriesToRun.length*100).toFixed(1)}%)`);
      console.log(`  provenance: ${fieldCounts.provenance}/${queriesToRun.length} (${(fieldCounts.provenance/queriesToRun.length*100).toFixed(1)}%)\n`);

      // 4. Record proof if APPLY
      if (APPLY) {
        console.log('📋 Recording replay proof...\n');

        const proofData = JSON.stringify({
          test: 'replay-packet-rpc-proof',
          timestamp: new Date().toISOString(),
          queries_run: queriesToRun.length,
          successful: successCount,
          success_rate: parseFloat(successPct),
          verdict: successPct >= 80 ? 'PASS' : 'FAIL',
          field_coverage: fieldCounts,
          results: results
        });

        await pool.query(`
          INSERT INTO atlas_story_proofs (story_id, stage, action, proof_data)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (story_id, stage, action) DO UPDATE
            SET proof_data = $4
        `, [
          STORY_ID,
          'replay_packet_rpc',
          'validation',
          proofData
        ]);

        console.log(`✅ Replay proof recorded\n`);
      }

    } finally {
      await pool.end();
    }

  } catch (err) {
    console.error('❌ Replay proof failed:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  }
}

replayPacketRpc();
