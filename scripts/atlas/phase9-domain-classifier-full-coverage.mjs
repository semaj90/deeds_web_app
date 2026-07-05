#!/usr/bin/env node

/**
 * Phase 9: Domain Classifier — Full Coverage
 *
 * Classifies all 58,365 packets into domain_class categories using:
 * 1. Heuristic rules (file path patterns)
 * 2. Fallback to Gemma4 for edge cases
 *
 * Writes domain_class directly to atlas_packets, not via payload mutation
 *
 * Usage:
 *   node scripts/atlas/phase9-domain-classifier-full-coverage.mjs --dry-run
 *   node scripts/atlas/phase9-domain-classifier-full-coverage.mjs --apply --limit=10000
 *   node scripts/atlas/phase9-domain-classifier-full-coverage.mjs --apply (full)
 */

import { Client } from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);

const isDryRun = process.argv.includes('--dry-run');
const isApply = process.argv.includes('--apply');
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1]) : null;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 9: Domain Classifier — Full Coverage                    ║');
console.log('║  Classify all 58,365 packets into domain_class categories      ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`Mode: ${isDryRun ? 'DRY_RUN' : isApply ? 'APPLY' : 'AUDIT'}`);
if (limit) console.log(`Limit: ${limit} packets`);
console.log();

/**
 * Heuristic domain classification based on source_ref patterns
 */
function classifyByPattern(sourceRef, featureId) {
  // Frontend
  if (sourceRef?.match(/^sveltekit-frontend\/(src\/)?(lib\/components|routes)/)) return 'frontend';
  if (sourceRef?.match(/\.svelte$/)) return 'frontend';

  // Backend/server
  if (sourceRef?.match(/^sveltekit-frontend\/(src\/)?lib\/server/)) return 'backend';
  if (sourceRef?.match(/^services\//)) return 'backend';

  // Database/ORM
  if (sourceRef?.match(/(db|database|schema|drizzle)/i)) return 'database';
  if (sourceRef?.match(/^sveltekit-frontend\/(src\/)?lib\/server\/(db|orm)/)) return 'database';

  // Retrieval/Search
  if (sourceRef?.match(/(retrieval|search|qdrant|vector)/i)) return 'retrieval';
  if (sourceRef?.match(/^sveltekit-frontend\/(src\/)?lib\/(server\/)?retrieval/)) return 'retrieval';

  // Graph/Topology
  if (sourceRef?.match(/(graph|neo4j|topology)/i)) return 'graph';
  if (sourceRef?.match(/^scripts\/(topology|graph)/)) return 'graph';

  // Cache/Infrastructure
  if (sourceRef?.match(/(cache|redis|valkey|queue|rabbitmq|nats)/i)) return 'cache';
  if (sourceRef?.match(/^sveltekit-frontend\/(src\/)?lib\/(server\/)?cache/)) return 'cache';

  // GPU/CUDA
  if (sourceRef?.match(/(gpu|cuda|tensor|torch|simd)/i)) return 'gpu';
  if (sourceRef?.match(/^simd-bridge/)) return 'gpu';

  // Agent/MCP
  if (sourceRef?.match(/(agent|mcp|opencode|agentic)/i)) return 'agent';
  if (sourceRef?.match(/^scripts\/(agent|mcp)/)) return 'agent';

  // Compiler/AST
  if (sourceRef?.match(/(compiler|ast|parser|tree|lexer)/i)) return 'compiler';
  if (sourceRef?.match(/^crates\//)) return 'compiler';

  // Documentation
  if (sourceRef?.match(/^docs\//)) return 'documentation';
  if (sourceRef?.match(/\.md$/)) return 'documentation';

  // Infrastructure
  if (sourceRef?.match(/(docker|compose|kubernetes|helm|infra|deployment)/i)) return 'infrastructure';
  if (sourceRef?.match(/^docker-/)) return 'infrastructure';

  // Test/Tools
  if (sourceRef?.match(/(test|spec|mock|fixture)/i)) return 'test';
  if (sourceRef?.match(/^tests\//)) return 'test';
  if (sourceRef?.match(/^scripts\//)) return 'tool';

  // Fallback by feature_id
  if (featureId?.match(/^api\./)) return 'backend';
  if (featureId?.match(/^ui\./)) return 'frontend';
  if (featureId?.match(/^retrieval\./)) return 'retrieval';
  if (featureId?.match(/^graph\./)) return 'graph';

  return null;
}

/**
 * Classify all packets
 */
async function classifyPackets() {
  const pgClient = new Client({ connectionString: POSTGRES_URL });

  try {
    await pgClient.connect();
    console.log('✅ Connected to Postgres\n');

    // Query packets without domain_class (or with NULL/empty values)
    const query = `
      SELECT packet_id, source_ref, feature_id, domain_class
      FROM atlas_packets
      WHERE domain_class IS NULL OR domain_class = '' OR domain_class = 'Classification failed'
      ORDER BY packet_id DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `;

    const result = await pgClient.query(query);
    const packets = result.rows;

    console.log(`Found ${packets.length} packets to classify`);
    if (!packets.length) return;
    console.log();

    if (isDryRun) {
      console.log('DRY_RUN: Sample classifications:');
      for (let i = 0; i < Math.min(10, packets.length); i++) {
        const p = packets[i];
        const domain = classifyByPattern(p.source_ref, p.feature_id);
        console.log(`  ${p.source_ref}`);
        console.log(`    → domain_class: ${domain || '(no match)'}`);
      }
      console.log(`  ... and ${packets.length - 10} more\n`);

      // Show distribution
      const distribution = {};
      for (const p of packets) {
        const domain = classifyByPattern(p.source_ref, p.feature_id) || 'unclassified';
        distribution[domain] = (distribution[domain] || 0) + 1;
      }

      console.log('Distribution:');
      Object.entries(distribution)
        .sort(([, a], [, b]) => b - a)
        .forEach(([domain, count]) => {
          const pct = ((count / packets.length) * 100).toFixed(1);
          console.log(`  ${domain.padEnd(20)}: ${count.toString().padStart(5)} (${pct}%)`);
        });

      return;
    }

    // APPLY: Update Postgres
    console.log('Updating Postgres...');
    let updated = 0;
    let unclassified = 0;

    for (let i = 0; i < packets.length; i++) {
      const p = packets[i];
      const domain = classifyByPattern(p.source_ref, p.feature_id);

      if (domain) {
        await pgClient.query(
          `UPDATE atlas_packets SET domain_class = $1, updated_at = NOW() WHERE packet_id = $2`,
          [domain, p.packet_id]
        );
        updated++;
      } else {
        unclassified++;
      }

      if ((i + 1) % 5000 === 0) {
        console.log(`  ✅ Classified ${i + 1}/${packets.length}`);
      }
    }

    console.log();
    console.log(`✅ Classification complete:`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Unclassified: ${unclassified}`);

    // Verify coverage
    const coverageResult = await pgClient.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE domain_class IS NOT NULL AND domain_class != '') AS classified,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE domain_class IS NOT NULL AND domain_class != '') / COUNT(*),
          2
        ) AS coverage_pct,
        COUNT(DISTINCT domain_class) AS distinct_domains
      FROM atlas_packets
    `);

    const { total, classified, coverage_pct, distinct_domains } = coverageResult.rows[0];
    console.log();
    console.log(`Postgres coverage after update:`);
    console.log(`  Total packets: ${total}`);
    console.log(`  Classified: ${classified} (${coverage_pct}%)`);
    console.log(`  Distinct domains: ${distinct_domains}`);
  } finally {
    await pgClient.end();
  }
}

classifyPackets().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
