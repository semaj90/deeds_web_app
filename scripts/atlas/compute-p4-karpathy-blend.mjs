#!/usr/bin/env node
/**
 * P4 Phase 4: Compute Karpathy authority blend score for SOM cells
 * Combines PageRank (0.40) + attention (0.30) + frequency (0.20) + provenance (0.10)
 *
 * Usage:
 *   npm run atlas:p4:karpathy
 *   npm run atlas:p4:karpathy --verbose
 *   npm run atlas:p4:karpathy --dry-run
 */

import pg from 'pg';
import Redis from 'ioredis';

const isVerbose = process.argv.includes('--verbose');
const isDryRun = process.argv.includes('--dry-run');

const log = (msg, data = '') => {
  if (isVerbose || msg.includes('ERROR') || msg.includes('PASS') || msg.includes('✅')) {
    console.log(`[P4-Karpathy] ${msg}`, data || '');
  }
};

async function computeKarpathyBlend() {
  const pgClient = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });

  const redisClient = new Redis(process.env.REDIS_URL || {
    host: '127.0.0.1',
    port: 6379,
    password: 'redis'
  });

  try {
    log('Connecting to PostgreSQL...');
    await pgClient.connect();

    log('Connecting to Redis...');
    // Redis initialized above

    // Phase 4.1: Load PageRank scores
    log('Loading PageRank scores from Redis...');
    const prKey = 'atlas:pagerank:som:scores';
    const prScores = {};
    try {
      const prData = await redisClient.hgetall(prKey);
      Object.entries(prData).forEach(([clusterId, score]) => {
        prScores[parseInt(clusterId)] = parseFloat(score);
      });
      log(`✅ Loaded ${Object.keys(prScores).length} PageRank scores`);
    } catch (e) {
      log(`⚠️ Could not load PageRank scores: ${e.message}`);
    }

    // Phase 4.2: Load attention scores
    log('Loading attention scores from Redis...');
    const attKey = 'atlas:attention:som:scores';
    const attScores = {};
    try {
      const attData = await redisClient.hgetall(attKey);
      Object.entries(attData).forEach(([clusterId, score]) => {
        attScores[parseInt(clusterId)] = parseFloat(score);
      });
      log(`✅ Loaded ${Object.keys(attScores).length} attention scores`);
    } catch (e) {
      log(`⚠️ Could not load attention scores: ${e.message}`);
    }

    // Phase 4.3: Compute frequency (packet count per SOM cell)
    log('Computing frequency scores from Postgres...');
    const freqResult = await pgClient.query(`
      SELECT
        (metadata->>'som_cluster')::integer AS som_cluster,
        COUNT(*) AS packet_count
      FROM atlas_packets
      WHERE metadata->>'som_cluster' IS NOT NULL
      GROUP BY (metadata->>'som_cluster')::integer
    `);

    const frequencyMap = {};
    let maxFreq = 0;
    for (const row of freqResult.rows) {
      frequencyMap[row.som_cluster] = row.packet_count;
      maxFreq = Math.max(maxFreq, row.packet_count);
    }

    // Normalize frequencies to [0,1]
    const freqScores = {};
    Object.entries(frequencyMap).forEach(([clusterId, count]) => {
      freqScores[parseInt(clusterId)] = maxFreq > 0 ? count / maxFreq : 0;
    });
    log(`✅ Computed frequency scores for ${Object.keys(freqScores).length} clusters (max=${maxFreq})`);

    // Phase 4.4: Compute provenance score (source diversity)
    log('Computing provenance scores from Postgres...');
    const provResult = await pgClient.query(`
      SELECT
        (metadata->>'som_cluster')::integer AS som_cluster,
        COUNT(DISTINCT (metadata->>'feature_id')) AS unique_features
      FROM atlas_packets
      WHERE metadata->>'som_cluster' IS NOT NULL
      GROUP BY (metadata->>'som_cluster')::integer
    `);

    const provScores = {};
    let maxFeat = 0;
    for (const row of provResult.rows) {
      provScores[row.som_cluster] = row.unique_features;
      maxFeat = Math.max(maxFeat, row.unique_features);
    }

    // Normalize provenance to [0,1] against actual maximum (not hardcoded 10)
    Object.entries(provScores).forEach(([clusterId, feat]) => {
      provScores[parseInt(clusterId)] = maxFeat > 0 ? Math.min(1, feat / maxFeat) : 0;
    });
    log(`✅ Computed provenance scores for ${Object.keys(provScores).length} clusters`);

    // Phase 4.5: Blend scores using weighted average
    log('Computing Karpathy authority blend...');
    const blendWeights = {
      pagerank: 0.40,
      attention: 0.30,
      frequency: 0.20,
      provenance: 0.10
    };

    const blendScores = {};
    for (let i = 0; i < 400; i++) {
      const pr = prScores[i] || 0.15; // Default PageRank (baseline)
      const att = attScores[i] || 0.05;
      const freq = freqScores[i] || 0;
      const prov = provScores[i] || 0;

      const blend =
        (pr * blendWeights.pagerank) +
        (att * blendWeights.attention) +
        (freq * blendWeights.frequency) +
        (prov * blendWeights.provenance);

      blendScores[i] = blend;
    }

    log(`✅ Blended authority scores for 400 SOM cells`);
    if (isVerbose) {
      const sorted = Object.entries(blendScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      sorted.forEach(([cluster, score]) => {
        log(`  Cluster ${cluster}: karpathy=${score.toFixed(4)}`);
      });
    }

    // Phase 4.6: Write blend scores to Postgres
    if (!isDryRun) {
      log('Writing Karpathy blend scores to Postgres...');

      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS atlas_som_cell_karpathy_scores (
          som_cluster INTEGER PRIMARY KEY,
          karpathy_score REAL NOT NULL,
          pagerank_component REAL,
          attention_component REAL,
          frequency_component REAL,
          provenance_component REAL,
          computed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
      `);

      for (let i = 0; i < 400; i++) {
        const pr = prScores[i] || 0.15;
        const att = attScores[i] || 0.05;
        const freq = freqScores[i] || 0;
        const prov = provScores[i] || 0;
        const blend = blendScores[i];

        await pgClient.query(
          `INSERT INTO atlas_som_cell_karpathy_scores
           (som_cluster, karpathy_score, pagerank_component, attention_component, frequency_component, provenance_component, computed_at)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (som_cluster) DO UPDATE
           SET karpathy_score = $2, pagerank_component = $3, attention_component = $4, frequency_component = $5, provenance_component = $6, computed_at = now()`,
          [i, blend, pr, att, freq, prov]
        );
      }
      log(`✅ Inserted 400 Karpathy scores to Postgres`);
    }

    // Phase 4.7: Cache to Redis
    if (!isDryRun) {
      log('Caching Karpathy blend scores to Redis...');
      const cacheKey = 'atlas:karpathy:som:scores';
      await redisClient.del(cacheKey);

      const pipeline = redisClient.pipeline();
      for (const [clusterId, score] of Object.entries(blendScores)) {
        pipeline.hset(cacheKey, clusterId.toString(), score.toString());
      }
      pipeline.expire(cacheKey, 86400);
      await pipeline.exec();
      log(`✅ Cached Karpathy scores to Redis (key=${cacheKey})`);
    }

    // Phase 4.8: Verify gates
    log('Verifying P4 Phase 4 gates...');
    const gateResults = {
      pass: true,
      checks: {
        pagerank_loaded: Object.keys(prScores).length >= 350,
        attention_loaded: Object.keys(attScores).length >= 350,
        blend_computed: Object.keys(blendScores).length === 400,
        scores_in_range: Object.values(blendScores).every(s => s >= 0 && s <= 1),
      },
      optional: {
        frequency_computed: Object.keys(freqScores).length > 0,
        provenance_computed: Object.keys(provScores).length > 0,
      }
    };

    Object.entries(gateResults.checks).forEach(([check, pass]) => {
      log(`  ${check}: ${pass ? '✅' : '❌'}`);
      if (!pass) gateResults.pass = false;
    });

    Object.entries(gateResults.optional).forEach(([check, pass]) => {
      log(`  ${check} (optional): ${pass ? '✅' : '⚠️'}`);
    });

    if (gateResults.pass) {
      log('✅ P4 PHASE 4 (Karpathy Blend) COMPLETE');
      log('✅✅✅ P4 HIGHER-HOP ENRICHMENT COMPLETE (ALL PHASES PASS)');
      process.exit(0);
    } else {
      log('❌ P4 PHASE 4 FAILED — gates did not pass');
      process.exit(1);
    }

  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
    if (redisClient) await redisClient.quit();
  }
}

computeKarpathyBlend();
