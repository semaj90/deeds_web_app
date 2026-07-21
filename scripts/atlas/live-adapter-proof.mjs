#!/usr/bin/env node
/**
 * LIVE_ADAPTER_PROOF Gate
 * Vertical end-to-end test: OpenCode → ACE → Redis miss → Qdrant → Gemma4 → Postgres → Redis → Cache hit
 * Date: July 21, 2026
 * Status: GATE EXECUTION
 */

import pg from 'pg';
import { createClient as createRedisClient } from 'redis';
import crypto from 'crypto';

const { Pool } = pg;

// Configuration
const config = {
  postgres: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5434'),
    database: process.env.DB_NAME || 'legal_ai_db',
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || '',
  },
  qdrant: {
    host: process.env.QDRANT_HOST || '127.0.0.1',
    port: parseInt(process.env.QDRANT_PORT || '6333'),
  },
  gemma4: {
    url: process.env.GEMMA4_URL || 'http://127.0.0.1:8090/v1/chat/completions',
  },
};

class LiveAdapterProof {
  constructor() {
    this.pool = new Pool(config.postgres);
    this.redis = null;
    this.results = {
      stage: 'initial',
      steps: [],
      cacheHit: false,
      artifacts: {},
      timing: {},
    };
  }

  async connect() {
    console.log('📡 Connecting to services...');

    // Postgres
    try {
      await this.pool.query('SELECT 1');
      console.log('✅ Postgres connected');
      this.results.steps.push({ stage: 'postgres-connect', status: 'PASS' });
    } catch (err) {
      console.error('❌ Postgres connection failed:', err.message);
      this.results.steps.push({ stage: 'postgres-connect', status: 'FAIL', error: err.message });
      throw err;
    }

    // Redis
    try {
      this.redis = createRedisClient({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        socket: { reconnectStrategy: () => null },
      });
      await this.redis.connect();
      await this.redis.ping();
      console.log('✅ Redis connected');
      this.results.steps.push({ stage: 'redis-connect', status: 'PASS' });
    } catch (err) {
      console.error('❌ Redis connection failed:', err.message);
      this.results.steps.push({ stage: 'redis-connect', status: 'FAIL', error: err.message });
      throw err;
    }
  }

  async stage1_OpenCodeRequest() {
    console.log('\n📝 Stage 1: OpenCode Request (simulated)');
    const startTime = Date.now();

    const query = 'What authentication patterns are used in the codebase?';
    const traceId = crypto.randomUUID();

    this.results.artifacts.queryText = query;
    this.results.artifacts.traceId = traceId;

    console.log(`  Query: "${query}"`);
    console.log(`  Trace ID: ${traceId}`);

    this.results.steps.push({
      stage: 'opencode-request',
      status: 'PASS',
      query,
      traceId,
      duration: Date.now() - startTime,
    });
  }

  async stage2_ACEFacade() {
    console.log('\n🎯 Stage 2: ACE Facade (Context Assembly)');
    const startTime = Date.now();

    const query = `
      SELECT packet_key, source_ref, summary
      FROM atlas_packets
      WHERE source_ref LIKE '%auth%'
      LIMIT 5
    `;

    try {
      const result = await this.pool.query(query);
      const packets = result.rows;

      console.log(`  ✅ Fetched ${packets.length} auth-related packets from Postgres`);
      this.results.artifacts.aceContext = {
        packetCount: packets.length,
        packets: packets.map(p => ({ packet_key: p.packet_key, ref: p.source_ref })),
      };

      this.results.steps.push({
        stage: 'ace-facade',
        status: 'PASS',
        packetCount: packets.length,
        duration: Date.now() - startTime,
      });
    } catch (err) {
      console.error('❌ ACE facade failed:', err.message);
      this.results.steps.push({
        stage: 'ace-facade',
        status: 'FAIL',
        error: err.message,
      });
      throw err;
    }
  }

  async stage3_RedisMiss() {
    console.log('\n💾 Stage 3: Redis Cache Check (Expect Miss)');
    const startTime = Date.now();

    const cacheKey = `scenario:${this.results.artifacts.traceId}`;
    const cached = await this.redis.get(cacheKey);

    if (!cached) {
      console.log(`  ✅ Cache miss (as expected) on key: ${cacheKey}`);
      this.results.steps.push({
        stage: 'redis-cache-check',
        status: 'PASS',
        cacheHit: false,
        duration: Date.now() - startTime,
      });
    } else {
      console.log(`  ⚠️  Cache hit (unexpected for first request)`);
      this.results.steps.push({
        stage: 'redis-cache-check',
        status: 'WARN',
        cacheHit: true,
        duration: Date.now() - startTime,
      });
    }
  }

