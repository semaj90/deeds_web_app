#!/usr/bin/env node
/**
 * backfill-entity-lexical-prefill.mjs
 *
 * NE-07/NE-09 (openspec/changes/parent-atlas-neural-prefill-encoder): the
 * only two writers of `atlas_packet_features` (`phase1-ast-grep-extraction.mjs`,
 * `backfill-ast-symbols.mjs`) populate `ast_symbols` only. `entities`,
 * `lexical_features`, and `used_concepts` (all `text[]`, see
 * drizzle/0043_atlas_packet_features_schema.sql +
 * drizzle/0020_fix_packet_feature_metrics_schema.sql) have zero writers
 * anywhere in the repo — this is the entire reason
 * `autoencoder-dataset-readiness.mjs` reports entity coverage at 0% despite
 * ast_symbols itself being populated. This script closes that specific gap
 * using the pure, deterministic derivation in
 * `scripts/atlas/lib/lexical-entity-derivation.mjs` (NE-10: same input ->
 * same output, proven by `node --test lexical-entity-derivation.test.mjs`).
 *
 * This is explicitly NOT NE-08: `usedConcepts` here is a lexical heuristic
 * (tokenized, stopword-filtered ast_symbols), not a domain-classifier- or
 * ontology-proposal-validated concept. Do not treat this backfill as closing
 * NE-08 — that still requires wiring the real domain classifier
 * (`ai/parent-atlas-workstation-domain-classifier.ts`) and
 * `ontology-proposal.ts` into this same table.
 *
 * This is also NOT NE-06: `ast_symbols` itself is still produced by
 * `phase1-ast-grep-extraction.mjs`'s regex fallback (`extractSymbolsViaRegex`),
 * not real ast-grep — the `ast-grep` CLI installed in this environment
 * (0.42.3) has no `outline` subcommand, so that swap remains open.
 *
 * Usage:
 *   node scripts/atlas/backfill-entity-lexical-prefill.mjs                 # dry-run (default)
 *   node scripts/atlas/backfill-entity-lexical-prefill.mjs --apply --limit=500
 *
 * Exit codes: 0 = success (incl. clean dry-run), 2 = Postgres error
 */

import { resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { deriveEntityLexicalFeatures } from './lib/lexical-entity-derivation.mjs';

loadAtlasEnv(resolve('.'));

const ROOT = resolve('.');
const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 500) || 500;

async function main() {
  const report = {
    schema: 'atlas.ne07-entity-lexical-prefill-report.v1',
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    limit: LIMIT,
    startedAt: new Date().toISOString(),
    rowsRead: 0,
    rowsWritten: 0,
    sample: [],
    errors: [],
  };

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT packet_key, ast_symbols
         FROM atlas_packet_features
        WHERE ast_symbols IS NOT NULL
          AND array_length(ast_symbols, 1) > 0
          AND (
            entities IS NULL OR array_length(entities, 1) IS NULL
            OR lexical_features IS NULL OR array_length(lexical_features, 1) IS NULL
            OR used_concepts IS NULL OR array_length(used_concepts, 1) IS NULL
          )
        ORDER BY packet_key
        LIMIT $1`,
      [LIMIT],
    );
    report.rowsRead = rows.length;
    console.log(`[NE-07] mode=${report.mode} rowsRead=${rows.length}`);

    for (const row of rows) {
      const derived = deriveEntityLexicalFeatures(row.ast_symbols);

      if (report.sample.length < 5) {
        report.sample.push({ packetKey: row.packet_key, ...derived });
      }

      if (APPLY) {
        await pool.query(
          `UPDATE atlas_packet_features
              SET entities = $1, lexical_features = $2, used_concepts = $3, updated_at = NOW()
            WHERE packet_key = $4`,
          [derived.entities, derived.lexicalFeatures, derived.usedConcepts, row.packet_key],
        );
        report.rowsWritten++;
      }
    }

    if (!APPLY) {
      console.log(`[NE-07] dry-run complete: ${rows.length} rows would be updated, 0 writes performed.`);
    } else {
      console.log(`[NE-07] wrote entities/lexical_features/used_concepts for ${report.rowsWritten} rows.`);
    }
  } catch (err) {
    report.errors.push(`postgres: ${err.message}`);
    writeReport(report);
    console.error(`Postgres error: ${err.message}`);
    process.exit(2);
  } finally {
    await pool.end();
  }

  report.finishedAt = new Date().toISOString();
  writeReport(report);
}

function writeReport(report) {
  const outDir = resolve(ROOT, 'docs/reports');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'ne07-entity-lexical-prefill.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[NE-07] report written to ${outPath}`);
}

main().catch((err) => {
  console.error(`[NE-07] fatal: ${err.stack || err.message}`);
  process.exit(1);
});
