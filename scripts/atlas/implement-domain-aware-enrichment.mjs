#!/usr/bin/env node
/**
 * Implement Domain-Aware Enrichment for Phase E
 *
 * Hypothesis: Conditionally apply enrichment boost based on query domain.
 * Domains where enrichment helps: llm, database, monitoring, types, features, security, graph
 * Domains where enrichment hurts: api, packets, error, forms, ui, cache, auth, validation, testing, perf
 *
 * Expected NDCG@10 improvement: +30-40% by avoiding negative domains
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

// Domain enrichment policy
const enrichmentPolicy = {
  // Apply enrichment (positive impact)
  llm: true,           // +43.1%
  database: true,      // +35.7%
  monitoring: true,    // +27.6%
  types: true,         // +25.0%
  features: true,      // +13.3%
  security: true,      // +16.1%
  graph: true,         // +14.2%

  // Skip enrichment (negative impact)
  api: false,          // −100%
  packets: false,      // −26.2%
  error: false,        // −26.3%
  forms: false,        // −12.1%
  ui: false,           // −4.3%
  cache: false,        // 0% (no data)
  auth: false,         // 0% (no data)
  validation: false,   // 0% (no change)
  testing: false,      // 0% (no change)
  perf: false,         // 0% (no change)
  infra: false,        // 0% (no data)
  events: false,       // +6% (marginal, conservative skip)
  retrieval: false     // 0% (no data)
};

async function detectQueryDomain(queryText) {
  // Simple heuristic: map keywords to domains
  const keywords = {
    llm: ['llm', 'model', 'inference', 'embedding', 'generation', 'prompt', 'completion', 'attention', 'transformer'],
    database: ['schema', 'table', 'column', 'migration', 'query', 'index', 'relationship', 'constraint', 'aggregate'],
    monitoring: ['metric', 'log', 'trace', 'alert', 'dashboard', 'performance', 'latency', 'throughput', 'health'],
    types: ['type', 'interface', 'union', 'generic', 'constraint', 'variance', 'typescript'],
    features: ['feature', 'flag', 'experiment', 'variant', 'ab-test', 'rollout'],
    security: ['auth', 'encrypt', 'hash', 'token', 'secret', 'permission', 'role', 'access', 'ssl', 'tls'],
    graph: ['node', 'edge', 'path', 'traversal', 'neo4j', 'relationships', 'cypher'],
    api: ['endpoint', 'route', 'rest', 'http', 'request', 'response', 'status', 'code'],
    packets: ['packet', 'chunk', 'embedding', 'vector', 'payload'],
    error: ['error', 'exception', 'crash', 'failure', 'panic', 'abort'],
    forms: ['form', 'input', 'validation', 'submit', 'field', 'label'],
    ui: ['button', 'modal', 'dialog', 'component', 'svelte', 'css', 'style', 'layout', 'ui', 'ux'],
    cache: ['cache', 'redis', 'memcached', 'ttl', 'eviction', 'hit', 'miss'],
  };

  const lower = queryText.toLowerCase();
  const scores = {};

  for (const [domain, words] of Object.entries(keywords)) {
    scores[domain] = words.filter(w => lower.includes(w)).length;
  }

  const maxDomain = Object.entries(scores).reduce((best, [domain, score]) =>
    score > (best.score || 0) ? { domain, score } : best
  , {});

  return maxDomain.domain || 'unknown';
}

function shouldApplyEnrichment(domain) {
  return enrichmentPolicy[domain] ?? false;
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Implement Domain-Aware Enrichment for Phase E                ║');
  console.log('║  Expected NDCG@10 improvement: +30-40%                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('Domain Enrichment Policy:');
  console.log('\nApply enrichment (positive impact):');
  Object.entries(enrichmentPolicy).forEach(([domain, apply]) => {
    if (apply) {
      console.log(`  ✓ ${domain.padEnd(15)} → enable boost`);
    }
  });

  console.log('\nSkip enrichment (negative/neutral impact):');
  Object.entries(enrichmentPolicy).forEach(([domain, apply]) => {
    if (!apply) {
      console.log(`  ✗ ${domain.padEnd(15)} → skip boost`);
    }
  });

  console.log('\n' + '═'.repeat(65));
  console.log('\nTesting domain detection on sample queries:\n');

  const testQueries = [
    'How does the attention mechanism work in transformers?',
    'What columns are in the users table?',
    'What is the API endpoint for creating a case?',
    'How do we handle authentication tokens?',
    'What causes the out-of-memory error on large datasets?',
    'How do we build the UI modal component?',
    'How are packets represented in Qdrant?'
  ];

  for (const query of testQueries) {
    const domain = await detectQueryDomain(query);
    const shouldApply = shouldApplyEnrichment(domain);
    const action = shouldApply ? '✓ APPLY' : '✗ SKIP';

    console.log(`Query: "${query}"`);
    console.log(`  Domain: ${domain} → ${action} enrichment\n`);
  }

  console.log('═'.repeat(65));
  console.log('\nImplementation Checklist:\n');

  const tasks = [
    {
      name: 'Update enrichment bridge to accept domain parameter',
      file: 'src/lib/server/ace/phase-e-enrichment-bridge.ts',
      lines: '~50 lines',
      status: 'pending'
    },
    {
      name: 'Add domain detection in context-assembler',
      file: 'src/lib/server/features/ai/ace/context-assembler.ts',
      lines: '~20 lines',
      status: 'pending'
    },
    {
      name: 'Test domain-aware enrichment on 20-query benchmark',
      file: 'scripts/atlas/benchmark-retrieval-ndcg10.mjs',
      lines: 'add preset',
      status: 'pending'
    },
    {
      name: 'Measure expected +30-40% NDCG@10 improvement',
      file: 'scripts/atlas/domain-aware-enrichment-test.mjs',
      lines: '~150 lines (exists)',
      status: 'ready'
    }
  ];

  tasks.forEach((task, i) => {
    console.log(`${i + 1}. ${task.status.toUpperCase().padEnd(7)} | ${task.name}`);
    console.log(`   File: ${task.file} (${task.lines})`);
  });

  console.log('\n' + '═'.repeat(65));
  console.log('\nNext steps:');
  console.log('1. Run: npm run domain-aware:test');
  console.log('2. Review expected improvement: +30-40% on 20-query benchmark');
  console.log('3. If confirmed, implement domain-aware bridge in production code');
  console.log('4. Re-run benchmark suite with domain-aware enabled');
  console.log('5. Target: NDCG@10 ≥ 0.80 (from current 0.656 baseline)\n');

  await pool.end();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
