#!/usr/bin/env node
/**
 * Additive seed-growth of `atlas_domain_ontology` for Phase 1 of
 * openspec/changes/parent-atlas-ontology-oaklib-fanout-bitmap (task 2.3).
 *
 * ADDITIVE ONLY -- inserts new `group_id` rows via `ON CONFLICT (group_id) DO
 * NOTHING`, never touches the existing 7 hand-seeded rows
 * (api/auth/devops/devops.env-config/devops.process-mgmt/error-handling/
 * retrieval). Each new concept below is grounded in a real, frequently-
 * observed label sampled from the live `feature_ontology_tuples` table
 * (539,124 rows) during this change's own audit -- not invented from
 * nothing. Deliberately excludes noisy/non-conceptual labels also observed
 * in that sample (e.g. "concept:2026", "concept:src", "concept:lib",
 * "concept:python311") -- those are extractor artifacts, not real concepts,
 * and seeding them would just move the anti-pattern into the vocabulary
 * instead of fixing it.
 *
 * Dry-run by default (prints planned INSERTs, no writes). Pass --apply to
 * execute for real.
 *
 * Usage:
 *   node scripts/atlas/seed-atlas-domain-ontology-oaklib-phase1-v1.mjs           # dry-run
 *   node scripts/atlas/seed-atlas-domain-ontology-oaklib-phase1-v1.mjs --apply   # real write
 */
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const APPLY = process.argv.includes('--apply');

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 2,
  statement_timeout: 60_000,
  application_name: 'seed-atlas-domain-ontology-oaklib-phase1-v1',
});

/** @type {Array<{groupId: string, label: string, parentGroupId: string|null, description: string, taxonomyLevel: number, examples: string[]}>} */
const SEED_ROWS = [
  {
    groupId: 'frontend',
    label: 'Frontend & UI',
    parentGroupId: null,
    description: 'Client-side application code: components, styling, client state, browser rendering.',
    taxonomyLevel: 0,
    examples: ['Svelte', 'SvelteKit', 'UI components', 'UnoCSS', 'client state'],
  },
  {
    groupId: 'frontend.sveltekit',
    label: 'SvelteKit / Svelte',
    parentGroupId: 'frontend',
    description: 'SvelteKit routing, load functions, Svelte 5 runes-based components.',
    taxonomyLevel: 1,
    examples: ['SvelteKit', 'Svelte', 'Svelte 5', 'runes', '$state', '$derived'],
  },
  {
    groupId: 'database',
    label: 'Database & Persistence',
    parentGroupId: null,
    description: 'Relational storage, ORM layers, and vector-capable extensions.',
    taxonomyLevel: 0,
    examples: ['Postgres', 'Drizzle ORM', 'pgvector', 'migrations'],
  },
  {
    groupId: 'database.postgresql',
    label: 'PostgreSQL',
    parentGroupId: 'database',
    description: 'PostgreSQL specifically, including pgvector and Drizzle-managed schema.',
    taxonomyLevel: 1,
    examples: ['Postgres', 'PostgreSQL', 'pg', 'pgvector', 'Drizzle'],
  },
  {
    groupId: 'graph',
    label: 'Graph & Topology',
    parentGroupId: null,
    description: 'Graph algorithms, graph databases, and topology mirrors.',
    taxonomyLevel: 0,
    examples: ['Neo4j', 'PageRank', 'cuGraph', 'NetworkX', 'graph traversal'],
  },
  {
    groupId: 'gpu',
    label: 'GPU & CUDA Acceleration',
    parentGroupId: null,
    description: 'CUDA/GPU-accelerated compute: tensor ops, RAPIDS, LibTorch bridges.',
    taxonomyLevel: 0,
    examples: ['CUDA', 'RAPIDS', 'LibTorch', 'cuVS', 'cuGraph', 'tensor ops'],
  },
  {
    groupId: 'machine-learning',
    label: 'Machine Learning',
    parentGroupId: null,
    description: 'Embeddings, autoencoders, clustering, and model training/inference.',
    taxonomyLevel: 0,
    examples: ['embeddings', 'autoencoder', 'SOM', 'clustering', 'training'],
  },
  {
    groupId: 'cache',
    label: 'Caching',
    parentGroupId: null,
    description: 'Hot-path caching layers (Redis/Valkey/BitFrost), distinct from canonical storage.',
    taxonomyLevel: 0,
    examples: ['Redis', 'Valkey', 'BitFrost', 'cache invalidation'],
  },
  {
    groupId: 'compiler',
    label: 'Compiler & Language Tooling',
    parentGroupId: null,
    description: 'Parsers, ASTs, type checkers, and build/compile tooling.',
    taxonomyLevel: 0,
    examples: ['AST', 'tree-sitter', 'ast-grep', 'TypeScript compiler', 'tsgo'],
  },
  {
    groupId: 'test',
    label: 'Testing',
    parentGroupId: null,
    description: 'Automated test suites: unit, integration, and end-to-end.',
    taxonomyLevel: 0,
    examples: ['Vitest', 'Playwright', 'unit test', 'integration test'],
  },
];

function toInsertValues(row) {
  return [row.groupId, row.label, row.parentGroupId, row.description, row.taxonomyLevel, row.examples];
}

async function main() {
  console.log(`[seed-atlas-domain-ontology-oaklib-phase1] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);
  console.log(`[seed-atlas-domain-ontology-oaklib-phase1] ${SEED_ROWS.length} candidate rows (additive only):`);
  for (const row of SEED_ROWS) {
    console.log(`  - ${row.groupId} (parent: ${row.parentGroupId ?? 'none'}) "${row.label}"`);
  }

  if (!APPLY) {
    console.log('[seed-atlas-domain-ontology-oaklib-phase1] Dry-run only -- no writes performed. Pass --apply to execute.');
    await pool.end();
    return;
  }

  let inserted = 0;
  let skippedExisting = 0;
  for (const row of SEED_ROWS) {
    const result = await pool.query(
      `INSERT INTO atlas_domain_ontology (group_id, group_label, parent_group_id, description, taxonomy_level, confidence, examples)
       VALUES ($1, $2, $3, $4, $5, 1.0, $6::text[])
       ON CONFLICT (group_id) DO NOTHING
       RETURNING group_id`,
      toInsertValues(row)
    );
    if (result.rowCount && result.rowCount > 0) {
      inserted += 1;
    } else {
      skippedExisting += 1;
    }
  }

  console.log(`[seed-atlas-domain-ontology-oaklib-phase1] inserted=${inserted} skippedExisting=${skippedExisting}`);
  await pool.end();
}

main().catch((error) => {
  console.error('[seed-atlas-domain-ontology-oaklib-phase1] FAILED', error);
  process.exitCode = 1;
});
