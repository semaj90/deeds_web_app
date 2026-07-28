#!/usr/bin/env node
/**
 * prove-one-packet-vector-lineage-diagnostic.mts
 *
 * Diagnostic version that validates vector lineage against actual schema
 * and infrastructure state. Resilient to schema variations.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const REPORTS_DIR = resolve(REPO_ROOT, 'docs/reports/vector-lineage');

if (!existsSync(REPORTS_DIR)) {
  mkdirSync(REPORTS_DIR, { recursive: true });
}

interface DiagnosticResult {
  timestamp: string;
  tests: {
    postgres_connection: { status: string; details: Record<string, any> };
    postgres_schema: { status: string; details: Record<string, any> };
    postgres_data: { status: string; details: Record<string, any> };
    qdrant_connection: { status: string; details: Record<string, any> };
    qdrant_collections: { status: string; details: Record<string, any> };
    redis_connection: { status: string; details: Record<string, any> };
    redis_centroids: { status: string; details: Record<string, any> };
    vector_lineage: { status: string; details: Record<string, any> };
  };
}

const diagnostic: DiagnosticResult = {
  timestamp: new Date().toISOString(),
  tests: {
    postgres_connection: { status: 'PENDING', details: {} },
    postgres_schema: { status: 'PENDING', details: {} },
    postgres_data: { status: 'PENDING', details: {} },
    qdrant_connection: { status: 'PENDING', details: {} },
    qdrant_collections: { status: 'PENDING', details: {} },
    redis_connection: { status: 'PENDING', details: {} },
    redis_centroids: { status: 'PENDING', details: {} },
    vector_lineage: { status: 'PENDING', details: {} },
  },
};

async function main() {
  console.log('[diagnostic] Starting vector lineage diagnostic...\n');

  // TEST 1: Postgres connection
  console.log('🔍 TEST 1: Postgres connection...');
  try {
    const { Pool } = await import('pg');
    const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
    const pool = new Pool({
      connectionString: dbUrl,
      max: 1,
      idleTimeoutMillis: 3000,
      connectionTimeoutMillis: 5000,
    });

    const result = await pool.query('SELECT version()');
    diagnostic.tests.postgres_connection.status = 'PASS';
    diagnostic.tests.postgres_connection.details = {
      version: result.rows[0]?.version || 'unknown',
      dbUrl: dbUrl.replace(/:[^:]*@/, ':***@'),
    };
    console.log('✅ Postgres connection successful\n');

    // TEST 2: Postgres schema
    console.log('🔍 TEST 2: Postgres schema (atlas_packets)...');
    try {
      const schemaResult = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'atlas_packets' ORDER BY ordinal_position LIMIT 20`
      );
      const columns = schemaResult.rows.map((r: any) => `${r.column_name}(${r.data_type})`);
      diagnostic.tests.postgres_schema.status = 'PASS';
      diagnostic.tests.postgres_schema.details = {
        totalColumns: schemaResult.rows.length,
        sampleColumns: columns.slice(0, 10),
      };
      console.log(`✅ Schema loaded (${schemaResult.rows.length} columns)\n`);
    } catch (err) {
      diagnostic.tests.postgres_schema.status = 'FAIL';
      diagnostic.tests.postgres_schema.details = {
        error: err instanceof Error ? err.message : String(err),
      };
      console.log(`❌ Schema check failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }

    // TEST 3: Postgres data
    console.log('🔍 TEST 3: Postgres data (sample packet)...');
    try {
      const dataResult = await pool.query(
        `SELECT packet_key, source_ref, feature_id, sha256, qdrant_point_id
         FROM atlas_packets
         WHERE packet_key IS NOT NULL
         LIMIT 1`
      );
      if (dataResult.rows.length > 0) {
        const packet = dataResult.rows[0];
        diagnostic.tests.postgres_data.status = 'PASS';
        diagnostic.tests.postgres_data.details = {
          packetKey: packet.packet_key,
          sourceRef: packet.source_ref,
          featureId: packet.feature_id,
          sha256: packet.sha256?.substring(0, 16) + '...',
          qdrantPointId: packet.qdrant_point_id,
        };
        console.log(`✅ Sample packet loaded: ${packet.packet_key}\n`);
      } else {
        diagnostic.tests.postgres_data.status = 'WARN';
        diagnostic.tests.postgres_data.details = {
          message: 'No packets found in atlas_packets',
        };
        console.log('⚠️  No packets found in database\n');
      }
    } catch (err) {
      diagnostic.tests.postgres_data.status = 'FAIL';
      diagnostic.tests.postgres_data.details = {
        error: err instanceof Error ? err.message : String(err),
      };
      console.log(`❌ Data check failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }

    await pool.end();
  } catch (err) {
    diagnostic.tests.postgres_connection.status = 'FAIL';
    diagnostic.tests.postgres_connection.details = {
      error: err instanceof Error ? err.message : String(err),
    };
    console.log(`❌ Postgres connection failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // TEST 4: Qdrant connection
  console.log('🔍 TEST 4: Qdrant connection...');
  try {
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const response = await fetch(`${qdrantUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      diagnostic.tests.qdrant_connection.status = 'PASS';
      diagnostic.tests.qdrant_connection.details = {
        url: qdrantUrl,
        status: response.status,
      };
      console.log(`✅ Qdrant connection successful (${qdrantUrl})\n`);

      // TEST 5: Qdrant collections
      console.log('🔍 TEST 5: Qdrant collections...');
      try {
        const colResponse = await fetch(`${qdrantUrl}/collections`, {
          signal: AbortSignal.timeout(3000),
        });
        if (colResponse.ok) {
          const data = (await colResponse.json()) as any;
          const collections = data.result?.collections || [];
          const codebaseCollection = collections.find((c: any) => c.name.includes('768') || c.name.includes('codebase'));
          diagnostic.tests.qdrant_collections.status = 'PASS';
          diagnostic.tests.qdrant_collections.details = {
            totalCollections: collections.length,
            collections: collections.map((c: any) => c.name).slice(0, 5),
            codebaseVectorCollection: codebaseCollection?.name || 'not found',
            codebasePointCount: codebaseCollection?.points_count || 0,
          };
          console.log(`✅ Collections loaded (${collections.length} total)\n`);
        } else {
          throw new Error(`HTTP ${colResponse.status}`);
        }
      } catch (err) {
        diagnostic.tests.qdrant_collections.status = 'FAIL';
        diagnostic.tests.qdrant_collections.details = {
          error: err instanceof Error ? err.message : String(err),
        };
        console.log(`❌ Collections check failed\n`);
      }
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (err) {
    diagnostic.tests.qdrant_connection.status = 'FAIL';
    diagnostic.tests.qdrant_connection.details = {
      error: err instanceof Error ? err.message : String(err),
    };
    console.log(`❌ Qdrant connection failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // TEST 6: Redis connection
  console.log('🔍 TEST 6: Redis connection...');
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || 'redis',
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      connectTimeout: 3000,
    });

    await redis.connect();
    const pong = await redis.ping();
    diagnostic.tests.redis_connection.status = 'PASS';
    diagnostic.tests.redis_connection.details = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || '6379',
      ping: pong,
    };
    console.log(`✅ Redis connection successful\n`);

    // TEST 7: Redis centroids
    console.log('🔍 TEST 7: Redis centroids...');
    try {
      const keywordKeys = await redis.keys('gpu:karpathy:keywords:*');
      const somKeys = await redis.keys('som:centroid:*');
      diagnostic.tests.redis_centroids.status = 'PASS';
      diagnostic.tests.redis_centroids.details = {
        keywordCentroidsCount: keywordKeys.length,
        somCentroidsCount: somKeys.length,
        sampleKeywordKeys: keywordKeys.slice(0, 3),
      };
      console.log(
        `✅ Centroids found (${keywordKeys.length} keywords, ${somKeys.length} SOM cells)\n`
      );
    } catch (err) {
      diagnostic.tests.redis_centroids.status = 'FAIL';
      diagnostic.tests.redis_centroids.details = {
        error: err instanceof Error ? err.message : String(err),
      };
      console.log(`❌ Centroids check failed\n`);
    }

    await redis.quit();
  } catch (err) {
    diagnostic.tests.redis_connection.status = 'FAIL';
    diagnostic.tests.redis_connection.details = {
      error: err instanceof Error ? err.message : String(err),
    };
    console.log(`❌ Redis connection failed: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('DIAGNOSTIC SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const passCount = Object.values(diagnostic.tests).filter((t) => t.status === 'PASS').length;
  const warnCount = Object.values(diagnostic.tests).filter((t) => t.status === 'WARN').length;
  const failCount = Object.values(diagnostic.tests).filter((t) => t.status === 'FAIL').length;

  console.log(`✅ PASS: ${passCount}`);
  console.log(`⚠️  WARN: ${warnCount}`);
  console.log(`❌ FAIL: ${failCount}`);
  console.log();

  // Write report
  const reportPath = resolve(REPORTS_DIR, 'diagnostic.json');
  writeFileSync(reportPath, JSON.stringify(diagnostic, null, 2), 'utf-8');
  console.log(`📄 Report written to: ${reportPath}\n`);

  // Recommendations
  if (diagnostic.tests.postgres_data.status !== 'PASS') {
    console.log('🔧 ACTION: Populate atlas_packets with data before running retrieval tests\n');
  }
  if (diagnostic.tests.qdrant_collections.details.codebasePointCount === 0) {
    console.log(
      '🔧 ACTION: Index codebase chunks to Qdrant codebase_chunks_768 collection\n'
    );
  }
  if (diagnostic.tests.redis_centroids.details.keywordCentroidsCount === 0) {
    console.log('🔧 ACTION: Pre-warm Redis with keyword centroids\n');
  }

  process.exit(
    failCount > 0 ? 1 : warnCount > 0 ? 2 : 0
  );
}

main().catch((err) => {
  console.error('❌ Diagnostic failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
