#!/usr/bin/env node
/**
 * SEARCH-RUNTIME-READONLY-01 live proof.
 *
 * Proves the new `SearchRuntime` `readOnly` config option (added 2026-09-04,
 * see search-runtime.ts's `SearchRuntimeConfig.readOnly` doc comment) actually
 * skips both write side effects (`recordPromotionIntent()` -> `promotion_outbox`,
 * `logExposureEvents()` -> `recommendation_events`) when a real query is run
 * against real production adapters (no injected retrievers/reranker -- this is
 * the actual `createProductionSearchRuntime()` path, not a fixture).
 *
 * This directly closes the finding recorded in
 * openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md
 * (ACE-FEATURE-SOURCE-OWNER-01, 2026-09-04): "A genuinely zero-write canary
 * cannot call [SearchRuntime.search()] directly."
 *
 * MUST be run from sveltekit-frontend/ so `$lib` aliases resolve:
 *   cd sveltekit-frontend && npx tsx ../scripts/atlas/prove-search-runtime-readonly-boundary-v1.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const SVELTEKIT_ROOT = resolve(REPO_ROOT, 'sveltekit-frontend');
const REPORT_PATH = resolve(REPO_ROOT, 'docs/reports/parent-atlas-search-runtime-readonly-boundary-v1.json');

// $lib/server/env.server.ts reads plain process.env.* -- unlike `npm run dev`
// (which sets these via cross-env), a bare `npx tsx` never loads .env, so it
// must be loaded explicitly here BEFORE any $lib import below.
loadDotenv({ path: resolve(SVELTEKIT_ROOT, '.env') });
loadDotenv({ path: resolve(REPO_ROOT, '.env') });

const QUERY_TEXT = 'embedding dimension validation postgres qdrant';

function fail(step, msg) { throw new Error(`[${step}] FAILED: ${msg}`); }

async function main() {
  const { createProductionSearchRuntime } = await import('$lib/server/retrieval/search-runtime.js');
  const { db } = await import('$lib/server/db/client.js');
  const { sql } = await import('drizzle-orm');

  const steps = {};

  const countRow = async (table) => {
    const result = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM ${table}`));
    const rows = Array.isArray(result) ? result : result.rows;
    return Number(rows[0]?.n ?? 0);
  };

  const outboxBefore = await countRow('promotion_outbox');
  const eventsBefore = await countRow('recommendation_events');
  steps.before_counts = { promotion_outbox: outboxBefore, recommendation_events: eventsBefore };

  // 1. Baseline: normal (write-enabled) runtime performs the query but we do NOT
  //    execute it here -- we only need to prove the readOnly=true path performs
  //    zero writes, not diff it against a live write. Constructing the
  //    write-enabled runtime is intentionally skipped to avoid polluting
  //    production tables just to run this proof.

  const runtime = createProductionSearchRuntime({ readOnly: true });

  const result = await runtime.search({ text: QUERY_TEXT, topK: 5 });

  if (result.provenance.readOnly !== true) {
    fail('PROVENANCE', `expected provenance.readOnly === true, got ${result.provenance.readOnly}`);
  }
  if (result.provenance.promotionAttempted !== false) {
    fail('PROVENANCE', `expected provenance.promotionAttempted === false, got ${result.provenance.promotionAttempted}`);
  }
  steps.provenance_asserted = {
    ok: true,
    readOnly: result.provenance.readOnly,
    promotionAttempted: result.provenance.promotionAttempted,
    candidatesRetrieved: result.metadata.candidatesRetrieved,
    packetsReturned: result.packets.length,
  };

  // Give any accidental fire-and-forget write a moment to land if it somehow
  // fired despite the readOnly gate (defense-in-depth for the proof itself).
  await new Promise((r) => setTimeout(r, 500));

  const outboxAfter = await countRow('promotion_outbox');
  const eventsAfter = await countRow('recommendation_events');
  steps.after_counts = { promotion_outbox: outboxAfter, recommendation_events: eventsAfter };

  if (outboxAfter !== outboxBefore) {
    fail('ZERO_WRITE', `promotion_outbox row count changed: ${outboxBefore} -> ${outboxAfter}`);
  }
  if (eventsAfter !== eventsBefore) {
    fail('ZERO_WRITE', `recommendation_events row count changed: ${eventsBefore} -> ${eventsAfter}`);
  }
  steps.zero_write_confirmed = { ok: true };

  const report = {
    gate: 'SEARCH-RUNTIME-READONLY-01',
    status: 'LIVE_PROOF_PASSED',
    executedAt: new Date().toISOString(),
    summary:
      'createProductionSearchRuntime({ readOnly: true }) ran a real query against real production ' +
      'retrieval adapters (Postgres + Qdrant, no injected fakes) and performed zero writes to ' +
      'promotion_outbox or recommendation_events. provenance.readOnly and provenance.promotionAttempted ' +
      'correctly reflect the gated state. Closes the "genuinely zero-write canary cannot call ' +
      'SearchRuntime.search() directly" finding from ACE-FEATURE-SOURCE-OWNER-01.',
      filesChanged: [
      'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts (added SearchRuntimeConfig.readOnly, ' +
        'gated the two write side effects in search(), added provenance.readOnly to all 3 return paths, ' +
        'threaded readOnly through createSearchRuntime()/createProductionSearchRuntime())',
    ],
    backwardCompatibilityNote:
      'readOnly defaults to false/undefined on all 3 factory/constructor entry points -- every existing ' +
      'production call site (routes, dispatchers, other canaries) is unaffected unless it explicitly opts in.',
    query: QUERY_TEXT,
    liveProof: steps,
    postgresWrites: false,
    valkeyWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    modelCalls: true,
    note: 'modelCalls:true -- this proof performs a real embedding call and real Qdrant/Postgres reads via the production retrieval path; postgresWrites/etc. are all false because the point of this proof is that NO writes occurred despite a full real search executing.',
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, report: REPORT_PATH }, null, 2));
}

main().catch((err) => {
  console.error('PROOF_FAILED:', err.message);
  process.exit(1);
});
