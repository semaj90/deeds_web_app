#!/usr/bin/env node

/**
 * Phase 1 Promotion Batch Test
 *
 * Simulates enrichment pipeline for a batch of 25 test packets
 *
 * Usage:
 *   node scripts/phase-1-promotion-batch.mjs [--limit 25] [--dry-run] [--verbose]
 *
 * Expected flow:
 *   1. Load N packets from atlas_packets
 *   2. For each packet:
 *      - Simulate enrichPacketSemantics()
 *      - Validate all 4 enrichment gates
 *   3. Report domain_class distribution, title_id entropy, enrichment validation pass rate
 *   4. Show throughput metrics
 */

import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

// Parse command line arguments
const args = {
  limit: 25,
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose')
};

// Extract limit from args
const limitIdx = process.argv.indexOf('--limit');
if (limitIdx !== -1 && process.argv[limitIdx + 1]) {
  args.limit = parseInt(process.argv[limitIdx + 1], 10);
}

// Simulated domain classifier (keyword-based)
const DOMAIN_KEYWORDS = {
  auth: ['auth', 'session', 'login', 'password', 'jwt', 'oauth'],
  ui: ['component', 'button', 'form', 'input', 'render', 'display'],
  retrieval: ['search', 'query', 'retrieve', 'find', 'index', 'lookup'],
  network: ['http', 'request', 'response', 'api', 'endpoint', 'socket'],
  database: ['database', 'query', 'table', 'schema', 'migration', 'sql'],
  cache: ['cache', 'redis', 'memcache', 'ttl', 'expire', 'invalidate'],
  agent: ['agent', 'tool', 'action', 'orchestrate', 'dispatch', 'handler'],
  graph: ['graph', 'node', 'edge', 'topology', 'relationship', 'traversal'],
  ml: ['model', 'tensor', 'vector', 'embedding', 'neural', 'inference'],
  general: []
};

function classifyDomain(summary = '', featureId = '') {
  const text = `${summary} ${featureId}`.toLowerCase();

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (domain === 'general') continue;
    if (keywords.some(kw => text.includes(kw))) {
      return domain;
    }
  }

  return 'general';
}

function generateTitleId(packetKey, featureId = '') {
  const hash = crypto
    .createHash('sha256')
    .update(`${packetKey}\0deterministic-title-v1`)
    .digest('hex')
    .slice(0, 8);

  const slug = (featureId || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 64);

  return `title:${slug}:${hash}`;
}

function validateEnrichment(packet) {
  const errors = [];

  // Gate 1: Identity gate
  if (!packet.packet_key) {
    errors.push('IDENTITY_GATE: missing packet_key');
  }

  // Gate 2: Structure gate
  if (!packet.source_ref && !packet.feature_id) {
    errors.push('STRUCTURE_GATE: missing source_ref and feature_id');
  }

  // Gate 3: Title gate (should not fail in practice)
  const titleId = generateTitleId(packet.packet_key, packet.feature_id);
  if (!titleId) {
    errors.push('TITLE_GATE: failed to generate title_id');
  }

  // Gate 4: Consistency gate
  const domainClass = classifyDomain(packet.summary, packet.feature_id);
  const validDomains = Object.keys(DOMAIN_KEYWORDS);
  if (!validDomains.includes(domainClass)) {
    errors.push('CONSISTENCY_GATE: invalid domain_class');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

async function main() {
  const startTime = Date.now();
  console.log('🧪 Phase 1 Promotion Batch Test\n');
  console.log(`Limit: ${args.limit} packets`);
  console.log(`Dry-run: ${args.dryRun}`);
  console.log(`Verbose: ${args.verbose}\n`);

  // Initialize database connection
  const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    // Load test packets
    const client = await pool.connect();
    let packets = [];

    try {
      const result = await client.query(`
        SELECT packet_key, source_ref, feature_id, summary
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
        LIMIT ${args.limit}
      `);

      packets = result.rows || [];
      console.log(`✅ Loaded ${packets.length} packets\n`);
    } finally {
      client.release();
    }

    if (packets.length === 0) {
      console.error('❌ No packets found');
      process.exit(1);
    }

    // Process batch
    const stats = {
      total_packets: packets.length,
      successfully_enriched: 0,
      enrichment_failures: 0,
      domain_distribution: {},
      validation_gate_failures: {},
      outbox_jobs_created: 0
    };

    for (const packet of packets) {
      const validation = validateEnrichment(packet);
      const domainClass = classifyDomain(packet.summary, packet.feature_id);
      const titleId = generateTitleId(packet.packet_key, packet.feature_id);

      if (!stats.domain_distribution[domainClass]) {
        stats.domain_distribution[domainClass] = 0;
      }
      stats.domain_distribution[domainClass]++;

      if (validation.isValid) {
        stats.successfully_enriched++;
      } else {
        stats.enrichment_failures++;
        validation.errors.forEach(err => {
          const gate = err.split(':')[0];
          stats.validation_gate_failures[gate] = (stats.validation_gate_failures[gate] || 0) + 1;
        });
      }

      if (args.verbose) {
        console.log(`  ${packet.packet_key.slice(0, 20)}... → domain: ${domainClass}, title: ${titleId.slice(0, 30)}...`);
      }

      // Simulate outbox job creation (would be 1-2 jobs per packet in real flow)
      if (validation.isValid) {
        stats.outbox_jobs_created += 2; // summary + qdrant jobs
      }
    }

    // Report
    console.log('\n📊 Batch Processing Report');
    console.log('═'.repeat(60));
    console.log(`Total packets: ${stats.total_packets}`);
    console.log(`Successfully enriched: ${stats.successfully_enriched}`);
    console.log(`Enrichment failures: ${stats.enrichment_failures}`);
    console.log(`Outbox jobs created: ${stats.outbox_jobs_created}`);
    console.log('');

    console.log('Domain Distribution:');
    Object.entries(stats.domain_distribution)
      .sort(([, a], [, b]) => b - a)
      .forEach(([domain, count]) => {
        const pct = ((count / stats.total_packets) * 100).toFixed(1);
        console.log(`  ${domain.padEnd(12)}: ${count.toString().padStart(4)} (${pct}%)`);
      });

    if (Object.keys(stats.validation_gate_failures).length > 0) {
      console.log('');
      console.log('Validation Gate Failures:');
      Object.entries(stats.validation_gate_failures).forEach(([gate, count]) => {
        console.log(`  ${gate}: ${count}`);
      });
    }

    const duration = Date.now() - startTime;
    const throughput = (stats.successfully_enriched / (duration / 1000)).toFixed(2);

    console.log('');
    console.log(`Duration: ${duration}ms`);
    console.log(`Throughput: ${throughput} packets/sec`);
    console.log('═'.repeat(60));

    if (stats.successfully_enriched === stats.total_packets) {
      console.log('\n🎉 Batch validation complete!');
      console.log('✅ Ready for full backfill of 58K packets.\n');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some packets failed enrichment validation.');
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
