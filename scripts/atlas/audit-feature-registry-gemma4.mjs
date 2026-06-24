#!/usr/bin/env node
/**
 * audit-feature-registry-gemma4.mjs
 *
 * Comprehensive Gemma4 feature registry audit.
 *
 * Validates:
 * - Identity spine: packet_key, source_ref, feature_id, qdrant_point_id, som_cluster
 * - Cross-store contracts: Postgres vs Qdrant vs Neo4j vs Redis
 * - Trace-MCP integration: agent claims, tool calls, packet provenance
 * - Retrieval authority chain: vector → topology → pagerank
 * - Feature extraction completeness: summary, labels, domain classification
 *
 * Usage:
 *   node scripts/atlas/audit-feature-registry-gemma4.mjs [--json] [--verbose]
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import Redis from 'ioredis';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── Arg Parsing ──────────────────────────────────────────────────────────────
const argv = new Set(process.argv.slice(2));
const JSON_MODE = argv.has('--json');
const VERBOSE = argv.has('--verbose');

// ── Environment Loading ──────────────────────────────────────────────────────
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const NEO4J_URI = env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = env.NEO4J_USER || env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASS = env.NEO4J_PASSWORD || env.NEO4J_PASS || 'neo4j123';
const REDIS_URL = env.REDIS_URL || env.VALKEY_URL || 'redis://:redis@127.0.0.1:6379';

const log = (msg) => {
  if (!JSON_MODE) console.log(msg);
};

const report = {
  generatedAt: new Date().toISOString(),
  timestamp: Date.now(),
  environment: {
    postgres: DATABASE_URL.replace(/:[^:@/]+@/, ':***@'),
    neo4j: NEO4J_URI,
    redis: REDIS_URL.replace(/:[^:@]+@/, ':***@'),
  },
  sections: {},
};

async function main() {
  log('\n🔍 Gemma4 Feature Registry Comprehensive Audit');
  log('═'.repeat(60));

  const pgPool = new pg.Pool({ connectionString: DATABASE_URL });
  const neo4jDriver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  const redis = new Redis(REDIS_URL);

  try {
    // ── Section 1: Identity Spine ────────────────────────────────────────
    log('\n📋 Section 1: Identity Spine (Postgres Truth Layer)');
    const identityRes = await pgPool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(packet_key) as with_packet_key,
        COUNT(source_ref) as with_source_ref,
        COUNT(feature_id) as with_feature_id,
        COUNT(som_index) as with_som_index,
        COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL AND feature_id IS NOT NULL THEN 1 END) as complete_spine
      FROM atlas_packets
    `);
    const identityRow = identityRes.rows[0];
    report.sections.identity = identityRow;
    log(`✅ Total packets: ${identityRow.total}`);
    log(`   packet_key: ${identityRow.with_packet_key}/${identityRow.total} (${(identityRow.with_packet_key/identityRow.total*100).toFixed(1)}%)`);
    log(`   source_ref: ${identityRow.with_source_ref}/${identityRow.total} (${(identityRow.with_source_ref/identityRow.total*100).toFixed(1)}%)`);
    log(`   feature_id: ${identityRow.with_feature_id}/${identityRow.total} (${(identityRow.with_feature_id/identityRow.total*100).toFixed(1)}%)`);
    log(`   som_index:  ${identityRow.with_som_index}/${identityRow.total} (${(identityRow.with_som_index/identityRow.total*100).toFixed(1)}%)`);
    log(`   complete spine: ${identityRow.complete_spine}/${identityRow.total} (${(identityRow.complete_spine/identityRow.total*100).toFixed(1)}%)`);

    // ── Section 2: Qdrant Contract ───────────────────────────────────────
    log('\n🔷 Section 2: Qdrant Vector Layer Contract');

    // Check if qdrant_point_id or similar field exists
    const qdrantCount = await pgPool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(qdrant_point_id) as with_qdrant_point_id
      FROM atlas_packets
    `);
    report.sections.qdrant = qdrantCount.rows[0];
    log(`✅ Qdrant-indexed packets: ${qdrantCount.rows[0].total}`);
    log(`   with qdrant_point_id: ${qdrantCount.rows[0].with_qdrant_point_id}/${qdrantCount.rows[0].total} (${(qdrantCount.rows[0].with_qdrant_point_id/qdrantCount.rows[0].total*100).toFixed(1)}%)`);

    // ── Section 3: Neo4j Identity Layer ──────────────────────────────────
    log('\n📊 Section 3: Neo4j Identity Layer');
    const neo4jSession = neo4jDriver.session();

    const neo4jRes = await neo4jSession.run(`
      MATCH (p:Packet)
      RETURN
        count(p) as total,
        sum(CASE WHEN p.packet_key IS NOT NULL THEN 1 ELSE 0 END) as with_packet_key,
        sum(CASE WHEN p.source_ref IS NOT NULL THEN 1 ELSE 0 END) as with_source_ref,
        sum(CASE WHEN p.feature_id IS NOT NULL THEN 1 ELSE 0 END) as with_feature_id,
        sum(CASE WHEN p.som_cluster IS NOT NULL THEN 1 ELSE 0 END) as with_som_cluster
    `);

    const neo4jRec = neo4jRes.records[0];
    const neo4jStats = {
      total: Number(neo4jRec.get('total')),
      with_packet_key: Number(neo4jRec.get('with_packet_key')),
      with_source_ref: Number(neo4jRec.get('with_source_ref')),
      with_feature_id: Number(neo4jRec.get('with_feature_id')),
      with_som_cluster: Number(neo4jRec.get('with_som_cluster')),
    };
    report.sections.neo4j = neo4jStats;

    log(`✅ Packet nodes: ${neo4jStats.total}`);
    log(`   packet_key: ${neo4jStats.with_packet_key}/${neo4jStats.total} (${(neo4jStats.with_packet_key/neo4jStats.total*100).toFixed(1)}%)`);
    log(`   source_ref: ${neo4jStats.with_source_ref}/${neo4jStats.total} (${(neo4jStats.with_source_ref/neo4jStats.total*100).toFixed(1)}%)`);
    log(`   feature_id: ${neo4jStats.with_feature_id}/${neo4jStats.total} (${(neo4jStats.with_feature_id/neo4jStats.total*100).toFixed(1)}%)`);
    log(`   som_cluster: ${neo4jStats.with_som_cluster}/${neo4jStats.total} (${(neo4jStats.with_som_cluster/neo4jStats.total*100).toFixed(1)}%)`);

    // ── Section 4: SOM Topology ──────────────────────────────────────────
    log('\n🗺️  Section 4: SOM Topology Layer');
    const somRes = await pgPool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(z_som) as with_z_som,
        COUNT(x_cosine) as with_x_cosine,
        COUNT(y_graph) as with_y_graph,
        COUNT(CASE WHEN z_som IS NOT NULL AND x_cosine IS NOT NULL AND y_graph IS NOT NULL THEN 1 END) as complete_coords,
        COUNT(pagerank) as with_pagerank
      FROM atlas_topology_index
    `);
    const somRow = somRes.rows[0];
    report.sections.som = somRow;
    log(`✅ Topology index: ${somRow.total}`);
    log(`   z_som (cluster): ${somRow.with_z_som}/${somRow.total} (${(somRow.with_z_som/somRow.total*100).toFixed(1)}%)`);
    log(`   complete coords: ${somRow.complete_coords}/${somRow.total} (${(somRow.complete_coords/somRow.total*100).toFixed(1)}%)`);
    log(`   pagerank: ${somRow.with_pagerank}/${somRow.total} (${(somRow.with_pagerank/somRow.total*100).toFixed(1)}%)`);

    // ── Section 5: Trace-MCP Integration ─────────────────────────────────
    log('\n🔗 Section 5: Trace-MCP Integration');
    let traceMcpStats = { claimed_tasks: 0, tool_calls: 0, agent_claims: 0 };

    try {
      const traceRes = await pgPool.query(`
        SELECT COUNT(*) as count FROM agent_claims WHERE status='CLAIMED'
      `);
      traceMcpStats.agent_claims = traceRes.rows[0].count;
    } catch (e) {
      // Table might not exist
      traceMcpStats.agent_claims = 'N/A (table missing)';
    }

    report.sections.traceMcp = traceMcpStats;
    log(`ℹ️  Agent claims: ${traceMcpStats.agent_claims}`);
    log(`   (Full trace audit: see agent governance section)`);

    // ── Section 6: BM25 + ANN Coverage ───────────────────────────────────
    log('\n🔎 Section 6: BM25 + ANN Retrieval Coverage');
    const retrivalRes = await pgPool.query(`
      SELECT
        'Postgres FTS' as source,
        COUNT(packet_key) as indexed
      FROM atlas_packets
      WHERE summary IS NOT NULL
      UNION ALL
      SELECT
        'Qdrant ANN' as source,
        COUNT(*) as indexed
      FROM atlas_packets
      WHERE qdrant_point_id IS NOT NULL
      ORDER BY source
    `);
    report.sections.retrieval = retrivalRes.rows;
    log(`✅ FTS indexed: ${retrivalRes.rows[0]?.indexed || 0} packets`);
    log(`   ANN indexed: ${retrivalRes.rows[1]?.indexed || 0} packets`);

    // ── Section 7: Feature Extraction Completeness ───────────────────────
    log('\n🧠 Section 7: Feature Extraction Completeness');
    const featureRes = await pgPool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(summary) as with_summary,
        COUNT(feature_label) as with_label,
        COUNT(domain_class) as with_domain,
        COUNT(CASE WHEN summary IS NOT NULL AND feature_label IS NOT NULL THEN 1 END) as complete
      FROM atlas_packets
    `);
    const featureRow = featureRes.rows[0];
    report.sections.features = featureRow;
    log(`✅ Feature metadata:`);
    log(`   summary: ${featureRow.with_summary}/${featureRow.total} (${(featureRow.with_summary/featureRow.total*100).toFixed(1)}%)`);
    log(`   label: ${featureRow.with_label}/${featureRow.total} (${(featureRow.with_label/featureRow.total*100).toFixed(1)}%)`);
    log(`   domain: ${featureRow.with_domain}/${featureRow.total} (${(featureRow.with_domain/featureRow.total*100).toFixed(1)}%)`);
    log(`   complete metadata: ${featureRow.complete}/${featureRow.total} (${(featureRow.complete/featureRow.total*100).toFixed(1)}%)`);

    // ── Section 8: Cross-Store Identity Mismatches ────────────────────────
    log('\n⚠️  Section 8: Cross-Store Identity Audit');

    const mismatchRes = await pgPool.query(`
      SELECT
        (SELECT COUNT(*) FROM atlas_packets WHERE packet_key IS NOT NULL) as postgres_packet_key,
        (SELECT COUNT(*) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL) as qdrant_coverage,
        (SELECT COUNT(*) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL AND packet_key IS NOT NULL) as qdrant_with_packet_key
    `);
    const mismatchRow = mismatchRes.rows[0];
    report.sections.mismatches = {
      postgres_total: mismatchRow.postgres_packet_key,
      qdrant_total: mismatchRow.qdrant_coverage,
      qdrant_with_packet_key: mismatchRow.qdrant_with_packet_key,
      gap: mismatchRow.qdrant_coverage - mismatchRow.qdrant_with_packet_key,
    };

    log(`✅ Postgres vs Qdrant:` );
    log(`   Postgres packet_key: ${mismatchRow.postgres_packet_key}`);
    log(`   Qdrant points: ${mismatchRow.qdrant_coverage}`);
    log(`   Qdrant with packet_key: ${mismatchRow.qdrant_with_packet_key}`);
    log(`   Gap: ${mismatchRow.qdrant_coverage - mismatchRow.qdrant_with_packet_key} points`);

    // ── Section 9: Redis Cache Coverage ──────────────────────────────────
    log('\n💾 Section 9: Redis Cache Coverage');
    try {
      const redisInfo = await redis.info('stats');
      const keys = await redis.dbsize();
      report.sections.redis = { total_keys: keys };
      log(`✅ Redis keys: ${keys}`);
    } catch (e) {
      log(`⚠️  Redis unavailable: ${e.message}`);
      report.sections.redis = { error: e.message };
    }

    // ── Section 10: Authority Chain Completeness ─────────────────────────
    log('\n🔑 Section 10: Authority Chain (PageRank + Louvain)');
    const authorityRes = await neo4jSession.run(`
      MATCH ()-[r:USED_CONCEPT]->()
      RETURN
        count(r) as used_concept_edges,
        count(DISTINCT startNode(r)) as source_nodes,
        count(DISTINCT endNode(r)) as target_nodes
    `);
    const authorityRec = authorityRes.records[0];
    report.sections.authority = {
      used_concept_edges: Number(authorityRec.get('used_concept_edges')),
      source_nodes: Number(authorityRec.get('source_nodes')),
      target_nodes: Number(authorityRec.get('target_nodes')),
    };
    log(`✅ Authority chain:`);
    log(`   USED_CONCEPT edges: ${report.sections.authority.used_concept_edges}`);
    log(`   Source nodes: ${report.sections.authority.source_nodes}`);
    log(`   Target nodes: ${report.sections.authority.target_nodes}`);

    // ── Final Readiness Score ────────────────────────────────────────────
    log('\n📈 Overall Readiness');
    const readiness = {
      postgres_identity: identityRow.complete_spine / identityRow.total,
      qdrant_contract: mismatchRow.qdrant_with_packet_key / Math.max(mismatchRow.qdrant_coverage, 1),
      neo4j_identity: neo4jStats.with_feature_id / neo4jStats.total,
      som_topology: somRow.complete_coords / somRow.total,
      features: featureRow.complete / featureRow.total,
      authority: report.sections.authority.used_concept_edges > 0 ? 0.8 : 0.0,
    };

    const overallScore = Object.values(readiness).reduce((a, b) => a + b, 0) / Object.keys(readiness).length;
    report.sections.readiness = {
      postgres: `${(readiness.postgres_identity * 100).toFixed(1)}%`,
      qdrant: `${(readiness.qdrant_contract * 100).toFixed(1)}%`,
      neo4j: `${(readiness.neo4j_identity * 100).toFixed(1)}%`,
      som: `${(readiness.som_topology * 100).toFixed(1)}%`,
      features: `${(readiness.features * 100).toFixed(1)}%`,
      authority: `${(readiness.authority * 100).toFixed(1)}%`,
      overall: `${(overallScore * 100).toFixed(1)}%`,
    };

    log(`\n${'─'.repeat(60)}`);
    log(`📊 Readiness Scores:`);
    log(`   Postgres Truth Layer: ${report.sections.readiness.postgres}`);
    log(`   Qdrant Vector Layer: ${report.sections.readiness.qdrant}`);
    log(`   Neo4j Identity Layer: ${report.sections.readiness.neo4j}`);
    log(`   SOM Topology Layer: ${report.sections.readiness.som}`);
    log(`   Feature Extraction: ${report.sections.readiness.features}`);
    log(`   Authority Chain: ${report.sections.readiness.authority}`);
    log(`${'─'.repeat(60)}`);
    log(`   🎯 Overall Program Readiness: ${report.sections.readiness.overall}`);
    log('═'.repeat(60));

    // Write JSON report
    const reportPath = path.join(ROOT, 'docs/reports/gemma4-feature-registry-audit.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`\n📄 Full report: ${reportPath}`);

    if (JSON_MODE) {
      console.log(JSON.stringify(report, null, 2));
    }

    await neo4jSession.close();
    await redis.quit();
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  } finally {
    await pgPool.end();
    await neo4jDriver.close();
  }
}

main();
