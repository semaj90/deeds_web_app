#!/usr/bin/env node
/**
 * scripts/atlas/seed-fixer-patterns-redis.mjs
 *
 * Populates Redis KAG recall keys: `ace:fixer:patterns:<hmmState>`
 * for all 8 standard contract audit HMM error states.
 */

import 'dotenv/config';
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const FIX_PATTERNS = {
  meta_hygiene: {
    state: 'meta_hygiene',
    severity: 'high',
    description: 'Non-JSON files (e.g. Markdown, temp logs) located inside drizzle/meta/ breaking drizzle-kit parsing.',
    pattern: 'Files other than _journal.json and NNNN_snapshot.json in drizzle/meta/.',
    fixSummary: 'Move all violating files out of drizzle/meta/ to drizzle/meta/archived/. Run the automated hygiene fixer command.',
    command: 'npm run audit:drizzle-meta:fix'
  },
  stale_migration: {
    state: 'stale_migration',
    severity: 'medium',
    description: 'SQL migrations present on disk but missing in the drizzle/meta journal, or manual sidecar SQL without manifest registration.',
    pattern: 'Unjournaled numbered SQL migration files found on disk.',
    fixSummary: 'If it is an intentional sidecar migration, document it in sveltekit-frontend/drizzle/sidecar-migrations.json with reason, appliedAt, and validationCommand. If it is not intentional, journal or regenerate it instead of archiving it.',
    command: 'node scripts/atlas/audit-drizzle-meta-hygiene.mjs'
  },
  schema_mismatch: {
    state: 'schema_mismatch',
    severity: 'high',
    description: 'Type drift or column mismatches between Drizzle ORM column schemas and live PostgreSQL database definitions.',
    pattern: 'Drizzle column type != live Postgres column type (e.g. integer vs UUID).',
    fixSummary: 'Review live PostgreSQL column types. Run safe-migrate.mjs to align column declarations and types without mutating production records.',
    command: 'node scripts/safe-migrate.mjs'
  },
  vector_infra_missing: {
    state: 'vector_infra_missing',
    severity: 'high',
    description: 'pgvector database extension or high-performance HNSW indexes absent from vector-enabled tables.',
    pattern: 'No HNSW index found in database schema mapping or vector dimension mismatch.',
    fixSummary: 'Verify pgvector version via audit:pgvector. Apply recommended indexes listed in docs/reports/pgvector-index-plan.md.',
    command: 'npm run audit:pgvector'
  },
  env_url_mismatch: {
    state: 'env_url_mismatch',
    severity: 'high',
    description: 'Workstation service URL ports misconfigured or referencing incorrect infrastructure hosts.',
    pattern: 'Port 5432 instead of 5434 for Postgres, 8888 for SearXNG, or missing seaweed variables.',
    fixSummary: 'Update .env settings to match local workstation ports (Postgres on 5434, SeaweedFS Filer on 8888, SearXNG on 8889).',
    command: 'node scripts/atlas/validate-dev-services.mjs'
  },
  route_contract_mismatch: {
    state: 'route_contract_mismatch',
    severity: 'medium',
    description: 'SvelteKit + Superforms v2 integration boundary fails standard contract shape checks.',
    pattern: 'Actions missing fail(400, { form }) return statements or superValidate lacking corresponding load() schemas.',
    fixSummary: 'Ensure SvelteKit actions validate using Superforms v2 zod validation. Always return fail(400, { form }) on validation failures to preserve client-side state.',
    command: 'npm run audit:forms'
  },
  api_validation_gap: {
    state: 'api_validation_gap',
    severity: 'high',
    description: 'POST or PATCH API routes parsing request JSON body without mandatory Zod schema validation checks.',
    pattern: 'await request.json() parsed directly without calling schema.safeParse().',
    fixSummary: 'Declare Zod verification schemas for all incoming POST/PATCH body structures. Run zod-validate inside route handlers.',
    command: 'npm run audit:contracts'
  },
  ssr_safety_violation: {
    state: 'ssr_safety_violation',
    severity: 'high',
    description: 'Server-only code imported inside frontend client-side Svelte component views.',
    pattern: '$lib/server/ imports inside .svelte client component views.',
    fixSummary: 'Refactor client files to load server-provided attributes via SvelteKit load functions. Relocate private backend imports to server routes.',
    command: 'npm run audit:contracts'
  }
};

async function main() {
  console.log(`🔌 Redis Target:  ${REDIS_URL}`);
  console.log('🔄 Seeding KAG Recall Fixer Patterns...');

  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, connectTimeout: 3000 });

  try {
    await redis.ping();
    console.log('✅ Redis is ONLINE.');
  } catch (e) {
    console.error(`❌ Redis is OFFLINE: ${e.message}`);
    process.exit(1);
  }

  let seeded = 0;
  for (const [state, meta] of Object.entries(FIX_PATTERNS)) {
    const key = `ace:fixer:patterns:${state}`;
    await redis.hset(key, {
      state: meta.state,
      severity: meta.severity,
      description: meta.description,
      pattern: meta.pattern,
      fixSummary: meta.fixSummary,
      command: meta.command,
      timestamp: new Date().toISOString()
    });
    console.log(`   ✔️  Seeded ${key}`);
    seeded++;
  }

  console.log(`\n🎉 Success: ${seeded} HMM fixer patterns successfully indexed into Redis Bifrost!`);
  await redis.quit();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