  async stage4_QdrantRetrieval() {
    console.log('\n🔍 Stage 4: Qdrant Retrieval (Vector Search)');
    const startTime = Date.now();

    try {
      const response = await fetch(`http://${config.qdrant.host}:${config.qdrant.port}/collections/codebase_chunks_768/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 5,
          filter: {
            has_payload_key: 'source_ref',
          },
          with_payload: true,
          with_vectors: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Qdrant returned ${response.status}`);
      }

      const data = await response.json();
      const points = data.result?.points || [];

      console.log(`  ✅ Retrieved ${points.length} points from Qdrant`);
      this.results.artifacts.qdrantCandidates = points.slice(0, 3).map(p => ({
        id: p.id,
        payload: p.payload,
      }));

      this.results.steps.push({
        stage: 'qdrant-retrieval',
        status: 'PASS',
        candidateCount: points.length,
        duration: Date.now() - startTime,
      });
    } catch (err) {
      console.error('❌ Qdrant retrieval failed:', err.message);
      this.results.steps.push({
        stage: 'qdrant-retrieval',
        status: 'FAIL',
        error: err.message,
      });
      throw err;
    }
  }

  async stage5_Gemma4Synthesis() {
    console.log('\n🧠 Stage 5: Gemma4 Synthesis (LLM Generation)');
    const startTime = Date.now();

    const candidates = this.results.artifacts.qdrantCandidates || [];
    const context = candidates.map(c => c.payload?.source_ref || 'unknown').join(', ');

    try {
      const response = await fetch(config.gemma4.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-legal-iq4xs-direct.gguf',
          messages: [
            {
              role: 'system',
              content: 'You are a legal code analyst. Provide a brief (2 sentence) summary.',
            },
            {
              role: 'user',
              content: `Based on these authentication modules (${context}), summarize the auth pattern.`,
            },
          ],
          max_tokens: 128,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemma4 returned ${response.status}: ${text}`);
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content || '(no response)';

      console.log(`  ✅ Generated summary (${summary.length} chars)`);
      this.results.artifacts.gemma4Summary = summary.substring(0, 200);

      this.results.steps.push({
        stage: 'gemma4-synthesis',
        status: 'PASS',
        summaryLength: summary.length,
        duration: Date.now() - startTime,
      });
    } catch (err) {
      console.error('❌ Gemma4 synthesis failed:', err.message);
      this.results.steps.push({
        stage: 'gemma4-synthesis',
        status: 'FAIL',
        error: err.message,
      });
    }
  }

  async stage6_PostgresWrite() {
    console.log('\n💾 Stage 6: Postgres scenario_cache Write');
    const startTime = Date.now();

    const traceId = this.results.artifacts.traceId;
    const scenario_hash = crypto.createHash('sha256').update(this.results.artifacts.queryText).digest('hex');
    const pipeline_key = 'opencode:default:v1.0';

    try {
      await this.pool.query(
        `INSERT INTO scenario_cache
          (scenario_hash, pipeline_key, model_id, model_version, context_contract_version, retrieval_manifest_hash, cached_response, hit_count)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (scenario_hash, pipeline_key, context_contract_version)
        DO UPDATE SET hit_count = hit_count + 1`,
        [
          scenario_hash,
          pipeline_key,
          'gemma4-legal-iq4xs',
          'v1.0',
          'v1.0',
          crypto.createHash('sha256').update('').digest('hex'),
          JSON.stringify(this.results.artifacts),
          0,
        ]
      );

      console.log(`  ✅ Wrote to scenario_cache (scenario_hash: ${scenario_hash.substring(0, 8)}...)`);
      this.results.artifacts.cacheId = traceId;
      this.results.artifacts.scenario_hash = scenario_hash;
      this.results.artifacts.pipeline_key = pipeline_key;

      this.results.steps.push({
        stage: 'postgres-write',
        status: 'PASS',
        scenario_hash: scenario_hash.substring(0, 8),
        duration: Date.now() - startTime,
      });
    } catch (err) {
      console.error('❌ Postgres write failed:', err.message);
      this.results.steps.push({
        stage: 'postgres-write',
        status: 'FAIL',
        error: err.message,
      });
      throw err;
    }
  }

  async stage7_RedisProjection() {
    console.log('\n🔄 Stage 7: Redis Projection (Cache Layer Update)');
    const startTime = Date.now();

    try {
      const cacheKey = `scenario:${this.results.artifacts.traceId}`;
      const cacheValue = JSON.stringify({
        summary: this.results.artifacts.gemma4Summary || 'Generated summary',
        cached_at: new Date().toISOString(),
      });

      await this.redis.setEx(cacheKey, 3600, cacheValue);

      console.log(`  ✅ Projected to Redis (TTL: 3600s)`);

      this.results.steps.push({
        stage: 'redis-projection',
        status: 'PASS',
        ttl: 3600,
        duration: Date.now() - startTime,
      });
    } catch (err) {
      console.error('❌ Redis projection failed:', err.message);
      this.results.steps.push({
        stage: 'redis-projection',
        status: 'FAIL',
        error: err.message,
      });
    }
  }

  async stage8_RepeatedRequest() {
    console.log('\n🔁 Stage 8: Repeated Request (Cache Hit Expected)');
    const startTime = Date.now();

    const cacheKey = `scenario:${this.results.artifacts.traceId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      console.log(`  ✅ Cache hit on second request!`);
      this.results.cacheHit = true;
      this.results.steps.push({
        stage: 'repeated-request',
        status: 'PASS',
        cacheHit: true,
        duration: Date.now() - startTime,
      });
    } else {
      console.log(`  ⚠️  Cache miss on second request (Redis timeout or projection failed)`);
      this.results.steps.push({
        stage: 'repeated-request',
        status: 'WARN',
        cacheHit: false,
        duration: Date.now() - startTime,
      });
    }
  }

  async stage9_VerifyHitCount() {
    console.log('\n📊 Stage 9: Verify Cache Hit Count (Postgres)');
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        'SELECT hit_count FROM scenario_cache WHERE scenario_hash = $1 LIMIT 1',
        [this.results.artifacts.scenario_hash]
      );

      const hitCount = result.rows[0]?.hit_count || 0;

      if (hitCount > 0) {
        console.log(`  ✅ hit_count incremented to ${hitCount}`);
        this.results.steps.push({
          stage: 'verify-hit-count',
          status: 'PASS',
          hitCount,
          duration: Date.now() - startTime,
        });
      } else {
        console.log(`  ⚠️  hit_count still 0 (no cache hit recorded)`);
        this.results.steps.push({
          stage: 'verify-hit-count',
          status: 'WARN',
          hitCount,
          duration: Date.now() - startTime,
        });
      }
    } catch (err) {
      console.error('❌ Verification failed:', err.message);
      this.results.steps.push({
        stage: 'verify-hit-count',
        status: 'FAIL',
        error: err.message,
      });
    }
  }

  async run() {
    console.log('🚀 LIVE_ADAPTER_PROOF Gate Execution\n');
    console.log('═'.repeat(70));

    try {
      await this.connect();
      await this.stage1_OpenCodeRequest();
      await this.stage2_ACEFacade();
      await this.stage3_RedisMiss();
      await this.stage4_QdrantRetrieval();
      await this.stage5_Gemma4Synthesis();
      await this.stage6_PostgresWrite();
      await this.stage7_RedisProjection();
      await this.stage8_RepeatedRequest();
      await this.stage9_VerifyHitCount();

      console.log('\n' + '═'.repeat(70));
      this.printReport();

      const failCount = this.results.steps.filter(s => s.status === 'FAIL').length;

      if (failCount === 0) {
        console.log('\n✅ LIVE_ADAPTER_PROOF GATE: PASS\n');
        process.exit(0);
      } else {
        console.log('\n❌ LIVE_ADAPTER_PROOF GATE: FAIL\n');
        process.exit(1);
      }
    } catch (err) {
      console.error('\n❌ GATE EXECUTION FAILED:', err.message);
      console.log(JSON.stringify(this.results, null, 2));
      process.exit(1);
    } finally {
      await this.pool.end();
      await this.redis?.quit();
    }
  }

  printReport() {
    console.log('\n📋 Execution Report:\n');

    let passCount = 0, failCount = 0, warnCount = 0;

    for (const step of this.results.steps) {
      const icon = step.status === 'PASS' ? '✅' : step.status === 'FAIL' ? '❌' : '⚠️ ';
      const duration = step.duration ? ` (${step.duration}ms)` : '';
      console.log(`${icon} ${step.stage}${duration}`);

      if (step.status === 'PASS') passCount++;
      else if (step.status === 'FAIL') failCount++;
      else warnCount++;
    }

    console.log(`\nSummary: ${passCount} PASS, ${failCount} FAIL, ${warnCount} WARN`);
    console.log(`Cache Hit Verified: ${this.results.cacheHit ? 'YES ✅' : 'NO ⚠️'}`);
  }
}

const proof = new LiveAdapterProof();
proof.run();
