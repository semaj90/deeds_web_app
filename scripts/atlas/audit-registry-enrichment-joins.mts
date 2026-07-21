#!/usr/bin/env npx tsx
/**
 * Audit Registry Enrichment Joins
 *
 * Validates that atlas_packets, feature views, Valkey cache, Neo4j topology,
 * and research docs can be joined by packet_key and canonical source_ref.
 *
 * Output: joinability report + candidates for materialized projections
 */

import { pool } from '$lib/server/db/client.js';
import { Redis } from 'ioredis';
import type { PoolClient } from 'pg';

interface JoinabilityReport {
  packets: {
    total: number;
    with_source_ref: number;
    with_packet_key: number;
    with_both: number;
  };
  feature_views: {
    total: number;
    joinable_by_packet_key: number;
    joinable_by_source_ref: number;
  };
  valkey_cache: {
    keys_scanned: number;
    packet_prefixes: number;
    source_prefixes: number;
  };
  neo4j_topology: {
    nodes_scanned: number;
    with_packet_key: number;
    with_source_ref: number;
  };
  research_docs: {
    total: number;
    with_source_ref: number;
  };
  joinability_score: number;
  recommendations: string[];
}

async function auditPacketsTable(client: PoolClient): Promise<Partial<JoinabilityReport>> {
  const result = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as with_source_ref,
      COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as with_packet_key,
      COUNT(CASE WHEN source_ref IS NOT NULL AND packet_key IS NOT NULL THEN 1 END) as with_both
    FROM atlas_packets
  `);

  const row = result.rows[0];
  return {
    packets: {
      total: parseInt(row.total),
      with_source_ref: parseInt(row.with_source_ref),
      with_packet_key: parseInt(row.with_packet_key),
      with_both: parseInt(row.with_both),
    },
  };
}

async function auditFeatureViews(client: PoolClient): Promise<Partial<JoinabilityReport>> {
  // Check if feature views exist and are joinable
  const result = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM feature_implementations) as feature_impl_count,
      (SELECT COUNT(*) FROM feature_file_edges) as feature_edges_count
  `);

  const row = result.rows[0];

  // Query packet-feature joinability
  const joinResult = await client.query(`
    SELECT
      COUNT(DISTINCT ap.packet_key) as joinable_by_packet_key,
      COUNT(DISTINCT ap.source_ref) as joinable_by_source_ref
    FROM atlas_packets ap
    WHERE EXISTS (
      SELECT 1 FROM feature_implementations fi WHERE fi.packet_key = ap.packet_key
    ) OR EXISTS (
      SELECT 1 FROM feature_file_edges fe WHERE fe.source_ref = ap.source_ref
    )
  `);

  const joinRow = joinResult.rows[0];

  return {
    feature_views: {
      total: parseInt(row.feature_impl_count) + parseInt(row.feature_edges_count),
      joinable_by_packet_key: parseInt(joinRow.joinable_by_packet_key),
      joinable_by_source_ref: parseInt(joinRow.joinable_by_source_ref),
    },
  };
}

async function auditValkeyCache(redis: Redis): Promise<Partial<JoinabilityReport>> {
  let packetPrefixes = 0;
  let sourcePrefixes = 0;
  let keysScanned = 0;
  const batchSize = 1000;

  try {
    // Scan for packet-keyed cache entries
    let cursor = '0';
    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'packet:*', 'COUNT', batchSize.toString());
      cursor = newCursor;
      packetPrefixes += keys.length;
      keysScanned += keys.length;
    } while (cursor !== '0' && keysScanned < 10000); // Safety limit

    // Scan for source-ref keyed entries
    cursor = '0';
    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', 'source:*', 'COUNT', batchSize.toString());
      cursor = newCursor;
      sourcePrefixes += keys.length;
    } while (cursor !== '0');
  } catch (err) {
    console.warn('Valkey cache audit limited:', err instanceof Error ? err.message : String(err));
  }

  return {
    valkey_cache: {
      keys_scanned: keysScanned,
      packet_prefixes: packetPrefixes,
      source_prefixes: sourcePrefixes,
    },
  };
}

async function auditNeo4jTopology(client: PoolClient): Promise<Partial<JoinabilityReport>> {
  // Query Neo4j via database if available
  const result = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN properties->>'packet_key' IS NOT NULL THEN 1 END) as with_packet_key,
      COUNT(CASE WHEN properties->>'source_ref' IS NOT NULL THEN 1 END) as with_source_ref
    FROM neo4j_nodes
    WHERE properties IS NOT NULL
    LIMIT 10000
  `).catch(() => ({ rows: [{ total: 0, with_packet_key: 0, with_source_ref: 0 }] }));

  const row = result.rows[0];
  return {
    neo4j_topology: {
      nodes_scanned: parseInt(row.total),
      with_packet_key: parseInt(row.with_packet_key),
      with_source_ref: parseInt(row.with_source_ref),
    },
  };
}

async function auditResearchDocs(client: PoolClient): Promise<Partial<JoinabilityReport>> {
  const result = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as with_source_ref
    FROM research_documents
  `).catch(() => ({ rows: [{ total: 0, with_source_ref: 0 }] }));

  const row = result.rows[0];
  return {
    research_docs: {
      total: parseInt(row.total),
      with_source_ref: parseInt(row.with_source_ref),
    },
  };
}

function calculateJoinabilityScore(report: Partial<JoinabilityReport>): number {
  const scores: number[] = [];

  if (report.packets) {
    const pct = report.packets.with_both / report.packets.total;
    scores.push(pct);
  }

  if (report.feature_views) {
    const joinable = Math.max(report.feature_views.joinable_by_packet_key, report.feature_views.joinable_by_source_ref);
    const pct = report.feature_views.total > 0 ? joinable / report.feature_views.total : 0;
    scores.push(pct);
  }

  if (report.valkey_cache && report.valkey_cache.keys_scanned > 0) {
    const total = report.valkey_cache.packet_prefixes + report.valkey_cache.source_prefixes;
    const pct = total > 0 ? total / report.valkey_cache.keys_scanned : 0;
    scores.push(pct);
  }

  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

function generateRecommendations(report: Partial<JoinabilityReport>): string[] {
  const recs: string[] = [];

  if (report.packets && report.packets.with_both < report.packets.total) {
    const missing = report.packets.total - report.packets.with_both;
    recs.push(`⚠️  ${missing} packets missing source_ref or packet_key (needed for joins)`);
  }

  if (report.feature_views && report.feature_views.total > 0) {
    const unjoined = report.feature_views.total - Math.max(
      report.feature_views.joinable_by_packet_key,
      report.feature_views.joinable_by_source_ref
    );
    if (unjoined > 0) {
      recs.push(`⚠️  ${unjoined} feature views not joinable by packet_key or source_ref`);
    }
  }

  if (report.valkey_cache && report.valkey_cache.keys_scanned === 0) {
    recs.push('⚠️  Valkey cache appears empty or inaccessible');
  }

  if (report.neo4j_topology && report.neo4j_topology.nodes_scanned === 0) {
    recs.push('⚠️  Neo4j topology table empty or unavailable');
  }

  if (report.research_docs && report.research_docs.total === 0) {
    recs.push('⚠️  No research documents indexed yet');
  }

  if (!recs.length) {
    recs.push('✅ All audit checks passed — ready for materialization');
  }

  return recs;
}

async function main() {
  const client = await pool.connect();
  const redis = new Redis({ host: '127.0.0.1', port: 6379, password: process.env.REDIS_PASSWORD });

  try {
    console.log('🔍 Auditing registry enrichment joins...\n');

    const report: Partial<JoinabilityReport> = {
      ...(await auditPacketsTable(client)),
      ...(await auditFeatureViews(client)),
      ...(await auditValkeyCache(redis)),
      ...(await auditNeo4jTopology(client)),
      ...(await auditResearchDocs(client)),
    };

    report.joinability_score = calculateJoinabilityScore(report);
    report.recommendations = generateRecommendations(report);

    console.log('📊 Joinability Report\n');
    console.log(JSON.stringify(report, null, 2));

    console.log('\n📋 Recommendations:');
    report.recommendations?.forEach(rec => console.log(`  ${rec}`));

    const score = (report.joinability_score ?? 0 * 100).toFixed(1);
    console.log(`\n✨ Overall Joinability Score: ${score}%`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Audit failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    await client.release();
    await redis.quit();
  }
}

main();
